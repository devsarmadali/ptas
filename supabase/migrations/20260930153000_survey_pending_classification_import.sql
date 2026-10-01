BEGIN;

-- A survey may be digitized before its statutory classification is confirmed.
-- This is not an assessment approval: pending rows remain in FEEDED state and
-- cannot enter PFT-3 because they have no approved classification_rule_id.
ALTER TABLE public.survey_unit_profiles
  ALTER COLUMN classification_rule_id DROP NOT NULL,
  ADD COLUMN classification_status text NOT NULL DEFAULT 'CLASSIFIED';

ALTER TABLE public.survey_unit_profiles
  ADD CONSTRAINT survey_unit_profiles_classification_state_check CHECK (
    (classification_status='CLASSIFIED' AND classification_rule_id IS NOT NULL)
    OR
    (classification_status='PENDING_REVIEW' AND classification_rule_id IS NULL)
  );

CREATE OR REPLACE FUNCTION public.stage_survey_import_current(
  p_source_filename text,
  p_file_sha256 text,
  p_headers jsonb,
  p_rows jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS public.survey_import_batches
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public,ptas_private,pg_temp
AS $$
DECLARE
  v_business_date date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_import_financial_year text;
  v_import_financial_year_count integer;
  v_rate_financial_year text;
  v_rate_financial_year_count integer;
  v_rows jsonb;
  v_batch public.survey_import_batches;
  v_ready integer;
  v_invalid integer;
  v_pending_review integer;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows must be a non-empty array' USING ERRCODE='22023';
  END IF;

  SELECT min(nullif(btrim(value->>'financial_year'),'')),
         count(DISTINCT nullif(btrim(value->>'financial_year'),''))
  INTO v_import_financial_year,v_import_financial_year_count
  FROM jsonb_array_elements(p_rows);

  IF v_import_financial_year_count <> 1
     OR v_import_financial_year !~ '^[0-9]{4}-[0-9]{4}$'
     OR substring(v_import_financial_year,6,4)::integer
        <> substring(v_import_financial_year,1,4)::integer + 1 THEN
    RAISE EXCEPTION 'exactly one consecutive import financial year is required in the workbook'
      USING ERRCODE='23514';
  END IF;

  SELECT min(financial_year_code),count(DISTINCT financial_year_code)
  INTO v_rate_financial_year,v_rate_financial_year_count
  FROM public.survey_classification_rules
  WHERE status='ACTIVE'
    AND v_business_date BETWEEN effective_from AND coalesce(effective_to,'infinity'::date);

  IF v_rate_financial_year_count <> 1 THEN
    RAISE EXCEPTION 'exactly one active approved statutory rate configuration must cover the business date'
      USING ERRCODE='23514';
  END IF;

  SELECT jsonb_agg(
    value || jsonb_build_object('financial_year',v_rate_financial_year)
    ORDER BY ordinality
  )
  INTO v_rows
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY;

  v_batch := public.stage_survey_import(
    p_source_filename,p_file_sha256,v_rate_financial_year,p_headers,v_rows,
    p_idempotency_key,p_correlation_id
  );

  IF v_batch.status = 'IMPORTED' THEN
    IF v_batch.financial_year_code IS DISTINCT FROM v_import_financial_year THEN
      RAISE EXCEPTION 'the imported file hash is already bound to a different financial year'
        USING ERRCODE='23514';
    END IF;
    RETURN v_batch;
  END IF;

  IF v_batch.financial_year_code NOT IN (v_rate_financial_year,v_import_financial_year) THEN
    RAISE EXCEPTION 'the staged file hash is already bound to a different financial year'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.survey_import_rows
  SET supplied_financial_year = v_import_financial_year
  WHERE batch_id = v_batch.id;

  -- The exact remark is a controlled request to ingest an unclassified survey
  -- record for later Inspector review.  No rate is inferred and no PFT-3 record
  -- is created.  All unrelated validation failures remain fail-closed.
  UPDATE public.survey_import_rows
  SET status='READY', validation_errors='[]'::jsonb
  WHERE batch_id=v_batch.id
    AND resolved_rule_id IS NULL
    AND length(btrim(tax_class)) > 0
    AND length(btrim(tax_assessment_option)) = 0
    AND lower(btrim(coalesce(remarks,''))) = 'under review'
    AND validation_errors = jsonb_build_array(
      'No active approved statutory classification matches this row'
    );

  WITH duplicated AS (
    SELECT lower(btrim(legacy_demand_no)) AS demand_key
    FROM public.survey_import_rows
    WHERE batch_id=v_batch.id
      AND legacy_demand_no IS NOT NULL
      AND length(btrim(legacy_demand_no)) > 0
    GROUP BY lower(btrim(legacy_demand_no))
    HAVING count(*) > 1
  )
  UPDATE public.survey_import_rows r
  SET status='INVALID',
      validation_errors = CASE
        WHEN r.validation_errors @> jsonb_build_array('Legacy Demand No is duplicated in this import')
          THEN r.validation_errors
        ELSE r.validation_errors || jsonb_build_array('Legacy Demand No is duplicated in this import')
      END
  FROM duplicated d
  WHERE r.batch_id=v_batch.id
    AND lower(btrim(r.legacy_demand_no))=d.demand_key;

  UPDATE public.survey_import_rows r
  SET status='INVALID',
      validation_errors = CASE
        WHEN r.validation_errors @> jsonb_build_array('Legacy Demand No already exists')
          THEN r.validation_errors
        ELSE r.validation_errors || jsonb_build_array('Legacy Demand No already exists')
      END
  WHERE r.batch_id=v_batch.id
    AND r.legacy_demand_no IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.survey_unit_profiles p
      WHERE lower(btrim(p.legacy_demand_no))=lower(btrim(r.legacy_demand_no))
    );

  SELECT count(*) FILTER (WHERE status='READY'),
         count(*) FILTER (WHERE status='INVALID'),
         count(*) FILTER (
           WHERE status='READY' AND resolved_rule_id IS NULL
             AND lower(btrim(coalesce(remarks,'')))='under review'
         )
  INTO v_ready,v_invalid,v_pending_review
  FROM public.survey_import_rows
  WHERE batch_id=v_batch.id;

  UPDATE public.survey_import_batches
  SET financial_year_code=v_import_financial_year,
      ready_rows=v_ready,
      invalid_rows=v_invalid,
      status=CASE WHEN v_invalid=0 THEN 'VALIDATED' ELSE 'NEEDS_CORRECTION' END,
      validated_at=now()
  WHERE id=v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload
  )
  SELECT
    gen_random_uuid(),'SURVEY_IMPORT_VALIDATION_RECONCILED','SURVEY_IMPORT',
    v_batch.id::text,a.user_id::text,a.role_code,a.jurisdiction_id,p_correlation_id,
    jsonb_build_object(
      'financial_year_code',v_import_financial_year,
      'statutory_rate_configuration_year',v_rate_financial_year,
      'ready_rows',v_ready,
      'invalid_rows',v_invalid,
      'pending_classification_review_rows',v_pending_review,
      'legacy_demand_numbers_preserved',true,
      'pft3_created',false
    )
  FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_events e
    WHERE e.aggregate_type='SURVEY_IMPORT'
      AND e.aggregate_id=v_batch.id::text
      AND e.event_type='SURVEY_IMPORT_VALIDATION_RECONCILED'
  );

  RETURN v_batch;
END
$$;

CREATE OR REPLACE FUNCTION public.promote_survey_import(
  p_batch_id uuid, p_idempotency_key text, p_correlation_id text
) RETURNS public.survey_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,ptas_private,pg_temp AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_row public.survey_import_rows;
  v_taxpayer_id uuid;
  v_unit_id uuid;
  v_rule public.survey_classification_rules;
  v_normalized text;
  v_classification_status text;
  v_pending_review integer := 0;
BEGIN
  SELECT * INTO v_batch FROM public.survey_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a
    WHERE a.user_id=v_batch.uploaded_by AND a.jurisdiction_id=v_batch.jurisdiction_id LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only the assigned uploading Inspector may promote this batch' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN RETURN v_batch; END IF;
  IF v_batch.status<>'VALIDATED' OR v_batch.invalid_rows<>0 OR v_batch.ready_rows<>v_batch.total_rows THEN
    RAISE EXCEPTION 'batch is not eligible for import' USING ERRCODE='23514';
  END IF;

  FOR v_row IN
    SELECT * FROM public.survey_import_rows
    WHERE batch_id=v_batch.id ORDER BY row_number FOR UPDATE
  LOOP
    v_rule := NULL;
    v_classification_status := 'CLASSIFIED';
    IF v_row.resolved_rule_id IS NULL THEN
      IF length(btrim(v_row.tax_assessment_option)) <> 0
         OR lower(btrim(coalesce(v_row.remarks,''))) <> 'under review' THEN
        RAISE EXCEPTION 'unclassified row is not explicitly marked Under review'
          USING ERRCODE='23514';
      END IF;
      v_classification_status := 'PENDING_REVIEW';
      v_pending_review := v_pending_review + 1;
    ELSE
      SELECT * INTO v_rule FROM public.survey_classification_rules
      WHERE id=v_row.resolved_rule_id AND status='ACTIVE';
      IF v_rule.id IS NULL THEN
        RAISE EXCEPTION 'classification became inactive before import' USING ERRCODE='40001';
      END IF;
    END IF;

    INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(v_row.legal_name,'DRAFT',v_batch.jurisdiction_id,v_actor.user_id::text)
    RETURNING id INTO v_taxpayer_id;

    IF v_row.identifier_value IS NOT NULL THEN
      v_normalized:=upper(regexp_replace(v_row.identifier_value,'[^0-9A-Za-z]','','g'));
      INSERT INTO public.taxpayer_identifiers(
        taxpayer_id,identifier_type,normalized_value,masked_value,is_primary
      )
      VALUES(
        v_taxpayer_id,v_row.identifier_type,v_normalized,
        repeat('*',greatest(length(v_normalized)-4,0))||right(v_normalized,4),true
      );
    END IF;

    INSERT INTO public.survey_units(
      taxpayer_id,financial_year_id,jurisdiction_id,responsible_inspector_id,source,state,payload
    )
    VALUES(
      v_taxpayer_id,v_batch.financial_year_code,v_batch.jurisdiction_id,v_actor.user_id,
      'CSV_IMPORT','FEEDED',jsonb_build_object(
        'import_batch_id',v_batch.id,
        'import_row_id',v_row.id,
        'classification_status',v_classification_status
      )
    )
    RETURNING id INTO v_unit_id;

    INSERT INTO public.survey_unit_profiles(
      survey_unit_id,import_row_id,survey_no,survey_date,locality,commercial_address,
      legal_name,taxpayer_name,phone,email,classification_rule_id,classification_status,
      taxpayer_status,legacy_demand_no,opening_arrears,remarks
    )
    VALUES(
      v_unit_id,v_row.id,v_row.generated_survey_no,v_row.survey_date,v_row.locality,
      v_row.commercial_address,v_row.legal_name,v_row.taxpayer_name,v_row.phone,v_row.email,
      v_rule.id,v_classification_status,v_row.taxpayer_status,v_row.legacy_demand_no,
      v_row.arrears,v_row.remarks
    );

    UPDATE public.survey_import_rows
    SET status='IMPORTED',promoted_survey_unit_id=v_unit_id
    WHERE id=v_row.id;
  END LOOP;

  UPDATE public.survey_import_batches
  SET status='IMPORTED',imported_rows=total_rows,imported_at=now()
  WHERE id=v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,
    correlation_id,idempotency_key
  )
  VALUES(
    'SURVEY_IMPORT',v_batch.id,'PROMOTE','VALIDATED','IMPORTED',v_actor.user_id,
    v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_PROMOTED','SURVEY_IMPORT',v_batch.id,v_actor.user_id,v_actor.role_code,
    v_actor.jurisdiction_id,p_correlation_id,'VALIDATED','IMPORTED',
    format('%s row(s) imported with classification pending review; no PFT-3 created',v_pending_review)
  );
  RETURN v_batch;
END
$$;

REVOKE ALL ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)
TO authenticated;
REVOKE ALL ON FUNCTION public.promote_survey_import(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.promote_survey_import(uuid,text,text) TO authenticated;

COMMIT;

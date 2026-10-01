BEGIN;

-- A workbook financial year is the year being digitized.  The immutable statutory
-- classification rule may have become legally effective in an earlier year.
-- Keep those concepts separate: imported units retain their workbook year while
-- resolving their rate against the one approved rule set effective on the
-- Pakistan business date.
CREATE UNIQUE INDEX IF NOT EXISTS survey_unit_profiles_legacy_demand_no_unique
ON public.survey_unit_profiles (lower(btrim(legacy_demand_no)))
WHERE legacy_demand_no IS NOT NULL AND length(btrim(legacy_demand_no)) > 0;

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
         count(*) FILTER (WHERE status='INVALID')
  INTO v_ready,v_invalid
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
      'legacy_demand_numbers_preserved',true
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

REVOKE ALL ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)
TO authenticated;

COMMIT;

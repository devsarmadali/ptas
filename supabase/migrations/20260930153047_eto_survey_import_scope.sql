BEGIN;

-- ETOs may ingest survey data only for Circles contained by their active
-- District/Zone assignment. Imported units remain FEEDED and are assigned to
-- the one active Inspector responsible for the resolved Circle.
CREATE OR REPLACE FUNCTION public.stage_survey_import(
  p_source_filename text,
  p_file_sha256 text,
  p_financial_year_code text,
  p_headers jsonb,
  p_rows jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS survey_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,ptas_private,pg_temp AS $$
DECLARE
  v_actor record;
  v_batch survey_import_batches;
  v_existing survey_import_batches;
  v_item record;
  v_rule survey_classification_rules;
  v_errors jsonb;
  v_status survey_import_row_state;
  v_business_date date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_ready integer := 0;
  v_invalid integer := 0;
  v_branch_name text;
  v_root_name text;
  v_tehsil_name text;
  v_circle_name text;
  v_actor_tier text;
  v_row_jurisdiction_id uuid;
  v_row_circle_count integer;
  v_row_tehsil_name text;
BEGIN
  IF p_headers <> jsonb_build_array(
    'Survey No. (Auto)','Division','Region','District','Zone','Tehsil','Circle','Locality',
    'Commercial Address','Legal Name / Entity Name','Taxpayer Name / Proprietor','Identifier Type',
    'Identifier Value','Phone','Email','Tax Class (Select)','Tax Assessment Option (Select)',
    'Tax Sub-Class (Auto)','Statutory Assessment Rate (PKR) (Auto)','Primary Class Code (Auto)',
    'Schedule Sub-Class Code (Auto)','Rate Basis (Auto)','Statutory Rule ID (Auto)',
    'Financial Year (Auto)','Survey Date (Auto)','Taxpayer Status','Legacy Demand No','Arrears',
    'Remarks','Import Status (Auto)'
  ) THEN
    RAISE EXCEPTION 'CSV headers do not match the Survey_Import_Filled contract' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 10000 THEN
    RAISE EXCEPTION 'rows must be a non-empty array with at most 10000 records' USING ERRCODE='22023';
  END IF;
  IF p_file_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid file SHA-256' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or ETO assignment required' USING ERRCODE='42501';
  END IF;
  SELECT tier,name INTO v_actor_tier,v_circle_name FROM jurisdictions WHERE id=v_actor.jurisdiction_id;
  IF v_actor.role_code='INSPECTOR' AND v_actor_tier<>'CIRCLE' THEN
    RAISE EXCEPTION 'Inspector must be assigned to a Circle' USING ERRCODE='42501';
  END IF;
  IF v_actor.role_code='ETO' AND v_actor_tier NOT IN ('DISTRICT','ZONE') THEN
    RAISE EXCEPTION 'ETO must be assigned to a District or Zone' USING ERRCODE='42501';
  END IF;

  IF EXISTS (SELECT 1 FROM workflow_actions WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key) THEN
    SELECT b.* INTO v_existing FROM workflow_actions w JOIN survey_import_batches b ON b.id=w.aggregate_id
    WHERE w.aggregate_type='SURVEY_IMPORT' AND w.idempotency_key=p_idempotency_key;
    RETURN v_existing;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,name,tier FROM jurisdictions WHERE id=v_actor.jurisdiction_id
    UNION ALL SELECT j.id,j.parent_id,j.name,j.tier FROM jurisdictions j JOIN ancestors a ON a.parent_id=j.id
  )
  SELECT max(name) FILTER (WHERE tier IN ('DISTRICT','ZONE')),
         max(name) FILTER (WHERE tier IN ('DIVISION','REGION')),
         max(name) FILTER (WHERE tier='TEHSIL')
  INTO v_branch_name,v_root_name,v_tehsil_name FROM ancestors;

  INSERT INTO survey_import_batches(source_filename,file_sha256,financial_year_code,jurisdiction_id,uploaded_by,
    total_rows,header_snapshot,correlation_id)
  VALUES(p_source_filename,p_file_sha256,p_financial_year_code,v_actor.jurisdiction_id,v_actor.user_id,
    jsonb_array_length(p_rows),p_headers,p_correlation_id)
  ON CONFLICT(uploaded_by,file_sha256) DO NOTHING RETURNING * INTO v_batch;
  IF v_batch.id IS NULL THEN
    SELECT * INTO v_batch FROM survey_import_batches WHERE uploaded_by=v_actor.user_id AND file_sha256=p_file_sha256;
    RETURN v_batch;
  END IF;

  FOR v_item IN SELECT value AS row_data, ordinality::integer + 1 AS row_number FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
    v_errors := '[]'::jsonb;
    v_row_jurisdiction_id := v_actor.jurisdiction_id;
    v_row_tehsil_name := v_tehsil_name;
    IF v_actor.role_code='ETO' THEN
      SELECT (array_agg(j.id ORDER BY j.id))[1],count(*)
      INTO v_row_jurisdiction_id,v_row_circle_count
      FROM jurisdictions j
      WHERE j.tier='CIRCLE'
        AND lower(btrim(j.name))=lower(btrim(coalesce(ptas_private.survey_import_text(v_item.row_data,'circle'),'')))
        AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,j.id);
      IF v_row_circle_count=1 THEN
        WITH RECURSIVE row_ancestors AS (
          SELECT id,parent_id,name,tier FROM jurisdictions WHERE id=v_row_jurisdiction_id
          UNION ALL
          SELECT j.id,j.parent_id,j.name,j.tier
          FROM jurisdictions j JOIN row_ancestors a ON a.parent_id=j.id
        )
        SELECT max(name) FILTER (WHERE tier='TEHSIL')
        INTO v_row_tehsil_name
        FROM row_ancestors;
      ELSE
        v_row_jurisdiction_id := NULL;
      END IF;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'division') IS DISTINCT FROM v_root_name
       OR ptas_private.survey_import_text(v_item.row_data,'region') IS DISTINCT FROM v_root_name THEN
      v_errors := v_errors || '"Division/Region is outside the officer jurisdiction"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'district') IS DISTINCT FROM v_branch_name
       OR ptas_private.survey_import_text(v_item.row_data,'zone') IS DISTINCT FROM v_branch_name THEN
      v_errors := v_errors || '"District/Zone is outside the officer jurisdiction"'::jsonb;
    END IF;
    IF v_actor.role_code='ETO' AND v_row_circle_count<>1 THEN
      v_errors := v_errors || '"Circle is missing, ambiguous, or outside the ETO District/Zone"'::jsonb;
    ELSIF v_actor.role_code='INSPECTOR'
       AND ptas_private.survey_import_text(v_item.row_data,'circle') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'circle') IS DISTINCT FROM v_circle_name THEN
      v_errors := v_errors || '"Circle is outside the Inspector assignment"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'tehsil') IS NOT NULL AND v_tehsil_name IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'tehsil') IS DISTINCT FROM v_row_tehsil_name THEN
      v_errors := v_errors || '"Tehsil is outside the officer jurisdiction"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'commercial_address') IS NULL THEN v_errors:=v_errors||'"Commercial Address is required"'::jsonb; END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'legal_name') IS NULL THEN v_errors:=v_errors||'"Legal Name / Entity Name is required"'::jsonb; END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'financial_year') IS DISTINCT FROM p_financial_year_code THEN
      v_errors:=v_errors||'"Financial Year does not match the import batch"'::jsonb;
    END IF;
    IF coalesce(ptas_private.survey_import_text(v_item.row_data,'taxpayer_status'),'') NOT IN ('Active','Closed','Duplicate-Merged','Transferred','Archived') THEN
      v_errors:=v_errors||'"Taxpayer Status is not recognized"'::jsonb;
    END IF;
    IF (ptas_private.survey_import_text(v_item.row_data,'identifier_type') IS NULL) <> (ptas_private.survey_import_text(v_item.row_data,'identifier_value') IS NULL) THEN
      v_errors:=v_errors||'"Identifier Type and Identifier Value must be supplied together"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'assessment_rate') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'assessment_rate') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      v_errors:=v_errors||'"Assessment rate must be a non-negative number"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'arrears') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'arrears') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      v_errors:=v_errors||'"Arrears must be a non-negative number"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'survey_date') IS NOT NULL
       AND (ptas_private.survey_import_text(v_item.row_data,'survey_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            OR ptas_private.survey_import_date(v_item.row_data->>'survey_date') IS NULL) THEN
      v_errors:=v_errors||'"Survey Date must use ISO YYYY-MM-DD format"'::jsonb;
    END IF;

    SELECT * INTO v_rule FROM survey_classification_rules r
    WHERE r.financial_year_code=p_financial_year_code AND r.status='ACTIVE'
      AND r.tax_class=ptas_private.survey_import_text(v_item.row_data,'tax_class')
      AND r.tax_assessment_option=ptas_private.survey_import_text(v_item.row_data,'tax_assessment_option')
      AND v_business_date BETWEEN r.effective_from AND coalesce(r.effective_to,'infinity'::date);
    IF v_rule.id IS NULL THEN v_errors:=v_errors||'"No active approved statutory classification matches this row"'::jsonb; END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'statutory_rule_id') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'statutory_rule_id') IS DISTINCT FROM v_rule.statutory_rule_id THEN
      v_errors:=v_errors||'"Supplied Statutory Rule ID does not match server configuration"'::jsonb;
    END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'assessment_rate') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'assessment_rate') ~ '^[0-9]+([.][0-9]{1,2})?$'
       AND (v_item.row_data->>'assessment_rate')::numeric IS DISTINCT FROM v_rule.assessment_rate THEN
      v_errors:=v_errors||'"Supplied assessment rate does not match server configuration"'::jsonb;
    END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'tax_subclass') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'tax_subclass') IS DISTINCT FROM v_rule.tax_subclass THEN
      v_errors:=v_errors||'"Supplied Tax Sub-Class does not match server configuration"'::jsonb;
    END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'primary_class_code') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'primary_class_code') IS DISTINCT FROM v_rule.primary_class_code THEN
      v_errors:=v_errors||'"Supplied Primary Class Code does not match server configuration"'::jsonb;
    END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'schedule_subclass_code') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'schedule_subclass_code') IS DISTINCT FROM v_rule.schedule_subclass_code THEN
      v_errors:=v_errors||'"Supplied Schedule Sub-Class Code does not match server configuration"'::jsonb;
    END IF;
    IF v_rule.id IS NOT NULL AND ptas_private.survey_import_text(v_item.row_data,'rate_basis') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'rate_basis') IS DISTINCT FROM v_rule.rate_basis THEN
      v_errors:=v_errors||'"Supplied Rate Basis does not match server configuration"'::jsonb;
    END IF;
    v_status := CASE WHEN jsonb_array_length(v_errors)=0 THEN 'READY' ELSE 'INVALID' END;
    IF v_status='READY' THEN v_ready:=v_ready+1; ELSE v_invalid:=v_invalid+1; END IF;

    INSERT INTO survey_import_rows(batch_id,row_number,supplied_survey_no,division,region,district,zone,tehsil,circle,locality,
      commercial_address,legal_name,taxpayer_name,identifier_type,identifier_value,phone,email,tax_class,tax_assessment_option,
      supplied_tax_subclass,supplied_assessment_rate,supplied_primary_class_code,supplied_schedule_subclass_code,supplied_rate_basis,
      supplied_statutory_rule_id,supplied_financial_year,supplied_survey_date,taxpayer_status,legacy_demand_no,arrears,remarks,
      supplied_import_status,resolved_rule_id,resolved_jurisdiction_id,survey_date,status,validation_errors)
    VALUES(v_batch.id,v_item.row_number,ptas_private.survey_import_text(v_item.row_data,'survey_no'),
      coalesce(ptas_private.survey_import_text(v_item.row_data,'division'),''),coalesce(ptas_private.survey_import_text(v_item.row_data,'region'),''),
      coalesce(ptas_private.survey_import_text(v_item.row_data,'district'),''),coalesce(ptas_private.survey_import_text(v_item.row_data,'zone'),''),
      ptas_private.survey_import_text(v_item.row_data,'tehsil'),ptas_private.survey_import_text(v_item.row_data,'circle'),
      ptas_private.survey_import_text(v_item.row_data,'locality'),coalesce(ptas_private.survey_import_text(v_item.row_data,'commercial_address'),''),
      coalesce(ptas_private.survey_import_text(v_item.row_data,'legal_name'),''),ptas_private.survey_import_text(v_item.row_data,'taxpayer_name'),
      ptas_private.survey_import_text(v_item.row_data,'identifier_type'),ptas_private.survey_import_text(v_item.row_data,'identifier_value'),
      ptas_private.survey_import_text(v_item.row_data,'phone'),ptas_private.survey_import_text(v_item.row_data,'email'),
      coalesce(ptas_private.survey_import_text(v_item.row_data,'tax_class'),''),coalesce(ptas_private.survey_import_text(v_item.row_data,'tax_assessment_option'),''),
      ptas_private.survey_import_text(v_item.row_data,'tax_subclass'),CASE WHEN ptas_private.survey_import_text(v_item.row_data,'assessment_rate') ~ '^[0-9]+([.][0-9]{1,2})?$' THEN (v_item.row_data->>'assessment_rate')::numeric END,
      ptas_private.survey_import_text(v_item.row_data,'primary_class_code'),ptas_private.survey_import_text(v_item.row_data,'schedule_subclass_code'),
      ptas_private.survey_import_text(v_item.row_data,'rate_basis'),ptas_private.survey_import_text(v_item.row_data,'statutory_rule_id'),
      ptas_private.survey_import_text(v_item.row_data,'financial_year'),ptas_private.survey_import_date(v_item.row_data->>'survey_date'),
      coalesce(ptas_private.survey_import_text(v_item.row_data,'taxpayer_status'),'Active'),ptas_private.survey_import_text(v_item.row_data,'legacy_demand_no'),
      CASE WHEN ptas_private.survey_import_text(v_item.row_data,'arrears') ~ '^[0-9]+([.][0-9]{1,2})?$' THEN (v_item.row_data->>'arrears')::numeric ELSE 0 END,ptas_private.survey_import_text(v_item.row_data,'remarks'),
      ptas_private.survey_import_text(v_item.row_data,'import_status'),v_rule.id,v_row_jurisdiction_id,v_business_date,v_status,v_errors);
  END LOOP;

  UPDATE survey_import_batches SET ready_rows=v_ready,invalid_rows=v_invalid,
    status=CASE WHEN v_invalid=0 THEN 'VALIDATED' ELSE 'NEEDS_CORRECTION' END,validated_at=now()
  WHERE id=v_batch.id RETURNING * INTO v_batch;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,to_status,actor_id,actor_role,correlation_id,idempotency_key)
  VALUES('SURVEY_IMPORT',v_batch.id,'STAGE',v_batch.status::text,v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key);
  PERFORM ptas_private.audit_transition('SURVEY_IMPORT_STAGED','SURVEY_IMPORT',v_batch.id,v_actor.user_id,v_actor.role_code,
    v_actor.jurisdiction_id,p_correlation_id,NULL,v_batch.status::text,NULL);
  RETURN v_batch;
END $$;

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
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a
  WHERE a.user_id=v_batch.uploaded_by
    AND a.jurisdiction_id=v_batch.jurisdiction_id
    AND NOT EXISTS (
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
  v_responsible_inspector_id uuid;
  v_inspector_count integer;
BEGIN
  SELECT * INTO v_batch FROM public.survey_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a
    WHERE a.user_id=v_batch.uploaded_by AND a.jurisdiction_id=v_batch.jurisdiction_id LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only the assigned uploading Inspector or ETO may promote this batch' USING ERRCODE='42501';
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

    IF v_row.resolved_jurisdiction_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_row.resolved_jurisdiction_id) THEN
      RAISE EXCEPTION 'survey row jurisdiction is outside the importing officer scope'
        USING ERRCODE='42501';
    END IF;

    SELECT (array_agg(ur.user_id ORDER BY ur.user_id))[1],count(*)
    INTO v_responsible_inspector_id,v_inspector_count
    FROM public.user_roles ur
    JOIN public.app_users u ON u.id=ur.user_id
    WHERE ur.role_code='INSPECTOR'
      AND ur.jurisdiction_id=v_row.resolved_jurisdiction_id
      AND ur.valid_from<=now() AND (ur.valid_to IS NULL OR ur.valid_to>now())
      AND u.active AND u.deactivated_at IS NULL;
    IF v_inspector_count<>1 THEN
      RAISE EXCEPTION 'exactly one active Inspector must be assigned to each imported Circle'
        USING ERRCODE='23514';
    END IF;

    INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(v_row.legal_name,'DRAFT',v_row.resolved_jurisdiction_id,v_actor.user_id::text)
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
      v_taxpayer_id,v_batch.financial_year_code,v_row.resolved_jurisdiction_id,v_responsible_inspector_id,
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

REVOKE ALL ON FUNCTION public.stage_survey_import(text,text,text,jsonb,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import(text,text,text,jsonb,jsonb,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.promote_survey_import(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.promote_survey_import(uuid,text,text) TO authenticated;

COMMIT;

BEGIN;

DO $$ BEGIN
  CREATE TYPE survey_import_batch_state AS ENUM ('STAGED', 'NEEDS_CORRECTION', 'VALIDATED', 'IMPORTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE survey_import_row_state AS ENUM ('READY', 'INVALID', 'IMPORTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE survey_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_code text NOT NULL,
  tax_class text NOT NULL CHECK (length(btrim(tax_class)) > 0),
  tax_assessment_option text NOT NULL CHECK (length(btrim(tax_assessment_option)) > 0),
  tax_subclass text NOT NULL,
  assessment_rate numeric(18,2) NOT NULL CHECK (assessment_rate >= 0),
  primary_class_code text NOT NULL,
  schedule_subclass_code text NOT NULL,
  rate_basis text NOT NULL,
  statutory_rule_id text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  approval_identifier text,
  approving_authority text,
  approved_on date,
  source_document_sha256 text CHECK (source_document_sha256 IS NULL OR source_document_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    status = 'DRAFT' OR
    (approval_identifier IS NOT NULL AND approving_authority IS NOT NULL AND approved_on IS NOT NULL AND source_document_sha256 IS NOT NULL)
  ),
  UNIQUE (financial_year_code, tax_class, tax_assessment_option, effective_from)
);
CREATE UNIQUE INDEX survey_classification_one_active
ON survey_classification_rules(financial_year_code,tax_class,tax_assessment_option) WHERE status='ACTIVE';

CREATE TABLE survey_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL CHECK (length(btrim(source_filename)) > 0),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  financial_year_code text NOT NULL CHECK (financial_year_code ~ '^[0-9]{4}-[0-9]{4}$'),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
  uploaded_by uuid NOT NULL REFERENCES app_users(id),
  status survey_import_batch_state NOT NULL DEFAULT 'STAGED',
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  ready_rows integer NOT NULL DEFAULT 0 CHECK (ready_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  imported_rows integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  header_snapshot jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  imported_at timestamptz,
  UNIQUE (uploaded_by, file_sha256),
  CHECK (ready_rows + invalid_rows <= total_rows),
  CHECK (imported_rows <= ready_rows)
);

CREATE TABLE survey_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES survey_import_batches(id) ON DELETE RESTRICT,
  row_number integer NOT NULL CHECK (row_number >= 2),
  supplied_survey_no text,
  division text NOT NULL,
  region text NOT NULL,
  district text NOT NULL,
  zone text NOT NULL,
  tehsil text,
  circle text,
  locality text,
  commercial_address text NOT NULL,
  legal_name text NOT NULL,
  taxpayer_name text,
  identifier_type text,
  identifier_value text,
  phone text,
  email text,
  tax_class text NOT NULL,
  tax_assessment_option text NOT NULL,
  supplied_tax_subclass text,
  supplied_assessment_rate numeric(18,2),
  supplied_primary_class_code text,
  supplied_schedule_subclass_code text,
  supplied_rate_basis text,
  supplied_statutory_rule_id text,
  supplied_financial_year text,
  supplied_survey_date date,
  taxpayer_status text NOT NULL,
  legacy_demand_no text,
  arrears numeric(18,2) NOT NULL DEFAULT 0 CHECK (arrears >= 0),
  remarks text,
  supplied_import_status text,
  resolved_rule_id uuid REFERENCES survey_classification_rules(id),
  resolved_jurisdiction_id uuid REFERENCES jurisdictions(id),
  generated_survey_no uuid NOT NULL DEFAULT gen_random_uuid(),
  survey_date date NOT NULL,
  status survey_import_row_state NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  promoted_survey_unit_id uuid UNIQUE REFERENCES survey_units(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number),
  UNIQUE (batch_id, generated_survey_no),
  CHECK ((identifier_type IS NULL) = (identifier_value IS NULL)),
  CHECK ((status = 'IMPORTED') = (promoted_survey_unit_id IS NOT NULL))
);

CREATE TABLE survey_unit_profiles (
  survey_unit_id uuid PRIMARY KEY REFERENCES survey_units(id) ON DELETE RESTRICT,
  import_row_id uuid UNIQUE REFERENCES survey_import_rows(id) ON DELETE RESTRICT,
  survey_no uuid NOT NULL UNIQUE,
  survey_date date NOT NULL,
  locality text,
  commercial_address text NOT NULL,
  legal_name text NOT NULL,
  taxpayer_name text,
  phone text,
  email text,
  classification_rule_id uuid NOT NULL REFERENCES survey_classification_rules(id),
  taxpayer_status text NOT NULL,
  legacy_demand_no text,
  opening_arrears numeric(18,2) NOT NULL DEFAULT 0 CHECK (opening_arrears >= 0),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX survey_import_batches_scope_idx ON survey_import_batches(jurisdiction_id, created_at DESC);
CREATE INDEX survey_import_rows_batch_status_idx ON survey_import_rows(batch_id, status, row_number);
CREATE INDEX survey_unit_profiles_rule_idx ON survey_unit_profiles(classification_rule_id);

CREATE OR REPLACE FUNCTION ptas_private.survey_import_text(p_row jsonb, p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(p_row ->> p_key), '')
$$;

CREATE OR REPLACE FUNCTION ptas_private.survey_import_date(p_value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  RETURN btrim(p_value)::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;

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

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR']) LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'active Inspector assignment required' USING ERRCODE='42501'; END IF;
  SELECT name INTO v_circle_name FROM jurisdictions WHERE id=v_actor.jurisdiction_id AND tier='CIRCLE';
  IF v_circle_name IS NULL THEN RAISE EXCEPTION 'Inspector must be assigned to a Circle' USING ERRCODE='42501'; END IF;

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
    IF ptas_private.survey_import_text(v_item.row_data,'division') IS DISTINCT FROM v_root_name
       OR ptas_private.survey_import_text(v_item.row_data,'region') IS DISTINCT FROM v_root_name THEN
      v_errors := v_errors || '"Division/Region is outside the Inspector jurisdiction"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'district') IS DISTINCT FROM v_branch_name
       OR ptas_private.survey_import_text(v_item.row_data,'zone') IS DISTINCT FROM v_branch_name THEN
      v_errors := v_errors || '"District/Zone is outside the Inspector jurisdiction"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'circle') IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'circle') IS DISTINCT FROM v_circle_name THEN
      v_errors := v_errors || '"Circle is outside the Inspector assignment"'::jsonb;
    END IF;
    IF ptas_private.survey_import_text(v_item.row_data,'tehsil') IS NOT NULL AND v_tehsil_name IS NOT NULL
       AND ptas_private.survey_import_text(v_item.row_data,'tehsil') IS DISTINCT FROM v_tehsil_name THEN
      v_errors := v_errors || '"Tehsil is outside the Inspector jurisdiction"'::jsonb;
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
      ptas_private.survey_import_text(v_item.row_data,'import_status'),v_rule.id,v_actor.jurisdiction_id,v_business_date,v_status,v_errors);
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

CREATE OR REPLACE FUNCTION public.promote_survey_import(
  p_batch_id uuid, p_idempotency_key text, p_correlation_id text
) RETURNS survey_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,ptas_private,pg_temp AS $$
DECLARE
  v_actor record;
  v_batch survey_import_batches;
  v_row survey_import_rows;
  v_taxpayer_id uuid;
  v_unit_id uuid;
  v_rule survey_classification_rules;
  v_normalized text;
BEGIN
  SELECT * INTO v_batch FROM survey_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a
    WHERE a.user_id=v_batch.uploaded_by AND a.jurisdiction_id=v_batch.jurisdiction_id LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'only the assigned uploading Inspector may promote this batch' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM workflow_actions WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key) THEN RETURN v_batch; END IF;
  IF v_batch.status<>'VALIDATED' OR v_batch.invalid_rows<>0 OR v_batch.ready_rows<>v_batch.total_rows THEN
    RAISE EXCEPTION 'batch is not eligible for import' USING ERRCODE='23514';
  END IF;

  FOR v_row IN SELECT * FROM survey_import_rows WHERE batch_id=v_batch.id ORDER BY row_number FOR UPDATE LOOP
    SELECT * INTO v_rule FROM survey_classification_rules WHERE id=v_row.resolved_rule_id AND status='ACTIVE';
    IF v_rule.id IS NULL THEN RAISE EXCEPTION 'classification became inactive before import' USING ERRCODE='40001'; END IF;
    INSERT INTO taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(v_row.legal_name,'DRAFT',v_batch.jurisdiction_id,v_actor.user_id::text) RETURNING id INTO v_taxpayer_id;
    IF v_row.identifier_value IS NOT NULL THEN
      v_normalized:=upper(regexp_replace(v_row.identifier_value,'[^0-9A-Za-z]','','g'));
      INSERT INTO taxpayer_identifiers(taxpayer_id,identifier_type,normalized_value,masked_value,is_primary)
      VALUES(v_taxpayer_id,v_row.identifier_type,v_normalized,
        repeat('*',greatest(length(v_normalized)-4,0))||right(v_normalized,4),true);
    END IF;
    INSERT INTO survey_units(taxpayer_id,financial_year_id,jurisdiction_id,responsible_inspector_id,source,state,payload)
    VALUES(v_taxpayer_id,v_batch.financial_year_code,v_batch.jurisdiction_id,v_actor.user_id,'CSV_IMPORT','FEEDED',
      jsonb_build_object('import_batch_id',v_batch.id,'import_row_id',v_row.id)) RETURNING id INTO v_unit_id;
    INSERT INTO survey_unit_profiles(survey_unit_id,import_row_id,survey_no,survey_date,locality,commercial_address,legal_name,
      taxpayer_name,phone,email,classification_rule_id,taxpayer_status,legacy_demand_no,opening_arrears,remarks)
    VALUES(v_unit_id,v_row.id,v_row.generated_survey_no,v_row.survey_date,v_row.locality,v_row.commercial_address,v_row.legal_name,
      v_row.taxpayer_name,v_row.phone,v_row.email,v_rule.id,v_row.taxpayer_status,v_row.legacy_demand_no,v_row.arrears,v_row.remarks);
    UPDATE survey_import_rows SET status='IMPORTED',promoted_survey_unit_id=v_unit_id WHERE id=v_row.id;
  END LOOP;
  UPDATE survey_import_batches SET status='IMPORTED',imported_rows=total_rows,imported_at=now() WHERE id=v_batch.id RETURNING * INTO v_batch;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,correlation_id,idempotency_key)
  VALUES('SURVEY_IMPORT',v_batch.id,'PROMOTE','VALIDATED','IMPORTED',v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key);
  PERFORM ptas_private.audit_transition('SURVEY_IMPORT_PROMOTED','SURVEY_IMPORT',v_batch.id,v_actor.user_id,v_actor.role_code,
    v_actor.jurisdiction_id,p_correlation_id,'VALIDATED','IMPORTED',NULL);
  RETURN v_batch;
END $$;

ALTER TABLE survey_classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_unit_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON survey_classification_rules,survey_import_batches,survey_import_rows,survey_unit_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON survey_classification_rules,survey_import_batches,survey_import_rows,survey_unit_profiles TO authenticated;

CREATE POLICY survey_classification_rules_select ON survey_classification_rules FOR SELECT TO authenticated
USING (status='ACTIVE' AND EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL)));
CREATE POLICY survey_import_batches_select ON survey_import_batches FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,jurisdiction_id)));
CREATE POLICY survey_import_rows_select ON survey_import_rows FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM survey_import_batches b WHERE b.id=batch_id));
CREATE POLICY survey_unit_profiles_select ON survey_unit_profiles FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM survey_units s WHERE s.id=survey_unit_id));

REVOKE ALL ON FUNCTION public.stage_survey_import(text,text,text,jsonb,jsonb,text,text),public.promote_survey_import(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import(text,text,text,jsonb,jsonb,text,text),public.promote_survey_import(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION ptas_private.survey_import_text(jsonb,text),ptas_private.survey_import_date(text) FROM PUBLIC,anon,authenticated;

CREATE TRIGGER survey_unit_profiles_no_update_delete BEFORE UPDATE OR DELETE ON survey_unit_profiles
FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_historical_mutation();

COMMIT;

BEGIN;

CREATE TABLE public.survey_classification_rate_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL CHECK (length(btrim(source_filename)) > 0),
  source_document_sha256 text NOT NULL UNIQUE
    CHECK (source_document_sha256 ~ '^[0-9a-f]{64}$'),
  source_rows jsonb NOT NULL CHECK (jsonb_typeof(source_rows) = 'array'),
  row_count integer NOT NULL CHECK (row_count > 0),
  financial_year_code text CHECK (
    financial_year_code IS NULL OR financial_year_code ~ '^[0-9]{4}-[0-9]{4}$'
  ),
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL','ACTIVE','RETIRED')),
  approval_identifier text,
  approving_authority text,
  approved_on date,
  staged_by text NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  activated_by text,
  activated_at timestamptz,
  CHECK (effective_to IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    status = 'PENDING_APPROVAL'
    OR (
      financial_year_code IS NOT NULL
      AND effective_from IS NOT NULL
      AND approval_identifier IS NOT NULL
      AND length(btrim(approval_identifier)) > 0
      AND approving_authority IS NOT NULL
      AND length(btrim(approving_authority)) > 0
      AND approved_on IS NOT NULL
      AND activated_by IS NOT NULL
      AND activated_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX survey_classification_one_active_rate_pack
ON public.survey_classification_rate_packs(financial_year_code)
WHERE status = 'ACTIVE';

ALTER TABLE public.survey_classification_rules
ADD COLUMN rate_pack_id uuid REFERENCES public.survey_classification_rate_packs(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX survey_classification_one_active_schedule_code
ON public.survey_classification_rules(financial_year_code,schedule_subclass_code)
WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION ptas_private.protect_rate_pack_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'survey classification rate packs are immutable' USING ERRCODE='55000';
  END IF;

  IF OLD.status IN ('ACTIVE','RETIRED') THEN
    RAISE EXCEPTION 'active or retired survey classification rate packs are immutable' USING ERRCODE='55000';
  END IF;

  IF current_setting('ptas.rate_pack_activation', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'rate packs may only be activated by the controlled admin command' USING ERRCODE='42501';
  END IF;

  IF NEW.source_filename IS DISTINCT FROM OLD.source_filename
    OR NEW.source_document_sha256 IS DISTINCT FROM OLD.source_document_sha256
    OR NEW.source_rows IS DISTINCT FROM OLD.source_rows
    OR NEW.row_count IS DISTINCT FROM OLD.row_count
    OR NEW.staged_by IS DISTINCT FROM OLD.staged_by
    OR NEW.staged_at IS DISTINCT FROM OLD.staged_at
    OR NEW.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'source rate-pack evidence cannot be changed during activation' USING ERRCODE='55000';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER survey_classification_rate_packs_no_mutation
BEFORE UPDATE OR DELETE ON public.survey_classification_rate_packs
FOR EACH ROW EXECUTE FUNCTION ptas_private.protect_rate_pack_mutation();

CREATE OR REPLACE FUNCTION ptas_private.protect_active_classification_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('ACTIVE','RETIRED') THEN
    RAISE EXCEPTION 'active or retired survey classification rules are immutable' USING ERRCODE='55000';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER survey_classification_rules_no_active_mutation
BEFORE UPDATE OR DELETE ON public.survey_classification_rules
FOR EACH ROW EXECUTE FUNCTION ptas_private.protect_active_classification_rule();

CREATE OR REPLACE FUNCTION public.admin_stage_survey_classification_rate_pack(
  p_source_filename text,
  p_source_document_sha256 text,
  p_source_rows jsonb,
  p_correlation_id text
)
RETURNS public.survey_classification_rate_packs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pack public.survey_classification_rate_packs;
  v_row_count integer;
BEGIN
  IF length(btrim(coalesce(p_source_filename,''))) = 0
    OR coalesce(p_source_document_sha256,'') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_source_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_source_rows) = 0
    OR length(btrim(coalesce(p_correlation_id,''))) = 0 THEN
    RAISE EXCEPTION 'valid filename, SHA-256, non-empty row array, and correlation ID are required'
      USING ERRCODE='22023';
  END IF;

  v_row_count := jsonb_array_length(p_source_rows);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_source_rows) item
    WHERE jsonb_typeof(item) <> 'object'
      OR length(btrim(coalesce(item->>'schedule_subclass_code',''))) = 0
      OR length(btrim(coalesce(item->>'primary_class_code',''))) = 0
      OR length(btrim(coalesce(item->>'tax_class',''))) = 0
      OR length(btrim(coalesce(item->>'tax_subclass',''))) = 0
      OR length(btrim(coalesce(item->>'tax_assessment_option',''))) = 0
      OR length(btrim(coalesce(item->>'rate_basis',''))) = 0
      OR length(btrim(coalesce(item->>'statutory_rule_id',''))) = 0
      OR coalesce(item->>'assessment_rate','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
  ) THEN
    RAISE EXCEPTION 'one or more rate rows are incomplete or invalid' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT item->>'schedule_subclass_code'
    FROM jsonb_array_elements(p_source_rows) item
    GROUP BY item->>'schedule_subclass_code'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate schedule subclass code in rate pack' USING ERRCODE='23505';
  END IF;

  SELECT * INTO v_pack
  FROM public.survey_classification_rate_packs
  WHERE source_document_sha256 = p_source_document_sha256;
  IF FOUND THEN
    IF v_pack.source_rows IS DISTINCT FROM p_source_rows
      OR v_pack.source_filename IS DISTINCT FROM p_source_filename THEN
      RAISE EXCEPTION 'source hash already exists with different immutable content' USING ERRCODE='23505';
    END IF;
    RETURN v_pack;
  END IF;

  INSERT INTO public.survey_classification_rate_packs(
    source_filename,source_document_sha256,source_rows,row_count,staged_by
  ) VALUES (
    btrim(p_source_filename),p_source_document_sha256,p_source_rows,v_row_count,
    coalesce((SELECT auth.uid())::text,'BACKEND_ADMIN')
  ) RETURNING * INTO v_pack;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'STATUTORY_RATE_PACK_STAGED','SURVEY_CLASSIFICATION_RATE_PACK',
    v_pack.id::text,coalesce((SELECT auth.uid())::text,'BACKEND_ADMIN'),'BACKEND_ADMIN',
    NULL,p_correlation_id,
    jsonb_build_object(
      'status',v_pack.status,
      'source_filename',v_pack.source_filename,
      'source_document_sha256',v_pack.source_document_sha256,
      'row_count',v_pack.row_count
    )
  );

  RETURN v_pack;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_activate_survey_classification_rate_pack(
  p_rate_pack_id uuid,
  p_financial_year_code text,
  p_effective_from date,
  p_effective_to date,
  p_approval_identifier text,
  p_approving_authority text,
  p_approved_on date,
  p_correlation_id text
)
RETURNS public.survey_classification_rate_packs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pack public.survey_classification_rate_packs;
  v_inserted integer;
  v_actor text := coalesce((SELECT auth.uid())::text,'BACKEND_ADMIN');
BEGIN
  IF coalesce(p_financial_year_code,'') !~ '^[0-9]{4}-[0-9]{4}$'
    OR p_effective_from IS NULL
    OR (p_effective_to IS NOT NULL AND p_effective_to < p_effective_from)
    OR length(btrim(coalesce(p_approval_identifier,''))) = 0
    OR length(btrim(coalesce(p_approving_authority,''))) = 0
    OR p_approved_on IS NULL
    OR length(btrim(coalesce(p_correlation_id,''))) = 0 THEN
    RAISE EXCEPTION 'financial year, effective period, formal approval evidence, and correlation ID are required'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_pack
  FROM public.survey_classification_rate_packs
  WHERE id = p_rate_pack_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rate pack not found' USING ERRCODE='P0002';
  END IF;
  IF v_pack.status = 'ACTIVE' THEN
    RETURN v_pack;
  END IF;
  IF v_pack.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'rate pack is not eligible for activation' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.survey_classification_rules(
    rate_pack_id,financial_year_code,tax_class,tax_assessment_option,tax_subclass,
    assessment_rate,primary_class_code,schedule_subclass_code,rate_basis,
    statutory_rule_id,effective_from,effective_to,status,approval_identifier,
    approving_authority,approved_on,source_document_sha256
  )
  SELECT
    v_pack.id,p_financial_year_code,item->>'tax_class',item->>'tax_assessment_option',
    item->>'tax_subclass',(item->>'assessment_rate')::numeric,item->>'primary_class_code',
    item->>'schedule_subclass_code',item->>'rate_basis',item->>'statutory_rule_id',
    p_effective_from,p_effective_to,'ACTIVE',btrim(p_approval_identifier),
    btrim(p_approving_authority),p_approved_on,v_pack.source_document_sha256
  FROM jsonb_array_elements(v_pack.source_rows) item;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_pack.row_count THEN
    RAISE EXCEPTION 'rate pack row-count mismatch during activation' USING ERRCODE='40001';
  END IF;

  PERFORM set_config('ptas.rate_pack_activation',v_pack.id::text,true);
  UPDATE public.survey_classification_rate_packs
  SET financial_year_code=p_financial_year_code,effective_from=p_effective_from,
      effective_to=p_effective_to,status='ACTIVE',
      approval_identifier=btrim(p_approval_identifier),
      approving_authority=btrim(p_approving_authority),approved_on=p_approved_on,
      activated_by=v_actor,activated_at=now()
  WHERE id=v_pack.id
  RETURNING * INTO v_pack;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'STATUTORY_RATE_PACK_ACTIVATED','SURVEY_CLASSIFICATION_RATE_PACK',
    v_pack.id::text,v_actor,'BACKEND_ADMIN',NULL,p_correlation_id,
    jsonb_build_object(
      'previous_state','PENDING_APPROVAL','new_state','ACTIVE',
      'financial_year_code',v_pack.financial_year_code,
      'effective_from',v_pack.effective_from,'effective_to',v_pack.effective_to,
      'approval_identifier',v_pack.approval_identifier,
      'approving_authority',v_pack.approving_authority,
      'approved_on',v_pack.approved_on,
      'source_document_sha256',v_pack.source_document_sha256,
      'row_count',v_pack.row_count
    )
  );

  RETURN v_pack;
END
$$;

ALTER TABLE public.survey_classification_rate_packs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.survey_classification_rate_packs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.survey_classification_rate_packs TO authenticated;
CREATE POLICY survey_classification_rate_packs_active_select
ON public.survey_classification_rate_packs FOR SELECT TO authenticated
USING (
  status='ACTIVE'
  AND EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL))
);

REVOKE ALL ON FUNCTION
  public.admin_stage_survey_classification_rate_pack(text,text,jsonb,text),
  public.admin_activate_survey_classification_rate_pack(uuid,text,date,date,text,text,date,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.admin_stage_survey_classification_rate_pack(text,text,jsonb,text),
  public.admin_activate_survey_classification_rate_pack(uuid,text,date,date,text,text,date,text)
TO service_role;

REVOKE ALL ON FUNCTION
  ptas_private.protect_rate_pack_mutation(),
  ptas_private.protect_active_classification_rule()
FROM PUBLIC,anon,authenticated;

COMMIT;

-- Migration 0047: Minimal & High-Performant Assessment Versions Table & Survey Pruning
-- 
-- 1. Creates public.assessment_versions table to store immutable historical records
--    of assessment revisions and approvals for any unit over time.
-- 2. Backfills initial version 1 snapshots for existing units from public.pft3_assessment_units.
-- 3. Prunes already approved units from public.survey_import_rows to eliminate database space wastage.
-- 4. Upgrades public.transition_survey_unit() to:
--    - Update PIN lifecycle suffix (-01 for Approved, -02 for Submitted, -05 for Returned, -06 for Closed).
--    - Record an immutable snapshot in public.assessment_versions upon statutory approval.
--    - Prune any remaining staging row in public.survey_import_rows for the approved unit.
-- 5. Exposes public.get_assessment_versions(p_unit_id uuid) RPC for high-performance dossier and audit viewing.

-- Step 1: Create public.assessment_versions table
CREATE TABLE IF NOT EXISTS public.assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.pft3_assessment_units(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  financial_year_id text NOT NULL DEFAULT '2026-2027',
  pin_number text,
  permanent_demand_no text,
  category_code text,
  subclassification_code text,
  annual_rate_pkr numeric NOT NULL DEFAULT 0,
  opening_arrears numeric NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('DRAFT', 'FEEDED', 'SUBMITTED', 'APPROVED', 'RETURNED', 'CLOSED')),
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  CONSTRAINT uq_assessment_versions_unit_version UNIQUE (unit_id, version_no)
);

-- Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_assessment_versions_unit ON public.assessment_versions(unit_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_versions_pin ON public.assessment_versions(pin_number);

-- Security: Enable RLS and establish policies
ALTER TABLE public.assessment_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessment_versions_select_policy ON public.assessment_versions;
CREATE POLICY assessment_versions_select_policy ON public.assessment_versions
  FOR SELECT TO authenticated, service_role USING (true);

DROP POLICY IF EXISTS assessment_versions_insert_policy ON public.assessment_versions;
CREATE POLICY assessment_versions_insert_policy ON public.assessment_versions
  FOR INSERT TO authenticated, service_role WITH CHECK (true);

-- Step 2: Backfill baseline version 1 records for existing assessment units
INSERT INTO public.assessment_versions (
  unit_id,
  version_no,
  financial_year_id,
  pin_number,
  permanent_demand_no,
  category_code,
  subclassification_code,
  annual_rate_pkr,
  opening_arrears,
  status,
  reason,
  snapshot,
  created_by,
  created_at,
  approved_by,
  approved_at
)
SELECT
  p.id,
  coalesce(p.row_version, 1)::int,
  p.financial_year_id,
  p.pin_number,
  p.permanent_demand_no,
  p.category_code,
  p.subclassification_code,
  p.annual_rate_pkr,
  p.opening_arrears,
  p.state,
  coalesce(p.remarks, 'Initial statutory baseline assessment record'),
  jsonb_build_object(
    'legalName', p.legal_name,
    'taxpayerName', p.taxpayer_name,
    'tradeName', p.trade_name,
    'categoryName', p.category_name,
    'subclassificationName', p.subclassification_name,
    'circleName', p.circle_name,
    'tehsil', p.tehsil,
    'districtName', p.district_name,
    'identifierType', p.identifier_type,
    'identifierValue', p.identifier_value,
    'address', p.address,
    'ratePkr', p.annual_rate_pkr
  ),
  p.created_by,
  p.created_at,
  p.approved_by,
  p.approved_at
FROM public.pft3_assessment_units p
ON CONFLICT (unit_id, version_no) DO NOTHING;

-- Step 3: Prune already approved units from public.survey_import_rows to reclaim database storage
DELETE FROM public.survey_import_rows r
USING public.pft3_assessment_units u
WHERE r.promoted_survey_unit_id = u.id
  AND u.state = 'APPROVED';

-- Clean obsolete import row reference from approved units
UPDATE public.pft3_assessment_units
SET import_row_id = NULL
WHERE state = 'APPROVED' AND import_row_id IS NOT NULL;

-- Step 4: Upgrade public.transition_survey_unit() to record versions and prune staging upon approval
CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL::text
) RETURNS public.pft3_assessment_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.pft3_assessment_units;
  a record;
  n text;
  old text;
  v_pin text;
  v_demand_no text;
  v_new_version integer;
BEGIN
  SELECT * INTO v FROM public.pft3_assessment_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  
  -- ETO can review/approve/return; both Inspector and ETO can submit/feed/revise
  SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR','ETO'] END) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.circle_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  
  old := v.state;
  n := (CASE 
    WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='APPROVED' AND p_action IN ('REVISE','SUBMIT','EDIT') THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' 
    ELSE NULL END);
  IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;

  INSERT INTO public.workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('SURVEY_UNIT',v.id,p_action,old,n,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);

  -- Allocate or update PIN with proper statutory VV lifecycle suffix
  IF v.pin_number IS NULL OR length(btrim(v.pin_number)) < 15 OR v.pin_number LIKE 'Potential-%' THEN
    v_pin := ptas_private.allocate_pft3_pin(v.id);
  ELSE
    v_pin := v.pin_number;
  END IF;

  -- Statutory Lifecycle VV Suffix Alignment:
  -- -01: Approved in Form PFT-3
  -- -02: Submitted
  -- -03: Feeded
  -- -05: Returned
  -- -06: Closed
  IF v_pin IS NOT NULL AND v_pin ~ '-(0[1-7])$' THEN
    IF n = 'APPROVED' THEN
      v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-01');
    ELSIF n = 'SUBMITTED' THEN
      v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-02');
    ELSIF n = 'FEEDED' THEN
      v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-03');
    ELSIF n = 'RETURNED' THEN
      v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-05');
    ELSIF n = 'CLOSED' THEN
      v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-06');
    END IF;
  END IF;

  v.pin_number := v_pin;
  v.provincial_uin := v_pin;

  IF n='APPROVED' THEN
    -- Ensure Demand Number is numeric and normalized
    v_demand_no := ptas_private.normalize_demand_no(v.permanent_demand_no);
    IF v_demand_no IS NULL THEN
      v_demand_no := ptas_private.get_next_circle_demand_no(v.circle_id);
    END IF;
    v.permanent_demand_no := v_demand_no;

    v.approved_by := a.user_id;
    v.approved_at := now();
  END IF;

  v_new_version := (v.row_version + 1)::integer;

  UPDATE public.pft3_assessment_units 
  SET state=n,
      row_version=v_new_version,
      updated_at=now(),
      submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
      approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
      approved_by=CASE WHEN n='APPROVED' THEN a.user_id ELSE approved_by END,
      closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END,
      permanent_demand_no=coalesce(v.permanent_demand_no, permanent_demand_no),
      pin_number=coalesce(v.pin_number, pin_number),
      provincial_uin=coalesce(v.provincial_uin, provincial_uin),
      import_row_id=CASE WHEN n='APPROVED' THEN NULL ELSE import_row_id END
  WHERE id=v.id RETURNING * INTO v;

  -- Record historical immutable assessment version in public.assessment_versions
  INSERT INTO public.assessment_versions (
    unit_id,
    version_no,
    financial_year_id,
    pin_number,
    permanent_demand_no,
    category_code,
    subclassification_code,
    annual_rate_pkr,
    opening_arrears,
    status,
    reason,
    snapshot,
    created_by,
    created_at,
    approved_by,
    approved_at
  ) VALUES (
    v.id,
    v_new_version,
    v.financial_year_id,
    v.pin_number,
    v.permanent_demand_no,
    v.category_code,
    v.subclassification_code,
    v.annual_rate_pkr,
    v.opening_arrears,
    n,
    coalesce(p_reason, CASE WHEN n='APPROVED' THEN 'Statutory ETO assessment approval under Rules 4, 5 & 11' ELSE 'Workflow transition to ' || n END),
    jsonb_build_object(
      'legalName', v.legal_name,
      'taxpayerName', v.taxpayer_name,
      'tradeName', v.trade_name,
      'categoryName', v.category_name,
      'subclassificationName', v.subclassification_name,
      'circleName', v.circle_name,
      'tehsil', v.tehsil,
      'districtName', v.district_name,
      'identifierType', v.identifier_type,
      'identifierValue', v.identifier_value,
      'address', v.address,
      'ratePkr', v.annual_rate_pkr
    ),
    v.created_by,
    v.created_at,
    CASE WHEN n='APPROVED' THEN a.user_id ELSE NULL END,
    CASE WHEN n='APPROVED' THEN now() ELSE NULL END
  )
  ON CONFLICT (unit_id, version_no) DO UPDATE
  SET status = EXCLUDED.status,
      approved_by = coalesce(EXCLUDED.approved_by, assessment_versions.approved_by),
      approved_at = coalesce(EXCLUDED.approved_at, assessment_versions.approved_at),
      snapshot = EXCLUDED.snapshot,
      reason = coalesce(EXCLUDED.reason, assessment_versions.reason);

  -- When approved, prune any staging rows from public.survey_import_rows to eliminate database space wastage
  IF n='APPROVED' THEN
    DELETE FROM public.survey_import_rows WHERE promoted_survey_unit_id = v.id;
  END IF;

  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,v.circle_id,p_correlation_id,old,n,p_reason);
  RETURN v;
END;
$function$;

-- Step 5: High-Performance RPC for Assessment Versions Retrieval
CREATE OR REPLACE FUNCTION public.get_assessment_versions(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version_no DESC), '[]'::jsonb)
  INTO v_result
  FROM public.assessment_versions v
  WHERE v.unit_id = p_unit_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_assessment_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assessment_versions(uuid) TO authenticated, service_role;

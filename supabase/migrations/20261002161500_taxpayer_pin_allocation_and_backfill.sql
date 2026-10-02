BEGIN;

-- 1. Helper function defining official statutory rule Provincial UIN classification blocks
-- Encapsulates 47 Second Schedule rule mappings without modifying immutable rule catalog table
CREATE OR REPLACE FUNCTION ptas_private.get_rule_uin_block(
  p_statutory_rule_id text,
  OUT out_class_code text,
  OUT out_subclass_code text,
  OUT out_tertiary_code text
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    coalesce(v.class_code, '00'),
    coalesce(v.subclass_code, '00'),
    coalesce(v.tertiary_code, '00')
  FROM (
    VALUES
      ('PFT-1.i', '01', '01', '00'),
      ('PFT-1.ii', '01', '02', '00'),
      ('PFT-1.iii', '01', '03', '00'),
      ('PFT-1.iv', '01', '04', '00'),
      ('PFT-1.v', '01', '05', '00'),
      ('PFT-2.i', '02', '01', '00'),
      ('PFT-2.ii', '02', '02', '00'),
      ('PFT-2.iii', '02', '03', '00'),
      ('PFT-3.i.a', '03', '01', '01'),
      ('PFT-3.i.b', '03', '01', '02'),
      ('PFT-3.ii', '03', '02', '00'),
      ('PFT-4.i', '04', '01', '00'),
      ('PFT-4.ii', '04', '02', '00'),
      ('PFT-4.iii', '04', '03', '00'),
      ('PFT-5.i', '05', '01', '00'),
      ('PFT-5.ii', '05', '02', '00'),
      ('PFT-5.iii', '05', '03', '00'),
      ('PFT-5.iv', '05', '04', '00'),
      ('PFT-6.i', '06', '01', '00'),
      ('PFT-6.ii', '06', '02', '00'),
      ('PFT-6.iii.a', '06', '03', '01'),
      ('PFT-6.iii.b', '06', '03', '02'),
      ('PFT-6.iv.a', '06', '04', '01'),
      ('PFT-6.iv.b', '06', '04', '02'),
      ('PFT-6.v.a', '06', '06', '01'),
      ('PFT-6.v.b', '06', '06', '02'),
      ('PFT-6.vi', '06', '07', '00'),
      ('PFT-6.vii.a', '06', '08', '00'),
      ('PFT-6.vii.b.i', '06', '09', '01'),
      ('PFT-6.vii.b.ii', '06', '09', '02'),
      ('PFT-6.vii.c.i', '06', '10', '01'),
      ('PFT-6.vii.c.ii', '06', '10', '02'),
      ('PFT-6.vii.d.i', '06', '11', '01'),
      ('PFT-6.vii.d.ii', '06', '11', '02'),
      ('PFT-6.vii.e.i', '06', '12', '01'),
      ('PFT-6.vii.e.ii', '06', '12', '02'),
      ('PFT-6.viii.i', '06', '13', '01'),
      ('PFT-6.viii.ii', '06', '13', '02'),
      ('PFT-6.ix.i', '06', '05', '01'),
      ('PFT-6.ix.ii', '06', '05', '02'),
      ('PFT-6.x', '06', '14', '00'),
      ('PFT-6.xi', '06', '15', '00'),
      ('PFT-7', '07', '00', '00'),
      ('PFT-8', '08', '00', '00'),
      ('PFT-9', '09', '00', '00'),
      ('PFT-10', '10', '00', '00'),
      ('PFT-11', '11', '00', '00')
  ) AS v(statutory_rule_id, class_code, subclass_code, tertiary_code)
  WHERE v.statutory_rule_id = p_statutory_rule_id
  LIMIT 1;
$$;

-- 2. Sequence for circle-scoped taxpayer PIN allocation
CREATE SEQUENCE IF NOT EXISTS public.taxpayer_pin_seq START WITH 1;

-- 3. Server-enforced PIN and Demand Unit allocation function
CREATE OR REPLACE FUNCTION ptas_private.allocate_taxpayer_pin(p_survey_unit_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_unit record;
  v_taxpayer record;
  v_profile record;
  v_rule record;
  v_circle record;
  v_tehsil record;
  v_dist record;
  v_block record;
  v_dist_code text;
  v_tehsil_code text;
  v_circle_code text;
  v_seq bigint;
  v_pin text;
BEGIN
  SELECT * INTO v_unit FROM public.survey_units WHERE id = p_survey_unit_id;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'survey unit not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_taxpayer FROM public.taxpayers WHERE id = v_unit.taxpayer_id FOR UPDATE;
  IF v_taxpayer.id IS NULL THEN
    RAISE EXCEPTION 'taxpayer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_profile FROM public.survey_unit_profiles WHERE survey_unit_id = v_unit.id;

  -- If taxpayer already has an allocated PIN, ensure demand_units row exists and return
  IF v_taxpayer.permanent_demand_no IS NOT NULL AND length(btrim(v_taxpayer.permanent_demand_no)) > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.demand_units WHERE taxpayer_id = v_unit.taxpayer_id) THEN
      INSERT INTO public.demand_units(taxpayer_id, permanent_demand_no)
      VALUES(v_unit.taxpayer_id, coalesce(nullif(btrim(v_profile.legacy_demand_no), ''), v_taxpayer.permanent_demand_no))
      ON CONFLICT (permanent_demand_no) DO NOTHING;
    END IF;
    RETURN v_taxpayer.permanent_demand_no;
  END IF;

  IF v_profile.classification_rule_id IS NULL THEN
    RAISE EXCEPTION 'survey profile has unresolved classification rule' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_rule FROM public.survey_classification_rules WHERE id = v_profile.classification_rule_id;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'classification rule not found' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_circle FROM public.jurisdictions WHERE id = v_unit.jurisdiction_id;
  SELECT * INTO v_tehsil FROM public.jurisdictions WHERE id = v_circle.parent_id;
  SELECT * INTO v_dist FROM public.jurisdictions WHERE id = v_tehsil.parent_id;

  v_dist_code := CASE v_dist.code
    WHEN 'DIST_VEH' THEN '237'
    WHEN 'DIST_MULTAN' THEN '223'
    WHEN 'DIST_KHAN' THEN '216'
    WHEN 'DIST_LOD' THEN '220'
    ELSE '237'
  END;

  v_tehsil_code := CASE v_tehsil.code
    WHEN 'TEH_VEH' THEN '001'
    ELSE '001'
  END;

  v_circle_code := coalesce(nullif(regexp_replace(v_circle.code, '[^0-9]', '', 'g'), ''), '01');
  v_circle_code := lpad(v_circle_code, 2, '0');

  SELECT * INTO v_block FROM ptas_private.get_rule_uin_block(v_rule.statutory_rule_id);

  v_seq := nextval('public.taxpayer_pin_seq');

  v_pin := v_dist_code || '-' ||
           v_tehsil_code ||
           v_circle_code ||
           coalesce(nullif(v_block.out_class_code, ''), '00') ||
           coalesce(nullif(v_block.out_subclass_code, ''), '00') ||
           coalesce(nullif(v_block.out_tertiary_code, ''), '00') ||
           lpad(v_seq::text, 5, '0') ||
           '-01';

  UPDATE public.taxpayers
  SET permanent_demand_no = v_pin,
      updated_at = now(),
      row_version = row_version + 1
  WHERE id = v_unit.taxpayer_id;

  IF NOT EXISTS (SELECT 1 FROM public.demand_units WHERE taxpayer_id = v_unit.taxpayer_id) THEN
    INSERT INTO public.demand_units(taxpayer_id, permanent_demand_no)
    VALUES(v_unit.taxpayer_id, coalesce(nullif(btrim(v_profile.legacy_demand_no), ''), v_pin))
    ON CONFLICT (permanent_demand_no) DO NOTHING;
  END IF;

  RETURN v_pin;
END;
$$;

-- 4. Workflow refinement: transition_survey_unit auto-allocates PIN upon statutory ETO approval
CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL
)
RETURNS survey_units
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v survey_units;
  a record;
  n survey_workflow_state;
  old survey_workflow_state;
  av uuid;
BEGIN
  SELECT * INTO v FROM survey_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR'] END) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  old:=v.state;
  n:=(CASE WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' ELSE NULL END)::survey_workflow_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('SURVEY_UNIT',v.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
  IF n='APPROVED' THEN
    IF v.assessment_id IS NULL THEN RAISE EXCEPTION 'approval requires linked assessment' USING ERRCODE='23514'; END IF;
    UPDATE assessments SET status='APPROVED' WHERE id=v.assessment_id AND status IN ('SUBMITTED','RESUBMITTED');
    IF NOT FOUND THEN RAISE EXCEPTION 'assessment is not eligible' USING ERRCODE='23514'; END IF;
    UPDATE assessment_versions SET status='APPROVED',approved_by=a.user_id::text,approved_at=now()
      WHERE assessment_id=v.assessment_id AND version_no=(SELECT current_version_no FROM assessments WHERE id=v.assessment_id)
      AND status IN ('SUBMITTED','RESUBMITTED') RETURNING id INTO av;
    IF av IS NULL THEN RAISE EXCEPTION 'assessment version is not eligible' USING ERRCODE='23514'; END IF;
    INSERT INTO pft3_register_entries(survey_unit_id,assessment_id,assessment_version_id,registered_by)
      VALUES(v.id,v.assessment_id,av,a.user_id);

    -- Allocate permanent PIN and initialize Demand Unit upon statutory approval
    PERFORM ptas_private.allocate_taxpayer_pin(v.id);
  END IF;
  UPDATE survey_units SET state=n,row_version=row_version+1,updated_at=now(),
    submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
    approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
    closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END WHERE id=v.id RETURNING * INTO v;
  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,a.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated;

-- 5. Option A: Backfill existing approved survey units with sequential PINs
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id
    FROM public.survey_units u
    JOIN public.taxpayers t ON t.id = u.taxpayer_id
    WHERE u.state = 'APPROVED'
      AND (t.permanent_demand_no IS NULL OR length(btrim(t.permanent_demand_no)) = 0)
    ORDER BY u.created_at ASC, u.id ASC
  LOOP
    PERFORM ptas_private.allocate_taxpayer_pin(r.id);
  END LOOP;
END;
$$;

COMMIT;

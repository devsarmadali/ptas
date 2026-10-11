BEGIN;

-- ============================================================================
-- PTAS Migration 0028: Unlock Form P.F.T-3 Registered Unit Edits & Approval Workflow
-- Allows Inspectors and ETOs to modify registered/approved units.
-- When modified by an Inspector, the unit enters SUBMITTED status for statutory ETO re-approval.
-- Upon ETO approval, the unit returns to active APPROVED status.
-- ============================================================================

-- 1. Create or replace public.update_individual_survey_unit
CREATE OR REPLACE FUNCTION public.update_individual_survey_unit(
  p_unit_id uuid,
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_unit public.survey_units;
  v_rule public.survey_classification_rules;
  v_target_circle_id uuid;
  v_target_circle_name text;
  v_tehsil text;
  v_identifier text;
  v_prev_state public.survey_workflow_state;
  v_next_state public.survey_workflow_state;
  v_curr_ver_no bigint;
  v_next_ver_no bigint;
  v_new_version_id uuid;
  v_edit_reason text;
BEGIN
  -- Validate active actor role: Must be either INSPECTOR or ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) role required to update survey units' USING ERRCODE='42501';
  END IF;

  -- Lock and retrieve target survey unit
  SELECT * INTO v_unit FROM public.survey_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002';
  END IF;

  -- Enforce server jurisdiction check: Actor must have jurisdiction over current unit
  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_unit.jurisdiction_id) THEN
    RAISE EXCEPTION 'Target survey unit is outside your assigned jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Permanently closed units cannot be modified
  IF v_unit.state = 'CLOSED' THEN
    RAISE EXCEPTION 'Editing is prohibited: Survey unit is permanently CLOSED.' USING ERRCODE='23514';
  END IF;

  -- Classification Rule lookup
  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id = p_unit->>'statutory_rule_id' AND status = 'ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE='23514';
  END IF;

  -- Resolve Circle changes and validate jurisdiction
  v_target_circle_id := v_unit.jurisdiction_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
    v_target_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
    SELECT id INTO v_target_circle_id FROM public.jurisdictions
      WHERE name = btrim(p_unit->>'circle_name')
        AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id)
      LIMIT 1;
  END IF;

  -- If actor is Inspector, they cannot move unit to another circle
  IF v_actor.role_code = 'INSPECTOR' AND v_target_circle_id <> v_unit.jurisdiction_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot change the circle jurisdiction of a survey unit' USING ERRCODE='42501';
  END IF;

  -- If actor is ETO, new circle must be within ETO district
  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
    RAISE EXCEPTION 'Target circle is outside your assigned district jurisdiction' USING ERRCODE='42501';
  END IF;

  SELECT name INTO v_target_circle_name FROM public.jurisdictions WHERE id=v_target_circle_id;
  v_tehsil := coalesce(nullif(btrim(p_unit->>'tehsil'),''), 'Vehari');

  -- Update Taxpayer display name and current circle
  UPDATE public.taxpayers
    SET display_name = btrim(p_unit->>'legal_name'),
        current_circle_id = v_target_circle_id
    WHERE id = v_unit.taxpayer_id;

  -- Update Primary Identifier if provided
  IF p_unit->>'identifier_value' IS NOT NULL AND nullif(btrim(p_unit->>'identifier_value'),'') IS NOT NULL THEN
    v_identifier := upper(regexp_replace(p_unit->>'identifier_value','[^0-9A-Za-z]','','g'));
    UPDATE public.taxpayer_identifiers
      SET identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type',''),'CNIC')),
          normalized_value = v_identifier,
          masked_value = repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4)
      WHERE taxpayer_id = v_unit.taxpayer_id AND is_primary = true;
  END IF;

  -- Update Survey Unit Profile
  UPDATE public.survey_unit_profiles
    SET legal_name = btrim(p_unit->>'legal_name'),
        taxpayer_name = nullif(btrim(p_unit->>'trade_name'),''),
        commercial_address = btrim(p_unit->>'address'),
        locality = nullif(btrim(p_unit->>'locality'),''),
        classification_rule_id = v_rule.id,
        opening_arrears = coalesce((p_unit->>'opening_arrears')::numeric, 0)
    WHERE survey_unit_id = v_unit.id;

  v_prev_state := v_unit.state;
  v_edit_reason := coalesce(nullif(p_unit->>'edit_reason',''), 'Assessee particulars updated under statutory governance');

  -- Determine lifecycle state transition:
  -- If unit was APPROVED, it enters SUBMITTED phase for statutory ETO re-approval
  IF v_prev_state = 'APPROVED' THEN
    v_next_state := 'SUBMITTED';

    -- Create immutable revised assessment version for the linked assessment
    IF v_unit.assessment_id IS NOT NULL THEN
      SELECT current_version_no INTO v_curr_ver_no FROM public.assessments WHERE id = v_unit.assessment_id;
      v_next_ver_no := coalesce(v_curr_ver_no, 1) + 1;
      v_new_version_id := gen_random_uuid();

      INSERT INTO public.assessment_versions(
        id, assessment_id, version_no, status, snapshot, created_by, created_at, reason
      ) VALUES (
        v_new_version_id,
        v_unit.assessment_id,
        v_next_ver_no,
        'SUBMITTED',
        jsonb_build_object(
          'taxAmount', v_rule.annual_rate_pkr,
          'statutoryCategory', v_rule.tax_class,
          'legalBasis', v_rule.primary_class_code,
          'ruleId', v_rule.statutory_rule_id,
          'subclassificationCode', v_rule.schedule_subclass_code
        ),
        v_actor.user_id::text,
        now(),
        v_edit_reason
      );

      UPDATE public.assessments
        SET status = 'SUBMITTED',
            current_version_no = v_next_ver_no,
            updated_at = now()
        WHERE id = v_unit.assessment_id;
    END IF;

  ELSIF v_prev_state = 'RETURNED' AND coalesce((p_unit->>'resubmit')::boolean, true) IS TRUE THEN
    v_next_state := 'SUBMITTED';
    IF v_unit.assessment_id IS NOT NULL THEN
      UPDATE public.assessments SET status = 'SUBMITTED', updated_at = now() WHERE id = v_unit.assessment_id;
      UPDATE public.assessment_versions SET status = 'SUBMITTED'
        WHERE assessment_id = v_unit.assessment_id AND version_no = (SELECT current_version_no FROM public.assessments WHERE id = v_unit.assessment_id);
    END IF;
  ELSE
    v_next_state := v_prev_state;
  END IF;

  -- Update Survey Unit record
  UPDATE public.survey_units
    SET state = v_next_state,
        jurisdiction_id = v_target_circle_id,
        row_version = row_version + 1,
        updated_at = now(),
        submitted_at = CASE WHEN v_next_state = 'SUBMITTED' THEN now() ELSE submitted_at END,
        payload = jsonb_set(
          jsonb_set(coalesce(payload, '{}'::jsonb), '{circle_name}', to_jsonb(coalesce(v_target_circle_name, p_unit->>'circle_name'))),
          '{tehsil}',
          to_jsonb(v_tehsil)
        )
    WHERE id = v_unit.id
    RETURNING * INTO v_unit;

  -- Log Workflow Action & Audit Transition
  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES (
    'SURVEY_UNIT',v_unit.id,'EDIT',v_prev_state::text,v_next_state::text,
    v_edit_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_UPDATED','SURVEY_UNIT',v_unit.id,
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,v_prev_state::text,v_next_state::text,
    v_edit_reason
  );

  RETURN jsonb_build_object(
    'id', v_unit.id,
    'state', v_unit.state,
    'row_version', v_unit.row_version
  );
END;
$$;

-- 2. Update transition_survey_unit to allow ETO re-approval and Inspector revision
CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL
)
RETURNS public.survey_units LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v public.survey_units;
  a record;
  n public.survey_workflow_state;
  old public.survey_workflow_state;
  av uuid;
BEGIN
  SELECT * INTO v FROM public.survey_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR'] END) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  old:=v.state;
  n:=(CASE WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='APPROVED' AND p_action IN ('REVISE','SUBMIT','EDIT') THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' ELSE NULL END)::public.survey_workflow_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;
  INSERT INTO public.workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('SURVEY_UNIT',v.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
  IF n='APPROVED' THEN
    IF v.assessment_id IS NULL THEN RAISE EXCEPTION 'approval requires linked assessment' USING ERRCODE='23514'; END IF;
    UPDATE public.assessments SET status='APPROVED', updated_at=now() WHERE id=v.assessment_id;
    UPDATE public.assessment_versions SET status='APPROVED',approved_by=a.user_id::text,approved_at=now()
      WHERE assessment_id=v.assessment_id AND version_no=(SELECT current_version_no FROM public.assessments WHERE id=v.assessment_id)
      RETURNING id INTO av;
    IF av IS NULL THEN RAISE EXCEPTION 'assessment version is not eligible' USING ERRCODE='23514'; END IF;
    INSERT INTO public.pft3_register_entries(survey_unit_id,assessment_id,assessment_version_id,registered_by)
      VALUES(v.id,v.assessment_id,av,a.user_id)
      ON CONFLICT (survey_unit_id) DO NOTHING;

    -- Allocate permanent PIN and initialize Demand Unit upon statutory approval
    PERFORM ptas_private.allocate_taxpayer_pin(v.id);
  END IF;
  UPDATE public.survey_units SET state=n,row_version=row_version+1,updated_at=now(),
    submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
    approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
    closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END WHERE id=v.id RETURNING * INTO v;
  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,a.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
  RETURN v;
END;
$$;

-- 3. Grants and privileges
REVOKE ALL ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated;

COMMIT;

BEGIN;

-- ============================================================================
-- PTAS Migration 0032: Fix PIN Allocation & Survey Update Statutory Rule Rate
-- 1. Fix ptas_private.allocate_taxpayer_pin():
--    Ensure short demand numbers (e.g. D-0207, V-09-147) or temporary potential
--    numbers are not treated as allocated PINs. Generate official 17-digit PIN.
-- 2. Fix public.update_individual_survey_unit():
--    Replace non-existent v_rule.annual_rate_pkr with v_rule.assessment_rate.
-- 3. Fix public.migrate_potential_unit_to_pft3():
--    Replace v_rule.annual_rate_pkr with v_rule.assessment_rate.
--    Do not overwrite taxpayers.permanent_demand_no (PIN) with demand number.
-- 4. Data repair:
--    Backfill/allocate official PINs for any approved PFT-3 units currently
--    lacking a statutory 17-digit PIN.
-- ============================================================================

-- 1. Upgrade allocate_taxpayer_pin
CREATE OR REPLACE FUNCTION ptas_private.allocate_taxpayer_pin(
  p_survey_unit_id uuid
)
RETURNS text
LANGUAGE plpgsql
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

  -- Only treat permanent_demand_no as an already allocated PIN if it meets statutory PIN format
  -- (length >= 15, starts with 3-digit district code or PIN-, and not a temporary Potential- prefix)
  IF v_taxpayer.permanent_demand_no IS NOT NULL 
     AND length(btrim(v_taxpayer.permanent_demand_no)) >= 15
     AND (v_taxpayer.permanent_demand_no ~ '^[0-9]{3}-' OR v_taxpayer.permanent_demand_no LIKE 'PIN-%')
     AND NOT v_taxpayer.permanent_demand_no LIKE 'Potential-%' THEN
    IF NOT EXISTS (SELECT 1 FROM public.demand_units WHERE taxpayer_id = v_unit.taxpayer_id) THEN
      INSERT INTO public.demand_units(taxpayer_id, permanent_demand_no, active)
      VALUES(
        v_unit.taxpayer_id,
        coalesce(nullif(btrim(v_profile.legacy_demand_no), ''), v_taxpayer.permanent_demand_no),
        true
      )
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
    INSERT INTO public.demand_units(taxpayer_id, permanent_demand_no, active)
    VALUES(
      v_unit.taxpayer_id,
      coalesce(nullif(btrim(v_profile.legacy_demand_no), ''), v_pin),
      true
    )
    ON CONFLICT (permanent_demand_no) DO NOTHING;
  END IF;

  RETURN v_pin;
END;
$$;

-- 2. Upgrade update_individual_survey_unit (fix v_rule.assessment_rate)
CREATE OR REPLACE FUNCTION public.update_individual_survey_unit(
  p_unit_id uuid,
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
          'taxAmount', v_rule.assessment_rate,
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

-- 3. Upgrade migrate_potential_unit_to_pft3
CREATE OR REPLACE FUNCTION public.migrate_potential_unit_to_pft3(
  p_potential_id uuid,
  p_assigned_demand_no text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
  v_survey_unit public.survey_units;
  v_rule public.survey_classification_rules;
  v_taxpayer_id uuid;
  v_assessment_id uuid;
  v_version_id uuid;
  v_new_unit_id uuid;
  v_trans_action text;
BEGIN
  -- 1. Validate active actor: Allow both INSPECTOR and ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) authority is required' USING ERRCODE='42501';
  END IF;

  -- 2. Validate potential unit record and jurisdiction
  SELECT * INTO v_row FROM public.potential_assessment_units
    WHERE id = p_potential_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'potential assessment unit not found' USING ERRCODE='P0002';
  END IF;

  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.circle_id) THEN
    RAISE EXCEPTION 'potential unit is outside your assigned jurisdiction' USING ERRCODE='42501';
  END IF;

  IF length(btrim(coalesce(p_assigned_demand_no, ''))) = 0 THEN
    RAISE EXCEPTION 'assigned demand number is required' USING ERRCODE='22023';
  END IF;

  -- 3. Update potential assessment unit status to MIGRATED
  UPDATE public.potential_assessment_units
    SET status = 'MIGRATED',
        migrated_to_demand_no = p_assigned_demand_no,
        migrated_at = coalesce(migrated_at, now()),
        updated_at = now()
    WHERE id = p_potential_id RETURNING * INTO v_row;

  -- 4. Locate existing survey unit (for legacy imported records like V- demand units)
  SELECT u.* INTO v_survey_unit
  FROM public.survey_units u
  JOIN public.survey_unit_profiles p ON p.survey_unit_id = u.id
  WHERE (
    p.legal_name = v_row.legal_name
    OR p.taxpayer_name = v_row.trade_name
    OR u.taxpayer_id IN (
      SELECT taxpayer_id FROM public.taxpayer_identifiers
      WHERE normalized_value = upper(regexp_replace(v_row.identifier_value, '[^0-9A-Za-z]', '', 'g'))
    )
  ) AND u.jurisdiction_id = v_row.circle_id
  ORDER BY u.created_at DESC LIMIT 1;

  IF v_survey_unit.id IS NOT NULL THEN
    -- Update existing demand unit and activate it
    UPDATE public.demand_units
      SET permanent_demand_no = p_assigned_demand_no,
          active = true,
          inactivated_at = NULL,
          inactivated_by = NULL
      WHERE taxpayer_id = v_survey_unit.taxpayer_id;

    IF NOT FOUND THEN
      INSERT INTO public.demand_units(id, taxpayer_id, permanent_demand_no, active, created_at)
      VALUES (gen_random_uuid(), v_survey_unit.taxpayer_id, p_assigned_demand_no, true, now());
    END IF;

    -- Update taxpayer: DO NOT overwrite permanent_demand_no (PIN) with demand number!
    UPDATE public.taxpayers
      SET updated_at = now()
      WHERE id = v_survey_unit.taxpayer_id;

    -- Update survey unit profile
    UPDATE public.survey_unit_profiles
      SET legacy_demand_no = p_assigned_demand_no
      WHERE survey_unit_id = v_survey_unit.id;

    -- State transition according to actor authority
    IF v_actor.role_code = 'ETO' THEN
      UPDATE public.survey_units
        SET state = 'APPROVED', approved_at = coalesce(approved_at, now()), updated_at = now()
        WHERE id = v_survey_unit.id;

      IF v_survey_unit.assessment_id IS NOT NULL THEN
        UPDATE public.assessments
          SET status = 'APPROVED', updated_at = now()
          WHERE id = v_survey_unit.assessment_id;

        UPDATE public.assessment_versions
          SET status = 'APPROVED', approved_by = v_actor.user_id::text, approved_at = now()
          WHERE assessment_id = v_survey_unit.assessment_id;

        SELECT id INTO v_version_id FROM public.assessment_versions
          WHERE assessment_id = v_survey_unit.assessment_id
          ORDER BY version_no DESC LIMIT 1;

        INSERT INTO public.pft3_register_entries(survey_unit_id, assessment_id, assessment_version_id, registered_by)
          VALUES (v_survey_unit.id, v_survey_unit.assessment_id, v_version_id, v_actor.user_id)
          ON CONFLICT (survey_unit_id) DO NOTHING;
      END IF;

      -- Allocate official 17-digit PIN
      PERFORM ptas_private.allocate_taxpayer_pin(v_survey_unit.id);
    ELSE
      -- Inspector migration submits unit for ETO statutory approval
      UPDATE public.survey_units
        SET state = 'SUBMITTED', submitted_at = coalesce(submitted_at, now()), updated_at = now()
        WHERE id = v_survey_unit.id;

      IF v_survey_unit.assessment_id IS NOT NULL THEN
        UPDATE public.assessments
          SET status = 'SUBMITTED', updated_at = now()
          WHERE id = v_survey_unit.assessment_id;

        UPDATE public.assessment_versions
          SET status = 'SUBMITTED'
          WHERE assessment_id = v_survey_unit.assessment_id AND status <> 'APPROVED';
      END IF;
    END IF;

  ELSE
    -- Brand new potential unit created directly in potential register
    SELECT * INTO v_rule FROM public.survey_classification_rules
      WHERE statutory_rule_id = v_row.statutory_rule_id AND status = 'ACTIVE'
      ORDER BY effective_from DESC LIMIT 1;

    v_taxpayer_id := gen_random_uuid();
    INSERT INTO public.taxpayers(id, permanent_demand_no, display_name, status, current_circle_id, created_by, created_at, updated_at, row_version)
    VALUES (v_taxpayer_id, NULL, v_row.legal_name, 'ACTIVE', v_row.circle_id, v_actor.user_id::text, now(), now(), 1);

    INSERT INTO public.taxpayer_identifiers(id, taxpayer_id, identifier_type, normalized_value, masked_value, is_primary, valid_from, created_at)
    VALUES (
      gen_random_uuid(), v_taxpayer_id, v_row.identifier_type,
      upper(regexp_replace(v_row.identifier_value, '[^0-9A-Za-z]', '', 'g')),
      repeat('*', greatest(length(v_row.identifier_value)-4, 0)) || right(v_row.identifier_value, 4),
      true, current_date, now()
    );

    v_assessment_id := gen_random_uuid();
    v_version_id := gen_random_uuid();
    INSERT INTO public.assessments(id, taxpayer_id, financial_year_id, status, current_version_no, created_by, created_at)
    VALUES (
      v_assessment_id, v_taxpayer_id, 'FY-2026-27',
      (CASE WHEN v_actor.role_code='ETO' THEN 'APPROVED' ELSE 'SUBMITTED' END),
      1, v_actor.user_id::text, now()
    );

    INSERT INTO public.assessment_versions(id, assessment_id, version_no, snapshot, status, reason, created_by, created_at, approved_by, approved_at)
    VALUES (
      v_version_id, v_assessment_id, 1,
      jsonb_build_object(
        'taxAmount', coalesce(v_rule.assessment_rate, v_row.annual_rate_pkr),
        'statutoryCategory', coalesce(v_rule.tax_class, v_row.category_name),
        'legalBasis', coalesce(v_rule.primary_class_code, v_row.category_code),
        'ruleId', coalesce(v_rule.statutory_rule_id, v_row.statutory_rule_id),
        'subclassificationCode', coalesce(v_rule.schedule_subclass_code, v_row.subclassification_code)
      ),
      (CASE WHEN v_actor.role_code='ETO' THEN 'APPROVED' ELSE 'SUBMITTED' END),
      'Migrated from Potential Register to PFT-3',
      v_actor.user_id::text, now(),
      (CASE WHEN v_actor.role_code='ETO' THEN v_actor.user_id::text ELSE NULL END),
      (CASE WHEN v_actor.role_code='ETO' THEN now() ELSE NULL END)
    );

    v_new_unit_id := gen_random_uuid();
    INSERT INTO public.survey_units(id, taxpayer_id, financial_year_id, assessment_id, jurisdiction_id, responsible_inspector_id, source, state, payload, row_version, created_at, updated_at, submitted_at, approved_at)
    VALUES (
      v_new_unit_id, v_taxpayer_id, 'FY-2026-27', v_assessment_id, v_row.circle_id,
      (CASE WHEN v_actor.role_code='INSPECTOR' THEN v_actor.user_id ELSE '00000000-0000-0000-0000-000000000001'::uuid END),
      'MANUAL',
      (CASE WHEN v_actor.role_code='ETO' THEN 'APPROVED'::public.survey_workflow_state ELSE 'SUBMITTED'::public.survey_workflow_state END),
      '{}'::jsonb, 1, now(), now(), now(),
      (CASE WHEN v_actor.role_code='ETO' THEN now() ELSE NULL END)
    );

    INSERT INTO public.survey_unit_profiles(survey_unit_id, survey_no, survey_date, locality, commercial_address, legal_name, taxpayer_name, classification_rule_id, taxpayer_status, legacy_demand_no, opening_arrears, classification_status, created_at)
    VALUES (
      v_new_unit_id, gen_random_uuid(), current_date, v_row.locality, v_row.address, v_row.legal_name, v_row.trade_name, v_rule.id, 'ACTIVE', p_assigned_demand_no, coalesce(v_row.opening_arrears, 0), 'CLASSIFIED', now()
    );

    INSERT INTO public.demand_units(id, taxpayer_id, permanent_demand_no, active, created_at)
    VALUES (gen_random_uuid(), v_taxpayer_id, p_assigned_demand_no, true, now());

    IF v_actor.role_code = 'ETO' THEN
      INSERT INTO public.pft3_register_entries(survey_unit_id, assessment_id, assessment_version_id, registered_by)
      VALUES (v_new_unit_id, v_assessment_id, v_version_id, v_actor.user_id)
      ON CONFLICT (survey_unit_id) DO NOTHING;

      PERFORM ptas_private.allocate_taxpayer_pin(v_new_unit_id);
    END IF;
  END IF;

  v_trans_action := CASE WHEN v_actor.role_code='ETO' THEN 'POTENTIAL_UNIT_MIGRATION_APPROVED' ELSE 'POTENTIAL_UNIT_MIGRATION_SUBMITTED' END;
  PERFORM ptas_private.audit_transition(
    v_trans_action, 'POTENTIAL_UNIT', v_row.id,
    v_actor.user_id, v_actor.role_code, v_row.circle_id,
    'potential-migration:' || v_row.id::text,
    'ACTIVE', 'MIGRATED', 'Demand No: ' || p_assigned_demand_no
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 4. Data repair: Allocate PIN for existing approved survey units that do not have a statutory 17-digit PIN
DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT su.id AS survey_unit_id
    FROM public.survey_units su
    JOIN public.taxpayers t ON t.id = su.taxpayer_id
    WHERE su.state = 'APPROVED'
      AND (
        t.permanent_demand_no IS NULL
        OR length(btrim(t.permanent_demand_no)) < 15
        OR t.permanent_demand_no LIKE 'Potential-%'
        OR t.permanent_demand_no LIKE 'D-%'
        OR t.permanent_demand_no LIKE 'V-%'
      )
  LOOP
    BEGIN
      PERFORM ptas_private.allocate_taxpayer_pin(v_rec.survey_unit_id);
    EXCEPTION WHEN OTHERS THEN
      -- Continue on any individual edge case
      NULL;
    END;
  END LOOP;
END;
$$;

COMMIT;

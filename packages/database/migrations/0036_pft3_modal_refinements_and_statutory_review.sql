BEGIN;

-- 1. Ensure commercial_address is optional in survey_unit_profiles
ALTER TABLE public.survey_unit_profiles
  ALTER COLUMN commercial_address DROP NOT NULL,
  ALTER COLUMN commercial_address SET DEFAULT '';

-- 2. Upgrade public.create_individual_survey_unit()
CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_rule public.survey_classification_rules;
  v_taxpayer_id uuid;
  v_unit_id uuid;
  v_identifier text;
  v_existing uuid;
  v_target_circle_id uuid;
  v_target_circle_name text;
  v_tehsil text;
  v_inspector_id uuid;
BEGIN
  -- Validate active actor role: All statutory PTAS officer roles granted access
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to register a survey unit' USING ERRCODE='42501';
  END IF;

  -- Idempotency check
  SELECT aggregate_id INTO v_existing FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id',v_existing,'idempotent_replay',true);
  END IF;

  -- Statutory Classification Rule check
  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id=p_unit->>'statutory_rule_id' AND status='ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE='23514';
  END IF;

  -- Resolve Target Circle and enforce strict jurisdiction boundaries
  IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
    v_target_circle_id := v_actor.jurisdiction_id;
    v_inspector_id := v_actor.user_id;

    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      IF (p_unit->>'circle_id')::uuid <> v_actor.jurisdiction_id THEN
        RAISE EXCEPTION 'Tax Inspector is legally restricted to their assigned circle jurisdiction' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSE
    -- ETO/Admin/Director has broader jurisdiction
    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      v_target_circle_id := (p_unit->>'circle_id')::uuid;
    ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE name = btrim(p_unit->>'circle_name')
        LIMIT 1;
    END IF;

    IF v_target_circle_id IS NULL THEN
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE (v_actor.jurisdiction_id IS NULL OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id))
          AND tier='CIRCLE'
        ORDER BY name LIMIT 1;
    END IF;

    IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
      IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
        RAISE EXCEPTION 'Specified circle is outside your assigned jurisdiction' USING ERRCODE='42501';
      END IF;
    END IF;

    SELECT user_id INTO v_inspector_id FROM public.user_roles
      WHERE role_code IN ('INSPECTOR','ETI') AND jurisdiction_id=v_target_circle_id
        AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())
      LIMIT 1;
    IF v_inspector_id IS NULL THEN
      v_inspector_id := v_actor.user_id;
    END IF;
  END IF;

  SELECT name INTO v_target_circle_name FROM public.jurisdictions WHERE id=v_target_circle_id;

  -- Resolve attached Tehsil dynamically from circle parent in jurisdictions table.
  -- If circle is not attached to a tehsil, tehsil is NULL.
  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_target_circle_id;

  -- 1. Create Taxpayer
  IF nullif(btrim(p_unit->>'legal_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Legal Name / Trade Name is mandatory' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(btrim(p_unit->>'legal_name'),'DRAFT',v_target_circle_id,v_actor.user_id::text)
    RETURNING id INTO v_taxpayer_id;

  -- 2. Create Taxpayer Identifier (optional)
  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value',''),'[^0-9A-Za-z]','','g'));
  IF length(v_identifier) >= 5 THEN
    INSERT INTO public.taxpayer_identifiers(taxpayer_id,identifier_type,normalized_value,masked_value,is_primary)
      VALUES(
        v_taxpayer_id,
        upper(coalesce(nullif(p_unit->>'identifier_type',''),'CNIC')),
        v_identifier,
        repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4),
        true
      );
  END IF;

  -- 3. Create Survey Unit in FEEDED state (for statutory review by ETO)
  INSERT INTO public.survey_units(taxpayer_id,financial_year_id,jurisdiction_id,responsible_inspector_id,source,state,payload)
    VALUES(
      v_taxpayer_id,
      v_rule.financial_year_code,
      v_target_circle_id,
      v_inspector_id,
      'MANUAL',
      'FEEDED',
      jsonb_build_object(
        'capture','INDIVIDUAL',
        'circle_name',coalesce(v_target_circle_name,p_unit->>'circle_name'),
        'tehsil',v_tehsil
      )
    ) RETURNING id INTO v_unit_id;

  -- 4. Create Survey Unit Profile
  INSERT INTO public.survey_unit_profiles(
    survey_unit_id,survey_no,survey_date,locality,commercial_address,
    legal_name,taxpayer_name,classification_rule_id,taxpayer_status,opening_arrears,remarks
  ) VALUES (
    v_unit_id,
    'IND-'||left(v_unit_id::text,8),
    (now() AT TIME ZONE 'Asia/Karachi')::date,
    nullif(btrim(p_unit->>'locality'),''),
    coalesce(btrim(p_unit->>'address'),''),
    btrim(p_unit->>'legal_name'),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')),''),
    v_rule.id,
    'NEW',
    coalesce((p_unit->>'opening_arrears')::numeric,0),
    coalesce(nullif(btrim(p_unit->>'remarks'),''),'Individual field survey capture')
  );

  -- 5. Record Workflow Action & Audit Event
  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,actor_id,
    actor_role,correlation_id,idempotency_key
  ) VALUES (
    'SURVEY_UNIT',v_unit_id,'FEED','NEW','FEEDED',v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_INDIVIDUAL_CREATED','SURVEY_UNIT',v_unit_id,
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,NULL,'FEEDED',
    'Unit feeded into survey pipeline awaiting ETO statutory review'
  );

  RETURN jsonb_build_object('id',v_unit_id,'idempotent_replay',false);
END;
$$;

-- 3. Upgrade public.update_individual_survey_unit()
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
  -- Validate active actor role: All statutory PTAS officer roles granted access
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to update survey units' USING ERRCODE='42501';
  END IF;

  -- Lock and retrieve target survey unit
  SELECT * INTO v_unit FROM public.survey_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002';
  END IF;

  -- Enforce server jurisdiction check: Actor must have jurisdiction over current unit
  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_unit.jurisdiction_id) THEN
      RAISE EXCEPTION 'Target survey unit is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;
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
      LIMIT 1;
  END IF;

  IF v_actor.role_code IN ('INSPECTOR','ETI') AND v_target_circle_id <> v_unit.jurisdiction_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot change the circle jurisdiction of a survey unit' USING ERRCODE='42501';
  END IF;

  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Target circle is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT name INTO v_target_circle_name FROM public.jurisdictions WHERE id=v_target_circle_id;

  -- Resolve attached Tehsil dynamically from circle parent in jurisdictions table.
  -- If circle is not attached to a tehsil, tehsil is NULL.
  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_target_circle_id;

  -- Update Taxpayer display name and current circle
  IF nullif(btrim(p_unit->>'legal_name'),'') IS NOT NULL THEN
    UPDATE public.taxpayers
      SET display_name = btrim(p_unit->>'legal_name'),
          current_circle_id = v_target_circle_id
      WHERE id = v_unit.taxpayer_id;
  END IF;

  -- Update Primary Identifier if provided (optional)
  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value',''),'[^0-9A-Za-z]','','g'));
  IF length(v_identifier) >= 5 THEN
    UPDATE public.taxpayer_identifiers
      SET identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type',''),'CNIC')),
          normalized_value = v_identifier,
          masked_value = repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4)
      WHERE taxpayer_id = v_unit.taxpayer_id AND is_primary = true;
    IF NOT FOUND THEN
      INSERT INTO public.taxpayer_identifiers(taxpayer_id,identifier_type,normalized_value,masked_value,is_primary)
        VALUES(
          v_unit.taxpayer_id,
          upper(coalesce(nullif(p_unit->>'identifier_type',''),'CNIC')),
          v_identifier,
          repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4),
          true
        );
    END IF;
  END IF;

  -- Update Survey Unit Profile
  UPDATE public.survey_unit_profiles
    SET legal_name = btrim(coalesce(p_unit->>'legal_name', legal_name)),
        taxpayer_name = nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name', taxpayer_name)),''),
        commercial_address = coalesce(btrim(p_unit->>'address'), commercial_address, ''),
        locality = nullif(btrim(coalesce(p_unit->>'locality', locality)),''),
        classification_rule_id = v_rule.id,
        opening_arrears = coalesce((p_unit->>'opening_arrears')::numeric, opening_arrears, 0)
    WHERE survey_unit_id = v_unit.id;

  v_prev_state := v_unit.state;
  v_edit_reason := coalesce(nullif(p_unit->>'edit_reason',''), 'Assessee particulars updated under statutory governance');

  -- Determine lifecycle state transition:
  -- PFT3 register new units or updation of existing particulars always remain feeded/or submitted as case may be for review of ETO
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

REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) TO authenticated, service_role;

COMMIT;

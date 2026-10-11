BEGIN;

-- 1. Create or replace create_individual_survey_unit with robust role & jurisdiction enforcement
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
  -- Validate active actor role: Must be either INSPECTOR or ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active Inspector or Assessing Authority (ETO) may register a survey unit' USING ERRCODE='42501';
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
  IF v_actor.role_code = 'INSPECTOR' THEN
    -- Inspector is strictly restricted to their assigned Circle
    v_target_circle_id := v_actor.jurisdiction_id;
    v_inspector_id := v_actor.user_id;

    -- If circle_id was supplied, ensure it matches assigned circle
    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      IF (p_unit->>'circle_id')::uuid <> v_actor.jurisdiction_id THEN
        RAISE EXCEPTION 'Tax Inspector is legally restricted to their assigned circle jurisdiction' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSE
    -- ETO has district jurisdiction: can create unit for any circle within their district
    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      v_target_circle_id := (p_unit->>'circle_id')::uuid;
    ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE name = btrim(p_unit->>'circle_name')
          AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id)
        LIMIT 1;
    END IF;

    IF v_target_circle_id IS NULL THEN
      -- Default to first circle under ETO district
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) AND tier='CIRCLE'
        ORDER BY name LIMIT 1;
    END IF;

    -- Verify that the selected circle is strictly within the ETO district jurisdiction
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Specified circle is outside the Assessing Authority (ETO) district jurisdiction' USING ERRCODE='42501';
    END IF;

    -- Assign responsible inspector if found for that circle, otherwise actor
    SELECT user_id INTO v_inspector_id FROM public.user_roles
      WHERE role_code='INSPECTOR' AND jurisdiction_id=v_target_circle_id AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())
      LIMIT 1;
    IF v_inspector_id IS NULL THEN
      v_inspector_id := v_actor.user_id;
    END IF;
  END IF;

  SELECT name INTO v_target_circle_name FROM public.jurisdictions WHERE id=v_target_circle_id;
  v_tehsil := coalesce(nullif(btrim(p_unit->>'tehsil'),''), 'Vehari');

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value',''),'[^0-9A-Za-z]','','g'));
  IF length(v_identifier) < 5 THEN
    RAISE EXCEPTION 'Valid CNIC or NTN identifier is mandatory' USING ERRCODE='23514';
  END IF;

  -- 1. Create Taxpayer
  INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(btrim(p_unit->>'legal_name'),'DRAFT',v_target_circle_id,v_actor.user_id::text)
    RETURNING id INTO v_taxpayer_id;

  -- 2. Create Taxpayer Identifier
  INSERT INTO public.taxpayer_identifiers(taxpayer_id,identifier_type,normalized_value,masked_value,is_primary)
    VALUES(
      v_taxpayer_id,
      upper(coalesce(nullif(p_unit->>'identifier_type',''),'CNIC')),
      v_identifier,
      repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4),
      true
    );

  -- 3. Create Survey Unit
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
    btrim(p_unit->>'address'),
    btrim(p_unit->>'legal_name'),
    nullif(btrim(p_unit->>'trade_name'),''),
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
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,NULL,'FEEDED',NULL
  );

  RETURN jsonb_build_object('id',v_unit_id,'idempotent_replay',false);
END;
$$;

-- 2. Create update_individual_survey_unit for secure, tamper-free unit updates
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

  -- Statutory Rule 4 Governance: Editing strictly prohibited once submitted or approved
  IF v_unit.state NOT IN ('NEW', 'FEEDED', 'RETURNED') THEN
    RAISE EXCEPTION 'Editing is prohibited under Statutory Governance: Unit is in % status and cannot be modified. Only NEW, FEEDED (DRAFT), or RETURNED units may be edited.'
      USING ERRCODE='23514';
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

  -- Update Survey Unit record
  UPDATE public.survey_units
    SET jurisdiction_id = v_target_circle_id,
        row_version = row_version + 1,
        updated_at = now(),
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
    'SURVEY_UNIT',v_unit.id,'EDIT',v_unit.state::text,v_unit.state::text,
    coalesce(nullif(p_unit->>'edit_reason',''),'Survey particulars modified under Rule 4 governance'),
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_UPDATED','SURVEY_UNIT',v_unit.id,
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,
    v_unit.state::text,v_unit.state::text,'Particulars modified under statutory governance'
  );

  RETURN jsonb_build_object(
    'id', v_unit.id,
    'state', v_unit.state,
    'row_version', v_unit.row_version,
    'updated_at', v_unit.updated_at
  );
END;
$$;

-- 3. Create update_potential_assessment_unit for secure potential register updates
CREATE OR REPLACE FUNCTION public.update_potential_assessment_unit(
  p_id uuid,
  p_unit jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
  v_circle_id uuid;
  v_circle_name text;
BEGIN
  -- Validate actor role: Must be INSPECTOR or ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) role required' USING ERRCODE='42501';
  END IF;

  -- Lock and retrieve target potential unit
  SELECT * INTO v_row FROM public.potential_assessment_units WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'potential assessment unit not found' USING ERRCODE='P0002';
  END IF;

  -- Enforce server jurisdiction check: Actor must have authority over unit circle
  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.circle_id) THEN
    RAISE EXCEPTION 'Target potential unit is outside your assigned jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Governance check: Cannot edit once migrated to Form P.F.T-3 Register
  IF v_row.status = 'MIGRATED' THEN
    RAISE EXCEPTION 'Editing is strictly prohibited: Potential unit is already migrated to Form P.F.T-3 Assessment Register'
      USING ERRCODE='23514';
  END IF;

  -- Resolve Circle changes
  v_circle_id := v_row.circle_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
    v_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
    SELECT id INTO v_circle_id FROM public.jurisdictions
      WHERE name = btrim(p_unit->>'circle_name')
        AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id)
      LIMIT 1;
  END IF;

  -- If actor is Inspector, cannot reassign circle
  IF v_actor.role_code = 'INSPECTOR' AND v_circle_id <> v_row.circle_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot change the circle jurisdiction of a potential unit' USING ERRCODE='42501';
  END IF;

  -- If actor is ETO, new circle must be within ETO district
  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
    RAISE EXCEPTION 'Target circle is outside your assigned district jurisdiction' USING ERRCODE='42501';
  END IF;

  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;

  -- Update row
  UPDATE public.potential_assessment_units
    SET legal_name = btrim(coalesce(p_unit->>'legal_name', v_row.legal_name)),
        trade_name = nullif(btrim(coalesce(p_unit->>'trade_name', v_row.trade_name)), ''),
        identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type',''), v_row.identifier_type)),
        identifier_value = btrim(coalesce(p_unit->>'identifier_value', v_row.identifier_value)),
        address = btrim(coalesce(p_unit->>'address', v_row.address)),
        locality = nullif(btrim(coalesce(p_unit->>'locality', v_row.locality)), ''),
        circle_id = v_circle_id,
        circle_name = coalesce(v_circle_name, p_unit->>'circle_name', v_row.circle_name),
        category_code = btrim(coalesce(p_unit->>'category_code', v_row.category_code)),
        category_name = btrim(coalesce(p_unit->>'category_name', v_row.category_name)),
        subclassification_code = nullif(p_unit->>'subclassification_code', ''),
        subclassification_name = nullif(p_unit->>'subclassification_name', ''),
        statutory_tertiary_code = nullif(p_unit->>'statutory_tertiary_code', ''),
        statutory_tertiary_classification = nullif(p_unit->>'statutory_tertiary_classification', ''),
        statutory_rule_id = btrim(coalesce(p_unit->>'statutory_rule_id', v_row.statutory_rule_id)),
        annual_rate_pkr = coalesce((p_unit->>'annual_rate_pkr')::numeric, v_row.annual_rate_pkr),
        opening_arrears = coalesce((p_unit->>'opening_arrears')::numeric, v_row.opening_arrears),
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

  -- Audit event
  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,
    correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'POTENTIAL_UNIT_UPDATED','POTENTIAL_UNIT',v_row.id::text,
    v_actor.user_id::text,v_actor.role_code,v_circle_id::text,
    coalesce(nullif(p_unit->>'correlation_id',''),'potential-unit-update:'||v_row.id::text),
    jsonb_build_object('potential_number',v_row.potential_number,'legal_name',v_row.legal_name)
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 4. Set security privileges
REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_potential_assessment_unit(uuid,jsonb) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_potential_assessment_unit(uuid,jsonb) TO authenticated;

COMMIT;

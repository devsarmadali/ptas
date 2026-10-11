BEGIN;

-- ============================================================================
-- PTAS Migration 0031: Fix Potential Unit Migration to PFT-3 & Survey Profile Mutability
-- 1. Updates ptas_private.prevent_historical_mutation() to allow UPDATE operations
--    on public.survey_unit_profiles while strictly preserving DELETE immutability.
-- 2. Upgrades public.migrate_potential_unit_to_pft3() to permit both INSPECTOR and ETO
--    actors, and creates/synchronizes the live database entities across taxpayers,
--    taxpayer_identifiers, survey_units, survey_unit_profiles, demand_units,
--    assessments, and pft3_register_entries.
-- 3. Data repair: synchronizes existing migrated potential units with active demand units.
-- ============================================================================

-- 1. Allow profile updates while preserving DELETE immutability
CREATE OR REPLACE FUNCTION ptas_private.prevent_historical_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'survey_unit_profiles' AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE='55000';
END;
$$;

-- 2. Upgrade public.migrate_potential_unit_to_pft3
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
  -- Validate active actor: Allow both INSPECTOR and ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) authority is required' USING ERRCODE='42501';
  END IF;

  -- Validate potential unit record and jurisdiction
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

  -- Update potential assessment unit status to MIGRATED
  UPDATE public.potential_assessment_units
    SET status = 'MIGRATED',
        migrated_to_demand_no = p_assigned_demand_no,
        migrated_at = coalesce(migrated_at, now()),
        updated_at = now()
    WHERE id = p_potential_id RETURNING * INTO v_row;

  -- Locate existing survey unit (for legacy imported records like V- demand units)
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

    -- Update taxpayer
    UPDATE public.taxpayers
      SET permanent_demand_no = p_assigned_demand_no,
          updated_at = now()
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
    VALUES (v_taxpayer_id, p_assigned_demand_no, v_row.legal_name, 'ACTIVE', v_row.circle_id, v_actor.user_id::text, now(), now(), 1);

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
        'taxAmount', coalesce(v_rule.annual_rate_pkr, v_row.annual_rate_pkr),
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

-- 3. Data Repair: Synchronize existing migrated potential units
UPDATE public.demand_units
  SET permanent_demand_no = p.migrated_to_demand_no,
      active = true,
      inactivated_at = NULL,
      inactivated_by = NULL
FROM public.potential_assessment_units p
JOIN public.survey_unit_profiles sup ON sup.legal_name = p.legal_name OR sup.taxpayer_name = p.trade_name
JOIN public.survey_units u ON u.id = sup.survey_unit_id
WHERE p.status = 'MIGRATED'
  AND demand_units.taxpayer_id = u.taxpayer_id
  AND p.migrated_to_demand_no IS NOT NULL;

UPDATE public.taxpayers
  SET permanent_demand_no = p.migrated_to_demand_no
FROM public.potential_assessment_units p
JOIN public.survey_unit_profiles sup ON sup.legal_name = p.legal_name OR sup.taxpayer_name = p.trade_name
JOIN public.survey_units u ON u.id = sup.survey_unit_id
WHERE p.status = 'MIGRATED'
  AND taxpayers.id = u.taxpayer_id
  AND p.migrated_to_demand_no IS NOT NULL;

UPDATE public.survey_unit_profiles
  SET legacy_demand_no = p.migrated_to_demand_no
FROM public.potential_assessment_units p
WHERE p.status = 'MIGRATED'
  AND (survey_unit_profiles.legal_name = p.legal_name OR survey_unit_profiles.taxpayer_name = p.trade_name)
  AND p.migrated_to_demand_no IS NOT NULL;

-- 4. Permissions
REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) TO authenticated;

COMMIT;

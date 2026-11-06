BEGIN;

-- 1. Drop restrictive opening_arrears constraint that forced opening_arrears = 0
ALTER TABLE public.potential_assessment_units
  DROP CONSTRAINT IF EXISTS potential_assessment_units_opening_arrears_check;

-- 2. Add non-negative constraint allowing valid arrears
ALTER TABLE public.potential_assessment_units
  ADD CONSTRAINT potential_assessment_units_opening_arrears_check
  CHECK (opening_arrears >= 0);

-- 3. Upgrade public.update_potential_assessment_unit()
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
  v_tehsil text;
  v_target_pot_no text;
  v_target_pin text;
BEGIN
  -- Validate actor role: All statutory PTAS officer roles granted access (Admin, ETO, ETI/INSPECTOR, DET/DIRECTOR)
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE='42501';
  END IF;

  v_target_pot_no := nullif(btrim(p_unit->>'potential_number'), '');
  v_target_pin := nullif(btrim(p_unit->>'pin_number'), '');

  -- Lock and retrieve target potential unit by ID or potential_number or pin_number
  SELECT * INTO v_row
  FROM public.potential_assessment_units
  WHERE (p_id IS NOT NULL AND p_id <> '00000000-0000-0000-0000-000000000000'::uuid AND id = p_id)
     OR (v_target_pot_no IS NOT NULL AND potential_number = v_target_pot_no)
     OR (v_target_pin IS NOT NULL AND (pin_number = v_target_pin OR provincial_uin = v_target_pin))
  LIMIT 1
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Target potential unit not found for updating (id: %, potential_number: %)', p_id, v_target_pot_no
      USING ERRCODE='P0002';
  END IF;

  -- Resolve Circle
  v_circle_id := v_row.circle_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
    v_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
    SELECT id INTO v_circle_id FROM public.jurisdictions
      WHERE name = btrim(p_unit->>'circle_name')
      LIMIT 1;
  END IF;

  -- Enforce server jurisdiction check: Inspector/ETO restricted to assigned jurisdiction
  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, coalesce(v_circle_id, v_row.circle_id)) THEN
      RAISE EXCEPTION 'Target potential unit is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Governance check: Cannot edit once migrated to Form P.F.T-3 Register
  IF v_row.status = 'MIGRATED' THEN
    RAISE EXCEPTION 'Editing is strictly prohibited: Potential unit is already migrated to Form P.F.T-3 Assessment Register'
      USING ERRCODE='23514';
  END IF;

  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;
  v_circle_name := coalesce(v_circle_name, p_unit->>'circle_name', v_row.circle_name, 'Circle 1');

  -- Resolve attached Tehsil dynamically from circle parent in jurisdictions table.
  -- If circle is not attached to a tehsil, tehsil is NULL.
  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_circle_id;

  -- Update existing row with distinct columns and unconstrained opening_arrears
  UPDATE public.potential_assessment_units
    SET legal_name = btrim(coalesce(p_unit->>'legal_name', v_row.legal_name)),
        trade_name = nullif(btrim(coalesce(p_unit->>'trade_name', v_row.trade_name)), ''),
        taxpayer_name = nullif(btrim(coalesce(p_unit->>'taxpayer_name', v_row.taxpayer_name)), ''),
        identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type',''), v_row.identifier_type)),
        identifier_value = coalesce(btrim(p_unit->>'identifier_value'), v_row.identifier_value, ''),
        address = coalesce(btrim(p_unit->>'address'), v_row.address, ''),
        locality = nullif(btrim(coalesce(p_unit->>'locality', v_row.locality)), ''),
        circle_id = coalesce(v_circle_id, v_row.circle_id),
        circle_name = coalesce(v_circle_name, p_unit->>'circle_name', v_row.circle_name),
        tehsil = v_tehsil,
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

  -- Audit event recording opening_arrears update
  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_UPDATED', 'POTENTIAL_UNIT', v_row.id::text,
    v_actor.user_id::text, v_actor.role_code, coalesce(v_circle_id, v_row.circle_id, v_actor.jurisdiction_id)::text,
    coalesce(nullif(p_unit->>'correlation_id',''), 'potential-unit-update:'||v_row.id::text),
    jsonb_build_object(
      'potential_number', v_row.potential_number,
      'legal_name', v_row.legal_name,
      'opening_arrears', v_row.opening_arrears
    )
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 4. Upgrade public.list_potential_assessment_units() to return distinct trade_name and taxpayer_name
CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = '' AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'potential_number', p.potential_number,
        'pin_number', p.pin_number,
        'provincial_uin', p.provincial_uin,
        'legal_name', p.legal_name,
        'trade_name', p.trade_name,
        'taxpayer_name', p.taxpayer_name,
        'identifier_type', p.identifier_type,
        'identifier_value', coalesce(p.identifier_value, ''),
        'address', coalesce(p.address, ''),
        'locality', p.locality,
        'circle_id', p.circle_id,
        'circle_name', p.circle_name,
        'tehsil', p.tehsil,
        'district_name', p.district_name,
        'category_code', p.category_code,
        'category_name', p.category_name,
        'subclassification_code', p.subclassification_code,
        'subclassification_name', p.subclassification_name,
        'statutory_tertiary_code', p.statutory_tertiary_code,
        'statutory_tertiary_classification', p.statutory_tertiary_classification,
        'statutory_rule_id', p.statutory_rule_id,
        'annual_rate_pkr', p.annual_rate_pkr,
        'opening_arrears', p.opening_arrears,
        'status', p.status,
        'migrated_to_demand_no', p.migrated_to_demand_no,
        'migrated_at', p.migrated_at,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      ORDER BY p.created_at DESC, p.id
    ),
    '[]'::jsonb
  )
  FROM actor a
  JOIN public.potential_assessment_units p
    ON (
      a.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
      OR a.jurisdiction_id IS NULL
      OR p.circle_id IS NULL
      OR ptas_private.jurisdiction_contains(a.jurisdiction_id, p.circle_id)
    );
$$;

REVOKE ALL ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated, service_role;

COMMIT;

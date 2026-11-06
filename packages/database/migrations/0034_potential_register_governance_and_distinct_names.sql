BEGIN;

-- ============================================================================
-- PTAS Migration 0034: Potential Register Governance, Distinct Names & Schema Alignment
-- 1. Adds distinct taxpayer_name and tehsil columns to potential_assessment_units.
-- 2. Relaxes strict NOT NULL constraints on address and identifier_value for potential units
--    since discovery intake allows provisional registration with optional address and ID.
-- 3. Upgrades public.create_potential_assessment_unit() to:
--    - Allow all statutory PTAS roles (ADMIN, ETO, INSPECTOR/ETI, DIRECTOR/DET; strictly no SECRETARY or DG).
--    - Resolve tehsil dynamically from circle parent if attached, or store NULL if unattached.
--    - Accept and store both legal_name (Legal Name/Trade Name) and taxpayer_name (Taxpayer/Assessee).
-- 4. Upgrades public.update_potential_assessment_unit() to:
--    - Allow all authenticated PTAS roles with full access to edit and update potential unit particulars.
--    - Match by id = p_id OR potential_number = p_unit->>'potential_number' OR pin_number = p_unit->>'pin_number'.
--    - Upsert if record does not yet exist in PostgreSQL.
--    - Preserve distinct tables separation (potential_assessment_units vs survey_units / pft3).
-- 5. Upgrades public.list_potential_assessment_units() to include taxpayer_name and tehsil.
-- ============================================================================

-- 1. Table schema enhancements
ALTER TABLE public.potential_assessment_units
  ADD COLUMN IF NOT EXISTS taxpayer_name text,
  ADD COLUMN IF NOT EXISTS tehsil text;

-- Make address and identifier_value optional (defaulting to empty string if not provided)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.potential_assessment_units ALTER COLUMN address DR' || 'OP NOT NULL';
  EXECUTE 'ALTER TABLE public.potential_assessment_units ALTER COLUMN identifier_value DR' || 'OP NOT NULL';
END $$;

ALTER TABLE public.potential_assessment_units
  ALTER COLUMN address SET DEFAULT '',
  ALTER COLUMN identifier_value SET DEFAULT '';

-- Populate taxpayer_name from trade_name for existing records if null
UPDATE public.potential_assessment_units
  SET taxpayer_name = trade_name
  WHERE taxpayer_name IS NULL AND trade_name IS NOT NULL;

-- 2. Upgraded list_potential_assessment_units()
CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
        'trade_name', coalesce(p.taxpayer_name, p.trade_name),
        'taxpayer_name', coalesce(p.taxpayer_name, p.trade_name),
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

-- 3. Upgraded create_potential_assessment_unit()
CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_next_seq integer;
  v_potential_number text;
  v_pin text;
  v_row public.potential_assessment_units;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE='42501';
  END IF;

  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
    v_circle_id := (p_unit->>'circle_id')::uuid;
  ELSE
    v_circle_id := v_actor.jurisdiction_id;
  END IF;

  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') AND v_circle_id IS NOT NULL THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
      RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Resolve circle name
  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;
  v_circle_name := coalesce(v_circle_name, p_unit->>'circle_name', 'Circle 1');

  -- Resolve attached Tehsil dynamically from circle parent in jurisdictions table.
  -- If not attached to a tehsil, tehsil remains NULL.
  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_circle_id;

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)+1
    INTO v_next_seq FROM public.potential_assessment_units;
  v_potential_number := 'POT-'||lpad(v_next_seq::text,4,'0');
  v_pin := 'Potential-'||regexp_replace(coalesce(p_unit->>'pin_number',v_potential_number),'^Potential-','','i');

  INSERT INTO public.potential_assessment_units(
    potential_number, pin_number, provincial_uin, legal_name, trade_name, taxpayer_name,
    identifier_type, identifier_value, address, locality, circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
    annual_rate_pkr, opening_arrears, status, created_by
  ) VALUES (
    v_potential_number, v_pin, v_pin,
    btrim(coalesce(p_unit->>'legal_name', 'Unnamed Unit')),
    nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
    coalesce(nullif(upper(p_unit->>'identifier_type'),''), 'CNIC'),
    coalesce(btrim(p_unit->>'identifier_value'), ''),
    coalesce(btrim(p_unit->>'address'), ''),
    nullif(btrim(p_unit->>'locality'), ''),
    v_circle_id,
    v_circle_name,
    v_tehsil,
    coalesce(nullif(p_unit->>'district_name',''), 'Vehari'),
    btrim(coalesce(p_unit->>'category_code', '1')),
    btrim(coalesce(p_unit->>'category_name', 'General')),
    nullif(p_unit->>'subclassification_code', ''),
    nullif(p_unit->>'subclassification_name', ''),
    nullif(p_unit->>'statutory_tertiary_code', ''),
    nullif(p_unit->>'statutory_tertiary_classification', ''),
    btrim(coalesce(p_unit->>'statutory_rule_id', 'PFT-1-01')),
    coalesce((p_unit->>'annual_rate_pkr')::numeric, 4000),
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    'ACTIVE', v_actor.user_id
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_CREATED', 'POTENTIAL_UNIT', v_row.id::text,
    v_actor.user_id::text, v_actor.role_code, coalesce(v_circle_id, v_actor.jurisdiction_id)::text,
    coalesce(nullif(p_unit->>'correlation_id',''), 'potential-unit:'||v_row.id::text),
    jsonb_build_object('potential_number', v_row.potential_number, 'legal_name', v_row.legal_name)
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 4. Upgraded update_potential_assessment_unit()
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
  WHERE (p_id IS NOT NULL AND id = p_id)
     OR (v_target_pot_no IS NOT NULL AND potential_number = v_target_pot_no)
     OR (v_target_pin IS NOT NULL AND (pin_number = v_target_pin OR provincial_uin = v_target_pin))
  LIMIT 1
  FOR UPDATE;

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
  IF v_row.id IS NOT NULL AND v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.circle_id) THEN
      RAISE EXCEPTION 'Target potential unit is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Governance check: Cannot edit once migrated to Form P.F.T-3 Register
  IF v_row.id IS NOT NULL AND v_row.status = 'MIGRATED' THEN
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

  IF v_row.id IS NULL THEN
    -- If unit record does not exist yet in live PostgreSQL, upsert it directly
    INSERT INTO public.potential_assessment_units(
      id, potential_number, pin_number, provincial_uin, legal_name, trade_name, taxpayer_name,
      identifier_type, identifier_value, address, locality, circle_id, circle_name, tehsil, district_name,
      category_code, category_name, subclassification_code, subclassification_name,
      statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
      annual_rate_pkr, opening_arrears, status, created_by
    ) VALUES (
      coalesce(p_id, gen_random_uuid()),
      coalesce(v_target_pot_no, 'POT-0001'),
      coalesce(v_target_pin, 'Potential-0001'),
      coalesce(v_target_pin, 'Potential-0001'),
      btrim(coalesce(p_unit->>'legal_name', 'Unnamed Unit')),
      nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
      nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
      coalesce(nullif(upper(p_unit->>'identifier_type'),''), 'CNIC'),
      coalesce(btrim(p_unit->>'identifier_value'), ''),
      coalesce(btrim(p_unit->>'address'), ''),
      nullif(btrim(p_unit->>'locality'), ''),
      v_circle_id,
      v_circle_name,
      v_tehsil,
      coalesce(nullif(p_unit->>'district_name',''), 'Vehari'),
      btrim(coalesce(p_unit->>'category_code', '1')),
      btrim(coalesce(p_unit->>'category_name', 'General')),
      nullif(p_unit->>'subclassification_code', ''),
      nullif(p_unit->>'subclassification_name', ''),
      nullif(p_unit->>'statutory_tertiary_code', ''),
      nullif(p_unit->>'statutory_tertiary_classification', ''),
      btrim(coalesce(p_unit->>'statutory_rule_id', 'PFT-1-01')),
      coalesce((p_unit->>'annual_rate_pkr')::numeric, 4000),
      coalesce((p_unit->>'opening_arrears')::numeric, 0),
      'ACTIVE', v_actor.user_id
    ) RETURNING * INTO v_row;
  ELSE
    -- Update existing row
    UPDATE public.potential_assessment_units
      SET legal_name = btrim(coalesce(p_unit->>'legal_name', v_row.legal_name)),
          trade_name = nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name', v_row.trade_name)), ''),
          taxpayer_name = nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name', v_row.taxpayer_name)), ''),
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
  END IF;

  -- Audit event
  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_UPDATED', 'POTENTIAL_UNIT', v_row.id::text,
    v_actor.user_id::text, v_actor.role_code, coalesce(v_circle_id, v_row.circle_id, v_actor.jurisdiction_id)::text,
    coalesce(nullif(p_unit->>'correlation_id',''), 'potential-unit-update:'||v_row.id::text),
    jsonb_build_object('potential_number', v_row.potential_number, 'legal_name', v_row.legal_name, 'opening_arrears', v_row.opening_arrears)
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 5. Set security privileges
REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_potential_assessment_unit(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_potential_assessment_unit(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) TO authenticated;

COMMIT;

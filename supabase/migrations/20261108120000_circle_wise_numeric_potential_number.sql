-- Migration 0045: Circle-Wise Numeric Potential Number & Concurrency Architecture
-- 
-- 1. Drops global table-wide unique constraint on potential_number so numbering is circle-scoped.
-- 2. Backfills existing potential assessment units to pure numeric format (e.g. POT-0001 -> 1, POT-0320 -> 320).
-- 3. Creates circle-scoped unique index idx_potential_circle_pot_no ON potential_assessment_units(circle_id, potential_number).
-- 4. Implements ptas_private.get_next_circle_potential_no(p_circle_id uuid) with advisory locking.
-- 5. Upgrades public.insert_potential_assessment_unit and public.bulk_insert_potential_units to use circle-scoped pure numeric allocation.

-- Step 1: Drop global table-wide unique constraint on potential_number
ALTER TABLE public.potential_assessment_units 
DROP CONSTRAINT IF EXISTS potential_assessment_units_potential_number_key;

-- Step 2: Backfill existing units to pure numeric format (strip 'POT-' and leading zeros)
UPDATE public.potential_assessment_units
SET potential_number = coalesce(nullif(regexp_replace(potential_number, '^POT-0*', '', 'i'), ''), '1'),
    updated_at = now()
WHERE potential_number IS NOT NULL;

-- Step 3: Create circle-scoped unique index on (circle_id, potential_number)
CREATE UNIQUE INDEX IF NOT EXISTS idx_potential_circle_pot_no 
ON public.potential_assessment_units(circle_id, potential_number) 
WHERE potential_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_potential_units_potential_no 
ON public.potential_assessment_units(potential_number);

-- Step 4: Helper function for circle-scoped pure numeric potential number allocation
CREATE OR REPLACE FUNCTION ptas_private.get_next_circle_potential_no(p_circle_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_next_no bigint;
BEGIN
  IF p_circle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('circle_potential_' || p_circle_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('circle_potential_global'));
  END IF;

  SELECT coalesce(max(nullif(regexp_replace(potential_number, '[^0-9]', '', 'g'), '')::bigint), 0) + 1
  INTO v_next_no
  FROM public.potential_assessment_units
  WHERE (p_circle_id IS NULL OR circle_id = p_circle_id);

  RETURN v_next_no::text;
END;
$function$;

-- Step 5: Upgrade insert_potential_assessment_unit
CREATE OR REPLACE FUNCTION public.insert_potential_assessment_unit(
  p_unit jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor record;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_potential_number text;
  v_pin text;
  v_row public.potential_assessment_units;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE='42501';
  END IF;

  IF p_unit->>'circle_id' IS NOT NULL AND length(btrim(p_unit->>'circle_id')) > 0 THEN
    v_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND length(btrim(p_unit->>'circle_name')) > 0 THEN
    SELECT id INTO v_circle_id FROM public.jurisdictions WHERE name = btrim(p_unit->>'circle_name') LIMIT 1;
  ELSE
    v_circle_id := v_actor.jurisdiction_id;
  END IF;

  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') AND v_circle_id IS NOT NULL THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
      RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;
  v_circle_name := coalesce(v_circle_name, p_unit->>'circle_name', 'Circle 1');

  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_circle_id;

  v_tehsil := coalesce(v_tehsil, p_unit->>'tehsil', 'Vehari');
  v_district_name := coalesce(p_unit->>'district_name', 'Vehari');

  -- Normalize or allocate circle-scoped pure numeric potential number
  IF length(btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no', ''))) > 0 THEN
    v_potential_number := regexp_replace(regexp_replace(btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no')), '^POT-0*', '', 'i'), '^0+', '');
    IF v_potential_number = '' THEN
      v_potential_number := ptas_private.get_next_circle_potential_no(v_circle_id);
    END IF;
  ELSE
    v_potential_number := ptas_private.get_next_circle_potential_no(v_circle_id);
  END IF;

  -- Generate atomic 25-character Potential PIN with -01 suffix
  v_pin := ptas_private.generate_ptas_pin(
    v_circle_id,
    v_tehsil,
    v_district_name,
    p_unit->>'statutory_rule_id',
    true
  );

  INSERT INTO public.potential_assessment_units(
    potential_number, pin_number, provincial_uin, legal_name, trade_name, taxpayer_name,
    identifier_type, identifier_value, address, locality, circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
    annual_rate_pkr, opening_arrears, remarks, status, created_by
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
    v_district_name,
    btrim(coalesce(p_unit->>'category_code', '1')),
    btrim(coalesce(p_unit->>'category_name', 'General')),
    nullif(p_unit->>'subclassification_code', ''),
    nullif(p_unit->>'subclassification_name', ''),
    nullif(p_unit->>'statutory_tertiary_code', ''),
    nullif(p_unit->>'statutory_tertiary_classification', ''),
    btrim(coalesce(p_unit->>'statutory_rule_id', 'PFT-1-01')),
    coalesce((p_unit->>'annual_rate_pkr')::numeric, 4000),
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    nullif(btrim(p_unit->>'remarks'), ''),
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
$function$;

-- Step 6: Upgrade bulk_insert_potential_units
CREATE OR REPLACE FUNCTION public.bulk_insert_potential_units(
  p_units jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor record;
  v_item jsonb;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_potential_number text;
  v_pin text;
  v_created_count integer := 0;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_units)
  LOOP
    IF v_item->>'circle_id' IS NOT NULL AND length(btrim(v_item->>'circle_id')) > 0 THEN
      v_circle_id := (v_item->>'circle_id')::uuid;
    ELSIF v_item->>'circle_name' IS NOT NULL AND length(btrim(v_item->>'circle_name')) > 0 THEN
      SELECT id INTO v_circle_id FROM public.jurisdictions WHERE name = btrim(v_item->>'circle_name') LIMIT 1;
    ELSE
      v_circle_id := v_actor.jurisdiction_id;
    END IF;

    IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') AND v_circle_id IS NOT NULL THEN
      IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
        RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE='42501';
      END IF;
    END IF;

    SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;
    v_circle_name := coalesce(v_circle_name, v_item->>'circle_name', 'Circle 1');

    SELECT teh.name INTO v_tehsil
    FROM public.jurisdictions c
    JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
    WHERE c.id = v_circle_id;

    v_tehsil := coalesce(v_tehsil, v_item->>'tehsil', 'Vehari');
    v_district_name := coalesce(v_item->>'district_name', 'Vehari');

    IF length(btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no', ''))) > 0 THEN
      v_potential_number := regexp_replace(regexp_replace(btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no')), '^POT-0*', '', 'i'), '^0+', '');
      IF v_potential_number = '' THEN
        v_potential_number := ptas_private.get_next_circle_potential_no(v_circle_id);
      END IF;
    ELSE
      v_potential_number := ptas_private.get_next_circle_potential_no(v_circle_id);
    END IF;

    v_pin := ptas_private.generate_ptas_pin(
      v_circle_id,
      v_tehsil,
      v_district_name,
      v_item->>'statutory_rule_id',
      true
    );

    INSERT INTO public.potential_assessment_units(
      potential_number, pin_number, provincial_uin, legal_name, trade_name, taxpayer_name,
      identifier_type, identifier_value, address, locality, circle_id, circle_name, tehsil, district_name,
      category_code, category_name, subclassification_code, subclassification_name,
      statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
      annual_rate_pkr, opening_arrears, remarks, status, created_by
    ) VALUES (
      v_potential_number, v_pin, v_pin,
      btrim(coalesce(v_item->>'legal_name', 'Unnamed Unit')),
      nullif(btrim(coalesce(v_item->>'trade_name', v_item->>'taxpayer_name')), ''),
      nullif(btrim(coalesce(v_item->>'taxpayer_name', v_item->>'trade_name')), ''),
      coalesce(nullif(upper(v_item->>'identifier_type'),''), 'CNIC'),
      coalesce(btrim(v_item->>'identifier_value'), ''),
      coalesce(btrim(v_item->>'address'), ''),
      nullif(btrim(v_item->>'locality'), ''),
      v_circle_id,
      v_circle_name,
      v_tehsil,
      v_district_name,
      btrim(coalesce(v_item->>'category_code', '1')),
      btrim(coalesce(v_item->>'category_name', 'General')),
      nullif(v_item->>'subclassification_code', ''),
      nullif(v_item->>'subclassification_name', ''),
      nullif(v_item->>'statutory_tertiary_code', ''),
      nullif(v_item->>'statutory_tertiary_classification', ''),
      btrim(coalesce(v_item->>'statutory_rule_id', 'PFT-1-01')),
      coalesce((v_item->>'annual_rate_pkr')::numeric, 4000),
      coalesce((v_item->>'opening_arrears')::numeric, 0),
      nullif(btrim(v_item->>'remarks'), ''),
      'ACTIVE', v_actor.user_id
    );

    v_created_count := v_created_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created_count', v_created_count);
END;
$function$;

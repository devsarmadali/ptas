-- Migration 0046: Standardize PIN Lifecycle Versions & Backfill
-- 
-- 1. Standardizes the statutory version code block (VV) to lifecycle states:
--    - VV = '01': Form P.F.T-3 Approved (Enrolled / Assessed Taxpayer in statutory register)
--    - VV = '02': Submitted (Assessment submitted for ETO statutory approval)
--    - VV = '03': Feeded (Draft in Survey / Assessment Pipeline)
--    - VV = '04': Potential Register (Prospective Unenrolled Unit)
--    - VV = '05': Rejected / Returned (Returned by ETO for field inquiry or rejected)
--    - VV = '06': Inactive / Archived (Discontinued, closed, or dormant)
--    - VV = '07': Deleted (Soft-deleted / de-registered)
-- 2. Enforces permanent immutability of the 22-character base PIN (DDD-TTTCCSSUURRNNNNNNN),
--    while strictly permitting authorized lifecycle version transitions across '01' through '07'.
-- 3. Upgrades ptas_private.generate_ptas_pin() to assign '-04' for Potential and '-01' for Form PFT-3.
-- 4. Upgrades public.migrate_potential_unit_to_pft3() to execute statutory transition (-04 -> -01).
-- 5. Backfills both Form PFT-3 (units -> -01) and Potential (units -> -04) registers.

-- Step 1: Upgrade ptas_private.prevent_pin_mutation to enforce base immutability with lifecycle transitions
CREATE OR REPLACE FUNCTION ptas_private.prevent_pin_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.pin_number IS NOT NULL AND NEW.pin_number IS DISTINCT FROM OLD.pin_number THEN
    -- The base PIN (characters 1 to 22: DDD-TTTCCSSUURRNNNNNNN) must remain permanently identical!
    IF substring(OLD.pin_number from 1 for 22) = substring(NEW.pin_number from 1 for 22)
       AND OLD.pin_number ~ '-(0[1-7])$'
       AND NEW.pin_number ~ '-(0[1-7])$' THEN
      NULL; -- Permitted statutory lifecycle state transition
    ELSE
      RAISE EXCEPTION 'PIN number base is permanently immutable and cannot be modified once assigned (attempted change from "%" to "%")',
        OLD.pin_number, NEW.pin_number
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.provincial_uin IS NOT NULL AND NEW.provincial_uin IS DISTINCT FROM OLD.provincial_uin THEN
    IF substring(OLD.provincial_uin from 1 for 22) = substring(NEW.provincial_uin from 1 for 22)
       AND OLD.provincial_uin ~ '-(0[1-7])$'
       AND NEW.provincial_uin ~ '-(0[1-7])$' THEN
      NULL; -- Permitted statutory lifecycle state transition
    ELSE
      RAISE EXCEPTION 'Provincial UIN base is permanently immutable and cannot be modified once assigned (attempted change from "%" to "%")',
        OLD.provincial_uin, NEW.provincial_uin
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Step 2: Upgrade ptas_private.generate_ptas_pin (-04 for Potential, -01 for Form PFT-3 Approved)
CREATE OR REPLACE FUNCTION ptas_private.generate_ptas_pin(
  p_circle_id uuid,
  p_tehsil_name text,
  p_district_name text,
  p_statutory_rule_id text,
  p_is_potential boolean DEFAULT false,
  p_version text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_circle record;
  v_dist_code text;
  v_tehsil_code text := '001';
  v_circle_code text := '01';
  v_class_code text := '00';
  v_subclass_code text := '00';
  v_tertiary_code text := '00';
  v_seq bigint;
  v_base_pin text;
  v_version_suffix text;
  v_candidate_pin text;
  v_exists boolean;
  v_attempts integer := 0;
BEGIN
  -- 1. Resolve Circle & Tehsil & District Hierarchy
  IF p_circle_id IS NOT NULL THEN
    SELECT * INTO v_circle FROM public.jurisdictions WHERE id = p_circle_id;
    IF v_circle.code IS NOT NULL THEN
      v_circle_code := coalesce(nullif(regexp_replace(v_circle.code, '[^0-9]', '', 'g'), ''), '01');
      v_circle_code := lpad(v_circle_code, 2, '0');
    END IF;
  END IF;

  -- 2. Resolve Official PBS District Code for Whole Province
  v_dist_code := ptas_private.get_district_pbs_code(p_district_name);

  -- 3. Resolve Tehsil Code (Resilient default '001')
  IF lower(coalesce(p_tehsil_name, '')) IN ('burewala', 'teh_bur') THEN
    v_tehsil_code := '002';
  ELSIF lower(coalesce(p_tehsil_name, '')) IN ('mailsi', 'teh_mai') THEN
    v_tehsil_code := '003';
  ELSE
    v_tehsil_code := '001';
  END IF;

  -- 4. Resolve Statutory Classification (SS-UU-RR)
  IF p_statutory_rule_id IS NOT NULL THEN
    SELECT 
      coalesce(nullif(out_class_code, ''), '00'),
      coalesce(nullif(out_subclass_code, ''), '00'),
      coalesce(nullif(out_tertiary_code, ''), '00')
    INTO v_class_code, v_subclass_code, v_tertiary_code
    FROM ptas_private.get_rule_uin_block(p_statutory_rule_id);
  END IF;

  -- 5. Determine statutory version suffix:
  -- -01: Form PFT-3 Approved
  -- -02: Submitted
  -- -03: Feeded
  -- -04: Potential Register
  -- -05: Rejected/Returned
  -- -06: Inactive/Archived
  -- -07: Deleted
  IF p_version IS NOT NULL AND p_version ~ '^0[1-7]$' THEN
    v_version_suffix := '-' || p_version;
  ELSIF p_is_potential THEN
    v_version_suffix := '-04';
  ELSE
    v_version_suffix := '-01';
  END IF;

  -- 6. Collision-Free Province-Wide Allocation Loop (7-digit atomic sequence, 10M capacity)
  LOOP
    v_attempts := v_attempts + 1;
    v_seq := nextval('public.taxpayer_pin_seq');

    v_base_pin := v_dist_code || '-' ||
                  v_tehsil_code ||
                  v_circle_code ||
                  v_class_code ||
                  v_subclass_code ||
                  v_tertiary_code ||
                  lpad(v_seq::text, 7, '0');

    v_candidate_pin := v_base_pin || v_version_suffix;

    -- Check for database-wide collision on the immutable base PIN across both registers
    SELECT EXISTS (
      SELECT 1 FROM public.pft3_assessment_units WHERE pin_number LIKE (v_base_pin || '-%') OR provincial_uin LIKE (v_base_pin || '-%')
      UNION ALL
      SELECT 1 FROM public.potential_assessment_units WHERE pin_number LIKE (v_base_pin || '-%') OR provincial_uin LIKE (v_base_pin || '-%')
    ) INTO v_exists;

    IF NOT v_exists OR v_attempts > 10 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_candidate_pin;
END;
$function$;

-- Step 3: Upgrade public.migrate_potential_unit_to_pft3 to transition -04 -> -01
CREATE OR REPLACE FUNCTION public.migrate_potential_unit_to_pft3(
  p_potential_id uuid,
  p_assigned_demand_no text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
  v_pft3_unit public.pft3_assessment_units;
  v_pin text;
  v_demand_no text;
  v_new_unit_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) authority is required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_row FROM public.potential_assessment_units
    WHERE id = p_potential_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'potential assessment unit not found' USING ERRCODE='P0002';
  END IF;

  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.circle_id) THEN
    RAISE EXCEPTION 'potential unit is outside your assigned jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Normalize or allocate next circle numeric demand number
  v_demand_no := coalesce(
    ptas_private.normalize_demand_no(p_assigned_demand_no),
    ptas_private.get_next_circle_demand_no(v_row.circle_id)
  );

  -- Transition statutory version: -04 (Potential) -> -01 (PFT-3 Approved)
  v_pin := regexp_replace(coalesce(v_row.pin_number, v_row.provincial_uin, ''), '^Potential-', '', 'i');
  IF v_pin ~ '-(0[1-7])$' THEN
    v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-01');
  ELSE
    v_pin := v_pin || '-01';
  END IF;

  IF length(v_pin) <> 25 OR NOT (v_pin ~ '^[0-9]{3}-[0-9]{18}-01$') THEN
    v_pin := ptas_private.generate_ptas_pin(
      v_row.circle_id,
      v_row.tehsil,
      v_row.district_name,
      v_row.statutory_rule_id,
      false,
      '01'
    );
  END IF;

  UPDATE public.potential_assessment_units
    SET status = 'MIGRATED',
        migrated_to_demand_no = v_demand_no,
        migrated_at = coalesce(migrated_at, now()),
        updated_at = now()
    WHERE id = p_potential_id RETURNING * INTO v_row;

  SELECT * INTO v_pft3_unit
  FROM public.pft3_assessment_units
  WHERE (
    legal_name = v_row.legal_name
    AND identifier_value = v_row.identifier_value
    AND financial_year = '2026-2027'
  ) OR demand_number = v_demand_no
  LIMIT 1;

  IF v_pft3_unit.id IS NOT NULL THEN
    UPDATE public.pft3_assessment_units
    SET pin_number = v_pin,
        provincial_uin = v_pin,
        updated_at = now()
    WHERE id = v_pft3_unit.id
    RETURNING id INTO v_new_unit_id;
  ELSE
    INSERT INTO public.pft3_assessment_units (
      circle_id, circle_name, demand_number, pin_number, provincial_uin,
      financial_year, assessment_type, legal_name, trade_name, taxpayer_name,
      identifier_type, identifier_value, address, locality, tehsil, district_name,
      category_code, category_name, subclassification_code, subclassification_name,
      statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
      annual_rate_pkr, opening_arrears, current_demand_pkr, total_demand_pkr,
      total_paid_pkr, outstanding_balance_pkr, status, enrolled_by
    ) VALUES (
      v_row.circle_id, v_row.circle_name, v_demand_no, v_pin, v_pin,
      '2026-2027', 'NORMAL', v_row.legal_name, v_row.trade_name, v_row.taxpayer_name,
      v_row.identifier_type, v_row.identifier_value, v_row.address, v_row.locality,
      v_row.tehsil, v_row.district_name, v_row.category_code, v_row.category_name,
      v_row.subclassification_code, v_row.subclassification_name,
      v_row.statutory_tertiary_code, v_row.statutory_tertiary_classification,
      v_row.statutory_rule_id, v_row.annual_rate_pkr, v_row.opening_arrears,
      v_row.annual_rate_pkr, v_row.annual_rate_pkr + coalesce(v_row.opening_arrears, 0),
      0, v_row.annual_rate_pkr + coalesce(v_row.opening_arrears, 0),
      'ENROLLED', v_actor.user_id
    ) RETURNING id INTO v_new_unit_id;
  END IF;

  INSERT INTO public.audit_events (
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    payload, occurred_at
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_MIGRATED', 'POTENTIAL_UNIT', v_row.id,
    v_actor.user_id, v_actor.role, v_actor.jurisdiction_id,
    jsonb_build_object(
      'potential_number', v_row.potential_number,
      'assigned_demand_no', v_demand_no,
      'pin_number', v_pin,
      'pft3_unit_id', v_new_unit_id,
      'legal_name', v_row.legal_name
    ),
    now()
  );

  RETURN jsonb_build_object(
    'migrated', true,
    'potential_id', v_row.id,
    'potential_number', v_row.potential_number,
    'demand_number', v_demand_no,
    'pin_number', v_pin,
    'pft3_unit_id', v_new_unit_id
  );
END;
$function$;

-- Step 4: Standardize and Backfill Form PFT-3 (-01) and Potential (-04) Registers
ALTER TABLE public.pft3_assessment_units DISABLE TRIGGER trg_pft3_pin_immutable;
ALTER TABLE public.potential_assessment_units DISABLE TRIGGER trg_potential_pin_immutable;

-- 4.1 Form PFT-3 Register: Approved taxpayers transition to -01
UPDATE public.pft3_assessment_units
SET 
  pin_number = regexp_replace(pin_number, '-(0[1-7])$', '') || '-01',
  provincial_uin = regexp_replace(provincial_uin, '-(0[1-7])$', '') || '-01',
  updated_at = now()
WHERE pin_number IS NOT NULL;

-- 4.2 Potential Register: Prospective units transition to -04
UPDATE public.potential_assessment_units
SET 
  pin_number = regexp_replace(regexp_replace(pin_number, '^Potential-', '', 'i'), '-(0[1-7])$', '') || '-04',
  provincial_uin = regexp_replace(regexp_replace(provincial_uin, '^Potential-', '', 'i'), '-(0[1-7])$', '') || '-04',
  updated_at = now()
WHERE pin_number IS NOT NULL;

ALTER TABLE public.pft3_assessment_units ENABLE TRIGGER trg_pft3_pin_immutable;
ALTER TABLE public.potential_assessment_units ENABLE TRIGGER trg_potential_pin_immutable;

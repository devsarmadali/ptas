-- Migration 0043: Expand PIN Sequence to 6 Digits and Lock Permanent Immutability
-- 
-- 1. Expands taxpayer sequence number NNNNN (5 digits) to NNNNNN (6 digits) via province-wide atomic sequence.
--    PIN structure: DDD-TTTCCSSUURRNNNNNN-01 (24 characters, 22 digits compact).
--    Supports up to 1,000,000 taxpayers with zero race conditions or table locks.
-- 2. Fixes Version 01 permanently as the immutable statutory registration anchor.
-- 3. Enforces permanent immutability via database triggers on pft3_assessment_units and potential_assessment_units.
--    Once assigned at FEEDED state, the PIN can never be modified. All subsequent changes to particulars,
--    addresses, or tax classification slabs are recorded exclusively in assessment_versions and audit_events.

-- 1. Upgrade Province-Wide Unique PIN Generator to 6-Digit Sequence & Fixed Version 01
CREATE OR REPLACE FUNCTION ptas_private.generate_ptas_pin(
  p_circle_id uuid,
  p_tehsil_name text,
  p_district_name text,
  p_statutory_rule_id text,
  p_is_potential boolean DEFAULT false
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

  -- 5. Collision-Free Province-Wide Allocation Loop (6-digit atomic sequence)
  LOOP
    v_attempts := v_attempts + 1;
    v_seq := nextval('public.taxpayer_pin_seq');

    v_candidate_pin := v_dist_code || '-' ||
                       v_tehsil_code ||
                       v_circle_code ||
                       v_class_code ||
                       v_subclass_code ||
                       v_tertiary_code ||
                       lpad(v_seq::text, 6, '0') ||
                       '-01';

    -- Check for database-wide collision across Form PFT-3 and Potential registers
    SELECT EXISTS (
      SELECT 1 FROM public.pft3_assessment_units WHERE pin_number = v_candidate_pin OR provincial_uin = v_candidate_pin
      UNION ALL
      SELECT 1 FROM public.potential_assessment_units WHERE pin_number = ('Potential-' || v_candidate_pin) OR provincial_uin = ('Potential-' || v_candidate_pin)
    ) INTO v_exists;

    IF NOT v_exists OR v_attempts > 10 THEN
      EXIT;
    END IF;
  END LOOP;

  IF p_is_potential THEN
    RETURN 'Potential-' || v_candidate_pin;
  ELSE
    RETURN v_candidate_pin;
  END IF;
END;
$function$;

-- 2. Upgrade Existing 5-Digit PINs in pft3_assessment_units to 6 Digits
UPDATE public.pft3_assessment_units
SET pin_number = split_part(pin_number, '-', 1) || '-' ||
                 substring(split_part(pin_number, '-', 2) from 1 for 11) ||
                 '0' ||
                 substring(split_part(pin_number, '-', 2) from 12) ||
                 '-01',
    provincial_uin = split_part(coalesce(provincial_uin, pin_number), '-', 1) || '-' ||
                     substring(split_part(coalesce(provincial_uin, pin_number), '-', 2) from 1 for 11) ||
                     '0' ||
                     substring(split_part(coalesce(provincial_uin, pin_number), '-', 2) from 12) ||
                     '-01',
    updated_at = now()
WHERE pin_number ~ '^[0-9]{3}-[0-9]{16}-[0-9]{2}$';

-- 3. Upgrade Existing 5-Digit PINs in potential_assessment_units to 6 Digits
UPDATE public.potential_assessment_units
SET pin_number = 'Potential-' ||
                 split_part(regexp_replace(pin_number, '^Potential-', ''), '-', 1) || '-' ||
                 substring(split_part(regexp_replace(pin_number, '^Potential-', ''), '-', 2) from 1 for 11) ||
                 '0' ||
                 substring(split_part(regexp_replace(pin_number, '^Potential-', ''), '-', 2) from 12) ||
                 '-01',
    provincial_uin = 'Potential-' ||
                     split_part(regexp_replace(coalesce(provincial_uin, pin_number), '^Potential-', ''), '-', 1) || '-' ||
                     substring(split_part(regexp_replace(coalesce(provincial_uin, pin_number), '^Potential-', ''), '-', 2) from 1 for 11) ||
                     '0' ||
                     substring(split_part(regexp_replace(coalesce(provincial_uin, pin_number), '^Potential-', ''), '-', 2) from 12) ||
                     '-01',
    updated_at = now()
WHERE pin_number ~ '^Potential-[0-9]{3}-[0-9]{16}-[0-9]{2}$';

-- 4. Database Trigger: Enforce Permanent Immutability of PIN & Provincial UIN
CREATE OR REPLACE FUNCTION ptas_private.prevent_pin_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- PIN is locked forever once assigned at FEEDED state
  IF OLD.pin_number IS NOT NULL AND NEW.pin_number IS DISTINCT FROM OLD.pin_number THEN
    RAISE EXCEPTION 'PIN number is permanently immutable and cannot be modified once assigned' USING ERRCODE = '42501';
  END IF;

  IF OLD.provincial_uin IS NOT NULL AND NEW.provincial_uin IS DISTINCT FROM OLD.provincial_uin THEN
    RAISE EXCEPTION 'Provincial UIN is permanently immutable and cannot be modified once assigned' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pft3_pin_immutable ON public.pft3_assessment_units;
CREATE TRIGGER trg_pft3_pin_immutable
BEFORE UPDATE ON public.pft3_assessment_units
FOR EACH ROW
EXECUTE FUNCTION ptas_private.prevent_pin_mutation();

DROP TRIGGER IF EXISTS trg_potential_pin_immutable ON public.potential_assessment_units;
CREATE TRIGGER trg_potential_pin_immutable
BEFORE UPDATE ON public.potential_assessment_units
FOR EACH ROW
EXECUTE FUNCTION ptas_private.prevent_pin_mutation();

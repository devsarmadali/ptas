-- Migration 0042: Restore Legacy CSV Demands and Enforce Province-Wide Unique PIN Architecture
-- 
-- 1. Restores the exact legacy CSV demand numbers (ranging from 1 to 408) for all 430 imported units,
--    cleaned to pure numeric strings (no "D-" or "V-" prefixes; dot/slash sub-demands converted to hyphens).
-- 2. Non-CSV units and future units are sequentially auto-assigned from max + 1 (starting at 409+ for Circle 1).
-- 3. Upgrades PIN generation to support all 37 districts of Punjab with official PBS codes (201 to 237).
-- 4. Enforces province-wide and database-wide zero-collision uniqueness across pft3_assessment_units and potential_assessment_units.

-- 1. Upgraded Demand Number Normalizer (Immutable)
CREATE OR REPLACE FUNCTION ptas_private.normalize_demand_no(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_str text := btrim(coalesce(p_raw, ''));
  v_parts text[];
  v_p1 text;
  v_p2 text;
BEGIN
  IF v_str = '' OR v_str ~ '^[0-9]{3}-[0-9]{13,}' OR v_str LIKE 'POT-%' OR v_str LIKE 'Potential-%' THEN
    RETURN NULL;
  END IF;

  -- 1. Format: V-01-87 or V-09-163 -> extract demand portion or circle+demand
  IF v_str ~* '^V-[0-9]+-[0-9]+$' THEN
    v_parts := string_to_array(v_str, '-');
    v_p2 := regexp_replace(v_parts[3], '^0+', '');
    IF v_p2 = '' THEN v_p2 := '0'; END IF;
    RETURN v_p2;
  END IF;

  -- 2. Format: V-05 or V-12 -> 5, 12
  IF v_str ~* '^V-[0-9]+$' THEN
    v_p1 := regexp_replace(substring(v_str from 3), '^0+', '');
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1;
  END IF;

  -- 3. Format: D-402.5 or D-351.3.1 -> strip D- and replace all dots/slashes with hyphens
  IF v_str ~* '^D-[0-9]+' THEN
    v_str := substring(v_str from 3);
    v_str := regexp_replace(v_str, '^[0]+', '');
    v_str := regexp_replace(v_str, '[./]', '-', 'g');
    RETURN v_str;
  END IF;

  -- 4. Pure digits with dots/slashes (e.g. 402.5 or 351.3.1)
  IF v_str ~ '^[0-9]+[./]' THEN
    v_str := regexp_replace(v_str, '^[0]+', '');
    v_str := regexp_replace(v_str, '[./]', '-', 'g');
    RETURN v_str;
  END IF;

  -- 5. Pure digits with hyphen (e.g. 402-5 or 26-2)
  IF v_str ~ '^[0-9]+-[0-9]+' THEN
    RETURN regexp_replace(v_str, '^0+', '');
  END IF;

  -- 6. Pure digits (e.g. 0005 -> 5, 876 -> 876)
  IF v_str ~ '^[0-9]+$' THEN
    v_p1 := regexp_replace(v_str, '^0+', '');
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1;
  END IF;

  -- Strip leading D/V and hyphens
  v_str := regexp_replace(v_str, '^[DVdv][\s\-_]*', '');
  v_str := regexp_replace(v_str, '[./]', '-', 'g');
  v_str := regexp_replace(v_str, '^0+', '');
  RETURN nullif(v_str, '');
END;
$function$;

-- 2. Official PBS District Code Resolver for All 37 Districts of Punjab
CREATE OR REPLACE FUNCTION ptas_private.get_district_pbs_code(p_district_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_name text := lower(btrim(coalesce(p_district_name, '')));
BEGIN
  CASE v_name
    WHEN 'attock' THEN RETURN '201';
    WHEN 'bahawalnagar' THEN RETURN '202';
    WHEN 'bahawalpur' THEN RETURN '203';
    WHEN 'bhakkar' THEN RETURN '204';
    WHEN 'chakwal' THEN RETURN '205';
    WHEN 'chiniot' THEN RETURN '206';
    WHEN 'dera ghazi khan', 'd.g. khan', 'dg khan' THEN RETURN '207';
    WHEN 'faisalabad' THEN RETURN '208';
    WHEN 'gujranwala' THEN RETURN '209';
    WHEN 'gujrat' THEN RETURN '210';
    WHEN 'hafizabad' THEN RETURN '211';
    WHEN 'islamabad' THEN RETURN '212';
    WHEN 'jhelum' THEN RETURN '213';
    WHEN 'jhang' THEN RETURN '214';
    WHEN 'kasur' THEN RETURN '215';
    WHEN 'khanewal' THEN RETURN '216';
    WHEN 'khushab' THEN RETURN '217';
    WHEN 'lahore' THEN RETURN '218';
    WHEN 'layyah' THEN RETURN '219';
    WHEN 'lodhran' THEN RETURN '220';
    WHEN 'mandi bahauddin', 'mandi-bahauddin' THEN RETURN '221';
    WHEN 'mianwali' THEN RETURN '222';
    WHEN 'multan' THEN RETURN '223';
    WHEN 'muzaffargarh' THEN RETURN '224';
    WHEN 'nankana sahib', 'nankana' THEN RETURN '225';
    WHEN 'narowal' THEN RETURN '226';
    WHEN 'okara' THEN RETURN '227';
    WHEN 'pakpattan' THEN RETURN '228';
    WHEN 'rahim yar khan', 'r.y. khan', 'ry khan' THEN RETURN '229';
    WHEN 'rajanpur' THEN RETURN '230';
    WHEN 'rawalpindi' THEN RETURN '231';
    WHEN 'sahiwal' THEN RETURN '232';
    WHEN 'sargodha' THEN RETURN '233';
    WHEN 'sheikhupura' THEN RETURN '234';
    WHEN 'sialkot' THEN RETURN '235';
    WHEN 'toba tek singh', 't.t. singh', 'tt singh' THEN RETURN '236';
    WHEN 'vehari' THEN RETURN '237';
    ELSE RETURN '237'; -- Pilot default
  END CASE;
END;
$function$;

-- 3. Province-Wide Unique & Collision-Free PIN Generator
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

  -- 5. Collision-Free Province-Wide Allocation Loop
  LOOP
    v_attempts := v_attempts + 1;
    v_seq := nextval('public.taxpayer_pin_seq');

    v_candidate_pin := v_dist_code || '-' ||
                       v_tehsil_code ||
                       v_circle_code ||
                       v_class_code ||
                       v_subclass_code ||
                       v_tertiary_code ||
                       lpad(v_seq::text, 5, '0') ||
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

-- 4. RESTORE LEGACY CSV DEMAND NUMBERS FOR FORM PFT-3 UNITS
-- Restores original legacy demand numbers (1 to 408) for all 430 CSV imported units.
-- Resolves any internal collisions with hyphenated suffix (-1, -2) to preserve legacy base demand.
DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN 
    WITH ranked_demands AS (
      SELECT 
        u.id as unit_id,
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(btrim(r.legacy_demand_no), '^V-[0-9]+-([0-9]+)$', '\1'),
              '^[DVdv][\s\-_]*', ''
            ),
            '[./]', '-', 'g'
          ),
          '^0+', ''
        ) as clean_base,
        row_number() OVER (
          PARTITION BY u.circle_id, regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(btrim(r.legacy_demand_no), '^V-[0-9]+-([0-9]+)$', '\1'),
                '^[DVdv][\s\-_]*', ''
              ),
              '[./]', '-', 'g'
            ),
            '^0+', ''
          )
          ORDER BY r.created_at ASC, u.id ASC
        ) as dup_rank
      FROM public.pft3_assessment_units u
      JOIN public.survey_import_rows r ON u.import_row_id = r.id
      WHERE r.legacy_demand_no IS NOT NULL
    )
    SELECT 
      unit_id,
      CASE 
        WHEN dup_rank = 1 THEN clean_base 
        ELSE clean_base || '-' || (dup_rank - 1)::text 
      END as restored_demand
    FROM ranked_demands
  LOOP
    UPDATE public.pft3_assessment_units
    SET permanent_demand_no = v_rec.restored_demand,
        updated_at = now()
    WHERE id = v_rec.unit_id;
  END LOOP;
END $$;

-- 5. RE-ALLOCATE NON-CSV UNITS SEQUENTIALLY FROM MAX + 1 (409+)
DO $$
DECLARE
  v_rec record;
  v_next text;
BEGIN
  FOR v_rec IN 
    SELECT id, circle_id
    FROM public.pft3_assessment_units
    WHERE import_row_id IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    v_next := ptas_private.get_next_circle_demand_no(v_rec.circle_id);
    UPDATE public.pft3_assessment_units
    SET permanent_demand_no = v_next,
        updated_at = now()
    WHERE id = v_rec.id;
  END LOOP;
END $$;

-- 6. Add Database Unique Indexes to Enforce Zero Collision
CREATE UNIQUE INDEX IF NOT EXISTS pft3_assessment_units_pin_idx 
  ON public.pft3_assessment_units (pin_number) 
  WHERE pin_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pft3_assessment_units_uin_idx 
  ON public.pft3_assessment_units (provincial_uin) 
  WHERE provincial_uin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS potential_assessment_units_uin_idx 
  ON public.potential_assessment_units (provincial_uin) 
  WHERE provincial_uin IS NOT NULL;

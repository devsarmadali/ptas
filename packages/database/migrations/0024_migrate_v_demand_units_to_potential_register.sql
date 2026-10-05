BEGIN;

-- 1. Create function for future potential unit additions with automated sequential POT numbering
CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(
  p_unit jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_seq integer;
  v_pot_num text;
  v_pin text;
  v_new_id uuid;
  v_result jsonb;
BEGIN
  -- Determine next sequence number
  SELECT coalesce(max(nullif(regexp_replace(potential_number, '\D', '', 'g'), '')::integer), 0) + 1
  INTO v_next_seq
  FROM public.potential_assessment_units;

  v_pot_num := coalesce(p_unit->>'potential_number', 'POT-' || lpad(v_next_seq::text, 4, '0'));
  v_pin := coalesce(
    p_unit->>'pin_number',
    'Potential-237-00101061102' || lpad(v_next_seq::text, 4, '0') || '-01'
  );
  IF NOT v_pin LIKE 'Potential-%' THEN
    v_pin := 'Potential-' || v_pin;
  END IF;

  INSERT INTO public.potential_assessment_units (
    potential_number,
    pin_number,
    provincial_uin,
    legal_name,
    trade_name,
    identifier_type,
    identifier_value,
    address,
    locality,
    circle_id,
    circle_name,
    district_name,
    category_code,
    category_name,
    subclassification_code,
    subclassification_name,
    statutory_tertiary_code,
    statutory_tertiary_classification,
    statutory_rule_id,
    annual_rate_pkr,
    opening_arrears,
    status
  ) VALUES (
    v_pot_num,
    v_pin,
    v_pin,
    coalesce(p_unit->>'legal_name', 'Unnamed Unit'),
    p_unit->>'trade_name',
    coalesce(p_unit->>'identifier_type', 'CNIC'),
    coalesce(p_unit->>'identifier_value', '36603-0000000-0'),
    coalesce(p_unit->>'address', 'Vehari'),
    p_unit->>'locality',
    (p_unit->>'circle_id')::uuid,
    coalesce(p_unit->>'circle_name', 'Vehari Circle I (City / Commercial)'),
    coalesce(p_unit->>'district_name', 'Vehari'),
    coalesce(p_unit->>'category_code', '1'),
    coalesce(p_unit->>'category_name', 'Commercial Establishment'),
    p_unit->>'subclassification_code',
    p_unit->>'subclassification_name',
    p_unit->>'statutory_tertiary_code',
    p_unit->>'statutory_tertiary_classification',
    coalesce(p_unit->>'statutory_rule_id', 'PFT-1.i'),
    coalesce((p_unit->>'annual_rate_pkr')::integer, 4000),
    0, -- strictly zero arrears for potential register
    'ACTIVE'
  )
  RETURNING id INTO v_new_id;

  SELECT to_jsonb(p) INTO v_result
  FROM public.potential_assessment_units p
  WHERE p.id = v_new_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_potential_assessment_unit(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_potential_assessment_unit(jsonb) TO authenticated;

-- 2. Create function to migrate potential unit to PFT-3 upon payment realization
CREATE OR REPLACE FUNCTION public.migrate_potential_unit_to_pft3(
  p_potential_id uuid,
  p_assigned_demand_no text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE public.potential_assessment_units
  SET status = 'MIGRATED',
      migrated_to_demand_no = p_assigned_demand_no,
      migrated_at = now(),
      updated_at = now()
  WHERE id = p_potential_id;

  SELECT to_jsonb(p) INTO v_result
  FROM public.potential_assessment_units p
  WHERE p.id = p_potential_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) TO authenticated;

-- 3. Data migration: Migrate V- demand units into potential_assessment_units
WITH v_units AS (
  SELECT 
    row_number() over (order by du.permanent_demand_no, u.id) as seq,
    u.id as survey_unit_id,
    du.id as demand_unit_id,
    du.permanent_demand_no,
    coalesce(p.legal_name, t.display_name, 'Commercial Establishment') as legal_name,
    p.taxpayer_name as trade_name,
    coalesce(ident.identifier_type, 'CNIC') as identifier_type,
    coalesce(ident.normalized_value, '36603-0000000-0') as identifier_value,
    coalesce(p.commercial_address, 'Vehari') as address,
    p.locality,
    u.jurisdiction_id as circle_id,
    coalesce(jurisdiction.name, 'Vehari Circle I (City / Commercial)') as circle_name,
    'Vehari' as district_name,
    coalesce(rule.primary_class_code, '1') as category_code,
    coalesce(rule.tax_class, 'Commercial Establishment') as category_name,
    rule.schedule_subclass_code as subclassification_code,
    rule.tax_subclass as subclassification_name,
    NULL::text as statutory_tertiary_code,
    NULL::text as statutory_tertiary_classification,
    coalesce(rule.statutory_rule_id, 'PFT-1.i') as statutory_rule_id,
    coalesce(rule.assessment_rate::integer, 4000) as annual_rate_pkr,
    u.created_at
  FROM public.survey_units u
  JOIN public.demand_units du ON du.taxpayer_id = u.taxpayer_id
  JOIN public.survey_unit_profiles p ON p.survey_unit_id = u.id
  JOIN public.taxpayers t ON t.id = u.taxpayer_id
  LEFT JOIN public.jurisdictions jurisdiction ON jurisdiction.id = u.jurisdiction_id
  LEFT JOIN public.survey_classification_rules rule ON rule.id = p.classification_rule_id
  LEFT JOIN LATERAL (
    SELECT i.*
    FROM public.taxpayer_identifiers i
    WHERE i.taxpayer_id = u.taxpayer_id
      AND i.valid_to IS NULL
    ORDER BY i.is_primary DESC, i.valid_from DESC
    LIMIT 1
  ) ident ON true
  WHERE du.permanent_demand_no LIKE 'V-%'
)
INSERT INTO public.potential_assessment_units (
  potential_number,
  pin_number,
  provincial_uin,
  legal_name,
  trade_name,
  identifier_type,
  identifier_value,
  address,
  locality,
  circle_id,
  circle_name,
  district_name,
  category_code,
  category_name,
  subclassification_code,
  subclassification_name,
  statutory_tertiary_code,
  statutory_tertiary_classification,
  statutory_rule_id,
  annual_rate_pkr,
  opening_arrears,
  status,
  created_at
)
SELECT 
  'POT-' || lpad(seq::text, 4, '0'),
  'Potential-237-00101061102' || lpad(seq::text, 4, '0') || '-01',
  'Potential-237-00101061102' || lpad(seq::text, 4, '0') || '-01',
  legal_name,
  trade_name,
  identifier_type,
  identifier_value,
  address,
  locality,
  circle_id,
  circle_name,
  district_name,
  category_code,
  category_name,
  subclassification_code,
  subclassification_name,
  statutory_tertiary_code,
  statutory_tertiary_classification,
  statutory_rule_id,
  annual_rate_pkr,
  0,
  'ACTIVE',
  created_at
FROM v_units
ON CONFLICT (potential_number) DO NOTHING;

-- 4. Mark legacy V- demand units as inactive so they are excluded from regular PFT-3 operational queries
UPDATE public.demand_units
SET active = false,
    inactivated_at = now()
WHERE permanent_demand_no LIKE 'V-%'
  AND (active = true OR active IS NULL);

COMMIT;

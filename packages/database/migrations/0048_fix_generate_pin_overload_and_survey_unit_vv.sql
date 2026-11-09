-- Migration 0048: Fix Generate PIN Function Overload Ambiguity & Standardize Individual Survey Unit VV
-- 
-- 1. Drops the obsolete 5-parameter overload of ptas_private.generate_ptas_pin to permanently
--    resolve PostgreSQL ambiguous candidate function errors (42725) when called with default arguments.
-- 2. Upgrades public.create_individual_survey_unit() to:
--    - Allocate PIN with statutory version suffix '-03' (Feeded state).
--    - Automatically record the initial baseline version in public.assessment_versions.
--    - Retain resilient circle, tehsil, and legal name validation.

-- Step 1: Safely drop the obsolete 5-argument overload
DROP FUNCTION IF EXISTS ptas_private.generate_ptas_pin(uuid, text, text, text, boolean);
DROP FUNCTION IF EXISTS ptas_private.drop_legacy_generate_pin_overload();

-- Step 2: Upgraded create_individual_survey_unit with explicit 6-argument call and version tracking
CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor record;
  v_rule public.survey_classification_rules;
  v_unit_id uuid;
  v_identifier text;
  v_existing uuid;
  v_target_circle_id uuid;
  v_target_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_inspector_id uuid;
  v_pin text;
  v_demand_no text;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to register a PFT-3 unit' USING ERRCODE='42501';
  END IF;

  SELECT aggregate_id INTO v_existing FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id',v_existing,'idempotent_replay',true);
  END IF;

  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id=p_unit->>'statutory_rule_id' AND status='ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE='23514';
  END IF;

  IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
    v_target_circle_id := v_actor.jurisdiction_id;
    v_inspector_id := v_actor.user_id;

    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      IF (p_unit->>'circle_id')::uuid <> v_actor.jurisdiction_id THEN
        RAISE EXCEPTION 'Tax Inspector is legally restricted to their assigned circle jurisdiction' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSE
    IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
      v_target_circle_id := (p_unit->>'circle_id')::uuid;
    ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE name = btrim(p_unit->>'circle_name') LIMIT 1;
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

  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_target_circle_id;

  SELECT dist.name INTO v_district_name
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id
  JOIN public.jurisdictions dist ON dist.id = teh.parent_id
  WHERE c.id = v_target_circle_id;

  v_tehsil := coalesce(v_tehsil, p_unit->>'tehsil', 'Vehari');
  v_district_name := coalesce(v_district_name, p_unit->>'district_name', 'Vehari');

  IF nullif(btrim(p_unit->>'legal_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Legal Name / Trade Name is mandatory' USING ERRCODE='23514';
  END IF;

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value',''),'[^0-9A-Za-z]','','g'));
  v_unit_id := gen_random_uuid();

  -- Immediate Allocation: Resilient PIN with -03 (Feeded) Suffix and Circle-Wise Demand Number
  v_pin := ptas_private.generate_ptas_pin(
    v_target_circle_id,
    v_tehsil,
    v_district_name,
    v_rule.statutory_rule_id,
    false,
    '03'
  );

  v_demand_no := coalesce(
    ptas_private.normalize_demand_no(p_unit->>'permanent_demand_no'),
    ptas_private.get_next_circle_demand_no(v_target_circle_id)
  );

  INSERT INTO public.pft3_assessment_units(
    id, permanent_demand_no, pin_number, provincial_uin, survey_no,
    legal_name, taxpayer_name, trade_name,
    identifier_type, identifier_value, address, locality,
    circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_rule_id, annual_rate_pkr, opening_arrears, financial_year_id,
    state, source, remarks, responsible_inspector_id, created_by
  ) VALUES (
    v_unit_id,
    v_demand_no,
    v_pin,
    v_pin,
    'IND-' || left(v_unit_id::text, 8),
    btrim(p_unit->>'legal_name'),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
    nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
    upper(coalesce(nullif(p_unit->>'identifier_type',''), 'CNIC')),
    v_identifier,
    coalesce(btrim(p_unit->>'address'), ''),
    nullif(btrim(p_unit->>'locality'), ''),
    v_target_circle_id,
    coalesce(v_target_circle_name, p_unit->>'circle_name', 'Circle 1'),
    v_tehsil,
    v_district_name,
    v_rule.primary_class_code,
    v_rule.tax_class,
    v_rule.schedule_subclass_code,
    v_rule.tax_subclass,
    v_rule.statutory_rule_id,
    v_rule.assessment_rate,
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    v_rule.financial_year_code,
    'FEEDED',
    'MANUAL',
    coalesce(nullif(btrim(p_unit->>'remarks'), ''), 'Individual field survey capture'),
    v_inspector_id,
    v_actor.user_id
  );

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,actor_id,
    actor_role,correlation_id,idempotency_key
  ) VALUES (
    'SURVEY_UNIT',v_unit_id,'FEED','NEW','FEEDED',v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  -- Record initial baseline version in public.assessment_versions
  INSERT INTO public.assessment_versions (
    unit_id,
    version_no,
    financial_year_id,
    pin_number,
    permanent_demand_no,
    category_code,
    subclassification_code,
    annual_rate_pkr,
    opening_arrears,
    status,
    reason,
    snapshot,
    created_by,
    created_at
  ) VALUES (
    v_unit_id,
    1,
    v_rule.financial_year_code,
    v_pin,
    v_demand_no,
    v_rule.primary_class_code,
    v_rule.schedule_subclass_code,
    v_rule.assessment_rate,
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    'FEEDED',
    coalesce(nullif(btrim(p_unit->>'remarks'), ''), 'Individual field survey capture'),
    jsonb_build_object(
      'legalName', btrim(p_unit->>'legal_name'),
      'taxpayerName', nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
      'tradeName', nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
      'categoryName', v_rule.tax_class,
      'subclassificationName', v_rule.tax_subclass,
      'circleName', coalesce(v_target_circle_name, p_unit->>'circle_name', 'Circle 1'),
      'tehsil', v_tehsil,
      'districtName', v_district_name,
      'identifierType', upper(coalesce(nullif(p_unit->>'identifier_type',''), 'CNIC')),
      'identifierValue', v_identifier,
      'address', coalesce(btrim(p_unit->>'address'), ''),
      'ratePkr', v_rule.assessment_rate
    ),
    v_actor.user_id,
    now()
  )
  ON CONFLICT (unit_id, version_no) DO NOTHING;

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_INDIVIDUAL_CREATED','SURVEY_UNIT',v_unit_id,
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,NULL,'FEEDED',
    'Unit feeded into PFT-3 register awaiting ETO statutory review'
  );

  RETURN jsonb_build_object(
    'id', v_unit_id,
    'pin_number', v_pin,
    'permanent_demand_no', v_demand_no,
    'idempotent_replay', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) TO authenticated, service_role;

-- ============================================================================
-- PTAS Migration 0055: Direct PFT-3 Enrollment & Circle Jurisdiction Harmonization
--
-- 1. Upgrades ptas_private.jurisdiction_contains to natively understand:
--    - Permanent geo tables (geo_divisions -> geo_districts -> geo_circles)
--    - Legacy jurisdictions hierarchy
--    - Cross-mapping between geo_circles and legacy jurisdictions
--
-- 2. Upgrades public.create_individual_survey_unit:
--    - Supports direct statutory enrollment into Form P.F.T-3 for Assessing Authorities (ETO / Admin)
--    - Allocates permanent -01 PIN suffix and APPROVED status when direct-enrolled
--    - Dynamically resolves circle codes from both geo_circles and jurisdictions
--    - Supports Inspectors with multiple assigned circles (primary + additional charge)
-- ============================================================================

BEGIN;

-- 1. Upgrade ptas_private.jurisdiction_contains
CREATE OR REPLACE FUNCTION ptas_private.jurisdiction_contains(p_root uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- A. Direct match
  SELECT (p_root IS NOT NULL AND p_target IS NOT NULL AND p_root = p_target)
  OR
  -- B. Legacy jurisdictions table recursive tree
  EXISTS (
    WITH RECURSIVE tree AS (
      SELECT id FROM public.jurisdictions WHERE id = p_root
      UNION ALL
      SELECT j.id FROM public.jurisdictions j JOIN tree t ON j.parent_id = t.id
    )
    SELECT 1 FROM tree WHERE id = p_target
  )
  OR
  -- C. Geo hierarchy traversal: Division contains Districts and Circles
  EXISTS (
    SELECT 1 FROM public.geo_circles gc
    WHERE gc.division_id = p_root AND (gc.id = p_target OR gc.district_id = p_target)
  )
  OR
  -- D. Geo hierarchy traversal: District contains Circles
  EXISTS (
    SELECT 1 FROM public.geo_circles gc
    WHERE gc.district_id = p_root AND gc.id = p_target
  )
  OR
  -- E. Cross-mapping between geo_circles and legacy jurisdictions
  EXISTS (
    SELECT 1 
    FROM public.geo_circles gc
    JOIN public.jurisdictions j ON j.code = gc.circle_code OR (gc.circle_code = 'VHR-1' AND j.code = 'CIR_VEH_01')
    WHERE (gc.id = p_root AND j.id = p_target)
       OR (j.id = p_root AND gc.id = p_target)
       OR (gc.district_id = p_root AND j.id = p_target)
  )
  OR
  -- F. Cross-mapping between geo_districts and legacy jurisdictions
  EXISTS (
    SELECT 1
    FROM public.geo_districts gd
    JOIN public.jurisdictions j ON j.code = 'DIST_' || gd.district_code OR (gd.district_code = 'VHR' AND j.code = 'DIST_VEHARI')
    WHERE (gd.id = p_root AND j.id = p_target)
       OR (j.id = p_root AND gd.id = p_target)
  );
$$;

-- 2. Upgrade public.create_individual_survey_unit
CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
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
  v_fy text;
  v_direct_enroll boolean;
  v_state text;
  v_pin_suffix text;
  v_approved_by uuid;
  v_approved_at timestamptz;
BEGIN
  -- 1. Identify active actor
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to register a PFT-3 unit' USING ERRCODE='42501';
  END IF;

  -- 2. Idempotency replay check
  SELECT aggregate_id INTO v_existing FROM public.workflow_actions
    WHERE aggregate_type = 'SURVEY_UNIT' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'idempotent_replay', true);
  END IF;

  -- 3. Validate statutory classification rule
  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id = p_unit->>'statutory_rule_id' AND status = 'ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE='23514';
  END IF;

  -- 4. Financial Year: defaults strictly to 2026-2027
  v_fy := coalesce(
    nullif(btrim(p_unit->>'financial_year_id'), ''),
    nullif(btrim(p_unit->>'financial_year'), ''),
    '2026-2027'
  );
  IF v_fy = '2021-2022' THEN
    v_fy := '2026-2027';
  END IF;

  -- 5. Determine Target Circle ID & Inspector Assignment
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id', '') IS NOT NULL THEN
    v_target_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_code' IS NOT NULL AND nullif(p_unit->>'circle_code', '') IS NOT NULL THEN
    SELECT gc.id INTO v_target_circle_id FROM public.geo_circles gc
    WHERE gc.circle_code = upper(btrim(p_unit->>'circle_code')) LIMIT 1;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name', '') IS NOT NULL THEN
    -- Match circle name in geo_circles or jurisdictions
    SELECT gc.id INTO v_target_circle_id FROM public.geo_circles gc
    WHERE gc.name ILIKE btrim(p_unit->>'circle_name') LIMIT 1;

    IF v_target_circle_id IS NULL THEN
      SELECT j.id INTO v_target_circle_id FROM public.jurisdictions j
      WHERE j.name = btrim(p_unit->>'circle_name') AND j.tier = 'CIRCLE'
      ORDER BY (CASE WHEN v_actor.jurisdiction_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, j.id) THEN 0 ELSE 1 END)
      LIMIT 1;
    END IF;
  END IF;

  -- Default circle if not resolved
  IF v_target_circle_id IS NULL THEN
    IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
      v_target_circle_id := v_actor.jurisdiction_id;
    ELSE
      SELECT gc.id INTO v_target_circle_id FROM public.geo_circles gc
      WHERE gc.district_id = v_actor.jurisdiction_id
         OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, gc.id)
      ORDER BY gc.circle_number LIMIT 1;

      IF v_target_circle_id IS NULL THEN
        SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE (v_actor.jurisdiction_id IS NULL OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id))
          AND tier = 'CIRCLE'
        ORDER BY name LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Jurisdiction containment validation
  IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
    v_inspector_id := v_actor.user_id;
    -- Verify Inspector is assigned to this circle (primary or additional charge)
    IF NOT (
      v_target_circle_id = v_actor.jurisdiction_id
      OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id)
      OR EXISTS (
        SELECT 1 FROM public.user_jurisdiction_assignments uja
        WHERE uja.user_id = v_actor.user_id
          AND (uja.circle_id = v_target_circle_id OR ptas_private.jurisdiction_contains(uja.circle_id, v_target_circle_id))
          AND uja.valid_to IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'Tax Inspector is legally restricted to their assigned circle jurisdiction' USING ERRCODE='42501';
    END IF;
  ELSIF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Specified circle is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;

    -- Lookup responsible inspector
    SELECT uja.user_id INTO v_inspector_id
    FROM public.user_jurisdiction_assignments uja
    WHERE uja.circle_id = v_target_circle_id AND uja.valid_to IS NULL
    LIMIT 1;

    IF v_inspector_id IS NULL THEN
      SELECT user_id INTO v_inspector_id FROM public.user_roles
      WHERE role_code IN ('INSPECTOR','ETI') AND jurisdiction_id = v_target_circle_id
        AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
      LIMIT 1;
    END IF;

    IF v_inspector_id IS NULL THEN
      v_inspector_id := v_actor.user_id;
    END IF;
  ELSE
    v_inspector_id := v_actor.user_id;
  END IF;

  -- 6. Resolve Names & Hierarchy
  SELECT gc.name INTO v_target_circle_name FROM public.geo_circles gc WHERE gc.id = v_target_circle_id;
  IF v_target_circle_name IS NULL THEN
    SELECT j.name INTO v_target_circle_name FROM public.jurisdictions j WHERE j.id = v_target_circle_id;
  END IF;

  -- Resolve Tehsil & District
  SELECT gt.name, gd.name INTO v_tehsil, v_district_name
  FROM public.geo_circles gc
  LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
  JOIN public.geo_districts gd ON gd.id = gc.district_id
  WHERE gc.id = v_target_circle_id;

  IF v_tehsil IS NULL THEN
    SELECT teh.name, dist.name INTO v_tehsil, v_district_name
    FROM public.jurisdictions c
    LEFT JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist ON dist.id = teh.parent_id
    WHERE c.id = v_target_circle_id;
  END IF;

  v_tehsil := coalesce(v_tehsil, p_unit->>'tehsil', 'Vehari');
  v_district_name := coalesce(v_district_name, p_unit->>'district_name', 'Vehari');

  IF nullif(btrim(p_unit->>'legal_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Legal Name / Trade Name is mandatory' USING ERRCODE='23514';
  END IF;

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value', ''), '[^0-9A-Za-z]', '', 'g'));
  v_unit_id := gen_random_uuid();

  -- 7. Direct Enrollment Determination (Assessing Authority Privilege)
  v_direct_enroll := (
    v_actor.role_code IN ('ETO', 'ADMIN', 'DIRECTOR', 'DET')
    AND coalesce((p_unit->>'enroll_direct_to_pft3')::boolean, true)
  );

  IF v_direct_enroll THEN
    v_state := 'APPROVED';
    v_pin_suffix := '01';
    v_approved_by := v_actor.user_id;
    v_approved_at := now();
  ELSE
    v_state := 'FEEDED';
    v_pin_suffix := '03';
    v_approved_by := NULL;
    v_approved_at := NULL;
  END IF;

  -- Generate PIN and Demand Number
  v_pin := ptas_private.generate_ptas_pin(
    v_target_circle_id,
    v_tehsil,
    v_district_name,
    v_rule.statutory_rule_id,
    false,
    v_pin_suffix
  );

  v_demand_no := coalesce(
    ptas_private.normalize_demand_no(p_unit->>'permanent_demand_no'),
    ptas_private.get_next_circle_demand_no(v_target_circle_id)
  );

  -- 8. Insert into public.pft3_assessment_units
  INSERT INTO public.pft3_assessment_units (
    id, permanent_demand_no, pin_number, provincial_uin, survey_no,
    legal_name, taxpayer_name, trade_name,
    identifier_type, identifier_value, address, locality,
    circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_rule_id, annual_rate_pkr, opening_arrears, financial_year_id,
    state, source, remarks, responsible_inspector_id, created_by,
    approved_by, approved_at
  ) VALUES (
    v_unit_id,
    v_demand_no,
    v_pin,
    v_pin,
    'IND-' || left(v_unit_id::text, 8),
    btrim(p_unit->>'legal_name'),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
    nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
    upper(coalesce(nullif(p_unit->>'identifier_type', ''), 'CNIC')),
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
    v_fy,
    v_state,
    'MANUAL',
    coalesce(nullif(btrim(p_unit->>'remarks'), ''), CASE WHEN v_direct_enroll THEN 'Statutory intake directly enrolled into Form P.F.T-3' ELSE 'Individual field survey capture' END),
    v_inspector_id,
    v_actor.user_id,
    v_approved_by,
    v_approved_at
  );

  -- 9. Workflow action record
  INSERT INTO public.workflow_actions (
    aggregate_type, aggregate_id, action, from_status, to_status, actor_id,
    actor_role, correlation_id, idempotency_key
  ) VALUES (
    'SURVEY_UNIT', v_unit_id,
    CASE WHEN v_direct_enroll THEN 'APPROVE' ELSE 'FEED' END,
    'NEW', v_state, v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  );

  -- 10. Record initial baseline version in public.assessment_versions
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
    v_fy,
    v_pin,
    v_demand_no,
    v_rule.primary_class_code,
    v_rule.schedule_subclass_code,
    v_rule.assessment_rate,
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    v_state,
    CASE WHEN v_direct_enroll THEN 'Statutory direct intake and approval by Assessing Authority' ELSE 'Individual field survey capture' END,
    jsonb_build_object(
      'legalName', btrim(p_unit->>'legal_name'),
      'taxpayerName', nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
      'tradeName', nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
      'categoryName', v_rule.tax_class,
      'subclassificationName', v_rule.tax_subclass,
      'circleName', coalesce(v_target_circle_name, p_unit->>'circle_name', 'Circle 1'),
      'tehsil', v_tehsil,
      'districtName', v_district_name,
      'identifierType', upper(coalesce(nullif(p_unit->>'identifier_type', ''), 'CNIC')),
      'identifierValue', v_identifier,
      'address', coalesce(btrim(p_unit->>'address'), ''),
      'ratePkr', v_rule.assessment_rate,
      'status', v_state
    ),
    v_actor.user_id,
    now()
  )
  ON CONFLICT (unit_id, version_no) DO NOTHING;

  -- 11. Audit Event
  PERFORM ptas_private.audit_transition(
    CASE WHEN v_direct_enroll THEN 'ASSESSMENT_APPROVED' ELSE 'SURVEY_UNIT_INDIVIDUAL_CREATED' END,
    'SURVEY_UNIT',
    v_unit_id,
    v_actor.user_id,
    v_actor.role_code,
    v_target_circle_id,
    p_correlation_id,
    NULL,
    v_state,
    CASE WHEN v_direct_enroll THEN 'Unit assessed and directly enrolled into Form P.F.T-3 by Assessing Authority' ELSE 'Unit feeded into survey intake awaiting ETO statutory review' END
  );

  RETURN jsonb_build_object(
    'id', v_unit_id,
    'pin_number', v_pin,
    'permanent_demand_no', v_demand_no,
    'state', v_state,
    'direct_enrolled', v_direct_enroll,
    'idempotent_replay', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) TO authenticated, service_role;

COMMIT;

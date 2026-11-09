BEGIN;

-- ============================================================================
-- PTAS Migration 0053: Standardize Ongoing Financial Year to 2026-2027
-- 
-- 1. Updates public.create_individual_survey_unit:
--    Explicitly binds newly enrolled PFT-3 units and their assessment versions
--    to the active ongoing financial year ('2026-2027') instead of inheriting
--    the historical Finance Act 2021 enactment year ('2021-2022').
-- 
-- 2. Updates public.issue_pft2_challan:
--    Guarantees all issued Form P.F.T-2 challans attach to the ongoing
--    financial year ('2026-2027') for both regular PFT-3 and potential units.
-- 
-- 3. Remediates existing rows:
--    Normalizes any existing PFT-3 units, assessment versions, and challans
--    previously tagged with '2021-2022' to the ongoing statutory year '2026-2027'.
-- ============================================================================

-- 1. Update public.create_individual_survey_unit
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
  v_fy text;
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

  -- Determine ongoing financial year (defaults strictly to 2026-2027)
  v_fy := coalesce(
    nullif(btrim(p_unit->>'financial_year_id'), ''),
    nullif(btrim(p_unit->>'financial_year'), ''),
    '2026-2027'
  );
  IF v_fy = '2021-2022' THEN
    v_fy := '2026-2027';
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
    v_fy,
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
    v_fy,
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

-- 2. Upgrade public.issue_pft2_challan to ensure ongoing financial year 2026-2027
CREATE OR REPLACE FUNCTION public.issue_pft2_challan(
  p_challan jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor record;
  v_is_potential boolean;
  v_unit_id uuid;
  v_jurisdiction_id uuid;
  v_financial_year text;
  v_amount numeric;
  v_issue_date date;
  v_due_date date;
  v_scope text;
  v_id uuid;
  v_challan_number text;
  v_snapshot jsonb;
  v_clean_pin text;
BEGIN
  IF p_idempotency_key IS NULL OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  v_is_potential := coalesce((p_challan->>'isPotential')::boolean, false);
  v_amount := coalesce((p_challan->>'amount')::numeric, 0);
  v_issue_date := coalesce((p_challan->>'issueDate')::date, current_date);
  v_due_date := coalesce((p_challan->>'dueDate')::date, current_date + interval '30 days');
  v_scope := upper(coalesce(p_challan->>'demandScope', '01'));

  IF v_amount <= 0 OR v_due_date < v_issue_date THEN
    RAISE EXCEPTION 'invalid challan amount or date range' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;

  IF v_is_potential THEN
    SELECT p.id, p.circle_id
      INTO v_unit_id, v_jurisdiction_id
    FROM public.potential_assessment_units p
    WHERE p.id = (p_challan->>'unitId')::uuid AND p.status = 'ACTIVE';
    v_financial_year := coalesce(nullif(btrim(p_challan->>'financialYearId'), ''), nullif(btrim(p_challan->>'financialYear'), ''), '2026-2027');
  ELSE
    SELECT p.id, p.circle_id, coalesce(nullif(btrim(p.financial_year_id), ''), '2026-2027')
      INTO v_unit_id, v_jurisdiction_id, v_financial_year
    FROM public.pft3_assessment_units p
    WHERE p.id = (p_challan->>'unitId')::uuid;
  END IF;

  v_financial_year := coalesce(nullif(btrim(v_financial_year), ''), '2026-2027');
  IF v_financial_year = '2021-2022' THEN
    v_financial_year := '2026-2027';
  END IF;

  IF v_unit_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan target is unavailable in the actor jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Check idempotency against unified pft2_challans
  SELECT id, snapshot INTO v_id, v_snapshot FROM public.pft2_challans
    WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_snapshot; END IF;

  -- Authoritatively allocate atomic canonical notice number from district monthly sequence
  v_challan_number := ptas_private.generate_pft2_notice_number(
    v_jurisdiction_id,
    v_is_potential,
    v_scope,
    v_issue_date,
    '01'
  );

  PERFORM pg_advisory_xact_lock(hashtext('pft2-notice:' || v_challan_number));

  IF EXISTS (SELECT 1 FROM public.pft2_challans WHERE challan_number = v_challan_number) THEN
    v_challan_number := ptas_private.generate_pft2_notice_number(
      v_jurisdiction_id,
      v_is_potential,
      v_scope,
      v_issue_date,
      '01'
    );
  END IF;

  v_id := gen_random_uuid();
  v_clean_pin := coalesce(p_challan->>'pin', p_challan->>'provincialUin', '');

  v_snapshot := jsonb_build_object(
    'id', v_id,
    'challanNumber', v_challan_number,
    'noticeNumber', v_challan_number,
    'unitId', v_unit_id,
    'isPotential', v_is_potential,
    'amount', v_amount,
    'amountPayable', v_amount,
    'issueDate', v_issue_date,
    'dueDate', v_due_date,
    'demandScope', v_scope,
    'paymentScope', coalesce(p_challan->>'paymentScope', '01'),
    'financialYearId', v_financial_year,
    'financialYear', v_financial_year,
    'circleId', v_jurisdiction_id,
    'pin', v_clean_pin,
    'status', 'ISSUED'
  );

  INSERT INTO public.pft2_challans (
    id, challan_type, pft3_unit_id, potential_unit_id, financial_year_id, jurisdiction_id,
    challan_number, amount_payable, issue_date, due_date, demand_scope,
    payment_scope, idempotency_key, created_by, snapshot, status
  ) VALUES (
    v_id,
    CASE WHEN v_is_potential THEN 'PROVISIONAL'::text ELSE 'REGULAR'::text END,
    CASE WHEN v_is_potential THEN NULL ELSE v_unit_id END,
    CASE WHEN v_is_potential THEN v_unit_id ELSE NULL END,
    v_financial_year,
    v_jurisdiction_id,
    v_challan_number,
    v_amount,
    v_issue_date,
    v_due_date,
    v_scope,
    coalesce(p_challan->>'paymentScope', '01'),
    p_idempotency_key,
    v_actor.user_id,
    v_snapshot,
    'ISSUED'
  );

  INSERT INTO public.audit_events (
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    payload, occurred_at
  ) VALUES (
    gen_random_uuid(),
    CASE WHEN v_is_potential THEN 'PROVISIONAL_CHALLAN_ISSUED' ELSE 'REGULAR_CHALLAN_ISSUED' END,
    'CHALLAN',
    v_id,
    v_actor.user_id,
    v_actor.role_code,
    v_jurisdiction_id,
    v_snapshot,
    now()
  );

  RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_pft2_challan(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_pft2_challan(jsonb, text, text) TO authenticated, service_role;

-- 3. Remediate existing database records with historical 2021-2022 to ongoing 2026-2027
UPDATE public.pft3_assessment_units
SET financial_year_id = '2026-2027'
WHERE financial_year_id = '2021-2022';

UPDATE public.assessment_versions
SET financial_year_id = '2026-2027'
WHERE financial_year_id = '2021-2022';

UPDATE public.pft2_challans
SET financial_year_id = '2026-2027',
    snapshot = jsonb_set(
      jsonb_set(snapshot, '{financialYearId}', '"2026-2027"'),
      '{financialYear}', '"2026-2027"'
    )
WHERE financial_year_id = '2021-2022';

COMMIT;

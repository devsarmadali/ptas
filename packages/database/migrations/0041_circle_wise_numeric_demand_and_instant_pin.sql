-- Migration 0041: Circle-Wise Numeric Demand Numbers and Instant Resilient PIN Architecture
-- 
-- 1. Demand numbers must be pure numbers only (e.g. 5, 65, 876, 187), with hyphen only for sub-demands (e.g. 402-5).
--    All "D-" and "V-" prefixes are stripped. Circle-wise sequential allocation.
--    Restricted to Form PFT-3 register; Potential register units have NO demand numbers.
-- 2. Instant PIN allocation at insert time (both for PFT3 in FEEDED state and Potential Register with 'Potential-' prefix).
--    PIN structure: DDD-TTTCCSSUURRNNNNN-VV (District-Tehsil/Circle/Class/Subclass/Tertiary/Sequence-Version).
--    Zero collision possibility via atomic sequence 'taxpayer_pin_seq'. Permanent, immutable.
-- 3. Fixes 'Submit to ETO' workflow transition by exposing row_version and robust actor authorization.

-- 1. Demand Number Normalizer (Immutable)
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

  -- 1. Format: V-01-87 or V-09-163 -> 187, 9163
  IF v_str ~* '^V-[0-9]+-[0-9]+$' THEN
    v_parts := string_to_array(v_str, '-');
    v_p1 := regexp_replace(v_parts[2], '^0+', '');
    v_p2 := v_parts[3];
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1 || v_p2;
  END IF;

  -- 2. Format: V-05 or V-12 -> 5, 12
  IF v_str ~* '^V-[0-9]+$' THEN
    v_p1 := regexp_replace(substring(v_str from 3), '^0+', '');
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1;
  END IF;

  -- 3. Format: D-402.5 or D-402/5 or D-402-5 -> 402-5
  IF v_str ~* '^D-[0-9]+[./-][0-9]+$' THEN
    v_str := substring(v_str from 3);
    RETURN regexp_replace(regexp_replace(v_str, '^0+', ''), '[./]', '-');
  END IF;

  -- 4. Format: D-401 or D-5 -> 401, 5
  IF v_str ~* '^D-[0-9]+$' THEN
    v_p1 := regexp_replace(substring(v_str from 3), '^0+', '');
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1;
  END IF;

  -- 5. Format: 402.5 or 402/5 -> 402-5
  IF v_str ~ '^[0-9]+[./][0-9]+$' THEN
    RETURN regexp_replace(regexp_replace(v_str, '^0+', ''), '[./]', '-');
  END IF;

  -- 6. Pure digits with hyphen (e.g. 402-5)
  IF v_str ~ '^[0-9]+-[0-9]+$' THEN
    RETURN regexp_replace(v_str, '^0+', '');
  END IF;

  -- 7. Pure digits (e.g. 0005 -> 5, 876 -> 876)
  IF v_str ~ '^[0-9]+$' THEN
    v_p1 := regexp_replace(v_str, '^0+', '');
    IF v_p1 = '' THEN v_p1 := '0'; END IF;
    RETURN v_p1;
  END IF;

  -- Strip leading D/V and hyphens
  v_str := regexp_replace(v_str, '^[DVdv][\s\-_]*', '');
  v_str := regexp_replace(v_str, '^0+', '');
  RETURN nullif(v_str, '');
END;
$function$;

-- 2. Circle-Wise Next Demand Number Calculator
CREATE OR REPLACE FUNCTION ptas_private.get_next_circle_demand_no(p_circle_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_max bigint := 0;
BEGIN
  IF p_circle_id IS NOT NULL THEN
    SELECT coalesce(max(split_part(permanent_demand_no, '-', 1)::bigint), 0)
    INTO v_max
    FROM public.pft3_assessment_units
    WHERE circle_id = p_circle_id
      AND permanent_demand_no ~ '^[0-9]+(-[0-9]+)?$';
  ELSE
    SELECT coalesce(max(split_part(permanent_demand_no, '-', 1)::bigint), 0)
    INTO v_max
    FROM public.pft3_assessment_units
    WHERE permanent_demand_no ~ '^[0-9]+(-[0-9]+)?$';
  END IF;

  RETURN (v_max + 1)::text;
END;
$function$;

-- 3. Resilient Provincial PIN Generator (Atomic & Collision-Free)
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
  v_dist_code text := '237';
  v_tehsil_code text := '001';
  v_circle_code text := '01';
  v_class_code text := '00';
  v_subclass_code text := '00';
  v_tertiary_code text := '00';
  v_seq bigint;
  v_raw_pin text;
BEGIN
  -- 1. Resolve Circle Code
  IF p_circle_id IS NOT NULL THEN
    SELECT * INTO v_circle FROM public.jurisdictions WHERE id = p_circle_id;
    IF v_circle.code IS NOT NULL THEN
      v_circle_code := coalesce(nullif(regexp_replace(v_circle.code, '[^0-9]', '', 'g'), ''), '01');
      v_circle_code := lpad(v_circle_code, 2, '0');
    END IF;
  END IF;

  -- 2. Resolve District Code (PBS standard)
  IF lower(coalesce(p_district_name, '')) = 'multan' THEN
    v_dist_code := '223';
  ELSIF lower(coalesce(p_district_name, '')) = 'khanewal' THEN
    v_dist_code := '216';
  ELSIF lower(coalesce(p_district_name, '')) = 'lodhran' THEN
    v_dist_code := '220';
  ELSE
    v_dist_code := '237';
  END IF;

  -- 3. Resolve Tehsil Code (Robust & Optional-safe)
  IF lower(coalesce(p_tehsil_name, '')) IN ('burewala', 'teh_bur') THEN
    v_tehsil_code := '002';
  ELSIF lower(coalesce(p_tehsil_name, '')) IN ('mailsi', 'teh_mai') THEN
    v_tehsil_code := '003';
  ELSE
    v_tehsil_code := '001';
  END IF;

  -- 4. Resolve Statutory Classification Block (SS-UU-RR)
  IF p_statutory_rule_id IS NOT NULL THEN
    SELECT 
      coalesce(nullif(out_class_code, ''), '00'),
      coalesce(nullif(out_subclass_code, ''), '00'),
      coalesce(nullif(out_tertiary_code, ''), '00')
    INTO v_class_code, v_subclass_code, v_tertiary_code
    FROM ptas_private.get_rule_uin_block(p_statutory_rule_id);
  END IF;

  -- 5. Atomic Sequence Allocation (Thread-safe & Collision-free)
  v_seq := nextval('public.taxpayer_pin_seq');

  -- 6. Assemble 23-character UIN
  v_raw_pin := v_dist_code || '-' ||
               v_tehsil_code ||
               v_circle_code ||
               v_class_code ||
               v_subclass_code ||
               v_tertiary_code ||
               lpad(v_seq::text, 5, '0') ||
               '-01';

  IF p_is_potential THEN
    RETURN 'Potential-' || v_raw_pin;
  ELSE
    RETURN v_raw_pin;
  END IF;
END;
$function$;

-- 4. Update allocate_pft3_pin to use resilient generator and circle demand calculator
CREATE OR REPLACE FUNCTION ptas_private.allocate_pft3_pin(p_unit_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_unit record;
  v_pin text;
  v_demand_no text;
BEGIN
  SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE = 'P0002';
  END IF;

  -- If unit already has a valid structured PIN, keep it
  IF v_unit.pin_number IS NOT NULL 
     AND length(btrim(v_unit.pin_number)) >= 15
     AND (v_unit.pin_number ~ '^[0-9]{3}-' OR v_unit.pin_number LIKE 'PIN-%')
     AND NOT v_unit.pin_number LIKE 'Potential-%' THEN
    v_pin := v_unit.pin_number;
  ELSE
    v_pin := ptas_private.generate_ptas_pin(
      v_unit.circle_id,
      v_unit.tehsil,
      v_unit.district_name,
      v_unit.statutory_rule_id,
      false
    );
  END IF;

  -- Ensure numeric circle-wise demand number
  v_demand_no := ptas_private.normalize_demand_no(v_unit.permanent_demand_no);
  IF v_demand_no IS NULL THEN
    v_demand_no := ptas_private.get_next_circle_demand_no(v_unit.circle_id);
  END IF;

  UPDATE public.pft3_assessment_units
  SET pin_number = v_pin,
      provincial_uin = v_pin,
      permanent_demand_no = v_demand_no,
      updated_at = now()
  WHERE id = v_unit.id;

  RETURN v_pin;
END;
$function$;

-- 5. Upgrade create_individual_survey_unit: Lock PIN & Circle Demand Number at FEEDED insert
CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $function$
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

  -- Immediate Allocation: Resilient PIN and Circle-Wise Demand Number
  v_pin := ptas_private.generate_ptas_pin(
    v_target_circle_id,
    v_tehsil,
    v_district_name,
    v_rule.statutory_rule_id,
    false
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

-- 6. Upgrade transition_survey_unit: Preserve Pre-Allocated PIN and Demand Number
CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL::text
) RETURNS public.pft3_assessment_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.pft3_assessment_units;
  a record;
  n text;
  old text;
  v_pin text;
  v_demand_no text;
BEGIN
  SELECT * INTO v FROM public.pft3_assessment_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  
  -- ETO can review/approve/return; both Inspector and ETO can submit/feed/revise
  SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR','ETO'] END) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.circle_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  
  old := v.state;
  n := (CASE 
    WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='APPROVED' AND p_action IN ('REVISE','SUBMIT','EDIT') THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' 
    ELSE NULL END);
  IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;

  INSERT INTO public.workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('SURVEY_UNIT',v.id,p_action,old,n,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);

  IF n='APPROVED' THEN
    -- Ensure PIN is allocated
    IF v.pin_number IS NULL OR length(btrim(v.pin_number)) < 15 OR v.pin_number LIKE 'Potential-%' THEN
      v_pin := ptas_private.allocate_pft3_pin(v.id);
      v.pin_number := v_pin;
      v.provincial_uin := v_pin;
    END IF;

    -- Ensure Demand Number is numeric and normalized
    v_demand_no := ptas_private.normalize_demand_no(v.permanent_demand_no);
    IF v_demand_no IS NULL THEN
      v_demand_no := ptas_private.get_next_circle_demand_no(v.circle_id);
    END IF;
    v.permanent_demand_no := v_demand_no;

    v.approved_by := a.user_id;
    v.approved_at := now();
  END IF;

  UPDATE public.pft3_assessment_units 
  SET state=n,
      row_version=row_version+1,
      updated_at=now(),
      submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
      approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
      approved_by=CASE WHEN n='APPROVED' THEN a.user_id ELSE approved_by END,
      closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END,
      permanent_demand_no=coalesce(v.permanent_demand_no, permanent_demand_no),
      pin_number=coalesce(v.pin_number, pin_number),
      provincial_uin=coalesce(v.provincial_uin, provincial_uin)
  WHERE id=v.id RETURNING * INTO v;

  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,v.circle_id,p_correlation_id,old,n,p_reason);
  RETURN v;
END;
$function$;

-- 7. Upgrade promote_survey_import: Assign Immediate Resilient PIN & Numeric Demand Number
CREATE OR REPLACE FUNCTION public.promote_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS public.survey_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_batch public.survey_import_batches;
  v_actor record;
  v_row record;
  v_rule public.survey_classification_rules;
  v_circle_name text;
  v_tehsil_name text;
  v_responsible_inspector_id uuid;
  v_inspector_count integer;
  v_normalized text;
  v_unit_id uuid;
  v_pin text;
  v_demand_no text;
BEGIN
  SELECT * INTO v_batch FROM public.survey_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'survey import batch not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status = 'PROMOTED' THEN
    RETURN v_batch;
  END IF;
  IF v_batch.status <> 'STAGED' THEN
    RAISE EXCEPTION 'only STAGED survey import batches may be promoted' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO','ADMIN','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Assessing Authority (ETO) authority is required' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT * FROM public.survey_import_rows
    WHERE batch_id = v_batch.id AND status = 'VALID'
    ORDER BY row_number
  LOOP
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.resolved_jurisdiction_id) THEN
      RAISE EXCEPTION 'import batch contains a row outside the actor jurisdiction' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_rule FROM public.survey_classification_rules
      WHERE statutory_rule_id = v_row.resolved_statutory_rule_id AND status = 'ACTIVE'
      ORDER BY effective_from DESC LIMIT 1;
    IF v_rule.id IS NULL THEN
      RAISE EXCEPTION 'row % references missing or inactive statutory classification rule', v_row.row_number
        USING ERRCODE = '23514';
    END IF;

    SELECT u.id, count(*) OVER ()
    INTO v_responsible_inspector_id, v_inspector_count
    FROM public.user_roles ur
    JOIN public.app_users u ON u.id = ur.user_id
    WHERE ur.role_code = 'INSPECTOR'
      AND ur.jurisdiction_id = v_row.resolved_jurisdiction_id
      AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
      AND u.active AND u.deactivated_at IS NULL;
    IF v_inspector_count <> 1 THEN
      RAISE EXCEPTION 'exactly one active Inspector must be assigned to each imported Circle'
        USING ERRCODE = '23514';
    END IF;

    SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_row.resolved_jurisdiction_id;
    SELECT teh.name INTO v_tehsil_name FROM public.jurisdictions c
    JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
    WHERE c.id = v_row.resolved_jurisdiction_id;

    v_circle_name := coalesce(v_circle_name, 'Circle 1');
    v_tehsil_name := coalesce(v_tehsil_name, 'Vehari');

    v_normalized := upper(regexp_replace(coalesce(v_row.identifier_value, ''), '[^0-9A-Za-z]', '', 'g'));
    v_unit_id := gen_random_uuid();

    -- Instant Allocation: Resilient PIN & Pure Numeric Demand Number
    v_pin := ptas_private.generate_ptas_pin(
      v_row.resolved_jurisdiction_id,
      v_tehsil_name,
      'Vehari',
      v_rule.statutory_rule_id,
      false
    );

    v_demand_no := coalesce(
      ptas_private.normalize_demand_no(v_row.legacy_demand_no),
      ptas_private.get_next_circle_demand_no(v_row.resolved_jurisdiction_id)
    );

    INSERT INTO public.pft3_assessment_units(
      id, permanent_demand_no, pin_number, provincial_uin, survey_no,
      import_batch_id, import_row_id,
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
      coalesce(nullif(btrim(v_row.supplied_survey_no), ''), v_row.generated_survey_no::text),
      v_batch.id,
      v_row.id,
      v_row.legal_name,
      v_row.taxpayer_name,
      v_row.taxpayer_name,
      coalesce(v_row.identifier_type, 'CNIC'),
      v_normalized,
      coalesce(v_row.commercial_address, ''),
      v_row.locality,
      v_row.resolved_jurisdiction_id,
      v_circle_name,
      v_tehsil_name,
      'Vehari',
      v_rule.primary_class_code,
      v_rule.tax_class,
      v_rule.schedule_subclass_code,
      v_rule.tax_subclass,
      v_rule.statutory_rule_id,
      v_rule.assessment_rate,
      coalesce(v_row.opening_arrears, 0),
      v_rule.financial_year_code,
      'FEEDED',
      'CSV_IMPORT',
      coalesce(v_row.remarks, 'Batch imported survey unit'),
      v_responsible_inspector_id,
      v_actor.user_id
    );
  END LOOP;

  UPDATE public.survey_import_batches
  SET status = 'PROMOTED',
      promoted_by = v_actor.user_id,
      promoted_at = now(),
      row_version = row_version + 1
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.workflow_actions(
    aggregate_type, aggregate_id, action, from_status, to_status, actor_id, actor_role, correlation_id, idempotency_key
  ) VALUES (
    'SURVEY_IMPORT', v_batch.id, 'PROMOTE', 'STAGED', 'PROMOTED', v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_PROMOTED', 'SURVEY_IMPORT', v_batch.id,
    v_actor.user_id, v_actor.role_code, v_batch.target_circle_id, p_correlation_id,
    'STAGED', 'PROMOTED', 'Import batch promoted into Form PFT-3 assessment register'
  );

  RETURN v_batch;
END;
$function$;

-- 8. Upgrade migrate_potential_unit_to_pft3: Cleans PIN and Allocates Circle Numeric Demand
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

  -- Clean potential PIN by stripping 'Potential-' prefix
  v_pin := regexp_replace(coalesce(v_row.pin_number, v_row.provincial_uin, ''), '^Potential-', '', 'i');
  IF length(v_pin) < 15 OR NOT (v_pin ~ '^[0-9]{3}-') THEN
    v_pin := ptas_private.generate_ptas_pin(
      v_row.circle_id,
      v_row.tehsil,
      v_row.district_name,
      v_row.statutory_rule_id,
      false
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
    OR (length(v_row.identifier_value) >= 5 AND identifier_value = upper(regexp_replace(v_row.identifier_value, '[^0-9A-Za-z]', '', 'g')))
  ) AND circle_id = v_row.circle_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_pft3_unit.id IS NOT NULL THEN
    UPDATE public.pft3_assessment_units
    SET permanent_demand_no = v_demand_no,
        pin_number = v_pin,
        provincial_uin = v_pin,
        legal_name = v_row.legal_name,
        taxpayer_name = coalesce(v_row.taxpayer_name, v_row.trade_name, taxpayer_name),
        trade_name = coalesce(v_row.trade_name, v_row.taxpayer_name, trade_name),
        address = coalesce(v_row.address, address),
        locality = coalesce(v_row.locality, locality),
        opening_arrears = coalesce(v_row.opening_arrears, opening_arrears),
        state = CASE WHEN v_actor.role_code = 'ETO' THEN 'APPROVED' ELSE 'SUBMITTED' END,
        approved_at = CASE WHEN v_actor.role_code = 'ETO' THEN now() ELSE approved_at END,
        approved_by = CASE WHEN v_actor.role_code = 'ETO' THEN v_actor.user_id ELSE approved_by END,
        submitted_at = now(),
        updated_at = now(),
        row_version = row_version + 1
    WHERE id = v_pft3_unit.id
    RETURNING * INTO v_pft3_unit;
  ELSE
    v_new_unit_id := gen_random_uuid();
    INSERT INTO public.pft3_assessment_units(
      id, permanent_demand_no, pin_number, provincial_uin, survey_no,
      legal_name, taxpayer_name, trade_name, identifier_type, identifier_value,
      address, locality, circle_id, circle_name, tehsil, district_name,
      category_code, category_name, subclassification_code, subclassification_name,
      statutory_tertiary_code, statutory_tertiary_classification,
      statutory_rule_id, annual_rate_pkr, opening_arrears,
      state, source, remarks, responsible_inspector_id,
      approved_by, approved_at, submitted_at, created_by
    ) VALUES (
      v_new_unit_id,
      v_demand_no,
      v_pin,
      v_pin,
      coalesce(v_row.potential_number, 'POT-MIG'),
      v_row.legal_name,
      coalesce(v_row.taxpayer_name, v_row.trade_name),
      coalesce(v_row.trade_name, v_row.taxpayer_name),
      v_row.identifier_type,
      v_row.identifier_value,
      v_row.address,
      v_row.locality,
      v_row.circle_id,
      v_row.circle_name,
      v_row.tehsil,
      v_row.district_name,
      v_row.category_code,
      v_row.category_name,
      v_row.subclassification_code,
      v_row.subclassification_name,
      v_row.statutory_tertiary_code,
      v_row.statutory_tertiary_classification,
      v_row.statutory_rule_id,
      v_row.annual_rate_pkr,
      coalesce(v_row.opening_arrears, 0),
      CASE WHEN v_actor.role_code = 'ETO' THEN 'APPROVED' ELSE 'SUBMITTED' END,
      'POTENTIAL_MIGRATION',
      'Migrated from Potential Register into Form PFT-3',
      v_actor.user_id,
      CASE WHEN v_actor.role_code = 'ETO' THEN v_actor.user_id ELSE NULL END,
      CASE WHEN v_actor.role_code = 'ETO' THEN now() ELSE NULL END,
      now(),
      v_actor.user_id
    ) RETURNING * INTO v_pft3_unit;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'potential_id', p_potential_id,
    'pft3_unit_id', v_pft3_unit.id,
    'assigned_demand_no', v_demand_no,
    'pin_number', v_pin,
    'state', v_pft3_unit.state
  );
END;
$function$;

-- 9. Upgrade create_potential_assessment_unit: Generate Potential-<PIN>, NO Demand Number
CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor record;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_next_seq integer;
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

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)+1
    INTO v_next_seq FROM public.potential_assessment_units;

  IF length(btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no', ''))) > 0 THEN
    v_potential_number := btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no'));
  ELSE
    v_potential_number := 'POT-' || lpad(v_next_seq::text, 4, '0');
  END IF;

  -- Generate atomic Potential-<PIN>
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

-- 10. Upgrade bulk_create_potential_assessment_units
CREATE OR REPLACE FUNCTION public.bulk_create_potential_assessment_units(p_units jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor record;
  v_item jsonb;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_next_seq integer;
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

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)
    INTO v_next_seq FROM public.potential_assessment_units;

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
      v_potential_number := btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no'));
    ELSE
      v_next_seq := v_next_seq + 1;
      v_potential_number := 'POT-' || lpad(v_next_seq::text, 4, '0');
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

-- 11. Upgraded list_operational_survey_units: Exposing row_version, pin_number, and demand_no
CREATE OR REPLACE FUNCTION public.list_operational_survey_units()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;

  IF v_actor.user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'taxpayer_id', u.id,
          'financial_year_id', u.financial_year_id,
          'assessment_id', u.id,
          'jurisdiction_id', u.circle_id,
          'jurisdiction', jsonb_build_object(
            'id', u.circle_id,
            'name', u.circle_name,
            'tier', 'CIRCLE',
            'tehsil', u.tehsil,
            'district_name', u.district_name
          ),
          'responsible_inspector_id', u.responsible_inspector_id,
          'source', u.source,
          'state', u.state,
          'row_version', u.row_version,
          'created_at', u.created_at,
          'updated_at', u.updated_at,
          'submitted_at', u.submitted_at,
          'approved_at', u.approved_at,
          'closed_at', u.closed_at,
          'taxpayer', jsonb_build_object(
            'display_name', u.legal_name,
            'status', 'ACTIVE',
            'permanent_demand_no', u.permanent_demand_no
          ),
          'identifier', CASE 
            WHEN length(coalesce(u.identifier_value, '')) > 0 THEN jsonb_build_object(
              'type', u.identifier_type,
              'value', u.identifier_value,
              'masked_value', repeat('*', greatest(length(u.identifier_value)-4, 0)) || right(u.identifier_value, 4)
            )
            ELSE NULL 
          END,
          'profile', jsonb_build_object(
            'survey_no', u.survey_no,
            'survey_date', u.created_at::date,
            'locality', u.locality,
            'commercial_address', u.address,
            'legal_name', u.legal_name,
            'taxpayer_name', u.taxpayer_name,
            'trade_name', u.trade_name,
            'opening_arrears', u.opening_arrears,
            'remarks', u.remarks,
            'legacy_demand_no', u.permanent_demand_no,
            'pin_number', u.pin_number,
            'provincial_uin', u.provincial_uin,
            'tehsil', u.tehsil
          ),
          'classification', CASE 
            WHEN u.statutory_rule_id IS NOT NULL THEN jsonb_build_object(
              'id', u.statutory_rule_id,
              'financial_year_code', u.financial_year_id,
              'tax_class', u.category_name,
              'tax_assessment_option', u.subclassification_name,
              'tax_subclass', u.subclassification_name,
              'assessment_rate', u.annual_rate_pkr,
              'primary_class_code', u.category_code,
              'schedule_subclass_code', u.subclassification_code,
              'rate_basis', 'Annual fixed rate',
              'statutory_rule_id', u.statutory_rule_id
            )
            ELSE NULL 
          END,
          'assessment', jsonb_build_object(
            'id', u.id,
            'taxpayer_id', u.id,
            'financial_year_id', u.financial_year_id,
            'status', u.state,
            'current_version_no', u.row_version,
            'created_by', u.created_by,
            'created_at', u.created_at
          ),
          'assessment_version', jsonb_build_object(
            'id', u.id,
            'assessment_id', u.id,
            'version_no', u.row_version,
            'status', u.state,
            'snapshot', jsonb_build_object(
              'taxAmount', u.annual_rate_pkr,
              'statutoryCategory', u.category_name,
              'legalBasis', u.category_code,
              'ruleId', u.statutory_rule_id,
              'subclassificationCode', u.subclassification_code
            ),
            'created_by', u.created_by,
            'created_at', u.created_at,
            'approved_by', u.approved_by,
            'approved_at', u.approved_at
          ),
          'demand_unit', jsonb_build_object(
            'id', u.id,
            'permanent_demand_no', u.permanent_demand_no,
            'created_at', u.created_at
          ),
          'ledger_entries', coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', ('entry-' || r.id::text),
                  'demand_unit_id', u.id,
                  'financial_year_id', u.financial_year_id,
                  'entry_type', 'PAYMENT_CREDIT',
                  'amount', -abs(r.amount),
                  'source_type', CASE WHEN r.payment_source = 'MANUAL' THEN 'MANUAL_RECEIPT' ELSE 'PFT2_RECEIPT' END,
                  'source_id', r.receipt_number,
                  'idempotency_key', coalesce(r.idempotency_key, 'receipt-' || r.id::text),
                  'correlation_id', 'corr-' || r.receipt_number,
                  'posted_by', coalesce(r.received_by::text, '00000000-0000-0000-0000-000000000000'),
                  'posted_at', to_char(r.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                  'metadata', jsonb_build_object(
                    'receipt_id', r.id,
                    'receipt_number', r.receipt_number,
                    'receipt_category', r.receipt_category,
                    'payment_source', r.payment_source,
                    'payment_channel', r.payment_channel,
                    'bank_branch', r.bank_branch,
                    'bank_transaction_id', r.bank_transaction_id
                  )
                )
                ORDER BY r.received_at ASC
              )
              FROM public.pft2_receipts r
              WHERE r.pft3_unit_id = u.id
            ),
            '[]'::jsonb
          ),
          'pft3_registered', (u.state = 'APPROVED'),
          'pft3_registered_at', u.approved_at
        )
        ORDER BY u.created_at DESC, u.id
      )
      FROM public.pft3_assessment_units u
      WHERE ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, u.circle_id)
        AND (v_actor.role_code NOT IN ('INSPECTOR','ETI') OR u.circle_id = v_actor.jurisdiction_id OR u.responsible_inspector_id = v_actor.user_id)
    ),
    '[]'::jsonb
  );
END;
$function$;

-- 12. Permissions
REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promote_survey_import(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_survey_import(uuid,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_potential_assessment_unit(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_potential_assessment_unit(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated, service_role;

-- 13. DATA MIGRATION: Clean existing records in pft3_assessment_units & potential_assessment_units

-- Step A: Normalize all legacy D and V demand numbers
UPDATE public.pft3_assessment_units
SET permanent_demand_no = ptas_private.normalize_demand_no(permanent_demand_no)
WHERE permanent_demand_no IS NOT NULL 
  AND ptas_private.normalize_demand_no(permanent_demand_no) IS NOT NULL;

-- Step B: Allocate sequential circle demand numbers for remaining units with NULL or PIN demand numbers
DO $$
DECLARE
  v_rec record;
  v_next text;
BEGIN
  FOR v_rec IN 
    SELECT id, circle_id 
    FROM public.pft3_assessment_units
    WHERE permanent_demand_no IS NULL 
       OR NOT (permanent_demand_no ~ '^[0-9]+(-[0-9]+)?$')
    ORDER BY created_at ASC, id ASC
  LOOP
    v_next := ptas_private.get_next_circle_demand_no(v_rec.circle_id);
    UPDATE public.pft3_assessment_units
    SET permanent_demand_no = v_next
    WHERE id = v_rec.id;
  END LOOP;
END $$;

-- Step C: Backfill valid PINs for any units missing pin_number
DO $$
DECLARE
  v_rec record;
  v_pin text;
BEGIN
  FOR v_rec IN 
    SELECT id, circle_id, tehsil, district_name, statutory_rule_id
    FROM public.pft3_assessment_units
    WHERE pin_number IS NULL 
       OR length(btrim(pin_number)) < 15
       OR pin_number LIKE 'Potential-%'
    ORDER BY created_at ASC, id ASC
  LOOP
    v_pin := ptas_private.generate_ptas_pin(
      v_rec.circle_id,
      v_rec.tehsil,
      v_rec.district_name,
      v_rec.statutory_rule_id,
      false
    );
    UPDATE public.pft3_assessment_units
    SET pin_number = v_pin,
        provincial_uin = v_pin
    WHERE id = v_rec.id;
  END LOOP;
END $$;

-- Step D: Backfill Potential-<PIN> for potential register units missing valid structured PINs
DO $$
DECLARE
  v_rec record;
  v_pin text;
BEGIN
  FOR v_rec IN 
    SELECT id, circle_id, tehsil, district_name, statutory_rule_id
    FROM public.potential_assessment_units
    WHERE pin_number IS NULL 
       OR length(btrim(pin_number)) < 20
       OR NOT (pin_number ~ '^Potential-[0-9]{3}-')
    ORDER BY created_at ASC, id ASC
  LOOP
    v_pin := ptas_private.generate_ptas_pin(
      v_rec.circle_id,
      v_rec.tehsil,
      v_rec.district_name,
      v_rec.statutory_rule_id,
      true
    );
    UPDATE public.potential_assessment_units
    SET pin_number = v_pin,
        provincial_uin = v_pin
    WHERE id = v_rec.id;
  END LOOP;
END $$;

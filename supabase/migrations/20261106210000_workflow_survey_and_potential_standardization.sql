-- ============================================================================
-- PTAS Migration: 0040_workflow_survey_and_potential_standardization.sql
-- Description: Preserves supplied survey numbers in survey promotion,
-- creates atomic bulk_create_potential_assessment_units RPC for the Potential Register,
-- adds remarks column support, and aligns statutory review and register convergence architecture.
-- ============================================================================

-- 0. Schema Enhancement: Ensure remarks column exists on potential_assessment_units
ALTER TABLE public.potential_assessment_units ADD COLUMN IF NOT EXISTS remarks text;

-- 1. Upgraded promote_survey_import() Preserving Supplied Survey Numbers
CREATE OR REPLACE FUNCTION public.promote_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS survey_import_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_row public.survey_import_rows;
  v_unit_id uuid;
  v_rule public.survey_classification_rules;
  v_normalized text;
  v_classification_status text;
  v_pending_review integer := 0;
  v_responsible_inspector_id uuid;
  v_inspector_count integer;
  v_circle_name text;
  v_tehsil_name text;
BEGIN
  SELECT * INTO v_batch FROM public.survey_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a
    WHERE a.user_id=v_batch.uploaded_by AND a.jurisdiction_id=v_batch.jurisdiction_id LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only the assigned uploading Inspector or ETO may promote this batch' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN RETURN v_batch; END IF;
  IF v_batch.status<>'VALIDATED' OR v_batch.invalid_rows<>0 OR v_batch.ready_rows<>v_batch.total_rows THEN
    RAISE EXCEPTION 'batch is not eligible for import' USING ERRCODE='23514';
  END IF;

  FOR v_row IN
    SELECT * FROM public.survey_import_rows
    WHERE batch_id=v_batch.id ORDER BY row_number FOR UPDATE
  LOOP
    v_rule := NULL;
    v_classification_status := 'CLASSIFIED';
    IF v_row.resolved_rule_id IS NULL THEN
      IF length(btrim(v_row.tax_assessment_option)) <> 0
         OR lower(btrim(coalesce(v_row.remarks,''))) <> 'under review' THEN
        RAISE EXCEPTION 'unclassified row is not explicitly marked Under review'
          USING ERRCODE='23514';
      END IF;
      v_classification_status := 'PENDING_REVIEW';
      v_pending_review := v_pending_review + 1;
    ELSE
      SELECT * INTO v_rule FROM public.survey_classification_rules
      WHERE id=v_row.resolved_rule_id AND status='ACTIVE';
      IF v_rule.id IS NULL THEN
        RAISE EXCEPTION 'classification became inactive before import' USING ERRCODE='40001';
      END IF;
    END IF;

    IF v_row.resolved_jurisdiction_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_row.resolved_jurisdiction_id) THEN
      RAISE EXCEPTION 'survey row jurisdiction is outside the importing officer scope'
        USING ERRCODE='42501';
    END IF;

    SELECT (array_agg(ur.user_id ORDER BY ur.user_id))[1],count(*)
    INTO v_responsible_inspector_id,v_inspector_count
    FROM public.user_roles ur
    JOIN public.app_users u ON u.id=ur.user_id
    WHERE ur.role_code='INSPECTOR'
      AND ur.jurisdiction_id=v_row.resolved_jurisdiction_id
      AND ur.valid_from<=now() AND (ur.valid_to IS NULL OR ur.valid_to>now())
      AND u.active AND u.deactivated_at IS NULL;
    IF v_inspector_count<>1 THEN
      RAISE EXCEPTION 'exactly one active Inspector must be assigned to each imported Circle'
        USING ERRCODE='23514';
    END IF;

    SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id=v_row.resolved_jurisdiction_id;
    SELECT teh.name INTO v_tehsil_name FROM public.jurisdictions c
    JOIN public.jurisdictions teh ON teh.id=c.parent_id AND teh.tier='TEHSIL'
    WHERE c.id=v_row.resolved_jurisdiction_id;

    v_normalized := upper(regexp_replace(coalesce(v_row.identifier_value, ''), '[^0-9A-Za-z]', '', 'g'));
    v_unit_id := gen_random_uuid();

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
      v_row.legacy_demand_no,
      NULL,
      NULL,
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
      coalesce(v_circle_name, 'Circle 1'),
      coalesce(v_tehsil_name, 'Vehari'),
      'Vehari',
      v_rule.primary_class_code,
      v_rule.tax_class,
      v_rule.schedule_subclass_code,
      v_rule.tax_subclass,
      v_rule.statutory_rule_id,
      coalesce(v_rule.assessment_rate, 0),
      coalesce(v_row.arrears, 0),
      v_batch.financial_year_code,
      'FEEDED',
      'CSV_IMPORT',
      v_row.remarks,
      v_responsible_inspector_id,
      v_actor.user_id
    );

    UPDATE public.survey_import_rows
    SET status='IMPORTED',promoted_survey_unit_id=v_unit_id
    WHERE id=v_row.id;
  END LOOP;

  UPDATE public.survey_import_batches
  SET status='IMPORTED',imported_rows=total_rows,imported_at=now()
  WHERE id=v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,
    correlation_id,idempotency_key
  )
  VALUES(
    'SURVEY_IMPORT',v_batch.id,'PROMOTE','VALIDATED','IMPORTED',v_actor.user_id,
    v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_PROMOTED','SURVEY_IMPORT',v_batch.id,v_actor.user_id,v_actor.role_code,
    v_actor.jurisdiction_id,p_correlation_id,'VALIDATED','IMPORTED',
    format('%s row(s) imported with classification pending review; registered in PFT-3 pipeline as FEEDED',v_pending_review)
  );
  RETURN v_batch;
END;
$$;

-- 2. Upgraded create_potential_assessment_unit() Preserving Supplied Discovery Reference
CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_circle_id;
  v_circle_name := coalesce(v_circle_name, p_unit->>'circle_name', 'Circle 1');

  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_circle_id;

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)+1
    INTO v_next_seq FROM public.potential_assessment_units;

  IF length(btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no', ''))) > 0 THEN
    v_potential_number := btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no'));
  ELSE
    v_potential_number := 'POT-'||lpad(v_next_seq::text,4,'0');
  END IF;

  v_pin := 'Potential-'||regexp_replace(coalesce(p_unit->>'pin_number',v_potential_number),'^Potential-','','i');

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
$$;

-- 3. Atomic High-Performance bulk_create_potential_assessment_units()
CREATE OR REPLACE FUNCTION public.bulk_create_potential_assessment_units(p_units jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_item jsonb;
  v_circle_id uuid;
  v_circle_name text;
  v_tehsil text;
  v_next_seq integer;
  v_potential_number text;
  v_pin text;
  v_row public.potential_assessment_units;
  v_results jsonb := '[]'::jsonb;
  v_inserted_count integer := 0;
BEGIN
  IF jsonb_typeof(p_units) IS DISTINCT FROM 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'p_units must be a non-empty array' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)
    INTO v_next_seq FROM public.potential_assessment_units;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_units)
  LOOP
    IF v_item->>'circle_id' IS NOT NULL AND nullif(v_item->>'circle_id','') IS NOT NULL THEN
      v_circle_id := (v_item->>'circle_id')::uuid;
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

    IF length(btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no', ''))) > 0 THEN
      v_potential_number := btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no'));
    ELSE
      v_next_seq := v_next_seq + 1;
      v_potential_number := 'POT-' || lpad(v_next_seq::text, 4, '0');
    END IF;

    v_pin := 'Potential-' || regexp_replace(coalesce(v_item->>'pin_number', v_potential_number), '^Potential-', '', 'i');

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
      coalesce(nullif(v_item->>'district_name',''), 'Vehari'),
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
    ) RETURNING * INTO v_row;

    v_results := v_results || jsonb_build_array(to_jsonb(v_row));
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'BULK_POTENTIAL_UNITS_CREATED', 'POTENTIAL_REGISTER', v_actor.jurisdiction_id::text,
    v_actor.user_id::text, v_actor.role_code, v_actor.jurisdiction_id::text,
    'bulk-potential:' || gen_random_uuid()::text,
    jsonb_build_object('total_created', v_inserted_count)
  );

  RETURN v_results;
END;
$$;

-- 4. Upgraded list_potential_assessment_units() Returning Remarks
CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
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
        'trade_name', p.trade_name,
        'taxpayer_name', p.taxpayer_name,
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
        'remarks', p.remarks,
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
$function$;

-- 5. Explicit Grants & Hardening
REVOKE ALL ON FUNCTION public.promote_survey_import(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_survey_import(uuid,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_potential_assessment_unit(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_potential_assessment_unit(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated, service_role;

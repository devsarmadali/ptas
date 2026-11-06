BEGIN;

-- ============================================================================
-- PTAS Migration 0037: Unified Form P.F.T-3 Register & Redundant Tables Cleanup
-- Phase 1 & Phase 2:
-- 1. Drop confirmed empty dormant tables (demand_ledger, demand_deletion_requests,
--    official_documents, payment_receipts, pft2_receipts, show_cause_cases).
-- 2. Create first-class public.pft3_assessment_units table.
-- 3. Backfill operational units from survey/taxpayer/demand tables.
-- 4. Re-link public.pft2_challans directly to public.pft3_assessment_units.
-- 5. Provide zero-join compatibility RPCs:
--    - list_operational_survey_units()
--    - create_individual_survey_unit()
--    - update_individual_survey_unit()
--    - transition_survey_unit()
--    - migrate_potential_unit_to_pft3()
--    - promote_survey_import()
--    - bulk_submit_survey_import()
--    - bulk_approve_survey_import()
-- ============================================================================

-- 1. Safely drop confirmed empty dormant tables
DROP TABLE IF EXISTS public.demand_ledger CASCADE;
DROP TABLE IF EXISTS public.demand_deletion_requests CASCADE;
DROP TABLE IF EXISTS public.official_documents CASCADE;
DROP TABLE IF EXISTS public.payment_receipts CASCADE;
DROP TABLE IF EXISTS public.pft2_receipts CASCADE;
DROP TABLE IF EXISTS public.show_cause_cases CASCADE;

-- 2. Create first-class unified public.pft3_assessment_units table
CREATE TABLE IF NOT EXISTS public.pft3_assessment_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permanent_demand_no text,
  pin_number text,
  provincial_uin text,
  survey_no text,
  import_batch_id uuid REFERENCES public.survey_import_batches(id) ON DELETE SET NULL,
  import_row_id uuid,
  legal_name text NOT NULL,
  taxpayer_name text,
  trade_name text,
  identifier_type text NOT NULL DEFAULT 'CNIC',
  identifier_value text DEFAULT '',
  address text DEFAULT '',
  locality text,
  circle_id uuid REFERENCES public.jurisdictions(id),
  circle_name text NOT NULL DEFAULT 'Circle 1',
  tehsil text DEFAULT 'Vehari',
  district_name text NOT NULL DEFAULT 'Vehari',
  category_code text,
  category_name text,
  subclassification_code text,
  subclassification_name text,
  statutory_tertiary_code text,
  statutory_tertiary_classification text,
  statutory_rule_id text,
  annual_rate_pkr numeric NOT NULL DEFAULT 0,
  opening_arrears numeric NOT NULL DEFAULT 0,
  financial_year_id text NOT NULL DEFAULT '2026-2027',
  state text NOT NULL DEFAULT 'FEEDED' CHECK (state IN ('NEW','FEEDED','SUBMITTED','APPROVED','RETURNED','CLOSED')),
  source text NOT NULL DEFAULT 'MANUAL',
  row_version bigint NOT NULL DEFAULT 1,
  remarks text,
  responsible_inspector_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  submitted_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pft3_units_state ON public.pft3_assessment_units(state);
CREATE INDEX IF NOT EXISTS idx_pft3_units_circle ON public.pft3_assessment_units(circle_id);
CREATE INDEX IF NOT EXISTS idx_pft3_units_demand_no ON public.pft3_assessment_units(permanent_demand_no);
CREATE INDEX IF NOT EXISTS idx_pft3_units_pin ON public.pft3_assessment_units(pin_number);
CREATE INDEX IF NOT EXISTS idx_pft3_units_survey_no ON public.pft3_assessment_units(survey_no);

-- 3. Row Level Security & Governance
ALTER TABLE public.pft3_assessment_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pft3_assessment_units_select ON public.pft3_assessment_units;
CREATE POLICY pft3_assessment_units_select ON public.pft3_assessment_units
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ptas_private.active_actor(NULL::text[]) a
      WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id, pft3_assessment_units.circle_id)
    )
  );

DROP POLICY IF EXISTS pft3_assessment_units_all ON public.pft3_assessment_units;
CREATE POLICY pft3_assessment_units_all ON public.pft3_assessment_units
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ptas_private.active_actor(NULL::text[]) a
      WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id, pft3_assessment_units.circle_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ptas_private.active_actor(NULL::text[]) a
      WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id, pft3_assessment_units.circle_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pft3_assessment_units TO authenticated, service_role;

-- 4. Backfill operational units from survey/taxpayer/demand tables into pft3_assessment_units
INSERT INTO public.pft3_assessment_units (
  id, permanent_demand_no, pin_number, provincial_uin, survey_no,
  import_batch_id, import_row_id,
  legal_name, taxpayer_name, trade_name,
  identifier_type, identifier_value, address, locality,
  circle_id, circle_name, tehsil, district_name,
  category_code, category_name, subclassification_code, subclassification_name,
  statutory_tertiary_code, statutory_tertiary_classification,
  statutory_rule_id, annual_rate_pkr, opening_arrears, financial_year_id,
  state, source, row_version, remarks,
  responsible_inspector_id, approved_by, approved_at, submitted_at, closed_at,
  created_by, created_at, updated_at
)
SELECT
  u.id,
  coalesce(t.permanent_demand_no, p.legacy_demand_no, du.permanent_demand_no),
  coalesce(t.permanent_demand_no, du.permanent_demand_no),
  coalesce(t.permanent_demand_no, du.permanent_demand_no),
  p.survey_no,
  CASE WHEN (u.payload->>'import_batch_id') ~ '^[0-9a-f-]{36}$' THEN (u.payload->>'import_batch_id')::uuid ELSE NULL END,
  p.import_row_id,
  coalesce(nullif(btrim(p.legal_name), ''), nullif(btrim(t.display_name), ''), 'Unnamed Legal Entity'),
  nullif(btrim(p.taxpayer_name), ''),
  nullif(btrim(p.taxpayer_name), ''),
  coalesce(nullif(btrim(i.identifier_type), ''), 'CNIC'),
  coalesce(i.normalized_value, ''),
  coalesce(p.commercial_address, ''),
  p.locality,
  u.jurisdiction_id,
  coalesce(j.name, 'Circle 1'),
  coalesce(teh.name, u.payload->>'tehsil', 'Vehari'),
  'Vehari',
  r.primary_class_code,
  r.tax_class,
  r.schedule_subclass_code,
  r.tax_subclass,
  NULL,
  NULL,
  r.statutory_rule_id,
  coalesce(r.assessment_rate, 0),
  coalesce(p.opening_arrears, 0),
  coalesce(u.financial_year_id, '2026-2027'),
  u.state,
  u.source,
  u.row_version,
  p.remarks,
  u.responsible_inspector_id,
  (SELECT av.approved_by::uuid FROM public.assessment_versions av WHERE av.assessment_id = u.assessment_id AND av.approved_by ~ '^[0-9a-f-]{36}$' LIMIT 1),
  u.approved_at,
  u.submitted_at,
  u.closed_at,
  CASE WHEN t.created_by ~ '^[0-9a-f-]{36}$' THEN t.created_by::uuid ELSE NULL END,
  u.created_at,
  u.updated_at
FROM public.survey_units u
JOIN public.taxpayers t ON t.id = u.taxpayer_id
JOIN public.jurisdictions j ON j.id = u.jurisdiction_id
LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
LEFT JOIN public.survey_unit_profiles p ON p.survey_unit_id = u.id
LEFT JOIN public.survey_classification_rules r ON r.id = p.classification_rule_id
LEFT JOIN LATERAL (
  SELECT identifier_type, normalized_value
  FROM public.taxpayer_identifiers ident
  WHERE ident.taxpayer_id = u.taxpayer_id
  ORDER BY ident.is_primary DESC, ident.valid_from DESC
  LIMIT 1
) i ON true
LEFT JOIN LATERAL (
  SELECT permanent_demand_no
  FROM public.demand_units d
  WHERE d.taxpayer_id = u.taxpayer_id AND d.active = true
  ORDER BY d.created_at DESC
  LIMIT 1
) du ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.demand_units du_check 
  WHERE du_check.taxpayer_id = u.taxpayer_id 
    AND du_check.active = false
)
ON CONFLICT (id) DO UPDATE
SET updated_at = now();

-- 5. Re-link public.pft2_challans to public.pft3_assessment_units
ALTER TABLE public.pft2_challans
  ADD COLUMN IF NOT EXISTS pft3_unit_id uuid REFERENCES public.pft3_assessment_units(id);

UPDATE public.pft2_challans
SET pft3_unit_id = (snapshot->>'unitId')::uuid
WHERE pft3_unit_id IS NULL AND (snapshot->>'unitId') IS NOT NULL;

ALTER TABLE public.pft2_challans
  ALTER COLUMN demand_unit_id DROP NOT NULL;

ALTER TABLE public.pft2_challans
  DROP CONSTRAINT IF EXISTS pft2_challans_demand_unit_id_fkey;

-- 6. Statutory PIN Allocator for PFT-3 Units
CREATE OR REPLACE FUNCTION ptas_private.allocate_pft3_pin(p_unit_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_unit record;
  v_circle record;
  v_tehsil record;
  v_dist record;
  v_block record;
  v_dist_code text;
  v_tehsil_code text;
  v_circle_code text;
  v_seq bigint;
  v_pin text;
BEGIN
  SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_unit.pin_number IS NOT NULL 
     AND length(btrim(v_unit.pin_number)) >= 15
     AND (v_unit.pin_number ~ '^[0-9]{3}-' OR v_unit.pin_number LIKE 'PIN-%')
     AND NOT v_unit.pin_number LIKE 'Potential-%' THEN
    RETURN v_unit.pin_number;
  END IF;

  IF v_unit.statutory_rule_id IS NULL THEN
    RAISE EXCEPTION 'unit has unresolved statutory classification rule' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_circle FROM public.jurisdictions WHERE id = v_unit.circle_id;
  SELECT * INTO v_tehsil FROM public.jurisdictions WHERE id = v_circle.parent_id;
  SELECT * INTO v_dist FROM public.jurisdictions WHERE id = v_tehsil.parent_id;

  v_dist_code := CASE v_dist.code
    WHEN 'DIST_VEH' THEN '237'
    WHEN 'DIST_MULTAN' THEN '223'
    WHEN 'DIST_KHAN' THEN '216'
    WHEN 'DIST_LOD' THEN '220'
    ELSE '237'
  END;

  v_tehsil_code := CASE v_tehsil.code
    WHEN 'TEH_VEH' THEN '001'
    ELSE '001'
  END;

  v_circle_code := coalesce(nullif(regexp_replace(v_circle.code, '[^0-9]', '', 'g'), ''), '01');
  v_circle_code := lpad(v_circle_code, 2, '0');

  SELECT * INTO v_block FROM ptas_private.get_rule_uin_block(v_unit.statutory_rule_id);

  v_seq := nextval('public.taxpayer_pin_seq');

  v_pin := v_dist_code || '-' ||
           v_tehsil_code ||
           v_circle_code ||
           coalesce(nullif(v_block.out_class_code, ''), '00') ||
           coalesce(nullif(v_block.out_subclass_code, ''), '00') ||
           coalesce(nullif(v_block.out_tertiary_code, ''), '00') ||
           lpad(v_seq::text, 5, '0') ||
           '-01';

  UPDATE public.pft3_assessment_units
  SET pin_number = v_pin,
      provincial_uin = v_pin,
      permanent_demand_no = coalesce(nullif(btrim(permanent_demand_no), ''), v_pin),
      updated_at = now(),
      row_version = row_version + 1
  WHERE id = v_unit.id;

  RETURN v_pin;
END;
$$;

-- 7. Zero-Join High Performance list_operational_survey_units()
CREATE OR REPLACE FUNCTION public.list_operational_survey_units()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
          'ledger_entries', '[]'::jsonb,
          'pft3_registered', (u.state = 'APPROVED'),
          'pft3_registered_at', u.approved_at
        )
        ORDER BY u.created_at DESC, u.id
      )
      FROM public.pft3_assessment_units u
      WHERE ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, u.circle_id)
        AND (v_actor.role_code NOT IN ('INSPECTOR','ETI') OR u.responsible_inspector_id = v_actor.user_id)
    ),
    '[]'::jsonb
  );
END;
$$;

-- 8. Upgraded create_individual_survey_unit() writing to pft3_assessment_units
CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
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

  IF nullif(btrim(p_unit->>'legal_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Legal Name / Trade Name is mandatory' USING ERRCODE='23514';
  END IF;

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value',''),'[^0-9A-Za-z]','','g'));
  v_unit_id := gen_random_uuid();

  INSERT INTO public.pft3_assessment_units(
    id, survey_no, legal_name, taxpayer_name, trade_name,
    identifier_type, identifier_value, address, locality,
    circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_rule_id, annual_rate_pkr, opening_arrears, financial_year_id,
    state, source, remarks, responsible_inspector_id, created_by
  ) VALUES (
    v_unit_id,
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
    coalesce(v_tehsil, 'Vehari'),
    coalesce(v_district_name, 'Vehari'),
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

  RETURN jsonb_build_object('id',v_unit_id,'idempotent_replay',false);
END;
$$;

-- 9. Upgraded update_individual_survey_unit() writing to pft3_assessment_units
CREATE OR REPLACE FUNCTION public.update_individual_survey_unit(
  p_unit_id uuid,
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_unit public.pft3_assessment_units;
  v_rule public.survey_classification_rules;
  v_target_circle_id uuid;
  v_target_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_identifier text;
  v_prev_state text;
  v_next_state text;
  v_edit_reason text;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to update PFT-3 units' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE='P0002';
  END IF;

  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_unit.circle_id) THEN
      RAISE EXCEPTION 'Target unit is outside your assigned jurisdiction' USING ERRCODE='42501';
    END IF;
  END IF;

  IF v_unit.state = 'CLOSED' THEN
    RAISE EXCEPTION 'Editing is prohibited: Unit is permanently CLOSED.' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id = coalesce(p_unit->>'statutory_rule_id', v_unit.statutory_rule_id) AND status = 'ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL AND p_unit->>'statutory_rule_id' IS NOT NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE='23514';
  END IF;

  v_target_circle_id := v_unit.circle_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id','') IS NOT NULL THEN
    v_target_circle_id := (p_unit->>'circle_id')::uuid;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name','') IS NOT NULL THEN
    SELECT id INTO v_target_circle_id FROM public.jurisdictions
      WHERE name = btrim(p_unit->>'circle_name') LIMIT 1;
  END IF;

  IF v_actor.role_code IN ('INSPECTOR','ETI') AND v_target_circle_id <> v_unit.circle_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot change the circle jurisdiction of a unit' USING ERRCODE='42501';
  END IF;

  IF v_actor.role_code NOT IN ('ADMIN','DIRECTOR','DET') THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Target circle is outside your assigned jurisdiction' USING ERRCODE='42501';
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

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value', v_unit.identifier_value),'[^0-9A-Za-z]','','g'));
  v_prev_state := v_unit.state;
  v_edit_reason := coalesce(nullif(p_unit->>'edit_reason',''), 'Assessee particulars updated under statutory governance');

  IF v_prev_state = 'APPROVED' THEN
    v_next_state := 'SUBMITTED';
  ELSIF v_prev_state = 'RETURNED' AND coalesce((p_unit->>'resubmit')::boolean, true) IS TRUE THEN
    v_next_state := 'SUBMITTED';
  ELSE
    v_next_state := v_prev_state;
  END IF;

  UPDATE public.pft3_assessment_units
    SET legal_name = coalesce(nullif(btrim(p_unit->>'legal_name'), ''), legal_name),
        taxpayer_name = coalesce(nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''), taxpayer_name),
        trade_name = coalesce(nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''), trade_name),
        identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type', ''), identifier_type)),
        identifier_value = v_identifier,
        address = coalesce(btrim(p_unit->>'address'), address),
        locality = coalesce(nullif(btrim(p_unit->>'locality'), ''), locality),
        circle_id = v_target_circle_id,
        circle_name = coalesce(v_target_circle_name, circle_name),
        tehsil = coalesce(v_tehsil, tehsil),
        district_name = coalesce(v_district_name, district_name),
        category_code = coalesce(v_rule.primary_class_code, category_code),
        category_name = coalesce(v_rule.tax_class, category_name),
        subclassification_code = coalesce(v_rule.schedule_subclass_code, subclassification_code),
        subclassification_name = coalesce(v_rule.tax_subclass, subclassification_name),
        statutory_rule_id = coalesce(v_rule.statutory_rule_id, statutory_rule_id),
        annual_rate_pkr = coalesce(v_rule.assessment_rate, annual_rate_pkr),
        opening_arrears = coalesce((p_unit->>'opening_arrears')::numeric, opening_arrears),
        state = v_next_state,
        row_version = row_version + 1,
        updated_at = now(),
        submitted_at = CASE WHEN v_next_state = 'SUBMITTED' THEN now() ELSE submitted_at END
    WHERE id = v_unit.id
    RETURNING * INTO v_unit;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES (
    'SURVEY_UNIT',v_unit.id,'EDIT',v_prev_state,v_next_state,
    v_edit_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_UPDATED','SURVEY_UNIT',v_unit.id,
    v_actor.user_id,v_actor.role_code,v_target_circle_id,p_correlation_id,v_prev_state,v_next_state,
    v_edit_reason
  );

  RETURN jsonb_build_object(
    'id', v_unit.id,
    'state', v_unit.state,
    'row_version', v_unit.row_version
  );
END;
$$;

-- 10. Upgraded transition_survey_unit() on pft3_assessment_units
DROP FUNCTION IF EXISTS public.transition_survey_unit(uuid,text,bigint,text,text,text);

CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL
)
RETURNS public.pft3_assessment_units LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v public.pft3_assessment_units;
  a record;
  n text;
  old text;
  v_pin text;
BEGIN
  SELECT * INTO v FROM public.pft3_assessment_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  
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
    v_pin := ptas_private.allocate_pft3_pin(v.id);
    v.permanent_demand_no := coalesce(v.permanent_demand_no, v_pin);
    v.pin_number := v_pin;
    v.provincial_uin := v_pin;
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
$$;

-- 11. Upgraded migrate_potential_unit_to_pft3() writing to pft3_assessment_units
CREATE OR REPLACE FUNCTION public.migrate_potential_unit_to_pft3(
  p_potential_id uuid,
  p_assigned_demand_no text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
  v_pft3_unit public.pft3_assessment_units;
  v_pin text;
  v_new_unit_id uuid;
  v_trans_action text;
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

  IF length(btrim(coalesce(p_assigned_demand_no, ''))) = 0 THEN
    RAISE EXCEPTION 'assigned demand number is required' USING ERRCODE='22023';
  END IF;

  UPDATE public.potential_assessment_units
    SET status = 'MIGRATED',
        migrated_to_demand_no = p_assigned_demand_no,
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
    SET permanent_demand_no = p_assigned_demand_no,
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

    IF v_actor.role_code = 'ETO' THEN
      v_pin := ptas_private.allocate_pft3_pin(v_pft3_unit.id);
    END IF;
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
      p_assigned_demand_no,
      NULL,
      NULL,
      coalesce(v_row.pin_number, v_row.potential_number),
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
      'MIGRATED_POTENTIAL',
      'Migrated from Potential Register to PFT-3',
      CASE WHEN v_actor.role_code = 'INSPECTOR' THEN v_actor.user_id ELSE NULL END,
      CASE WHEN v_actor.role_code = 'ETO' THEN v_actor.user_id ELSE NULL END,
      CASE WHEN v_actor.role_code = 'ETO' THEN now() ELSE NULL END,
      now(),
      v_actor.user_id
    ) RETURNING * INTO v_pft3_unit;

    IF v_actor.role_code = 'ETO' THEN
      v_pin := ptas_private.allocate_pft3_pin(v_pft3_unit.id);
    END IF;
  END IF;

  v_trans_action := CASE WHEN v_actor.role_code='ETO' THEN 'POTENTIAL_UNIT_MIGRATION_APPROVED' ELSE 'POTENTIAL_UNIT_MIGRATION_SUBMITTED' END;
  PERFORM ptas_private.audit_transition(
    v_trans_action, 'POTENTIAL_UNIT', v_row.id,
    v_actor.user_id, v_actor.role_code, v_row.circle_id,
    'potential-migration:' || v_row.id::text,
    'ACTIVE', 'MIGRATED', 'Demand No: ' || p_assigned_demand_no
  );

  RETURN to_jsonb(v_row);
END;
$$;

-- 12. Upgraded promote_survey_import() inserting directly into pft3_assessment_units
CREATE OR REPLACE FUNCTION public.promote_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS public.survey_import_batches LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
      v_row.generated_survey_no,
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

-- 13. Upgraded bulk_submit_survey_import() transitioning pft3_assessment_units
CREATE OR REPLACE FUNCTION public.bulk_submit_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_unit public.pft3_assessment_units;
  v_submitted integer := 0;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,'')))=0
     OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active Inspector may bulk-submit imported units'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.survey_import_batches
  WHERE id=p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002';
  END IF;
  IF v_batch.status<>'IMPORTED' THEN
    RAISE EXCEPTION 'only an imported survey batch may be submitted' USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'batch_id',v_batch.id,
      'submitted_rows',(
        SELECT count(*) FROM public.pft3_assessment_units u
        WHERE u.import_batch_id=v_batch.id
          AND u.responsible_inspector_id=v_actor.user_id
          AND u.state IN ('SUBMITTED','APPROVED')
      ),
      'idempotent_replay',true
    );
  END IF;

  FOR v_unit IN
    SELECT u.*
    FROM public.pft3_assessment_units u
    WHERE u.import_batch_id=v_batch.id
      AND u.responsible_inspector_id=v_actor.user_id
      AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,u.circle_id)
      AND u.state='FEEDED'
    ORDER BY u.id
    FOR UPDATE OF u
  LOOP
    UPDATE public.pft3_assessment_units
    SET state='SUBMITTED',
        row_version=row_version+1,
        submitted_at=now(),
        updated_at=now()
    WHERE id=v_unit.id;

    INSERT INTO public.workflow_actions(
      aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,correlation_id,idempotency_key
    ) VALUES(
      'SURVEY_UNIT',v_unit.id,'SUBMIT','FEEDED','SUBMITTED',v_actor.user_id,v_actor.role_code,
      p_correlation_id,p_idempotency_key||':'||v_unit.id::text
    );

    v_submitted:=v_submitted+1;
  END LOOP;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES(
    'SURVEY_IMPORT',v_batch.id,'BULK_SUBMIT','IMPORTED','SUBMITTED',v_actor.user_id,v_actor.role_code,
    p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_BULK_SUBMITTED','SURVEY_IMPORT',v_batch.id,
    v_actor.user_id,v_actor.role_code,v_actor.jurisdiction_id,
    p_correlation_id,'IMPORTED','SUBMITTED',
    format('%s imported unit(s) submitted for ETO statutory review',v_submitted)
  );

  RETURN jsonb_build_object(
    'batch_id',v_batch.id,
    'submitted_rows',v_submitted,
    'idempotent_replay',false
  );
END;
$$;

-- 14. Upgraded bulk_approve_survey_import() transitioning pft3_assessment_units
CREATE OR REPLACE FUNCTION public.bulk_approve_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_unit public.pft3_assessment_units;
  v_approved integer := 0;
  v_pin text;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,'')))=0
     OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active ETO may bulk-approve imported units'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.survey_import_batches
  WHERE id=p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002';
  END IF;
  IF v_batch.status<>'IMPORTED'
     OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_batch.jurisdiction_id) THEN
    RAISE EXCEPTION 'batch is not eligible in the ETO jurisdiction' USING ERRCODE='42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'batch_id',v_batch.id,
      'approved_rows',(
        SELECT count(*) FROM public.pft3_assessment_units u
        WHERE u.import_batch_id=v_batch.id AND u.state='APPROVED'
      ),
      'idempotent_replay',true
    );
  END IF;

  FOR v_unit IN
    SELECT u.*
    FROM public.pft3_assessment_units u
    WHERE u.import_batch_id=v_batch.id
    ORDER BY u.id
    FOR UPDATE OF u
  LOOP
    IF v_unit.state<>'SUBMITTED' THEN
      RAISE EXCEPTION 'every unit must be Submitted before bulk approval'
        USING ERRCODE='23514';
    END IF;
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_unit.circle_id) THEN
      RAISE EXCEPTION 'batch contains a unit outside the ETO jurisdiction'
        USING ERRCODE='42501';
    END IF;
    IF v_unit.statutory_rule_id IS NULL THEN
      RAISE EXCEPTION 'all units require resolved statutory classification before approval'
        USING ERRCODE='23514';
    END IF;

    v_pin := ptas_private.allocate_pft3_pin(v_unit.id);

    UPDATE public.pft3_assessment_units
    SET state='APPROVED',
        row_version=row_version+1,
        approved_at=now(),
        approved_by=v_actor.user_id,
        pin_number=v_pin,
        provincial_uin=v_pin,
        permanent_demand_no=coalesce(nullif(btrim(permanent_demand_no),''), v_pin),
        updated_at=now()
    WHERE id=v_unit.id;

    INSERT INTO public.workflow_actions(
      aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key
    ) VALUES(
      'SURVEY_UNIT',v_unit.id,'APPROVE','SUBMITTED','APPROVED',p_reason,v_actor.user_id,v_actor.role_code,
      p_correlation_id,p_idempotency_key||':'||v_unit.id::text
    );

    v_approved:=v_approved+1;
  END LOOP;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES(
    'SURVEY_IMPORT',v_batch.id,'BULK_APPROVE','SUBMITTED','APPROVED',p_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_BULK_APPROVED','SURVEY_IMPORT',v_batch.id,
    v_actor.user_id,v_actor.role_code,v_actor.jurisdiction_id,
    p_correlation_id,'SUBMITTED','APPROVED',
    format('%s imported unit(s) approved and registered in PFT-3',v_approved)
  );

  RETURN jsonb_build_object(
    'batch_id',v_batch.id,
    'approved_rows',v_approved,
    'idempotent_replay',false
  );
END;
$$;

-- 15. Explicit Grants & Hardening
REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit(uuid,jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promote_survey_import(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_survey_import(uuid,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_submit_survey_import(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_submit_survey_import(uuid,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_approve_survey_import(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_approve_survey_import(uuid,text,text,text) TO authenticated, service_role;

COMMIT;

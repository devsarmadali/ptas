-- ============================================================================
-- PTAS Migration 0061: Comprehensive Security, Authorization & Data-Integrity Hardening
-- ============================================================================
-- Non-destructive forward migration addressing:
-- 1. Least-privilege table/view grants (revoking anon/authenticated write & TRUNCATE).
-- 2. Eliminating permissive ALL/direct-write RLS policies and fixing survey_import_batches_select typo.
-- 3. Hardening Supabase Storage bucket settings and dropping anonymous demo object policies.
-- 4. Revoking internal ptas_private helpers from anon/authenticated and dropping legacy/dangerous RPCs.
-- 5. Enforcing immutability triggers & partial unique indexes on pft2_receipts and assessment_versions.
-- 6. Closing double-payment, unissued/unapproved challan, cancellation replay, and broken potential migration gaps.
-- 7. Eliminating privilege escalation, email collision takeover, cross-district hijack, and weak password checks in user management RPCs.
-- 8. Fixing IDOR in get_assessment_versions, cross-jurisdiction hijack in potential units, Director division scoping, and PII leaks in public verification.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE, VIEW & DEFAULT PRIVILEGE LOCKDOWN
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_rel text;
  v_authenticated_select_tables text[] := ARRAY[
    'app_users',
    'approval_evidence',
    'assessment_versions',
    'audit_events',
    'designated_bank_branches',
    'financial_years',
    'geo_circles',
    'geo_districts',
    'geo_divisions',
    'geo_tehsils',
    'jurisdictions',
    'legal_configuration_versions',
    'pft2_challans',
    'pft2_receipts',
    'pft3_assessment_units',
    'potential_assessment_units',
    'roles',
    'survey_classification_rate_packs',
    'survey_classification_rules',
    'survey_import_batches',
    'survey_import_rows',
    'tax_categories',
    'user_jurisdiction_assignments',
    'user_roles'
  ];
BEGIN
  FOREACH v_rel IN ARRAY v_authenticated_select_tables LOOP
    IF to_regclass('public.' || quote_ident(v_rel)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_rel);
    END IF;
  END LOOP;

  -- Internal/legacy tables must remain unreadable/unwritable to anon and authenticated directly.
  -- Guard with relrowsecurity so we never take a redundant AccessExclusiveLock when RLS is already active.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'workflow_actions' AND NOT c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE public.workflow_actions ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'district_monthly_notice_sequences' AND NOT c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE public.district_monthly_notice_sequences ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'potential_pft2_challans_deprecated' AND NOT c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE public.potential_pft2_challans_deprecated ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

COMMIT;

-- Ensure view cannot be queried anonymously or mutated
BEGIN;
ALTER VIEW IF EXISTS public.potential_pft2_challans SET (security_invoker = true);
COMMIT;

-- ============================================================================
-- 2. RLS POLICY HARDENING & TYPO FIXES (Single-table transactions)
-- ============================================================================

-- Scope user/role/assignment/unit/receipt/audit SELECT policies in single-table transactions
-- following canonical runtime lock order to avoid AB-BA deadlocks with active traffic.
BEGIN;
DROP POLICY IF EXISTS app_users_select ON public.app_users;
CREATE POLICY app_users_select
  ON public.app_users
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['ADMIN']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['DIRECTOR', 'DET', 'ETO']) a
      JOIN public.user_roles ur ON ur.user_id = app_users.id AND ur.valid_to IS NULL
      WHERE ur.jurisdiction_id IN (
        SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
      )
    )
  );
COMMIT;

BEGIN;
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT au.id FROM public.app_users au WHERE au.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['ADMIN']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['DIRECTOR', 'DET', 'ETO']) a
      WHERE user_roles.jurisdiction_id IN (
        SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
      )
    )
  );
COMMIT;

BEGIN;
DROP POLICY IF EXISTS user_jurisdiction_assignments_select ON public.user_jurisdiction_assignments;
CREATE POLICY user_jurisdiction_assignments_select
  ON public.user_jurisdiction_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT au.id FROM public.app_users au WHERE au.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['ADMIN']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['DIRECTOR', 'DET', 'ETO']) a
      WHERE coalesce(
        user_jurisdiction_assignments.circle_id,
        user_jurisdiction_assignments.district_id,
        user_jurisdiction_assignments.division_id
      ) IN (
        SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
      )
    )
  );
COMMIT;

-- Replace permissive ALL policy on pft3_assessment_units with jurisdiction-scoped SELECT only.
-- All writes must flow through audited SECURITY DEFINER RPCs.
BEGIN;
DROP POLICY IF EXISTS pft3_assessment_units_all ON public.pft3_assessment_units;
DROP POLICY IF EXISTS pft3_assessment_units_select ON public.pft3_assessment_units;
CREATE POLICY pft3_assessment_units_select
  ON public.pft3_assessment_units
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(NULL) a
      WHERE a.role_code = 'ADMIN'
         OR pft3_assessment_units.circle_id IN (
              SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
            )
    )
  );
COMMIT;

-- Eliminate direct client INSERT/UPDATE RLS bypass policies on ledger/version/potential tables
BEGIN;
DROP POLICY IF EXISTS potential_assessment_units_write ON public.potential_assessment_units;
DROP POLICY IF EXISTS potential_assessment_units_insert ON public.potential_assessment_units;
DROP POLICY IF EXISTS potential_assessment_units_update ON public.potential_assessment_units;
COMMIT;

BEGIN;
DROP POLICY IF EXISTS potential_pft2_challans_select ON public.potential_pft2_challans_deprecated;
COMMIT;

BEGIN;
DROP POLICY IF EXISTS pft2_receipts_write ON public.pft2_receipts;
DROP POLICY IF EXISTS pft2_receipts_insert_policy ON public.pft2_receipts;
DROP POLICY IF EXISTS pft2_receipts_select ON public.pft2_receipts;
CREATE POLICY pft2_receipts_select
  ON public.pft2_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(NULL) a
      LEFT JOIN public.pft3_assessment_units p ON p.id = pft2_receipts.pft3_unit_id
      LEFT JOIN public.potential_assessment_units pau ON pau.id = pft2_receipts.potential_unit_id
      LEFT JOIN public.pft2_challans c ON c.id = pft2_receipts.challan_id
      WHERE a.role_code = 'ADMIN'
         OR coalesce(p.circle_id, pau.circle_id, c.jurisdiction_id) IN (
              SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
            )
    )
  );
COMMIT;

BEGIN;
DROP POLICY IF EXISTS assessment_versions_insert_policy ON public.assessment_versions;
COMMIT;

BEGIN;
DROP POLICY IF EXISTS audit_select ON public.audit_events;
CREATE POLICY audit_select
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['AUDITOR', 'DIRECTOR', 'DET', 'ETO', 'ADMIN']) a
      WHERE a.role_code = 'ADMIN'
         OR (
           audit_events.jurisdiction_id IS NOT NULL
           AND audit_events.jurisdiction_id IN (
             SELECT aj.jurisdiction_id::text
             FROM ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
           )
         )
    )
  );
COMMIT;

-- Fix live RLS bug: previous policy checked jurisdiction_contains(a.jurisdiction_id, a.jurisdiction_id)
BEGIN;
DROP POLICY IF EXISTS survey_import_batches_select ON public.survey_import_batches;
CREATE POLICY survey_import_batches_select
  ON public.survey_import_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(NULL) a
      WHERE a.role_code = 'ADMIN'
         OR ptas_private.jurisdiction_contains(
              a.jurisdiction_id,
              survey_import_batches.jurisdiction_id
            )
    )
  );
COMMIT;

-- ============================================================================
-- 3. SUPABASE STORAGE BUCKET & OBJECT POLICY LOCKDOWN
-- ============================================================================

BEGIN;
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon upload receipts for pilot demo" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon read receipts for pilot demo" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated read receipts" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated upload receipts" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS ptas_receipts_authenticated_select ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS ptas_receipts_authenticated_insert ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS ptas_docs_authenticated_select ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS ptas_docs_authenticated_insert ON storage.objects';

    EXECUTE $pol$
      CREATE POLICY ptas_receipts_authenticated_select
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'receipts-challan32a'
          AND EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL))
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ptas_receipts_authenticated_insert
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'receipts-challan32a'
          AND EXISTS (
            SELECT 1 FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'FINANCE'])
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ptas_docs_authenticated_select
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'documents-pft2'
          AND EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL))
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ptas_docs_authenticated_insert
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'documents-pft2'
          AND EXISTS (
            SELECT 1 FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'DIRECTOR'])
          )
        )
    $pol$;
  END IF;
END;
$$;
COMMIT;

BEGIN;
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    WHERE id = 'receipts-challan32a';

    UPDATE storage.buckets
    SET
      public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf']
    WHERE id = 'documents-pft2';
  END IF;
END;
$$;
COMMIT;

-- ============================================================================
-- 4. DROP LEGACY / DANGEROUS FUNCTIONS & REVOKE PRIVATE HELPER GRANTS
-- ============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.verify_ptas_public_document(text);
DROP FUNCTION IF EXISTS public.test_drop_trigger();
DROP FUNCTION IF EXISTS public.admin_create_officer(text, text, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_set_officer_password(uuid, text);
DROP FUNCTION IF EXISTS public.update_officer_profile(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.issue_pft2_challan(jsonb, text, text);
DROP FUNCTION IF EXISTS public.insert_potential_assessment_unit(jsonb);
DROP FUNCTION IF EXISTS public.bulk_insert_potential_units(jsonb);
COMMIT;

-- ============================================================================
-- 5. IMMUTABILITY TRIGGERS & FINANCIAL UNIQUE INDEXES
-- ============================================================================

BEGIN;
CREATE OR REPLACE FUNCTION ptas_private.prevent_immutable_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable statutory record in %.% cannot be updated or deleted',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_pft2_receipts_immutable ON public.pft2_receipts;
CREATE TRIGGER trg_pft2_receipts_immutable
  BEFORE UPDATE OR DELETE ON public.pft2_receipts
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.prevent_immutable_record_mutation();

-- Prevent duplicate receipts for the same challan or duplicate bank scroll references
CREATE UNIQUE INDEX IF NOT EXISTS uq_pft2_receipts_challan_id
  ON public.pft2_receipts (challan_id)
  WHERE challan_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pft2_receipts_bank_txn
  ON public.pft2_receipts (upper(btrim(bank_transaction_id)))
  WHERE bank_transaction_id IS NOT NULL AND length(btrim(bank_transaction_id)) > 0;
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_assessment_versions_immutable ON public.assessment_versions;
CREATE TRIGGER trg_assessment_versions_immutable
  BEFORE UPDATE OR DELETE ON public.assessment_versions
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.prevent_immutable_record_mutation();
COMMIT;

-- ============================================================================
-- 6. SECURITY & INTEGRITY GOVERNANCE HELPERS (ptas_private)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION ptas_private.can_manage_target_role(
  p_actor_role text,
  p_target_role text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE upper(coalesce(p_actor_role, ''))
    WHEN 'ADMIN' THEN upper(coalesce(p_target_role, '')) IN ('DIRECTOR', 'DET', 'ETO', 'INSPECTOR', 'ETI', 'FINANCE', 'AUDITOR')
    WHEN 'DIRECTOR' THEN upper(coalesce(p_target_role, '')) IN ('ETO', 'INSPECTOR', 'ETI', 'FINANCE', 'AUDITOR')
    WHEN 'DET' THEN upper(coalesce(p_target_role, '')) IN ('ETO', 'INSPECTOR', 'ETI', 'FINANCE', 'AUDITOR')
    WHEN 'ETO' THEN upper(coalesce(p_target_role, '')) IN ('INSPECTOR', 'ETI')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION ptas_private.revoke_user_auth_sessions(p_auth_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = p_auth_user_id::text;
  EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM auth.sessions WHERE user_id = p_auth_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- Atomic internal helper for potential -> PFT-3 migration so payments resolve pft3_unit_id before receipt INSERT
CREATE OR REPLACE FUNCTION ptas_private.migrate_potential_unit_to_pft3_internal(
  p_potential_id uuid,
  p_assigned_demand_no text,
  p_actor_id uuid,
  p_actor_role text,
  p_actor_jurisdiction_id uuid,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.potential_assessment_units;
  v_pft3_unit public.pft3_assessment_units;
  v_pin text;
  v_demand_no text;
  v_rule public.survey_classification_rules;
  v_annual_rate numeric(18,2);
  v_cat_code text;
  v_cat_name text;
  v_sub_code text;
  v_sub_name text;
BEGIN
  SELECT * INTO v_row
  FROM public.potential_assessment_units
  WHERE id = p_potential_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'potential assessment unit not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_actor_role <> 'ADMIN' AND NOT ptas_private.jurisdiction_contains(p_actor_jurisdiction_id, v_row.circle_id) THEN
    RAISE EXCEPTION 'potential unit is outside your assigned jurisdiction' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled potential unit cannot be migrated to Form P.F.T-3' USING ERRCODE = '23514';
  END IF;

  -- Idempotent handling when already migrated
  IF v_row.status = 'MIGRATED' THEN
    SELECT * INTO v_pft3_unit
    FROM public.pft3_assessment_units
    WHERE (v_row.migrated_to_demand_no IS NOT NULL AND permanent_demand_no = v_row.migrated_to_demand_no AND circle_id = v_row.circle_id)
       OR survey_no = coalesce(v_row.pin_number, v_row.potential_number)
       OR (v_row.pin_number IS NOT NULL AND regexp_replace(pin_number, '-[0-9]{2}$', '') = regexp_replace(v_row.pin_number, '-[0-9]{2}$', ''))
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pft3_unit.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'migrated', true,
        'idempotent_replay', true,
        'potential_id', v_row.id,
        'potential_number', v_row.potential_number,
        'demand_number', v_pft3_unit.permanent_demand_no,
        'pin_number', v_pft3_unit.pin_number,
        'pft3_unit_id', v_pft3_unit.id
      );
    END IF;
  END IF;

  v_demand_no := coalesce(
    ptas_private.normalize_demand_no(p_assigned_demand_no),
    ptas_private.get_next_circle_demand_no(v_row.circle_id)
  );

  v_pin := regexp_replace(coalesce(v_row.pin_number, v_row.provincial_uin, ''), '^Potential-', '', 'i');
  IF v_pin ~ '-(0[1-7])$' THEN
    v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-01');
  ELSIF length(v_pin) >= 20 THEN
    v_pin := v_pin || '-01';
  END IF;

  IF length(coalesce(v_pin, '')) <> 25 OR NOT (v_pin ~ '^[0-9]{3}-[0-9]{18}-01$') THEN
    v_pin := ptas_private.generate_ptas_pin(
      v_row.circle_id,
      v_row.tehsil,
      v_row.district_name,
      v_row.statutory_rule_id,
      false,
      '01'
    );
  END IF;

  -- Prefer authoritative active statutory classification rule values when available
  SELECT * INTO v_rule
  FROM public.survey_classification_rules
  WHERE statutory_rule_id = v_row.statutory_rule_id AND status = 'ACTIVE'
  ORDER BY effective_from DESC
  LIMIT 1;

  v_annual_rate := coalesce(v_rule.assessment_rate, v_row.annual_rate_pkr);
  v_cat_code := coalesce(v_rule.primary_class_code, v_row.category_code);
  v_cat_name := coalesce(v_rule.tax_class, v_row.category_name);
  v_sub_code := coalesce(v_rule.schedule_subclass_code, v_row.subclassification_code);
  v_sub_name := coalesce(v_rule.tax_subclass, v_row.subclassification_name);

  UPDATE public.potential_assessment_units
  SET
    status = 'MIGRATED',
    migrated_to_demand_no = v_demand_no,
    migrated_at = coalesce(migrated_at, now()),
    updated_at = now()
  WHERE id = p_potential_id
  RETURNING * INTO v_row;

  SELECT * INTO v_pft3_unit
  FROM public.pft3_assessment_units
  WHERE (circle_id = v_row.circle_id AND permanent_demand_no = v_demand_no)
     OR pin_number = v_pin
  LIMIT 1;

  IF v_pft3_unit.id IS NULL THEN
    INSERT INTO public.pft3_assessment_units (
      permanent_demand_no, pin_number, provincial_uin, survey_no,
      legal_name, taxpayer_name, trade_name, identifier_type, identifier_value,
      address, locality, circle_id, circle_name, tehsil, district_name,
      category_code, category_name, subclassification_code, subclassification_name,
      statutory_tertiary_code, statutory_tertiary_classification, statutory_rule_id,
      annual_rate_pkr, opening_arrears, financial_year_id,
      state, source, row_version, remarks,
      responsible_inspector_id, approved_by, approved_at, created_by
    ) VALUES (
      v_demand_no, v_pin, v_pin, coalesce(v_row.pin_number, v_row.potential_number),
      v_row.legal_name, v_row.taxpayer_name, v_row.trade_name, v_row.identifier_type, v_row.identifier_value,
      v_row.address, v_row.locality, v_row.circle_id, v_row.circle_name, v_row.tehsil, v_row.district_name,
      v_cat_code, v_cat_name, v_sub_code, v_sub_name,
      v_row.statutory_tertiary_code, v_row.statutory_tertiary_classification, v_row.statutory_rule_id,
      v_annual_rate, v_row.opening_arrears, '2026-2027',
      'APPROVED', 'POTENTIAL_MIGRATION', 1,
      coalesce(v_row.remarks, 'Migrated from Potential Assessment Register'),
      p_actor_id, p_actor_id, now(), p_actor_id
    )
    RETURNING * INTO v_pft3_unit;

    INSERT INTO public.assessment_versions (
      unit_id, version_no, financial_year_id, pin_number, permanent_demand_no,
      category_code, subclassification_code, annual_rate_pkr, opening_arrears,
      status, reason, snapshot, created_by, created_at, approved_by, approved_at
    ) VALUES (
      v_pft3_unit.id, 1, v_pft3_unit.financial_year_id, v_pft3_unit.pin_number, v_pft3_unit.permanent_demand_no,
      v_pft3_unit.category_code, v_pft3_unit.subclassification_code, v_pft3_unit.annual_rate_pkr, v_pft3_unit.opening_arrears,
      'APPROVED', 'Migrated from Potential Register to Form P.F.T-3 Register',
      jsonb_build_object(
        'legalName', v_pft3_unit.legal_name,
        'taxpayerName', v_pft3_unit.taxpayer_name,
        'tradeName', v_pft3_unit.trade_name,
        'categoryName', v_pft3_unit.category_name,
        'subclassificationName', v_pft3_unit.subclassification_name,
        'circleName', v_pft3_unit.circle_name,
        'tehsil', v_pft3_unit.tehsil,
        'districtName', v_pft3_unit.district_name,
        'identifierType', v_pft3_unit.identifier_type,
        'identifierValue', v_pft3_unit.identifier_value,
        'address', v_pft3_unit.address,
        'ratePkr', v_pft3_unit.annual_rate_pkr
      ),
      p_actor_id, now(), p_actor_id, now()
    )
    ON CONFLICT (unit_id, version_no) DO NOTHING;
  END IF;

  INSERT INTO public.audit_events (
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role,
    jurisdiction_id, correlation_id, payload, occurred_at
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_MIGRATED', 'POTENTIAL_UNIT', v_row.id::text,
    p_actor_id::text, p_actor_role, v_row.circle_id::text,
    coalesce(nullif(btrim(p_correlation_id), ''), 'potential-migrate:' || v_row.id::text),
    jsonb_build_object(
      'potential_number', v_row.potential_number,
      'assigned_demand_no', v_demand_no,
      'pin_number', v_pin,
      'pft3_unit_id', v_pft3_unit.id,
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
    'pft3_unit_id', v_pft3_unit.id
  );
END;
$$;

-- ============================================================================
-- 7. HARDEN USER MANAGEMENT & GOVERNANCE RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_officer(
  p_name text,
  p_email text,
  p_role text,
  p_circle_id uuid,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text,
  p_initial_password text,
  p_ppo_number text DEFAULT NULL,
  p_father_name text DEFAULT NULL,
  p_bps_scale smallint DEFAULT 14,
  p_transfer_order_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_auth_user_id uuid;
  v_app_user_id uuid;
  v_target_jurisdiction public.jurisdictions;
  v_geo_circle public.geo_circles;
  v_normalized_email text;
  v_requested_role text;
  v_target_jurisdiction_id uuid;
  v_scope_check_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR', 'DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  v_requested_role := upper(btrim(coalesce(p_role, 'INSPECTOR')));
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = v_requested_role) THEN
    RAISE EXCEPTION 'invalid statutory officer role: %', v_requested_role USING ERRCODE = '22023';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_requested_role) THEN
    RAISE EXCEPTION 'insufficient authority to provision officer with role %', v_requested_role USING ERRCODE = '42501';
  END IF;

  v_normalized_email := lower(btrim(coalesce(p_email, '')));
  IF v_normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'valid email address is required' USING ERRCODE = '22023';
  END IF;

  IF length(coalesce(p_initial_password, '')) < 12 THEN
    RAISE EXCEPTION 'initial password must be at least 12 characters' USING ERRCODE = '22023';
  END IF;

  IF p_bps_scale IS NOT NULL AND (p_bps_scale < 1 OR p_bps_scale > 22) THEN
    RAISE EXCEPTION 'BPS scale must be between 1 and 22' USING ERRCODE = '22023';
  END IF;

  -- Reject duplicate emails so provisioning can never hijack or overwrite an existing account
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_normalized_email)
     OR EXISTS (SELECT 1 FROM public.app_users WHERE lower(coalesce(email, '')) = v_normalized_email) THEN
    RAISE EXCEPTION 'an officer account with this email already exists' USING ERRCODE = '23505';
  END IF;

  -- Resolve target jurisdiction across both jurisdictions & geo_circles
  SELECT * INTO v_target_jurisdiction FROM public.jurisdictions WHERE id = p_circle_id;
  SELECT * INTO v_geo_circle FROM public.geo_circles
  WHERE id = p_circle_id
     OR circle_code = coalesce(v_target_jurisdiction.code, '')
     OR (v_target_jurisdiction.code = 'CIR_VEH_01' AND circle_code = 'VHR-1')
  LIMIT 1;

  IF v_target_jurisdiction.id IS NULL AND v_geo_circle.id IS NOT NULL THEN
    SELECT * INTO v_target_jurisdiction FROM public.jurisdictions
    WHERE code = v_geo_circle.circle_code
       OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
    LIMIT 1;
  END IF;

  IF v_target_jurisdiction.id IS NULL THEN
    RAISE EXCEPTION 'assigned jurisdiction not found' USING ERRCODE = 'P0002';
  END IF;

  v_target_jurisdiction_id := v_target_jurisdiction.id;
  v_scope_check_id := coalesce(v_geo_circle.id, v_target_jurisdiction.id);

  IF v_actor.role_code IN ('ETO', 'DIRECTOR', 'DET') THEN
    IF v_actor.jurisdiction_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_scope_check_id) THEN
      RAISE EXCEPTION 'target jurisdiction is outside your assigned authority boundary' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_auth_user_id := gen_random_uuid();
  INSERT INTO auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-4000-8000-000000000000',
    v_auth_user_id,
    'authenticated',
    'authenticated',
    v_normalized_email,
    extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', btrim(p_name), 'sub', v_auth_user_id),
    now(),
    now()
  );

  INSERT INTO auth.identities(
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, email
  ) VALUES (
    gen_random_uuid(),
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id, 'email', v_normalized_email, 'name', btrim(p_name)),
    'email',
    NULL,
    now(),
    now(),
    v_normalized_email
  );

  v_app_user_id := gen_random_uuid();
  INSERT INTO public.app_users(
    id, auth_user_id, display_name, email, phone, cnic, designation, office_address,
    ppo_number, father_name, bps_scale, must_change_password, active, created_at, updated_at
  ) VALUES (
    v_app_user_id,
    v_auth_user_id,
    btrim(p_name),
    v_normalized_email,
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_cnic), ''),
    nullif(btrim(p_designation), ''),
    nullif(btrim(p_office_address), ''),
    nullif(btrim(p_ppo_number), ''),
    nullif(btrim(p_father_name), ''),
    coalesce(p_bps_scale, 14),
    true,
    true,
    now(),
    now()
  );

  INSERT INTO public.user_jurisdiction_assignments (
    user_id, role_code, circle_id, district_id, division_id,
    valid_from, valid_to, is_primary, assigned_by, transfer_order_number, created_at
  ) VALUES (
    v_app_user_id,
    v_requested_role,
    v_geo_circle.id,
    v_geo_circle.district_id,
    v_geo_circle.division_id,
    now(),
    NULL,
    true,
    v_actor.user_id,
    coalesce(nullif(btrim(p_transfer_order_number), ''), 'ONBOARDING-APPOINTMENT'),
    now()
  );

  -- Ensure synced active user_roles row reflects the canonical jurisdictions FK ID
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_app_user_id AND valid_to IS NULL AND jurisdiction_id = v_target_jurisdiction_id AND role_code = v_requested_role
  ) THEN
    UPDATE public.user_roles SET valid_to = now() WHERE user_id = v_app_user_id AND valid_to IS NULL;
    INSERT INTO public.user_roles(id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
    VALUES (gen_random_uuid(), v_app_user_id, v_requested_role, v_target_jurisdiction_id, now(), NULL, now());
  END IF;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PROVISIONED',
    'USER_ACCOUNT',
    v_app_user_id,
    v_actor.user_id,
    v_actor.role_code,
    v_target_jurisdiction_id,
    'officer-create:' || v_app_user_id::text,
    'NON_EXISTENT',
    'ACTIVE',
    jsonb_build_object(
      'name', btrim(p_name),
      'email', v_normalized_email,
      'role', v_requested_role,
      'circle_id', v_target_jurisdiction_id,
      'transfer_order_number', p_transfer_order_number
    )::text
  );

  RETURN jsonb_build_object(
    'id', v_app_user_id,
    'auth_user_id', v_auth_user_id,
    'name', btrim(p_name),
    'email', v_normalized_email,
    'role', v_requested_role,
    'circle_id', v_target_jurisdiction_id,
    'circle_name', coalesce(v_geo_circle.name, v_target_jurisdiction.name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_officer_password(
  p_target_user_id uuid,
  p_new_password text,
  p_must_change boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS session required' USING ERRCODE = '42501';
  END IF;

  IF length(coalesce(p_new_password, '')) < 12 THEN
    RAISE EXCEPTION 'password must be at least 12 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_target_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'target user not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'target user has no linked authentication identity' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_target_user_id AND valid_to IS NULL LIMIT 1;

  IF v_actor.user_id = p_target_user_id THEN
    -- Self password rotation permitted
    NULL;
  ELSIF ptas_private.can_manage_target_role(v_actor.role_code, coalesce(v_target_role.role_code, 'INSPECTOR')) THEN
    IF v_actor.role_code <> 'ADMIN' THEN
      IF v_target_role.jurisdiction_id IS NULL
         OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
        RAISE EXCEPTION 'subordinate officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized to reset password for target role or user' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_target_user.auth_user_id;

  UPDATE public.app_users
  SET must_change_password = CASE
        WHEN v_actor.user_id = p_target_user_id THEN false
        ELSE coalesce(p_must_change, true)
      END,
      last_password_change = now(),
      updated_at = now()
  WHERE id = p_target_user_id;

  IF v_actor.user_id <> p_target_user_id THEN
    PERFORM ptas_private.revoke_user_auth_sessions(v_target_user.auth_user_id);
  END IF;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PASSWORD_RESET',
    'USER_ACCOUNT',
    p_target_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'password-reset:' || p_target_user_id::text,
    'PREVIOUS_CREDENTIAL',
    'UPDATED_CREDENTIAL',
    'Credential reset by ' || v_actor.role_code || '; sessions_revoked=' || (v_actor.user_id <> p_target_user_id)::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'Officer password has been securely updated'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_officer_status(
  p_user_id uuid,
  p_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR', 'DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  IF v_actor.user_id = p_user_id THEN
    RAISE EXCEPTION 'officers cannot suspend or toggle their own account status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, coalesce(v_target_role.role_code, 'INSPECTOR')) THEN
    RAISE EXCEPTION 'insufficient authority to change status for target role' USING ERRCODE = '42501';
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF v_target_role.jurisdiction_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
      RAISE EXCEPTION 'target officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.app_users
  SET
    active = p_active,
    deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  IF NOT coalesce(p_active, false) THEN
    PERFORM ptas_private.revoke_user_auth_sessions(v_target_user.auth_user_id);
  END IF;

  PERFORM ptas_private.audit_transition(
    CASE WHEN p_active THEN 'OFFICER_ACTIVATED' ELSE 'OFFICER_SUSPENDED' END,
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'officer-status:' || p_user_id::text,
    (CASE WHEN p_active THEN 'INACTIVE' ELSE 'ACTIVE' END),
    (CASE WHEN p_active THEN 'ACTIVE' ELSE 'INACTIVE' END),
    coalesce(nullif(btrim(p_reason), ''), 'Officer status modified by authorized supervisor')
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_officer_posting(
  p_user_id uuid,
  p_target_circle_id uuid,
  p_transfer_order_number text,
  p_is_primary boolean DEFAULT true,
  p_handing_over_notes text DEFAULT NULL,
  p_relieve_current_incumbent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
  v_effective_role text;
  v_geo_circle public.geo_circles;
  v_legacy_jurisdiction public.jurisdictions;
  v_incumbent_user_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR', 'DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'officer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;
  v_effective_role := coalesce(v_target_role.role_code, 'INSPECTOR');

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_effective_role) THEN
    RAISE EXCEPTION 'insufficient authority to transfer target officer role %', v_effective_role USING ERRCODE = '42501';
  END IF;

  -- Resolve target permanent circle
  SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = p_target_circle_id;
  IF v_geo_circle.id IS NULL THEN
    SELECT * INTO v_legacy_jurisdiction FROM public.jurisdictions WHERE id = p_target_circle_id;
    IF v_legacy_jurisdiction.id IS NOT NULL THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles
      WHERE circle_code = v_legacy_jurisdiction.code
         OR (v_legacy_jurisdiction.code = 'CIR_VEH_01' AND circle_code = 'VHR-1')
      LIMIT 1;
    END IF;
  END IF;

  IF v_geo_circle.id IS NULL THEN
    RAISE EXCEPTION 'target permanent circle not found' USING ERRCODE = 'P0002';
  END IF;

  -- Enforce authority boundary on BOTH target user's current posting AND destination circle
  IF v_actor.role_code <> 'ADMIN' THEN
    IF v_target_role.jurisdiction_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
      RAISE EXCEPTION 'officer current posting is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_geo_circle.id) THEN
      RAISE EXCEPTION 'target circle is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_legacy_jurisdiction
  FROM public.jurisdictions
  WHERE code = v_geo_circle.circle_code
     OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
  LIMIT 1;

  IF p_relieve_current_incumbent THEN
    SELECT user_id INTO v_incumbent_user_id
    FROM public.user_jurisdiction_assignments
    WHERE circle_id = v_geo_circle.id AND valid_to IS NULL AND is_primary = true
    LIMIT 1;

    IF v_incumbent_user_id IS NOT NULL AND v_incumbent_user_id <> p_user_id THEN
      UPDATE public.user_jurisdiction_assignments
      SET valid_to = now(),
          handing_over_notes = 'Relieved by transfer order ' || coalesce(p_transfer_order_number, '')
      WHERE user_id = v_incumbent_user_id AND circle_id = v_geo_circle.id AND valid_to IS NULL;
    END IF;
  END IF;

  IF p_is_primary THEN
    UPDATE public.user_jurisdiction_assignments
    SET valid_to = now(),
        handing_over_notes = coalesce(p_handing_over_notes, 'Transferred under order ' || coalesce(p_transfer_order_number, ''))
    WHERE user_id = p_user_id AND valid_to IS NULL AND is_primary = true;
  END IF;

  INSERT INTO public.user_jurisdiction_assignments (
    user_id, role_code, circle_id, district_id, division_id,
    valid_from, valid_to, is_primary, assigned_by,
    transfer_order_number, handing_over_notes, created_at
  ) VALUES (
    p_user_id,
    v_effective_role,
    v_geo_circle.id,
    v_geo_circle.district_id,
    v_geo_circle.division_id,
    now(),
    NULL,
    p_is_primary,
    v_actor.user_id,
    p_transfer_order_number,
    p_handing_over_notes,
    now()
  );

  IF p_is_primary THEN
    UPDATE public.user_roles SET valid_to = now() WHERE user_id = p_user_id AND valid_to IS NULL;
    INSERT INTO public.user_roles (id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      v_effective_role,
      coalesce(v_legacy_jurisdiction.id, v_geo_circle.id),
      now(),
      NULL,
      now()
    );
  END IF;

  PERFORM ptas_private.audit_transition(
    'OFFICER_TRANSFERRED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_legacy_jurisdiction.id, v_geo_circle.id),
    'officer-transfer:' || p_user_id::text,
    CASE WHEN p_is_primary THEN 'PRIMARY_TRANSFER' ELSE 'ADDITIONAL_CHARGE' END,
    v_geo_circle.circle_code,
    jsonb_build_object(
      'circle_code', v_geo_circle.circle_code,
      'transfer_order_number', p_transfer_order_number,
      'is_primary', p_is_primary,
      'notes', p_handing_over_notes
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'circle_id', v_geo_circle.id,
    'circle_code', v_geo_circle.circle_code,
    'circle_name', v_geo_circle.name,
    'transfer_order_number', p_transfer_order_number,
    'is_primary', p_is_primary
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_officer_profile(
  p_user_id uuid,
  p_display_name text,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text,
  p_ppo_number text DEFAULT NULL,
  p_father_name text DEFAULT NULL,
  p_bps_scale smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS session required' USING ERRCODE = '42501';
  END IF;

  IF p_bps_scale IS NOT NULL AND (p_bps_scale < 1 OR p_bps_scale > 22) THEN
    RAISE EXCEPTION 'BPS scale must be between 1 and 22' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;

  IF v_actor.user_id = p_user_id THEN
    NULL;
  ELSIF ptas_private.can_manage_target_role(v_actor.role_code, coalesce(v_target_role.role_code, 'INSPECTOR')) THEN
    IF v_actor.role_code <> 'ADMIN' THEN
      IF v_target_role.jurisdiction_id IS NULL
         OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
        RAISE EXCEPTION 'target officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized to modify target officer profile' USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_users
  SET
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    phone = nullif(btrim(p_phone), ''),
    cnic = nullif(btrim(p_cnic), ''),
    designation = nullif(btrim(p_designation), ''),
    office_address = nullif(btrim(p_office_address), ''),
    ppo_number = coalesce(nullif(btrim(p_ppo_number), ''), ppo_number),
    father_name = coalesce(nullif(btrim(p_father_name), ''), father_name),
    bps_scale = coalesce(p_bps_scale, bps_scale),
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PROFILE_UPDATED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'user-mgmt:' || p_user_id::text,
    'ACTIVE',
    'ACTIVE',
    jsonb_build_object(
      'display_name', v_target_user.display_name,
      'designation', v_target_user.designation,
      'ppo_number', v_target_user.ppo_number
    )::text
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_circle_to_tehsil(
  p_circle_id uuid,
  p_tehsil_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_circle public.jurisdictions;
  v_tehsil public.jurisdictions;
  v_old_parent_id uuid;
  v_audit_reason text;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR', 'DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_circle FROM public.jurisdictions WHERE id = p_circle_id FOR UPDATE;
  IF v_circle.id IS NULL OR v_circle.tier <> 'CIRCLE' THEN
    RAISE EXCEPTION 'jurisdiction must be an active administrative Circle' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_tehsil FROM public.jurisdictions WHERE id = p_tehsil_id;
  IF v_tehsil.id IS NULL OR v_tehsil.tier <> 'TEHSIL' THEN
    RAISE EXCEPTION 'target jurisdiction must be an active Tehsil' USING ERRCODE = '23514';
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_circle_id)
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_tehsil_id) THEN
      RAISE EXCEPTION 'circle or tehsil is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_old_parent_id := v_circle.parent_id;
  UPDATE public.jurisdictions SET parent_id = p_tehsil_id WHERE id = p_circle_id;

  v_audit_reason := coalesce(nullif(btrim(p_reason), ''), 'Circle re-attached to Tehsil under statutory administrative authority');
  PERFORM ptas_private.audit_transition(
    'CIRCLE_TEHSIL_ATTACHED',
    'JURISDICTION',
    p_circle_id,
    v_actor.user_id,
    v_actor.role_code,
    p_circle_id,
    'tehsil-attach:' || p_circle_id::text,
    coalesce(v_old_parent_id::text, 'UNATTACHED'),
    p_tehsil_id::text,
    v_audit_reason
  );

  RETURN jsonb_build_object(
    'circle_id', p_circle_id,
    'circle_name', v_circle.name,
    'new_tehsil_id', p_tehsil_id,
    'new_tehsil_name', v_tehsil.name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_officers_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor.role_code <> 'ADMIN'
  ),
  inspector_counts AS MATERIALIZED (
    SELECT responsible_inspector_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units
    WHERE responsible_inspector_id IS NOT NULL
    GROUP BY responsible_inspector_id
  ),
  circle_counts AS MATERIALIZED (
    SELECT circle_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units
    WHERE circle_id IS NOT NULL
    GROUP BY circle_id
  ),
  officer_data AS (
    SELECT
      u.id AS user_id,
      u.auth_user_id,
      u.display_name AS name,
      coalesce(u.email, au.email, '') AS email,
      coalesce(u.phone, '') AS phone,
      CASE
        WHEN v_actor.role_code = 'ADMIN' OR u.id = v_actor.user_id THEN coalesce(u.cnic, '')
        WHEN length(coalesce(u.cnic, '')) >= 6 THEN left(u.cnic, 5) || '-*******-' || right(u.cnic, 1)
        ELSE ''
      END AS cnic,
      coalesce(u.designation, '') AS designation,
      coalesce(u.office_address, j.office_address, '') AS office_address,
      coalesce(u.ppo_number, '') AS ppo_number,
      coalesce(u.father_name, '') AS father_name,
      coalesce(u.bps_scale, 14)::int AS bps_scale,
      coalesce(u.must_change_password, false) AS must_change_password,
      u.active,
      u.created_at,
      ur.role_code AS role,
      ur.jurisdiction_id,
      coalesce(gc.circle_code, j.code, '') AS circle_code,
      coalesce(gc.name, j.name, '') AS circle_name,
      coalesce(gc.id, j.id) AS circle_id,
      coalesce(gt.id, teh.id) AS tehsil_id,
      coalesce(gt.name, teh.name, '') AS tehsil_name,
      coalesce(gd.id, dist.id) AS district_id,
      coalesce(gd.name, dist.name, '') AS district_name,
      coalesce(gd.district_code, dist.abbreviation, '') AS district_code,
      coalesce(gd.pbs_code, '') AS pbs_code,
      coalesce(gdiv.name, '') AS division_name,
      coalesce(uja.is_primary, true) AS is_primary,
      coalesce(uja.transfer_order_number, '') AS transfer_order_number,
      uja.valid_from AS posting_date,
      coalesce(ic.cnt, 0)::int AS assigned_survey_units_count,
      (coalesce(cc_ur.cnt, 0) + coalesce(cc_gc.cnt, 0))::int AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    LEFT JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    LEFT JOIN public.geo_circles gc
      ON gc.circle_code = j.code
      OR gc.id = j.id
      OR (j.code = 'CIR_VEH_01' AND gc.circle_code = 'VHR-1')
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_divisions gdiv ON gdiv.id = gd.division_id
    LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist
      ON dist.id = CASE
        WHEN j.tier = 'DISTRICT' THEN j.id
        WHEN teh.id IS NOT NULL THEN teh.parent_id
        ELSE j.parent_id
      END
      AND dist.tier = 'DISTRICT'
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.user_id = u.id AND uja.valid_to IS NULL AND uja.is_primary = true
    LEFT JOIN inspector_counts ic ON ic.responsible_inspector_id = u.id
    LEFT JOIN circle_counts cc_ur ON cc_ur.circle_id = ur.jurisdiction_id
    LEFT JOIN circle_counts cc_gc ON gc.id IS NOT NULL AND gc.id <> ur.jurisdiction_id AND cc_gc.circle_id = gc.id
    WHERE
      v_actor.role_code = 'ADMIN'
      OR (
        v_actor.role_code IN ('DIRECTOR', 'DET', 'ETO')
        AND EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = ur.jurisdiction_id)
      )
      OR u.id = v_actor.user_id
    ORDER BY
      CASE ur.role_code WHEN 'ADMIN' THEN 1 WHEN 'DIRECTOR' THEN 2 WHEN 'ETO' THEN 3 WHEN 'INSPECTOR' THEN 4 ELSE 5 END,
      coalesce(gc.circle_code, j.name),
      u.display_name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(od)), '[]'::jsonb) INTO v_result
  FROM officer_data od;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor.role_code <> 'ADMIN'
  ),
  unit_stats AS MATERIALIZED (
    SELECT
      circle_id,
      count(*)::int AS units_count,
      count(*) FILTER (WHERE state = 'APPROVED')::int AS approved_units_count,
      coalesce(sum(annual_rate_pkr) FILTER (WHERE state = 'APPROVED'), 0)::numeric AS total_assessed_demand
    FROM public.pft3_assessment_units
    WHERE circle_id IS NOT NULL
    GROUP BY circle_id
  ),
  circle_stats AS (
    SELECT
      gc.id AS circle_id,
      gc.circle_code AS circle_code,
      gc.name AS circle_name,
      coalesce(gt.name, '') AS tehsil_name,
      coalesce(gt.tehsil_code::text, '') AS tehsil_code,
      coalesce(gt.id, '00000000-0000-0000-0000-000000000000'::uuid) AS tehsil_id,
      gd.id AS district_id,
      gd.name AS district_name,
      gd.district_code AS district_code,
      u.id AS inspector_id,
      u.display_name AS inspector_name,
      CASE
        WHEN v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET', 'ETO') OR u.id = v_actor.user_id
          THEN u.phone
        ELSE NULL
      END AS inspector_phone,
      CASE
        WHEN v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET', 'ETO') OR u.id = v_actor.user_id
          THEN u.email
        ELSE NULL
      END AS inspector_email,
      u.ppo_number AS inspector_ppo,
      uja.is_primary AS is_primary_charge,
      uja.transfer_order_number AS transfer_order_number,
      uja.valid_from AS posting_date,
      (coalesce(max(us_geo.units_count), 0) + coalesce(sum(us_leg.units_count), 0))::int AS units_count,
      (coalesce(max(us_geo.approved_units_count), 0) + coalesce(sum(us_leg.approved_units_count), 0))::int AS approved_units_count,
      (coalesce(max(us_geo.total_assessed_demand), 0) + coalesce(sum(us_leg.total_assessed_demand), 0))::numeric AS total_assessed_demand
    FROM public.geo_circles gc
    JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.circle_id = gc.id AND uja.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = uja.user_id AND u.active = true
    LEFT JOIN public.jurisdictions leg_c
      ON leg_c.code = gc.circle_code
      OR (gc.circle_code = 'VHR-1' AND leg_c.code = 'CIR_VEH_01')
    LEFT JOIN unit_stats us_geo ON us_geo.circle_id = gc.id
    LEFT JOIN unit_stats us_leg ON leg_c.id IS NOT NULL AND leg_c.id <> gc.id AND us_leg.circle_id = leg_c.id
    WHERE (
      v_actor.role_code = 'ADMIN'
      OR EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = gc.id)
      OR (leg_c.id IS NOT NULL AND EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = leg_c.id))
    )
    GROUP BY gc.id, gc.circle_code, gc.name, gc.circle_number, gt.name, gt.tehsil_code, gt.id, gd.id, gd.name, gd.district_code, u.id, u.display_name, u.phone, u.email, u.ppo_number, uja.is_primary, uja.transfer_order_number, uja.valid_from
    ORDER BY gd.district_code, gc.circle_number
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_management_audit_log(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
  v_safe_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id::text AS jur_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor.role_code <> 'ADMIN'
  ),
  audit_records AS (
    SELECT
      ae.id,
      ae.event_type,
      ae.aggregate_type,
      ae.aggregate_id,
      ae.actor_id,
      ae.actor_role,
      coalesce(au.display_name, ae.actor_id) AS performed_by_name,
      ae.jurisdiction_id,
      ae.occurred_at,
      ae.payload->>'reason' AS reason,
      ae.payload->>'from_status' AS from_status,
      ae.payload->>'to_status' AS to_status,
      ae.payload
    FROM public.audit_events ae
    LEFT JOIN public.app_users au ON au.id::text = ae.actor_id
    WHERE ae.aggregate_type IN ('USER_ACCOUNT', 'JURISDICTION')
      AND (
        v_actor.role_code = 'ADMIN'
        OR (
          v_actor.role_code IN ('DIRECTOR', 'DET', 'ETO')
          AND ae.jurisdiction_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jur_id = ae.jurisdiction_id)
        )
        OR ae.actor_id = v_actor.user_id::text
        OR ae.aggregate_id = v_actor.user_id::text
      )
    ORDER BY ae.occurred_at DESC
    LIMIT v_safe_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(ar)), '[]'::jsonb) INTO v_result
  FROM audit_records ar;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 8. FIX IDOR, POTENTIAL HIJACK, AND JURISDICTION SCOPING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_assessment_versions(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_unit public.pft3_assessment_units;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
      WHERE aj.jurisdiction_id = v_unit.circle_id
    ) THEN
      RAISE EXCEPTION 'target unit is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
    IF v_actor.role_code IN ('INSPECTOR', 'ETI')
       AND v_unit.circle_id IS DISTINCT FROM v_actor.jurisdiction_id
       AND v_unit.responsible_inspector_id IS DISTINCT FROM v_actor.user_id THEN
      RAISE EXCEPTION 'target unit is outside your assigned circle responsibility' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version_no DESC), '[]'::jsonb)
  INTO v_result
  FROM public.assessment_versions v
  WHERE v.unit_id = p_unit_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_circle_id uuid;
  v_geo_circle public.geo_circles;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_next_seq integer;
  v_potential_number text;
  v_pin text;
  v_rule public.survey_classification_rules;
  v_annual_rate numeric(18,2);
  v_opening_arrears numeric(18,2);
  v_row public.potential_assessment_units;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE = '42501';
  END IF;

  IF p_unit->>'circle_id' IS NOT NULL AND length(btrim(p_unit->>'circle_id')) > 0 THEN
    v_circle_id := (p_unit->>'circle_id')::uuid;
    -- Translate geo_circles UUID to jurisdictions UUID if needed to satisfy FK
    IF NOT EXISTS (SELECT 1 FROM public.jurisdictions WHERE id = v_circle_id) THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = v_circle_id;
      IF v_geo_circle.id IS NOT NULL THEN
        SELECT id INTO v_circle_id FROM public.jurisdictions
        WHERE code = v_geo_circle.circle_code OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
        LIMIT 1;
      ELSE
        v_circle_id := NULL;
      END IF;
    END IF;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND length(btrim(p_unit->>'circle_name')) > 0 THEN
    SELECT id INTO v_circle_id FROM public.jurisdictions
    WHERE name = btrim(p_unit->>'circle_name') AND tier = 'CIRCLE'
    ORDER BY (CASE WHEN v_actor.jurisdiction_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) THEN 0 ELSE 1 END)
    LIMIT 1;
  ELSE
    v_circle_id := v_actor.jurisdiction_id;
  END IF;

  IF v_circle_id IS NULL THEN
    RAISE EXCEPTION 'valid target circle is required' USING ERRCODE = '22023';
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
      RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_rule
  FROM public.survey_classification_rules
  WHERE statutory_rule_id = nullif(btrim(p_unit->>'statutory_rule_id'), '') AND status = 'ACTIVE'
  ORDER BY effective_from DESC
  LIMIT 1;

  v_annual_rate := coalesce(v_rule.assessment_rate, (p_unit->>'annual_rate_pkr')::numeric, 4000);
  v_opening_arrears := coalesce((p_unit->>'opening_arrears')::numeric, 0);
  IF v_annual_rate <= 0 OR v_opening_arrears < 0 THEN
    RAISE EXCEPTION 'annual rate must be positive and opening arrears cannot be negative' USING ERRCODE = '23514';
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
  SELECT coalesce(max(nullif(regexp_replace(potential_number, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_next_seq FROM public.potential_assessment_units;

  IF length(btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no', ''))) > 0 THEN
    v_potential_number := btrim(coalesce(p_unit->>'potential_number', p_unit->>'survey_no'));
  ELSE
    v_potential_number := 'POT-' || lpad(v_next_seq::text, 4, '0');
  END IF;

  v_pin := ptas_private.generate_ptas_pin(
    v_circle_id, v_tehsil, v_district_name,
    coalesce(v_rule.statutory_rule_id, p_unit->>'statutory_rule_id'),
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
    btrim(coalesce(nullif(p_unit->>'legal_name', ''), 'Unnamed Unit')),
    nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
    coalesce(nullif(upper(p_unit->>'identifier_type'), ''), 'CNIC'),
    coalesce(btrim(p_unit->>'identifier_value'), ''),
    coalesce(btrim(p_unit->>'address'), ''),
    nullif(btrim(p_unit->>'locality'), ''),
    v_circle_id, v_circle_name, v_tehsil, v_district_name,
    coalesce(v_rule.primary_class_code, btrim(coalesce(p_unit->>'category_code', '1'))),
    coalesce(v_rule.tax_class, btrim(coalesce(p_unit->>'category_name', 'General'))),
    coalesce(v_rule.schedule_subclass_code, nullif(p_unit->>'subclassification_code', '')),
    coalesce(v_rule.tax_subclass, nullif(p_unit->>'subclassification_name', '')),
    nullif(p_unit->>'statutory_tertiary_code', ''),
    nullif(p_unit->>'statutory_tertiary_classification', ''),
    coalesce(v_rule.statutory_rule_id, btrim(coalesce(p_unit->>'statutory_rule_id', 'PFT-1-01'))),
    v_annual_rate, v_opening_arrears,
    nullif(btrim(p_unit->>'remarks'), ''),
    'ACTIVE', v_actor.user_id
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_CREATED', 'POTENTIAL_UNIT', v_row.id::text,
    v_actor.user_id::text, v_actor.role_code, v_circle_id::text,
    coalesce(nullif(p_unit->>'correlation_id', ''), 'potential-unit:' || v_row.id::text),
    jsonb_build_object('potential_number', v_row.potential_number, 'legal_name', v_row.legal_name)
  );

  RETURN to_jsonb(v_row);
END;
$$;

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
  v_geo_circle public.geo_circles;
  v_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_next_seq integer;
  v_potential_number text;
  v_pin text;
  v_rule public.survey_classification_rules;
  v_annual_rate numeric(18,2);
  v_opening_arrears numeric(18,2);
  v_created_count integer := 0;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' THEN
    RAISE EXCEPTION 'p_units must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_units) > 5000 THEN
    RAISE EXCEPTION 'bulk potential batch exceeds maximum limit of 5000 records' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number, '\D', '', 'g'), '')::integer), 0)
    INTO v_next_seq FROM public.potential_assessment_units;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_units)
  LOOP
    v_circle_id := NULL;
    IF v_item->>'circle_id' IS NOT NULL AND length(btrim(v_item->>'circle_id')) > 0 THEN
      v_circle_id := (v_item->>'circle_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.jurisdictions WHERE id = v_circle_id) THEN
        SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = v_circle_id;
        IF v_geo_circle.id IS NOT NULL THEN
          SELECT id INTO v_circle_id FROM public.jurisdictions
          WHERE code = v_geo_circle.circle_code OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
          LIMIT 1;
        ELSE
          v_circle_id := NULL;
        END IF;
      END IF;
    ELSIF v_item->>'circle_name' IS NOT NULL AND length(btrim(v_item->>'circle_name')) > 0 THEN
      SELECT id INTO v_circle_id FROM public.jurisdictions
      WHERE name = btrim(v_item->>'circle_name') AND tier = 'CIRCLE'
      ORDER BY (CASE WHEN v_actor.jurisdiction_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) THEN 0 ELSE 1 END)
      LIMIT 1;
    ELSE
      v_circle_id := v_actor.jurisdiction_id;
    END IF;

    IF v_circle_id IS NULL THEN
      RAISE EXCEPTION 'valid target circle is required for every potential unit' USING ERRCODE = '22023';
    END IF;

    IF v_actor.role_code <> 'ADMIN' THEN
      IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle_id) THEN
        RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE = '42501';
      END IF;
    END IF;

    SELECT * INTO v_rule
    FROM public.survey_classification_rules
    WHERE statutory_rule_id = nullif(btrim(v_item->>'statutory_rule_id'), '') AND status = 'ACTIVE'
    ORDER BY effective_from DESC
    LIMIT 1;

    v_annual_rate := coalesce(v_rule.assessment_rate, (v_item->>'annual_rate_pkr')::numeric, 4000);
    v_opening_arrears := coalesce((v_item->>'opening_arrears')::numeric, 0);
    IF v_annual_rate <= 0 OR v_opening_arrears < 0 THEN
      RAISE EXCEPTION 'annual rate must be positive and opening arrears cannot be negative' USING ERRCODE = '23514';
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
      v_circle_id, v_tehsil, v_district_name,
      coalesce(v_rule.statutory_rule_id, v_item->>'statutory_rule_id'),
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
      btrim(coalesce(nullif(v_item->>'legal_name', ''), 'Unnamed Unit')),
      nullif(btrim(coalesce(v_item->>'trade_name', v_item->>'taxpayer_name')), ''),
      nullif(btrim(coalesce(v_item->>'taxpayer_name', v_item->>'trade_name')), ''),
      coalesce(nullif(upper(v_item->>'identifier_type'), ''), 'CNIC'),
      coalesce(btrim(v_item->>'identifier_value'), ''),
      coalesce(btrim(v_item->>'address'), ''),
      nullif(btrim(v_item->>'locality'), ''),
      v_circle_id, v_circle_name, v_tehsil, v_district_name,
      coalesce(v_rule.primary_class_code, btrim(coalesce(v_item->>'category_code', '1'))),
      coalesce(v_rule.tax_class, btrim(coalesce(v_item->>'category_name', 'General'))),
      coalesce(v_rule.schedule_subclass_code, nullif(v_item->>'subclassification_code', '')),
      coalesce(v_rule.tax_subclass, nullif(v_item->>'subclassification_name', '')),
      nullif(v_item->>'statutory_tertiary_code', ''),
      nullif(v_item->>'statutory_tertiary_classification', ''),
      coalesce(v_rule.statutory_rule_id, btrim(coalesce(v_item->>'statutory_rule_id', 'PFT-1-01'))),
      v_annual_rate, v_opening_arrears,
      nullif(btrim(v_item->>'remarks'), ''),
      'ACTIVE', v_actor.user_id
    );

    v_created_count := v_created_count + 1;
  END LOOP;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNITS_BULK_CREATED', 'POTENTIAL_UNIT_BATCH', gen_random_uuid()::text,
    v_actor.user_id::text, v_actor.role_code, v_actor.jurisdiction_id::text,
    'potential-bulk:' || gen_random_uuid()::text,
    jsonb_build_object('created_count', v_created_count)
  );

  RETURN jsonb_build_object('success', true, 'created_count', v_created_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_potential_assessment_unit(p_id uuid, p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
  v_new_circle_id uuid;
  v_geo_circle public.geo_circles;
  v_circle_name text;
  v_tehsil text;
  v_target_pot_no text;
  v_target_pin text;
  v_rule public.survey_classification_rules;
  v_annual_rate numeric(18,2);
  v_opening_arrears numeric(18,2);
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required' USING ERRCODE = '42501';
  END IF;

  v_target_pot_no := nullif(btrim(p_unit->>'potential_number'), '');
  v_target_pin := nullif(btrim(p_unit->>'pin_number'), '');

  -- Lock target row first by UUID, PIN, or in-jurisdiction potential_number before reading caller-supplied circle changes
  SELECT * INTO v_row
  FROM public.potential_assessment_units
  WHERE (
    p_id IS NOT NULL AND p_id <> '00000000-0000-0000-0000-000000000000'::uuid AND id = p_id
  )
  OR (
    v_target_pin IS NOT NULL AND (pin_number = v_target_pin OR provincial_uin = v_target_pin)
  )
  OR (
    v_target_pot_no IS NOT NULL AND potential_number = v_target_pot_no
    AND (
      v_actor.role_code = 'ADMIN'
      OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, circle_id)
    )
  )
  ORDER BY (CASE WHEN id = p_id THEN 0 WHEN pin_number = v_target_pin THEN 1 ELSE 2 END)
  LIMIT 1
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Target potential unit not found in accessible jurisdiction' USING ERRCODE = 'P0002';
  END IF;

  -- Check EXISTING row jurisdiction BEFORE applying any circle_id payload overrides
  IF v_actor.role_code <> 'ADMIN' THEN
    IF v_row.circle_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_row.circle_id) THEN
      RAISE EXCEPTION 'Target potential unit is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_row.status = 'MIGRATED' THEN
    RAISE EXCEPTION 'Editing is strictly prohibited: Potential unit is already migrated to Form P.F.T-3 Assessment Register'
      USING ERRCODE = '23514';
  END IF;

  -- Resolve optional destination circle and validate BOTH Inspector restriction and containment
  v_new_circle_id := v_row.circle_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id', '') IS NOT NULL THEN
    v_new_circle_id := (p_unit->>'circle_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.jurisdictions WHERE id = v_new_circle_id) THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = v_new_circle_id;
      IF v_geo_circle.id IS NOT NULL THEN
        SELECT id INTO v_new_circle_id FROM public.jurisdictions
        WHERE code = v_geo_circle.circle_code OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
        LIMIT 1;
      ELSE
        v_new_circle_id := NULL;
      END IF;
    END IF;
    IF v_new_circle_id IS NULL THEN
      RAISE EXCEPTION 'invalid destination circle_id' USING ERRCODE = '22023';
    END IF;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name', '') IS NOT NULL THEN
    SELECT id INTO v_new_circle_id FROM public.jurisdictions
    WHERE name = btrim(p_unit->>'circle_name') AND tier = 'CIRCLE'
    ORDER BY (CASE WHEN ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) THEN 0 ELSE 1 END)
    LIMIT 1;
    IF v_new_circle_id IS NULL THEN
      v_new_circle_id := v_row.circle_id;
    END IF;
  END IF;

  IF v_actor.role_code IN ('INSPECTOR', 'ETI') AND v_new_circle_id IS DISTINCT FROM v_row.circle_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot transfer a potential unit across circles' USING ERRCODE = '42501';
  END IF;

  IF v_actor.role_code <> 'ADMIN' AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_new_circle_id) THEN
    RAISE EXCEPTION 'Destination circle is outside your assigned jurisdiction' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rule
  FROM public.survey_classification_rules
  WHERE statutory_rule_id = coalesce(nullif(btrim(p_unit->>'statutory_rule_id'), ''), v_row.statutory_rule_id)
    AND status = 'ACTIVE'
  ORDER BY effective_from DESC
  LIMIT 1;

  v_annual_rate := coalesce(v_rule.assessment_rate, (p_unit->>'annual_rate_pkr')::numeric, v_row.annual_rate_pkr);
  v_opening_arrears := coalesce((p_unit->>'opening_arrears')::numeric, v_row.opening_arrears);
  IF v_annual_rate <= 0 OR v_opening_arrears < 0 THEN
    RAISE EXCEPTION 'annual rate must be positive and opening arrears cannot be negative' USING ERRCODE = '23514';
  END IF;

  SELECT name INTO v_circle_name FROM public.jurisdictions WHERE id = v_new_circle_id;
  v_circle_name := coalesce(v_circle_name, v_row.circle_name, 'Circle 1');

  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_new_circle_id;

  UPDATE public.potential_assessment_units
  SET
    legal_name = btrim(coalesce(nullif(p_unit->>'legal_name', ''), v_row.legal_name)),
    trade_name = nullif(btrim(coalesce(p_unit->>'trade_name', v_row.trade_name)), ''),
    taxpayer_name = nullif(btrim(coalesce(p_unit->>'taxpayer_name', v_row.taxpayer_name)), ''),
    identifier_type = upper(coalesce(nullif(p_unit->>'identifier_type', ''), v_row.identifier_type)),
    identifier_value = coalesce(btrim(p_unit->>'identifier_value'), v_row.identifier_value, ''),
    address = coalesce(btrim(p_unit->>'address'), v_row.address, ''),
    locality = nullif(btrim(coalesce(p_unit->>'locality', v_row.locality)), ''),
    circle_id = v_new_circle_id,
    circle_name = v_circle_name,
    tehsil = coalesce(v_tehsil, v_row.tehsil),
    category_code = coalesce(v_rule.primary_class_code, btrim(coalesce(p_unit->>'category_code', v_row.category_code))),
    category_name = coalesce(v_rule.tax_class, btrim(coalesce(p_unit->>'category_name', v_row.category_name))),
    subclassification_code = coalesce(v_rule.schedule_subclass_code, nullif(p_unit->>'subclassification_code', '')),
    subclassification_name = coalesce(v_rule.tax_subclass, nullif(p_unit->>'subclassification_name', '')),
    statutory_tertiary_code = nullif(p_unit->>'statutory_tertiary_code', ''),
    statutory_tertiary_classification = nullif(p_unit->>'statutory_tertiary_classification', ''),
    statutory_rule_id = coalesce(v_rule.statutory_rule_id, btrim(coalesce(p_unit->>'statutory_rule_id', v_row.statutory_rule_id))),
    annual_rate_pkr = v_annual_rate,
    opening_arrears = v_opening_arrears,
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id,
    correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'POTENTIAL_UNIT_UPDATED', 'POTENTIAL_UNIT', v_row.id::text,
    v_actor.user_id::text, v_actor.role_code, coalesce(v_new_circle_id, v_actor.jurisdiction_id)::text,
    coalesce(nullif(p_unit->>'correlation_id', ''), 'potential-unit-update:' || v_row.id::text),
    jsonb_build_object(
      'potential_number', v_row.potential_number,
      'legal_name', v_row.legal_name,
      'annual_rate_pkr', v_row.annual_rate_pkr,
      'opening_arrears', v_row.opening_arrears
    )
  );

  RETURN to_jsonb(v_row);
END;
$$;

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
  v_actor record;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or Assessing Authority (ETO) authority is required' USING ERRCODE = '42501';
  END IF;

  RETURN ptas_private.migrate_potential_unit_to_pft3_internal(
    p_potential_id,
    p_assigned_demand_no,
    v_actor.user_id,
    v_actor.role_code,
    v_actor.jurisdiction_id,
    NULL
  );
END;
$$;

-- Remove fail-open NULL bypasses and restrict DIRECTOR/DET to accessible_jurisdiction_ids
CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code <> 'ADMIN' AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ordered_units.id,
        'potential_number', ordered_units.potential_number,
        'pin_number', ordered_units.pin_number,
        'provincial_uin', ordered_units.provincial_uin,
        'legal_name', ordered_units.legal_name,
        'trade_name', ordered_units.trade_name,
        'taxpayer_name', ordered_units.taxpayer_name,
        'identifier_type', ordered_units.identifier_type,
        'identifier_value', coalesce(ordered_units.identifier_value, ''),
        'address', coalesce(ordered_units.address, ''),
        'locality', ordered_units.locality,
        'circle_id', ordered_units.circle_id,
        'circle_name', ordered_units.circle_name,
        'tehsil', ordered_units.tehsil,
        'district_name', ordered_units.district_name,
        'category_code', ordered_units.category_code,
        'category_name', ordered_units.category_name,
        'subclassification_code', ordered_units.subclassification_code,
        'subclassification_name', ordered_units.subclassification_name,
        'statutory_tertiary_code', ordered_units.statutory_tertiary_code,
        'statutory_tertiary_classification', ordered_units.statutory_tertiary_classification,
        'statutory_rule_id', ordered_units.statutory_rule_id,
        'annual_rate_pkr', ordered_units.annual_rate_pkr,
        'opening_arrears', ordered_units.opening_arrears,
        'remarks', ordered_units.remarks,
        'status', ordered_units.status,
        'migrated_to_demand_no', ordered_units.migrated_to_demand_no,
        'migrated_at', ordered_units.migrated_at,
        'created_at', ordered_units.created_at,
        'updated_at', ordered_units.updated_at
      )
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT p.*
    FROM actor a
    JOIN public.potential_assessment_units p
      ON (
        a.role_code = 'ADMIN'
        OR (
          p.circle_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = p.circle_id
          )
        )
      )
    ORDER BY p.created_at DESC, p.id
  ) ordered_units;
$$;

CREATE OR REPLACE FUNCTION public.list_operational_survey_units()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET','FINANCE','AUDITOR'])
  LIMIT 1;

  IF v_actor.user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      WITH allowed_jurisdictions AS MATERIALIZED (
        SELECT aj.jurisdiction_id
        FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
        WHERE v_actor.role_code <> 'ADMIN'
      ),
      scoped_units AS MATERIALIZED (
        SELECT u.*
        FROM public.pft3_assessment_units u
        WHERE (
          v_actor.role_code = 'ADMIN'
          OR EXISTS (
            SELECT 1
            FROM allowed_jurisdictions aj
            WHERE aj.jurisdiction_id = u.circle_id
          )
        )
        AND (
          v_actor.role_code NOT IN ('INSPECTOR','ETI')
          OR u.circle_id = v_actor.jurisdiction_id
          OR u.responsible_inspector_id = v_actor.user_id
        )
      ),
      unit_ledger AS MATERIALIZED (
        SELECT
          r.pft3_unit_id,
          jsonb_agg(
            jsonb_build_object(
              'id', ('entry-' || r.id::text),
              'demand_unit_id', r.pft3_unit_id,
              'financial_year_id', su.financial_year_id,
              'entry_type', 'PAYMENT_CREDIT',
              'amount', -abs(r.amount),
              'source_type', CASE WHEN r.payment_source = 'MANUAL' THEN 'MANUAL_RECEIPT' ELSE 'PFT2_RECEIPT' END,
              'source_id', r.receipt_number,
              'idempotency_key', coalesce(r.idempotency_key, 'receipt-' || r.id::text),
              'correlation_id', 'corr-' || r.receipt_number,
              'posted_by', coalesce(r.received_by::text, '00000000-0000-0000-0000-000000000000'),
              'posted_at', to_char(r.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
          ) AS ledger_entries
        FROM public.pft2_receipts r
        JOIN scoped_units su ON su.id = r.pft3_unit_id
        WHERE r.pft3_unit_id IS NOT NULL
        GROUP BY r.pft3_unit_id
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ordered_units.id,
          'taxpayer_id', ordered_units.id,
          'financial_year_id', ordered_units.financial_year_id,
          'assessment_id', ordered_units.id,
          'jurisdiction_id', ordered_units.circle_id,
          'jurisdiction', jsonb_build_object(
            'id', ordered_units.circle_id,
            'name', ordered_units.circle_name,
            'tier', 'CIRCLE',
            'tehsil', ordered_units.tehsil,
            'district_name', ordered_units.district_name
          ),
          'responsible_inspector_id', ordered_units.responsible_inspector_id,
          'source', ordered_units.source,
          'state', ordered_units.state,
          'row_version', ordered_units.row_version,
          'created_at', ordered_units.created_at,
          'updated_at', ordered_units.updated_at,
          'submitted_at', ordered_units.submitted_at,
          'approved_at', ordered_units.approved_at,
          'closed_at', ordered_units.closed_at,
          'taxpayer', jsonb_build_object(
            'display_name', ordered_units.legal_name,
            'status', 'ACTIVE',
            'permanent_demand_no', ordered_units.permanent_demand_no
          ),
          'identifier', CASE
            WHEN length(coalesce(ordered_units.identifier_value, '')) > 0 THEN jsonb_build_object(
              'type', ordered_units.identifier_type,
              'value', ordered_units.identifier_value,
              'masked_value', repeat('*', greatest(length(ordered_units.identifier_value) - 4, 0)) || right(ordered_units.identifier_value, 4)
            )
            ELSE NULL
          END,
          'profile', jsonb_build_object(
            'survey_no', ordered_units.survey_no,
            'survey_date', ordered_units.created_at::date,
            'locality', ordered_units.locality,
            'commercial_address', ordered_units.address,
            'legal_name', ordered_units.legal_name,
            'taxpayer_name', ordered_units.taxpayer_name,
            'trade_name', ordered_units.trade_name,
            'opening_arrears', ordered_units.opening_arrears,
            'remarks', ordered_units.remarks,
            'legacy_demand_no', ordered_units.permanent_demand_no,
            'pin_number', ordered_units.pin_number,
            'provincial_uin', ordered_units.provincial_uin,
            'tehsil', ordered_units.tehsil
          ),
          'classification', CASE
            WHEN ordered_units.statutory_rule_id IS NOT NULL THEN jsonb_build_object(
              'id', ordered_units.statutory_rule_id,
              'financial_year_code', ordered_units.financial_year_id,
              'tax_class', ordered_units.category_name,
              'tax_assessment_option', ordered_units.subclassification_name,
              'tax_subclass', ordered_units.subclassification_name,
              'assessment_rate', ordered_units.annual_rate_pkr,
              'primary_class_code', ordered_units.category_code,
              'schedule_subclass_code', ordered_units.subclassification_code,
              'rate_basis', 'Annual fixed rate',
              'statutory_rule_id', ordered_units.statutory_rule_id
            )
            ELSE NULL
          END,
          'assessment', jsonb_build_object(
            'id', ordered_units.id,
            'taxpayer_id', ordered_units.id,
            'financial_year_id', ordered_units.financial_year_id,
            'status', ordered_units.state,
            'current_version_no', ordered_units.row_version,
            'created_by', ordered_units.created_by,
            'created_at', ordered_units.created_at
          ),
          'assessment_version', jsonb_build_object(
            'id', ordered_units.id,
            'assessment_id', ordered_units.id,
            'version_no', ordered_units.row_version,
            'status', ordered_units.state,
            'snapshot', jsonb_build_object(
              'taxAmount', ordered_units.annual_rate_pkr,
              'statutoryCategory', ordered_units.category_name,
              'legalBasis', ordered_units.category_code,
              'ruleId', ordered_units.statutory_rule_id,
              'subclassificationCode', ordered_units.subclassification_code
            ),
            'created_by', ordered_units.created_by,
            'created_at', ordered_units.created_at,
            'approved_by', ordered_units.approved_by,
            'approved_at', ordered_units.approved_at
          ),
          'demand_unit', jsonb_build_object(
            'id', ordered_units.id,
            'permanent_demand_no', ordered_units.permanent_demand_no,
            'created_at', ordered_units.created_at
          ),
          'ledger_entries', ordered_units.unit_ledger_entries,
          'pft3_registered', (ordered_units.state = 'APPROVED'),
          'pft3_registered_at', ordered_units.approved_at
        )
      )
      FROM (
        SELECT u.*, coalesce(ul.ledger_entries, '[]'::jsonb) AS unit_ledger_entries
        FROM scoped_units u
        LEFT JOIN unit_ledger ul ON ul.pft3_unit_id = u.id
        ORDER BY u.created_at DESC, u.id
      ) ordered_units
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_operational_survey_unit(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_ident text;
  v_unit public.pft3_assessment_units%ROWTYPE;
  v_ledger_entries jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET','FINANCE','AUDITOR'])
  LIMIT 1;

  IF v_actor.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_ident := btrim(coalesce(p_identifier, ''));
  IF v_ident = '' THEN
    RETURN NULL;
  END IF;

  IF v_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT u.* INTO v_unit FROM public.pft3_assessment_units u WHERE u.id = v_ident::uuid LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit FROM public.pft3_assessment_units u WHERE u.pin_number = v_ident LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit FROM public.pft3_assessment_units u WHERE u.provincial_uin = v_ident LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit
    FROM public.pft3_assessment_units u
    WHERE u.permanent_demand_no = v_ident
      AND (
        v_actor.role_code = 'ADMIN'
        OR EXISTS (
          SELECT 1
          FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
          WHERE aj.jurisdiction_id = u.circle_id
        )
      )
      AND (
        v_actor.role_code NOT IN ('INSPECTOR','ETI')
        OR u.circle_id = v_actor.jurisdiction_id
        OR u.responsible_inspector_id = v_actor.user_id
      )
    ORDER BY u.created_at DESC, u.id
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
      WHERE aj.jurisdiction_id = v_unit.circle_id
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  IF v_actor.role_code IN ('INSPECTOR', 'ETI') THEN
    IF v_unit.circle_id IS DISTINCT FROM v_actor.jurisdiction_id
       AND v_unit.responsible_inspector_id IS DISTINCT FROM v_actor.user_id THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ('entry-' || r.id::text),
        'demand_unit_id', r.pft3_unit_id,
        'financial_year_id', v_unit.financial_year_id,
        'entry_type', 'PAYMENT_CREDIT',
        'amount', -abs(r.amount),
        'source_type', CASE WHEN r.payment_source = 'MANUAL' THEN 'MANUAL_RECEIPT' ELSE 'PFT2_RECEIPT' END,
        'source_id', r.receipt_number,
        'idempotency_key', coalesce(r.idempotency_key, 'receipt-' || r.id::text),
        'correlation_id', 'corr-' || r.receipt_number,
        'posted_by', coalesce(r.received_by::text, '00000000-0000-0000-0000-000000000000'),
        'posted_at', to_char(r.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
    ),
    '[]'::jsonb
  ) INTO v_ledger_entries
  FROM public.pft2_receipts r
  WHERE r.pft3_unit_id = v_unit.id;

  RETURN jsonb_build_object(
    'id', v_unit.id,
    'taxpayer_id', v_unit.id,
    'financial_year_id', v_unit.financial_year_id,
    'assessment_id', v_unit.id,
    'jurisdiction_id', v_unit.circle_id,
    'jurisdiction', jsonb_build_object(
      'id', v_unit.circle_id,
      'name', v_unit.circle_name,
      'tier', 'CIRCLE',
      'tehsil', v_unit.tehsil,
      'district_name', v_unit.district_name
    ),
    'responsible_inspector_id', v_unit.responsible_inspector_id,
    'source', v_unit.source,
    'state', v_unit.state,
    'row_version', v_unit.row_version,
    'created_at', v_unit.created_at,
    'updated_at', v_unit.updated_at,
    'submitted_at', v_unit.submitted_at,
    'approved_at', v_unit.approved_at,
    'closed_at', v_unit.closed_at,
    'taxpayer', jsonb_build_object(
      'display_name', v_unit.legal_name,
      'status', 'ACTIVE',
      'permanent_demand_no', v_unit.permanent_demand_no
    ),
    'identifier', CASE
      WHEN length(coalesce(v_unit.identifier_value, '')) > 0 THEN jsonb_build_object(
        'type', v_unit.identifier_type,
        'value', v_unit.identifier_value,
        'masked_value', repeat('*', greatest(length(v_unit.identifier_value) - 4, 0)) || right(v_unit.identifier_value, 4)
      )
      ELSE NULL
    END,
    'profile', jsonb_build_object(
      'survey_no', v_unit.survey_no,
      'survey_date', v_unit.created_at::date,
      'locality', v_unit.locality,
      'commercial_address', v_unit.address,
      'legal_name', v_unit.legal_name,
      'taxpayer_name', v_unit.taxpayer_name,
      'trade_name', v_unit.trade_name,
      'opening_arrears', v_unit.opening_arrears,
      'remarks', v_unit.remarks,
      'legacy_demand_no', v_unit.permanent_demand_no,
      'pin_number', v_unit.pin_number,
      'provincial_uin', v_unit.provincial_uin,
      'tehsil', v_unit.tehsil
    ),
    'classification', CASE
      WHEN v_unit.statutory_rule_id IS NOT NULL THEN jsonb_build_object(
        'id', v_unit.statutory_rule_id,
        'financial_year_code', v_unit.financial_year_id,
        'tax_class', v_unit.category_name,
        'tax_assessment_option', v_unit.subclassification_name,
        'tax_subclass', v_unit.subclassification_name,
        'assessment_rate', v_unit.annual_rate_pkr,
        'primary_class_code', v_unit.category_code,
        'schedule_subclass_code', v_unit.subclassification_code,
        'rate_basis', 'Annual fixed rate',
        'statutory_rule_id', v_unit.statutory_rule_id
      )
      ELSE NULL
    END,
    'assessment', jsonb_build_object(
      'id', v_unit.id,
      'taxpayer_id', v_unit.id,
      'financial_year_id', v_unit.financial_year_id,
      'status', v_unit.state,
      'current_version_no', v_unit.row_version,
      'created_by', v_unit.created_by,
      'created_at', v_unit.created_at
    ),
    'assessment_version', jsonb_build_object(
      'id', v_unit.id,
      'assessment_id', v_unit.id,
      'version_no', v_unit.row_version,
      'status', v_unit.state,
      'snapshot', jsonb_build_object(
        'taxAmount', v_unit.annual_rate_pkr,
        'statutoryCategory', v_unit.category_name,
        'legalBasis', v_unit.category_code,
        'ruleId', v_unit.statutory_rule_id,
        'subclassificationCode', v_unit.subclassification_code
      ),
      'created_by', v_unit.created_by,
      'created_at', v_unit.created_at,
      'approved_by', v_unit.approved_by,
      'approved_at', v_unit.approved_at
    ),
    'demand_unit', jsonb_build_object(
      'id', v_unit.id,
      'permanent_demand_no', v_unit.permanent_demand_no,
      'created_at', v_unit.created_at
    ),
    'ledger_entries', v_ledger_entries,
    'pft3_registered', (v_unit.state = 'APPROVED'),
    'pft3_registered_at', v_unit.approved_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code <> 'ADMIN' AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(ordered_challans.snapshot), '[]'::jsonb)
  FROM (
    SELECT c.snapshot
    FROM actor a
    JOIN public.pft2_challans c
      ON (
        a.role_code = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = c.jurisdiction_id
        )
      )
    WHERE c.snapshot <> '{}'::jsonb
    ORDER BY c.created_at DESC
  ) ordered_challans;
$$;

CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code <> 'ADMIN' AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(ordered_receipts.snapshot), '[]'::jsonb)
  FROM (
    SELECT r.snapshot
    FROM actor a
    JOIN public.pft2_receipts r ON r.snapshot <> '{}'::jsonb
    LEFT JOIN public.pft2_challans c ON c.id = r.challan_id
    LEFT JOIN public.pft3_assessment_units u ON u.id = r.pft3_unit_id
    LEFT JOIN public.potential_assessment_units pu ON pu.id = r.potential_unit_id
    WHERE (
      a.role_code = 'ADMIN'
      OR EXISTS (
        SELECT 1 FROM allowed_jurisdictions aj
        WHERE aj.jurisdiction_id = coalesce(c.jurisdiction_id, u.circle_id, pu.circle_id)
      )
    )
    ORDER BY r.received_at DESC
  ) ordered_receipts;
$$;

-- Restrict direct statutory enrollment approval strictly to ETO (Assessing Authority)
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
AS $$
DECLARE
  v_actor record;
  v_rule public.survey_classification_rules;
  v_unit_id uuid;
  v_identifier text;
  v_existing uuid;
  v_target_circle_id uuid;
  v_geo_circle public.geo_circles;
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
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR','ETI']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated Tax Inspector or Assessing Authority (ETO) role required' USING ERRCODE = '42501';
  END IF;

  SELECT aggregate_id INTO v_existing FROM public.workflow_actions
    WHERE aggregate_type = 'SURVEY_UNIT' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'idempotent_replay', true);
  END IF;

  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id = p_unit->>'statutory_rule_id' AND status = 'ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE = '23514';
  END IF;

  v_fy := coalesce(
    nullif(btrim(p_unit->>'financial_year_id'), ''),
    nullif(btrim(p_unit->>'financial_year'), ''),
    '2026-2027'
  );
  IF v_fy = '2021-2022' THEN
    v_fy := '2026-2027';
  END IF;

  IF p_unit->>'circle_id' IS NOT NULL AND nullif(p_unit->>'circle_id', '') IS NOT NULL THEN
    v_target_circle_id := (p_unit->>'circle_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.jurisdictions WHERE id = v_target_circle_id) THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = v_target_circle_id;
      IF v_geo_circle.id IS NOT NULL THEN
        SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE code = v_geo_circle.circle_code OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
        LIMIT 1;
      ELSE
        v_target_circle_id := NULL;
      END IF;
    END IF;
  ELSIF p_unit->>'circle_code' IS NOT NULL AND nullif(p_unit->>'circle_code', '') IS NOT NULL THEN
    SELECT j.id INTO v_target_circle_id FROM public.jurisdictions j
    WHERE j.code = upper(btrim(p_unit->>'circle_code')) LIMIT 1;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(p_unit->>'circle_name', '') IS NOT NULL THEN
    SELECT j.id INTO v_target_circle_id FROM public.jurisdictions j
    WHERE j.name ILIKE btrim(p_unit->>'circle_name') AND j.tier = 'CIRCLE'
    ORDER BY (CASE WHEN v_actor.jurisdiction_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, j.id) THEN 0 ELSE 1 END)
    LIMIT 1;
  END IF;

  IF v_target_circle_id IS NULL THEN
    IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
      v_target_circle_id := v_actor.jurisdiction_id;
    ELSE
      SELECT id INTO v_target_circle_id FROM public.jurisdictions
      WHERE ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) AND tier = 'CIRCLE'
      ORDER BY name LIMIT 1;
    END IF;
  END IF;

  IF v_target_circle_id IS NULL THEN
    RAISE EXCEPTION 'target circle jurisdiction not found' USING ERRCODE = '22023';
  END IF;

  IF v_actor.role_code IN ('INSPECTOR','ETI') THEN
    v_inspector_id := v_actor.user_id;
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
      RAISE EXCEPTION 'Tax Inspector is legally restricted to assigned circle jurisdiction' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Specified circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;

    SELECT user_id INTO v_inspector_id FROM public.user_roles
    WHERE role_code IN ('INSPECTOR','ETI') AND jurisdiction_id = v_target_circle_id
      AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
    LIMIT 1;

    IF v_inspector_id IS NULL THEN
      v_inspector_id := v_actor.user_id;
    END IF;
  END IF;

  SELECT j.name INTO v_target_circle_name FROM public.jurisdictions j WHERE j.id = v_target_circle_id;
  SELECT teh.name, dist.name INTO v_tehsil, v_district_name
  FROM public.jurisdictions c
  LEFT JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  LEFT JOIN public.jurisdictions dist ON dist.id = teh.parent_id
  WHERE c.id = v_target_circle_id;

  v_tehsil := coalesce(v_tehsil, p_unit->>'tehsil', 'Vehari');
  v_district_name := coalesce(v_district_name, p_unit->>'district_name', 'Vehari');

  IF nullif(btrim(p_unit->>'legal_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Legal Name / Trade Name is mandatory' USING ERRCODE = '23514';
  END IF;

  IF coalesce((p_unit->>'opening_arrears')::numeric, 0) < 0 THEN
    RAISE EXCEPTION 'Opening arrears cannot be negative' USING ERRCODE = '23514';
  END IF;

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value', ''), '[^0-9A-Za-z]', '', 'g'));
  v_unit_id := gen_random_uuid();

  -- Statutory direct assessment approval belongs strictly to ETO (Assessing Authority)
  v_direct_enroll := (
    v_actor.role_code = 'ETO'
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

  v_pin := ptas_private.generate_ptas_pin(
    v_target_circle_id, v_tehsil, v_district_name, v_rule.statutory_rule_id, false, v_pin_suffix
  );

  v_demand_no := coalesce(
    ptas_private.normalize_demand_no(p_unit->>'permanent_demand_no'),
    ptas_private.get_next_circle_demand_no(v_target_circle_id)
  );

  INSERT INTO public.pft3_assessment_units (
    id, permanent_demand_no, pin_number, provincial_uin, survey_no,
    legal_name, taxpayer_name, trade_name, identifier_type, identifier_value,
    address, locality, circle_id, circle_name, tehsil, district_name,
    category_code, category_name, subclassification_code, subclassification_name,
    statutory_rule_id, annual_rate_pkr, opening_arrears, financial_year_id,
    state, source, remarks, responsible_inspector_id, created_by, approved_by, approved_at
  ) VALUES (
    v_unit_id, v_demand_no, v_pin, v_pin, 'IND-' || left(v_unit_id::text, 8),
    btrim(p_unit->>'legal_name'),
    nullif(btrim(coalesce(p_unit->>'taxpayer_name', p_unit->>'trade_name')), ''),
    nullif(btrim(coalesce(p_unit->>'trade_name', p_unit->>'taxpayer_name')), ''),
    upper(coalesce(nullif(p_unit->>'identifier_type', ''), 'CNIC')),
    v_identifier,
    coalesce(btrim(p_unit->>'address'), ''),
    nullif(btrim(p_unit->>'locality'), ''),
    v_target_circle_id,
    coalesce(v_target_circle_name, p_unit->>'circle_name', 'Circle 1'),
    v_tehsil, v_district_name,
    v_rule.primary_class_code, v_rule.tax_class,
    v_rule.schedule_subclass_code, v_rule.tax_subclass,
    v_rule.statutory_rule_id, v_rule.assessment_rate,
    coalesce((p_unit->>'opening_arrears')::numeric, 0),
    v_fy, v_state, 'MANUAL',
    coalesce(nullif(btrim(p_unit->>'remarks'), ''), CASE WHEN v_direct_enroll THEN 'Statutory intake directly enrolled into Form P.F.T-3' ELSE 'Individual field survey capture' END),
    v_inspector_id, v_actor.user_id, v_approved_by, v_approved_at
  );

  INSERT INTO public.workflow_actions (
    aggregate_type, aggregate_id, action, from_status, to_status, actor_id,
    actor_role, correlation_id, idempotency_key
  ) VALUES (
    'SURVEY_UNIT', v_unit_id,
    CASE WHEN v_direct_enroll THEN 'APPROVE' ELSE 'FEED' END,
    'NEW', v_state, v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  );

  INSERT INTO public.assessment_versions (
    unit_id, version_no, financial_year_id, pin_number, permanent_demand_no,
    category_code, subclassification_code, annual_rate_pkr, opening_arrears,
    status, reason, snapshot, created_by, created_at, approved_by, approved_at
  ) VALUES (
    v_unit_id, 1, v_fy, v_pin, v_demand_no,
    v_rule.primary_class_code, v_rule.schedule_subclass_code, v_rule.assessment_rate,
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
    v_actor.user_id, now(), v_approved_by, v_approved_at
  )
  ON CONFLICT (unit_id, version_no) DO NOTHING;

  PERFORM ptas_private.audit_transition(
    CASE WHEN v_direct_enroll THEN 'ASSESSMENT_APPROVED' ELSE 'SURVEY_UNIT_INDIVIDUAL_CREATED' END,
    'SURVEY_UNIT', v_unit_id, v_actor.user_id, v_actor.role_code, v_target_circle_id,
    p_correlation_id, NULL, v_state,
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
$$;

-- ============================================================================
-- 9. APPEND-ONLY ASSESSMENT VERSIONS & CHALLAN/RECEIPT INTEGRITY RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL::text
)
RETURNS public.pft3_assessment_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.pft3_assessment_units;
  a record;
  n text;
  old text;
  v_pin text;
  v_demand_no text;
  v_new_version integer;
  v_next_av_no integer;
BEGIN
  SELECT * INTO v FROM public.pft3_assessment_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_actions WHERE aggregate_type = 'SURVEY_UNIT' AND idempotency_key = p_idempotency_key) THEN
    RETURN v;
  END IF;

  SELECT * INTO a
  FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE', 'RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR', 'ETO'] END) x
  WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id, v.circle_id)
  LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF v.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE = '40001'; END IF;

  old := v.state;
  n := (CASE
    WHEN v.state = 'NEW' AND p_action = 'FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW', 'FEEDED') AND p_action = 'CLOSE' AND length(btrim(coalesce(p_reason, ''))) > 0 THEN 'CLOSED'
    WHEN v.state = 'FEEDED' AND p_action = 'SUBMIT' THEN 'SUBMITTED'
    WHEN v.state = 'RETURNED' AND p_action = 'RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state = 'APPROVED' AND p_action IN ('REVISE', 'SUBMIT', 'EDIT') THEN 'SUBMITTED'
    WHEN v.state = 'SUBMITTED' AND p_action = 'RETURN' AND length(btrim(coalesce(p_reason, ''))) > 0 THEN 'RETURNED'
    WHEN v.state = 'SUBMITTED' AND p_action = 'APPROVE' THEN 'APPROVED'
    ELSE NULL
  END);
  IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.workflow_actions(
    aggregate_type, aggregate_id, action, from_status, to_status, reason,
    actor_id, actor_role, correlation_id, idempotency_key
  ) VALUES (
    'SURVEY_UNIT', v.id, p_action, old, n, p_reason,
    a.user_id, a.role_code, p_correlation_id, p_idempotency_key
  );

  IF v.pin_number IS NULL OR length(btrim(v.pin_number)) < 15 OR v.pin_number LIKE 'Potential-%' THEN
    v_pin := ptas_private.allocate_pft3_pin(v.id);
  ELSE
    v_pin := v.pin_number;
  END IF;

  IF v_pin IS NOT NULL AND v_pin ~ '-(0[1-7])$' THEN
    IF n = 'APPROVED' THEN v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-01');
    ELSIF n = 'SUBMITTED' THEN v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-02');
    ELSIF n = 'FEEDED' THEN v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-03');
    ELSIF n = 'RETURNED' THEN v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-05');
    ELSIF n = 'CLOSED' THEN v_pin := regexp_replace(v_pin, '-(0[1-7])$', '-06');
    END IF;
  END IF;

  v.pin_number := v_pin;
  v.provincial_uin := v_pin;

  IF n = 'APPROVED' THEN
    v_demand_no := ptas_private.normalize_demand_no(v.permanent_demand_no);
    IF v_demand_no IS NULL THEN
      v_demand_no := ptas_private.get_next_circle_demand_no(v.circle_id);
    END IF;
    v.permanent_demand_no := v_demand_no;
  END IF;

  v_new_version := (v.row_version + 1)::integer;

  UPDATE public.pft3_assessment_units
  SET
    state = n,
    row_version = v_new_version,
    updated_at = now(),
    submitted_at = CASE WHEN n = 'SUBMITTED' THEN now() ELSE submitted_at END,
    approved_at = CASE WHEN n = 'APPROVED' THEN now() ELSE approved_at END,
    approved_by = CASE WHEN n = 'APPROVED' THEN a.user_id ELSE approved_by END,
    closed_at = CASE WHEN n = 'CLOSED' THEN now() ELSE closed_at END,
    permanent_demand_no = coalesce(v.permanent_demand_no, permanent_demand_no),
    pin_number = coalesce(v.pin_number, pin_number),
    provincial_uin = coalesce(v.provincial_uin, provincial_uin),
    import_row_id = CASE WHEN n = 'APPROVED' THEN NULL ELSE import_row_id END
  WHERE id = v.id
  RETURNING * INTO v;

  -- Strictly append-only version allocation (never updates/mutates prior assessment_versions rows)
  SELECT greatest(coalesce(max(version_no), 0) + 1, v_new_version)
    INTO v_next_av_no
  FROM public.assessment_versions
  WHERE unit_id = v.id;

  INSERT INTO public.assessment_versions (
    unit_id, version_no, financial_year_id, pin_number, permanent_demand_no,
    category_code, subclassification_code, annual_rate_pkr, opening_arrears,
    status, reason, snapshot, created_by, created_at, approved_by, approved_at
  ) VALUES (
    v.id, v_next_av_no, v.financial_year_id, v.pin_number, v.permanent_demand_no,
    v.category_code, v.subclassification_code, v.annual_rate_pkr, v.opening_arrears,
    n,
    coalesce(p_reason, CASE WHEN n = 'APPROVED' THEN 'Statutory ETO assessment approval under Rules 4, 5 & 11' ELSE 'Workflow transition to ' || n END),
    jsonb_build_object(
      'legalName', v.legal_name,
      'taxpayerName', v.taxpayer_name,
      'tradeName', v.trade_name,
      'categoryName', v.category_name,
      'subclassificationName', v.subclassification_name,
      'circleName', v.circle_name,
      'tehsil', v.tehsil,
      'districtName', v.district_name,
      'identifierType', v.identifier_type,
      'identifierValue', v.identifier_value,
      'address', v.address,
      'ratePkr', v.annual_rate_pkr
    ),
    a.user_id, now(),
    CASE WHEN n = 'APPROVED' THEN a.user_id ELSE NULL END,
    CASE WHEN n = 'APPROVED' THEN now() ELSE NULL END
  );

  IF n = 'APPROVED' THEN
    DELETE FROM public.survey_import_rows WHERE promoted_survey_unit_id = v.id;
  END IF;

  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION', 'SURVEY_UNIT', v.id, a.user_id, a.role_code, v.circle_id, p_correlation_id, old, n, p_reason);
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_individual_survey_unit(
  p_unit_id uuid,
  p_unit jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_unit public.pft3_assessment_units;
  v_rule public.survey_classification_rules;
  v_target_circle_id uuid;
  v_geo_circle public.geo_circles;
  v_target_circle_name text;
  v_tehsil text;
  v_district_name text;
  v_identifier text;
  v_prev_state text;
  v_next_state text;
  v_edit_reason text;
  v_new_opening_arrears numeric(18,2);
  v_next_av_no integer;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer role required to update PFT-3 units' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type = 'SURVEY_UNIT' AND idempotency_key = p_idempotency_key
  ) THEN
    SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id;
    IF v_unit.id IS NULL THEN
      RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object(
      'id', v_unit.id,
      'state', v_unit.state,
      'row_version', v_unit.row_version,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_unit FROM public.pft3_assessment_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'PFT-3 unit not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_unit.circle_id) THEN
      RAISE EXCEPTION 'Target unit is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_unit.state = 'CLOSED' THEN
    RAISE EXCEPTION 'Editing is prohibited: Unit is permanently CLOSED.' USING ERRCODE = '23514';
  END IF;

  v_new_opening_arrears := coalesce((p_unit->>'opening_arrears')::numeric, v_unit.opening_arrears, 0);
  IF v_new_opening_arrears < 0 THEN
    RAISE EXCEPTION 'Opening arrears cannot be negative' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id = coalesce(nullif(btrim(p_unit->>'statutory_rule_id'), ''), v_unit.statutory_rule_id)
      AND status = 'ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL AND nullif(btrim(p_unit->>'statutory_rule_id'), '') IS NOT NULL THEN
    RAISE EXCEPTION 'active approved statutory classification rule not found' USING ERRCODE = '23514';
  END IF;

  v_target_circle_id := v_unit.circle_id;
  IF p_unit->>'circle_id' IS NOT NULL AND nullif(btrim(p_unit->>'circle_id'), '') IS NOT NULL THEN
    v_target_circle_id := (p_unit->>'circle_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.jurisdictions WHERE id = v_target_circle_id) THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = v_target_circle_id;
      IF v_geo_circle.id IS NOT NULL THEN
        SELECT id INTO v_target_circle_id FROM public.jurisdictions
        WHERE code = v_geo_circle.circle_code OR (v_geo_circle.circle_code = 'VHR-1' AND code = 'CIR_VEH_01')
        LIMIT 1;
      ELSE
        v_target_circle_id := NULL;
      END IF;
    END IF;
    IF v_target_circle_id IS NULL THEN
      RAISE EXCEPTION 'Target circle jurisdiction not found' USING ERRCODE = '22023';
    END IF;
  ELSIF p_unit->>'circle_name' IS NOT NULL AND nullif(btrim(p_unit->>'circle_name'), '') IS NOT NULL THEN
    SELECT id INTO v_target_circle_id FROM public.jurisdictions
      WHERE name = btrim(p_unit->>'circle_name') AND tier = 'CIRCLE'
      ORDER BY (CASE WHEN v_actor.jurisdiction_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, id) THEN 0 ELSE 1 END)
      LIMIT 1;
    IF v_target_circle_id IS NULL THEN
      v_target_circle_id := v_unit.circle_id;
    END IF;
  END IF;

  IF v_actor.role_code IN ('INSPECTOR','ETI') AND v_target_circle_id IS DISTINCT FROM v_unit.circle_id THEN
    RAISE EXCEPTION 'Tax Inspector cannot change the circle jurisdiction of a unit' USING ERRCODE = '42501';
  END IF;

  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_circle_id) THEN
      RAISE EXCEPTION 'Target circle is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT name INTO v_target_circle_name FROM public.jurisdictions WHERE id = v_target_circle_id;

  SELECT teh.name INTO v_tehsil
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id AND teh.tier = 'TEHSIL'
  WHERE c.id = v_target_circle_id;

  SELECT dist.name INTO v_district_name
  FROM public.jurisdictions c
  JOIN public.jurisdictions teh ON teh.id = c.parent_id
  JOIN public.jurisdictions dist ON dist.id = teh.parent_id
  WHERE c.id = v_target_circle_id;

  v_identifier := upper(regexp_replace(coalesce(p_unit->>'identifier_value', v_unit.identifier_value), '[^0-9A-Za-z]', '', 'g'));
  v_prev_state := v_unit.state;
  v_edit_reason := coalesce(nullif(btrim(p_unit->>'edit_reason'), ''), 'Assessee particulars updated under statutory governance');

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
      opening_arrears = v_new_opening_arrears,
      state = v_next_state,
      row_version = row_version + 1,
      updated_at = now(),
      submitted_at = CASE WHEN v_next_state = 'SUBMITTED' THEN now() ELSE submitted_at END
  WHERE id = v_unit.id
  RETURNING * INTO v_unit;

  INSERT INTO public.workflow_actions(
    aggregate_type, aggregate_id, action, from_status, to_status, reason,
    actor_id, actor_role, correlation_id, idempotency_key
  ) VALUES (
    'SURVEY_UNIT', v_unit.id, 'EDIT', v_prev_state, v_next_state, v_edit_reason,
    v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  );

  SELECT coalesce(max(version_no), 0) + 1
    INTO v_next_av_no
  FROM public.assessment_versions
  WHERE unit_id = v_unit.id;

  INSERT INTO public.assessment_versions (
    unit_id, version_no, financial_year_id, pin_number, permanent_demand_no,
    category_code, subclassification_code, annual_rate_pkr, opening_arrears,
    status, reason, snapshot, created_by, created_at, approved_by, approved_at
  ) VALUES (
    v_unit.id, v_next_av_no, v_unit.financial_year_id, v_unit.pin_number, v_unit.permanent_demand_no,
    v_unit.category_code, v_unit.subclassification_code, v_unit.annual_rate_pkr, v_unit.opening_arrears,
    v_next_state, v_edit_reason,
    jsonb_build_object(
      'legalName', v_unit.legal_name,
      'taxpayerName', v_unit.taxpayer_name,
      'tradeName', v_unit.trade_name,
      'categoryName', v_unit.category_name,
      'subclassificationName', v_unit.subclassification_name,
      'circleName', v_unit.circle_name,
      'tehsil', v_unit.tehsil,
      'districtName', v_unit.district_name,
      'identifierType', v_unit.identifier_type,
      'identifierValue', v_unit.identifier_value,
      'address', v_unit.address,
      'ratePkr', v_unit.annual_rate_pkr,
      'status', v_next_state
    ),
    v_actor.user_id, now(), NULL, NULL
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_UNIT_UPDATED', 'SURVEY_UNIT', v_unit.id,
    v_actor.user_id, v_actor.role_code, v_target_circle_id, p_correlation_id, v_prev_state, v_next_state,
    v_edit_reason
  );

  RETURN jsonb_build_object(
    'id', v_unit.id,
    'state', v_unit.state,
    'row_version', v_unit.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_pft2_challan(
  p_challan_id uuid,
  p_action text,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS public.pft2_challans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.pft2_challans;
  a record;
  n public.challan_administrative_state;
  old public.challan_administrative_state;
BEGIN
  SELECT * INTO c FROM public.pft2_challans WHERE id = p_challan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challan not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_actions WHERE aggregate_type = 'PFT2_CHALLAN' AND idempotency_key = p_idempotency_key) THEN
    RETURN c;
  END IF;

  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR']) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id, c.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF c.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE = '40001'; END IF;

  IF upper(btrim(coalesce(p_action, ''))) = 'CANCEL' AND c.payment_state::text = 'RECEIVED' THEN
    RAISE EXCEPTION 'paid challan cannot be cancelled' USING ERRCODE = '23514';
  END IF;

  old := c.administrative_state;
  n := (CASE
    WHEN old = 'PREPARED' AND p_action = 'ISSUE' THEN 'ISSUED'
    WHEN old = 'ISSUED' AND p_action = 'CANCEL' AND length(btrim(coalesce(p_reason, ''))) > 0 THEN 'CANCELLED'
    ELSE NULL
  END)::public.challan_administrative_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid challan transition' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.workflow_actions(
    aggregate_type, aggregate_id, action, from_status, to_status, reason,
    actor_id, actor_role, correlation_id, idempotency_key
  ) VALUES (
    'PFT2_CHALLAN', c.id, p_action, old::text, n::text, p_reason,
    a.user_id, a.role_code, p_correlation_id, p_idempotency_key
  );

  UPDATE public.pft2_challans
  SET administrative_state = n,
      row_version = row_version + 1,
      issued_at = CASE WHEN n = 'ISSUED' THEN now() ELSE issued_at END,
      cancelled_at = CASE WHEN n = 'CANCELLED' THEN now() ELSE cancelled_at END,
      cancellation_source = CASE WHEN n = 'CANCELLED' THEN 'MANUAL' ELSE cancellation_source END,
      cancellation_reason = CASE WHEN n = 'CANCELLED' THEN p_reason ELSE cancellation_reason END
  WHERE id = c.id
  RETURNING * INTO c;

  PERFORM ptas_private.audit_transition(
    'PFT2_TRANSITION', 'PFT2_CHALLAN', c.id, a.user_id, a.role_code,
    c.jurisdiction_id, p_correlation_id, old::text, n::text, p_reason
  );
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_pft2_challan_record(
  p_challan jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_is_potential boolean := coalesce((p_challan->>'isProvisional')::boolean, (p_challan->>'challanType') = 'PROVISIONAL', false);
  v_unit_id uuid;
  v_jurisdiction_id uuid;
  v_financial_year text;
  v_legal_name text;
  v_trade_name text;
  v_identifier_type text;
  v_identifier_value text;
  v_demand_no text;
  v_pin text;
  v_challan_number text;
  v_amount numeric(18,2) := (p_challan->>'amountPayable')::numeric;
  v_issue_date date := coalesce((p_challan->>'issueDate')::date, current_date);
  v_due_date date := coalesce((p_challan->>'dueDate')::date, current_date + 30);
  v_scope text := coalesce(p_challan->>'demandScope', 'CURRENT');
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_due_date < v_issue_date THEN
    RAISE EXCEPTION 'invalid challan amount or date range' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;

  IF v_is_potential THEN
    SELECT p.id, p.circle_id, coalesce(r.financial_year_code, '2026-2027'),
           p.legal_name, p.trade_name, p.identifier_type, p.identifier_value,
           p.potential_number, coalesce(p.pin_number, p.provincial_uin)
      INTO v_unit_id, v_jurisdiction_id, v_financial_year,
           v_legal_name, v_trade_name, v_identifier_type, v_identifier_value,
           v_demand_no, v_pin
    FROM public.potential_assessment_units p
    LEFT JOIN LATERAL (
      SELECT financial_year_code
      FROM public.survey_classification_rules
      WHERE statutory_rule_id = p.statutory_rule_id AND status = 'ACTIVE'
      ORDER BY effective_from DESC
      LIMIT 1
    ) r ON true
    WHERE p.id = (p_challan->>'unitId')::uuid AND p.status = 'ACTIVE';
  ELSE
    -- Require formal ETO-APPROVED state for regular Form P.F.T-2 issuance
    SELECT p.id, p.circle_id, p.financial_year_id,
           p.legal_name, p.trade_name, p.identifier_type, p.identifier_value,
           p.permanent_demand_no, coalesce(p.pin_number, p.provincial_uin)
      INTO v_unit_id, v_jurisdiction_id, v_financial_year,
           v_legal_name, v_trade_name, v_identifier_type, v_identifier_value,
           v_demand_no, v_pin
    FROM public.pft3_assessment_units p
    WHERE p.id = (p_challan->>'unitId')::uuid AND p.state = 'APPROVED';
  END IF;

  IF v_unit_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'approved taxpayer unit not found in actor jurisdiction' USING ERRCODE = '42501';
  END IF;

  SELECT id, snapshot INTO v_id, v_snapshot FROM public.pft2_challans
    WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_snapshot; END IF;

  v_challan_number := ptas_private.generate_pft2_notice_number(
    v_jurisdiction_id, v_is_potential, v_scope, v_issue_date, '01'
  );
  PERFORM pg_advisory_xact_lock(hashtext('pft2-notice:' || v_challan_number));

  IF EXISTS (SELECT 1 FROM public.pft2_challans WHERE challan_number = v_challan_number) THEN
    v_challan_number := ptas_private.generate_pft2_notice_number(
      v_jurisdiction_id, v_is_potential, v_scope, v_issue_date, '01'
    );
  END IF;

  v_id := gen_random_uuid();
  -- Lock authoritative DB identity/amount/status fields over untrusted JSON keys
  v_snapshot := (p_challan - 'status' - 'receivedAt' - 'receiptNumber' - 'cancelledReason') || jsonb_build_object(
    'id', v_id::text,
    'unitId', v_unit_id::text,
    'challanNumber', v_challan_number,
    'noticeNumber', v_challan_number,
    'demandNumber', coalesce(v_demand_no, p_challan->>'demandNumber'),
    'legalName', v_legal_name,
    'tradeName', coalesce(v_trade_name, v_legal_name),
    'identifierType', v_identifier_type,
    'identifierValue', v_identifier_value,
    'pin', coalesce(nullif(v_pin, ''), p_challan->>'pin'),
    'amountPayable', v_amount,
    'challanType', CASE WHEN v_is_potential THEN 'PROVISIONAL' ELSE 'REGULAR' END,
    'isProvisional', v_is_potential,
    'status', 'ISSUED'
  );

  INSERT INTO public.pft2_challans(
    id, challan_type, pft3_unit_id, potential_unit_id, financial_year_id, jurisdiction_id,
    challan_number, notice_number, administrative_state, payment_state,
    due_date, issue_date, issued_at, issued_by, amount, idempotency_key, snapshot
  ) VALUES (
    v_id,
    CASE WHEN v_is_potential THEN 'PROVISIONAL' ELSE 'REGULAR' END,
    CASE WHEN v_is_potential THEN NULL ELSE v_unit_id END,
    CASE WHEN v_is_potential THEN v_unit_id ELSE NULL END,
    v_financial_year, v_jurisdiction_id, v_challan_number, v_challan_number,
    'ISSUED', 'OUTSTANDING', v_due_date, v_issue_date, now(), v_actor.user_id,
    v_amount, p_idempotency_key, v_snapshot
  );

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'PFT2_CHALLAN_ISSUED', 'PFT2_CHALLAN', v_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'challan_number', v_challan_number,
      'amount', v_amount,
      'challan_type', CASE WHEN v_is_potential THEN 'PROVISIONAL' ELSE 'REGULAR' END,
      'unit_id', v_unit_id::text
    )
  );

  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_pft2_challan_record(
  p_challan_id uuid,
  p_is_potential boolean,
  p_receipt jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_pft3_unit_id uuid;
  v_potential_unit_id uuid;
  v_amount numeric(18,2);
  v_challan_number text;
  v_challan_type text;
  v_admin_state text;
  v_payment_state text;
  v_challan_snapshot jsonb;
  v_receipt_id uuid;
  v_receipt_number text := btrim(coalesce(p_receipt->>'receiptNumber', ''));
  v_receipt_snapshot jsonb;
  v_received_at timestamptz := coalesce(nullif(p_receipt->>'dateOfReceipt', '')::date, current_date)::timestamptz;
  v_scroll_ref text := btrim(coalesce(p_receipt->>'bankScrollRef', ''));
  v_channel text := coalesce(nullif(btrim(p_receipt->>'paymentChannel'), ''), 'NATIONAL_BANK');
  v_branch text := coalesce(nullif(btrim(p_receipt->>'bankBranch'), ''), 'Vehari Main');
  v_pin text := coalesce(nullif(btrim(p_receipt->>'pin'), ''), nullif(btrim(p_receipt->>'securityCode'), ''), '');
  v_sha256 text := coalesce(p_receipt->>'officialSha256', '');
  v_migrated jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'FINANCE']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE = '22023';
  END IF;

  SELECT id, snapshot INTO v_receipt_id, v_receipt_snapshot
  FROM public.pft2_receipts
  WHERE idempotency_key = p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN
    RETURN jsonb_build_object('challan', v_receipt_snapshot->'challanSnapshot', 'receipt', v_receipt_snapshot);
  END IF;

  SELECT
    jurisdiction_id, pft3_unit_id, potential_unit_id, amount, challan_number,
    challan_type, administrative_state::text, payment_state::text, snapshot
  INTO
    v_jurisdiction_id, v_pft3_unit_id, v_potential_unit_id, v_amount, v_challan_number,
    v_challan_type, v_admin_state, v_payment_state, v_challan_snapshot
  FROM public.pft2_challans
  WHERE id = p_challan_id
  FOR UPDATE;

  IF v_challan_number IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE = '42501';
  END IF;

  -- Reject unissued drafts and already-paid challans (CANCELLED + OUTSTANDING remains permitted for late bank scroll reconciliation)
  IF v_admin_state = 'PREPARED' THEN
    RAISE EXCEPTION 'unissued draft challan cannot accept a payment receipt' USING ERRCODE = '23514';
  END IF;

  IF v_payment_state <> 'OUTSTANDING' THEN
    RAISE EXCEPTION 'challan payment has already been received (state=%)', v_payment_state USING ERRCODE = '23505';
  END IF;

  IF v_amount <= 0 OR (p_receipt->>'amountPaidPkr')::numeric <> v_amount THEN
    RAISE EXCEPTION 'receipt amount must equal the positive issued challan amount' USING ERRCODE = '23514';
  END IF;
  IF length(v_receipt_number) = 0 THEN RAISE EXCEPTION 'receipt number is required' USING ERRCODE = '22023'; END IF;
  IF length(v_scroll_ref) = 0 THEN RAISE EXCEPTION 'bank scroll reference is required' USING ERRCODE = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.pft2_receipts WHERE upper(btrim(bank_transaction_id)) = upper(v_scroll_ref)) THEN
    RAISE EXCEPTION 'duplicate bank scroll / transaction reference %', v_scroll_ref USING ERRCODE = '23505';
  END IF;

  -- Migrate provisional unit to PFT-3 BEFORE inserting immutable receipt row
  IF (v_challan_type = 'PROVISIONAL' OR p_is_potential) AND v_potential_unit_id IS NOT NULL THEN
    v_migrated := ptas_private.migrate_potential_unit_to_pft3_internal(
      v_potential_unit_id,
      coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_challan_snapshot->>'demandNumber'),
      v_actor.user_id,
      v_actor.role_code,
      v_actor.jurisdiction_id,
      p_correlation_id
    );
    v_pft3_unit_id := (v_migrated->>'pft3_unit_id')::uuid;
  END IF;

  v_challan_snapshot := v_challan_snapshot || jsonb_build_object(
    'status', 'RECEIVED',
    'receiptNumber', v_receipt_number,
    'receivedAt', coalesce(p_receipt->>'dateOfReceipt', v_received_at::date::text),
    'receivedBy', v_actor.user_id::text,
    'bankScrollRef', v_scroll_ref,
    'paymentChannel', v_channel
  );

  v_receipt_id := gen_random_uuid();
  v_receipt_snapshot := p_receipt || jsonb_build_object(
    'id', v_receipt_id::text,
    'receiptNumber', v_receipt_number,
    'challanNumber', v_challan_number,
    'issuedPft2Id', p_challan_id::text,
    'paymentSource', 'ISSUED_PFT2',
    'receiptCategory', CASE WHEN v_challan_type = 'PROVISIONAL' OR p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END,
    'challanSnapshot', v_challan_snapshot
  );

  INSERT INTO public.pft2_receipts(
    id, receipt_number, payment_source, receipt_category,
    challan_id, potential_challan_id, pft3_unit_id, potential_unit_id,
    amount, payment_channel, bank_branch, bank_transaction_id,
    deposit_date, received_by, received_at, pin, official_sha256,
    idempotency_key, snapshot
  ) VALUES (
    v_receipt_id, v_receipt_number, 'ISSUED_PFT2',
    CASE WHEN v_challan_type = 'PROVISIONAL' OR p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END,
    p_challan_id,
    CASE WHEN v_challan_type = 'PROVISIONAL' OR p_is_potential THEN p_challan_id ELSE NULL END,
    v_pft3_unit_id,
    v_potential_unit_id,
    v_amount, v_channel, v_branch, v_scroll_ref,
    v_received_at::date, v_actor.user_id, v_received_at, v_pin, v_sha256,
    p_idempotency_key, v_receipt_snapshot
  );

  UPDATE public.pft2_challans
  SET
    payment_state = 'RECEIVED',
    pft3_unit_id = coalesce(v_pft3_unit_id, pft3_unit_id),
    received_at = v_received_at,
    row_version = row_version + 1,
    updated_at = now(),
    snapshot = v_challan_snapshot
  WHERE id = p_challan_id;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'PFT2_PAYMENT_RECEIVED', 'PFT2_CHALLAN', p_challan_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'receipt_number', v_receipt_number,
      'amount', v_amount,
      'challan_type', v_challan_type,
      'bank_scroll_ref', v_scroll_ref
    )
  );

  RETURN jsonb_build_object('challan', v_challan_snapshot, 'receipt', v_receipt_snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pft2_challan_record(
  p_challan_id uuid,
  p_is_potential boolean,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_admin_state text;
  v_payment_state text;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'cancellation reason required' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;

  SELECT jurisdiction_id, administrative_state::text, payment_state::text, snapshot
    INTO v_jurisdiction_id, v_admin_state, v_payment_state, v_snapshot
  FROM public.pft2_challans
  WHERE id = p_challan_id
  FOR UPDATE;

  IF v_jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay if already processed by same key
  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type = 'PFT2_CHALLAN' AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN v_snapshot;
  END IF;

  IF v_payment_state = 'RECEIVED' THEN
    RAISE EXCEPTION 'paid challan cannot be cancelled' USING ERRCODE = '23514';
  END IF;
  IF v_admin_state = 'CANCELLED' THEN
    RAISE EXCEPTION 'challan has already been cancelled' USING ERRCODE = '23514';
  END IF;

  v_snapshot := v_snapshot || jsonb_build_object(
    'status', 'CANCELLED',
    'cancelledReason', p_reason,
    'cancelledAt', current_date::text,
    'cancelledBy', v_actor.user_id::text
  );

  UPDATE public.pft2_challans
  SET
    administrative_state = 'CANCELLED',
    cancelled_at = now(),
    cancellation_source = 'MANUAL',
    cancellation_reason = p_reason,
    row_version = row_version + 1,
    updated_at = now(),
    snapshot = v_snapshot
  WHERE id = p_challan_id;

  INSERT INTO public.workflow_actions(
    aggregate_type, aggregate_id, action, from_status, to_status, reason,
    actor_id, actor_role, correlation_id, idempotency_key
  ) VALUES (
    'PFT2_CHALLAN', p_challan_id, 'CANCEL', v_admin_state, 'CANCELLED', p_reason,
    v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  );

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'PFT2_CHALLAN_CANCELLED', 'PFT2_CHALLAN', p_challan_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object('reason', p_reason, 'previous_state', v_admin_state)
  );

  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_direct_statutory_receipt(
  p_unit_id uuid,
  p_is_potential boolean,
  p_receipt jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_amount numeric(18,2) := (p_receipt->>'amountPaidPkr')::numeric;
  v_receipt_id uuid;
  v_receipt_number text := btrim(coalesce(p_receipt->>'receiptNumber', ''));
  v_receipt_snapshot jsonb;
  v_received_at timestamptz := coalesce(nullif(p_receipt->>'dateOfReceipt', '')::date, current_date)::timestamptz;
  v_channel text := coalesce(nullif(btrim(p_receipt->>'paymentChannel'), ''), 'National Bank of Pakistan');
  v_branch text := nullif(btrim(p_receipt->>'bankBranch'), '');
  v_scroll_ref text := btrim(coalesce(p_receipt->>'bankScrollRef', ''));
  v_pin text := coalesce(nullif(btrim(p_receipt->>'pin'), ''), nullif(btrim(p_receipt->>'securityCode'), ''));
  v_sha256 text := nullif(btrim(p_receipt->>'officialSha256'), '');
  v_demand_no text;
  v_unit_state text;
  v_pft3_unit_id uuid;
  v_migrated jsonb;
BEGIN
  -- Statutory direct receipt recording is limited strictly to field Inspector / ETO
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE = '22023';
  END IF;

  SELECT id, snapshot INTO v_receipt_id, v_receipt_snapshot
  FROM public.pft2_receipts
  WHERE idempotency_key = p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN RETURN v_receipt_snapshot; END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'payment receipt amount must be greater than zero' USING ERRCODE = '23514'; END IF;
  IF length(v_receipt_number) = 0 THEN RAISE EXCEPTION 'receipt number is required' USING ERRCODE = '22023'; END IF;
  IF length(v_scroll_ref) = 0 THEN RAISE EXCEPTION 'bank scroll reference is required' USING ERRCODE = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.pft2_receipts WHERE upper(btrim(bank_transaction_id)) = upper(v_scroll_ref)) THEN
    RAISE EXCEPTION 'duplicate bank scroll / transaction reference %', v_scroll_ref USING ERRCODE = '23505';
  END IF;

  IF p_is_potential THEN
    SELECT circle_id, potential_number, status
      INTO v_jurisdiction_id, v_demand_no, v_unit_state
    FROM public.potential_assessment_units
    WHERE id = p_unit_id
    FOR UPDATE;
  ELSE
    SELECT circle_id, permanent_demand_no, state
      INTO v_jurisdiction_id, v_demand_no, v_unit_state
    FROM public.pft3_assessment_units
    WHERE id = p_unit_id
    FOR UPDATE;
  END IF;

  IF v_jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'unit not found in actor jurisdiction' USING ERRCODE = '42501';
  END IF;

  IF NOT p_is_potential AND v_unit_state <> 'APPROVED' THEN
    RAISE EXCEPTION 'direct statutory receipt requires an APPROVED Form P.F.T-3 assessment' USING ERRCODE = '23514';
  END IF;

  IF p_is_potential THEN
    IF v_unit_state = 'CANCELLED' THEN
      RAISE EXCEPTION 'cancelled potential unit cannot receive direct statutory payments' USING ERRCODE = '23514';
    END IF;
    v_migrated := ptas_private.migrate_potential_unit_to_pft3_internal(
      p_unit_id,
      coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_demand_no),
      v_actor.user_id,
      v_actor.role_code,
      v_actor.jurisdiction_id,
      p_correlation_id
    );
    v_pft3_unit_id := (v_migrated->>'pft3_unit_id')::uuid;
  ELSE
    v_pft3_unit_id := p_unit_id;
  END IF;

  v_receipt_id := gen_random_uuid();
  v_receipt_snapshot := p_receipt || jsonb_build_object(
    'id', v_receipt_id::text,
    'receiptNumber', v_receipt_number,
    'unitId', coalesce(v_pft3_unit_id, p_unit_id)::text,
    'demandNumber', coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_demand_no),
    'paymentSource', 'MANUAL',
    'receiptCategory', CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END
  );

  INSERT INTO public.pft2_receipts(
    id, receipt_number, payment_source, receipt_category,
    challan_id, potential_challan_id, pft3_unit_id, potential_unit_id,
    amount, payment_channel, bank_branch, bank_transaction_id,
    deposit_date, received_by, received_at, pin, official_sha256,
    idempotency_key, snapshot
  ) VALUES (
    v_receipt_id, v_receipt_number, 'MANUAL',
    CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END,
    NULL, NULL,
    v_pft3_unit_id,
    CASE WHEN p_is_potential THEN p_unit_id ELSE NULL END,
    v_amount, v_channel, v_branch, v_scroll_ref,
    v_received_at::date, v_actor.user_id, v_received_at, v_pin, v_sha256,
    p_idempotency_key, v_receipt_snapshot
  );

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'STATUTORY_RECEIPT_MANUALLY_RECORDED', 'STATUTORY_RECEIPT', v_receipt_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'amount', v_amount,
      'potential', p_is_potential,
      'unit_id', coalesce(v_pft3_unit_id, p_unit_id)::text,
      'bank_scroll_ref', v_scroll_ref,
      'payment_channel', v_channel
    )
  );

  RETURN v_receipt_snapshot;
END;
$$;

-- ============================================================================
-- 10. HARDEN PUBLIC DOCUMENT VERIFICATION RPC (ANTI-ENUMERATION & PII REDUCTION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_statutory_document_public(
  p_document_ref text,
  p_pin text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := upper(btrim(coalesce(p_document_ref, '')));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_res jsonb;
BEGIN
  v_pin := regexp_replace(v_pin, '^(PIN[-:]?[[:space:]]*)', '', 'i');

  IF (length(v_ref) < 4 AND length(v_pin) <> 6) OR (length(v_ref) = 0 AND length(v_pin) = 0) THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'error', 'INVALID_QUERY',
      'message', 'Please provide an official Document Reference Number (minimum 4 characters) or 6-digit Security Code.'
    );
  END IF;

  -- 1. Check unified PFT-2 challans once (no redundant UNION ALL with potential view)
  SELECT jsonb_build_object(
    'is_valid', coalesce(c.administrative_state::text, '') <> 'CANCELLED',
    'document_type', 'FORM_PFT2_CHALLAN',
    'status', CASE
      WHEN coalesce(c.administrative_state::text, c.snapshot->>'status', '') = 'CANCELLED' THEN 'CANCELLED'
      WHEN c.payment_state::text = 'RECEIVED' THEN 'PAID'
      ELSE 'AUTHENTIC_VALID'
    END,
    'reference_number', coalesce(c.notice_number, c.challan_number),
    'challan_number', c.challan_number,
    'legal_name', coalesce(c.snapshot->>'legalName', 'Registered Assessee'),
    'trade_name', nullif(coalesce(c.snapshot->>'tradeName', ''), ''),
    'district', coalesce(c.snapshot->>'district', 'Punjab'),
    'circle', coalesce(c.snapshot->>'circleName', 'Excise Circle'),
    'tehsil', coalesce(c.snapshot->>'tehsil', ''),
    'financial_year', coalesce(c.financial_year_id, '2026-2027'),
    'category_name', coalesce(c.snapshot->>'category', 'Statutory Assessment'),
    'classification', coalesce(c.snapshot->>'subclassificationCode', 'Schedule 1977'),
    'amount_payable', c.amount,
    'remaining_balance', CASE WHEN c.payment_state::text = 'RECEIVED' THEN 0 ELSE coalesce((c.snapshot->>'remainingBalance')::numeric, c.amount) END,
    'due_date', coalesce(c.snapshot->>'dueDate', c.due_date::text),
    'issue_date', coalesce(c.snapshot->>'issueDate', c.issue_date::text),
    'head_of_account', coalesce(c.snapshot->>'headOfAccount', 'B01601'),
    'pin', coalesce(c.snapshot->>'pin', c.snapshot->>'securityCode', ''),
    'official_sha256', coalesce(c.snapshot->>'officialSha256', ''),
    'issuing_authority', 'Excise & Taxation Officer (Assessing Authority)',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft2_challans c
  WHERE c.administrative_state <> 'PREPARED'
    AND (
      (length(v_ref) >= 4 AND (
        upper(c.challan_number) = v_ref
        OR upper(coalesce(c.notice_number, '')) = v_ref
        OR upper(coalesce(c.snapshot->>'noticeNumber', '')) = v_ref
      ))
      OR (v_pin ~ '^[0-9]{6}$' AND (coalesce(c.snapshot->>'pin', '') = v_pin OR coalesce(c.snapshot->>'securityCode', '') = v_pin))
      OR (v_ref ~ '^[0-9]{6}$' AND (coalesce(c.snapshot->>'pin', '') = v_ref OR coalesce(c.snapshot->>'securityCode', '') = v_ref))
    )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 2. Check statutory payment receipts
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT_RECEIPT',
    'status', 'AUTHENTIC_VALID',
    'reference_number', r.receipt_number,
    'receipt_number', r.receipt_number,
    'legal_name', coalesce(u.legal_name, pu.legal_name, r.snapshot->>'assesseeLegalName', 'Registered Assessee'),
    'trade_name', nullif(coalesce(u.trade_name, pu.trade_name, r.snapshot->>'assesseeTradeName', ''), ''),
    'district', coalesce(u.district_name, pu.district_name, 'Punjab'),
    'circle', coalesce(u.circle_name, pu.circle_name, 'Excise Circle'),
    'financial_year', coalesce(u.financial_year_id, '2026-2027'),
    'category_name', coalesce(u.category_name, pu.category_name, 'Statutory Assessment'),
    'classification', coalesce(u.subclassification_code, pu.subclassification_code, 'Schedule 1977'),
    'amount_paid', r.amount,
    'bank_scroll_ref', coalesce(r.bank_transaction_id, 'TREASURY'),
    'bank_branch', r.bank_branch,
    'payment_channel', r.payment_channel,
    'deposit_date', coalesce(r.deposit_date::text, ''),
    'pin', coalesce(r.pin, ''),
    'official_sha256', coalesce(r.official_sha256, ''),
    'issuing_authority', 'Excise & Taxation Department, Government of the Punjab',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft2_receipts r
  LEFT JOIN public.pft3_assessment_units u ON u.id = r.pft3_unit_id
  LEFT JOIN public.potential_assessment_units pu ON pu.id = r.potential_unit_id
  WHERE (
    (length(v_ref) >= 4 AND (
      upper(r.receipt_number) = v_ref
      OR upper(coalesce(r.bank_transaction_id, '')) = v_ref
      OR upper(coalesce(r.snapshot->>'challanNumber', '')) = v_ref
    ))
    OR (v_pin ~ '^[0-9]{6}$' AND coalesce(r.pin, '') = v_pin)
    OR (v_ref ~ '^[0-9]{6}$' AND coalesce(r.pin, '') = v_ref)
  )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 3. Check strictly APPROVED Form P.F.T-3 demand units (never expose drafts or street address/CNIC)
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT1_NOTICE',
    'status', 'AUTHENTIC_VALID',
    'reference_number', coalesce(p.pin_number, p.permanent_demand_no),
    'permanent_demand_no', p.permanent_demand_no,
    'provincial_uin', p.provincial_uin,
    'legal_name', p.legal_name,
    'trade_name', nullif(p.trade_name, ''),
    'district', coalesce(p.district_name, 'Punjab'),
    'circle', coalesce(p.circle_name, 'Excise Circle'),
    'category_name', coalesce(p.category_name, 'Statutory Assessment'),
    'classification', coalesce(p.subclassification_code, 'Schedule 1977'),
    'pin', coalesce(p.pin_number, ''),
    'issuing_authority', 'Excise & Taxation Officer (Assessing Authority)',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft3_assessment_units p
  WHERE p.state = 'APPROVED'
    AND (
      (length(v_ref) >= 4 AND (
        upper(coalesce(p.provincial_uin, '')) = v_ref
        OR upper(coalesce(p.pin_number, '')) = v_ref
        OR upper(coalesce(p.permanent_demand_no, '')) = v_ref
      ))
      OR (v_pin ~ '^[0-9]{6}$' AND (p.pin_number = v_pin OR p.pin_number = 'PIN-' || v_pin))
      OR (v_ref ~ '^[0-9]{6}$' AND (p.pin_number = v_ref OR p.pin_number = 'PIN-' || v_ref))
    )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  RETURN jsonb_build_object(
    'is_valid', false,
    'error', 'DOCUMENT_NOT_FOUND',
    'message', 'No authentic statutory record was found matching the queried reference or Security Code.'
  );
END;
$$;

-- ============================================================================
-- 11. FUNCTION EXECUTE GRANTS & PRIVATE HELPER LOCKDOWN
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- Revoke execute from PUBLIC/anon/authenticated on internal ptas_private functions
  -- except the 4 read-only authorization/jurisdiction helpers required by RLS policies
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ptas_private'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.proname IN ('accessible_jurisdiction_ids', 'active_actor', 'can_access_jurisdiction', 'jurisdiction_contains') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_officer_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_officer_status(uuid, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_officers_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_district_governance_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_district_governance_matrix() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_management_audit_log(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_management_audit_log(int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_assessment_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assessment_versions(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_potential_assessment_unit(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_potential_assessment_unit(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_potential_assessment_unit(uuid, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_operational_survey_unit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operational_survey_unit(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_pft2_challan_registry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pft2_challan_registry() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_pft2_receipt_registry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pft2_receipt_registry() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_individual_survey_unit(jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid, text, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid, text, bigint, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_individual_survey_unit(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit(uuid, jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_pft2_challan(uuid, text, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_pft2_challan(uuid, text, bigint, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_pft2_challan_record(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_pft2_challan_record(jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.receive_pft2_challan_record(uuid, boolean, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_pft2_challan_record(uuid, boolean, jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_pft2_challan_record(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pft2_challan_record(uuid, boolean, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_direct_statutory_receipt(uuid, boolean, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_direct_statutory_receipt(uuid, boolean, jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_statutory_document_public(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_statutory_document_public(text, text) TO anon, authenticated, service_role;

COMMIT;

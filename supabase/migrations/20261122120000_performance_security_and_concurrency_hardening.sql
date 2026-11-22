-- 0056_performance_security_and_concurrency_hardening.sql
-- Non-destructive forward migration addressing measured query latency bottlenecks,
-- missing covering/foreign-key indexes, redundant/permissive RLS policies, mutable
-- SECURITY DEFINER search_paths, anonymous RPC execution grants, and SECURITY INVOKER view enforcement.
--
-- Manual Rollback Reference (if ever required by DBA):
--   - DROP INDEX IF EXISTS for the new covering indexes listed in Section 2.
--   - DROP FUNCTION IF EXISTS ptas_private.accessible_jurisdiction_ids(uuid);
--   - Re-apply original list_* RPC definitions from migrations 0037 / 0041 / 0049 / 0055.

BEGIN;

-- =============================================================================
-- 1. SET-BASED JURISDICTION EXPANSION & N+1 ELIMINATION ON CORE LIST RPCs
-- =============================================================================

-- Computes the full accessible jurisdiction UUID set ONCE per RPC invocation
-- rather than re-evaluating the 6-branch recursive CTE per table row.
-- Semantically identical to all branches A..F of ptas_private.jurisdiction_contains().
CREATE OR REPLACE FUNCTION ptas_private.accessible_jurisdiction_ids(p_root uuid)
RETURNS TABLE(jurisdiction_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE legacy_tree AS (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE p_root IS NOT NULL AND j.id = p_root
    UNION ALL
    SELECT child.id
    FROM public.jurisdictions child
    JOIN legacy_tree parent ON child.parent_id = parent.id
  )
  -- A + B: Direct root match & legacy recursive tree
  SELECT id AS jurisdiction_id FROM legacy_tree
  UNION
  -- Include p_root directly even if p_root exists only in geo_* tables
  SELECT p_root AS jurisdiction_id WHERE p_root IS NOT NULL
  UNION
  -- C: Geo circles + districts under division root
  SELECT gc.id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.division_id = p_root
  UNION
  SELECT gc.district_id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.division_id = p_root AND gc.district_id IS NOT NULL
  UNION
  -- D: Geo circles under district root
  SELECT gc.id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.district_id = p_root
  UNION
  -- E: Geo circle <-> legacy jurisdiction cross-mapping
  SELECT j.id AS jurisdiction_id
  FROM public.geo_circles gc
  JOIN public.jurisdictions j
    ON j.code = gc.circle_code
    OR (gc.circle_code = 'VHR-1' AND j.code = 'CIR_VEH_01')
  WHERE p_root IS NOT NULL AND (gc.id = p_root OR gc.district_id = p_root)
  UNION
  SELECT gc.id AS jurisdiction_id
  FROM public.geo_circles gc
  JOIN public.jurisdictions j
    ON j.code = gc.circle_code
    OR (gc.circle_code = 'VHR-1' AND j.code = 'CIR_VEH_01')
  WHERE p_root IS NOT NULL AND j.id = p_root
  UNION
  -- F: Geo district <-> legacy jurisdiction cross-mapping
  SELECT j.id AS jurisdiction_id
  FROM public.geo_districts gd
  JOIN public.jurisdictions j
    ON j.code = ('DIST_' || gd.district_code)
    OR (gd.district_code = 'VHR' AND j.code = 'DIST_VEHARI')
  WHERE p_root IS NOT NULL AND gd.id = p_root
  UNION
  SELECT gd.id AS jurisdiction_id
  FROM public.geo_districts gd
  JOIN public.jurisdictions j
    ON j.code = ('DIST_' || gd.district_code)
    OR (gd.district_code = 'VHR' AND j.code = 'DIST_VEHARI')
  WHERE p_root IS NOT NULL AND j.id = p_root;
$$;

REVOKE ALL ON FUNCTION ptas_private.accessible_jurisdiction_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ptas_private.accessible_jurisdiction_ids(uuid) TO authenticated;

-- Optimize list_operational_survey_units(): eliminate per-row recursive CTE and per-row
-- correlated pft2_receipts subquery via materialized allowed_jurisdictions + single grouped ledger CTE.
CREATE OR REPLACE FUNCTION public.list_operational_survey_units()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
      WITH allowed_jurisdictions AS MATERIALIZED (
        SELECT jurisdiction_id
        FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id)
      ),
      scoped_units AS MATERIALIZED (
        SELECT u.*
        FROM public.pft3_assessment_units u
        JOIN allowed_jurisdictions aj ON aj.jurisdiction_id = u.circle_id
        WHERE (
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
              'masked_value', repeat('*', greatest(length(u.identifier_value) - 4, 0)) || right(u.identifier_value, 4)
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
          'ledger_entries', coalesce(ul.ledger_entries, '[]'::jsonb),
          'pft3_registered', (u.state = 'APPROVED'),
          'pft3_registered_at', u.approved_at
        )
        ORDER BY u.created_at DESC, u.id
      )
      FROM scoped_units u
      LEFT JOIN unit_ledger ul ON ul.pft3_unit_id = u.id
    ),
    '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET') AND a.jurisdiction_id IS NOT NULL
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
      OR EXISTS (
        SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = p.circle_id
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
  )
  SELECT coalesce(jsonb_agg(c.snapshot ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.pft2_challans c
  JOIN allowed_jurisdictions aj ON aj.jurisdiction_id = c.jurisdiction_id
  WHERE c.snapshot <> '{}'::jsonb;
$function$;

CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
  )
  SELECT coalesce(jsonb_agg(r.snapshot ORDER BY r.received_at DESC), '[]'::jsonb)
  FROM public.pft2_receipts r
  JOIN public.pft2_challans c ON c.id = r.challan_id
  JOIN allowed_jurisdictions aj ON aj.jurisdiction_id = c.jurisdiction_id
  WHERE r.snapshot <> '{}'::jsonb;
$function$;

-- =============================================================================
-- 2. COVERING & FOREIGN-KEY INDEXES FOR MEASURED SCAN HOTSPOTS
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_app_users_active_auth_uid
  ON public.app_users(auth_user_id)
  WHERE active AND deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_validity
  ON public.user_roles(user_id, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_user_roles_jurisdiction_id
  ON public.user_roles(jurisdiction_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_code
  ON public.user_roles(role_code);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_parent_id
  ON public.jurisdictions(parent_id);

CREATE INDEX IF NOT EXISTS idx_geo_circles_tehsil_id
  ON public.geo_circles(tehsil_id);

CREATE INDEX IF NOT EXISTS idx_pft3_units_circle_created
  ON public.pft3_assessment_units(circle_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_pft3_units_import_batch_id
  ON public.pft3_assessment_units(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_potential_units_circle_created
  ON public.potential_assessment_units(circle_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_potential_units_created_by
  ON public.potential_assessment_units(created_by);

CREATE INDEX IF NOT EXISTS idx_pft2_challans_issued_by
  ON public.pft2_challans(issued_by);

CREATE INDEX IF NOT EXISTS idx_pft2_receipts_pft3_unit_received
  ON public.pft2_receipts(pft3_unit_id, received_at ASC);

CREATE INDEX IF NOT EXISTS idx_pft2_receipts_received_by
  ON public.pft2_receipts(received_by);

CREATE INDEX IF NOT EXISTS idx_workflow_actions_actor_id
  ON public.workflow_actions(actor_id);

CREATE INDEX IF NOT EXISTS idx_survey_import_rows_resolved_jurisdiction
  ON public.survey_import_rows(resolved_jurisdiction_id);

CREATE INDEX IF NOT EXISTS idx_survey_import_rows_resolved_rule
  ON public.survey_import_rows(resolved_rule_id);

CREATE INDEX IF NOT EXISTS idx_survey_classification_rules_rate_pack
  ON public.survey_classification_rules(rate_pack_id);

CREATE INDEX IF NOT EXISTS idx_user_jurisdiction_assignments_assigned_by
  ON public.user_jurisdiction_assignments(assigned_by);

-- =============================================================================
-- 3. VIEW SECURITY INVOKER & ROW-LEVEL SECURITY HARDENING
-- =============================================================================

ALTER VIEW IF EXISTS public.potential_pft2_challans
  SET (security_invoker = true);

-- Enable RLS on public geography, bank branch, and assignment governance tables
ALTER TABLE public.geo_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_tehsils ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designated_bank_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_jurisdiction_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geo_divisions_authenticated_select ON public.geo_divisions;
CREATE POLICY geo_divisions_authenticated_select
  ON public.geo_divisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geo_districts_authenticated_select ON public.geo_districts;
CREATE POLICY geo_districts_authenticated_select
  ON public.geo_districts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geo_tehsils_authenticated_select ON public.geo_tehsils;
CREATE POLICY geo_tehsils_authenticated_select
  ON public.geo_tehsils FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geo_circles_authenticated_select ON public.geo_circles;
CREATE POLICY geo_circles_authenticated_select
  ON public.geo_circles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS designated_bank_branches_authenticated_select ON public.designated_bank_branches;
CREATE POLICY designated_bank_branches_authenticated_select
  ON public.designated_bank_branches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_jurisdiction_assignments_select ON public.user_jurisdiction_assignments;
CREATE POLICY user_jurisdiction_assignments_select
  ON public.user_jurisdiction_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT u.id FROM public.app_users u WHERE u.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM ptas_private.active_actor(ARRAY['ADMIN', 'DIRECTOR']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['ETO']) a
      WHERE ptas_private.jurisdiction_contains(
        a.jurisdiction_id,
        coalesce(circle_id, district_id, division_id)
      )
    )
  );

-- Eliminate permissive USING (true) / WITH CHECK (true) bypass on potential_assessment_units
-- and remove duplicate SELECT policy evaluation.
DROP POLICY IF EXISTS potential_units_authenticated_policy ON public.potential_assessment_units;

DROP POLICY IF EXISTS potential_assessment_units_write ON public.potential_assessment_units;
CREATE POLICY potential_assessment_units_write
  ON public.potential_assessment_units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'DIRECTOR', 'ADMIN']) a
      WHERE a.role_code IN ('ADMIN', 'DIRECTOR')
         OR ptas_private.jurisdiction_contains(a.jurisdiction_id, circle_id)
    )
  );

DROP POLICY IF EXISTS potential_assessment_units_update ON public.potential_assessment_units;
CREATE POLICY potential_assessment_units_update
  ON public.potential_assessment_units
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'DIRECTOR', 'ADMIN']) a
      WHERE a.role_code IN ('ADMIN', 'DIRECTOR')
         OR ptas_private.jurisdiction_contains(a.jurisdiction_id, circle_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'DIRECTOR', 'ADMIN']) a
      WHERE a.role_code IN ('ADMIN', 'DIRECTOR')
         OR ptas_private.jurisdiction_contains(a.jurisdiction_id, circle_id)
    )
  );

-- Consolidate redundant SELECT policies on pft3_assessment_units & pft2_receipts
DROP POLICY IF EXISTS pft3_assessment_units_select ON public.pft3_assessment_units;

DROP POLICY IF EXISTS pft2_receipts_all ON public.pft2_receipts;
CREATE POLICY pft2_receipts_write
  ON public.pft2_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'FINANCE', 'ADMIN', 'DIRECTOR']) a
      LEFT JOIN public.pft3_assessment_units p ON p.id = pft2_receipts.pft3_unit_id
      LEFT JOIN public.potential_assessment_units pau ON pau.id = pft2_receipts.potential_unit_id
      LEFT JOIN public.pft2_challans c ON c.id = pft2_receipts.challan_id
      LEFT JOIN public.potential_pft2_challans_deprecated pc ON pc.id = pft2_receipts.potential_challan_id
      WHERE a.role_code IN ('ADMIN', 'DIRECTOR')
         OR ptas_private.jurisdiction_contains(
              a.jurisdiction_id,
              coalesce(p.circle_id, pau.circle_id, c.jurisdiction_id, pc.jurisdiction_id)
            )
    )
  );

-- Replace overly permissive USING (true) / WITH CHECK (true) policies on assessment_versions
DROP POLICY IF EXISTS assessment_versions_select_policy ON public.assessment_versions;
CREATE POLICY assessment_versions_select_policy
  ON public.assessment_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pft3_assessment_units u
      WHERE u.id = assessment_versions.unit_id
        AND ptas_private.can_access_jurisdiction(u.circle_id)
    )
  );

DROP POLICY IF EXISTS assessment_versions_insert_policy ON public.assessment_versions;
CREATE POLICY assessment_versions_insert_policy
  ON public.assessment_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pft3_assessment_units u
      WHERE u.id = assessment_versions.unit_id
        AND ptas_private.can_access_jurisdiction(u.circle_id)
    )
  );

-- =============================================================================
-- 4. LEAST-PRIVILEGE RPC GRANTS & SEARCH_PATH LOCKDOWN
-- =============================================================================

DO $$
DECLARE
  v_sig text;
  v_anon_revoke_sigs text[] := ARRAY[
    'public.bulk_insert_potential_units(jsonb)',
    'public.bulk_submit_survey_import(uuid, text, text)',
    'public.fn_sync_user_jurisdiction_to_roles()',
    'public.get_designated_bank_branches(text)',
    'public.insert_potential_assessment_unit(jsonb)',
    'public.list_actionable_survey_import_batches()',
    'public.record_direct_statutory_receipt(uuid, boolean, jsonb, text, text)',
    'public.list_operational_survey_units()',
    'public.list_potential_assessment_units()',
    'public.list_pft2_challan_registry()',
    'public.list_pft2_receipt_registry()'
  ];
  v_search_path_sigs text[] := ARRAY[
    'ptas_private.survey_import_text(jsonb, text)',
    'ptas_private.survey_import_date(text)',
    'public.enforce_immutable_ledger_and_audit()',
    'ptas_private.prevent_historical_mutation()',
    'ptas_private.normalize_demand_no(text)',
    'ptas_private.get_next_circle_demand_no(uuid)',
    'ptas_private.get_district_pbs_code(text)',
    'ptas_private.drop_legacy_generate_pin_overload()',
    'public.test_drop_trigger()'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_anon_revoke_sigs LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
      IF v_sig = 'public.fn_sync_user_jurisdiction_to_roles()' THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
      ELSE
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
      END IF;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY v_search_path_sigs LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', v_sig);
    END IF;
  END LOOP;
END;
$$;

COMMIT;

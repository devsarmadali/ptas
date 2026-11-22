-- 0058_optimize_operational_list_and_jurisdiction_rpcs.sql
-- Non-destructive performance migration:
-- 1. Rewrites ptas_private.accessible_jurisdiction_ids(uuid) with plpgsql early-exit
--    dispatch so NULL or leaf circle_id lookups avoid scanning geo_districts/jurisdictions trees.
-- 2. Optimizes public.list_operational_survey_units() to skip jurisdiction expansion for
--    province-wide roles and sort compact tuples (ordered_units) before jsonb_agg serialization.
-- 3. Adds covering DESC index on public.audit_events(occurred_at DESC) for fast recent-audit reads.

BEGIN;

CREATE OR REPLACE FUNCTION ptas_private.accessible_jurisdiction_ids(p_root uuid)
RETURNS TABLE(jurisdiction_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_jur_code text;
  v_circle_code text;
  v_dist_code text;
BEGIN
  IF p_root IS NULL THEN
    RETURN;
  END IF;

  -- Branch 1: Root is in public.jurisdictions (province, division, district, or legacy circle)
  SELECT j.code INTO v_jur_code
  FROM public.jurisdictions j
  WHERE j.id = p_root;

  IF FOUND THEN
    RETURN QUERY
      WITH RECURSIVE legacy_tree AS (
        SELECT j.id
        FROM public.jurisdictions j
        WHERE j.id = p_root
        UNION ALL
        SELECT child.id
        FROM public.jurisdictions child
        JOIN legacy_tree parent ON child.parent_id = parent.id
      )
      SELECT id AS jurisdiction_id FROM legacy_tree
      UNION
      SELECT gc.id AS jurisdiction_id
      FROM public.geo_circles gc
      WHERE gc.circle_code = v_jur_code
      UNION
      SELECT gc.id AS jurisdiction_id
      FROM public.geo_circles gc
      WHERE v_jur_code = 'CIR_VEH_01' AND gc.circle_code = 'VHR-1'
      UNION
      SELECT gd.id AS jurisdiction_id
      FROM public.geo_districts gd
      WHERE v_jur_code LIKE 'DIST\_%' ESCAPE '\'
        AND gd.district_code = substr(v_jur_code, 6)
      UNION
      SELECT gd.id AS jurisdiction_id
      FROM public.geo_districts gd
      WHERE v_jur_code = 'DIST_VEHARI' AND gd.district_code = 'VHR'
      UNION
      SELECT gc.id AS jurisdiction_id
      FROM public.geo_circles gc
      WHERE gc.division_id = p_root
      UNION
      SELECT gc.district_id AS jurisdiction_id
      FROM public.geo_circles gc
      WHERE gc.division_id = p_root AND gc.district_id IS NOT NULL;
    RETURN;
  END IF;

  -- Branch 2: Root is a circle in public.geo_circles
  SELECT gc.circle_code INTO v_circle_code
  FROM public.geo_circles gc
  WHERE gc.id = p_root;

  IF FOUND THEN
    RETURN QUERY
      SELECT p_root AS jurisdiction_id
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.jurisdictions j
      WHERE j.code = v_circle_code
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.jurisdictions j
      WHERE v_circle_code = 'VHR-1' AND j.code = 'CIR_VEH_01';
    RETURN;
  END IF;

  -- Branch 3: Root is a district in public.geo_districts
  SELECT gd.district_code INTO v_dist_code
  FROM public.geo_districts gd
  WHERE gd.id = p_root;

  IF FOUND THEN
    RETURN QUERY
      SELECT p_root AS jurisdiction_id
      UNION
      SELECT gc.id AS jurisdiction_id
      FROM public.geo_circles gc
      WHERE gc.district_id = p_root
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.geo_circles gc
      JOIN public.jurisdictions j ON j.code = gc.circle_code
      WHERE gc.district_id = p_root
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.geo_circles gc
      JOIN public.jurisdictions j ON j.code = 'CIR_VEH_01'
      WHERE gc.district_id = p_root AND gc.circle_code = 'VHR-1'
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.jurisdictions j
      WHERE j.code = ('DIST_' || v_dist_code)
      UNION
      SELECT j.id AS jurisdiction_id
      FROM public.jurisdictions j
      WHERE v_dist_code = 'VHR' AND j.code = 'DIST_VEHARI';
    RETURN;
  END IF;

  -- Branch 4: Division root or standalone geo identifier
  RETURN QUERY
    SELECT p_root AS jurisdiction_id
    UNION
    SELECT gc.id AS jurisdiction_id
    FROM public.geo_circles gc
    WHERE gc.division_id = p_root
    UNION
    SELECT gc.district_id AS jurisdiction_id
    FROM public.geo_circles gc
    WHERE gc.division_id = p_root AND gc.district_id IS NOT NULL;
END;
$function$;

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
        SELECT aj.jurisdiction_id
        FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
        WHERE v_actor.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET')
      ),
      scoped_units AS MATERIALIZED (
        SELECT u.*
        FROM public.pft3_assessment_units u
        WHERE (
          v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
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
$function$;

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at_desc
  ON public.audit_events (occurred_at DESC);

COMMIT;

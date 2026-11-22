BEGIN;

CREATE OR REPLACE FUNCTION public.get_operational_survey_unit(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor record;
  v_ident text;
  v_unit public.pft3_assessment_units%ROWTYPE;
  v_ledger_entries jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','ETI','DET'])
  LIMIT 1;

  IF v_actor.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_ident := btrim(coalesce(p_identifier, ''));
  IF v_ident = '' THEN
    RETURN NULL;
  END IF;

  -- Indexed direct lookup paths (avoid full-table JSONB aggregation for single-unit screens)
  IF v_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT u.* INTO v_unit
    FROM public.pft3_assessment_units u
    WHERE u.id = v_ident::uuid
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit
    FROM public.pft3_assessment_units u
    WHERE u.pin_number = v_ident
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit
    FROM public.pft3_assessment_units u
    WHERE u.provincial_uin = v_ident
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT u.* INTO v_unit
    FROM public.pft3_assessment_units u
    WHERE u.permanent_demand_no = v_ident
      AND (
        v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
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

  -- Fail-closed jurisdiction and inspector authorization check (matches list_operational_survey_units)
  IF v_actor.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET') THEN
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
$function$;

REVOKE ALL ON FUNCTION public.get_operational_survey_unit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operational_survey_unit(text) TO authenticated;

COMMIT;

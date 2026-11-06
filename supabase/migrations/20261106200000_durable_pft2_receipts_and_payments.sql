-- ============================================================================
-- PTAS Migration: 0039_durable_pft2_receipts_and_payments.sql
-- Description: Re-establishes public.pft2_receipts durable receipt ledger,
-- upgrades receipt issuance and manual payment RPCs, syncs unit ledger balances
-- with actual receipt payments, and supports public verification.
-- ============================================================================

-- 1. Re-create public.pft2_receipts Table
CREATE TABLE IF NOT EXISTS public.pft2_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  payment_source text NOT NULL DEFAULT 'ISSUED_PFT2' CHECK (payment_source IN ('ISSUED_PFT2', 'MANUAL', 'EPAY')),
  receipt_category text NOT NULL CHECK (receipt_category IN ('REGULAR_PFT3', 'PROVISIONAL_POTENTIAL')),
  challan_id uuid REFERENCES public.pft2_challans(id) ON DELETE SET NULL,
  potential_challan_id uuid REFERENCES public.potential_pft2_challans(id) ON DELETE SET NULL,
  pft3_unit_id uuid REFERENCES public.pft3_assessment_units(id) ON DELETE SET NULL,
  potential_unit_id uuid REFERENCES public.potential_assessment_units(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  payment_channel text NOT NULL,
  bank_branch text,
  bank_transaction_id text,
  deposit_date date NOT NULL,
  received_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  pin text,
  official_sha256 text,
  idempotency_key text UNIQUE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for Performance and Verification Lookups
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_pft3_unit ON public.pft2_receipts(pft3_unit_id);
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_potential_unit ON public.pft2_receipts(potential_unit_id);
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_challan ON public.pft2_receipts(challan_id);
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_potential_challan ON public.pft2_receipts(potential_challan_id);
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_receipt_number ON public.pft2_receipts(upper(receipt_number));
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_bank_tx ON public.pft2_receipts(upper(bank_transaction_id));
CREATE INDEX IF NOT EXISTS idx_pft2_receipts_pin ON public.pft2_receipts(pin);

-- 3. Row Level Security on Receipts
ALTER TABLE public.pft2_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pft2_receipts_select_policy ON public.pft2_receipts;
CREATE POLICY pft2_receipts_select_policy ON public.pft2_receipts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','FINANCE','DET']) a
    WHERE a.role_code IN ('ADMIN','DIRECTOR','DET')
       OR a.jurisdiction_id IS NULL
       OR EXISTS (
            SELECT 1 FROM public.pft3_assessment_units u
            WHERE u.id = pft2_receipts.pft3_unit_id
              AND ptas_private.jurisdiction_contains(a.jurisdiction_id, u.circle_id)
          )
       OR EXISTS (
            SELECT 1 FROM public.potential_assessment_units pu
            WHERE pu.id = pft2_receipts.potential_unit_id
              AND ptas_private.jurisdiction_contains(a.jurisdiction_id, pu.circle_id)
          )
  )
);

DROP POLICY IF EXISTS pft2_receipts_insert_policy ON public.pft2_receipts;
CREATE POLICY pft2_receipts_insert_policy ON public.pft2_receipts
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','FINANCE']) a
    WHERE a.role_code IN ('ADMIN','DIRECTOR')
       OR a.jurisdiction_id IS NULL
       OR EXISTS (
            SELECT 1 FROM public.pft3_assessment_units u
            WHERE u.id = pft2_receipts.pft3_unit_id
              AND ptas_private.jurisdiction_contains(a.jurisdiction_id, u.circle_id)
          )
       OR EXISTS (
            SELECT 1 FROM public.potential_assessment_units pu
            WHERE pu.id = pft2_receipts.potential_unit_id
              AND ptas_private.jurisdiction_contains(a.jurisdiction_id, pu.circle_id)
          )
  )
);

-- 4. Jurisdiction-Scoped Receipt Registry Query RPC
CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN','FINANCE','DET']) LIMIT 1;
  IF v_actor.user_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(r.snapshot ORDER BY r.received_at DESC, r.id)
      FROM public.pft2_receipts r
      LEFT JOIN public.pft3_assessment_units u ON u.id = r.pft3_unit_id
      LEFT JOIN public.potential_assessment_units pu ON pu.id = r.potential_unit_id
      WHERE v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
         OR v_actor.jurisdiction_id IS NULL
         OR (u.circle_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, u.circle_id))
         OR (pu.circle_id IS NOT NULL AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, pu.circle_id))
    ),
    '[]'::jsonb
  );
END;
$$;

-- 5. Upgraded receive_pft2_challan_record() Handling Regular & Provisional Challans
CREATE OR REPLACE FUNCTION public.receive_pft2_challan_record(
  p_challan_id uuid,
  p_is_potential boolean,
  p_receipt jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_pft3_unit_id uuid;
  v_potential_unit_id uuid;
  v_amount numeric(18,2);
  v_challan_number text;
  v_challan_snapshot jsonb;
  v_receipt_id uuid;
  v_receipt_number text := btrim(p_receipt->>'receiptNumber');
  v_receipt_snapshot jsonb;
  v_received_at timestamptz := coalesce(nullif(p_receipt->>'dateOfReceipt','')::date, current_date)::timestamptz;
  v_channel text := coalesce(nullif(btrim(p_receipt->>'paymentChannel'), ''), 'National Bank of Pakistan');
  v_branch text := nullif(btrim(p_receipt->>'bankBranch'), '');
  v_scroll_ref text := btrim(p_receipt->>'bankScrollRef');
  v_pin text := coalesce(nullif(btrim(p_receipt->>'pin'), ''), nullif(btrim(p_receipt->>'securityCode'), ''));
  v_sha256 text := nullif(btrim(p_receipt->>'officialSha256'), '');
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','FINANCE','ADMIN','DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key,'')))=0 OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT id, snapshot INTO v_receipt_id, v_receipt_snapshot FROM public.pft2_receipts
    WHERE idempotency_key = p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN
    RETURN jsonb_build_object('challan', v_receipt_snapshot->'challanSnapshot', 'receipt', v_receipt_snapshot);
  END IF;

  IF p_is_potential THEN
    SELECT jurisdiction_id, potential_unit_id, amount, challan_number, snapshot
      INTO v_jurisdiction_id, v_potential_unit_id, v_amount, v_challan_number, v_challan_snapshot
    FROM public.potential_pft2_challans WHERE id = p_challan_id FOR UPDATE;
  ELSE
    SELECT jurisdiction_id, pft3_unit_id, amount, challan_number, snapshot
      INTO v_jurisdiction_id, v_pft3_unit_id, v_amount, v_challan_number, v_challan_snapshot
    FROM public.pft2_challans WHERE id = p_challan_id FOR UPDATE;
  END IF;

  IF v_challan_number IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE='42501';
  END IF;

  IF (p_receipt->>'amountPaidPkr')::numeric <> v_amount THEN
    RAISE EXCEPTION 'receipt amount must equal the issued challan amount' USING ERRCODE='23514';
  END IF;
  IF length(v_receipt_number) = 0 THEN RAISE EXCEPTION 'receipt number is required' USING ERRCODE='22023'; END IF;
  IF length(v_scroll_ref) = 0 THEN RAISE EXCEPTION 'bank scroll reference is required' USING ERRCODE='22023'; END IF;

  v_receipt_id := gen_random_uuid();
  v_receipt_snapshot := p_receipt || jsonb_build_object(
    'id', v_receipt_id::text,
    'receiptNumber', v_receipt_number,
    'challanNumber', v_challan_number,
    'issuedPft2Id', p_challan_id::text,
    'paymentSource', 'ISSUED_PFT2',
    'receiptCategory', CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END
  );

  INSERT INTO public.pft2_receipts(
    id, receipt_number, payment_source, receipt_category,
    challan_id, potential_challan_id,
    pft3_unit_id, potential_unit_id,
    amount, payment_channel, bank_branch, bank_transaction_id,
    deposit_date, received_by, received_at, pin, official_sha256,
    idempotency_key, snapshot
  ) VALUES (
    v_receipt_id, v_receipt_number, 'ISSUED_PFT2',
    CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END,
    CASE WHEN p_is_potential THEN NULL ELSE p_challan_id END,
    CASE WHEN p_is_potential THEN p_challan_id ELSE NULL END,
    CASE WHEN p_is_potential THEN NULL ELSE v_pft3_unit_id END,
    CASE WHEN p_is_potential THEN v_potential_unit_id ELSE NULL END,
    v_amount, v_channel, v_branch, v_scroll_ref,
    v_received_at::date, v_actor.user_id, v_received_at, v_pin, v_sha256,
    p_idempotency_key, v_receipt_snapshot
  );

  IF p_is_potential THEN
    UPDATE public.potential_pft2_challans
      SET payment_state = 'RECEIVED', received_at = v_received_at, row_version = row_version + 1,
          updated_at = now(),
          snapshot = snapshot || jsonb_build_object(
            'status', 'RECEIVED',
            'receiptNumber', v_receipt_number,
            'receivedAt', p_receipt->>'dateOfReceipt',
            'receivedBy', v_actor.user_id::text,
            'bankScrollRef', v_scroll_ref,
            'paymentChannel', v_channel
          )
      WHERE id = p_challan_id;

    IF v_potential_unit_id IS NOT NULL THEN
      PERFORM public.migrate_potential_unit_to_pft3(
        v_potential_unit_id,
        coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_challan_snapshot->>'demandNumber', 'POT-MIGRATED')
      );
      SELECT id INTO v_pft3_unit_id FROM public.pft3_assessment_units WHERE survey_no = (
        SELECT coalesce(pin_number, potential_number) FROM public.potential_assessment_units WHERE id = v_potential_unit_id
      ) ORDER BY created_at DESC LIMIT 1;
      IF v_pft3_unit_id IS NOT NULL THEN
        UPDATE public.pft2_receipts SET pft3_unit_id = v_pft3_unit_id WHERE id = v_receipt_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.pft2_challans
      SET payment_state = 'RECEIVED', row_version = row_version + 1, updated_at = now(),
          snapshot = snapshot || jsonb_build_object(
            'status', 'RECEIVED',
            'receiptNumber', v_receipt_number,
            'receivedAt', p_receipt->>'dateOfReceipt',
            'receivedBy', v_actor.user_id::text,
            'bankScrollRef', v_scroll_ref,
            'paymentChannel', v_channel
          )
      WHERE id = p_challan_id;
  END IF;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'PFT2_PAYMENT_RECEIVED', 'PFT2_CHALLAN', p_challan_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'amount', v_amount,
      'potential', p_is_potential,
      'bank_scroll_ref', v_scroll_ref,
      'payment_channel', v_channel
    )
  );

  RETURN jsonb_build_object('challan', v_challan_snapshot, 'receipt', v_receipt_snapshot);
END;
$$;

-- 6. Direct Statutory Receipt Recording (Manual / Challan 32-A / Treasury counter)
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
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_amount numeric(18,2) := (p_receipt->>'amountPaidPkr')::numeric;
  v_receipt_id uuid;
  v_receipt_number text := btrim(p_receipt->>'receiptNumber');
  v_receipt_snapshot jsonb;
  v_received_at timestamptz := coalesce(nullif(p_receipt->>'dateOfReceipt','')::date, current_date)::timestamptz;
  v_channel text := coalesce(nullif(btrim(p_receipt->>'paymentChannel'), ''), 'National Bank of Pakistan');
  v_branch text := nullif(btrim(p_receipt->>'bankBranch'), '');
  v_scroll_ref text := btrim(p_receipt->>'bankScrollRef');
  v_pin text := coalesce(nullif(btrim(p_receipt->>'pin'), ''), nullif(btrim(p_receipt->>'securityCode'), ''));
  v_sha256 text := nullif(btrim(p_receipt->>'officialSha256'), '');
  v_demand_no text;
  v_pft3_unit_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','FINANCE','ADMIN','DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key,'')))=0 OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT id, snapshot INTO v_receipt_id, v_receipt_snapshot FROM public.pft2_receipts
    WHERE idempotency_key = p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN RETURN v_receipt_snapshot; END IF;

  IF v_amount <= 0 THEN RAISE EXCEPTION 'payment receipt amount must be greater than zero' USING ERRCODE='23514'; END IF;
  IF length(v_receipt_number) = 0 THEN RAISE EXCEPTION 'receipt number is required' USING ERRCODE='22023'; END IF;
  IF length(v_scroll_ref) = 0 THEN RAISE EXCEPTION 'bank scroll reference is required' USING ERRCODE='22023'; END IF;

  IF p_is_potential THEN
    SELECT circle_id, potential_number INTO v_jurisdiction_id, v_demand_no
    FROM public.potential_assessment_units WHERE id = p_unit_id;
  ELSE
    SELECT circle_id, permanent_demand_no INTO v_jurisdiction_id, v_demand_no
    FROM public.pft3_assessment_units WHERE id = p_unit_id;
  END IF;

  IF v_jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'unit not found in actor jurisdiction' USING ERRCODE='42501';
  END IF;

  v_receipt_id := gen_random_uuid();
  v_receipt_snapshot := p_receipt || jsonb_build_object(
    'id', v_receipt_id::text,
    'receiptNumber', v_receipt_number,
    'unitId', p_unit_id::text,
    'demandNumber', coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_demand_no),
    'paymentSource', 'MANUAL',
    'receiptCategory', CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END
  );

  INSERT INTO public.pft2_receipts(
    id, receipt_number, payment_source, receipt_category,
    challan_id, potential_challan_id,
    pft3_unit_id, potential_unit_id,
    amount, payment_channel, bank_branch, bank_transaction_id,
    deposit_date, received_by, received_at, pin, official_sha256,
    idempotency_key, snapshot
  ) VALUES (
    v_receipt_id, v_receipt_number, 'MANUAL',
    CASE WHEN p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END,
    NULL, NULL,
    CASE WHEN p_is_potential THEN NULL ELSE p_unit_id END,
    CASE WHEN p_is_potential THEN p_unit_id ELSE NULL END,
    v_amount, v_channel, v_branch, v_scroll_ref,
    v_received_at::date, v_actor.user_id, v_received_at, v_pin, v_sha256,
    p_idempotency_key, v_receipt_snapshot
  );

  IF p_is_potential THEN
    PERFORM public.migrate_potential_unit_to_pft3(
      p_unit_id,
      coalesce(nullif(btrim(p_receipt->>'demandNumber'), ''), v_demand_no, 'POT-MIGRATED')
    );
    SELECT id INTO v_pft3_unit_id FROM public.pft3_assessment_units WHERE survey_no = (
      SELECT coalesce(pin_number, potential_number) FROM public.potential_assessment_units WHERE id = p_unit_id
    ) ORDER BY created_at DESC LIMIT 1;
    IF v_pft3_unit_id IS NOT NULL THEN
      UPDATE public.pft2_receipts SET pft3_unit_id = v_pft3_unit_id WHERE id = v_receipt_id;
    END IF;
  END IF;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'STATUTORY_RECEIPT_MANUALLY_RECORDED', 'STATUTORY_RECEIPT', v_receipt_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'amount', v_amount,
      'potential', p_is_potential,
      'unit_id', p_unit_id::text,
      'bank_scroll_ref', v_scroll_ref,
      'payment_channel', v_channel
    )
  );

  RETURN v_receipt_snapshot;
END;
$$;

-- 7. High Performance list_operational_survey_units() With Live Payment Ledger Aggregation
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
        AND (v_actor.role_code NOT IN ('INSPECTOR','ETI') OR u.responsible_inspector_id = v_actor.user_id)
    ),
    '[]'::jsonb
  );
END;
$$;

-- 8. Upgraded verify_statutory_document_public() Checking Challans, Receipts, and Notices
CREATE OR REPLACE FUNCTION public.verify_statutory_document_public(
  p_document_ref text,
  p_pin text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := upper(btrim(coalesce(p_document_ref, '')));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_res jsonb;
BEGIN
  -- Normalize PIN: strip leading PIN: or PIN-
  v_pin := regexp_replace(v_pin, '^(PIN[-:]?\\s*)', '', 'i');

  -- If both queries are empty, return early
  IF length(v_ref) = 0 AND length(v_pin) = 0 THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'error', 'EMPTY_QUERY',
      'message', 'Please provide an official Document Reference Number or 6-digit Security Code.'
    );
  END IF;

  -- 1. Check PFT-2 Payment Challans (regular & potential registers)
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT2_CHALLAN',
    'status', CASE 
      WHEN coalesce(c.snapshot->>'status', '') = 'CANCELLED' THEN 'CANCELLED'
      WHEN coalesce(c.snapshot->>'remainingBalance', '0')::numeric <= 0 AND coalesce(c.snapshot->>'paymentScope', '') = 'FULL' THEN 'PAID'
      ELSE 'AUTHENTIC_VALID'
    END,
    'reference_number', coalesce(c.snapshot->>'noticeNumber', c.challan_number),
    'challan_number', c.challan_number,
    'legal_name', coalesce(c.snapshot->>'legalName', 'Taxpayer Entity'),
    'trade_name', nullif(coalesce(c.snapshot->>'tradeName', ''), ''),
    'district', coalesce(c.snapshot->>'district', 'Vehari'),
    'circle', coalesce(c.snapshot->>'circleName', 'Excise Circle'),
    'tehsil', coalesce(c.snapshot->>'tehsil', 'Vehari'),
    'financial_year', coalesce(c.snapshot->>'taxYear', '2026-2027'),
    'category_name', coalesce(c.snapshot->>'category', 'Statutory Assessment'),
    'classification', coalesce(c.snapshot->>'subclassificationCode', 'Class 3(ii)'),
    'amount_payable', coalesce((c.snapshot->>'amountPayable')::numeric, c.amount),
    'remaining_balance', coalesce((c.snapshot->>'remainingBalance')::numeric, 0),
    'due_date', coalesce(c.snapshot->>'dueDate', c.due_date::text),
    'issue_date', coalesce(c.snapshot->>'issueDate', c.issue_date::text),
    'head_of_account', coalesce(c.snapshot->>'headOfAccount', '0000000-Tax'),
    'pin', coalesce(c.snapshot->>'pin', c.snapshot->>'securityCode', ''),
    'official_sha256', coalesce(c.snapshot->>'officialSha256', ''),
    'issuing_authority', 'Excise & Taxation Officer (Assessing Authority), District Vehari',
    'verified_at', now()
  ) INTO v_res
  FROM (
    SELECT challan_number, notice_number, amount, due_date, issue_date, snapshot
    FROM public.pft2_challans
    UNION ALL
    SELECT challan_number, notice_number, amount, due_date, issue_date, snapshot
    FROM public.potential_pft2_challans
  ) c
  WHERE (
    (length(v_ref) > 0 AND (
      upper(c.challan_number) = v_ref OR 
      upper(coalesce(c.snapshot->>'noticeNumber', '')) = v_ref OR
      upper(coalesce(c.snapshot->>'demandNo', '')) = v_ref
    ))
    OR
    (length(v_pin) = 6 AND (
      coalesce(c.snapshot->>'pin', '') = v_pin OR
      coalesce(c.snapshot->>'securityCode', '') = v_pin
    ))
    OR
    (length(v_ref) = 6 AND (
      coalesce(c.snapshot->>'pin', '') = v_ref OR
      coalesce(c.snapshot->>'securityCode', '') = v_ref
    ))
  )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 2. Check Form PFT-2 Receipts (from public.pft2_receipts)
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT_RECEIPT',
    'status', 'AUTHENTIC_VALID',
    'reference_number', r.receipt_number,
    'receipt_number', r.receipt_number,
    'legal_name', coalesce(r.snapshot->>'legalName', u.legal_name, pu.legal_name, 'Taxpayer Entity'),
    'trade_name', nullif(coalesce(r.snapshot->>'tradeName', u.trade_name, pu.trade_name, ''), ''),
    'district', coalesce(r.snapshot->>'district', u.district_name, pu.district_name, 'Vehari'),
    'circle', coalesce(r.snapshot->>'circleName', u.circle_name, pu.circle_name, 'Excise Circle'),
    'financial_year', coalesce(r.snapshot->>'financialYear', '2026-2027'),
    'category_name', coalesce(r.snapshot->>'statutoryCategory', u.category_name, pu.category_name, 'Statutory Assessment'),
    'classification', coalesce(r.snapshot->>'scheduleEntry', u.subclassification_code, pu.subclassification_code, 'Schedule 1977'),
    'amount_paid', r.amount,
    'bank_scroll_ref', coalesce(r.bank_transaction_id, r.snapshot->>'bankScrollRef', 'NBP-TREASURY'),
    'bank_branch', r.bank_branch,
    'payment_channel', r.payment_channel,
    'deposit_date', coalesce(r.deposit_date::text, r.snapshot->>'dateOfReceipt'),
    'pin', coalesce(r.pin, r.snapshot->>'pin', r.snapshot->>'securityCode', ''),
    'official_sha256', coalesce(r.official_sha256, r.snapshot->>'officialSha256', ''),
    'issuing_authority', 'Excise & Taxation Department, Government of the Punjab',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft2_receipts r
  LEFT JOIN public.pft3_assessment_units u ON u.id = r.pft3_unit_id
  LEFT JOIN public.potential_assessment_units pu ON pu.id = r.potential_unit_id
  WHERE (
    (length(v_ref) > 0 AND (
      upper(r.receipt_number) = v_ref OR
      upper(coalesce(r.bank_transaction_id, '')) = v_ref OR
      upper(coalesce(r.snapshot->>'receiptNumber', '')) = v_ref OR
      upper(coalesce(r.snapshot->>'challanNumber', '')) = v_ref
    ))
    OR
    (length(v_pin) = 6 AND (
      r.pin = v_pin OR
      coalesce(r.snapshot->>'pin', '') = v_pin OR
      coalesce(r.snapshot->>'securityCode', '') = v_pin
    ))
    OR
    (length(v_ref) = 6 AND (
      r.pin = v_ref OR
      coalesce(r.snapshot->>'pin', '') = v_ref OR
      coalesce(r.snapshot->>'securityCode', '') = v_ref
    ))
  )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 3. Check Approved Form PFT-1 Notice of Demand from Unified Form P.F.T-3 Register
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT1_NOTICE',
    'status', 'AUTHENTIC_VALID',
    'reference_number', coalesce(p.permanent_demand_no, p.provincial_uin),
    'permanent_demand_no', p.permanent_demand_no,
    'provincial_uin', p.provincial_uin,
    'legal_name', p.legal_name,
    'trade_name', nullif(p.trade_name, ''),
    'district', coalesce(p.district_name, 'Vehari'),
    'circle', coalesce(p.circle_name, 'Excise Circle'),
    'address', p.address,
    'pin', coalesce(p.pin_number, ''),
    'issuing_authority', 'Excise & Taxation Officer (Assessing Authority), District Vehari',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft3_assessment_units p
  WHERE (
    (length(v_ref) > 0 AND (
      upper(coalesce(p.permanent_demand_no, '')) = v_ref OR
      upper(coalesce(p.provincial_uin, '')) = v_ref OR
      upper(coalesce(p.pin_number, '')) = v_ref
    ))
    OR
    (length(v_pin) = 6 AND (p.pin_number = v_pin OR p.pin_number = 'PIN-' || v_pin))
    OR
    (length(v_ref) = 6 AND (p.pin_number = v_ref OR p.pin_number = 'PIN-' || v_ref))
  )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 4. Not Found
  RETURN jsonb_build_object(
    'is_valid', false,
    'error', 'DOCUMENT_NOT_FOUND',
    'message', 'No authentic statutory record was found matching the queried reference or Security Code.'
  );
END;
$$;

-- 9. Explicit Grants and Hardening
REVOKE ALL ON FUNCTION public.list_pft2_receipt_registry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pft2_receipt_registry() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.receive_pft2_challan_record(uuid,boolean,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_pft2_challan_record(uuid,boolean,jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_direct_statutory_receipt(uuid,boolean,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_direct_statutory_receipt(uuid,boolean,jsonb,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_statutory_document_public(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_statutory_document_public(text,text) TO anon, authenticated, service_role;

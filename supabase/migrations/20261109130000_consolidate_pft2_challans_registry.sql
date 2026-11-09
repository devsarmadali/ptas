-- 20261109130000_consolidate_pft2_challans_registry.sql
-- PTAS Migration: Consolidate Regular & Provisional PFT-2 Challans Registry
-- Unifies storage into public.pft2_challans with single differential 'challan_type' ('REGULAR' vs 'PROVISIONAL').
-- Streamlines public.pft2_receipts to uniformly reference challan_id.
-- Preserves potential_pft2_challans as a backward-compatible view.

BEGIN;

-- 1. Extend public.pft2_challans with the primary differential and potential link
ALTER TABLE public.pft2_challans
  ADD COLUMN IF NOT EXISTS challan_type text NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS potential_unit_id uuid REFERENCES public.potential_assessment_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Ensure check constraint on challan_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pft2_challans_challan_type_check'
  ) THEN
    ALTER TABLE public.pft2_challans
      ADD CONSTRAINT pft2_challans_challan_type_check CHECK (challan_type IN ('REGULAR', 'PROVISIONAL'));
  END IF;
END $$;

-- Optimize index coverage for unified queries
CREATE INDEX IF NOT EXISTS idx_pft2_challans_challan_type ON public.pft2_challans(challan_type);
CREATE INDEX IF NOT EXISTS idx_pft2_challans_potential_unit ON public.pft2_challans(potential_unit_id);
CREATE INDEX IF NOT EXISTS idx_pft2_challans_pft3_unit ON public.pft2_challans(pft3_unit_id);
CREATE INDEX IF NOT EXISTS idx_pft2_challans_jurisdiction ON public.pft2_challans(jurisdiction_id);

-- 2. Backfill existing provisional challans from potential_pft2_challans into pft2_challans
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'potential_pft2_challans'
      AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.pft2_challans (
      id, challan_type, potential_unit_id, financial_year_id, jurisdiction_id,
      challan_number, notice_number, administrative_state, payment_state,
      amount, due_date, issue_date, issued_at, issued_by, cancelled_at,
      cancellation_reason, received_at, idempotency_key, snapshot,
      row_version, created_at, updated_at
    )
    SELECT
      id, 'PROVISIONAL', potential_unit_id, financial_year_id, jurisdiction_id,
      challan_number, notice_number, administrative_state, payment_state,
      amount, due_date, issue_date, issued_at, issued_by, cancelled_at,
      cancellation_reason, received_at, idempotency_key, snapshot,
      row_version, created_at, updated_at
    FROM public.potential_pft2_challans
    ON CONFLICT (id) DO UPDATE SET
      challan_type = 'PROVISIONAL',
      potential_unit_id = EXCLUDED.potential_unit_id,
      snapshot = EXCLUDED.snapshot;
  END IF;
END $$;

-- 3. Uniformly link all receipts to challan_id in public.pft2_receipts
UPDATE public.pft2_receipts
SET challan_id = potential_challan_id
WHERE challan_id IS NULL AND potential_challan_id IS NOT NULL;

-- 4. Transition potential_pft2_challans base table to a backward-compatible view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'potential_pft2_challans'
      AND table_type = 'BASE TABLE'
  ) THEN
    -- Drop external foreign key constraint on the base table
    ALTER TABLE public.pft2_receipts DROP CONSTRAINT IF EXISTS pft2_receipts_potential_challan_id_fkey;
    
    -- Rename deprecated base table
    ALTER TABLE public.potential_pft2_challans RENAME TO potential_pft2_challans_deprecated;
    
    -- Create view exposing only PROVISIONAL challans with exact original schema
    CREATE OR REPLACE VIEW public.potential_pft2_challans AS
      SELECT 
        id, potential_unit_id, financial_year_id, jurisdiction_id, challan_number,
        notice_number, administrative_state, payment_state, amount, issue_date,
        due_date, issued_by, issued_at, cancelled_at, cancellation_reason,
        received_at, idempotency_key, snapshot, row_version, created_at, updated_at
      FROM public.pft2_challans
      WHERE challan_type = 'PROVISIONAL';
  END IF;
END $$;

-- 5. Unified issue_pft2_challan_record function
CREATE OR REPLACE FUNCTION public.issue_pft2_challan_record(
  p_challan jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_is_potential boolean := coalesce((p_challan->>'isProvisional')::boolean, (p_challan->>'challanType') = 'PROVISIONAL', false);
  v_unit_id uuid;
  v_jurisdiction_id uuid;
  v_financial_year text;
  v_challan_number text := btrim(coalesce(p_challan->>'noticeNumber', p_challan->>'challanNumber', ''));
  v_amount numeric(18,2) := (p_challan->>'amountPayable')::numeric;
  v_issue_date date := (p_challan->>'issueDate')::date;
  v_due_date date := (p_challan->>'dueDate')::date;
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;
  IF v_challan_number IS NULL OR length(v_challan_number) < 5 THEN
    RAISE EXCEPTION 'Notice No. payload is invalid' USING ERRCODE='22023';
  END IF;
  IF v_amount <= 0 OR v_due_date < v_issue_date THEN
    RAISE EXCEPTION 'invalid challan amount or date range' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;

  IF v_is_potential THEN
    SELECT p.id, p.circle_id, r.financial_year_code
      INTO v_unit_id, v_jurisdiction_id, v_financial_year
    FROM public.potential_assessment_units p
    JOIN public.survey_classification_rules r
      ON r.statutory_rule_id = p.statutory_rule_id AND r.status = 'ACTIVE'
    WHERE p.id = (p_challan->>'unitId')::uuid AND p.status = 'ACTIVE'
    ORDER BY r.effective_from DESC LIMIT 1;
  ELSE
    SELECT p.id, p.circle_id, p.financial_year_id
      INTO v_unit_id, v_jurisdiction_id, v_financial_year
    FROM public.pft3_assessment_units p
    WHERE p.id = (p_challan->>'unitId')::uuid;
  END IF;

  IF v_unit_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan target is unavailable in the actor jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Ensure district and circle prefix if generic PFT2 placeholder was supplied
  IF v_challan_number ~ '^PFT2-' THEN
    WITH RECURSIVE ancestors AS (
      SELECT j.id, j.parent_id, j.tier, j.abbreviation FROM public.jurisdictions j
      WHERE j.id = v_jurisdiction_id
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.tier, parent.abbreviation
      FROM public.jurisdictions parent JOIN ancestors child ON parent.id = child.parent_id
    )
    SELECT
      (SELECT abbreviation FROM ancestors WHERE tier IN ('DISTRICT', 'ZONE') LIMIT 1) || '-' ||
      (SELECT abbreviation FROM ancestors WHERE tier = 'CIRCLE' LIMIT 1) || '-' ||
      regexp_replace(v_challan_number, '^PFT2-', '')
    INTO v_challan_number;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pft2-notice:' || v_challan_number));

  -- Idempotency check against unified table
  SELECT id, snapshot INTO v_id, v_snapshot FROM public.pft2_challans
    WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_snapshot; END IF;

  IF EXISTS (SELECT 1 FROM public.pft2_challans WHERE challan_number = v_challan_number) THEN
    RAISE EXCEPTION 'canonical Notice No. already exists' USING ERRCODE='23505';
  END IF;

  v_id := gen_random_uuid();
  v_snapshot := p_challan || jsonb_build_object(
    'id', v_id::text,
    'challanNumber', v_challan_number,
    'noticeNumber', v_challan_number,
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
    v_financial_year,
    v_jurisdiction_id,
    v_challan_number,
    v_challan_number,
    'ISSUED',
    'OUTSTANDING',
    v_due_date,
    v_issue_date,
    now(),
    v_actor.user_id,
    v_amount,
    p_idempotency_key,
    v_snapshot
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

-- 6. Unified receive_pft2_challan_record function
CREATE OR REPLACE FUNCTION public.receive_pft2_challan_record(
  p_challan_id uuid,
  p_is_potential boolean,
  p_receipt jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_pft3_unit_id uuid;
  v_potential_unit_id uuid;
  v_amount numeric(18,2);
  v_challan_number text;
  v_challan_snapshot jsonb;
  v_challan_type text;
  v_receipt_id uuid;
  v_receipt_number text := btrim(p_receipt->>'receiptNumber');
  v_receipt_snapshot jsonb;
  v_received_at timestamptz := coalesce(nullif(p_receipt->>'dateOfReceipt', '')::date, current_date)::timestamptz;
  v_scroll_ref text := btrim(coalesce(p_receipt->>'bankScrollRef', ''));
  v_channel text := coalesce(p_receipt->>'paymentChannel', 'NATIONAL_BANK');
  v_branch text := coalesce(p_receipt->>'bankBranch', 'Vehari Main');
  v_pin text := coalesce(p_receipt->>'pin', p_receipt->>'securityCode', '');
  v_sha256 text := coalesce(p_receipt->>'officialSha256', '');
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO', 'FINANCE']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT id, snapshot INTO v_receipt_id, v_receipt_snapshot FROM public.pft2_receipts
    WHERE idempotency_key = p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN
    RETURN jsonb_build_object('challan', v_receipt_snapshot->'challanSnapshot', 'receipt', v_receipt_snapshot);
  END IF;

  -- Unified lookup directly from public.pft2_challans
  SELECT jurisdiction_id, pft3_unit_id, potential_unit_id, amount, challan_number, challan_type, snapshot
    INTO v_jurisdiction_id, v_pft3_unit_id, v_potential_unit_id, v_amount, v_challan_number, v_challan_type, v_challan_snapshot
  FROM public.pft2_challans WHERE id = p_challan_id FOR UPDATE;

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
    'receiptCategory', CASE WHEN v_challan_type = 'PROVISIONAL' OR p_is_potential THEN 'PROVISIONAL_POTENTIAL' ELSE 'REGULAR_PFT3' END
  );

  -- Insert unified receipt
  INSERT INTO public.pft2_receipts(
    id, receipt_number, payment_source, receipt_category,
    challan_id, potential_challan_id,
    pft3_unit_id, potential_unit_id,
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

  -- Update unified challan
  UPDATE public.pft2_challans
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

  -- Provisional automatic migration
  IF v_challan_type = 'PROVISIONAL' OR p_is_potential THEN
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
        UPDATE public.pft2_challans SET pft3_unit_id = v_pft3_unit_id WHERE id = p_challan_id;
      END IF;
    END IF;
  ELSE
    -- Regular demand ledger posting
    INSERT INTO public.demand_ledger(
      id, demand_unit_id, financial_year_id, entry_type, amount, source_type, source_id,
      idempotency_key, correlation_id, posted_by, posted_at, metadata
    ) SELECT
      gen_random_uuid(), c.demand_unit_id, c.financial_year_id, 'PAYMENT_CREDIT', -abs(v_amount),
      'PAYMENT_RECEIPT', v_receipt_number, p_idempotency_key, p_correlation_id,
      v_actor.user_id::text, v_received_at,
      jsonb_build_object('receiptNumber', v_receipt_number, 'challanNumber', v_challan_number,
        'paymentChannel', v_channel, 'bankScrollRef', v_scroll_ref)
    FROM public.pft2_challans c WHERE c.id = p_challan_id AND c.demand_unit_id IS NOT NULL;
  END IF;

  INSERT INTO public.audit_events(
    id, event_type, aggregate_type, aggregate_id, actor_id, actor_role, jurisdiction_id, correlation_id, payload
  ) VALUES (
    gen_random_uuid(), 'PFT2_PAYMENT_RECEIVED', 'PFT2_CHALLAN', p_challan_id::text,
    v_actor.user_id::text, v_actor.role_code, v_jurisdiction_id::text, p_correlation_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'amount', v_amount,
      'challan_type', v_challan_type
    )
  );

  RETURN jsonb_build_object('challan', v_challan_snapshot, 'receipt', v_receipt_snapshot);
END;
$$;

-- 7. Unified cancel_pft2_challan_record function
CREATE OR REPLACE FUNCTION public.cancel_pft2_challan_record(
  p_challan_id uuid,
  p_is_potential boolean,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'cancellation reason required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;

  SELECT jurisdiction_id, snapshot INTO v_jurisdiction_id, v_snapshot
  FROM public.pft2_challans WHERE id = p_challan_id FOR UPDATE;

  IF v_jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE='42501';
  END IF;

  v_snapshot := v_snapshot || jsonb_build_object(
    'status', 'CANCELLED',
    'cancelledReason', p_reason,
    'cancelledAt', current_date::text,
    'cancelledBy', v_actor.user_id::text
  );

  UPDATE public.pft2_challans
    SET administrative_state = 'CANCELLED',
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
    'PFT2_CHALLAN', p_challan_id, 'CANCEL', 'ISSUED', 'CANCELLED', p_reason,
    v_actor.user_id, v_actor.role_code, p_correlation_id, p_idempotency_key
  )
  ON CONFLICT(aggregate_type, idempotency_key) DO NOTHING;

  RETURN v_snapshot;
END;
$$;

-- 8. Unified list_pft2_challan_registry function (single fast scan, no UNION ALL)
CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH actor AS (SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1)
  SELECT coalesce(jsonb_agg(c.snapshot ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM actor a
  JOIN public.pft2_challans c
    ON ptas_private.jurisdiction_contains(a.jurisdiction_id, c.jurisdiction_id)
  WHERE c.snapshot <> '{}'::jsonb;
$$;

-- 9. Unified list_pft2_receipt_registry function (single join)
CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH actor AS (SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1)
  SELECT coalesce(jsonb_agg(r.snapshot ORDER BY r.received_at DESC), '[]'::jsonb)
  FROM actor a
  JOIN public.pft2_receipts r ON true
  JOIN public.pft2_challans c ON c.id = r.challan_id
  WHERE r.snapshot <> '{}'::jsonb
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id, c.jurisdiction_id);
$$;

-- 10. Update public document verification endpoint to query unified pft2_challans
CREATE OR REPLACE FUNCTION public.verify_ptas_public_document(p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_clean text := btrim(coalesce(p_query, ''));
  v_ref text := upper(v_clean);
  v_pin text := regexp_replace(v_clean, '[^0-9A-Za-z]', '', 'g');
  v_res jsonb;
BEGIN
  IF length(v_clean) = 0 THEN
    RETURN jsonb_build_object('verified', false, 'reason', 'Query identifier is required');
  END IF;

  -- 1. Check Unified Form P.F.T-2 Challans
  SELECT jsonb_build_object(
    'verified', true,
    'document_type', 'FORM_PFT2_CHALLAN',
    'challan_number', c.challan_number,
    'notice_number', coalesce(c.notice_number, c.challan_number),
    'challan_type', c.challan_type,
    'legal_name', coalesce(c.snapshot->>'legalName', 'Taxpayer'),
    'trade_name', c.snapshot->>'tradeName',
    'cnic_or_ntn', coalesce(c.snapshot->>'identifierValue', ''),
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
  FROM public.pft2_challans c
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

  -- 2. Check Statutory Receipts
  SELECT jsonb_build_object(
    'verified', true,
    'document_type', 'STATUTORY_RECEIPT',
    'receipt_number', r.receipt_number,
    'challan_number', coalesce(r.snapshot->>'challanNumber', ''),
    'legal_name', coalesce(r.snapshot->>'assesseeLegalName', 'Taxpayer'),
    'amount_paid', r.amount,
    'payment_channel', r.payment_channel,
    'bank_branch', r.bank_branch,
    'deposit_date', r.deposit_date::text,
    'pin', coalesce(r.pin, r.snapshot->>'pin', ''),
    'official_sha256', r.official_sha256,
    'verified_at', now()
  ) INTO v_res
  FROM public.pft2_receipts r
  WHERE upper(r.receipt_number) = v_ref
     OR (length(v_pin) = 6 AND coalesce(r.pin, '') = v_pin)
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  RETURN jsonb_build_object(
    'verified', false,
    'query', p_query,
    'reason', 'No matching statutory document found in Government of Punjab PTAS register'
  );
END;
$$;

-- Grant required permissions
GRANT SELECT ON public.potential_pft2_challans TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.issue_pft2_challan_record(jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_pft2_challan_record(uuid, boolean, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pft2_challan_record(uuid, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pft2_challan_registry() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pft2_receipt_registry() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_ptas_public_document(text) TO anon, authenticated, service_role;

COMMIT;

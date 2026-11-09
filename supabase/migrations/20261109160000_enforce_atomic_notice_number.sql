-- 20261109160000_enforce_atomic_notice_number.sql
-- PTAS Migration: Enforce Authoritative Server-Side Atomic Notice Numbering
-- Strictly decouples PFT-2 notice numbers from assessee demand numbers.
-- Universal format: [DISTRICT]-[2][REG][SCOPE][YYMM][SERIAL4]-[VV]
-- (e.g. 237-21126110001-01 for Vehari, Form 2, Regular, Current, Nov 2026, 1st Notice, Issued)

BEGIN;

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
  v_challan_number text;
  v_amount numeric(18,2) := (p_challan->>'amountPayable')::numeric;
  v_issue_date date := coalesce((p_challan->>'issueDate')::date, current_date);
  v_due_date date := coalesce((p_challan->>'dueDate')::date, current_date + 30);
  v_scope text := coalesce(p_challan->>'demandScope', 'CURRENT');
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key, ''))) = 0 OR length(btrim(coalesce(p_correlation_id, ''))) = 0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
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

  -- Check idempotency against unified pft2_challans
  SELECT id, snapshot INTO v_id, v_snapshot FROM public.pft2_challans
    WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_snapshot; END IF;

  -- Authoritatively allocate atomic canonical notice number from district monthly sequence
  -- (Never derive or accept serial numbers from assessee demand numbers)
  v_challan_number := ptas_private.generate_pft2_notice_number(
    v_jurisdiction_id,
    v_is_potential,
    v_scope,
    v_issue_date,
    '01'
  );

  PERFORM pg_advisory_xact_lock(hashtext('pft2-notice:' || v_challan_number));

  IF EXISTS (SELECT 1 FROM public.pft2_challans WHERE challan_number = v_challan_number) THEN
    -- If collision occurred, allocate guaranteed fresh atomic number
    v_challan_number := ptas_private.generate_pft2_notice_number(
      v_jurisdiction_id,
      v_is_potential,
      v_scope,
      v_issue_date,
      '01'
    );
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

-- Fix legacy record that was issued with demand number embedded
UPDATE public.pft2_challans
SET challan_number = '237-21126110001-01',
    notice_number = '237-21126110001-01',
    snapshot = snapshot || jsonb_build_object(
      'challanNumber', '237-21126110001-01',
      'noticeNumber', '237-21126110001-01'
    )
WHERE id = '7838f227-9092-4ce0-8b10-019f65c8110d'
  AND challan_number = '237-21126110412-01';

-- Ensure district sequence for Vehari Nov 2026 is at 1 (so next issued notice is 0002)
INSERT INTO public.district_monthly_notice_sequences (district_code, year_month, current_seq, updated_at)
VALUES ('237', '2611', 1, now())
ON CONFLICT (district_code, year_month)
DO UPDATE SET current_seq = 1, updated_at = now();

COMMIT;

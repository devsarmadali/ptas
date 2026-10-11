BEGIN;

CREATE OR REPLACE FUNCTION public.verify_statutory_document_public(
  p_document_ref text,
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := upper(btrim(coalesce(p_document_ref, '')));
  v_pin text := btrim(coalesce(p_pin, '')));
  v_res jsonb;
BEGIN
  -- Normalize PIN: strip leading PIN: or PIN-
  v_pin := regexp_replace(v_pin, '^(PIN[-:]?\s*)', '', 'i');

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

  -- 2. Check Statutory Receipts Registry
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT_RECEIPT',
    'status', 'AUTHENTIC_VALID',
    'reference_number', coalesce(r.snapshot->>'receiptNumber', r.receipt_number),
    'challan_number', coalesce(r.snapshot->>'challanNumber', ''),
    'legal_name', coalesce(r.snapshot->>'assesseeLegalName', 'Taxpayer Entity'),
    'trade_name', nullif(coalesce(r.snapshot->>'assesseeTradeName', ''), ''),
    'district', coalesce(r.snapshot->>'district', 'Vehari'),
    'circle', coalesce(r.snapshot->>'circleName', 'Excise Circle'),
    'amount_paid', coalesce((r.snapshot->>'amountPaidPkr')::numeric, r.amount_paid),
    'bank_scroll_ref', coalesce(r.snapshot->>'bankScrollRef', 'NBP-SCROLL'),
    'deposit_date', coalesce(r.snapshot->>'dateOfReceipt', r.deposit_date::text),
    'category_name', coalesce(r.snapshot->>'statutoryCategory', 'Punjab Professions & Trades Tax'),
    'pin', coalesce(r.snapshot->>'pin', ''),
    'official_sha256', coalesce(r.snapshot->>'officialSha256', ''),
    'receiving_officer', coalesce(r.snapshot->>'receivingOfficerName', 'Excise Inspector'),
    'receiving_officer_title', coalesce(r.snapshot->>'receivingOfficerTitle', 'Inspector (Tax Recovery)'),
    'issuing_authority', 'Excise & Taxation Department, Government of the Punjab',
    'verified_at', now()
  ) INTO v_res
  FROM public.pft2_receipts r
  WHERE (
    (length(v_ref) > 0 AND (
      upper(r.receipt_number) = v_ref OR
      upper(coalesce(r.snapshot->>'receiptNumber', '')) = v_ref OR
      upper(coalesce(r.snapshot->>'challanNumber', '')) = v_ref OR
      upper(coalesce(r.snapshot->>'bankScrollRef', '')) = v_ref
    ))
    OR
    (length(v_pin) = 6 AND coalesce(r.snapshot->>'pin', '') = v_pin)
    OR
    (length(v_ref) = 6 AND coalesce(r.snapshot->>'pin', '') = v_ref)
  )
  LIMIT 1;

  IF v_res IS NOT NULL THEN
    RETURN v_res;
  END IF;

  -- 3. Check Approved Form PFT-1 Notice of Demand
  SELECT jsonb_build_object(
    'is_valid', true,
    'document_type', 'FORM_PFT1_NOTICE',
    'status', 'AUTHENTIC_VALID',
    'reference_number', coalesce(du.permanent_demand_no, p.provincial_uin),
    'permanent_demand_no', du.permanent_demand_no,
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
  FROM public.survey_unit_profiles p
  LEFT JOIN public.demand_units du ON du.survey_unit_profile_id = p.id
  WHERE (
    (length(v_ref) > 0 AND (
      upper(du.permanent_demand_no) = v_ref OR
      upper(p.provincial_uin) = v_ref OR
      upper(p.pin_number) = v_ref
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

REVOKE ALL ON FUNCTION public.verify_statutory_document_public(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_statutory_document_public(text, text) TO anon, authenticated;

COMMIT;

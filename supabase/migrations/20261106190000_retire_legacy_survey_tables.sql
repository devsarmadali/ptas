BEGIN;

-- ============================================================================
-- PTAS Migration 0038: Retire Legacy Survey Tables & Consolidate Unified Architecture
-- 1. Updates reporting, governance, challan issuance, and import validation RPCs
--    to query public.pft3_assessment_units directly with zero-join high performance.
-- 2. Drops foreign key constraint on survey_import_rows pointing to legacy survey_units.
-- 3. Drops obsolete overloads and helper functions.
-- 4. Safely drops the 8 legacy survey tables:
--    - public.pft3_register_entries
--    - public.assessment_versions
--    - public.assessments
--    - public.demand_units
--    - public.taxpayer_identifiers
--    - public.taxpayers
--    - public.survey_unit_profiles
--    - public.survey_units
-- ============================================================================

-- 1. Drop old 4-argument overload of bulk_submit_survey_import if present
DROP FUNCTION IF EXISTS public.bulk_submit_survey_import(uuid, text, text, text) CASCADE;

-- 2. Drop foreign key constraint on survey_import_rows pointing to survey_units
ALTER TABLE public.survey_import_rows
  DROP CONSTRAINT IF EXISTS survey_import_rows_promoted_survey_unit_id_fkey;

-- 3. Drop legacy allocate_taxpayer_pin if present
DROP FUNCTION IF EXISTS ptas_private.allocate_taxpayer_pin(uuid) CASCADE;

-- 4. Update get_district_governance_matrix to query public.pft3_assessment_units
CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH circle_stats AS (
    SELECT
      c.id AS circle_id,
      c.code AS circle_code,
      c.name AS circle_name,
      c.office_address AS circle_address,
      t.id AS tehsil_id,
      t.name AS tehsil_name,
      t.code AS tehsil_code,
      d.id AS district_id,
      d.name AS district_name,
      d.code AS district_code,
      u.id AS inspector_id,
      u.display_name AS inspector_name,
      u.phone AS inspector_phone,
      u.email AS inspector_email,
      coalesce(count(pft.id), 0)::int AS units_count,
      coalesce(sum(CASE WHEN pft.state = 'APPROVED' THEN 1 ELSE 0 END), 0)::int AS approved_units_count,
      coalesce(sum(CASE WHEN pft.state = 'APPROVED' THEN pft.annual_rate_pkr ELSE 0 END), 0)::numeric AS total_assessed_demand
    FROM public.jurisdictions c
    JOIN public.jurisdictions t ON t.id = c.parent_id AND t.tier = 'TEHSIL'
    JOIN public.jurisdictions d ON d.id = t.parent_id AND d.tier = 'DISTRICT'
    LEFT JOIN public.user_roles ur ON ur.jurisdiction_id = c.id AND ur.role_code = 'INSPECTOR' AND ur.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = ur.user_id AND u.active = true
    LEFT JOIN public.pft3_assessment_units pft ON pft.circle_id = c.id
    WHERE c.tier = 'CIRCLE'
      AND (
        v_actor.role_code IN ('ADMIN', 'DIRECTOR')
        OR (v_actor.role_code = 'ETO' AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, c.id))
        OR c.id = v_actor.jurisdiction_id
      )
    GROUP BY c.id, c.code, c.name, c.office_address, t.id, t.name, t.code, d.id, d.name, d.code, u.id, u.display_name, u.phone, u.email
    ORDER BY t.name, c.name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$$;

-- 5. Update get_officers_directory to query public.pft3_assessment_units
CREATE OR REPLACE FUNCTION public.get_officers_directory()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH officer_data AS (
    SELECT
      u.id AS user_id,
      u.auth_user_id,
      u.display_name AS name,
      coalesce(u.email, au.email, '') AS email,
      coalesce(u.phone, '') AS phone,
      coalesce(u.cnic, '') AS cnic,
      coalesce(u.designation, '') AS designation,
      coalesce(u.office_address, j.office_address, '') AS office_address,
      u.active,
      u.created_at,
      ur.role_code AS role,
      ur.jurisdiction_id,
      j.name AS circle_name,
      j.code AS circle_code,
      teh.id AS tehsil_id,
      teh.name AS tehsil_name,
      dist.id AS district_id,
      dist.name AS district_name,
      (SELECT count(*)::int FROM public.pft3_assessment_units su WHERE su.responsible_inspector_id = u.id) AS assigned_survey_units_count,
      (SELECT count(*)::int FROM public.pft3_assessment_units su WHERE su.circle_id = ur.jurisdiction_id) AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist ON (
      CASE 
        WHEN j.tier = 'DISTRICT' THEN j.id = dist.id
        WHEN teh.id IS NOT NULL THEN dist.id = teh.parent_id
        ELSE dist.id = j.parent_id
      END
    ) AND dist.tier = 'DISTRICT'
    WHERE
      v_actor.role_code IN ('ADMIN', 'DIRECTOR')
      OR (v_actor.role_code = 'ETO' AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, ur.jurisdiction_id))
      OR u.id = v_actor.user_id
    ORDER BY 
      CASE ur.role_code WHEN 'ADMIN' THEN 1 WHEN 'DIRECTOR' THEN 2 WHEN 'ETO' THEN 3 WHEN 'INSPECTOR' THEN 4 ELSE 5 END,
      j.name,
      u.display_name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(od)), '[]'::jsonb) INTO v_result
  FROM officer_data od;

  RETURN v_result;
END;
$$;

-- 6. Update issue_pft2_challan_record to support both potential & statutory PFT3 units
CREATE OR REPLACE FUNCTION public.issue_pft2_challan_record(
  p_challan jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor record;
  v_is_potential boolean:=coalesce((p_challan->>'isProvisional')::boolean,false);
  v_unit_id uuid;
  v_jurisdiction_id uuid;
  v_financial_year text;
  v_challan_number text:=btrim(p_challan->>'noticeNumber');
  v_amount numeric(18,2):=(p_challan->>'amountPayable')::numeric;
  v_issue_date date:=(p_challan->>'issueDate')::date;
  v_due_date date:=(p_challan->>'dueDate')::date;
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,'')))=0 OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;
  IF v_challan_number IS NULL OR v_challan_number !~ '^(PFT2|[A-Z0-9]+-[A-Z0-9]+)-[0-9]{4,5}-[0-9]{12}-[0-9]+$' THEN
    RAISE EXCEPTION 'Notice No. payload is invalid' USING ERRCODE='22023';
  END IF;
  IF v_amount<=0 OR v_due_date<v_issue_date THEN
    RAISE EXCEPTION 'invalid challan amount or date range' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;

  IF v_is_potential THEN
    SELECT p.id,p.circle_id,r.financial_year_code
      INTO v_unit_id,v_jurisdiction_id,v_financial_year
    FROM public.potential_assessment_units p
    JOIN public.survey_classification_rules r
      ON r.statutory_rule_id=p.statutory_rule_id AND r.status='ACTIVE'
    WHERE p.id=(p_challan->>'unitId')::uuid AND p.status='ACTIVE'
    ORDER BY r.effective_from DESC LIMIT 1;
  ELSE
    SELECT p.id,p.circle_id,p.financial_year_id
      INTO v_unit_id,v_jurisdiction_id,v_financial_year
    FROM public.pft3_assessment_units p
    WHERE p.id=(p_challan->>'unitId')::uuid;
  END IF;

  IF v_unit_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan target is unavailable in the actor jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Replace the generic PFT2 prefix with registered district and circle codes.
  WITH RECURSIVE ancestors AS (
    SELECT j.id,j.parent_id,j.tier,j.abbreviation FROM public.jurisdictions j
    WHERE j.id=v_jurisdiction_id
    UNION ALL
    SELECT parent.id,parent.parent_id,parent.tier,parent.abbreviation
    FROM public.jurisdictions parent JOIN ancestors child ON parent.id=child.parent_id
  )
  SELECT
    (SELECT abbreviation FROM ancestors WHERE tier IN ('DISTRICT','ZONE') LIMIT 1)||'-'||
    (SELECT abbreviation FROM ancestors WHERE tier='CIRCLE' LIMIT 1)||'-'||
    regexp_replace(v_challan_number,'^(PFT2|[A-Z0-9]+-[A-Z0-9]+)-','')
  INTO v_challan_number;
  IF v_challan_number IS NULL OR v_challan_number !~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4,5}-[0-9]{12}-[0-9]+$' THEN
    RAISE EXCEPTION 'district and circle challan codes are not configured' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pft2-notice:'||v_challan_number));

  IF v_is_potential THEN
    SELECT id,snapshot INTO v_id,v_snapshot FROM public.potential_pft2_challans
      WHERE idempotency_key=p_idempotency_key;
  ELSE
    SELECT id,snapshot INTO v_id,v_snapshot FROM public.pft2_challans
      WHERE idempotency_key=p_idempotency_key;
  END IF;
  IF v_id IS NOT NULL THEN RETURN v_snapshot; END IF;

  IF EXISTS(SELECT 1 FROM public.pft2_challans WHERE challan_number=v_challan_number)
     OR EXISTS(SELECT 1 FROM public.potential_pft2_challans WHERE challan_number=v_challan_number) THEN
    RAISE EXCEPTION 'canonical Notice No. already exists' USING ERRCODE='23505';
  END IF;

  v_id:=gen_random_uuid();
  v_snapshot:=p_challan||jsonb_build_object(
    'id',v_id::text,'challanNumber',v_challan_number,'noticeNumber',v_challan_number,
    'status','ISSUED','isProvisional',v_is_potential
  );

  IF v_is_potential THEN
    INSERT INTO public.potential_pft2_challans(
      id,potential_unit_id,financial_year_id,jurisdiction_id,challan_number,notice_number,
      amount,issue_date,due_date,issued_by,idempotency_key,snapshot
    ) VALUES (
      v_id,v_unit_id,v_financial_year,v_jurisdiction_id,v_challan_number,v_challan_number,
      v_amount,v_issue_date,v_due_date,v_actor.user_id,p_idempotency_key,v_snapshot
    );
  ELSE
    INSERT INTO public.pft2_challans(
      id,pft3_unit_id,financial_year_id,jurisdiction_id,challan_number,notice_number,
      administrative_state,payment_state,due_date,issue_date,issued_at,issued_by,
      amount,idempotency_key,snapshot
    ) VALUES (
      v_id,v_unit_id,v_financial_year,v_jurisdiction_id,v_challan_number,v_challan_number,
      'ISSUED','OUTSTANDING',v_due_date,v_issue_date,now(),v_actor.user_id,
      v_amount,p_idempotency_key,v_snapshot
    );
  END IF;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'PFT2_CHALLAN_ISSUED','PFT2_CHALLAN',v_id::text,v_actor.user_id::text,
    v_actor.role_code,v_jurisdiction_id::text,p_correlation_id,
    jsonb_build_object('notice_number',v_challan_number,'amount',v_amount,'potential',v_is_potential)
  );
  RETURN v_snapshot;
END
$$;

-- 7. Update list_actionable_survey_import_batches to query public.pft3_assessment_units
DROP FUNCTION IF EXISTS public.list_actionable_survey_import_batches() CASCADE;
CREATE OR REPLACE FUNCTION public.list_actionable_survey_import_batches()
RETURNS TABLE (
  batch_id uuid,
  source_filename text,
  financial_year_code text,
  imported_rows integer,
  feeded_rows bigint,
  submitted_rows bigint,
  approved_rows bigint,
  pending_review_rows bigint,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) LIMIT 1
  )
  SELECT
    b.id,b.source_filename,b.financial_year_code,b.imported_rows,
    count(*) FILTER (WHERE u.state='FEEDED'),
    count(*) FILTER (WHERE u.state='SUBMITTED'),
    count(*) FILTER (WHERE u.state='APPROVED'),
    0::bigint,
    b.created_at
  FROM actor a
  JOIN public.survey_import_batches b ON b.status='IMPORTED'
  JOIN public.survey_import_rows r ON r.batch_id=b.id
  JOIN public.pft3_assessment_units u ON u.id=r.promoted_survey_unit_id
  WHERE (
    a.role_code='INSPECTOR'
    AND u.responsible_inspector_id=a.user_id
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id,u.circle_id)
  ) OR (
    a.role_code='ETO'
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id,u.circle_id)
  )
  GROUP BY b.id,b.source_filename,b.financial_year_code,b.imported_rows,b.created_at,a.role_code
  HAVING (a.role_code='INSPECTOR' AND count(*) FILTER (WHERE u.state='FEEDED')>0)
      OR (a.role_code='ETO' AND count(*) FILTER (WHERE u.state='SUBMITTED')>0)
  ORDER BY b.created_at DESC;
$$;

-- 8. Update verify_statutory_document_public to query public.pft3_assessment_units
CREATE OR REPLACE FUNCTION public.verify_statutory_document_public(
  p_document_ref text,
  p_pin text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
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

  -- 2. Check Approved Form PFT-1 Notice of Demand from Unified Form P.F.T-3 Register
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

  -- 3. Not Found
  RETURN jsonb_build_object(
    'is_valid', false,
    'error', 'DOCUMENT_NOT_FOUND',
    'message', 'No authentic statutory record was found matching the queried reference or Security Code.'
  );
END;
$$;

-- 9. Update stage_survey_import_current to validate uniqueness against live registers
CREATE OR REPLACE FUNCTION public.stage_survey_import_current(
  p_source_filename text,
  p_file_sha256 text,
  p_headers jsonb,
  p_rows jsonb,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS public.survey_import_batches LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_business_date date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_import_financial_year text;
  v_import_financial_year_count integer;
  v_rate_financial_year text;
  v_rate_financial_year_count integer;
  v_rows jsonb;
  v_batch public.survey_import_batches;
  v_ready integer;
  v_invalid integer;
  v_pending_review integer;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows must be a non-empty array' USING ERRCODE='22023';
  END IF;

  SELECT min(nullif(btrim(value->>'financial_year'),'')),
         count(DISTINCT nullif(btrim(value->>'financial_year'),''))
  INTO v_import_financial_year,v_import_financial_year_count
  FROM jsonb_array_elements(p_rows);

  IF v_import_financial_year_count <> 1
     OR v_import_financial_year !~ '^[0-9]{4}-[0-9]{4}$'
     OR substring(v_import_financial_year,6,4)::integer
        <> substring(v_import_financial_year,1,4)::integer + 1 THEN
    RAISE EXCEPTION 'exactly one consecutive import financial year is required in the workbook'
      USING ERRCODE='23514';
  END IF;

  SELECT min(financial_year_code),count(DISTINCT financial_year_code)
  INTO v_rate_financial_year,v_rate_financial_year_count
  FROM public.survey_classification_rules
  WHERE status='ACTIVE'
    AND v_business_date BETWEEN effective_from AND coalesce(effective_to,'infinity'::date);

  IF v_rate_financial_year_count <> 1 THEN
    RAISE EXCEPTION 'exactly one active approved statutory rate configuration must cover the business date'
      USING ERRCODE='23514';
  END IF;

  SELECT jsonb_agg(
    value || jsonb_build_object('financial_year',v_rate_financial_year)
    ORDER BY ordinality
  )
  INTO v_rows
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY;

  v_batch := public.stage_survey_import(
    p_source_filename,p_file_sha256,v_rate_financial_year,p_headers,v_rows,
    p_idempotency_key,p_correlation_id
  );

  IF v_batch.status = 'IMPORTED' THEN
    IF v_batch.financial_year_code IS DISTINCT FROM v_import_financial_year THEN
      RAISE EXCEPTION 'the imported file hash is already bound to a different financial year'
        USING ERRCODE='23514';
    END IF;
    RETURN v_batch;
  END IF;

  IF v_batch.financial_year_code NOT IN (v_rate_financial_year,v_import_financial_year) THEN
    RAISE EXCEPTION 'the staged file hash is already bound to a different financial year'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.survey_import_rows
  SET supplied_financial_year = v_import_financial_year
  WHERE batch_id = v_batch.id;

  -- Controlled request to ingest an unclassified survey record for later review
  UPDATE public.survey_import_rows
  SET status='READY', validation_errors='[]'::jsonb
  WHERE batch_id=v_batch.id
    AND resolved_rule_id IS NULL
    AND length(btrim(tax_class)) > 0
    AND length(btrim(tax_assessment_option)) = 0
    AND lower(btrim(coalesce(remarks,''))) = 'under review'
    AND validation_errors = jsonb_build_array(
      'No active approved statutory classification matches this row'
    );

  WITH duplicated AS (
    SELECT lower(btrim(legacy_demand_no)) AS demand_key
    FROM public.survey_import_rows
    WHERE batch_id=v_batch.id
      AND legacy_demand_no IS NOT NULL
      AND length(btrim(legacy_demand_no)) > 0
    GROUP BY lower(btrim(legacy_demand_no))
    HAVING count(*) > 1
  )
  UPDATE public.survey_import_rows r
  SET status='INVALID',
      validation_errors = CASE
        WHEN r.validation_errors @> jsonb_build_array('Legacy Demand No is duplicated in this import')
          THEN r.validation_errors
        ELSE r.validation_errors || jsonb_build_array('Legacy Demand No is duplicated in this import')
      END
  FROM duplicated d
  WHERE r.batch_id=v_batch.id
    AND lower(btrim(r.legacy_demand_no))=d.demand_key;

  UPDATE public.survey_import_rows r
  SET status='INVALID',
      validation_errors = CASE
        WHEN r.validation_errors @> jsonb_build_array('Legacy Demand No already exists')
          THEN r.validation_errors
        ELSE r.validation_errors || jsonb_build_array('Legacy Demand No already exists')
      END
  WHERE r.batch_id=v_batch.id
    AND r.legacy_demand_no IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.pft3_assessment_units p
        WHERE lower(btrim(p.permanent_demand_no))=lower(btrim(r.legacy_demand_no))
      )
      OR EXISTS (
        SELECT 1
        FROM public.potential_assessment_units pau
        WHERE lower(btrim(pau.potential_number))=lower(btrim(r.legacy_demand_no))
      )
    );

  SELECT count(*) FILTER (WHERE status='READY'),
         count(*) FILTER (WHERE status='INVALID'),
         count(*) FILTER (
           WHERE status='READY' AND resolved_rule_id IS NULL
             AND lower(btrim(coalesce(remarks,'')))='under review'
         )
  INTO v_ready,v_invalid,v_pending_review
  FROM public.survey_import_rows
  WHERE batch_id=v_batch.id;

  UPDATE public.survey_import_batches
  SET financial_year_code=v_import_financial_year,
      ready_rows=v_ready,
      invalid_rows=v_invalid,
      status=(CASE WHEN v_invalid=0 THEN 'VALIDATED' ELSE 'NEEDS_CORRECTION' END)::survey_import_batch_state,
      validated_at=now()
  WHERE id=v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload
  )
  SELECT
    gen_random_uuid(),'SURVEY_IMPORT_VALIDATION_RECONCILED','SURVEY_IMPORT',
    v_batch.id::text,a.user_id::text,a.role_code,a.jurisdiction_id,p_correlation_id,
    jsonb_build_object(
      'financial_year_code',v_import_financial_year,
      'statutory_rate_configuration_year',v_rate_financial_year,
      'ready_rows',v_ready,
      'invalid_rows',v_invalid,
      'pending_classification_review_rows',v_pending_review,
      'legacy_demand_numbers_preserved',true,
      'pft3_created',false
    )
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a
  WHERE a.user_id=v_batch.uploaded_by
    AND a.jurisdiction_id=v_batch.jurisdiction_id
    AND NOT EXISTS (
    SELECT 1 FROM public.audit_events e
    WHERE e.aggregate_type='SURVEY_IMPORT'
      AND e.aggregate_id=v_batch.id::text
      AND e.event_type='SURVEY_IMPORT_VALIDATION_RECONCILED'
  );

  RETURN v_batch;
END
$$;

-- 10. Safely drop the 8 legacy survey tables
DROP TABLE IF EXISTS public.pft3_register_entries CASCADE;
DROP TABLE IF EXISTS public.assessment_versions CASCADE;
DROP TABLE IF EXISTS public.assessments CASCADE;
DROP TABLE IF EXISTS public.demand_units CASCADE;
DROP TABLE IF EXISTS public.taxpayer_identifiers CASCADE;
DROP TABLE IF EXISTS public.taxpayers CASCADE;
DROP TABLE IF EXISTS public.survey_unit_profiles CASCADE;
DROP TABLE IF EXISTS public.survey_units CASCADE;

-- 11. Grant permissions on updated functions
GRANT EXECUTE ON FUNCTION public.get_district_governance_matrix() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_pft2_challan_record(jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_actionable_survey_import_batches() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_statutory_document_public(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_survey_import_current(text, text, jsonb, jsonb, text, text) TO authenticated, service_role;

COMMIT;

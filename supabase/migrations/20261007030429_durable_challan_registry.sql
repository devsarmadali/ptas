BEGIN;

-- The hierarchy already exists.  Add explicit display and numbering identifiers
-- instead of overloading the structural code (for example DIST_VEH).
ALTER TABLE public.jurisdictions
  ADD COLUMN IF NOT EXISTS abbreviation text,
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS external_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.jurisdictions
SET display_label=coalesce(display_label,name),
    abbreviation=coalesce(abbreviation,CASE
      WHEN code='DIST_VEH' THEN 'VHR'
      WHEN code='DIST_MULTAN' THEN 'MLT'
      WHEN code='DIST_KHAN' THEN 'KWL'
      WHEN code='DIST_LOD' THEN 'LDN'
      WHEN tier='CIRCLE' THEN lpad(coalesce(substring(code from '([0-9]+)$'),'0'),2,'0')
      ELSE upper(regexp_replace(code,'^(DIV|DIST|TEH|CIR)_','','g'))
    END),
    external_identifiers=external_identifiers||jsonb_build_object('structural_code',code)
WHERE display_label IS NULL OR abbreviation IS NULL
   OR NOT (external_identifiers ? 'structural_code');

ALTER TABLE public.jurisdictions
  ALTER COLUMN abbreviation SET NOT NULL,
  ALTER COLUMN display_label SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jurisdictions_parent_abbreviation_unique
  ON public.jurisdictions(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),abbreviation);

-- Browser storage must never be the system of record for statutory challans or
-- receipts.  The existing regular PFT-2 workflow table remains authoritative;
-- potential-unit challans are isolated in their own table because they do not
-- yet have a demand_unit row.
ALTER TABLE public.pft2_challans
  ADD COLUMN IF NOT EXISTS notice_number text,
  ADD COLUMN IF NOT EXISTS amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.app_users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- A taxpayer may receive more than one partial/revised challan in a financial
-- year.  Uniqueness belongs to the canonical Notice No. and idempotency key.
ALTER TABLE public.pft2_challans
  DROP CONSTRAINT IF EXISTS pft2_challans_demand_unit_id_financial_year_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS pft2_challans_idempotency_key_unique
  ON public.pft2_challans(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pft2_challans_notice_number_unique
  ON public.pft2_challans(notice_number) WHERE notice_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.potential_pft2_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  potential_unit_id uuid NOT NULL REFERENCES public.potential_assessment_units(id),
  financial_year_id text NOT NULL,
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id),
  challan_number text NOT NULL UNIQUE,
  notice_number text NOT NULL UNIQUE,
  administrative_state public.challan_administrative_state NOT NULL DEFAULT 'ISSUED',
  payment_state public.challan_payment_state NOT NULL DEFAULT 'OUTSTANDING',
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  issue_date date NOT NULL,
  due_date date NOT NULL,
  issued_by uuid NOT NULL REFERENCES public.app_users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  received_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (challan_number = notice_number),
  CHECK (due_date >= issue_date)
);

ALTER TABLE public.pft2_receipts ALTER COLUMN challan_id DROP NOT NULL;
ALTER TABLE public.pft2_receipts
  ADD COLUMN IF NOT EXISTS potential_challan_id uuid UNIQUE REFERENCES public.potential_pft2_challans(id),
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS deposit_date date,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS pft2_receipts_receipt_number_unique
  ON public.pft2_receipts(receipt_number) WHERE receipt_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pft2_receipts_idempotency_key_unique
  ON public.pft2_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pft2_receipts_exactly_one_challan'
      AND conrelid = 'public.pft2_receipts'::regclass
  ) THEN
    ALTER TABLE public.pft2_receipts
      ADD CONSTRAINT pft2_receipts_exactly_one_challan
      CHECK (num_nonnulls(challan_id,potential_challan_id)=1) NOT VALID;
  END IF;
END
$$;

-- Potential arrears are a signed opening balance, matching the PFT-3 survey
-- profile treatment.  Positive means payable; negative means carried credit.
ALTER TABLE public.potential_assessment_units
  ALTER COLUMN opening_arrears TYPE numeric(18,2)
  USING opening_arrears::numeric;

ALTER TABLE public.potential_assessment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.potential_pft2_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pft2_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.potential_assessment_units,public.potential_pft2_challans
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.potential_assessment_units,public.potential_pft2_challans
  TO authenticated;

DROP POLICY IF EXISTS potential_assessment_units_select ON public.potential_assessment_units;
CREATE POLICY potential_assessment_units_select ON public.potential_assessment_units
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM ptas_private.active_actor(NULL) a
    WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,potential_assessment_units.circle_id)
  )
);

DROP POLICY IF EXISTS potential_pft2_challans_select ON public.potential_pft2_challans;
CREATE POLICY potential_pft2_challans_select ON public.potential_pft2_challans
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM ptas_private.active_actor(NULL) a
    WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,potential_pft2_challans.jurisdiction_id)
  )
);

CREATE OR REPLACE FUNCTION public.get_challan_jurisdiction_codes(p_jurisdiction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_district_code text;
  v_circle_code text;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL
     OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,p_jurisdiction_id) THEN
    RAISE EXCEPTION 'jurisdiction is unavailable to the active actor' USING ERRCODE='42501';
  END IF;
  WITH RECURSIVE ancestors AS (
    SELECT j.id,j.parent_id,j.tier,j.abbreviation FROM public.jurisdictions j
      WHERE j.id=p_jurisdiction_id
    UNION ALL
    SELECT parent.id,parent.parent_id,parent.tier,parent.abbreviation
      FROM public.jurisdictions parent JOIN ancestors child ON parent.id=child.parent_id
  )
  SELECT
    (SELECT abbreviation FROM ancestors WHERE tier IN ('DISTRICT','ZONE') LIMIT 1),
    (SELECT abbreviation FROM ancestors WHERE tier='CIRCLE' LIMIT 1)
  INTO v_district_code,v_circle_code;
  IF v_district_code IS NULL OR v_circle_code IS NULL THEN
    RAISE EXCEPTION 'district and circle challan codes are not configured' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('district_code',v_district_code,'circle_code',v_circle_code);
END
$$;

CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.id,'potential_number',p.potential_number,'pin_number',p.pin_number,
      'provincial_uin',p.provincial_uin,'legal_name',p.legal_name,'trade_name',p.trade_name,
      'identifier_type',p.identifier_type,'identifier_value',p.identifier_value,
      'address',p.address,'locality',p.locality,'circle_id',p.circle_id,
      'circle_name',p.circle_name,'district_name',p.district_name,
      'category_code',p.category_code,'category_name',p.category_name,
      'subclassification_code',p.subclassification_code,
      'subclassification_name',p.subclassification_name,
      'statutory_tertiary_code',p.statutory_tertiary_code,
      'statutory_tertiary_classification',p.statutory_tertiary_classification,
      'statutory_rule_id',p.statutory_rule_id,'annual_rate_pkr',p.annual_rate_pkr,
      'opening_arrears',p.opening_arrears,'status',p.status,
      'migrated_to_demand_no',p.migrated_to_demand_no,'migrated_at',p.migrated_at,
      'created_at',p.created_at,'updated_at',p.updated_at
    ) ORDER BY p.created_at DESC,p.id
  ),'[]'::jsonb)
  FROM actor a
  JOIN public.potential_assessment_units p
    ON ptas_private.jurisdiction_contains(a.jurisdiction_id,p.circle_id)
$$;

CREATE OR REPLACE FUNCTION public.create_potential_assessment_unit(p_unit jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_circle_id uuid;
  v_next_seq integer;
  v_potential_number text;
  v_pin text;
  v_row public.potential_assessment_units;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active Inspector or ETO role required' USING ERRCODE='42501';
  END IF;

  v_circle_id:=coalesce(nullif(p_unit->>'circle_id','')::uuid,v_actor.jurisdiction_id);
  IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_circle_id) THEN
    RAISE EXCEPTION 'potential unit is outside the actor jurisdiction' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('potential_assessment_unit_number'));
  SELECT coalesce(max(nullif(regexp_replace(potential_number,'\D','','g'),'')::integer),0)+1
    INTO v_next_seq FROM public.potential_assessment_units;
  v_potential_number:='POT-'||lpad(v_next_seq::text,4,'0');
  v_pin:='Potential-'||regexp_replace(coalesce(p_unit->>'pin_number',v_potential_number),'^Potential-','','i');

  INSERT INTO public.potential_assessment_units(
    potential_number,pin_number,provincial_uin,legal_name,trade_name,
    identifier_type,identifier_value,address,locality,circle_id,circle_name,district_name,
    category_code,category_name,subclassification_code,subclassification_name,
    statutory_tertiary_code,statutory_tertiary_classification,statutory_rule_id,
    annual_rate_pkr,opening_arrears,status,created_by
  ) VALUES (
    v_potential_number,v_pin,v_pin,btrim(p_unit->>'legal_name'),nullif(btrim(p_unit->>'trade_name'),''),
    coalesce(nullif(p_unit->>'identifier_type',''),'CNIC'),btrim(p_unit->>'identifier_value'),
    btrim(p_unit->>'address'),nullif(btrim(p_unit->>'locality'),''),v_circle_id,
    coalesce((SELECT name FROM public.jurisdictions WHERE id=v_circle_id),p_unit->>'circle_name'),
    coalesce(nullif(p_unit->>'district_name',''),'Unknown'),btrim(p_unit->>'category_code'),
    btrim(p_unit->>'category_name'),nullif(p_unit->>'subclassification_code',''),
    nullif(p_unit->>'subclassification_name',''),nullif(p_unit->>'statutory_tertiary_code',''),
    nullif(p_unit->>'statutory_tertiary_classification',''),btrim(p_unit->>'statutory_rule_id'),
    (p_unit->>'annual_rate_pkr')::numeric,coalesce((p_unit->>'opening_arrears')::numeric,0),
    'ACTIVE',v_actor.user_id
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,
    correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'POTENTIAL_UNIT_CREATED','POTENTIAL_UNIT',v_row.id::text,
    v_actor.user_id::text,v_actor.role_code,v_circle_id::text,
    coalesce(nullif(p_unit->>'correlation_id',''),'potential-unit:'||v_row.id::text),
    jsonb_build_object('potential_number',v_row.potential_number)
  );
  RETURN to_jsonb(v_row);
END
$$;

CREATE OR REPLACE FUNCTION public.issue_pft2_challan_record(
  p_challan jsonb,p_idempotency_key text,p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_is_potential boolean:=coalesce((p_challan->>'isProvisional')::boolean,false);
  v_unit_id uuid;
  v_demand_unit_id uuid;
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
    SELECT u.id,d.id,u.jurisdiction_id,u.financial_year_id
      INTO v_unit_id,v_demand_unit_id,v_jurisdiction_id,v_financial_year
    FROM public.survey_units u
    JOIN public.demand_units d ON d.taxpayer_id=u.taxpayer_id AND d.active
    JOIN public.pft3_register_entries p3 ON p3.survey_unit_id=u.id
    WHERE u.id=(p_challan->>'unitId')::uuid
    ORDER BY d.created_at DESC LIMIT 1;
  END IF;

  IF v_unit_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan target is unavailable in the actor jurisdiction' USING ERRCODE='42501';
  END IF;

  -- Replace the generic PFT2 prefix with registered district and circle codes.
  -- Example: VHR-01-1184-261003010101-2000.
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
      id,demand_unit_id,financial_year_id,jurisdiction_id,challan_number,notice_number,
      administrative_state,payment_state,due_date,issue_date,issued_at,issued_by,
      amount,idempotency_key,snapshot
    ) VALUES (
      v_id,v_demand_unit_id,v_financial_year,v_jurisdiction_id,v_challan_number,v_challan_number,
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

-- Keep the legacy transition callable for compatibility, but enforce the
-- legally required assessing-authority gate and audit the material action.
-- This only records the approved transition; it does not synthesize an
-- assessment or ledger entry from a payment event.
CREATE OR REPLACE FUNCTION public.migrate_potential_unit_to_pft3(
  p_potential_id uuid,p_assigned_demand_no text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_row public.potential_assessment_units;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO']) a LIMIT 1;
  SELECT * INTO v_row FROM public.potential_assessment_units
    WHERE id=p_potential_id FOR UPDATE;
  IF v_actor.user_id IS NULL OR v_row.id IS NULL
     OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_row.circle_id) THEN
    RAISE EXCEPTION 'active ETO authority is required in the unit jurisdiction' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_assigned_demand_no,'')))=0 THEN
    RAISE EXCEPTION 'assigned demand number is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.potential_assessment_units
    SET status='MIGRATED',migrated_to_demand_no=p_assigned_demand_no,
        migrated_at=now(),updated_at=now()
    WHERE id=p_potential_id RETURNING * INTO v_row;
  PERFORM ptas_private.audit_transition('POTENTIAL_UNIT_MIGRATION_APPROVED','POTENTIAL_UNIT',v_row.id,
    v_actor.user_id,v_actor.role_code,v_row.circle_id,'potential-migration:'||v_row.id::text,
    'ACTIVE','MIGRATED',NULL);
  RETURN to_jsonb(v_row);
END
$$;

CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH actor AS (SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1),
  challans AS (
    SELECT c.created_at,c.snapshot
    FROM actor a JOIN public.pft2_challans c
      ON ptas_private.jurisdiction_contains(a.jurisdiction_id,c.jurisdiction_id)
    WHERE c.snapshot<>'{}'::jsonb
    UNION ALL
    SELECT c.created_at,c.snapshot
    FROM actor a JOIN public.potential_pft2_challans c
      ON ptas_private.jurisdiction_contains(a.jurisdiction_id,c.jurisdiction_id)
  )
  SELECT coalesce(jsonb_agg(snapshot ORDER BY created_at DESC),'[]'::jsonb) FROM challans
$$;

CREATE OR REPLACE FUNCTION public.receive_pft2_challan_record(
  p_challan_id uuid,p_is_potential boolean,p_receipt jsonb,
  p_idempotency_key text,p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record;
  v_jurisdiction_id uuid;
  v_demand_unit_id uuid;
  v_amount numeric(18,2);
  v_challan_number text;
  v_challan_snapshot jsonb;
  v_receipt_id uuid;
  v_receipt_number text:=btrim(p_receipt->>'receiptNumber');
  v_receipt_snapshot jsonb;
  v_received_at timestamptz:=coalesce(nullif(p_receipt->>'dateOfReceipt','')::date,current_date)::timestamptz;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','FINANCE']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_idempotency_key,'')))=0 OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT id,snapshot INTO v_receipt_id,v_receipt_snapshot FROM public.pft2_receipts
    WHERE idempotency_key=p_idempotency_key;
  IF v_receipt_id IS NOT NULL THEN RETURN v_receipt_snapshot; END IF;

  IF p_is_potential THEN
    SELECT jurisdiction_id,amount,challan_number,snapshot
      INTO v_jurisdiction_id,v_amount,v_challan_number,v_challan_snapshot
    FROM public.potential_pft2_challans WHERE id=p_challan_id FOR UPDATE;
  ELSE
    SELECT jurisdiction_id,demand_unit_id,amount,challan_number,snapshot
      INTO v_jurisdiction_id,v_demand_unit_id,v_amount,v_challan_number,v_challan_snapshot
    FROM public.pft2_challans WHERE id=p_challan_id FOR UPDATE;
  END IF;
  IF v_challan_number IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE='42501';
  END IF;
  IF (p_receipt->>'amountPaidPkr')::numeric<>v_amount THEN
    RAISE EXCEPTION 'receipt amount must equal the issued challan amount' USING ERRCODE='23514';
  END IF;
  IF length(v_receipt_number)=0 THEN RAISE EXCEPTION 'receipt number is required' USING ERRCODE='22023'; END IF;

  v_receipt_id:=gen_random_uuid();
  v_receipt_snapshot:=p_receipt||jsonb_build_object(
    'id',v_receipt_id::text,'receiptNumber',v_receipt_number,
    'challanNumber',v_challan_number,'issuedPft2Id',p_challan_id::text
  );
  INSERT INTO public.pft2_receipts(
    id,challan_id,potential_challan_id,bank_transaction_id,amount,received_by,received_at,
    receipt_number,payment_channel,bank_branch,deposit_date,idempotency_key,snapshot
  ) VALUES (
    v_receipt_id,CASE WHEN p_is_potential THEN NULL ELSE p_challan_id END,
    CASE WHEN p_is_potential THEN p_challan_id ELSE NULL END,
    btrim(p_receipt->>'bankScrollRef'),v_amount,v_actor.user_id,v_received_at,v_receipt_number,
    p_receipt->>'paymentChannel',p_receipt->>'bankBranch',
    nullif(p_receipt->>'dateOfReceipt','')::date,p_idempotency_key,v_receipt_snapshot
  );

  IF p_is_potential THEN
    UPDATE public.potential_pft2_challans
      SET payment_state='RECEIVED',received_at=v_received_at,row_version=row_version+1,
          updated_at=now(),snapshot=snapshot||jsonb_build_object(
            'status','RECEIVED','receiptNumber',v_receipt_number,
            'receivedAt',p_receipt->>'dateOfReceipt','receivedBy',v_actor.user_id::text,
            'bankScrollRef',p_receipt->>'bankScrollRef','paymentChannel',p_receipt->>'paymentChannel'
          )
      WHERE id=p_challan_id;
  ELSE
    UPDATE public.pft2_challans
      SET payment_state='RECEIVED',row_version=row_version+1,updated_at=now(),
          snapshot=snapshot||jsonb_build_object(
            'status','RECEIVED','receiptNumber',v_receipt_number,
            'receivedAt',p_receipt->>'dateOfReceipt','receivedBy',v_actor.user_id::text,
            'bankScrollRef',p_receipt->>'bankScrollRef','paymentChannel',p_receipt->>'paymentChannel'
          )
      WHERE id=p_challan_id;
    INSERT INTO public.demand_ledger(
      id,demand_unit_id,financial_year_id,entry_type,amount,source_type,source_id,
      idempotency_key,correlation_id,posted_by,posted_at,metadata
    ) SELECT
      gen_random_uuid(),c.demand_unit_id,c.financial_year_id,'PAYMENT_CREDIT',-abs(v_amount),
      'PAYMENT_RECEIPT',v_receipt_number,p_idempotency_key,p_correlation_id,
      v_actor.user_id::text,v_received_at,
      jsonb_build_object('receiptNumber',v_receipt_number,'challanNumber',v_challan_number,
        'paymentChannel',p_receipt->>'paymentChannel','bankScrollRef',p_receipt->>'bankScrollRef')
    FROM public.pft2_challans c WHERE c.id=p_challan_id;
  END IF;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'PFT2_PAYMENT_RECEIVED','PFT2_CHALLAN',p_challan_id::text,
    v_actor.user_id::text,v_actor.role_code,v_jurisdiction_id::text,p_correlation_id,
    jsonb_build_object('receipt_number',v_receipt_number,'amount',v_amount,'potential',p_is_potential)
  );
  RETURN jsonb_build_object('challan',v_challan_snapshot,'receipt',v_receipt_snapshot);
END
$$;

CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH actor AS (SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1)
  SELECT coalesce(jsonb_agg(r.snapshot ORDER BY r.received_at DESC),'[]'::jsonb)
  FROM actor a
  JOIN public.pft2_receipts r ON true
  LEFT JOIN public.pft2_challans c ON c.id=r.challan_id
  LEFT JOIN public.potential_pft2_challans pc ON pc.id=r.potential_challan_id
  WHERE r.snapshot<>'{}'::jsonb
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id,coalesce(c.jurisdiction_id,pc.jurisdiction_id))
$$;

CREATE OR REPLACE FUNCTION public.cancel_pft2_challan_record(
  p_challan_id uuid,p_is_potential boolean,p_reason text,
  p_idempotency_key text,p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor record; v_jurisdiction_id uuid; v_snapshot jsonb;
BEGIN
  IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'cancellation reason required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF p_is_potential THEN
    SELECT jurisdiction_id,snapshot INTO v_jurisdiction_id,v_snapshot FROM public.potential_pft2_challans WHERE id=p_challan_id FOR UPDATE;
  ELSE
    SELECT jurisdiction_id,snapshot INTO v_jurisdiction_id,v_snapshot FROM public.pft2_challans WHERE id=p_challan_id FOR UPDATE;
  END IF;
  IF v_jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_jurisdiction_id) THEN
    RAISE EXCEPTION 'challan not found in actor jurisdiction' USING ERRCODE='42501';
  END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('status','CANCELLED','cancelledReason',p_reason,
    'cancelledAt',current_date::text,'cancelledBy',v_actor.user_id::text);
  IF p_is_potential THEN
    UPDATE public.potential_pft2_challans SET administrative_state='CANCELLED',cancelled_at=now(),
      cancellation_reason=p_reason,row_version=row_version+1,updated_at=now(),snapshot=v_snapshot WHERE id=p_challan_id;
  ELSE
    UPDATE public.pft2_challans SET administrative_state='CANCELLED',cancelled_at=now(),
      cancellation_source='MANUAL',cancellation_reason=p_reason,row_version=row_version+1,
      updated_at=now(),snapshot=v_snapshot WHERE id=p_challan_id;
  END IF;
  INSERT INTO public.workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key)
  VALUES('PFT2_CHALLAN',p_challan_id,'CANCEL','ISSUED','CANCELLED',p_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key)
  ON CONFLICT(aggregate_type,idempotency_key) DO NOTHING;
  INSERT INTO public.audit_events(id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload)
  VALUES(gen_random_uuid(),'PFT2_CHALLAN_CANCELLED','PFT2_CHALLAN',p_challan_id::text,
    v_actor.user_id::text,v_actor.role_code,v_jurisdiction_id::text,p_correlation_id,
    jsonb_build_object('reason',p_reason,'potential',p_is_potential));
  RETURN v_snapshot;
END
$$;

CREATE OR REPLACE FUNCTION public.create_individual_survey_unit(
  p_unit jsonb,p_idempotency_key text,p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor record; v_rule public.survey_classification_rules; v_taxpayer_id uuid;
  v_unit_id uuid; v_identifier text; v_existing uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN RAISE EXCEPTION 'only an active Inspector may add an individual survey unit' USING ERRCODE='42501'; END IF;
  SELECT aggregate_id INTO v_existing FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('id',v_existing,'idempotent_replay',true); END IF;
  SELECT * INTO v_rule FROM public.survey_classification_rules
    WHERE statutory_rule_id=p_unit->>'statutory_rule_id' AND status='ACTIVE'
    ORDER BY effective_from DESC LIMIT 1;
  IF v_rule.id IS NULL THEN RAISE EXCEPTION 'active approved statutory classification not found' USING ERRCODE='23514'; END IF;
  v_identifier:=upper(regexp_replace(p_unit->>'identifier_value','[^0-9A-Za-z]','','g'));
  INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)
    VALUES(btrim(p_unit->>'legal_name'),'DRAFT',v_actor.jurisdiction_id,v_actor.user_id::text)
    RETURNING id INTO v_taxpayer_id;
  INSERT INTO public.taxpayer_identifiers(taxpayer_id,identifier_type,normalized_value,masked_value,is_primary)
    VALUES(v_taxpayer_id,upper(p_unit->>'identifier_type'),v_identifier,
      repeat('*',greatest(length(v_identifier)-4,0))||right(v_identifier,4),true);
  INSERT INTO public.survey_units(taxpayer_id,financial_year_id,jurisdiction_id,responsible_inspector_id,source,state,payload)
    VALUES(v_taxpayer_id,v_rule.financial_year_code,v_actor.jurisdiction_id,v_actor.user_id,'MANUAL','FEEDED',
      jsonb_build_object('capture','INDIVIDUAL')) RETURNING id INTO v_unit_id;
  INSERT INTO public.survey_unit_profiles(survey_unit_id,survey_no,survey_date,locality,commercial_address,
    legal_name,taxpayer_name,classification_rule_id,taxpayer_status,opening_arrears,remarks)
  VALUES(v_unit_id,'IND-'||left(v_unit_id::text,8),(now() AT TIME ZONE 'Asia/Karachi')::date,
    nullif(btrim(p_unit->>'locality'),''),btrim(p_unit->>'address'),btrim(p_unit->>'legal_name'),
    nullif(btrim(p_unit->>'trade_name'),''),v_rule.id,'NEW',coalesce((p_unit->>'opening_arrears')::numeric,0),
    'Individual field survey capture');
  INSERT INTO public.workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,actor_id,
    actor_role,correlation_id,idempotency_key)
  VALUES('SURVEY_UNIT',v_unit_id,'FEED','NEW','FEEDED',v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key);
  PERFORM ptas_private.audit_transition('SURVEY_UNIT_INDIVIDUAL_CREATED','SURVEY_UNIT',v_unit_id,
    v_actor.user_id,v_actor.role_code,v_actor.jurisdiction_id,p_correlation_id,NULL,'FEEDED',NULL);
  RETURN jsonb_build_object('id',v_unit_id,'idempotent_replay',false);
END
$$;

REVOKE ALL ON FUNCTION public.list_potential_assessment_units(),
  public.create_potential_assessment_unit(jsonb),
  public.get_challan_jurisdiction_codes(uuid),
  public.issue_pft2_challan_record(jsonb,text,text),public.list_pft2_challan_registry(),
  public.receive_pft2_challan_record(uuid,boolean,jsonb,text,text),public.list_pft2_receipt_registry(),
  public.cancel_pft2_challan_record(uuid,boolean,text,text,text),
  public.create_individual_survey_unit(jsonb,text,text),
  public.migrate_potential_unit_to_pft3(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units(),
  public.create_potential_assessment_unit(jsonb),
  public.get_challan_jurisdiction_codes(uuid),
  public.issue_pft2_challan_record(jsonb,text,text),public.list_pft2_challan_registry(),
  public.receive_pft2_challan_record(uuid,boolean,jsonb,text,text),public.list_pft2_receipt_registry(),
  public.cancel_pft2_challan_record(uuid,boolean,text,text,text),
  public.create_individual_survey_unit(jsonb,text,text),
  public.migrate_potential_unit_to_pft3(uuid,text) TO authenticated;

COMMIT;

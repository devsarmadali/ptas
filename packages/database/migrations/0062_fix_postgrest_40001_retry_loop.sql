-- ============================================================================
-- PTAS Migration 0062: Replace ERRCODE '40001' with 'PT409' in RPC Conflict Checks
-- ============================================================================
-- Non-destructive forward migration:
-- PostgREST (hasql-transaction) catches PostgreSQL SQLSTATE '40001'
-- (serialization_failure) as a transient retryable error and automatically loops
-- the transaction indefinitely when thrown for deterministic business conflicts
-- (such as stale optimistic row_version or row-count mismatches).
-- Mapping those conflicts to PostgREST custom SQLSTATE 'PT409' returns HTTP 409
-- Conflict cleanly on the first attempt without retry storms.
-- ============================================================================

BEGIN;

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
  IF v.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE = 'PT409'; END IF;

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
  IF c.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE = 'PT409'; END IF;

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

CREATE OR REPLACE FUNCTION public.admin_activate_survey_classification_rate_pack(
  p_rate_pack_id uuid,
  p_financial_year_code text,
  p_effective_from date,
  p_effective_to date,
  p_approval_identifier text,
  p_approving_authority text,
  p_approved_on date,
  p_correlation_id text
)
RETURNS public.survey_classification_rate_packs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pack public.survey_classification_rate_packs;
  v_inserted integer;
  v_actor text := coalesce((SELECT auth.uid())::text,'BACKEND_ADMIN');
BEGIN
  IF coalesce(p_financial_year_code,'') !~ '^[0-9]{4}-[0-9]{4}$'
    OR p_effective_from IS NULL
    OR (p_effective_to IS NOT NULL AND p_effective_to < p_effective_from)
    OR length(btrim(coalesce(p_approval_identifier,''))) = 0
    OR length(btrim(coalesce(p_approving_authority,''))) = 0
    OR p_approved_on IS NULL
    OR length(btrim(coalesce(p_correlation_id,''))) = 0 THEN
    RAISE EXCEPTION 'financial year, effective period, formal approval evidence, and correlation ID are required'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_pack
  FROM public.survey_classification_rate_packs
  WHERE id = p_rate_pack_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rate pack not found' USING ERRCODE='P0002';
  END IF;
  IF v_pack.status = 'ACTIVE' THEN
    RETURN v_pack;
  END IF;
  IF v_pack.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'rate pack is not eligible for activation' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.survey_classification_rules(
    rate_pack_id,financial_year_code,tax_class,tax_assessment_option,tax_subclass,
    assessment_rate,primary_class_code,schedule_subclass_code,rate_basis,
    statutory_rule_id,effective_from,effective_to,status,approval_identifier,
    approving_authority,approved_on,source_document_sha256
  )
  SELECT
    v_pack.id,p_financial_year_code,item->>'tax_class',item->>'tax_assessment_option',
    item->>'tax_subclass',(item->>'assessment_rate')::numeric,item->>'primary_class_code',
    item->>'schedule_subclass_code',item->>'rate_basis',item->>'statutory_rule_id',
    p_effective_from,p_effective_to,'ACTIVE',btrim(p_approval_identifier),
    btrim(p_approving_authority),p_approved_on,v_pack.source_document_sha256
  FROM jsonb_array_elements(v_pack.source_rows) item;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_pack.row_count THEN
    RAISE EXCEPTION 'rate pack row-count mismatch during activation' USING ERRCODE = 'PT409';
  END IF;

  PERFORM set_config('ptas.rate_pack_activation',v_pack.id::text,true);
  UPDATE public.survey_classification_rate_packs
  SET financial_year_code=p_financial_year_code,effective_from=p_effective_from,
      effective_to=p_effective_to,status='ACTIVE',
      approval_identifier=btrim(p_approval_identifier),
      approving_authority=btrim(p_approving_authority),approved_on=p_approved_on,
      activated_by=v_actor,activated_at=now()
  WHERE id=v_pack.id
  RETURNING * INTO v_pack;

  INSERT INTO public.audit_events(
    id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,
    jurisdiction_id,correlation_id,payload
  ) VALUES (
    gen_random_uuid(),'STATUTORY_RATE_PACK_ACTIVATED','SURVEY_CLASSIFICATION_RATE_PACK',
    v_pack.id::text,v_actor,'BACKEND_ADMIN',NULL,p_correlation_id,
    jsonb_build_object(
      'previous_state','PENDING_APPROVAL','new_state','ACTIVE',
      'financial_year_code',v_pack.financial_year_code,
      'effective_from',v_pack.effective_from,'effective_to',v_pack.effective_to,
      'approval_identifier',v_pack.approval_identifier,
      'approving_authority',v_pack.approving_authority,
      'approved_on',v_pack.approved_on,
      'source_document_sha256',v_pack.source_document_sha256,
      'row_count',v_pack.row_count
    )
  );

  RETURN v_pack;
END
$function$;

COMMIT;

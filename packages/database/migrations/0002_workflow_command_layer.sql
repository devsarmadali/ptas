BEGIN;

CREATE SCHEMA IF NOT EXISTS ptas_private;
REVOKE ALL ON SCHEMA ptas_private FROM PUBLIC, anon, authenticated;

CREATE TYPE survey_workflow_state AS ENUM ('NEW', 'FEEDED', 'SUBMITTED', 'RETURNED', 'APPROVED', 'CLOSED');
CREATE TYPE show_cause_state AS ENUM ('CREATED', 'ISSUED', 'SERVED', 'SERVICE_RECORDED', 'PROCESS_COMPLETED', 'PENALTY_IMPOSED');
CREATE TYPE deletion_request_state AS ENUM ('PENDING', 'RETURNED', 'APPROVED');
CREATE TYPE challan_administrative_state AS ENUM ('PREPARED', 'ISSUED', 'CANCELLED');
CREATE TYPE challan_payment_state AS ENUM ('OUTSTANDING', 'RECEIVED');

ALTER TABLE app_user
  ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id),
  ADD COLUMN deactivated_at timestamptz;

CREATE UNIQUE INDEX user_role_one_active_assignment
  ON user_role (user_id, role_code, jurisdiction_id)
  WHERE valid_to IS NULL;

CREATE TABLE survey_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxpayer_id uuid NOT NULL REFERENCES taxpayer(id),
  financial_year_id uuid NOT NULL REFERENCES financial_year(id),
  assessment_id uuid UNIQUE REFERENCES assessment(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  responsible_inspector_id uuid NOT NULL REFERENCES app_user(id),
  source text NOT NULL CHECK (source IN ('MANUAL', 'CSV_IMPORT')),
  state survey_workflow_state NOT NULL DEFAULT 'NEW',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  UNIQUE (taxpayer_id, financial_year_id)
);

CREATE TABLE pft3_register_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_unit_id uuid NOT NULL UNIQUE REFERENCES survey_unit(id),
  assessment_id uuid NOT NULL UNIQUE REFERENCES assessment(id),
  assessment_version_id uuid NOT NULL UNIQUE REFERENCES assessment_version(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  registered_by uuid NOT NULL REFERENCES app_user(id)
);

CREATE TABLE show_cause_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_unit_id uuid NOT NULL REFERENCES demand_unit(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  state show_cause_state NOT NULL DEFAULT 'CREATED',
  notice_document_id uuid REFERENCES document_record(id),
  service_document_id uuid REFERENCES document_record(id),
  issued_at timestamptz,
  served_at timestamptz,
  service_recorded_at timestamptz,
  process_completed_at timestamptz,
  penalty_imposed_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE demand_deletion_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_unit_id uuid NOT NULL REFERENCES demand_unit(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  state deletion_request_state NOT NULL DEFAULT 'PENDING',
  requested_by uuid NOT NULL REFERENCES app_user(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text NOT NULL CHECK (length(btrim(request_reason)) > 0),
  reviewed_by uuid REFERENCES app_user(id),
  reviewed_at timestamptz,
  review_reason text,
  row_version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX demand_deletion_one_pending
  ON demand_deletion_request (demand_unit_id) WHERE state = 'PENDING';

ALTER TABLE demand_unit
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN inactivated_at timestamptz,
  ADD COLUMN inactivated_by uuid REFERENCES app_user(id),
  ADD COLUMN inactivation_request_id uuid UNIQUE REFERENCES demand_deletion_request(id);

CREATE TABLE pft2_challan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_unit_id uuid NOT NULL REFERENCES demand_unit(id),
  financial_year_id uuid NOT NULL REFERENCES financial_year(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  challan_number text NOT NULL UNIQUE,
  administrative_state challan_administrative_state NOT NULL DEFAULT 'PREPARED',
  payment_state challan_payment_state NOT NULL DEFAULT 'OUTSTANDING',
  due_date date NOT NULL,
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancellation_source text CHECK (cancellation_source IN ('MANUAL', 'AUTOMATIC')),
  cancellation_reason text,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (demand_unit_id, financial_year_id)
);

CREATE TABLE pft2_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id uuid NOT NULL REFERENCES pft2_challan(id),
  bank_transaction_id text NOT NULL UNIQUE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  received_by uuid NOT NULL REFERENCES app_user(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challan_id)
);

CREATE OR REPLACE FUNCTION ptas_private.active_actor(p_required_roles text[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, role_code text, jurisdiction_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, ur.role_code, ur.jurisdiction_id
  FROM app_user u
  JOIN user_role ur ON ur.user_id = u.id
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.active
    AND u.deactivated_at IS NULL
    AND ur.valid_from <= now()
    AND (ur.valid_to IS NULL OR ur.valid_to > now())
    AND (p_required_roles IS NULL OR ur.role_code = ANY (p_required_roles));
$$;
REVOKE ALL ON FUNCTION ptas_private.active_actor(text[]) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ptas_private TO authenticated;
GRANT EXECUTE ON FUNCTION ptas_private.active_actor(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_my_ptas_actor()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'user_id', a.user_id,
    'display_name', u.display_name,
    'role', a.role_code,
    'jurisdiction_id', a.jurisdiction_id,
    'jurisdiction_name', j.name,
    'jurisdiction_tier', j.type
  )
  FROM ptas_private.active_actor(NULL) a
  JOIN app_user u ON u.id=a.user_id
  JOIN jurisdiction j ON j.id=a.jurisdiction_id
  ORDER BY a.role_code
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_my_ptas_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_my_ptas_actor() TO authenticated;

CREATE OR REPLACE FUNCTION ptas_private.append_workflow_audit(
  p_event text, p_type text, p_id uuid, p_actor uuid, p_role text, p_jurisdiction uuid,
  p_correlation text, p_from text, p_to text, p_reason text
) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO audit_event(event_type, aggregate_type, aggregate_id, actor_id, actor_role,
    jurisdiction_id, correlation_id, payload)
  VALUES (p_event, p_type, p_id, p_actor, p_role, p_jurisdiction, p_correlation,
    jsonb_build_object('previous_state', p_from, 'new_state', p_to, 'reason', p_reason));
$$;
REVOKE ALL ON FUNCTION ptas_private.append_workflow_audit(text,text,uuid,uuid,text,uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid, p_action text, p_expected_version bigint, p_idempotency_key text,
  p_correlation_id text, p_reason text DEFAULT NULL
) RETURNS survey_unit
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v survey_unit; a record; next_state survey_workflow_state; previous_state survey_workflow_state;
BEGIN
  SELECT * INTO v FROM survey_unit WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey unit not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM workflow_action WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key)
    THEN RETURN v; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(
    CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR'] END);
  IF a.user_id IS NULL OR a.jurisdiction_id <> v.jurisdiction_id THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  previous_state := v.state;
  next_state := CASE
    WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED'
    ELSE NULL END;
  IF next_state IS NULL THEN RAISE EXCEPTION 'invalid survey transition % from %', p_action, v.state USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,correlation_id,idempotency_key)
    VALUES('SURVEY_UNIT',v.id,p_action,v.state::text,next_state::text,p_reason,a.user_id,p_correlation_id,p_idempotency_key);
  UPDATE survey_unit SET state=next_state,row_version=row_version+1,updated_at=now(),
    submitted_at=CASE WHEN next_state='SUBMITTED' THEN now() ELSE submitted_at END,
    approved_at=CASE WHEN next_state='APPROVED' THEN now() ELSE approved_at END,
    closed_at=CASE WHEN next_state='CLOSED' THEN now() ELSE closed_at END WHERE id=v.id RETURNING * INTO v;
  IF next_state='APPROVED' THEN
    IF v.assessment_id IS NULL THEN RAISE EXCEPTION 'approval requires linked assessment' USING ERRCODE='23514'; END IF;
    UPDATE assessment SET status='APPROVED' WHERE id=v.assessment_id AND status IN ('SUBMITTED','RESUBMITTED');
    IF NOT FOUND THEN RAISE EXCEPTION 'assessment is not eligible for approval' USING ERRCODE='23514'; END IF;
    UPDATE assessment_version SET status='APPROVED',approved_by=a.user_id,approved_at=now()
      WHERE assessment_id=v.assessment_id AND version_no=(SELECT current_version_no FROM assessment WHERE id=v.assessment_id)
        AND status IN ('SUBMITTED','RESUBMITTED');
    INSERT INTO pft3_register_entry(survey_unit_id,assessment_id,assessment_version_id,registered_by)
      SELECT v.id,av.assessment_id,av.id,a.user_id FROM assessment_version av
      JOIN assessment asm ON asm.id=av.assessment_id AND asm.current_version_no=av.version_no
      WHERE av.assessment_id=v.assessment_id
      ON CONFLICT (survey_unit_id) DO NOTHING;
  END IF;
  PERFORM ptas_private.append_workflow_audit('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,a.jurisdiction_id,p_correlation_id,previous_state::text,next_state::text,p_reason);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_demand_deletion(
  p_demand_unit_id uuid, p_jurisdiction_id uuid, p_reason text, p_idempotency_key text, p_correlation_id text
) RETURNS demand_deletion_request
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r demand_deletion_request; a record;
BEGIN
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['INSPECTOR']);
  IF a.user_id IS NULL OR a.jurisdiction_id <> p_jurisdiction_id THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='23514'; END IF;
  INSERT INTO demand_deletion_request(demand_unit_id,jurisdiction_id,requested_by,request_reason)
    VALUES(p_demand_unit_id,p_jurisdiction_id,a.user_id,p_reason) RETURNING * INTO r;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,to_status,reason,actor_id,correlation_id,idempotency_key)
    VALUES('DEMAND_DELETION',r.id,'REQUEST','PENDING',p_reason,a.user_id,p_correlation_id,p_idempotency_key);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.request_demand_deletion(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_demand_deletion(uuid,uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_demand_deletion(
  p_request_id uuid, p_decision text, p_expected_version bigint, p_reason text,
  p_idempotency_key text, p_correlation_id text
) RETURNS demand_deletion_request
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r demand_deletion_request; a record; n deletion_request_state;
BEGIN
  SELECT * INTO r FROM demand_deletion_request WHERE id=p_request_id FOR UPDATE;
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO']);
  IF a.user_id IS NULL OR a.jurisdiction_id <> r.jurisdiction_id THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF r.state <> 'PENDING' OR r.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale or ineligible request' USING ERRCODE='40001'; END IF;
  IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='23514'; END IF;
  n := CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'RETURN' THEN 'RETURNED' ELSE NULL END;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='23514'; END IF;
  UPDATE demand_deletion_request SET state=n,reviewed_by=a.user_id,reviewed_at=now(),review_reason=p_reason,row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
  IF n='APPROVED' THEN UPDATE demand_unit SET active=false,inactivated_at=now(),inactivated_by=a.user_id,inactivation_request_id=r.id WHERE id=r.demand_unit_id; END IF;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,correlation_id,idempotency_key)
    VALUES('DEMAND_DELETION',r.id,p_decision,'PENDING',n::text,p_reason,a.user_id,p_correlation_id,p_idempotency_key);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.review_demand_deletion(uuid,text,bigint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_demand_deletion(uuid,text,bigint,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_show_cause(
  p_case_id uuid, p_action text, p_expected_version bigint, p_reason text,
  p_document_id uuid, p_idempotency_key text, p_correlation_id text
) RETURNS show_cause_case
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c show_cause_case; a record; n show_cause_state; required_roles text[];
BEGIN
  SELECT * INTO c FROM show_cause_case WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'show cause case not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM workflow_action WHERE aggregate_type='SHOW_CAUSE' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
  required_roles := CASE WHEN p_action IN ('SERVE','RECORD_SERVICE') THEN ARRAY['INSPECTOR'] ELSE ARRAY['ETO'] END;
  SELECT * INTO a FROM ptas_private.active_actor(required_roles) x WHERE x.jurisdiction_id=c.jurisdiction_id LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  n := CASE
    WHEN c.state='CREATED' AND p_action='ISSUE' AND p_document_id IS NOT NULL THEN 'ISSUED'
    WHEN c.state='ISSUED' AND p_action='SERVE' THEN 'SERVED'
    WHEN c.state='SERVED' AND p_action='RECORD_SERVICE' AND p_document_id IS NOT NULL THEN 'SERVICE_RECORDED'
    WHEN c.state='SERVICE_RECORDED' AND p_action='COMPLETE_PROCESS' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PROCESS_COMPLETED'
    WHEN c.state='PROCESS_COMPLETED' AND p_action='IMPOSE_PENALTY' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PENALTY_IMPOSED'
    ELSE NULL END;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid show-cause transition' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,correlation_id,idempotency_key)
    VALUES('SHOW_CAUSE',c.id,p_action,c.state::text,n::text,p_reason,a.user_id,p_correlation_id,p_idempotency_key);
  UPDATE show_cause_case SET state=n,row_version=row_version+1,
    notice_document_id=CASE WHEN n='ISSUED' THEN p_document_id ELSE notice_document_id END,
    service_document_id=CASE WHEN n='SERVICE_RECORDED' THEN p_document_id ELSE service_document_id END,
    issued_at=CASE WHEN n='ISSUED' THEN now() ELSE issued_at END,
    served_at=CASE WHEN n='SERVED' THEN now() ELSE served_at END,
    service_recorded_at=CASE WHEN n='SERVICE_RECORDED' THEN now() ELSE service_recorded_at END,
    process_completed_at=CASE WHEN n='PROCESS_COMPLETED' THEN now() ELSE process_completed_at END,
    penalty_imposed_at=CASE WHEN n='PENALTY_IMPOSED' THEN now() ELSE penalty_imposed_at END
    WHERE id=c.id RETURNING * INTO c;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.transition_show_cause(uuid,text,bigint,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_show_cause(uuid,text,bigint,text,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_pft2_challan(
  p_challan_id uuid, p_action text, p_expected_version bigint, p_reason text,
  p_idempotency_key text, p_correlation_id text
) RETURNS pft2_challan
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c pft2_challan; a record; next_admin challan_administrative_state;
BEGIN
  SELECT * INTO c FROM pft2_challan WHERE id=p_challan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challan not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM workflow_action WHERE aggregate_type='PFT2_CHALLAN' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR']) x WHERE x.jurisdiction_id=c.jurisdiction_id LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  next_admin := CASE
    WHEN c.administrative_state='PREPARED' AND p_action='ISSUE' THEN 'ISSUED'
    WHEN c.administrative_state='ISSUED' AND p_action='CANCEL' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CANCELLED'
    ELSE NULL END;
  IF next_admin IS NULL THEN RAISE EXCEPTION 'invalid challan transition' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,correlation_id,idempotency_key)
    VALUES('PFT2_CHALLAN',c.id,p_action,c.administrative_state::text,next_admin::text,p_reason,a.user_id,p_correlation_id,p_idempotency_key);
  UPDATE pft2_challan SET administrative_state=next_admin,row_version=row_version+1,
    issued_at=CASE WHEN next_admin='ISSUED' THEN now() ELSE issued_at END,
    cancelled_at=CASE WHEN next_admin='CANCELLED' THEN now() ELSE cancelled_at END,
    cancellation_source=CASE WHEN next_admin='CANCELLED' THEN 'MANUAL' ELSE cancellation_source END,
    cancellation_reason=CASE WHEN next_admin='CANCELLED' THEN p_reason ELSE cancellation_reason END
    WHERE id=c.id RETURNING * INTO c;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.transition_pft2_challan(uuid,text,bigint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_pft2_challan(uuid,text,bigint,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_pft2_payment(
  p_challan_id uuid, p_bank_transaction_id text, p_amount numeric, p_idempotency_key text, p_correlation_id text
) RETURNS pft2_receipt
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c pft2_challan; r pft2_receipt; a record;
BEGIN
  SELECT * INTO c FROM pft2_challan WHERE id=p_challan_id FOR UPDATE;
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','FINANCE','INSPECTOR']);
  IF a.user_id IS NULL OR a.jurisdiction_id <> c.jurisdiction_id THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF c.administrative_state='PREPARED' OR c.payment_state <> 'OUTSTANDING' THEN RAISE EXCEPTION 'challan not receivable' USING ERRCODE='23514'; END IF;
  INSERT INTO pft2_receipt(challan_id,bank_transaction_id,amount,received_by)
    VALUES(c.id,p_bank_transaction_id,p_amount,a.user_id) RETURNING * INTO r;
  UPDATE pft2_challan SET payment_state='RECEIVED',row_version=row_version+1 WHERE id=c.id;
  INSERT INTO workflow_action(aggregate_type,aggregate_id,action,from_status,to_status,actor_id,correlation_id,idempotency_key)
    VALUES('PFT2_CHALLAN',c.id,'RECEIVE',c.payment_state::text,'RECEIVED',a.user_id,p_correlation_id,p_idempotency_key);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.receive_pft2_payment(uuid,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_pft2_payment(uuid,text,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION ptas_private.cancel_overdue_pft2(p_business_date date DEFAULT (now() AT TIME ZONE 'Asia/Karachi')::date)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
  WITH eligible AS (
    UPDATE pft2_challan SET administrative_state='CANCELLED',cancelled_at=now(),
      cancellation_source='AUTOMATIC',cancellation_reason='Due date plus configured three-day grace period elapsed',row_version=row_version+1
    WHERE administrative_state='ISSUED' AND payment_state='OUTSTANDING' AND p_business_date > due_date + 3
    RETURNING id,jurisdiction_id
  ), logged AS (
    INSERT INTO audit_event(event_type,aggregate_type,aggregate_id,actor_role,jurisdiction_id,correlation_id,payload)
    SELECT 'PFT2_AUTOMATIC_CANCELLATION','PFT2_CHALLAN',id,'SYSTEM',jurisdiction_id,
      'cron:pft2-cancel:'||p_business_date::text,jsonb_build_object('business_date',p_business_date,'timezone','Asia/Karachi') FROM eligible
  ) SELECT count(*) INTO changed FROM eligible;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION ptas_private.cancel_overdue_pft2(date) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='ptas-cancel-overdue-pft2') THEN
      PERFORM cron.schedule('ptas-cancel-overdue-pft2','5 0 * * *',
        $job$SELECT ptas_private.cancel_overdue_pft2((now() AT TIME ZONE 'Asia/Karachi')::date)$job$);
    END IF;
  END IF;
END $$;

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE pft3_register_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_cause_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE pft2_challan ENABLE ROW LEVEL SECURITY;
ALTER TABLE pft2_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurisdiction ENABLE ROW LEVEL SECURITY;
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxpayer ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxpayer_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_year ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_configuration_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON app_user,user_role,survey_unit,pft3_register_entry,show_cause_case,
  demand_deletion_request,pft2_challan,pft2_receipt FROM anon,authenticated;
REVOKE ALL ON jurisdiction,role,taxpayer,taxpayer_identifier,financial_year,approval_evidence,
  legal_configuration_version,assessment,assessment_version,workflow_action,demand_unit,
  demand_ledger,document_record,audit_event FROM anon,authenticated;
GRANT SELECT ON app_user,user_role,survey_unit,pft3_register_entry,show_cause_case,
  demand_deletion_request,pft2_challan,pft2_receipt TO authenticated;

CREATE POLICY app_user_self_select ON app_user FOR SELECT TO authenticated USING (auth_user_id=(SELECT auth.uid()));
CREATE POLICY user_role_self_select ON user_role FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM app_user WHERE auth_user_id=(SELECT auth.uid())));
CREATE POLICY survey_jurisdiction_select ON survey_unit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE a.jurisdiction_id=survey_unit.jurisdiction_id));
CREATE POLICY pft3_jurisdiction_select ON pft3_register_entry FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM survey_unit s, ptas_private.active_actor(NULL) a WHERE s.id=survey_unit_id AND s.jurisdiction_id=a.jurisdiction_id));
CREATE POLICY show_cause_jurisdiction_select ON show_cause_case FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE a.jurisdiction_id=show_cause_case.jurisdiction_id));
CREATE POLICY deletion_jurisdiction_select ON demand_deletion_request FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE a.jurisdiction_id=demand_deletion_request.jurisdiction_id));
CREATE POLICY challan_jurisdiction_select ON pft2_challan FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE a.jurisdiction_id=pft2_challan.jurisdiction_id));
CREATE POLICY receipt_jurisdiction_select ON pft2_receipt FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pft2_challan c, ptas_private.active_actor(NULL) a WHERE c.id=challan_id AND c.jurisdiction_id=a.jurisdiction_id));

CREATE OR REPLACE FUNCTION ptas_private.prevent_approved_or_historical_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% historical record is immutable', TG_TABLE_NAME USING ERRCODE='55000';
END $$;
CREATE TRIGGER pft3_no_update_delete BEFORE UPDATE OR DELETE ON pft3_register_entry
  FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_approved_or_historical_mutation();
CREATE TRIGGER receipt_no_update_delete BEFORE UPDATE OR DELETE ON pft2_receipt
  FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_approved_or_historical_mutation();
CREATE TRIGGER workflow_action_no_update_delete BEFORE UPDATE OR DELETE ON workflow_action
  FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_approved_or_historical_mutation();

COMMIT;

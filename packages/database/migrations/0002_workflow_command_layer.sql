BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS ptas_private;
REVOKE ALL ON SCHEMA ptas_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ptas_private TO authenticated;

CREATE TYPE survey_workflow_state AS ENUM ('NEW','FEEDED','SUBMITTED','RETURNED','APPROVED','CLOSED');
CREATE TYPE show_cause_state AS ENUM ('CREATED','ISSUED','SERVED','SERVICE_RECORDED','PROCESS_COMPLETED','PENALTY_IMPOSED');
CREATE TYPE deletion_request_state AS ENUM ('PENDING','RETURNED','APPROVED');
CREATE TYPE challan_administrative_state AS ENUM ('PREPARED','ISSUED','CANCELLED');
CREATE TYPE challan_payment_state AS ENUM ('OUTSTANDING','RECEIVED');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CHECK ((active AND deactivated_at IS NULL) OR (NOT active AND deactivated_at IS NOT NULL)),
  CHECK (auth_user_id IS NOT NULL OR NOT active)
);

CREATE TABLE roles (code text PRIMARY KEY, description text NOT NULL);
INSERT INTO roles(code,description) VALUES
 ('INSPECTOR','Professional Tax Inspector'),('ETO','Excise and Taxation Officer / assessing authority'),
 ('FINANCE','Authorized payment and receipt officer'),('AUDITOR','Read-only audit officer'),
 ('DIRECTOR','Read-only supervisory officer');

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
  role_code text NOT NULL REFERENCES roles(code), jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
  valid_from timestamptz NOT NULL DEFAULT now(), valid_to timestamptz, assigned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX user_roles_one_active_assignment ON user_roles(user_id,role_code,jurisdiction_id) WHERE valid_to IS NULL;

CREATE TABLE workflow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  action text NOT NULL, from_status text, to_status text NOT NULL, reason text,
  actor_id uuid REFERENCES app_users(id), actor_role text NOT NULL,
  correlation_id text NOT NULL, idempotency_key text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(aggregate_type,idempotency_key)
);

CREATE TABLE survey_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), taxpayer_id uuid NOT NULL REFERENCES taxpayers(id),
  financial_year_id text NOT NULL, assessment_id uuid UNIQUE REFERENCES assessments(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id), responsible_inspector_id uuid NOT NULL REFERENCES app_users(id),
  source text NOT NULL CHECK(source IN ('MANUAL','CSV_IMPORT')), state survey_workflow_state NOT NULL DEFAULT 'NEW',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz, approved_at timestamptz, closed_at timestamptz,
  UNIQUE(taxpayer_id,financial_year_id)
);

CREATE TABLE pft3_register_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_unit_id uuid NOT NULL UNIQUE REFERENCES survey_units(id),
  assessment_id uuid NOT NULL UNIQUE REFERENCES assessments(id), assessment_version_id uuid NOT NULL UNIQUE REFERENCES assessment_versions(id),
  registered_at timestamptz NOT NULL DEFAULT now(), registered_by uuid NOT NULL REFERENCES app_users(id)
);

CREATE TABLE official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  document_type text NOT NULL, object_key text NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-fA-F]{64}$'),
  snapshot jsonb NOT NULL, generated_by uuid NOT NULL REFERENCES app_users(id), generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE show_cause_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_unit_id uuid NOT NULL REFERENCES demand_units(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id), state show_cause_state NOT NULL DEFAULT 'CREATED',
  notice_document_id uuid REFERENCES official_documents(id), service_document_id uuid REFERENCES official_documents(id),
  issued_at timestamptz, served_at timestamptz, service_recorded_at timestamptz,
  process_completed_at timestamptz, penalty_imposed_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE demand_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_unit_id uuid NOT NULL REFERENCES demand_units(id),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id), state deletion_request_state NOT NULL DEFAULT 'PENDING',
  requested_by uuid NOT NULL REFERENCES app_users(id), requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text NOT NULL CHECK(length(btrim(request_reason))>0), reviewed_by uuid REFERENCES app_users(id),
  reviewed_at timestamptz, review_reason text, row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0)
);
CREATE UNIQUE INDEX demand_deletion_one_pending ON demand_deletion_requests(demand_unit_id) WHERE state='PENDING';

ALTER TABLE demand_units ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE demand_units ADD COLUMN inactivated_at timestamptz;
ALTER TABLE demand_units ADD COLUMN inactivated_by uuid REFERENCES app_users(id);
ALTER TABLE demand_units ADD COLUMN inactivation_request_id uuid UNIQUE REFERENCES demand_deletion_requests(id);

CREATE TABLE pft2_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_unit_id uuid NOT NULL REFERENCES demand_units(id),
  financial_year_id text NOT NULL, jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id), challan_number text NOT NULL UNIQUE,
  administrative_state challan_administrative_state NOT NULL DEFAULT 'PREPARED',
  payment_state challan_payment_state NOT NULL DEFAULT 'OUTSTANDING', due_date date NOT NULL,
  issued_at timestamptz, cancelled_at timestamptz, cancellation_source text CHECK(cancellation_source IN ('MANUAL','AUTOMATIC')),
  cancellation_reason text, row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(demand_unit_id,financial_year_id)
);

CREATE TABLE pft2_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), challan_id uuid NOT NULL UNIQUE REFERENCES pft2_challans(id),
  bank_transaction_id text NOT NULL UNIQUE, amount numeric(18,2) NOT NULL CHECK(amount>0),
  received_by uuid NOT NULL REFERENCES app_users(id), received_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ptas_private.jurisdiction_contains(p_root uuid,p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE tree AS (SELECT id FROM jurisdictions WHERE id=p_root UNION ALL
 SELECT j.id FROM jurisdictions j JOIN tree t ON j.parent_id=t.id)
 SELECT EXISTS(SELECT 1 FROM tree WHERE id=p_target)
$$;

CREATE OR REPLACE FUNCTION ptas_private.active_actor(p_roles text[] DEFAULT NULL)
RETURNS TABLE(user_id uuid,role_code text,jurisdiction_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id,ur.role_code,ur.jurisdiction_id FROM app_users u JOIN user_roles ur ON ur.user_id=u.id
 WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active AND u.deactivated_at IS NULL
 AND ur.valid_from<=now() AND (ur.valid_to IS NULL OR ur.valid_to>now())
 AND (p_roles IS NULL OR ur.role_code=ANY(p_roles))
$$;

CREATE OR REPLACE FUNCTION public.resolve_my_ptas_actor()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('user_id',a.user_id,'display_name',u.display_name,'role',a.role_code,
 'jurisdiction_id',a.jurisdiction_id,'jurisdiction_name',j.name,'jurisdiction_tier',j.tier)
 FROM ptas_private.active_actor(NULL) a JOIN app_users u ON u.id=a.user_id
 JOIN jurisdictions j ON j.id=a.jurisdiction_id ORDER BY a.role_code LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ptas_private.audit_transition(p_event text,p_type text,p_id uuid,p_actor uuid,p_role text,
 p_jurisdiction uuid,p_correlation text,p_from text,p_to text,p_reason text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO audit_events(id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,correlation_id,payload)
 VALUES(gen_random_uuid(),p_event,p_type,p_id::text,coalesce(p_actor::text,'SYSTEM'),p_role,
 p_jurisdiction::text,p_correlation,jsonb_build_object('previous_state',p_from,'new_state',p_to,'reason',p_reason))
$$;

CREATE OR REPLACE FUNCTION public.transition_survey_unit(p_unit_id uuid,p_action text,p_expected_version bigint,
 p_idempotency_key text,p_correlation_id text,p_reason text DEFAULT NULL)
RETURNS survey_units LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v survey_units; a record; n survey_workflow_state; old survey_workflow_state; av uuid;
BEGIN
 SELECT * INTO v FROM survey_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
 SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR'] END) x
 WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.jurisdiction_id) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
 old:=v.state;
 n:=CASE WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
 WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
 WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
 WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
 WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
 WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' ELSE NULL END;
 IF n IS NULL THEN RAISE EXCEPTION 'invalid survey transition' USING ERRCODE='23514'; END IF;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('SURVEY_UNIT',v.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 IF n='APPROVED' THEN
  IF v.assessment_id IS NULL THEN RAISE EXCEPTION 'approval requires linked assessment' USING ERRCODE='23514'; END IF;
  UPDATE assessments SET status='APPROVED' WHERE id=v.assessment_id AND status IN ('SUBMITTED','RESUBMITTED');
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment is not eligible' USING ERRCODE='23514'; END IF;
  UPDATE assessment_versions SET status='APPROVED',approved_by=a.user_id::text,approved_at=now()
  WHERE assessment_id=v.assessment_id AND version_no=(SELECT current_version_no FROM assessments WHERE id=v.assessment_id)
  AND status IN ('SUBMITTED','RESUBMITTED') RETURNING id INTO av;
  IF av IS NULL THEN RAISE EXCEPTION 'assessment version is not eligible' USING ERRCODE='23514'; END IF;
  INSERT INTO pft3_register_entries(survey_unit_id,assessment_id,assessment_version_id,registered_by) VALUES(v.id,v.assessment_id,av,a.user_id);
 END IF;
 UPDATE survey_units SET state=n,row_version=row_version+1,updated_at=now(),
 submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
 approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
 closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END WHERE id=v.id RETURNING * INTO v;
 PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,a.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.request_demand_deletion(p_demand_unit_id uuid,p_reason text,p_idempotency_key text,p_correlation_id text)
RETURNS demand_deletion_requests LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d demand_units; r demand_deletion_requests; a record; j uuid;
BEGIN
 SELECT * INTO d FROM demand_units WHERE id=p_demand_unit_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active demand not found' USING ERRCODE='P0002'; END IF;
 SELECT current_circle_id INTO j FROM taxpayers WHERE id=d.taxpayer_id;
 SELECT * INTO a FROM ptas_private.active_actor(ARRAY['INSPECTOR']) x WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,j) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='23514'; END IF;
 INSERT INTO demand_deletion_requests(demand_unit_id,jurisdiction_id,requested_by,request_reason) VALUES(d.id,j,a.user_id,p_reason) RETURNING * INTO r;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('DEMAND_DELETION',r.id,'REQUEST','PENDING',p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 PERFORM ptas_private.audit_transition('DEMAND_DELETION_REQUESTED','DEMAND_DELETION',r.id,a.user_id,a.role_code,j,p_correlation_id,NULL,'PENDING',p_reason);
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.review_demand_deletion(p_request_id uuid,p_decision text,p_expected_version bigint,
 p_reason text,p_idempotency_key text,p_correlation_id text)
RETURNS demand_deletion_requests LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r demand_deletion_requests; a record; n deletion_request_state;
BEGIN
 SELECT * INTO r FROM demand_deletion_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO']) x WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,r.jurisdiction_id) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF r.state<>'PENDING' OR r.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or ineligible request' USING ERRCODE='40001'; END IF;
 IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='23514'; END IF;
 n:=CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'RETURN' THEN 'RETURNED' ELSE NULL END;
 IF n IS NULL THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='23514'; END IF;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('DEMAND_DELETION',r.id,p_decision,'PENDING',n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 UPDATE demand_deletion_requests SET state=n,reviewed_by=a.user_id,reviewed_at=now(),review_reason=p_reason,row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 IF n='APPROVED' THEN UPDATE demand_units SET active=false,inactivated_at=now(),inactivated_by=a.user_id,inactivation_request_id=r.id WHERE id=r.demand_unit_id; END IF;
 PERFORM ptas_private.audit_transition('DEMAND_DELETION_'||n::text,'DEMAND_DELETION',r.id,a.user_id,a.role_code,r.jurisdiction_id,p_correlation_id,'PENDING',n::text,p_reason);
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.transition_show_cause(p_case_id uuid,p_action text,p_expected_version bigint,
 p_reason text,p_document_id uuid,p_idempotency_key text,p_correlation_id text)
RETURNS show_cause_cases LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c show_cause_cases; a record; n show_cause_state; req text[]; old show_cause_state;
BEGIN
 SELECT * INTO c FROM show_cause_cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'show cause case not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='SHOW_CAUSE' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
 req:=CASE WHEN p_action IN ('SERVE','RECORD_SERVICE') THEN ARRAY['INSPECTOR'] ELSE ARRAY['ETO'] END;
 SELECT * INTO a FROM ptas_private.active_actor(req) x WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,c.jurisdiction_id) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
 old:=c.state;
 n:=CASE WHEN c.state='CREATED' AND p_action='ISSUE' AND p_document_id IS NOT NULL THEN 'ISSUED'
 WHEN c.state='ISSUED' AND p_action='SERVE' THEN 'SERVED'
 WHEN c.state='SERVED' AND p_action='RECORD_SERVICE' AND p_document_id IS NOT NULL THEN 'SERVICE_RECORDED'
 WHEN c.state='SERVICE_RECORDED' AND p_action='COMPLETE_PROCESS' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PROCESS_COMPLETED'
 WHEN c.state='PROCESS_COMPLETED' AND p_action='IMPOSE_PENALTY' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PENALTY_IMPOSED' ELSE NULL END;
 IF n IS NULL THEN RAISE EXCEPTION 'invalid show-cause transition' USING ERRCODE='23514'; END IF;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('SHOW_CAUSE',c.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 UPDATE show_cause_cases SET state=n,row_version=row_version+1,
 notice_document_id=CASE WHEN n='ISSUED' THEN p_document_id ELSE notice_document_id END,
 service_document_id=CASE WHEN n='SERVICE_RECORDED' THEN p_document_id ELSE service_document_id END,
 issued_at=CASE WHEN n='ISSUED' THEN now() ELSE issued_at END,served_at=CASE WHEN n='SERVED' THEN now() ELSE served_at END,
 service_recorded_at=CASE WHEN n='SERVICE_RECORDED' THEN now() ELSE service_recorded_at END,
 process_completed_at=CASE WHEN n='PROCESS_COMPLETED' THEN now() ELSE process_completed_at END,
 penalty_imposed_at=CASE WHEN n='PENALTY_IMPOSED' THEN now() ELSE penalty_imposed_at END WHERE id=c.id RETURNING * INTO c;
 PERFORM ptas_private.audit_transition('SHOW_CAUSE_TRANSITION','SHOW_CAUSE',c.id,a.user_id,a.role_code,c.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
 RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.transition_pft2_challan(p_challan_id uuid,p_action text,p_expected_version bigint,
 p_reason text,p_idempotency_key text,p_correlation_id text)
RETURNS pft2_challans LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c pft2_challans; a record; n challan_administrative_state; old challan_administrative_state;
BEGIN
 SELECT * INTO c FROM pft2_challans WHERE id=p_challan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'challan not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='PFT2_CHALLAN' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
 SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR']) x WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,c.jurisdiction_id) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
 old:=c.administrative_state;
 n:=CASE WHEN old='PREPARED' AND p_action='ISSUE' THEN 'ISSUED'
 WHEN old='ISSUED' AND p_action='CANCEL' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CANCELLED' ELSE NULL END;
 IF n IS NULL THEN RAISE EXCEPTION 'invalid challan transition' USING ERRCODE='23514'; END IF;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('PFT2_CHALLAN',c.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 UPDATE pft2_challans SET administrative_state=n,row_version=row_version+1,
 issued_at=CASE WHEN n='ISSUED' THEN now() ELSE issued_at END,cancelled_at=CASE WHEN n='CANCELLED' THEN now() ELSE cancelled_at END,
 cancellation_source=CASE WHEN n='CANCELLED' THEN 'MANUAL' ELSE cancellation_source END,
 cancellation_reason=CASE WHEN n='CANCELLED' THEN p_reason ELSE cancellation_reason END WHERE id=c.id RETURNING * INTO c;
 PERFORM ptas_private.audit_transition('PFT2_TRANSITION','PFT2_CHALLAN',c.id,a.user_id,a.role_code,c.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
 RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.receive_pft2_payment(p_challan_id uuid,p_bank_transaction_id text,p_amount numeric,
 p_idempotency_key text,p_correlation_id text)
RETURNS pft2_receipts LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c pft2_challans; r pft2_receipts; a record;
BEGIN
 SELECT * INTO c FROM pft2_challans WHERE id=p_challan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'challan not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='PFT2_CHALLAN' AND idempotency_key=p_idempotency_key) THEN
  SELECT * INTO r FROM pft2_receipts WHERE challan_id=c.id; RETURN r;
 END IF;
 SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','FINANCE','INSPECTOR']) x WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,c.jurisdiction_id) LIMIT 1;
 IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF c.administrative_state='PREPARED' OR c.payment_state<>'OUTSTANDING' THEN RAISE EXCEPTION 'challan not receivable' USING ERRCODE='23514'; END IF;
 INSERT INTO pft2_receipts(challan_id,bank_transaction_id,amount,received_by) VALUES(c.id,p_bank_transaction_id,p_amount,a.user_id) RETURNING * INTO r;
 UPDATE pft2_challans SET payment_state='RECEIVED',row_version=row_version+1 WHERE id=c.id;
 INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,actor_id,actor_role,correlation_id,idempotency_key)
 VALUES('PFT2_CHALLAN',c.id,'RECEIVE','OUTSTANDING','RECEIVED',a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
 PERFORM ptas_private.audit_transition('PFT2_RECEIVED','PFT2_CHALLAN',c.id,a.user_id,a.role_code,c.jurisdiction_id,p_correlation_id,'OUTSTANDING','RECEIVED',NULL);
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ptas_private.cancel_overdue_pft2(p_business_date date DEFAULT (now() AT TIME ZONE 'Asia/Karachi')::date)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
 WITH eligible AS (
  UPDATE pft2_challans SET administrative_state='CANCELLED',cancelled_at=now(),cancellation_source='AUTOMATIC',
  cancellation_reason='Due date plus three-day grace period elapsed',row_version=row_version+1
  WHERE administrative_state='ISSUED' AND payment_state='OUTSTANDING' AND p_business_date>due_date+3
  RETURNING id,jurisdiction_id
 ), actions AS (
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_role,correlation_id,idempotency_key)
  SELECT 'PFT2_CHALLAN',id,'AUTO_CANCEL','ISSUED','CANCELLED','Due date plus three-day grace period elapsed','SYSTEM',
  'cron:pft2-cancel:'||p_business_date,'auto-cancel:'||id FROM eligible RETURNING 1
 ), audits AS (
  INSERT INTO audit_events(id,event_type,aggregate_type,aggregate_id,actor_id,actor_role,jurisdiction_id,correlation_id,payload)
  SELECT gen_random_uuid(),'PFT2_AUTOMATIC_CANCELLATION','PFT2_CHALLAN',id::text,'SYSTEM','SYSTEM',jurisdiction_id::text,
  'cron:pft2-cancel:'||p_business_date,jsonb_build_object('business_date',p_business_date,'timezone','Asia/Karachi') FROM eligible RETURNING 1
 ) SELECT count(*) INTO changed FROM eligible;
 RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION ptas_private.prevent_historical_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is immutable',TG_TABLE_NAME USING ERRCODE='55000'; END $$;
CREATE TRIGGER pft3_no_update_delete BEFORE UPDATE OR DELETE ON pft3_register_entries FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_historical_mutation();
CREATE TRIGGER receipt_no_update_delete BEFORE UPDATE OR DELETE ON pft2_receipts FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_historical_mutation();
CREATE TRIGGER workflow_action_no_update_delete BEFORE UPDATE OR DELETE ON workflow_actions FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_historical_mutation();
CREATE TRIGGER official_document_no_update_delete BEFORE UPDATE OR DELETE ON official_documents FOR EACH ROW EXECUTE FUNCTION ptas_private.prevent_historical_mutation();

DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['app_users','roles','user_roles','workflow_actions','survey_units','pft3_register_entries','official_documents',
 'show_cause_cases','demand_deletion_requests','pft2_challans','pft2_receipts','jurisdictions','taxpayers','taxpayer_identifiers',
 'assessments','assessment_versions','demand_units','demand_ledger','payment_receipts','audit_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon,authenticated',t);
 END LOOP;
END $$;

GRANT SELECT ON jurisdictions,app_users,roles,user_roles,survey_units,pft3_register_entries,official_documents,
 show_cause_cases,demand_deletion_requests,pft2_challans,pft2_receipts,taxpayers,taxpayer_identifiers,
 assessments,assessment_versions,demand_units,demand_ledger,payment_receipts,audit_events TO authenticated;

CREATE POLICY jurisdictions_select ON jurisdictions FOR SELECT TO authenticated USING(true);
CREATE POLICY app_users_self_select ON app_users FOR SELECT TO authenticated USING(auth_user_id=(SELECT auth.uid()));
CREATE POLICY roles_select ON roles FOR SELECT TO authenticated USING(true);
CREATE POLICY user_roles_self_select ON user_roles FOR SELECT TO authenticated USING(user_id IN(SELECT id FROM app_users WHERE auth_user_id=(SELECT auth.uid())));
CREATE POLICY taxpayers_select ON taxpayers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,current_circle_id)));
CREATE POLICY taxpayer_identifiers_select ON taxpayer_identifiers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM taxpayers t WHERE t.id=taxpayer_id));
CREATE POLICY assessments_select ON assessments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM taxpayers t WHERE t.id=taxpayer_id));
CREATE POLICY assessment_versions_select ON assessment_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM assessments a WHERE a.id=assessment_id));
CREATE POLICY demand_units_select ON demand_units FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM taxpayers t WHERE t.id=taxpayer_id));
CREATE POLICY demand_ledger_select ON demand_ledger FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM demand_units d WHERE d.id=demand_unit_id));
CREATE POLICY payment_receipts_select ON payment_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM demand_units d WHERE d.id=demand_unit_id));
CREATE POLICY survey_units_select ON survey_units FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,survey_units.jurisdiction_id)));
CREATE POLICY pft3_select ON pft3_register_entries FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM survey_units s WHERE s.id=survey_unit_id));
CREATE POLICY documents_select ON official_documents FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR','AUDITOR','DIRECTOR'])));
CREATE POLICY show_cause_select ON show_cause_cases FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,show_cause_cases.jurisdiction_id)));
CREATE POLICY deletion_select ON demand_deletion_requests FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,demand_deletion_requests.jurisdiction_id)));
CREATE POLICY challan_select ON pft2_challans FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(NULL) a WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id,pft2_challans.jurisdiction_id)));
CREATE POLICY pft2_receipts_select ON pft2_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM pft2_challans c WHERE c.id=challan_id));
CREATE POLICY audit_select ON audit_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ptas_private.active_actor(ARRAY['AUDITOR','DIRECTOR','ETO']) a WHERE audit_events.jurisdiction_id IS NULL OR ptas_private.jurisdiction_contains(a.jurisdiction_id,audit_events.jurisdiction_id::uuid)));

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ptas_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ptas_private.jurisdiction_contains(uuid,uuid),ptas_private.active_actor(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_my_ptas_actor(),public.transition_survey_unit(uuid,text,bigint,text,text,text),
 public.request_demand_deletion(uuid,text,text,text),public.review_demand_deletion(uuid,text,bigint,text,text,text),
 public.transition_show_cause(uuid,text,bigint,text,uuid,text,text),public.transition_pft2_challan(uuid,text,bigint,text,text,text),
 public.receive_pft2_payment(uuid,text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_my_ptas_actor(),public.transition_survey_unit(uuid,text,bigint,text,text,text),
 public.request_demand_deletion(uuid,text,text,text),public.review_demand_deletion(uuid,text,bigint,text,text,text),
 public.transition_show_cause(uuid,text,bigint,text,uuid,text,text),public.transition_pft2_challan(uuid,text,bigint,text,text,text),
 public.receive_pft2_payment(uuid,text,numeric,text,text) TO authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='ptas-cancel-overdue-pft2') THEN
   PERFORM cron.schedule('ptas-cancel-overdue-pft2','5 19 * * *',
    $job$SELECT ptas_private.cancel_overdue_pft2((now() AT TIME ZONE 'Asia/Karachi')::date)$job$);
  END IF;
 END IF;
END $$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.transition_survey_unit(
  p_unit_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT NULL
)
RETURNS survey_units
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v survey_units;
  a record;
  n survey_workflow_state;
  old survey_workflow_state;
  av uuid;
BEGIN
  SELECT * INTO v FROM survey_units WHERE id=p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey unit not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='SURVEY_UNIT' AND idempotency_key=p_idempotency_key) THEN RETURN v; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(CASE WHEN p_action IN ('APPROVE','RETURN') THEN ARRAY['ETO'] ELSE ARRAY['INSPECTOR'] END) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,v.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  old:=v.state;
  n:=(CASE WHEN v.state='NEW' AND p_action='FEED' THEN 'FEEDED'
    WHEN v.state IN ('NEW','FEEDED') AND p_action='CLOSE' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CLOSED'
    WHEN v.state='FEEDED' AND p_action='SUBMIT' THEN 'SUBMITTED'
    WHEN v.state='RETURNED' AND p_action='RESUBMIT' THEN 'SUBMITTED'
    WHEN v.state='SUBMITTED' AND p_action='RETURN' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'RETURNED'
    WHEN v.state='SUBMITTED' AND p_action='APPROVE' THEN 'APPROVED' ELSE NULL END)::survey_workflow_state;
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
    INSERT INTO pft3_register_entries(survey_unit_id,assessment_id,assessment_version_id,registered_by)
      VALUES(v.id,v.assessment_id,av,a.user_id);
  END IF;
  UPDATE survey_units SET state=n,row_version=row_version+1,updated_at=now(),
    submitted_at=CASE WHEN n='SUBMITTED' THEN now() ELSE submitted_at END,
    approved_at=CASE WHEN n='APPROVED' THEN now() ELSE approved_at END,
    closed_at=CASE WHEN n='CLOSED' THEN now() ELSE closed_at END WHERE id=v.id RETURNING * INTO v;
  PERFORM ptas_private.audit_transition('SURVEY_TRANSITION','SURVEY_UNIT',v.id,a.user_id,a.role_code,a.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION public.review_demand_deletion(
  p_request_id uuid,
  p_decision text,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS demand_deletion_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r demand_deletion_requests;
  a record;
  n deletion_request_state;
BEGIN
  SELECT * INTO r FROM demand_deletion_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO']) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,r.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF r.state<>'PENDING' OR r.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or ineligible request' USING ERRCODE='40001'; END IF;
  IF length(btrim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='23514'; END IF;
  n:=(CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'RETURN' THEN 'RETURNED' ELSE NULL END)::deletion_request_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('DEMAND_DELETION',r.id,p_decision,'PENDING',n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
  UPDATE demand_deletion_requests SET state=n,reviewed_by=a.user_id,reviewed_at=now(),review_reason=p_reason,row_version=row_version+1
    WHERE id=r.id RETURNING * INTO r;
  IF n='APPROVED' THEN
    UPDATE demand_units SET active=false,inactivated_at=now(),inactivated_by=a.user_id,inactivation_request_id=r.id
      WHERE id=r.demand_unit_id;
  END IF;
  PERFORM ptas_private.audit_transition('DEMAND_DELETION_'||n::text,'DEMAND_DELETION',r.id,a.user_id,a.role_code,r.jurisdiction_id,p_correlation_id,'PENDING',n::text,p_reason);
  RETURN r;
END
$$;

CREATE OR REPLACE FUNCTION public.transition_show_cause(
  p_case_id uuid,
  p_action text,
  p_expected_version bigint,
  p_reason text,
  p_document_id uuid,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS show_cause_cases
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c show_cause_cases;
  a record;
  n show_cause_state;
  req text[];
  old show_cause_state;
BEGIN
  SELECT * INTO c FROM show_cause_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'show cause case not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='SHOW_CAUSE' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
  req:=CASE WHEN p_action IN ('SERVE','RECORD_SERVICE') THEN ARRAY['INSPECTOR'] ELSE ARRAY['ETO'] END;
  SELECT * INTO a FROM ptas_private.active_actor(req) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,c.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  old:=c.state;
  n:=(CASE WHEN c.state='CREATED' AND p_action='ISSUE' AND p_document_id IS NOT NULL THEN 'ISSUED'
    WHEN c.state='ISSUED' AND p_action='SERVE' THEN 'SERVED'
    WHEN c.state='SERVED' AND p_action='RECORD_SERVICE' AND p_document_id IS NOT NULL THEN 'SERVICE_RECORDED'
    WHEN c.state='SERVICE_RECORDED' AND p_action='COMPLETE_PROCESS' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PROCESS_COMPLETED'
    WHEN c.state='PROCESS_COMPLETED' AND p_action='IMPOSE_PENALTY' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'PENALTY_IMPOSED'
    ELSE NULL END)::show_cause_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid show-cause transition' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('SHOW_CAUSE',c.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
  UPDATE show_cause_cases SET state=n,row_version=row_version+1,
    notice_document_id=CASE WHEN n='ISSUED' THEN p_document_id ELSE notice_document_id END,
    service_document_id=CASE WHEN n='SERVICE_RECORDED' THEN p_document_id ELSE service_document_id END,
    issued_at=CASE WHEN n='ISSUED' THEN now() ELSE issued_at END,
    served_at=CASE WHEN n='SERVED' THEN now() ELSE served_at END,
    service_recorded_at=CASE WHEN n='SERVICE_RECORDED' THEN now() ELSE service_recorded_at END,
    process_completed_at=CASE WHEN n='PROCESS_COMPLETED' THEN now() ELSE process_completed_at END,
    penalty_imposed_at=CASE WHEN n='PENALTY_IMPOSED' THEN now() ELSE penalty_imposed_at END
    WHERE id=c.id RETURNING * INTO c;
  PERFORM ptas_private.audit_transition('SHOW_CAUSE_TRANSITION','SHOW_CAUSE',c.id,a.user_id,a.role_code,c.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
  RETURN c;
END
$$;

CREATE OR REPLACE FUNCTION public.transition_pft2_challan(
  p_challan_id uuid,
  p_action text,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
RETURNS pft2_challans
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c pft2_challans;
  a record;
  n challan_administrative_state;
  old challan_administrative_state;
BEGIN
  SELECT * INTO c FROM pft2_challans WHERE id=p_challan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challan not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM workflow_actions WHERE aggregate_type='PFT2_CHALLAN' AND idempotency_key=p_idempotency_key) THEN RETURN c; END IF;
  SELECT * INTO a FROM ptas_private.active_actor(ARRAY['ETO','INSPECTOR']) x
    WHERE ptas_private.jurisdiction_contains(x.jurisdiction_id,c.jurisdiction_id) LIMIT 1;
  IF a.user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF c.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale workflow version' USING ERRCODE='40001'; END IF;
  old:=c.administrative_state;
  n:=(CASE WHEN old='PREPARED' AND p_action='ISSUE' THEN 'ISSUED'
    WHEN old='ISSUED' AND p_action='CANCEL' AND length(btrim(coalesce(p_reason,'')))>0 THEN 'CANCELLED'
    ELSE NULL END)::challan_administrative_state;
  IF n IS NULL THEN RAISE EXCEPTION 'invalid challan transition' USING ERRCODE='23514'; END IF;
  INSERT INTO workflow_actions(aggregate_type,aggregate_id,action,from_status,to_status,reason,actor_id,actor_role,correlation_id,idempotency_key)
    VALUES('PFT2_CHALLAN',c.id,p_action,old::text,n::text,p_reason,a.user_id,a.role_code,p_correlation_id,p_idempotency_key);
  UPDATE pft2_challans SET administrative_state=n,row_version=row_version+1,
    issued_at=CASE WHEN n='ISSUED' THEN now() ELSE issued_at END,
    cancelled_at=CASE WHEN n='CANCELLED' THEN now() ELSE cancelled_at END,
    cancellation_source=CASE WHEN n='CANCELLED' THEN 'MANUAL' ELSE cancellation_source END,
    cancellation_reason=CASE WHEN n='CANCELLED' THEN p_reason ELSE cancellation_reason END
    WHERE id=c.id RETURNING * INTO c;
  PERFORM ptas_private.audit_transition('PFT2_TRANSITION','PFT2_CHALLAN',c.id,a.user_id,a.role_code,c.jurisdiction_id,p_correlation_id,old::text,n::text,p_reason);
  RETURN c;
END
$$;

REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text),
  public.review_demand_deletion(uuid,text,bigint,text,text,text),
  public.transition_show_cause(uuid,text,bigint,text,uuid,text,text),
  public.transition_pft2_challan(uuid,text,bigint,text,text,text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text),
  public.review_demand_deletion(uuid,text,bigint,text,text,text),
  public.transition_show_cause(uuid,text,bigint,text,uuid,text,text),
  public.transition_pft2_challan(uuid,text,bigint,text,text,text)
TO authenticated;

COMMIT;

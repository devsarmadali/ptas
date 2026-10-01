-- Transactional integration smoke test for the deployed command layer.
-- Run through an administrative database connection. No rows persist.
BEGIN;

DO $$
DECLARE
  auth_inspector uuid;
  auth_eto uuid;
  inspector_id uuid := gen_random_uuid();
  eto_id uuid := gen_random_uuid();
  circle_id uuid;
  other_circle_id uuid;
  eto_scope_id uuid;
  v_taxpayer_id uuid := gen_random_uuid();
  v_assessment_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_survey_id uuid := gen_random_uuid();
  v_demand_id uuid := gen_random_uuid();
  v_challan_id uuid := gen_random_uuid();
  v_deletion_id uuid;
BEGIN
  SELECT id INTO auth_inspector FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO auth_eto FROM auth.users WHERE id <> auth_inspector ORDER BY created_at LIMIT 1;
  IF auth_inspector IS NULL OR auth_eto IS NULL THEN
    RAISE EXCEPTION 'smoke test requires two existing Auth identities';
  END IF;

  SELECT id INTO circle_id FROM jurisdictions WHERE tier='CIRCLE' ORDER BY code LIMIT 1;
  SELECT id INTO other_circle_id FROM jurisdictions WHERE tier='CIRCLE' AND id<>circle_id ORDER BY code LIMIT 1;
  SELECT CASE WHEN parent.tier='TEHSIL' THEN parent.parent_id ELSE parent.id END
    INTO eto_scope_id
  FROM jurisdictions circle
  JOIN jurisdictions parent ON parent.id=circle.parent_id
  WHERE circle.id=circle_id;
  IF circle_id IS NULL OR eto_scope_id IS NULL THEN
    RAISE EXCEPTION 'smoke test requires a circle under a district or zone';
  END IF;

  INSERT INTO app_users(id,auth_user_id,display_name) VALUES
    (inspector_id,auth_inspector,'Transactional Inspector Test'),
    (eto_id,auth_eto,'Transactional ETO Test');
  INSERT INTO user_roles(user_id,role_code,jurisdiction_id) VALUES
    (inspector_id,'INSPECTOR',circle_id),(eto_id,'ETO',eto_scope_id);

  BEGIN
    INSERT INTO user_roles(user_id,role_code,jurisdiction_id)
      VALUES(inspector_id,'INSPECTOR',eto_scope_id);
    RAISE EXCEPTION 'Inspector district assignment was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO user_roles(user_id,role_code,jurisdiction_id)
      VALUES(inspector_id,'INSPECTOR',other_circle_id);
    RAISE EXCEPTION 'second active Inspector circle was not rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO taxpayers(id,display_name,status,current_circle_id,created_by)
    VALUES(v_taxpayer_id,'Transactional Test Taxpayer','ACTIVE',circle_id,inspector_id::text);
  INSERT INTO assessments(id,taxpayer_id,financial_year_id,status,current_version_no,created_by)
    VALUES(v_assessment_id,v_taxpayer_id,'SMOKE-FY','SUBMITTED',1,inspector_id::text);
  INSERT INTO assessment_versions(id,assessment_id,version_no,snapshot,status,created_by)
    VALUES(v_version_id,v_assessment_id,1,'{}','SUBMITTED',inspector_id::text);
  INSERT INTO survey_units(id,taxpayer_id,financial_year_id,assessment_id,jurisdiction_id,responsible_inspector_id,source)
    VALUES(v_survey_id,v_taxpayer_id,'SMOKE-FY',v_assessment_id,circle_id,inspector_id,'CSV_IMPORT');

  PERFORM set_config('request.jwt.claim.sub',auth_inspector::text,true);
  PERFORM transition_survey_unit(v_survey_id,'FEED',1,'smoke-feed','smoke-survey',NULL);
  PERFORM transition_survey_unit(v_survey_id,'SUBMIT',2,'smoke-submit','smoke-survey',NULL);

  PERFORM set_config('request.jwt.claim.sub',auth_eto::text,true);
  PERFORM transition_survey_unit(v_survey_id,'APPROVE',3,'smoke-approve','smoke-survey',NULL);
  PERFORM transition_survey_unit(v_survey_id,'APPROVE',4,'smoke-approve','smoke-survey',NULL);
  IF (SELECT count(*) FROM pft3_register_entries p WHERE p.survey_unit_id=v_survey_id) <> 1 THEN
    RAISE EXCEPTION 'approval did not create exactly one PFT3 entry';
  END IF;

  INSERT INTO demand_units(id,taxpayer_id,permanent_demand_no)
    VALUES(v_demand_id,v_taxpayer_id,'SMOKE-DEMAND');
  INSERT INTO pft2_challans(id,demand_unit_id,financial_year_id,jurisdiction_id,challan_number,
    administrative_state,due_date)
    VALUES(v_challan_id,v_demand_id,'SMOKE-FY',circle_id,'SMOKE-CHALLAN','ISSUED',current_date-10);
  PERFORM ptas_private.cancel_overdue_pft2(current_date);
  IF (SELECT c.administrative_state FROM pft2_challans c WHERE c.id=v_challan_id) <> 'CANCELLED' THEN
    RAISE EXCEPTION 'automatic cancellation failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',auth_inspector::text,true);
  PERFORM receive_pft2_payment(v_challan_id,'SMOKE-BANK-TXN',100,'smoke-receipt','smoke-payment');
  PERFORM receive_pft2_payment(v_challan_id,'SMOKE-BANK-TXN',100,'smoke-receipt','smoke-payment');
  IF (SELECT count(*) FROM pft2_receipts r WHERE r.challan_id=v_challan_id) <> 1 THEN
    RAISE EXCEPTION 'cancelled challan receipt was not idempotent';
  END IF;

  SELECT id INTO v_deletion_id FROM request_demand_deletion(v_demand_id,'Smoke deletion reason','smoke-delete-request','smoke-deletion');
  PERFORM set_config('request.jwt.claim.sub',auth_eto::text,true);
  PERFORM review_demand_deletion(v_deletion_id,'APPROVE',1,'Smoke ETO approval','smoke-delete-approve','smoke-deletion');
  IF (SELECT d.active FROM demand_units d WHERE d.id=v_demand_id) THEN
    RAISE EXCEPTION 'approved deletion request did not inactivate demand';
  END IF;
END
$$;

ROLLBACK;

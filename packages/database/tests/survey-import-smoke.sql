BEGIN;

DO $$
DECLARE
  v_auth uuid;
  v_user uuid;
  v_circle uuid;
  v_batch survey_import_batches;
  v_errors jsonb;
BEGIN
  SELECT id INTO v_auth FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'smoke test requires one auth user'; END IF;
  SELECT id INTO v_circle FROM jurisdictions WHERE tier='CIRCLE' ORDER BY code LIMIT 1;
  IF v_circle IS NULL THEN RAISE EXCEPTION 'smoke test requires one Circle'; END IF;

  INSERT INTO app_users(auth_user_id,display_name) VALUES(v_auth,'Rollback-only survey import smoke actor')
  ON CONFLICT(auth_user_id) DO UPDATE SET active=true,deactivated_at=NULL RETURNING id INTO v_user;
  INSERT INTO user_roles(user_id,role_code,jurisdiction_id) VALUES(v_user,'INSPECTOR',v_circle)
  ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);

  INSERT INTO survey_classification_rules(financial_year_code,tax_class,tax_assessment_option,tax_subclass,
    assessment_rate,primary_class_code,schedule_subclass_code,rate_basis,statutory_rule_id,effective_from,
    effective_to,status,approval_identifier,approving_authority,approved_on,source_document_sha256)
  VALUES('2026-2027','__SMOKE_CLASS__','__SMOKE_OPTION__','__SMOKE_SUBCLASS__',1,'S','S(i)','per annum',
    '__SMOKE_RULE__','2026-07-01','2027-06-30','ACTIVE','SMOKE-ROLLBACK','Smoke Test','2026-06-01',repeat('0',64));

  SELECT * INTO v_batch FROM stage_survey_import_current(
    'smoke.csv',repeat('1',64),
    '["Survey No. (Auto)","Division","Region","District","Zone","Tehsil","Circle","Locality","Commercial Address","Legal Name / Entity Name","Taxpayer Name / Proprietor","Identifier Type","Identifier Value","Phone","Email","Tax Class (Select)","Tax Assessment Option (Select)","Tax Sub-Class (Auto)","Statutory Assessment Rate (PKR) (Auto)","Primary Class Code (Auto)","Schedule Sub-Class Code (Auto)","Rate Basis (Auto)","Statutory Rule ID (Auto)","Financial Year (Auto)","Survey Date (Auto)","Taxpayer Status","Legacy Demand No","Arrears","Remarks","Import Status (Auto)"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'division',(SELECT name FROM jurisdictions WHERE id IN (WITH RECURSIVE a AS (SELECT id,parent_id,tier FROM jurisdictions WHERE id=v_circle UNION ALL SELECT j.id,j.parent_id,j.tier FROM jurisdictions j JOIN a ON a.parent_id=j.id) SELECT id FROM a WHERE tier IN ('DIVISION','REGION') LIMIT 1)),
      'region',(SELECT name FROM jurisdictions WHERE id IN (WITH RECURSIVE a AS (SELECT id,parent_id,tier FROM jurisdictions WHERE id=v_circle UNION ALL SELECT j.id,j.parent_id,j.tier FROM jurisdictions j JOIN a ON a.parent_id=j.id) SELECT id FROM a WHERE tier IN ('DIVISION','REGION') LIMIT 1)),
      'district',(SELECT name FROM jurisdictions WHERE id IN (WITH RECURSIVE a AS (SELECT id,parent_id,tier FROM jurisdictions WHERE id=v_circle UNION ALL SELECT j.id,j.parent_id,j.tier FROM jurisdictions j JOIN a ON a.parent_id=j.id) SELECT id FROM a WHERE tier IN ('DISTRICT','ZONE') LIMIT 1)),
      'zone',(SELECT name FROM jurisdictions WHERE id IN (WITH RECURSIVE a AS (SELECT id,parent_id,tier FROM jurisdictions WHERE id=v_circle UNION ALL SELECT j.id,j.parent_id,j.tier FROM jurisdictions j JOIN a ON a.parent_id=j.id) SELECT id FROM a WHERE tier IN ('DISTRICT','ZONE') LIMIT 1)),
      'circle',(SELECT name FROM jurisdictions WHERE id=v_circle),'commercial_address','Smoke Address',
      'legal_name','Smoke Entity','tax_class','__SMOKE_CLASS__','tax_assessment_option','__SMOKE_OPTION__',
      'tax_subclass','__SMOKE_SUBCLASS__','assessment_rate','1','primary_class_code','S',
      'schedule_subclass_code','S(i)','rate_basis','per annum','statutory_rule_id','__SMOKE_RULE__',
      'financial_year','','taxpayer_status','Active','arrears','0'
    )),'smoke-stage-survey-import','smoke-survey-import'
  );
  IF v_batch.status<>'VALIDATED' THEN
    SELECT validation_errors INTO v_errors FROM survey_import_rows WHERE batch_id=v_batch.id ORDER BY row_number LIMIT 1;
    RAISE EXCEPTION 'expected VALIDATED, got %, errors %',v_batch.status,v_errors;
  END IF;
  SELECT * INTO v_batch FROM promote_survey_import(v_batch.id,'smoke-promote-survey-import','smoke-survey-import');
  IF v_batch.status<>'IMPORTED' THEN RAISE EXCEPTION 'expected IMPORTED, got %',v_batch.status; END IF;
  IF NOT EXISTS(SELECT 1 FROM survey_import_rows r JOIN survey_units s ON s.id=r.promoted_survey_unit_id
    WHERE r.batch_id=v_batch.id AND r.status='IMPORTED' AND s.state='FEEDED') THEN
    RAISE EXCEPTION 'promoted survey unit was not created in FEEDED state';
  END IF;
  IF EXISTS(SELECT 1 FROM survey_import_rows r JOIN pft3_register_entries p ON p.survey_unit_id=r.promoted_survey_unit_id WHERE r.batch_id=v_batch.id) THEN
    RAISE EXCEPTION 'import must not create a PFT-3 register entry';
  END IF;
END $$;

ROLLBACK;

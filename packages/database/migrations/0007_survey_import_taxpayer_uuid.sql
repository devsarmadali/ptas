BEGIN;

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef('public.promote_survey_import(uuid,text,text)'::regprocedure)
  INTO v_definition;
  v_corrected := replace(
    replace(
      v_definition,
      'INSERT INTO taxpayers(display_name,status,current_circle_id,created_by)',
      'INSERT INTO taxpayers(id,display_name,status,current_circle_id,created_by)'
    ),
    'VALUES(v_row.legal_name,''DRAFT'',v_batch.jurisdiction_id,v_actor.user_id::text)',
    'VALUES(gen_random_uuid(),v_row.legal_name,''DRAFT'',v_batch.jurisdiction_id,v_actor.user_id::text)'
  );
  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'promote_survey_import taxpayer insert target was not found';
  END IF;
  EXECUTE v_corrected;
END $$;

COMMIT;

BEGIN;

-- The ETO-scope replacement of promote_survey_import must retain the taxpayer
-- UUID generation introduced by the original import hardening migration.
DO $$
DECLARE
  v_definition text;
  v_repaired text;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_survey_import(uuid,text,text)'::regprocedure
  ) INTO v_definition;

  v_repaired := replace(
    v_definition,
    'INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)',
    'INSERT INTO public.taxpayers(id,display_name,status,current_circle_id,created_by)'
  );
  v_repaired := replace(
    v_repaired,
    'VALUES(v_row.legal_name,''DRAFT'',v_row.resolved_jurisdiction_id,v_actor.user_id::text)',
    'VALUES(gen_random_uuid(),v_row.legal_name,''DRAFT'',v_row.resolved_jurisdiction_id,v_actor.user_id::text)'
  );

  IF v_repaired = v_definition
     OR v_repaired LIKE '%INSERT INTO public.taxpayers(display_name,status,current_circle_id,created_by)%'
     OR v_repaired LIKE '%VALUES(v_row.legal_name,''DRAFT'',v_row.resolved_jurisdiction_id,v_actor.user_id::text)%' THEN
    RAISE EXCEPTION 'survey import taxpayer UUID targets were not fully repaired';
  END IF;

  EXECUTE v_repaired;
END
$$;

COMMIT;

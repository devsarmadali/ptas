BEGIN;

-- The ETO-scope migration replaces both survey staging functions. PostgreSQL
-- resolves the CASE arms as text unless the result is explicitly cast back to
-- the survey_import_batch_state enum. Repair both deployed definitions without
-- editing any migration that may already be present in a shared environment.
DO $$
DECLARE
  v_signature text;
  v_definition text;
  v_repaired text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.stage_survey_import(text,text,text,jsonb,jsonb,text,text)',
    'public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)'
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
    v_repaired := regexp_replace(
      v_definition,
      'status\s*=\s*CASE\s+WHEN\s+v_invalid\s*=\s*0\s+THEN\s+''VALIDATED''\s+ELSE\s+''NEEDS_CORRECTION''\s+END',
      'status=(CASE WHEN v_invalid=0 THEN ''VALIDATED'' ELSE ''NEEDS_CORRECTION'' END)::survey_import_batch_state',
      'gi'
    );
    IF v_repaired = v_definition THEN
      RAISE EXCEPTION 'survey import enum assignment target was not found in %',v_signature;
    END IF;
    EXECUTE v_repaired;
  END LOOP;
END
$$;

COMMIT;

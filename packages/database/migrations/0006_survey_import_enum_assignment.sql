BEGIN;

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef(
    'public.stage_survey_import(text,text,text,jsonb,jsonb,text,text)'::regprocedure
  ) INTO v_definition;

  v_corrected := replace(
    v_definition,
    'status=CASE WHEN v_invalid=0 THEN ''VALIDATED'' ELSE ''NEEDS_CORRECTION'' END,validated_at=now()',
    'status=(CASE WHEN v_invalid=0 THEN ''VALIDATED'' ELSE ''NEEDS_CORRECTION'' END)::survey_import_batch_state,validated_at=now()'
  );

  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'stage_survey_import enum assignment target was not found';
  END IF;

  EXECUTE v_corrected;
END $$;

COMMIT;

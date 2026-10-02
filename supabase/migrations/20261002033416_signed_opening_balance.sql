BEGIN;

-- A brought-forward amount is a signed taxpayer balance: positive means tax
-- remains payable and negative means an excess payment/credit to adjust in a
-- later assessment. Preserve the source amount exactly.
ALTER TABLE public.survey_import_rows
  DROP CONSTRAINT survey_import_rows_arrears_check;

ALTER TABLE public.survey_unit_profiles
  DROP CONSTRAINT survey_unit_profiles_opening_arrears_check;

DO $$
DECLARE
  v_definition text;
  v_repaired text;
BEGIN
  SELECT pg_get_functiondef(
    'public.stage_survey_import(text,text,text,jsonb,jsonb,text,text)'::regprocedure
  ) INTO v_definition;

  v_repaired := replace(
    v_definition,
    'ptas_private.survey_import_text(v_item.row_data,''arrears'') !~ ''^[0-9]+([.][0-9]{1,2})?$''',
    'ptas_private.survey_import_text(v_item.row_data,''arrears'') !~ ''^-?[0-9]+([.][0-9]{1,2})?$'''
  );
  v_repaired := replace(
    v_repaired,
    '''"Arrears must be a non-negative number"''::jsonb',
    '''"Arrears must be a signed amount with at most two decimal places"''::jsonb'
  );
  v_repaired := replace(
    v_repaired,
    'ptas_private.survey_import_text(v_item.row_data,''arrears'') ~ ''^[0-9]+([.][0-9]{1,2})?$''',
    'ptas_private.survey_import_text(v_item.row_data,''arrears'') ~ ''^-?[0-9]+([.][0-9]{1,2})?$'''
  );

  IF v_repaired = v_definition
     OR v_repaired ~ 'survey_import_text\(v_item\.row_data,''arrears''\) !~ ''\^\[0-9\]'
     OR v_repaired ~ 'survey_import_text\(v_item\.row_data,''arrears''\) ~ ''\^\[0-9\]'
     OR v_repaired LIKE '%Arrears must be a non-negative number%' THEN
    RAISE EXCEPTION 'signed opening-balance validation targets were not fully repaired';
  END IF;

  EXECUTE v_repaired;
END
$$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION ptas_private.same_controlled_label(
  p_left text,
  p_right text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog,pg_temp
AS $$
  SELECT regexp_replace(
           regexp_replace(lower(btrim(p_left)),'[^[:alnum:]]+',' ','g'),
           '\s+',' ','g'
         )
       = regexp_replace(
           regexp_replace(lower(btrim(p_right)),'[^[:alnum:]]+',' ','g'),
           '\s+',' ','g'
         )
$$;

REVOKE ALL ON FUNCTION ptas_private.same_controlled_label(text,text)
FROM PUBLIC,anon,authenticated;

-- The approved source spreadsheet and the immutable rate pack contain the
-- same controlled English labels, but a legacy CSV decoding step replaced
-- some em dashes in the stored rate pack. Compare descriptive labels after
-- punctuation/whitespace normalization; amounts, codes, active dates and the
-- server-resolved immutable rule remain exact and authoritative.
DO $$
DECLARE
  v_definition text;
  v_repaired text;
BEGIN
  SELECT pg_get_functiondef(
    'public.stage_survey_import(text,text,text,jsonb,jsonb,text,text)'::regprocedure
  ) INTO v_definition;

  v_repaired := regexp_replace(
    v_definition,
    'r\.tax_class\s*=\s*ptas_private\.survey_import_text\(v_item\.row_data,\s*''tax_class''(?:::text)?\)',
    'ptas_private.same_controlled_label(r.tax_class,ptas_private.survey_import_text(v_item.row_data,''tax_class''))',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'r\.tax_assessment_option\s*=\s*ptas_private\.survey_import_text\(v_item\.row_data,\s*''tax_assessment_option''(?:::text)?\)',
    'ptas_private.same_controlled_label(r.tax_assessment_option,ptas_private.survey_import_text(v_item.row_data,''tax_assessment_option''))',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''tax_subclass''(?:::text)?\)\s+IS DISTINCT FROM\s+v_rule\.tax_subclass',
    'NOT ptas_private.same_controlled_label(ptas_private.survey_import_text(v_item.row_data,''tax_subclass''),v_rule.tax_subclass)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''rate_basis''(?:::text)?\)\s+IS DISTINCT FROM\s+v_rule\.rate_basis',
    'NOT ptas_private.same_controlled_label(ptas_private.survey_import_text(v_item.row_data,''rate_basis''),v_rule.rate_basis)',
    'gi'
  );

  IF v_repaired = v_definition
     OR v_repaired ~* 'r\.tax_class\s*=\s*ptas_private\.survey_import_text'
     OR v_repaired ~* 'r\.tax_assessment_option\s*=\s*ptas_private\.survey_import_text'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''tax_subclass''.*IS DISTINCT FROM\s+v_rule\.tax_subclass'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''rate_basis''.*IS DISTINCT FROM\s+v_rule\.rate_basis' THEN
    RAISE EXCEPTION 'survey import controlled-label normalization targets were not fully repaired';
  END IF;

  EXECUTE v_repaired;
END
$$;

-- Imported financial year and statutory configuration year are intentionally
-- different concepts. Approval must require the linked immutable rule to be
-- active on the Pakistan business date, not require its source year to equal
-- the newly digitized assessment year.
DO $$
DECLARE
  v_definition text;
  v_repaired text;
BEGIN
  SELECT pg_get_functiondef(
    'public.bulk_approve_survey_import(uuid,text,text,text)'::regprocedure
  ) INTO v_definition;

  v_repaired := regexp_replace(
    v_definition,
    'AND\s+financial_year_code\s*=\s*v_unit\.financial_year_id',
    'AND (now() AT TIME ZONE ''Asia/Karachi'')::date BETWEEN effective_from AND coalesce(effective_to,''infinity''::date)',
    'gi'
  );

  IF v_repaired = v_definition
     OR v_repaired ~* 'financial_year_code\s*=\s*v_unit\.financial_year_id' THEN
    RAISE EXCEPTION 'bulk approval statutory effective-date target was not repaired';
  END IF;

  EXECUTE v_repaired;
END
$$;

COMMIT;

BEGIN;

-- Jurisdiction type is already carried by the tier column. Keep the canonical
-- display name concise instead of repeating the type in every value.
UPDATE public.jurisdictions
SET name = regexp_replace(
  btrim(name),
  '\s+(Division|Region|District|Zone|Tehsil)$',
  '',
  'i'
)
WHERE tier IN ('DIVISION','REGION','DISTRICT','ZONE','TEHSIL')
  AND name ~* '\s+(Division|Region|District|Zone|Tehsil)$';

CREATE OR REPLACE FUNCTION ptas_private.same_jurisdiction_label(
  p_supplied text,
  p_stored text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog,pg_temp
AS $$
  SELECT regexp_replace(lower(btrim(p_supplied)),'\s+(division|region|district|zone|tehsil)$','','i')
       = regexp_replace(lower(btrim(p_stored)),'\s+(division|region|district|zone|tehsil)$','','i')
$$;

REVOKE ALL ON FUNCTION ptas_private.same_jurisdiction_label(text,text) FROM PUBLIC,anon,authenticated;

-- The approved workbook and organization master use concise administrative
-- names (for example "Multan" and "Vehari"). The compatibility comparison also
-- accepts legacy files that included a tier suffix. Authorization still resolves
-- from the server-side hierarchy and UUID containment; only label comparison is
-- normalized. Auto-generated statutory text is non-authoritative: class and
-- assessment option resolve the immutable active database rule.
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
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''division''(?:::text)?\)\s+IS DISTINCT FROM\s+v_root_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''division''),v_root_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''region''(?:::text)?\)\s+IS DISTINCT FROM\s+v_root_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''region''),v_root_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''district''(?:::text)?\)\s+IS DISTINCT FROM\s+v_branch_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''district''),v_branch_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''zone''(?:::text)?\)\s+IS DISTINCT FROM\s+v_branch_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''zone''),v_branch_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''circle''(?:::text)?\)\s+IS DISTINCT FROM\s+v_circle_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''circle''),v_circle_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''tehsil''(?:::text)?\)\s+IS DISTINCT FROM\s+v_row_tehsil_name',
    'NOT ptas_private.same_jurisdiction_label(ptas_private.survey_import_text(v_item.row_data,''tehsil''),v_row_tehsil_name)',
    'gi'
  );
  v_repaired := regexp_replace(
    v_repaired,
    'ptas_private\.survey_import_text\(v_item\.row_data,\s*''statutory_rule_id''(?:::text)?\)\s+IS DISTINCT FROM\s+v_rule\.statutory_rule_id',
    'false',
    'gi'
  );

  IF v_repaired = v_definition
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''(division|region)''.*IS DISTINCT FROM\s+v_root_name'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''(district|zone)''.*IS DISTINCT FROM\s+v_branch_name'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''circle''.*IS DISTINCT FROM\s+v_circle_name'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''tehsil''.*IS DISTINCT FROM\s+v_row_tehsil_name'
     OR v_repaired ~* 'survey_import_text\(v_item\.row_data,\s*''statutory_rule_id''.*IS DISTINCT FROM\s+v_rule\.statutory_rule_id' THEN
    RAISE EXCEPTION 'survey import label normalization targets were not fully repaired';
  END IF;

  EXECUTE v_repaired;
END
$$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.stage_survey_import_current(
  p_source_filename text,
  p_file_sha256 text,
  p_headers jsonb,
  p_rows jsonb,
  p_idempotency_key text,
  p_correlation_id text
) RETURNS survey_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,ptas_private,pg_temp AS $$
DECLARE
  v_business_date date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_financial_year_code text;
  v_financial_year_count integer;
  v_rows jsonb;
BEGIN
  SELECT min(financial_year_code),count(DISTINCT financial_year_code)
  INTO v_financial_year_code,v_financial_year_count
  FROM survey_classification_rules
  WHERE status='ACTIVE' AND v_business_date BETWEEN effective_from AND coalesce(effective_to,'infinity'::date);
  IF v_financial_year_count<>1 THEN
    RAISE EXCEPTION 'exactly one active approved survey financial year must be configured' USING ERRCODE='23514';
  END IF;
  SELECT jsonb_agg(value || jsonb_build_object(
    'financial_year',coalesce(nullif(btrim(value->>'financial_year'),''),v_financial_year_code)
  ) ORDER BY ordinality)
  INTO v_rows FROM jsonb_array_elements(p_rows) WITH ORDINALITY;
  RETURN public.stage_survey_import(p_source_filename,p_file_sha256,v_financial_year_code,p_headers,v_rows,
    p_idempotency_key,p_correlation_id);
END $$;

REVOKE ALL ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_survey_import_current(text,text,jsonb,jsonb,text,text) TO authenticated;

COMMIT;

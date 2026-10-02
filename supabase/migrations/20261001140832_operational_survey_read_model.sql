BEGIN;

-- Server-authoritative operational read model for Survey and Assessment Queue.
-- It deliberately returns no rows when the authenticated identity has no active
-- PTAS role assignment and never falls back to browser or seed data.
CREATE OR REPLACE FUNCTION public.list_operational_survey_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public,ptas_private,pg_temp
AS $$
  WITH actor AS (
    SELECT *
    FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN'])
    LIMIT 1
  ),
  visible_units AS (
    SELECT u.*
    FROM actor a
    JOIN public.survey_units u
      ON ptas_private.jurisdiction_contains(a.jurisdiction_id,u.jurisdiction_id)
    WHERE a.role_code <> 'INSPECTOR'
       OR u.responsible_inspector_id = a.user_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',u.id,
        'taxpayer_id',u.taxpayer_id,
        'financial_year_id',u.financial_year_id,
        'assessment_id',u.assessment_id,
        'jurisdiction_id',u.jurisdiction_id,
        'responsible_inspector_id',u.responsible_inspector_id,
        'source',u.source,
        'state',u.state,
        'row_version',u.row_version,
        'created_at',u.created_at,
        'updated_at',u.updated_at,
        'submitted_at',u.submitted_at,
        'approved_at',u.approved_at,
        'closed_at',u.closed_at,
        'taxpayer',jsonb_build_object(
          'display_name',t.display_name,
          'status',t.status,
          'permanent_demand_no',t.permanent_demand_no
        ),
        'identifier',CASE WHEN ident.id IS NULL THEN NULL ELSE jsonb_build_object(
          'type',ident.identifier_type,
          'value',ident.normalized_value,
          'masked_value',ident.masked_value
        ) END,
        'profile',jsonb_build_object(
          'survey_no',p.survey_no,
          'survey_date',p.survey_date,
          'locality',p.locality,
          'commercial_address',p.commercial_address,
          'legal_name',p.legal_name,
          'taxpayer_name',p.taxpayer_name,
          'phone',p.phone,
          'email',p.email,
          'classification_status',p.classification_status,
          'taxpayer_status',p.taxpayer_status,
          'legacy_demand_no',p.legacy_demand_no,
          'opening_arrears',p.opening_arrears,
          'remarks',p.remarks
        ),
        'classification',CASE WHEN rule.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',rule.id,
          'financial_year_code',rule.financial_year_code,
          'tax_class',rule.tax_class,
          'tax_assessment_option',rule.tax_assessment_option,
          'tax_subclass',rule.tax_subclass,
          'assessment_rate',rule.assessment_rate,
          'primary_class_code',rule.primary_class_code,
          'schedule_subclass_code',rule.schedule_subclass_code,
          'rate_basis',rule.rate_basis,
          'statutory_rule_id',rule.statutory_rule_id,
          'approval_identifier',rule.approval_identifier,
          'approving_authority',rule.approving_authority,
          'approved_on',rule.approved_on
        ) END,
        'assessment',CASE WHEN asm.id IS NULL THEN NULL ELSE to_jsonb(asm) END,
        'assessment_version',CASE WHEN av.id IS NULL THEN NULL ELSE to_jsonb(av) END,
        'demand_unit',CASE WHEN du.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',du.id,
          'permanent_demand_no',du.permanent_demand_no,
          'created_at',du.created_at
        ) END,
        'ledger_entries',coalesce(ledger.entries,'[]'::jsonb),
        'pft3_registered',pft3.id IS NOT NULL
      )
      ORDER BY u.created_at DESC,u.id
    ),
    '[]'::jsonb
  )
  FROM visible_units u
  JOIN public.taxpayers t ON t.id=u.taxpayer_id
  JOIN public.survey_unit_profiles p ON p.survey_unit_id=u.id
  LEFT JOIN public.survey_classification_rules rule ON rule.id=p.classification_rule_id
  LEFT JOIN LATERAL (
    SELECT i.*
    FROM public.taxpayer_identifiers i
    WHERE i.taxpayer_id=u.taxpayer_id
      AND i.valid_to IS NULL
    ORDER BY i.is_primary DESC,i.valid_from DESC
    LIMIT 1
  ) ident ON true
  LEFT JOIN public.assessments asm ON asm.id=u.assessment_id
  LEFT JOIN LATERAL (
    SELECT v.*
    FROM public.assessment_versions v
    WHERE v.assessment_id=asm.id
    ORDER BY v.version_no DESC
    LIMIT 1
  ) av ON true
  LEFT JOIN LATERAL (
    SELECT d.*
    FROM public.demand_units d
    WHERE d.taxpayer_id=u.taxpayer_id
    ORDER BY d.created_at DESC
    LIMIT 1
  ) du ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(to_jsonb(l) ORDER BY l.posted_at,l.id) AS entries
    FROM public.demand_ledger l
    WHERE l.demand_unit_id=du.id
  ) ledger ON true
  LEFT JOIN public.pft3_register_entries pft3 ON pft3.survey_unit_id=u.id
$$;

REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated;

COMMIT;

BEGIN;

-- Permanent, role-separated bulk commands for imported survey batches.
-- Submission remains an Inspector action. Approval remains an ETO action.
CREATE OR REPLACE FUNCTION public.bulk_submit_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT 'Bulk submission of imported survey units'
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public,ptas_private,pg_temp
AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_unit public.survey_units;
  v_profile public.survey_unit_profiles;
  v_assessment public.assessments;
  v_submitted integer := 0;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,'')))=0
     OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['INSPECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active Inspector may bulk-submit imported units'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.survey_import_batches
  WHERE id=p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002';
  END IF;
  IF v_batch.status<>'IMPORTED' THEN
    RAISE EXCEPTION 'only an imported survey batch may be submitted' USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'batch_id',v_batch.id,
      'submitted_rows',(
        SELECT count(*) FROM public.survey_import_rows r
        JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
        WHERE r.batch_id=v_batch.id
          AND u.responsible_inspector_id=v_actor.user_id
          AND u.state IN ('SUBMITTED','APPROVED')
      ),
      'idempotent_replay',true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.survey_import_rows r
    JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
    WHERE r.batch_id=v_batch.id
      AND u.responsible_inspector_id=v_actor.user_id
      AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,u.jurisdiction_id)
      AND u.state='FEEDED'
  ) THEN
    RAISE EXCEPTION 'imported batch has no Feeded units assigned to this Inspector'
      USING ERRCODE='23514';
  END IF;

  FOR v_unit IN
    SELECT u.*
    FROM public.survey_import_rows r
    JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
    WHERE r.batch_id=v_batch.id
      AND u.responsible_inspector_id=v_actor.user_id
      AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,u.jurisdiction_id)
      AND u.state='FEEDED'
    ORDER BY u.id
    FOR UPDATE OF u
  LOOP
    IF v_unit.state<>'FEEDED' THEN
      RAISE EXCEPTION 'every unit must be Feeded before bulk submission'
        USING ERRCODE='23514';
    END IF;

    SELECT * INTO v_profile
    FROM public.survey_unit_profiles
    WHERE survey_unit_id=v_unit.id;
    IF v_profile.survey_unit_id IS NULL THEN
      RAISE EXCEPTION 'survey profile is missing for imported unit' USING ERRCODE='23514';
    END IF;

    SELECT * INTO v_assessment
    FROM public.assessments
    WHERE taxpayer_id=v_unit.taxpayer_id
      AND financial_year_id=v_unit.financial_year_id
    FOR UPDATE;

    IF v_assessment.id IS NULL THEN
      INSERT INTO public.assessments(
        taxpayer_id,financial_year_id,status,current_version_no,created_by
      ) VALUES(
        v_unit.taxpayer_id,v_unit.financial_year_id,'DRAFT',1,v_actor.user_id::text
      )
      RETURNING * INTO v_assessment;
    ELSIF v_assessment.status<>'DRAFT' THEN
      RAISE EXCEPTION 'existing assessment is not eligible for initial submission'
        USING ERRCODE='23514';
    END IF;

    IF v_unit.assessment_id IS NOT NULL AND v_unit.assessment_id<>v_assessment.id THEN
      RAISE EXCEPTION 'survey unit is linked to a different assessment' USING ERRCODE='23514';
    END IF;

    INSERT INTO public.assessment_versions(
      assessment_id,version_no,snapshot,status,reason,created_by
    ) VALUES(
      v_assessment.id,v_assessment.current_version_no,
      jsonb_build_object(
        'survey_unit_id',v_unit.id,
        'survey_profile_id',v_profile.survey_unit_id,
        'financial_year_code',v_unit.financial_year_id,
        'classification_status',v_profile.classification_status,
        'classification_rule_id',v_profile.classification_rule_id,
        'legal_name',v_profile.legal_name,
        'taxpayer_name',v_profile.taxpayer_name,
        'commercial_address',v_profile.commercial_address,
        'legacy_demand_no',v_profile.legacy_demand_no,
        'opening_arrears',v_profile.opening_arrears,
        'remarks',v_profile.remarks
      ),
      'SUBMITTED',p_reason,v_actor.user_id::text
    )
    ON CONFLICT (assessment_id,version_no) DO UPDATE
    SET snapshot=EXCLUDED.snapshot,
        status='SUBMITTED',
        reason=EXCLUDED.reason
    WHERE public.assessment_versions.status='DRAFT';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'assessment version is not eligible for initial submission'
        USING ERRCODE='23514';
    END IF;

    UPDATE public.assessments
    SET status='SUBMITTED'
    WHERE id=v_assessment.id AND status='DRAFT';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'assessment changed during bulk submission' USING ERRCODE='40001';
    END IF;

    UPDATE public.survey_units
    SET assessment_id=v_assessment.id
    WHERE id=v_unit.id AND (assessment_id IS NULL OR assessment_id=v_assessment.id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'survey assessment link changed during bulk submission'
        USING ERRCODE='40001';
    END IF;

    PERFORM public.transition_survey_unit(
      v_unit.id,'SUBMIT',v_unit.row_version,
      p_idempotency_key||':'||v_unit.id::text,
      p_correlation_id,p_reason
    );
    v_submitted:=v_submitted+1;
  END LOOP;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES(
    'SURVEY_IMPORT',v_batch.id,'BULK_SUBMIT','IMPORTED','SUBMITTED',p_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_BULK_SUBMITTED','SURVEY_IMPORT',v_batch.id,
    v_actor.user_id,v_actor.role_code,v_actor.jurisdiction_id,
    p_correlation_id,'IMPORTED','SUBMITTED',
    format('%s imported unit(s) submitted for ETO review',v_submitted)
  );

  RETURN jsonb_build_object(
    'batch_id',v_batch.id,
    'submitted_rows',v_submitted,
    'idempotent_replay',false
  );
END
$$;

CREATE OR REPLACE FUNCTION public.bulk_approve_survey_import(
  p_batch_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text DEFAULT 'Bulk ETO approval of submitted imported units'
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public,ptas_private,pg_temp
AS $$
DECLARE
  v_actor record;
  v_batch public.survey_import_batches;
  v_unit public.survey_units;
  v_profile public.survey_unit_profiles;
  v_rule public.survey_classification_rules;
  v_approved integer := 0;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,'')))=0
     OR length(btrim(coalesce(p_correlation_id,'')))=0 THEN
    RAISE EXCEPTION 'idempotency key and correlation ID are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active ETO may bulk-approve imported units'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.survey_import_batches
  WHERE id=p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey import batch not found' USING ERRCODE='P0002';
  END IF;
  IF v_batch.status<>'IMPORTED'
     OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_batch.jurisdiction_id) THEN
    RAISE EXCEPTION 'batch is not eligible in the ETO jurisdiction' USING ERRCODE='42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_actions
    WHERE aggregate_type='SURVEY_IMPORT' AND idempotency_key=p_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'batch_id',v_batch.id,
      'approved_rows',(
        SELECT count(*) FROM public.survey_import_rows r
        JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
        WHERE r.batch_id=v_batch.id AND u.state='APPROVED'
      ),
      'idempotent_replay',true
    );
  END IF;

  FOR v_unit IN
    SELECT u.*
    FROM public.survey_import_rows r
    JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
    WHERE r.batch_id=v_batch.id
    ORDER BY u.id
    FOR UPDATE OF u
  LOOP
    IF v_unit.state<>'SUBMITTED' THEN
      RAISE EXCEPTION 'every unit must be Submitted before bulk approval'
        USING ERRCODE='23514';
    END IF;
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_unit.jurisdiction_id) THEN
      RAISE EXCEPTION 'batch contains a unit outside the ETO jurisdiction'
        USING ERRCODE='42501';
    END IF;
    IF v_unit.assessment_id IS NULL THEN
      RAISE EXCEPTION 'approval requires a linked assessment' USING ERRCODE='23514';
    END IF;

    SELECT * INTO v_profile
    FROM public.survey_unit_profiles
    WHERE survey_unit_id=v_unit.id;
    IF v_profile.survey_unit_id IS NULL
       OR v_profile.classification_status<>'CLASSIFIED'
       OR v_profile.classification_rule_id IS NULL THEN
      RAISE EXCEPTION 'all units require resolved statutory classification before approval'
        USING ERRCODE='23514';
    END IF;

    SELECT * INTO v_rule
    FROM public.survey_classification_rules
    WHERE id=v_profile.classification_rule_id
      AND status='ACTIVE'
      AND financial_year_code=v_unit.financial_year_id;
    IF v_rule.id IS NULL THEN
      RAISE EXCEPTION 'classification is inactive or does not match the financial year'
        USING ERRCODE='23514';
    END IF;

    PERFORM public.transition_survey_unit(
      v_unit.id,'APPROVE',v_unit.row_version,
      p_idempotency_key||':'||v_unit.id::text,
      p_correlation_id,p_reason
    );
    v_approved:=v_approved+1;
  END LOOP;

  INSERT INTO public.workflow_actions(
    aggregate_type,aggregate_id,action,from_status,to_status,reason,
    actor_id,actor_role,correlation_id,idempotency_key
  ) VALUES(
    'SURVEY_IMPORT',v_batch.id,'BULK_APPROVE','SUBMITTED','APPROVED',p_reason,
    v_actor.user_id,v_actor.role_code,p_correlation_id,p_idempotency_key
  );

  PERFORM ptas_private.audit_transition(
    'SURVEY_IMPORT_BULK_APPROVED','SURVEY_IMPORT',v_batch.id,
    v_actor.user_id,v_actor.role_code,v_actor.jurisdiction_id,
    p_correlation_id,'SUBMITTED','APPROVED',
    format('%s imported unit(s) approved and registered in PFT-3',v_approved)
  );

  RETURN jsonb_build_object(
    'batch_id',v_batch.id,
    'approved_rows',v_approved,
    'idempotent_replay',false
  );
END
$$;

CREATE OR REPLACE FUNCTION public.list_actionable_survey_import_batches()
RETURNS TABLE(
  batch_id uuid,
  source_filename text,
  financial_year_code text,
  imported_rows integer,
  feeded_rows bigint,
  submitted_rows bigint,
  approved_rows bigint,
  pending_review_rows bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public,ptas_private,pg_temp
AS $$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(ARRAY['INSPECTOR','ETO']) LIMIT 1
  )
  SELECT
    b.id,b.source_filename,b.financial_year_code,b.imported_rows,
    count(*) FILTER (WHERE u.state='FEEDED'),
    count(*) FILTER (WHERE u.state='SUBMITTED'),
    count(*) FILTER (WHERE u.state='APPROVED'),
    count(*) FILTER (WHERE p.classification_status='PENDING_REVIEW'),
    b.created_at
  FROM actor a
  JOIN public.survey_import_batches b ON b.status='IMPORTED'
  JOIN public.survey_import_rows r ON r.batch_id=b.id
  JOIN public.survey_units u ON u.id=r.promoted_survey_unit_id
  JOIN public.survey_unit_profiles p ON p.survey_unit_id=u.id
  WHERE (
    a.role_code='INSPECTOR'
    AND u.responsible_inspector_id=a.user_id
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id,u.jurisdiction_id)
  ) OR (
    a.role_code='ETO'
    AND ptas_private.jurisdiction_contains(a.jurisdiction_id,u.jurisdiction_id)
  )
  GROUP BY b.id,b.source_filename,b.financial_year_code,b.imported_rows,b.created_at,a.role_code
  HAVING (a.role_code='INSPECTOR' AND count(*) FILTER (WHERE u.state='FEEDED')>0)
      OR (a.role_code='ETO' AND count(*) FILTER (WHERE u.state='SUBMITTED')>0)
  ORDER BY b.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.bulk_submit_survey_import(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bulk_approve_survey_import(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_actionable_survey_import_batches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_submit_survey_import(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_approve_survey_import(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_actionable_survey_import_batches() TO authenticated;

COMMIT;

BEGIN;

ALTER TABLE public.jurisdictions DROP CONSTRAINT jurisdictions_tier_check;

-- Preserve the existing Multan, Vehari, and first-circle identifiers while
-- correcting the pilot hierarchy to the approved administrative structure.
UPDATE public.jurisdictions
SET code='DIV_MULTAN', name='Multan Division', tier='DIVISION', parent_id=NULL
WHERE id='00000000-0000-4000-8000-000000000001';

UPDATE public.jurisdictions
SET code='DIST_VEH', name='Vehari District', tier='DISTRICT',
    parent_id='00000000-0000-4000-8000-000000000001'
WHERE id='00000000-0000-4000-8000-000000000002';

UPDATE public.jurisdictions
SET code='CIR_VEH_01', name='Circle 1', tier='CIRCLE',
    parent_id='00000000-0000-4000-8000-000000000003'
WHERE id='00000000-0000-4000-8000-000000000004';

UPDATE public.jurisdictions
SET code='TEH_VEH', name='Vehari Tehsil', tier='TEHSIL',
    parent_id='00000000-0000-4000-8000-000000000002'
WHERE id='00000000-0000-4000-8000-000000000003';

INSERT INTO public.jurisdictions(id,code,name,tier,parent_id)
VALUES
  (gen_random_uuid(),'DIST_MULTAN','Multan District','DISTRICT','00000000-0000-4000-8000-000000000001'),
  (gen_random_uuid(),'DIST_KHAN','Khanewal District','DISTRICT','00000000-0000-4000-8000-000000000001'),
  (gen_random_uuid(),'DIST_LOD','Lodhran District','DISTRICT','00000000-0000-4000-8000-000000000001')
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,tier=excluded.tier,parent_id=excluded.parent_id;

INSERT INTO public.jurisdictions(id,code,name,tier,parent_id)
SELECT gen_random_uuid(),prefix||to_char(n,'FM00'),'Circle '||n,'CIRCLE',district_id
FROM (
  SELECT id district_id,'CIR_MULTAN_' prefix FROM public.jurisdictions WHERE code='DIST_MULTAN'
  UNION ALL SELECT id,'CIR_VEH_' FROM public.jurisdictions WHERE code='TEH_VEH'
  UNION ALL SELECT id,'CIR_KHAN_' FROM public.jurisdictions WHERE code='DIST_KHAN'
  UNION ALL SELECT id,'CIR_LOD_' FROM public.jurisdictions WHERE code='DIST_LOD'
) districts
CROSS JOIN generate_series(1,10) n
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,tier=excluded.tier,parent_id=excluded.parent_id;

ALTER TABLE public.jurisdictions
  ADD CONSTRAINT jurisdictions_tier_check
  CHECK (tier IN ('DIVISION','REGION','DISTRICT','ZONE','TEHSIL','CIRCLE'));

CREATE OR REPLACE FUNCTION ptas_private.validate_jurisdiction_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE parent_tier text;
BEGIN
  IF NEW.parent_id=NEW.id THEN
    RAISE EXCEPTION 'a jurisdiction cannot parent itself' USING ERRCODE='23514';
  END IF;
  IF NEW.tier IN ('DIVISION','REGION') THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION '% must be a root jurisdiction',NEW.tier USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION '% requires a parent jurisdiction',NEW.tier USING ERRCODE='23514';
  END IF;
  SELECT tier INTO parent_tier FROM public.jurisdictions WHERE id=NEW.parent_id;
  IF parent_tier IS NULL THEN
    RAISE EXCEPTION 'parent jurisdiction not found' USING ERRCODE='23503';
  END IF;
  IF NEW.tier IN ('DISTRICT','ZONE') AND parent_tier NOT IN ('DIVISION','REGION') THEN
    RAISE EXCEPTION '% must be under a division or region',NEW.tier USING ERRCODE='23514';
  END IF;
  IF NEW.tier='TEHSIL' AND parent_tier NOT IN ('DISTRICT','ZONE') THEN
    RAISE EXCEPTION 'a tehsil must be under a district or zone' USING ERRCODE='23514';
  END IF;
  IF NEW.tier='CIRCLE' AND parent_tier NOT IN ('DISTRICT','ZONE','TEHSIL') THEN
    RAISE EXCEPTION 'a circle must be under a district, zone, or tehsil' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM public.jurisdictions WHERE id=NEW.parent_id
      UNION ALL
      SELECT j.id,j.parent_id FROM public.jurisdictions j
      JOIN ancestors a ON j.id=a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN
    RAISE EXCEPTION 'jurisdiction hierarchy cycle detected' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER jurisdictions_validate_hierarchy
BEFORE INSERT OR UPDATE OF parent_id,tier ON public.jurisdictions
FOR EACH ROW EXECUTE FUNCTION ptas_private.validate_jurisdiction_hierarchy();

INSERT INTO public.roles(code,description)
VALUES('ADMIN','Technical administration across PTAS; no statutory workflow authority')
ON CONFLICT(code) DO UPDATE SET description=excluded.description;

CREATE UNIQUE INDEX user_roles_one_active_inspector
ON public.user_roles(user_id)
WHERE role_code='INSPECTOR' AND valid_to IS NULL;

CREATE OR REPLACE FUNCTION ptas_private.validate_role_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE assigned_tier text;
BEGIN
  SELECT tier INTO assigned_tier FROM public.jurisdictions WHERE id=NEW.jurisdiction_id;
  IF assigned_tier IS NULL THEN
    RAISE EXCEPTION 'assigned jurisdiction not found' USING ERRCODE='23503';
  END IF;
  IF NEW.role_code='INSPECTOR' AND assigned_tier<>'CIRCLE' THEN
    RAISE EXCEPTION 'Inspector must be assigned to exactly one circle' USING ERRCODE='23514';
  ELSIF NEW.role_code='ETO' AND assigned_tier NOT IN ('DISTRICT','ZONE') THEN
    RAISE EXCEPTION 'ETO must be assigned to a district or zone' USING ERRCODE='23514';
  ELSIF NEW.role_code='DIRECTOR' AND assigned_tier NOT IN ('DIVISION','REGION') THEN
    RAISE EXCEPTION 'Director must be assigned to a division or region' USING ERRCODE='23514';
  ELSIF NEW.role_code='ADMIN' AND assigned_tier NOT IN ('DIVISION','REGION') THEN
    RAISE EXCEPTION 'Admin must be anchored at a division or region' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER user_roles_validate_scope
BEFORE INSERT OR UPDATE OF role_code,jurisdiction_id,valid_to ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION ptas_private.validate_role_scope();

CREATE OR REPLACE FUNCTION ptas_private.jurisdiction_contains(p_root uuid,p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.jurisdictions WHERE id=p_root
    UNION ALL
    SELECT j.id FROM public.jurisdictions j JOIN tree t ON j.parent_id=t.id
  )
  SELECT EXISTS(SELECT 1 FROM tree WHERE id=p_target)
$$;

CREATE OR REPLACE FUNCTION ptas_private.active_actor(p_roles text[] DEFAULT NULL)
RETURNS TABLE(user_id uuid,role_code text,jurisdiction_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT u.id,ur.role_code,ur.jurisdiction_id
  FROM public.app_users u
  JOIN public.user_roles ur ON ur.user_id=u.id
  WHERE u.auth_user_id=(SELECT auth.uid())
    AND u.active AND u.deactivated_at IS NULL
    AND ur.valid_from<=now() AND (ur.valid_to IS NULL OR ur.valid_to>now())
    AND (p_roles IS NULL OR ur.role_code=ANY(p_roles))
$$;

CREATE OR REPLACE FUNCTION ptas_private.can_access_jurisdiction(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM ptas_private.active_actor(NULL) a
    WHERE a.role_code='ADMIN'
       OR ptas_private.jurisdiction_contains(a.jurisdiction_id,p_target)
  )
$$;

DROP POLICY taxpayers_select ON public.taxpayers;
CREATE POLICY taxpayers_select ON public.taxpayers FOR SELECT TO authenticated
USING(ptas_private.can_access_jurisdiction(current_circle_id));

DROP POLICY survey_units_select ON public.survey_units;
CREATE POLICY survey_units_select ON public.survey_units FOR SELECT TO authenticated
USING(ptas_private.can_access_jurisdiction(jurisdiction_id));

DROP POLICY show_cause_select ON public.show_cause_cases;
CREATE POLICY show_cause_select ON public.show_cause_cases FOR SELECT TO authenticated
USING(ptas_private.can_access_jurisdiction(jurisdiction_id));

DROP POLICY deletion_select ON public.demand_deletion_requests;
CREATE POLICY deletion_select ON public.demand_deletion_requests FOR SELECT TO authenticated
USING(ptas_private.can_access_jurisdiction(jurisdiction_id));

DROP POLICY challan_select ON public.pft2_challans;
CREATE POLICY challan_select ON public.pft2_challans FOR SELECT TO authenticated
USING(ptas_private.can_access_jurisdiction(jurisdiction_id));

DROP POLICY audit_select ON public.audit_events;
CREATE POLICY audit_select ON public.audit_events FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM ptas_private.active_actor(ARRAY['AUDITOR','DIRECTOR','ETO','ADMIN']) a
    WHERE a.role_code='ADMIN'
       OR audit_events.jurisdiction_id IS NULL
       OR ptas_private.jurisdiction_contains(a.jurisdiction_id,audit_events.jurisdiction_id::uuid)
  )
);

REVOKE ALL ON FUNCTION ptas_private.validate_jurisdiction_hierarchy(),
  ptas_private.validate_role_scope(),ptas_private.jurisdiction_contains(uuid,uuid),
  ptas_private.active_actor(text[]),ptas_private.can_access_jurisdiction(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ptas_private.jurisdiction_contains(uuid,uuid),
  ptas_private.active_actor(text[]),ptas_private.can_access_jurisdiction(uuid)
TO authenticated;

COMMIT;

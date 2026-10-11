BEGIN;

-- ============================================================================
-- PTAS Migration 0033: User Management Overhaul & Tehsil-Circle Governance
-- 1. Jurisdictions Expansion:
--    Add Burewala and Mailsi Tehsils under Vehari District.
--    Attach Vehari circles to their respective gazetted Tehsils.
-- 2. App Users Profile Enhancement:
--    Add email, phone, cnic, designation, office_address, updated_at columns.
--    Synchronize email from auth.users.
-- 3. RLS Policies:
--    Allow ETO to view and manage subordinate officers within their district.
--    Allow Director / Admin to view all officers.
-- 4. Statutory Security Definer Administrative RPCs:
--    - get_officers_directory(): Live officers roster with circle & tehsil metadata.
--    - update_officer_profile(): Profile and contact particulars update.
--    - reassign_officer_circle(): Circle reassignment with statutory audit trail.
--    - attach_circle_to_tehsil(): Dynamic circle attachment to district tehsils.
--    - set_officer_status(): Active / Suspended toggle with reason.
--    - admin_set_officer_password(): Direct password setting for subordinate staff.
--    - admin_create_officer(): Provision new officer into auth, app_users, and roles.
--    - get_district_governance_matrix(): Hierarchical summary of tehsils, circles, and staff.
-- ============================================================================

-- 1. Add Burewala and Mailsi Tehsils under Vehari District
INSERT INTO public.jurisdictions(id, code, name, tier, parent_id, office_address, abbreviation, display_label)
VALUES
  (
    '00000000-0000-4000-8000-000000000005',
    'TEH_BUR',
    'Burewala',
    'TEHSIL',
    '00000000-0000-4000-8000-000000000002',
    'Sub-Divisional Office, Excise & Taxation Department, Tehsil Complex, Burewala',
    'BUR',
    'Tehsil Burewala'
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'TEH_MAI',
    'Mailsi',
    'TEHSIL',
    '00000000-0000-4000-8000-000000000002',
    'Sub-Divisional Office, Excise & Taxation Department, Colony Road, Mailsi',
    'MAI',
    'Tehsil Mailsi'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  office_address = EXCLUDED.office_address;

-- Initial attachment of Vehari Circles to their respective Tehsils
-- Tehsil Vehari: Circles 1, 2, 5, 8, 9
UPDATE public.jurisdictions
SET parent_id = '00000000-0000-4000-8000-000000000003'
WHERE code IN ('CIR_VEH_01', 'CIR_VEH_02', 'CIR_VEH_05', 'CIR_VEH_08', 'CIR_VEH_09');

-- Tehsil Burewala: Circles 3, 6
UPDATE public.jurisdictions
SET parent_id = '00000000-0000-4000-8000-000000000005'
WHERE code IN ('CIR_VEH_03', 'CIR_VEH_06');

-- Tehsil Mailsi: Circles 4, 7, 10
UPDATE public.jurisdictions
SET parent_id = '00000000-0000-4000-8000-000000000006'
WHERE code IN ('CIR_VEH_04', 'CIR_VEH_07', 'CIR_VEH_10');

-- 2. Enhance public.app_users
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cnic text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS office_address text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Synchronize email from auth.users
UPDATE public.app_users u
SET email = au.email
FROM auth.users au
WHERE u.auth_user_id = au.id AND (u.email IS NULL OR u.email = '');

-- Update metadata for existing officers
UPDATE public.app_users
SET
  phone = '0300-8765432',
  cnic = '36603-1234567-1',
  designation = 'Excise & Taxation Officer (Assessing Authority)',
  office_address = 'Office of the Excise & Taxation Officer, Danewal Road, Vehari'
WHERE id = 'b613577d-b9b9-49a0-a4e6-ab82229a0bd6';

UPDATE public.app_users
SET
  phone = '0301-9876543',
  cnic = '36603-9876543-1',
  designation = 'Tax Inspector (Circle 1)',
  office_address = 'Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari'
WHERE id = '62ee03c1-ede5-442c-a01f-0e2f200703c1';

-- 3. RLS Policies on app_users and user_roles
DROP POLICY IF EXISTS app_users_self_select ON public.app_users;
DROP POLICY IF EXISTS app_users_select ON public.app_users;
CREATE POLICY app_users_select ON public.app_users FOR SELECT TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM ptas_private.active_actor(ARRAY['ADMIN', 'DIRECTOR']))
  OR EXISTS (
    SELECT 1 FROM ptas_private.active_actor(ARRAY['ETO']) a
    JOIN public.user_roles ur ON ur.user_id = app_users.id
    WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id, ur.jurisdiction_id)
  )
);

DROP POLICY IF EXISTS user_roles_self_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id IN (SELECT id FROM public.app_users WHERE auth_user_id = (SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM ptas_private.active_actor(ARRAY['ADMIN', 'DIRECTOR']))
  OR EXISTS (
    SELECT 1 FROM ptas_private.active_actor(ARRAY['ETO']) a
    WHERE ptas_private.jurisdiction_contains(a.jurisdiction_id, user_roles.jurisdiction_id)
  )
);

-- 4. RPC: get_officers_directory()
CREATE OR REPLACE FUNCTION public.get_officers_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH officer_data AS (
    SELECT
      u.id AS user_id,
      u.auth_user_id,
      u.display_name AS name,
      coalesce(u.email, au.email, '') AS email,
      coalesce(u.phone, '') AS phone,
      coalesce(u.cnic, '') AS cnic,
      coalesce(u.designation, '') AS designation,
      coalesce(u.office_address, j.office_address, '') AS office_address,
      u.active,
      u.created_at,
      ur.role_code AS role,
      ur.jurisdiction_id,
      j.name AS circle_name,
      j.code AS circle_code,
      teh.id AS tehsil_id,
      teh.name AS tehsil_name,
      dist.id AS district_id,
      dist.name AS district_name,
      (SELECT count(*)::int FROM public.survey_units su WHERE su.responsible_inspector_id = u.id) AS assigned_survey_units_count,
      (SELECT count(*)::int FROM public.survey_units su WHERE su.jurisdiction_id = ur.jurisdiction_id) AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist ON (
      CASE 
        WHEN j.tier = 'DISTRICT' THEN j.id = dist.id
        WHEN teh.id IS NOT NULL THEN dist.id = teh.parent_id
        ELSE dist.id = j.parent_id
      END
    ) AND dist.tier = 'DISTRICT'
    WHERE
      v_actor.role_code IN ('ADMIN', 'DIRECTOR')
      OR (v_actor.role_code = 'ETO' AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, ur.jurisdiction_id))
      OR u.id = v_actor.user_id
    ORDER BY 
      CASE ur.role_code WHEN 'ADMIN' THEN 1 WHEN 'DIRECTOR' THEN 2 WHEN 'ETO' THEN 3 WHEN 'INSPECTOR' THEN 4 ELSE 5 END,
      j.name,
      u.display_name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(od)), '[]'::jsonb) INTO v_result
  FROM officer_data od;

  RETURN v_result;
END;
$$;

-- 5. RPC: update_officer_profile()
CREATE OR REPLACE FUNCTION public.update_officer_profile(
  p_user_id uuid,
  p_display_name text,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS session required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;

  -- Authority check:
  -- Admin/Director: can edit any officer
  -- ETO: can edit subordinate inspectors in their district, or their own profile
  -- Inspector: can edit only their own profile
  IF v_actor.role_code IN ('ADMIN', 'DIRECTOR') THEN
    -- Allowed
  ELSIF v_actor.role_code = 'ETO' THEN
    IF v_actor.user_id <> p_user_id AND (v_target_role.jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id)) THEN
      RAISE EXCEPTION 'target officer is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_actor.user_id <> p_user_id THEN
      RAISE EXCEPTION 'unauthorized: officers may only update their own profile' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.app_users
  SET
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    phone = nullif(btrim(p_phone), ''),
    cnic = nullif(btrim(p_cnic), ''),
    designation = nullif(btrim(p_designation), ''),
    office_address = nullif(btrim(p_office_address), ''),
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  -- Audit transition
  PERFORM ptas_private.audit_transition(
    'OFFICER_PROFILE_UPDATED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'user-mgmt:' || p_user_id::text,
    'ACTIVE',
    'UPDATED',
    'Profile particulars updated: Name: ' || v_target_user.display_name || ', Mobile: ' || coalesce(v_target_user.phone, '-')
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

-- 6. RPC: reassign_officer_circle()
CREATE OR REPLACE FUNCTION public.reassign_officer_circle(
  p_user_id uuid,
  p_new_circle_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_old_role public.user_roles;
  v_new_jurisdiction public.jurisdictions;
  v_new_role_id uuid;
  v_audit_reason text;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_new_jurisdiction FROM public.jurisdictions WHERE id = p_new_circle_id;
  IF v_new_jurisdiction.id IS NULL OR v_new_jurisdiction.tier <> 'CIRCLE' THEN
    RAISE EXCEPTION 'target jurisdiction must be an active administrative Circle' USING ERRCODE = '23514';
  END IF;

  -- ETO can only reassign circles within their assigned district
  IF v_actor.role_code = 'ETO' AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_new_circle_id) THEN
    RAISE EXCEPTION 'target circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;
  IF v_old_role.id IS NOT NULL AND v_actor.role_code = 'ETO' AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_old_role.jurisdiction_id) THEN
    RAISE EXCEPTION 'current circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
  END IF;

  -- Close previous active role
  IF v_old_role.id IS NOT NULL THEN
    UPDATE public.user_roles
    SET valid_to = now()
    WHERE id = v_old_role.id;
  END IF;

  -- Insert new active assignment
  v_new_role_id := gen_random_uuid();
  INSERT INTO public.user_roles(id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
  VALUES (v_new_role_id, p_user_id, 'INSPECTOR', p_new_circle_id, now(), NULL, now());

  v_audit_reason := coalesce(nullif(btrim(p_reason), ''), 'Statutory circle reassignment under departmental reorganization');

  PERFORM ptas_private.audit_transition(
    'CIRCLE_REASSIGNED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    p_new_circle_id,
    'circle-reassign:' || p_user_id::text,
    coalesce(v_old_role.jurisdiction_id::text, 'UNASSIGNED'),
    p_new_circle_id::text,
    v_audit_reason
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'new_circle_id', p_new_circle_id,
    'new_circle_name', v_new_jurisdiction.name,
    'assigned_at', now()
  );
END;
$$;

-- 7. RPC: attach_circle_to_tehsil()
CREATE OR REPLACE FUNCTION public.attach_circle_to_tehsil(
  p_circle_id uuid,
  p_tehsil_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_circle public.jurisdictions;
  v_tehsil public.jurisdictions;
  v_old_parent_id uuid;
  v_audit_reason text;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_circle FROM public.jurisdictions WHERE id = p_circle_id FOR UPDATE;
  IF v_circle.id IS NULL OR v_circle.tier <> 'CIRCLE' THEN
    RAISE EXCEPTION 'jurisdiction must be an active administrative Circle' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_tehsil FROM public.jurisdictions WHERE id = p_tehsil_id;
  IF v_tehsil.id IS NULL OR v_tehsil.tier <> 'TEHSIL' THEN
    RAISE EXCEPTION 'target jurisdiction must be an active Tehsil' USING ERRCODE = '23514';
  END IF;

  -- Validate jurisdiction boundary
  IF v_actor.role_code = 'ETO' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_circle_id) THEN
      RAISE EXCEPTION 'circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_tehsil_id) THEN
      RAISE EXCEPTION 'tehsil is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_old_parent_id := v_circle.parent_id;

  UPDATE public.jurisdictions
  SET parent_id = p_tehsil_id
  WHERE id = p_circle_id;

  v_audit_reason := coalesce(nullif(btrim(p_reason), ''), 'Circle re-attached to Tehsil under statutory administrative authority');

  PERFORM ptas_private.audit_transition(
    'CIRCLE_TEHSIL_ATTACHED',
    'JURISDICTION',
    p_circle_id,
    v_actor.user_id,
    v_actor.role_code,
    p_circle_id,
    'tehsil-attach:' || p_circle_id::text,
    coalesce(v_old_parent_id::text, 'UNATTACHED'),
    p_tehsil_id::text,
    v_audit_reason
  );

  RETURN jsonb_build_object(
    'circle_id', p_circle_id,
    'circle_name', v_circle.name,
    'new_tehsil_id', p_tehsil_id,
    'new_tehsil_name', v_tehsil.name
  );
END;
$$;

-- 8. RPC: set_officer_status()
CREATE OR REPLACE FUNCTION public.set_officer_status(
  p_user_id uuid,
  p_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND valid_to IS NULL LIMIT 1;

  IF v_actor.role_code = 'ETO' AND v_target_role.jurisdiction_id IS NOT NULL AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
    RAISE EXCEPTION 'target officer is outside your assigned district jurisdiction' USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_users
  SET
    active = p_active,
    deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  PERFORM ptas_private.audit_transition(
    CASE WHEN p_active THEN 'OFFICER_ACTIVATED' ELSE 'OFFICER_SUSPENDED' END,
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'officer-status:' || p_user_id::text,
    (CASE WHEN p_active THEN 'INACTIVE' ELSE 'ACTIVE' END),
    (CASE WHEN p_active THEN 'ACTIVE' ELSE 'INACTIVE' END),
    coalesce(p_reason, 'Officer status modified by authorized administrator')
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

-- 9. RPC: admin_set_officer_password()
CREATE OR REPLACE FUNCTION public.admin_set_officer_password(
  p_target_user_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_target_role public.user_roles;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS session required' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_new_password, ''))) < 6 THEN
    RAISE EXCEPTION 'password must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_target_user_id;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'target user not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'target user has no linked authentication identity' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_target_role FROM public.user_roles WHERE user_id = p_target_user_id AND valid_to IS NULL LIMIT 1;

  -- Authority check:
  -- Self-update: always allowed
  -- Admin / Director: allowed
  -- ETO: allowed for subordinate staff within jurisdiction
  IF v_actor.user_id = p_target_user_id THEN
    -- Self-update
  ELSIF v_actor.role_code IN ('ADMIN', 'DIRECTOR') THEN
    -- Allowed
  ELSIF v_actor.role_code = 'ETO' THEN
    IF v_target_role.jurisdiction_id IS NULL OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_role.jurisdiction_id) THEN
      RAISE EXCEPTION 'subordinate officer is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized to change another officer password' USING ERRCODE = '42501';
  END IF;

  -- Update auth.users encrypted_password using pgcrypto bf salt
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_target_user.auth_user_id;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PASSWORD_RESET',
    'USER_ACCOUNT',
    p_target_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'password-reset:' || p_target_user_id::text,
    'PREVIOUS_CREDENTIAL',
    'UPDATED_CREDENTIAL',
    'Statutory credential rotation performed by authorized administrator'
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'Officer password has been securely updated in live database'
  );
END;
$$;

-- 10. RPC: admin_create_officer()
CREATE OR REPLACE FUNCTION public.admin_create_officer(
  p_name text,
  p_email text,
  p_role text,
  p_circle_id uuid,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text,
  p_initial_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_auth_user_id uuid;
  v_app_user_id uuid;
  v_target_jurisdiction public.jurisdictions;
  v_normalized_email text;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  v_normalized_email := lower(btrim(coalesce(p_email, '')));
  IF position('@' in v_normalized_email) = 0 THEN
    RAISE EXCEPTION 'valid email address is required' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_initial_password, ''))) < 6 THEN
    RAISE EXCEPTION 'initial password must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  -- Verify target circle exists
  SELECT * INTO v_target_jurisdiction FROM public.jurisdictions WHERE id = p_circle_id;
  IF v_target_jurisdiction.id IS NULL THEN
    RAISE EXCEPTION 'assigned circle not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor.role_code = 'ETO' AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, p_circle_id) THEN
    RAISE EXCEPTION 'target circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
  END IF;

  -- Check if email already registered in auth.users
  SELECT id INTO v_auth_user_id FROM auth.users WHERE lower(email) = v_normalized_email LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();
    INSERT INTO auth.users(
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000000',
      v_auth_user_id,
      'authenticated',
      'authenticated',
      v_normalized_email,
      extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name, 'sub', v_auth_user_id),
      now(),
      now()
    );

    INSERT INTO auth.identities(
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      email
    ) VALUES (
      gen_random_uuid(),
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id, 'email', v_normalized_email, 'name', p_name),
      'email',
      now(),
      now(),
      now(),
      v_normalized_email
    );
  END IF;

  -- Create or retrieve app_users row
  SELECT id INTO v_app_user_id FROM public.app_users WHERE auth_user_id = v_auth_user_id;

  IF v_app_user_id IS NULL THEN
    v_app_user_id := gen_random_uuid();
    INSERT INTO public.app_users(
      id,
      auth_user_id,
      display_name,
      email,
      phone,
      cnic,
      designation,
      office_address,
      active,
      created_at,
      updated_at
    ) VALUES (
      v_app_user_id,
      v_auth_user_id,
      btrim(p_name),
      v_normalized_email,
      nullif(btrim(p_phone), ''),
      nullif(btrim(p_cnic), ''),
      nullif(btrim(p_designation), ''),
      nullif(btrim(p_office_address), ''),
      true,
      now(),
      now()
    );
  ELSE
    UPDATE public.app_users
    SET
      display_name = btrim(p_name),
      email = v_normalized_email,
      phone = nullif(btrim(p_phone), ''),
      cnic = nullif(btrim(p_cnic), ''),
      designation = nullif(btrim(p_designation), ''),
      office_address = nullif(btrim(p_office_address), ''),
      active = true,
      updated_at = now()
    WHERE id = v_app_user_id;
  END IF;

  -- Close existing active role if present
  UPDATE public.user_roles SET valid_to = now() WHERE user_id = v_app_user_id AND valid_to IS NULL;

  -- Insert active role assignment
  INSERT INTO public.user_roles(id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
  VALUES (gen_random_uuid(), v_app_user_id, upper(coalesce(p_role, 'INSPECTOR')), p_circle_id, now(), NULL, now());

  -- Audit transition
  PERFORM ptas_private.audit_transition(
    'OFFICER_PROVISIONED',
    'USER_ACCOUNT',
    v_app_user_id,
    v_actor.user_id,
    v_actor.role_code,
    p_circle_id,
    'officer-create:' || v_app_user_id::text,
    'NON_EXISTENT',
    'ACTIVE',
    'Officer account provisioned: ' || p_name || ' (' || upper(coalesce(p_role, 'INSPECTOR')) || ')'
  );

  RETURN jsonb_build_object(
    'id', v_app_user_id,
    'auth_user_id', v_auth_user_id,
    'name', p_name,
    'email', v_normalized_email,
    'role', upper(coalesce(p_role, 'INSPECTOR')),
    'circle_id', p_circle_id,
    'circle_name', v_target_jurisdiction.name
  );
END;
$$;

-- 11. RPC: get_district_governance_matrix()
CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH circle_stats AS (
    SELECT
      c.id AS circle_id,
      c.code AS circle_code,
      c.name AS circle_name,
      c.office_address AS circle_address,
      t.id AS tehsil_id,
      t.name AS tehsil_name,
      t.code AS tehsil_code,
      d.id AS district_id,
      d.name AS district_name,
      d.code AS district_code,
      u.id AS inspector_id,
      u.display_name AS inspector_name,
      u.phone AS inspector_phone,
      u.email AS inspector_email,
      coalesce(count(su.id), 0)::int AS units_count,
      coalesce(sum(CASE WHEN su.state = 'APPROVED' THEN 1 ELSE 0 END), 0)::int AS approved_units_count,
      coalesce(sum(av.snapshot->>'taxAmount')::numeric, 0)::numeric AS total_assessed_demand
    FROM public.jurisdictions c
    JOIN public.jurisdictions t ON t.id = c.parent_id AND t.tier = 'TEHSIL'
    JOIN public.jurisdictions d ON d.id = t.parent_id AND d.tier = 'DISTRICT'
    LEFT JOIN public.user_roles ur ON ur.jurisdiction_id = c.id AND ur.role_code = 'INSPECTOR' AND ur.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = ur.user_id AND u.active = true
    LEFT JOIN public.survey_units su ON su.jurisdiction_id = c.id
    LEFT JOIN public.assessment_versions av ON av.assessment_id = su.assessment_id AND av.status = 'APPROVED'
    WHERE c.tier = 'CIRCLE'
      AND (
        v_actor.role_code IN ('ADMIN', 'DIRECTOR')
        OR (v_actor.role_code = 'ETO' AND ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, c.id))
        OR c.id = v_actor.jurisdiction_id
      )
    GROUP BY c.id, c.code, c.name, c.office_address, t.id, t.name, t.code, d.id, d.name, d.code, u.id, u.display_name, u.phone, u.email
    ORDER BY t.name, c.name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$$;

-- 12. RPC: get_user_management_audit_log()
CREATE OR REPLACE FUNCTION public.get_user_management_audit_log(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH audit_records AS (
    SELECT
      ae.id,
      ae.event_type,
      ae.aggregate_type,
      ae.aggregate_id,
      ae.actor_id,
      ae.actor_role,
      coalesce(au.display_name, ae.actor_id) AS performed_by_name,
      ae.jurisdiction_id,
      ae.occurred_at,
      ae.payload->>'reason' AS reason,
      ae.payload->>'from_status' AS from_status,
      ae.payload->>'to_status' AS to_status,
      ae.payload
    FROM public.audit_events ae
    LEFT JOIN public.app_users au ON au.id::text = ae.actor_id
    WHERE ae.aggregate_type IN ('USER_ACCOUNT', 'JURISDICTION')
      AND (
        v_actor.role_code IN ('ADMIN', 'DIRECTOR')
        OR (v_actor.role_code = 'ETO' AND (ae.jurisdiction_id IS NULL OR ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, ae.jurisdiction_id::uuid)))
        OR ae.actor_id = v_actor.user_id::text
        OR ae.aggregate_id = v_actor.user_id::text
      )
    ORDER BY ae.occurred_at DESC
    LIMIT coalesce(p_limit, 100)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(ar)), '[]'::jsonb) INTO v_result
  FROM audit_records ar;

  RETURN v_result;
END;
$$;

-- 13. Grants and permissions
REVOKE ALL ON FUNCTION public.get_officers_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated;

REVOKE ALL ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reassign_officer_circle(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_officer_circle(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_officer_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_officer_status(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_officer_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_officer_password(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_district_governance_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_district_governance_matrix() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_management_audit_log(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_management_audit_log(int) TO authenticated;

COMMIT;

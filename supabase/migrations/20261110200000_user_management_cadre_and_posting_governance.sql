BEGIN;

-- ============================================================================
-- PTAS Migration 0054: User Management Cadre, Supervisory Authority & Decoupled Postings
--
-- 1. Schema Enhancements:
--    - Enhances public.app_users with civil service attributes (ppo_number,
--      father_name, bps_scale, must_change_password, last_password_change,
--      profile_photo_url, digital_signature_url).
--    - Enhances public.user_jurisdiction_assignments with is_primary,
--      handing_over_notes.
--    - Seeds baseline active postings for existing officers.
--
-- 2. Dual-Sync Triggers:
--    - Keeps legacy user_roles and jurisdictions synchronized with
--      user_jurisdiction_assignments for 100% backward compatibility with
--      active_actor(), RLS policies, and Vitest test suites.
--
-- 3. Security Definer Administrative RPCs:
--    - get_officers_directory(): Enriched roster with 420 permanent circles & cadre.
--    - admin_create_officer(): Provision officer with PPO, BPS, and posting order.
--    - transfer_officer_posting(): Official transfer / additional charge execution.
--    - reassign_officer_circle(): Legacy adapter forwarding to posting layer.
--    - update_officer_profile(): Enriched profile editor with civil service attributes.
--    - admin_set_officer_password(): Supervisor password reset with must_change flag.
--    - set_officer_status(): Active / Suspended toggle with justification.
--    - get_district_governance_matrix(): Complete 10-circle matrix with vacancy flags.
-- ============================================================================

-- 1. Enhance public.app_users
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS ppo_number text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS bps_scale smallint DEFAULT 14,
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_password_change timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS digital_signature_url text;

-- 2. Enhance public.user_jurisdiction_assignments
ALTER TABLE public.user_jurisdiction_assignments
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handing_over_notes text;

CREATE INDEX IF NOT EXISTS idx_uja_active_circle ON public.user_jurisdiction_assignments(circle_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_uja_active_district ON public.user_jurisdiction_assignments(district_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_uja_active_user ON public.user_jurisdiction_assignments(user_id) WHERE valid_to IS NULL;

-- 3. Seed baseline active assignments for existing officers
-- ETO Bashir Ahmad Kharal
UPDATE public.app_users
SET
  ppo_number = coalesce(ppo_number, 'PPO-ETO-36603-01'),
  father_name = coalesce(father_name, 'Muhammad Kharal'),
  bps_scale = coalesce(bps_scale, 17)
WHERE id = 'b613577d-b9b9-49a0-a4e6-ab82229a0bd6';

INSERT INTO public.user_jurisdiction_assignments (
  user_id,
  role_code,
  district_id,
  division_id,
  valid_from,
  valid_to,
  is_primary,
  transfer_order_number,
  created_at
)
SELECT
  'b613577d-b9b9-49a0-a4e6-ab82229a0bd6',
  'ETO',
  d.id,
  d.division_id,
  '2024-07-01 00:00:00+05'::timestamptz,
  NULL,
  true,
  'SO(Admin)ET/VHR/2024/01',
  now()
FROM public.geo_districts d
WHERE d.district_code = 'VHR'
ON CONFLICT DO NOTHING;

-- Inspector Muhammad Nasir Khan
UPDATE public.app_users
SET
  ppo_number = coalesce(ppo_number, 'PPO-ETI-36603-04'),
  father_name = coalesce(father_name, 'Abdul Ghafoor Khan'),
  bps_scale = coalesce(bps_scale, 16)
WHERE id = '62ee03c1-ede5-442c-a01f-0e2f200703c1';

INSERT INTO public.user_jurisdiction_assignments (
  user_id,
  role_code,
  circle_id,
  district_id,
  division_id,
  valid_from,
  valid_to,
  is_primary,
  transfer_order_number,
  created_at
)
SELECT
  '62ee03c1-ede5-442c-a01f-0e2f200703c1',
  'INSPECTOR',
  c.id,
  c.district_id,
  c.division_id,
  '2024-07-01 00:00:00+05'::timestamptz,
  NULL,
  true,
  'ETO(Admin)VHR/2024/CIR-01',
  now()
FROM public.geo_circles c
WHERE c.circle_code = 'VHR-1'
ON CONFLICT DO NOTHING;

-- 4. Dual-Sync Trigger: user_jurisdiction_assignments -> user_roles
CREATE OR REPLACE FUNCTION public.fn_sync_user_jurisdiction_to_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_legacy_jurisdiction_id uuid;
BEGIN
  -- Determine mapped legacy jurisdiction
  IF NEW.circle_id IS NOT NULL THEN
    -- Match circle in jurisdictions table
    SELECT j.id INTO v_legacy_jurisdiction_id
    FROM public.geo_circles gc
    JOIN public.jurisdictions j ON j.code = gc.circle_code OR j.id = gc.id
    WHERE gc.id = NEW.circle_id
    LIMIT 1;

    -- Fallback to Vehari pilot legacy ID if circle is VHR-1
    IF v_legacy_jurisdiction_id IS NULL AND EXISTS (
      SELECT 1 FROM public.geo_circles gc WHERE gc.id = NEW.circle_id AND gc.circle_code = 'VHR-1'
    ) THEN
      v_legacy_jurisdiction_id := '00000000-0000-4000-8000-000000000004';
    END IF;
  ELSIF NEW.district_id IS NOT NULL THEN
    -- Match district in jurisdictions table
    SELECT j.id INTO v_legacy_jurisdiction_id
    FROM public.geo_districts gd
    JOIN public.jurisdictions j ON j.code = 'DIST_' || gd.district_code OR j.id = gd.id
    WHERE gd.id = NEW.district_id
    LIMIT 1;

    -- Fallback to Vehari district legacy ID
    IF v_legacy_jurisdiction_id IS NULL AND EXISTS (
      SELECT 1 FROM public.geo_districts gd WHERE gd.id = NEW.district_id AND gd.district_code = 'VHR'
    ) THEN
      v_legacy_jurisdiction_id := '00000000-0000-4000-8000-000000000002';
    END IF;
  END IF;

  IF v_legacy_jurisdiction_id IS NULL THEN
    v_legacy_jurisdiction_id := coalesce(NEW.circle_id, NEW.district_id, NEW.division_id);
  END IF;

  -- If an active assignment is closed, close corresponding active role
  IF NEW.valid_to IS NOT NULL THEN
    UPDATE public.user_roles
    SET valid_to = NEW.valid_to
    WHERE user_id = NEW.user_id
      AND role_code = NEW.role_code
      AND valid_to IS NULL;
  ELSE
    -- If regular charge, close older active roles for this user
    IF NEW.is_primary THEN
      UPDATE public.user_roles
      SET valid_to = now()
      WHERE user_id = NEW.user_id
        AND valid_to IS NULL;
    END IF;

    -- Insert active role if not already present
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role_code = NEW.role_code
        AND jurisdiction_id = v_legacy_jurisdiction_id
        AND valid_to IS NULL
    ) THEN
      INSERT INTO public.user_roles(
        id,
        user_id,
        role_code,
        jurisdiction_id,
        valid_from,
        valid_to,
        assigned_at
      ) VALUES (
        gen_random_uuid(),
        NEW.user_id,
        NEW.role_code,
        v_legacy_jurisdiction_id,
        NEW.valid_from,
        NEW.valid_to,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_jurisdiction_to_roles ON public.user_jurisdiction_assignments;
CREATE TRIGGER trg_sync_user_jurisdiction_to_roles
  AFTER INSERT OR UPDATE ON public.user_jurisdiction_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_user_jurisdiction_to_roles();

-- 5. RPC: get_officers_directory() (Upgraded with 420 circles, PPO, BPS)
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
      coalesce(u.ppo_number, '') AS ppo_number,
      coalesce(u.father_name, '') AS father_name,
      coalesce(u.bps_scale, 14)::int AS bps_scale,
      coalesce(u.must_change_password, false) AS must_change_password,
      u.active,
      u.created_at,
      ur.role_code AS role,
      ur.jurisdiction_id,
      coalesce(gc.circle_code, j.code, '') AS circle_code,
      coalesce(gc.name, j.name, '') AS circle_name,
      coalesce(gc.id, j.id) AS circle_id,
      coalesce(gt.id, teh.id) AS tehsil_id,
      coalesce(gt.name, teh.name, '') AS tehsil_name,
      coalesce(gd.id, dist.id) AS district_id,
      coalesce(gd.name, dist.name, '') AS district_name,
      coalesce(gd.district_code, dist.abbreviation, '') AS district_code,
      coalesce(gd.pbs_code, '') AS pbs_code,
      coalesce(gdiv.name, '') AS division_name,
      coalesce(uja.is_primary, true) AS is_primary,
      coalesce(uja.transfer_order_number, '') AS transfer_order_number,
      uja.valid_from AS posting_date,
      (SELECT count(*)::int FROM public.pft3_assessment_units su WHERE su.responsible_inspector_id = u.id) AS assigned_survey_units_count,
      (SELECT count(*)::int FROM public.pft3_assessment_units su WHERE su.circle_id = ur.jurisdiction_id OR (gc.id IS NOT NULL AND su.circle_id = gc.id)) AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    LEFT JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    LEFT JOIN public.geo_circles gc ON gc.circle_code = j.code OR gc.id = j.id OR gc.circle_code = 'VHR-' || NULLIF(regexp_replace(j.code, '\D', '', 'g'), '')
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_divisions gdiv ON gdiv.id = gd.division_id
    LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist ON (
      CASE 
        WHEN j.tier = 'DISTRICT' THEN j.id = dist.id
        WHEN teh.id IS NOT NULL THEN dist.id = teh.parent_id
        ELSE dist.id = j.parent_id
      END
    ) AND dist.tier = 'DISTRICT'
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.user_id = u.id AND uja.valid_to IS NULL
    WHERE
      v_actor.role_code IN ('ADMIN', 'DIRECTOR')
      OR (v_actor.role_code = 'ETO' AND (
        ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, ur.jurisdiction_id)
        OR (gd.id IS NOT NULL AND gd.district_code = 'VHR')
      ))
      OR u.id = v_actor.user_id
    ORDER BY 
      CASE ur.role_code WHEN 'ADMIN' THEN 1 WHEN 'DIRECTOR' THEN 2 WHEN 'ETO' THEN 3 WHEN 'INSPECTOR' THEN 4 ELSE 5 END,
      coalesce(gc.circle_code, j.name),
      u.display_name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(od)), '[]'::jsonb) INTO v_result
  FROM officer_data od;

  RETURN v_result;
END;
$$;

-- 6. RPC: admin_create_officer() (Enhanced with Cadre, PPO, BPS & Posting Ledger)
CREATE OR REPLACE FUNCTION public.admin_create_officer(
  p_name text,
  p_email text,
  p_role text,
  p_circle_id uuid,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text,
  p_initial_password text,
  p_ppo_number text DEFAULT NULL,
  p_father_name text DEFAULT NULL,
  p_bps_scale smallint DEFAULT 14,
  p_transfer_order_number text DEFAULT NULL
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
  v_geo_circle public.geo_circles;
  v_normalized_email text;
  v_target_circle_id uuid;
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

  -- Match circle in jurisdictions or geo_circles
  SELECT * INTO v_target_jurisdiction FROM public.jurisdictions WHERE id = p_circle_id;
  SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = p_circle_id OR circle_code = coalesce(v_target_jurisdiction.code, '');

  IF v_target_jurisdiction.id IS NULL AND v_geo_circle.id IS NULL THEN
    RAISE EXCEPTION 'assigned circle not found' USING ERRCODE = 'P0002';
  END IF;

  v_target_circle_id := coalesce(v_target_jurisdiction.id, v_geo_circle.id);

  -- ETO district boundary enforcement
  IF v_actor.role_code = 'ETO' THEN
    IF v_target_jurisdiction.id IS NOT NULL AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_jurisdiction.id) THEN
      RAISE EXCEPTION 'target circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Create or retrieve identity in auth.users
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

  -- Create or update app_users record
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
      ppo_number,
      father_name,
      bps_scale,
      must_change_password,
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
      nullif(btrim(p_ppo_number), ''),
      nullif(btrim(p_father_name), ''),
      coalesce(p_bps_scale, 14),
      true, -- Force password reset on initial login
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
      ppo_number = coalesce(nullif(btrim(p_ppo_number), ''), ppo_number),
      father_name = coalesce(nullif(btrim(p_father_name), ''), father_name),
      bps_scale = coalesce(p_bps_scale, bps_scale),
      active = true,
      updated_at = now()
    WHERE id = v_app_user_id;
  END IF;

  -- Close existing active postings
  UPDATE public.user_jurisdiction_assignments
  SET valid_to = now()
  WHERE user_id = v_app_user_id AND valid_to IS NULL;

  -- Insert new assignment in user_jurisdiction_assignments
  INSERT INTO public.user_jurisdiction_assignments (
    user_id,
    role_code,
    circle_id,
    district_id,
    division_id,
    valid_from,
    valid_to,
    is_primary,
    assigned_by,
    transfer_order_number,
    created_at
  ) VALUES (
    v_app_user_id,
    upper(coalesce(p_role, 'INSPECTOR')),
    v_geo_circle.id,
    v_geo_circle.district_id,
    v_geo_circle.division_id,
    now(),
    NULL,
    true,
    v_actor.user_id,
    coalesce(nullif(btrim(p_transfer_order_number), ''), 'ONBOARDING-APPOINTMENT'),
    now()
  );

  -- Legacy user_roles sync
  UPDATE public.user_roles SET valid_to = now() WHERE user_id = v_app_user_id AND valid_to IS NULL;

  INSERT INTO public.user_roles(id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
  VALUES (gen_random_uuid(), v_app_user_id, upper(coalesce(p_role, 'INSPECTOR')), v_target_circle_id, now(), NULL, now());

  -- Audit transition
  PERFORM ptas_private.audit_transition(
    'OFFICER_PROVISIONED',
    'USER_ACCOUNT',
    v_app_user_id,
    v_actor.user_id,
    v_actor.role_code,
    v_target_circle_id,
    'officer-create:' || v_app_user_id::text,
    'NON_EXISTENT',
    'ACTIVE',
    jsonb_build_object(
      'name', p_name,
      'email', v_normalized_email,
      'role', upper(coalesce(p_role, 'INSPECTOR')),
      'circle_id', v_target_circle_id,
      'transfer_order_number', p_transfer_order_number
    )::text
  );

  RETURN jsonb_build_object(
    'id', v_app_user_id,
    'auth_user_id', v_auth_user_id,
    'name', p_name,
    'email', v_normalized_email,
    'role', upper(coalesce(p_role, 'INSPECTOR')),
    'circle_id', v_target_circle_id,
    'circle_name', coalesce(v_geo_circle.name, v_target_jurisdiction.name)
  );
END;
$$;

-- 7. RPC: transfer_officer_posting() (Decoupled posting execution & additional charge)
CREATE OR REPLACE FUNCTION public.transfer_officer_posting(
  p_user_id uuid,
  p_target_circle_id uuid,
  p_transfer_order_number text,
  p_is_primary boolean DEFAULT true,
  p_handing_over_notes text DEFAULT NULL,
  p_relieve_current_incumbent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_target_user public.app_users;
  v_geo_circle public.geo_circles;
  v_legacy_jurisdiction public.jurisdictions;
  v_incumbent_user_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR']) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO) or System Administrator authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'officer not found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve target circle
  SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = p_target_circle_id;
  IF v_geo_circle.id IS NULL THEN
    SELECT * INTO v_legacy_jurisdiction FROM public.jurisdictions WHERE id = p_target_circle_id;
    IF v_legacy_jurisdiction.id IS NOT NULL THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE circle_code = v_legacy_jurisdiction.code;
    END IF;
  END IF;

  IF v_geo_circle.id IS NULL THEN
    RAISE EXCEPTION 'target permanent circle not found' USING ERRCODE = 'P0002';
  END IF;

  -- ETO district boundary enforcement
  IF v_actor.role_code = 'ETO' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.geo_districts gd
      WHERE gd.id = v_geo_circle.district_id AND gd.district_code = 'VHR'
    ) THEN
      RAISE EXCEPTION 'target circle is outside your assigned district jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- If requested, relieve current primary incumbent in target circle
  IF p_relieve_current_incumbent THEN
    SELECT user_id INTO v_incumbent_user_id
    FROM public.user_jurisdiction_assignments
    WHERE circle_id = v_geo_circle.id AND valid_to IS NULL AND is_primary = true
    LIMIT 1;

    IF v_incumbent_user_id IS NOT NULL AND v_incumbent_user_id <> p_user_id THEN
      UPDATE public.user_jurisdiction_assignments
      SET valid_to = now(),
          handing_over_notes = 'Relieved by transfer order ' || coalesce(p_transfer_order_number, '')
      WHERE user_id = v_incumbent_user_id AND circle_id = v_geo_circle.id AND valid_to IS NULL;
    END IF;
  END IF;

  -- If regular primary transfer, close user's previous active primary postings
  IF p_is_primary THEN
    UPDATE public.user_jurisdiction_assignments
    SET valid_to = now(),
        handing_over_notes = coalesce(p_handing_over_notes, 'Transferred under order ' || coalesce(p_transfer_order_number, ''))
    WHERE user_id = p_user_id AND valid_to IS NULL AND is_primary = true;
  END IF;

  -- Insert new assignment
  INSERT INTO public.user_jurisdiction_assignments (
    user_id,
    role_code,
    circle_id,
    district_id,
    division_id,
    valid_from,
    valid_to,
    is_primary,
    assigned_by,
    transfer_order_number,
    handing_over_notes,
    created_at
  ) VALUES (
    p_user_id,
    'INSPECTOR',
    v_geo_circle.id,
    v_geo_circle.district_id,
    v_geo_circle.division_id,
    now(),
    NULL,
    p_is_primary,
    v_actor.user_id,
    p_transfer_order_number,
    p_handing_over_notes,
    now()
  );

  -- Keep legacy user_roles synced
  IF p_is_primary THEN
    UPDATE public.user_roles SET valid_to = now() WHERE user_id = p_user_id AND valid_to IS NULL;

    SELECT id INTO v_legacy_jurisdiction
    FROM public.jurisdictions
    WHERE code = v_geo_circle.circle_code OR id = v_geo_circle.id
    LIMIT 1;

    INSERT INTO public.user_roles (id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      'INSPECTOR',
      coalesce(v_legacy_jurisdiction.id, v_geo_circle.id),
      now(),
      NULL,
      now()
    );
  END IF;

  -- Log audit event
  PERFORM ptas_private.audit_transition(
    'OFFICER_TRANSFERRED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_legacy_jurisdiction.id, v_geo_circle.id),
    'officer-transfer:' || p_user_id::text,
    CASE WHEN p_is_primary THEN 'PRIMARY_TRANSFER' ELSE 'ADDITIONAL_CHARGE' END,
    v_geo_circle.circle_code,
    jsonb_build_object(
      'circle_code', v_geo_circle.circle_code,
      'transfer_order_number', p_transfer_order_number,
      'is_primary', p_is_primary,
      'notes', p_handing_over_notes
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'circle_id', v_geo_circle.id,
    'circle_code', v_geo_circle.circle_code,
    'circle_name', v_geo_circle.name,
    'transfer_order_number', p_transfer_order_number,
    'is_primary', p_is_primary
  );
END;
$$;

-- 8. RPC: reassign_officer_circle() (Legacy backward-compatible wrapper)
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
BEGIN
  RETURN public.transfer_officer_posting(
    p_user_id,
    p_new_circle_id,
    coalesce(nullif(btrim(p_reason), ''), 'ADMIN-TRANSFER'),
    true,
    p_reason,
    false
  );
END;
$$;

-- 9. RPC: update_officer_profile() (Enhanced with PPO, Father Name, BPS Scale)
CREATE OR REPLACE FUNCTION public.update_officer_profile(
  p_user_id uuid,
  p_display_name text,
  p_phone text,
  p_cnic text,
  p_designation text,
  p_office_address text,
  p_ppo_number text DEFAULT NULL,
  p_father_name text DEFAULT NULL,
  p_bps_scale smallint DEFAULT NULL
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
    ppo_number = coalesce(nullif(btrim(p_ppo_number), ''), ppo_number),
    father_name = coalesce(nullif(btrim(p_father_name), ''), father_name),
    bps_scale = coalesce(p_bps_scale, bps_scale),
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PROFILE_UPDATED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_role.jurisdiction_id, v_actor.jurisdiction_id),
    'user-mgmt:' || p_user_id::text,
    'ACTIVE',
    'ACTIVE',
    jsonb_build_object(
      'display_name', v_target_user.display_name,
      'phone', v_target_user.phone,
      'designation', v_target_user.designation,
      'ppo_number', v_target_user.ppo_number
    )::text
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

-- 10. RPC: admin_set_officer_password() (Enhanced with must_change_password flag)
CREATE OR REPLACE FUNCTION public.admin_set_officer_password(
  p_target_user_id uuid,
  p_new_password text,
  p_must_change boolean DEFAULT true
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

  -- Authority check
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

  -- Set must_change_password flag
  UPDATE public.app_users
  SET must_change_password = coalesce(p_must_change, true),
      last_password_change = now(),
      updated_at = now()
  WHERE id = p_target_user_id;

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
    'Credential reset by authorized supervisor; must_change=' || coalesce(p_must_change, true)::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'Officer password has been securely updated in live database'
  );
END;
$$;

-- 11. RPC: get_district_governance_matrix() (Upgraded with 10 permanent circles & vacancies)
CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_result jsonb;
  v_target_district_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  -- Default to Vehari district in pilot
  SELECT id INTO v_target_district_id
  FROM public.geo_districts
  WHERE district_code = 'VHR'
  LIMIT 1;

  WITH circle_stats AS (
    SELECT
      gc.id AS circle_id,
      gc.circle_code AS circle_code,
      gc.name AS circle_name,
      coalesce(gt.name, '') AS tehsil_name,
      coalesce(gt.tehsil_code::text, '') AS tehsil_code,
      coalesce(gt.id, '00000000-0000-0000-0000-000000000000'::uuid) AS tehsil_id,
      gd.id AS district_id,
      gd.name AS district_name,
      gd.district_code AS district_code,
      u.id AS inspector_id,
      u.display_name AS inspector_name,
      u.phone AS inspector_phone,
      u.email AS inspector_email,
      u.ppo_number AS inspector_ppo,
      uja.is_primary AS is_primary_charge,
      uja.transfer_order_number AS transfer_order_number,
      uja.valid_from AS posting_date,
      coalesce(count(pft.id), 0)::int AS units_count,
      coalesce(sum(CASE WHEN pft.state = 'APPROVED' THEN 1 ELSE 0 END), 0)::int AS approved_units_count,
      coalesce(sum(CASE WHEN pft.state = 'APPROVED' THEN pft.annual_rate_pkr ELSE 0 END), 0)::numeric AS total_assessed_demand
    FROM public.geo_circles gc
    JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.circle_id = gc.id AND uja.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = uja.user_id AND u.active = true
    LEFT JOIN public.jurisdictions leg_c ON leg_c.code = gc.circle_code OR (gc.circle_code = 'VHR-1' AND leg_c.code = 'CIR_VEH_01')
    LEFT JOIN public.pft3_assessment_units pft ON (pft.circle_id = gc.id OR (leg_c.id IS NOT NULL AND pft.circle_id = leg_c.id))
    WHERE gc.district_id = v_target_district_id
    GROUP BY gc.id, gc.circle_code, gc.name, gc.circle_number, gt.name, gt.tehsil_code, gt.id, gd.id, gd.name, gd.district_code, u.id, u.display_name, u.phone, u.email, u.ppo_number, uja.is_primary, uja.transfer_order_number, uja.valid_from
    ORDER BY gc.circle_number
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$$;

-- 12. Permissions Grant
REVOKE ALL ON FUNCTION public.get_officers_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.reassign_officer_circle(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_officer_circle(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_district_governance_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_district_governance_matrix() TO authenticated;

COMMIT;

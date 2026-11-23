-- ============================================================================
-- PTAS Migration 0063: Permanent Geographical Identities, Sanctioned Posts
-- (DET BS-19 / ETO BS-17 / ETI BS-14..16 / ETC BS-05), & Consolidated Governance
-- ============================================================================
-- Forward migration (per-table transactions to avoid AB-BA 40P01 deadlocks):
--   1. Relational bridge FKs on public.jurisdictions (geo_division_id, geo_district_id,
--      geo_circle_id) + metadata on public.geo_circles + FK indexes.
--   2. Permanent geographical identity immutability triggers on geo_* and jurisdictions
--      (DELETE blocked, permanent codes/parents immutable, Circle names mutable only via authority).
--   3. Canonical roles DET (BPS-19), ETI (BPS-16), ETC (BPS-05 Notice Delivery Only)
--      + cadre_code on app_users + updated validate_role_scope().
--   4. Permanent public.sanctioned_posts table + idempotent 892-post provincial seed.
--   5. Decoupled public.post_assignments tenure table + partial unique indexes +
--      cadre/BPS enforcement trigger + single-direction legacy projection trigger.
--   6. Rewritten relational accessible_jurisdiction_ids, jurisdiction_contains,
--      active_actor (ETC isolated unless explicitly requested), can_manage_target_role,
--      and scoped SELECT RLS policies.
--   7. Authoritative governance, posting, relief, renaming, Tehsil attachment,
--      sanctioning, and strict no-self-profile-edit RPCs.
-- ============================================================================

-- ============================================================================
-- 1. RELATIONAL GEOGRAPHICAL BRIDGE & FOREIGN KEY INDEXES
-- ============================================================================

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdictions' AND column_name = 'geo_division_id'
  ) THEN
    ALTER TABLE public.jurisdictions
      ADD COLUMN geo_division_id uuid NULL REFERENCES public.geo_divisions(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdictions' AND column_name = 'geo_district_id'
  ) THEN
    ALTER TABLE public.jurisdictions
      ADD COLUMN geo_district_id uuid NULL REFERENCES public.geo_districts(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurisdictions' AND column_name = 'geo_circle_id'
  ) THEN
    ALTER TABLE public.jurisdictions
      ADD COLUMN geo_circle_id uuid NULL REFERENCES public.geo_circles(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_jurisdictions_geo_division_id
  ON public.jurisdictions (geo_division_id)
  WHERE geo_division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jurisdictions_geo_district_id
  ON public.jurisdictions (geo_district_id)
  WHERE geo_district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jurisdictions_geo_circle_id
  ON public.jurisdictions (geo_circle_id)
  WHERE geo_circle_id IS NOT NULL;

-- Deterministic backfill across all canonical and legacy jurisdictions rows
UPDATE public.jurisdictions j
SET geo_division_id = d.id
FROM public.geo_divisions d
WHERE j.tier IN ('DIVISION', 'REGION')
  AND j.geo_division_id IS NULL
  AND (
    j.code = ('DIV_' || d.abbrev)
    OR lower(btrim(j.name)) = lower(btrim(d.name))
    OR lower(btrim(regexp_replace(d.name, '\s+Division$', '', 'i'))) = lower(btrim(j.name))
    OR (j.code = 'DIV_MULTAN' AND d.abbrev = 'MTN')
  );

UPDATE public.jurisdictions j
SET
  geo_district_id = d.id,
  geo_division_id = d.division_id
FROM public.geo_districts d
WHERE j.tier IN ('DISTRICT', 'ZONE')
  AND j.geo_district_id IS NULL
  AND (
    j.code = ('DIST_' || d.district_code)
    OR lower(btrim(j.name)) = lower(btrim(d.name))
  );

UPDATE public.jurisdictions j
SET
  geo_circle_id = c.id,
  geo_district_id = c.district_id,
  geo_division_id = c.division_id
FROM public.geo_circles c
WHERE j.tier = 'CIRCLE'
  AND j.geo_circle_id IS NULL
  AND j.code = c.circle_code;

UPDATE public.jurisdictions j
SET
  geo_circle_id = c.id,
  geo_district_id = c.district_id,
  geo_division_id = c.division_id
FROM public.geo_circles c
JOIN public.geo_districts gd ON gd.id = c.district_id
WHERE j.tier = 'CIRCLE'
  AND j.geo_circle_id IS NULL
  AND j.code ~ '^CIR_[A-Z]+_[0-9]+$'
  AND c.circle_number = regexp_replace(j.code, '^CIR_[A-Z]+_0*([0-9]+)$', '\1')::int
  AND gd.district_code = (
    CASE split_part(j.code, '_', 2)
      WHEN 'KHAN' THEN 'KWL'
      WHEN 'LOD' THEN 'LDH'
      WHEN 'MULTAN' THEN 'MTN'
      WHEN 'VEH' THEN 'VHR'
      ELSE split_part(j.code, '_', 2)
    END
  );
COMMIT;

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'geo_circles' AND column_name = 'office_address'
  ) THEN
    ALTER TABLE public.geo_circles ADD COLUMN office_address text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'geo_circles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.geo_circles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_geo_circles_district_id ON public.geo_circles (district_id);
CREATE INDEX IF NOT EXISTS idx_geo_circles_division_id ON public.geo_circles (division_id);
CREATE INDEX IF NOT EXISTS idx_geo_circles_tehsil_partial
  ON public.geo_circles (tehsil_id)
  WHERE tehsil_id IS NOT NULL;
COMMIT;

BEGIN;
CREATE INDEX IF NOT EXISTS idx_geo_tehsils_district_id ON public.geo_tehsils (district_id);
COMMIT;

BEGIN;
CREATE INDEX IF NOT EXISTS idx_geo_districts_division_id ON public.geo_districts (division_id);
COMMIT;

-- ============================================================================
-- 2. PERMANENT GEOGRAPHICAL IDENTITY IMMUTABILITY TRIGGERS
-- ============================================================================

BEGIN;
CREATE OR REPLACE FUNCTION ptas_private.enforce_geo_identity_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Permanent geographical entity in %.% cannot be deleted',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'geo_divisions' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.division_code IS DISTINCT FROM OLD.division_code
       OR NEW.abbrev IS DISTINCT FROM OLD.abbrev THEN
      RAISE EXCEPTION 'Permanent division identifier (id/division_code/abbrev) is immutable and cannot be modified'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'geo_districts' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.division_id IS DISTINCT FROM OLD.division_id
       OR NEW.district_code IS DISTINCT FROM OLD.district_code
       OR NEW.pbs_code IS DISTINCT FROM OLD.pbs_code THEN
      RAISE EXCEPTION 'Permanent district identifier (id/division_id/district_code/pbs_code) is immutable and cannot be modified'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'geo_tehsils' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.district_id IS DISTINCT FROM OLD.district_id
       OR NEW.division_id IS DISTINCT FROM OLD.division_id
       OR NEW.tehsil_code IS DISTINCT FROM OLD.tehsil_code THEN
      RAISE EXCEPTION 'Permanent tehsil identifier (id/district_id/division_id/tehsil_code) is immutable and cannot be modified'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'geo_circles' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.circle_code IS DISTINCT FROM OLD.circle_code
       OR NEW.circle_number IS DISTINCT FROM OLD.circle_number
       OR NEW.district_id IS DISTINCT FROM OLD.district_id
       OR NEW.division_id IS DISTINCT FROM OLD.division_id
       OR NEW.is_immutable IS DISTINCT FROM OLD.is_immutable THEN
      RAISE EXCEPTION 'Permanent circle identifier (id/circle_code/circle_number/district_id/division_id) is immutable and cannot be modified'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.tehsil_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.geo_tehsils gt
        WHERE gt.id = NEW.tehsil_id
          AND gt.district_id = NEW.district_id
          AND gt.is_active = true
      ) THEN
        RAISE EXCEPTION 'Target Tehsil must be an active Tehsil belonging to the same District'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    NEW.updated_at := now();
  ELSIF TG_TABLE_NAME = 'jurisdictions' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.tier IS DISTINCT FROM OLD.tier THEN
      RAISE EXCEPTION 'Permanent jurisdiction identifier (id/code/tier) is immutable and cannot be modified'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_geo_divisions_identity_immutable ON public.geo_divisions;
CREATE TRIGGER trg_geo_divisions_identity_immutable
  BEFORE UPDATE OR DELETE ON public.geo_divisions
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_geo_identity_immutability();
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_geo_districts_identity_immutable ON public.geo_districts;
CREATE TRIGGER trg_geo_districts_identity_immutable
  BEFORE UPDATE OR DELETE ON public.geo_districts
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_geo_identity_immutability();
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_geo_tehsils_identity_immutable ON public.geo_tehsils;
CREATE TRIGGER trg_geo_tehsils_identity_immutable
  BEFORE UPDATE OR DELETE ON public.geo_tehsils
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_geo_identity_immutability();
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_geo_circles_identity_immutable ON public.geo_circles;
CREATE TRIGGER trg_geo_circles_identity_immutable
  BEFORE UPDATE OR DELETE ON public.geo_circles
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_geo_identity_immutability();
COMMIT;

BEGIN;
DROP TRIGGER IF EXISTS trg_jurisdictions_identity_immutable ON public.jurisdictions;
CREATE TRIGGER trg_jurisdictions_identity_immutable
  BEFORE UPDATE OR DELETE ON public.jurisdictions
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_geo_identity_immutability();
COMMIT;

-- ============================================================================
-- 3. CANONICAL CADRE ROLES, OFFICER CADRE ATTRIBUTE & ROLE SCOPE TRIGGER
-- ============================================================================

BEGIN;
INSERT INTO public.roles (code, description)
VALUES
  ('DET', 'Director Excise & Taxation (BPS-19) — Divisional / Regional Supervisory & Appellate Authority'),
  ('ETO', 'Excise & Taxation Officer (BPS-17) — District / Zone Assessing Authority'),
  ('ETI', 'Excise & Taxation Inspector (BPS-16) — Circle Incharge & Field Assessment Officer'),
  ('ETC', 'Excise & Taxation Constable (BPS-05) — Circle Notice Delivery Personnel (Notice Delivery Only)')
ON CONFLICT (code) DO UPDATE
SET description = excluded.description;
COMMIT;

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users' AND column_name = 'cadre_code'
  ) THEN
    ALTER TABLE public.app_users ADD COLUMN cadre_code text NULL;
  END IF;
END;
$$;

-- Backfill cadre_code deterministically from active role assignment
UPDATE public.app_users u
SET
  cadre_code = coalesce(
    (
      SELECT CASE upper(ur.role_code)
        WHEN 'DIRECTOR' THEN 'DET'
        WHEN 'INSPECTOR' THEN 'ETI'
        WHEN 'DET' THEN 'DET'
        WHEN 'ETO' THEN 'ETO'
        WHEN 'ETI' THEN 'ETI'
        WHEN 'ETC' THEN 'ETC'
        WHEN 'ADMIN' THEN 'ADMIN'
        WHEN 'FINANCE' THEN 'FINANCE'
        WHEN 'AUDITOR' THEN 'AUDITOR'
        ELSE 'ETI'
      END
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
      ORDER BY (ur.valid_to IS NULL) DESC, ur.valid_from DESC
      LIMIT 1
    ),
    'ETI'
  ),
  bps_scale = coalesce(
    u.bps_scale,
    CASE (
      SELECT CASE upper(ur.role_code)
        WHEN 'DIRECTOR' THEN 'DET'
        WHEN 'INSPECTOR' THEN 'ETI'
        ELSE upper(ur.role_code)
      END
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
      ORDER BY (ur.valid_to IS NULL) DESC, ur.valid_from DESC
      LIMIT 1
    )
      WHEN 'DET' THEN 19::smallint
      WHEN 'ETO' THEN 17::smallint
      WHEN 'ETI' THEN 16::smallint
      WHEN 'ETC' THEN 5::smallint
      ELSE 17::smallint
    END
  )
WHERE u.cadre_code IS NULL OR u.bps_scale IS NULL;

UPDATE public.app_users
SET bps_scale = 16::smallint
WHERE cadre_code = 'ETI' AND bps_scale IS DISTINCT FROM 16::smallint;

ALTER TABLE public.app_users ALTER COLUMN cadre_code SET DEFAULT 'ETI';
ALTER TABLE public.app_users ALTER COLUMN cadre_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_users'::regclass AND conname = 'chk_app_users_cadre_code'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT chk_app_users_cadre_code
      CHECK (cadre_code IN ('ADMIN', 'DET', 'ETO', 'ETI', 'ETC', 'FINANCE', 'AUDITOR'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_users'::regclass AND conname = 'chk_app_users_bps_scale'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT chk_app_users_bps_scale
      CHECK (bps_scale IS NULL OR (bps_scale BETWEEN 1 AND 22));
  END IF;
END;
$$;
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION ptas_private.validate_role_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_assigned_tier text;
BEGIN
  SELECT tier INTO v_assigned_tier FROM public.jurisdictions WHERE id = NEW.jurisdiction_id;
  IF v_assigned_tier IS NULL THEN
    RAISE EXCEPTION 'assigned jurisdiction not found' USING ERRCODE = '23503';
  END IF;

  IF NEW.role_code IN ('INSPECTOR', 'ETI', 'ETC') AND v_assigned_tier <> 'CIRCLE' THEN
    RAISE EXCEPTION '% must be assigned to a Circle', NEW.role_code USING ERRCODE = '23514';
  ELSIF NEW.role_code = 'ETO' AND v_assigned_tier NOT IN ('DISTRICT', 'ZONE') THEN
    RAISE EXCEPTION 'ETO must be assigned to a District or Zone' USING ERRCODE = '23514';
  ELSIF NEW.role_code IN ('DIRECTOR', 'DET') AND v_assigned_tier NOT IN ('DIVISION', 'REGION') THEN
    RAISE EXCEPTION '% must be assigned to a Division or Region', NEW.role_code USING ERRCODE = '23514';
  ELSIF NEW.role_code IN ('ADMIN', 'FINANCE', 'AUDITOR')
        AND v_assigned_tier NOT IN ('DIVISION', 'REGION', 'DISTRICT', 'ZONE') THEN
    RAISE EXCEPTION '% must be anchored at Division/Region or District/Zone', NEW.role_code USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
COMMIT;

-- ============================================================================
-- 4. PERMANENT SANCTIONED POSTS (892 INITIAL POSTS; DET IS STRICTLY BPS-19)
-- ============================================================================

BEGIN;
CREATE TABLE IF NOT EXISTS public.sanctioned_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_code text NOT NULL UNIQUE,
  post_title text NOT NULL,
  role_code text NOT NULL REFERENCES public.roles(code),
  cadre_code text NOT NULL,
  jurisdiction_tier text NOT NULL,
  division_id uuid NOT NULL REFERENCES public.geo_divisions(id) ON DELETE RESTRICT,
  district_id uuid NULL REFERENCES public.geo_districts(id) ON DELETE RESTRICT,
  circle_id uuid NULL REFERENCES public.geo_circles(id) ON DELETE RESTRICT,
  legacy_jurisdiction_id uuid NULL REFERENCES public.jurisdictions(id) ON DELETE RESTRICT,
  post_sequence smallint NOT NULL DEFAULT 1,
  min_bps smallint NOT NULL,
  max_bps smallint NOT NULL,
  is_permanent boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  sanctioned_order_no text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sanctioned_posts_cadre_eq_role CHECK (cadre_code = role_code),
  CONSTRAINT chk_sanctioned_posts_seq CHECK (post_sequence BETWEEN 1 AND 99),
  CONSTRAINT chk_sanctioned_posts_status CHECK (status IN ('ACTIVE', 'ABOLISHED')),
  CONSTRAINT chk_sanctioned_posts_bps CHECK (min_bps BETWEEN 1 AND 22 AND max_bps BETWEEN 1 AND 22 AND max_bps >= min_bps),
  CONSTRAINT chk_sanctioned_posts_tier_anchor CHECK (
    (jurisdiction_tier = 'DIVISION' AND role_code = 'DET' AND district_id IS NULL AND circle_id IS NULL AND min_bps = 19 AND max_bps = 19)
    OR (jurisdiction_tier = 'DISTRICT' AND role_code = 'ETO' AND district_id IS NOT NULL AND circle_id IS NULL AND min_bps = 17 AND max_bps = 17)
    OR (jurisdiction_tier = 'CIRCLE' AND role_code = 'ETI' AND district_id IS NOT NULL AND circle_id IS NOT NULL AND min_bps = 16 AND max_bps = 16)
    OR (jurisdiction_tier = 'CIRCLE' AND role_code = 'ETC' AND district_id IS NOT NULL AND circle_id IS NOT NULL AND min_bps = 5 AND max_bps = 5)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sanctioned_posts_anchor_seq
  ON public.sanctioned_posts (
    jurisdiction_tier,
    role_code,
    division_id,
    coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(circle_id, '00000000-0000-0000-0000-000000000000'::uuid),
    post_sequence
  );

CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_division_id ON public.sanctioned_posts (division_id);
CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_district_id
  ON public.sanctioned_posts (district_id)
  WHERE district_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_circle_id
  ON public.sanctioned_posts (circle_id)
  WHERE circle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_legacy_jur_id
  ON public.sanctioned_posts (legacy_jurisdiction_id)
  WHERE legacy_jurisdiction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_role_status
  ON public.sanctioned_posts (role_code, status);

ALTER TABLE public.sanctioned_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sanctioned_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sanctioned_posts TO authenticated;

CREATE OR REPLACE FUNCTION ptas_private.enforce_sanctioned_post_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Permanent sanctioned post in public.sanctioned_posts cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.post_code IS DISTINCT FROM OLD.post_code
     OR NEW.role_code IS DISTINCT FROM OLD.role_code
     OR NEW.cadre_code IS DISTINCT FROM OLD.cadre_code
     OR NEW.jurisdiction_tier IS DISTINCT FROM OLD.jurisdiction_tier
     OR NEW.division_id IS DISTINCT FROM OLD.division_id
     OR NEW.district_id IS DISTINCT FROM OLD.district_id
     OR NEW.circle_id IS DISTINCT FROM OLD.circle_id
     OR NEW.post_sequence IS DISTINCT FROM OLD.post_sequence
     OR NEW.min_bps IS DISTINCT FROM OLD.min_bps
     OR NEW.max_bps IS DISTINCT FROM OLD.max_bps
     OR NEW.is_permanent IS DISTINCT FROM OLD.is_permanent THEN
    RAISE EXCEPTION 'Permanent sanctioned post identity and anchor (post_code/role/cadre/jurisdiction/BPS) are immutable'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanctioned_posts_immutable ON public.sanctioned_posts;
CREATE TRIGGER trg_sanctioned_posts_immutable
  BEFORE UPDATE OR DELETE ON public.sanctioned_posts
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.enforce_sanctioned_post_immutability();

-- Seed 10 Divisional DET (BPS-19) permanent posts
INSERT INTO public.sanctioned_posts (
  post_code, post_title, role_code, cadre_code, jurisdiction_tier,
  division_id, district_id, circle_id, legacy_jurisdiction_id,
  post_sequence, min_bps, max_bps, is_permanent, status, sanctioned_order_no
)
SELECT
  'DET-' || gd.abbrev,
  'Director Excise & Taxation, ' || gd.name || ' (BPS-19)',
  'DET',
  'DET',
  'DIVISION',
  gd.id,
  NULL,
  NULL,
  (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE j.geo_division_id = gd.id
      AND j.tier IN ('DIVISION', 'REGION')
    ORDER BY (j.id::text LIKE '00000000-%') DESC, (j.code = 'DIV_' || gd.abbrev) DESC, j.created_at ASC
    LIMIT 1
  ),
  1,
  19,
  19,
  true,
  'ACTIVE',
  'PB-ET-SANCTION-DET-INITIAL'
FROM public.geo_divisions gd
ON CONFLICT (post_code) DO NOTHING;

-- Seed 42 District ETO (BPS-17) permanent posts
INSERT INTO public.sanctioned_posts (
  post_code, post_title, role_code, cadre_code, jurisdiction_tier,
  division_id, district_id, circle_id, legacy_jurisdiction_id,
  post_sequence, min_bps, max_bps, is_permanent, status, sanctioned_order_no
)
SELECT
  'ETO-' || gd.district_code,
  'Excise & Taxation Officer, District ' || gd.name || ' (BPS-17)',
  'ETO',
  'ETO',
  'DISTRICT',
  gd.division_id,
  gd.id,
  NULL,
  (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE j.geo_district_id = gd.id
      AND j.tier IN ('DISTRICT', 'ZONE')
    ORDER BY (j.id::text LIKE '00000000-%') DESC, (j.code = 'DIST_' || gd.district_code) DESC, j.created_at ASC
    LIMIT 1
  ),
  1,
  17,
  17,
  true,
  'ACTIVE',
  'PB-ET-SANCTION-ETO-INITIAL'
FROM public.geo_districts gd
ON CONFLICT (post_code) DO NOTHING;

-- Seed 420 Circle ETI (BPS-16) permanent posts
INSERT INTO public.sanctioned_posts (
  post_code, post_title, role_code, cadre_code, jurisdiction_tier,
  division_id, district_id, circle_id, legacy_jurisdiction_id,
  post_sequence, min_bps, max_bps, is_permanent, status, sanctioned_order_no
)
SELECT
  'ETI-' || gc.circle_code,
  'Excise & Taxation Inspector, ' || gc.name || ' (' || gc.circle_code || ')',
  'ETI',
  'ETI',
  'CIRCLE',
  gc.division_id,
  gc.district_id,
  gc.id,
  (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE j.geo_circle_id = gc.id
      AND j.tier = 'CIRCLE'
    ORDER BY (j.id::text LIKE '00000000-%') DESC, (j.code = gc.circle_code) DESC, j.created_at ASC
    LIMIT 1
  ),
  1,
  16,
  16,
  true,
  'ACTIVE',
  'PB-ET-SANCTION-ETI-INITIAL'
FROM public.geo_circles gc
ON CONFLICT (post_code) DO NOTHING;

-- Seed 420 Circle ETC (BPS-05 Notice Delivery Only) permanent posts
INSERT INTO public.sanctioned_posts (
  post_code, post_title, role_code, cadre_code, jurisdiction_tier,
  division_id, district_id, circle_id, legacy_jurisdiction_id,
  post_sequence, min_bps, max_bps, is_permanent, status, sanctioned_order_no
)
SELECT
  'ETC-' || gc.circle_code,
  'Excise & Taxation Constable (Notice Delivery), ' || gc.name || ' (' || gc.circle_code || ')',
  'ETC',
  'ETC',
  'CIRCLE',
  gc.division_id,
  gc.district_id,
  gc.id,
  (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE j.geo_circle_id = gc.id
      AND j.tier = 'CIRCLE'
    ORDER BY (j.id::text LIKE '00000000-%') DESC, (j.code = gc.circle_code) DESC, j.created_at ASC
    LIMIT 1
  ),
  1,
  5,
  5,
  true,
  'ACTIVE',
  'PB-ET-SANCTION-ETC-INITIAL'
FROM public.geo_circles gc
ON CONFLICT (post_code) DO NOTHING;
COMMIT;

-- ============================================================================
-- 5. DECOUPLED POST ASSIGNMENTS (TENURE LEDGER) + SYNC & BACKFILL
-- ============================================================================

-- Neutralize superseded trigger function on user_jurisdiction_assignments before introducing post_assignments
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_sync_user_jurisdiction_to_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Superseded by ptas_private.sync_post_assignment_to_legacy() on public.post_assignments
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_user_jurisdiction_to_roles ON public.user_jurisdiction_assignments;
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS public.post_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.sanctioned_posts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  charge_type text NOT NULL DEFAULT 'SUBSTANTIVE',
  transfer_order_number text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NULL,
  assigned_by uuid NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  relieved_by uuid NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  handing_over_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_post_assignments_charge_type CHECK (
    charge_type IN ('SUBSTANTIVE', 'ADDITIONAL_CHARGE', 'LOOK_AFTER')
  ),
  CONSTRAINT chk_post_assignments_order_nonempty CHECK (length(btrim(transfer_order_number)) > 0),
  CONSTRAINT chk_post_assignments_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- At most one active incumbent per permanent post
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_assignments_active_post
  ON public.post_assignments (post_id)
  WHERE valid_to IS NULL;

-- At most one active SUBSTANTIVE post per officer
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_assignments_active_substantive_user
  ON public.post_assignments (user_id)
  WHERE valid_to IS NULL AND charge_type = 'SUBSTANTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_assignments_active_user_post
  ON public.post_assignments (user_id, post_id)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_post_assignments_user_id ON public.post_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_assignments_post_id ON public.post_assignments (post_id);
CREATE INDEX IF NOT EXISTS idx_post_assignments_active_user
  ON public.post_assignments (user_id)
  WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_assignments_assigned_by
  ON public.post_assignments (assigned_by)
  WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_assignments_relieved_by
  ON public.post_assignments (relieved_by)
  WHERE relieved_by IS NOT NULL;

ALTER TABLE public.post_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_assignments TO authenticated;

CREATE OR REPLACE FUNCTION ptas_private.validate_post_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.sanctioned_posts;
  v_user public.app_users;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Posting tenure records in public.post_assignments are immutable and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.valid_to IS NOT NULL THEN
      RAISE EXCEPTION 'Closed post assignment tenure cannot be modified or reopened'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.charge_type IS DISTINCT FROM OLD.charge_type
       OR NEW.transfer_order_number IS DISTINCT FROM OLD.transfer_order_number
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
      RAISE EXCEPTION 'Only valid_to, relieved_by, and handing_over_notes may be set when closing an active post assignment'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = NEW.post_id;
  IF v_post.id IS NULL OR v_post.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target sanctioned post must exist and remain ACTIVE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_user FROM public.app_users WHERE id = NEW.user_id;
  IF v_user.id IS NULL OR NOT v_user.active OR v_user.deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Target officer must be active before assignment to a permanent post'
      USING ERRCODE = '23514';
  END IF;

  IF v_user.cadre_code <> v_post.cadre_code THEN
    RAISE EXCEPTION 'Officer cadre (%) is ineligible for sanctioned post % (requires %)',
      v_user.cadre_code, v_post.post_code, v_post.cadre_code
      USING ERRCODE = '23514';
  END IF;

  IF v_user.bps_scale IS NULL OR v_user.bps_scale < v_post.min_bps OR v_user.bps_scale > v_post.max_bps THEN
    RAISE EXCEPTION 'Officer BPS-% is outside sanctioned post % BPS range (% to %)',
      coalesce(v_user.bps_scale::text, 'UNSET'), v_post.post_code, v_post.min_bps, v_post.max_bps
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ptas_private.sync_post_assignment_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.sanctioned_posts;
  v_legacy_role text;
  v_primary record;
  v_primary_role text;
  v_primary_jur uuid;
  v_existing_active_ur public.user_roles;
  v_close_ts timestamptz;
BEGIN
  SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = NEW.post_id;
  v_legacy_role := CASE v_post.role_code
    WHEN 'DET' THEN 'DIRECTOR'
    WHEN 'ETI' THEN 'INSPECTOR'
    ELSE v_post.role_code
  END;

  -- Project single post assignment row to user_jurisdiction_assignments
  IF NEW.valid_to IS NULL THEN
    UPDATE public.user_jurisdiction_assignments
    SET valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond')
    WHERE user_id = NEW.user_id
      AND valid_to IS NULL
      AND circle_id IS NOT DISTINCT FROM v_post.circle_id
      AND district_id IS NOT DISTINCT FROM v_post.district_id
      AND division_id IS NOT DISTINCT FROM v_post.division_id;

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
      NEW.user_id,
      v_legacy_role,
      v_post.circle_id,
      v_post.district_id,
      v_post.division_id,
      NEW.valid_from,
      NULL,
      (NEW.charge_type = 'SUBSTANTIVE'),
      NEW.assigned_by,
      NEW.transfer_order_number,
      NEW.handing_over_notes,
      now()
    );
  ELSE
    UPDATE public.user_jurisdiction_assignments
    SET
      valid_to = greatest(NEW.valid_to, valid_from + interval '1 millisecond'),
      handing_over_notes = coalesce(NEW.handing_over_notes, handing_over_notes)
    WHERE user_id = NEW.user_id
      AND valid_to IS NULL
      AND circle_id IS NOT DISTINCT FROM v_post.circle_id
      AND district_id IS NOT DISTINCT FROM v_post.district_id
      AND division_id IS NOT DISTINCT FROM v_post.division_id;
  END IF;

  -- Project single authoritative primary post to user_roles (respects user_roles_one_active_inspector)
  SELECT
    sp.role_code,
    coalesce(sp.legacy_jurisdiction_id, sp.circle_id, sp.district_id, sp.division_id) AS legacy_jurisdiction_id,
    pa.valid_from
  INTO v_primary
  FROM public.post_assignments pa
  JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
  WHERE pa.user_id = NEW.user_id
    AND pa.valid_to IS NULL
    AND sp.status = 'ACTIVE'
  ORDER BY (pa.charge_type = 'SUBSTANTIVE') DESC, pa.valid_from ASC
  LIMIT 1;

  IF v_primary IS NULL THEN
    -- Officer is now UNPOSTED: close post-based user_roles while preserving non-post roles
    UPDATE public.user_roles
    SET valid_to = greatest(coalesce(NEW.valid_to, clock_timestamp()), valid_from + interval '1 millisecond')
    WHERE user_id = NEW.user_id
      AND valid_to IS NULL
      AND role_code IN ('DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR', 'ETC');
  ELSE
    v_primary_role := CASE v_primary.role_code
      WHEN 'DET' THEN 'DIRECTOR'
      WHEN 'ETI' THEN 'INSPECTOR'
      ELSE v_primary.role_code
    END;
    v_primary_jur := v_primary.legacy_jurisdiction_id;

    SELECT * INTO v_existing_active_ur
    FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND valid_to IS NULL
    ORDER BY assigned_at DESC
    LIMIT 1;

    IF v_existing_active_ur.id IS NULL
       OR v_existing_active_ur.role_code IS DISTINCT FROM v_primary_role
       OR v_existing_active_ur.jurisdiction_id IS DISTINCT FROM v_primary_jur THEN
      v_close_ts := clock_timestamp();
      UPDATE public.user_roles
      SET valid_to = greatest(v_close_ts, valid_from + interval '1 millisecond')
      WHERE user_id = NEW.user_id
        AND valid_to IS NULL;

      INSERT INTO public.user_roles (
        id, user_id, role_code, jurisdiction_id, valid_from, valid_to, assigned_at
      ) VALUES (
        gen_random_uuid(),
        NEW.user_id,
        v_primary_role,
        v_primary_jur,
        now(),
        NULL,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_post_assignment ON public.post_assignments;
CREATE TRIGGER trg_validate_post_assignment
  BEFORE INSERT OR UPDATE OR DELETE ON public.post_assignments
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.validate_post_assignment();

DROP TRIGGER IF EXISTS trg_sync_post_assignments_to_legacy ON public.post_assignments;
CREATE TRIGGER trg_sync_post_assignments_to_legacy
  AFTER INSERT OR UPDATE ON public.post_assignments
  FOR EACH ROW
  EXECUTE FUNCTION ptas_private.sync_post_assignment_to_legacy();

-- Idempotent backfill of existing active officers into their permanent sanctioned posts
INSERT INTO public.post_assignments (
  post_id,
  user_id,
  charge_type,
  transfer_order_number,
  valid_from,
  valid_to,
  assigned_by,
  handing_over_notes
)
SELECT
  sp.id AS post_id,
  u.id AS user_id,
  CASE WHEN coalesce(uja.is_primary, true) THEN 'SUBSTANTIVE' ELSE 'ADDITIONAL_CHARGE' END AS charge_type,
  coalesce(nullif(btrim(uja.transfer_order_number), ''), 'INITIAL-CADRE-POSTING-' || sp.post_code),
  coalesce(uja.valid_from, ur.valid_from, u.created_at, now()),
  NULL,
  uja.assigned_by,
  uja.handing_over_notes
FROM public.app_users u
JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
LEFT JOIN public.user_jurisdiction_assignments uja ON uja.user_id = u.id AND uja.valid_to IS NULL
JOIN public.sanctioned_posts sp
  ON sp.role_code = (
    CASE upper(ur.role_code)
      WHEN 'DIRECTOR' THEN 'DET'
      WHEN 'INSPECTOR' THEN 'ETI'
      ELSE upper(ur.role_code)
    END
  )
  AND (
    (sp.jurisdiction_tier = 'CIRCLE' AND sp.circle_id = coalesce(uja.circle_id, j.geo_circle_id))
    OR (sp.jurisdiction_tier = 'DISTRICT' AND sp.district_id = coalesce(uja.district_id, j.geo_district_id))
    OR (sp.jurisdiction_tier = 'DIVISION' AND sp.division_id = coalesce(uja.division_id, j.geo_division_id))
  )
  AND sp.post_sequence = 1
WHERE u.active = true
  AND u.deactivated_at IS NULL
  AND u.cadre_code IN ('DET', 'ETO', 'ETI', 'ETC')
  AND NOT EXISTS (
    SELECT 1 FROM public.post_assignments pa WHERE pa.post_id = sp.id AND pa.valid_to IS NULL
  )
ON CONFLICT DO NOTHING;
COMMIT;

-- ============================================================================
-- 6. CANONICAL ROLE NORMALIZATION, RELATIONAL SCOPE & ACTOR HELPERS
-- ============================================================================

BEGIN;
CREATE OR REPLACE FUNCTION ptas_private.canonical_role_code(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE upper(btrim(coalesce(p_role, '')))
    WHEN 'DIRECTOR' THEN 'DET'
    WHEN 'INSPECTOR' THEN 'ETI'
    ELSE upper(btrim(coalesce(p_role, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION ptas_private.legacy_compat_role_code(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE upper(btrim(coalesce(p_role, '')))
    WHEN 'DET' THEN 'DIRECTOR'
    WHEN 'ETI' THEN 'INSPECTOR'
    ELSE upper(btrim(coalesce(p_role, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION ptas_private.accessible_jurisdiction_ids(p_root uuid)
RETURNS TABLE(jurisdiction_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE legacy_tree AS (
    SELECT j.id
    FROM public.jurisdictions j
    WHERE p_root IS NOT NULL AND j.id = p_root
    UNION ALL
    SELECT child.id
    FROM public.jurisdictions child
    JOIN legacy_tree parent ON child.parent_id = parent.id
  ),
  root_anchors AS (
    SELECT
      gd.id AS division_id,
      NULL::uuid AS district_id,
      NULL::uuid AS circle_id
    FROM public.geo_divisions gd
    WHERE p_root IS NOT NULL AND gd.id = p_root
    UNION ALL
    SELECT
      gd.division_id,
      gd.id AS district_id,
      NULL::uuid AS circle_id
    FROM public.geo_districts gd
    WHERE p_root IS NOT NULL AND gd.id = p_root
    UNION ALL
    SELECT
      gc.division_id,
      gc.district_id,
      gc.id AS circle_id
    FROM public.geo_circles gc
    WHERE p_root IS NOT NULL AND gc.id = p_root
    UNION ALL
    SELECT
      j.geo_division_id AS division_id,
      j.geo_district_id AS district_id,
      j.geo_circle_id AS circle_id
    FROM public.jurisdictions j
    WHERE p_root IS NOT NULL
      AND j.id = p_root
      AND (j.geo_division_id IS NOT NULL OR j.geo_district_id IS NOT NULL OR j.geo_circle_id IS NOT NULL)
  ),
  div_scope AS (
    SELECT DISTINCT division_id
    FROM root_anchors
    WHERE district_id IS NULL AND circle_id IS NULL AND division_id IS NOT NULL
  ),
  dist_scope AS (
    SELECT DISTINCT district_id
    FROM root_anchors
    WHERE circle_id IS NULL AND district_id IS NOT NULL
    UNION
    SELECT gd.id
    FROM public.geo_districts gd
    JOIN div_scope ds ON ds.division_id = gd.division_id
  ),
  cir_scope AS (
    SELECT DISTINCT circle_id
    FROM root_anchors
    WHERE circle_id IS NOT NULL
    UNION
    SELECT gc.id
    FROM public.geo_circles gc
    JOIN dist_scope dts ON dts.district_id = gc.district_id
  ),
  all_ids AS (
    SELECT p_root AS jurisdiction_id WHERE p_root IS NOT NULL
    UNION
    SELECT lt.id FROM legacy_tree lt
    UNION
    SELECT ds.division_id FROM div_scope ds
    UNION
    SELECT dts.district_id FROM dist_scope dts
    UNION
    SELECT gt.id FROM public.geo_tehsils gt JOIN dist_scope dts ON dts.district_id = gt.district_id
    UNION
    SELECT cs.circle_id FROM cir_scope cs
    UNION
    SELECT j.id FROM public.jurisdictions j JOIN div_scope ds ON j.geo_division_id = ds.division_id
    UNION
    SELECT j.id FROM public.jurisdictions j JOIN dist_scope dts ON j.geo_district_id = dts.district_id
    UNION
    SELECT j.id FROM public.jurisdictions j JOIN cir_scope cs ON j.geo_circle_id = cs.circle_id
  )
  SELECT jurisdiction_id FROM all_ids WHERE jurisdiction_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION ptas_private.jurisdiction_contains(p_root uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_root IS NOT NULL
    AND p_target IS NOT NULL
    AND (
      p_root = p_target
      OR EXISTS (
        SELECT 1
        FROM ptas_private.accessible_jurisdiction_ids(p_root) aj
        WHERE aj.jurisdiction_id = p_target
      )
    );
$$;

CREATE OR REPLACE FUNCTION ptas_private.active_actor(p_roles text[] DEFAULT NULL)
RETURNS TABLE(user_id uuid, role_code text, jurisdiction_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH post_actors AS (
    SELECT
      u.id AS user_id,
      sp.role_code AS raw_role,
      ptas_private.legacy_compat_role_code(sp.role_code) AS role_code,
      coalesce(sp.legacy_jurisdiction_id, sp.circle_id, sp.district_id, sp.division_id) AS jurisdiction_id,
      (pa.charge_type = 'SUBSTANTIVE') AS is_substantive,
      pa.valid_from
    FROM public.app_users u
    JOIN public.post_assignments pa ON pa.user_id = u.id
    JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.active = true
      AND u.deactivated_at IS NULL
      AND pa.valid_from <= now()
      AND (pa.valid_to IS NULL OR pa.valid_to > now())
      AND sp.status = 'ACTIVE'
  ),
  non_post_actors AS (
    SELECT
      u.id AS user_id,
      ur.role_code AS raw_role,
      ptas_private.legacy_compat_role_code(ur.role_code) AS role_code,
      ur.jurisdiction_id,
      true AS is_substantive,
      ur.valid_from
    FROM public.app_users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.active = true
      AND u.deactivated_at IS NULL
      AND ur.valid_from <= now()
      AND (ur.valid_to IS NULL OR ur.valid_to > now())
      AND (
        ptas_private.canonical_role_code(ur.role_code) IN ('ADMIN', 'FINANCE', 'AUDITOR')
        OR NOT EXISTS (
          SELECT 1
          FROM public.post_assignments pa2
          WHERE pa2.user_id = u.id
            AND pa2.valid_from <= now()
            AND (pa2.valid_to IS NULL OR pa2.valid_to > now())
        )
      )
  ),
  combined AS (
    SELECT * FROM post_actors
    UNION ALL
    SELECT * FROM non_post_actors
  )
  SELECT c.user_id, c.role_code, c.jurisdiction_id
  FROM combined c
  WHERE (
    p_roles IS NULL
    AND ptas_private.canonical_role_code(c.raw_role) <> 'ETC'
  ) OR (
    p_roles IS NOT NULL
    AND ptas_private.canonical_role_code(c.raw_role) = ANY (
      SELECT ptas_private.canonical_role_code(r) FROM unnest(p_roles) AS r
    )
  )
  ORDER BY c.is_substantive DESC, c.valid_from ASC;
$$;

CREATE OR REPLACE FUNCTION ptas_private.can_manage_target_role(
  p_actor_role text,
  p_target_role text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE ptas_private.canonical_role_code(p_actor_role)
    WHEN 'ADMIN' THEN ptas_private.canonical_role_code(p_target_role) IN ('DET', 'ETO', 'ETI', 'ETC', 'FINANCE', 'AUDITOR')
    WHEN 'DET' THEN ptas_private.canonical_role_code(p_target_role) IN ('ETO', 'ETI', 'ETC', 'FINANCE', 'AUDITOR')
    WHEN 'ETO' THEN ptas_private.canonical_role_code(p_target_role) IN ('ETI', 'ETC')
    ELSE false
  END;
$$;
COMMIT;

-- RLS policies for new and updated governance tables (single-table commits)
BEGIN;
DROP POLICY IF EXISTS sanctioned_posts_select ON public.sanctioned_posts;
CREATE POLICY sanctioned_posts_select
  ON public.sanctioned_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR', 'ETC', 'FINANCE', 'AUDITOR']) a
      WHERE a.role_code = 'ADMIN'
         OR coalesce(sanctioned_posts.circle_id, sanctioned_posts.district_id, sanctioned_posts.division_id) IN (
              SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
            )
    )
  );
COMMIT;

BEGIN;
DROP POLICY IF EXISTS post_assignments_select ON public.post_assignments;
CREATE POLICY post_assignments_select
  ON public.post_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT au.id FROM public.app_users au WHERE au.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM ptas_private.active_actor(ARRAY['ADMIN']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['DIRECTOR', 'DET', 'ETO']) a
      JOIN public.sanctioned_posts sp ON sp.id = post_assignments.post_id
      WHERE coalesce(sp.circle_id, sp.district_id, sp.division_id) IN (
        SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
      )
    )
  );
COMMIT;

BEGIN;
DROP POLICY IF EXISTS app_users_select ON public.app_users;
CREATE POLICY app_users_select
  ON public.app_users
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM ptas_private.active_actor(ARRAY['ADMIN']) a
    )
    OR EXISTS (
      SELECT 1
      FROM ptas_private.active_actor(ARRAY['DIRECTOR', 'DET', 'ETO']) a
      WHERE EXISTS (
        SELECT 1
        FROM public.post_assignments pa
        JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
        WHERE pa.user_id = app_users.id
          AND pa.valid_to IS NULL
          AND coalesce(sp.circle_id, sp.district_id, sp.division_id) IN (
            SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = app_users.id
          AND ur.valid_to IS NULL
          AND ur.jurisdiction_id IN (
            SELECT ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id)
          )
      )
    )
  );
COMMIT;

-- ============================================================================
-- 7. GOVERNANCE, POSTING, RENAMING, TEHSIL ATTACHMENT & OFFICER RPCs
-- ============================================================================

-- Helper for verifying jurisdictional scope of an officer (active OR last closed tenure for UNPOSTED staff)
BEGIN;
CREATE OR REPLACE FUNCTION ptas_private.officer_scope_jurisdiction_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT coalesce(sp.circle_id, sp.district_id, sp.division_id, sp.legacy_jurisdiction_id)
      FROM public.post_assignments pa
      JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
      WHERE pa.user_id = p_user_id
      ORDER BY (pa.valid_to IS NULL) DESC, (pa.charge_type = 'SUBSTANTIVE') DESC, pa.valid_from DESC
      LIMIT 1
    ),
    (
      SELECT ur.jurisdiction_id
      FROM public.user_roles ur
      WHERE ur.user_id = p_user_id
      ORDER BY (ur.valid_to IS NULL) DESC, ur.valid_from DESC
      LIMIT 1
    ),
    (
      SELECT coalesce(uja.circle_id, uja.district_id, uja.division_id)
      FROM public.user_jurisdiction_assignments uja
      WHERE uja.user_id = p_user_id
      ORDER BY (uja.valid_to IS NULL) DESC, uja.valid_from DESC
      LIMIT 1
    )
  );
$$;

-- 7.1 resolve_my_ptas_actor() (returns primary post, canonical cadre, and additional charge posts)
CREATE OR REPLACE FUNCTION public.resolve_my_ptas_actor()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH my_user AS (
    SELECT u.*
    FROM public.app_users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.active = true
      AND u.deactivated_at IS NULL
    LIMIT 1
  ),
  active_posts AS (
    SELECT
      pa.id AS assignment_id,
      pa.charge_type,
      pa.transfer_order_number,
      pa.valid_from,
      sp.id AS post_id,
      sp.post_code,
      sp.post_title,
      sp.role_code AS post_role_code,
      sp.jurisdiction_tier,
      coalesce(sp.legacy_jurisdiction_id, sp.circle_id, sp.district_id, sp.division_id) AS jurisdiction_id,
      coalesce(gc.circle_code, gd.district_code, gdiv.abbrev, j.code) AS jurisdiction_code,
      coalesce(gc.name, gd.name, gdiv.name, j.name) AS jurisdiction_name,
      coalesce(gc.circle_code IS NOT NULL OR sp.jurisdiction_tier = 'CIRCLE', false) AS is_circle
    FROM my_user u
    JOIN public.post_assignments pa ON pa.user_id = u.id
    JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
    LEFT JOIN public.geo_circles gc ON gc.id = sp.circle_id
    LEFT JOIN public.geo_districts gd ON gd.id = sp.district_id
    LEFT JOIN public.geo_divisions gdiv ON gdiv.id = sp.division_id
    LEFT JOIN public.jurisdictions j ON j.id = sp.legacy_jurisdiction_id
    WHERE pa.valid_from <= now()
      AND (pa.valid_to IS NULL OR pa.valid_to > now())
      AND sp.status = 'ACTIVE'
    ORDER BY (pa.charge_type = 'SUBSTANTIVE') DESC, pa.valid_from ASC
  ),
  primary_post AS (
    SELECT * FROM active_posts LIMIT 1
  ),
  fallback_role AS (
    SELECT
      ur.role_code,
      ur.jurisdiction_id,
      j.code AS jurisdiction_code,
      j.name AS jurisdiction_name,
      j.tier AS jurisdiction_tier
    FROM my_user u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    WHERE ur.valid_from <= now()
      AND (ur.valid_to IS NULL OR ur.valid_to > now())
    ORDER BY ur.role_code ASC, ur.valid_from DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM primary_post) THEN (
      SELECT jsonb_build_object(
        'user_id', u.id,
        'display_name', u.display_name,
        'role', ptas_private.canonical_role_code(pp.post_role_code),
        'cadre_code', u.cadre_code,
        'bps_scale', u.bps_scale,
        'post_id', pp.post_id,
        'post_code', pp.post_code,
        'post_title', pp.post_title,
        'charge_type', pp.charge_type,
        'jurisdiction_id', pp.jurisdiction_id,
        'jurisdiction_code', pp.jurisdiction_code,
        'jurisdiction_name', pp.jurisdiction_name,
        'jurisdiction_tier', pp.jurisdiction_tier,
        'additional_posts', coalesce(
          (
            SELECT jsonb_agg(jsonb_build_object(
              'post_id', ap.post_id,
              'post_code', ap.post_code,
              'post_title', ap.post_title,
              'role', ap.post_role_code,
              'charge_type', ap.charge_type,
              'jurisdiction_id', ap.jurisdiction_id,
              'jurisdiction_code', ap.jurisdiction_code,
              'jurisdiction_name', ap.jurisdiction_name,
              'jurisdiction_tier', ap.jurisdiction_tier
            ))
            FROM active_posts ap
            WHERE ap.assignment_id <> pp.assignment_id
          ),
          '[]'::jsonb
        )
      )
      FROM my_user u
      CROSS JOIN primary_post pp
    )
    ELSE (
      SELECT jsonb_build_object(
        'user_id', u.id,
        'display_name', u.display_name,
        'role', ptas_private.canonical_role_code(fr.role_code),
        'cadre_code', u.cadre_code,
        'bps_scale', u.bps_scale,
        'post_id', NULL,
        'post_code', NULL,
        'post_title', NULL,
        'charge_type', NULL,
        'jurisdiction_id', fr.jurisdiction_id,
        'jurisdiction_code', fr.jurisdiction_code,
        'jurisdiction_name', fr.jurisdiction_name,
        'jurisdiction_tier', fr.jurisdiction_tier,
        'additional_posts', '[]'::jsonb
      )
      FROM my_user u
      JOIN fallback_role fr ON true
    )
  END;
$$;

-- 7.2 get_jurisdiction_governance_overview() (Authoritative Divisions/Districts/Tehsils/Circles/Posts)
CREATE OR REPLACE FUNCTION public.get_jurisdiction_governance_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_actor_canon_role text;
  v_actor_user public.app_users;
  v_actor_jur public.jurisdictions;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR']) a
  LIMIT 1;

  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Authorised PTAS administrative or field officer session required'
      USING ERRCODE = '42501';
  END IF;

  v_actor_canon_role := ptas_private.canonical_role_code(v_actor.role_code);
  SELECT * INTO v_actor_user FROM public.app_users WHERE id = v_actor.user_id;
  SELECT * INTO v_actor_jur FROM public.jurisdictions WHERE id = v_actor.jurisdiction_id;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor_canon_role <> 'ADMIN'
  ),
  unit_stats AS MATERIALIZED (
    SELECT
      coalesce(j.geo_circle_id, p.circle_id) AS resolved_circle_id,
      count(*)::int AS units_count,
      count(*) FILTER (WHERE p.state = 'APPROVED')::int AS approved_units_count,
      coalesce(sum(p.annual_rate_pkr) FILTER (WHERE p.state = 'APPROVED'), 0)::numeric AS total_assessed_demand
    FROM public.pft3_assessment_units p
    LEFT JOIN public.jurisdictions j ON j.id = p.circle_id
    WHERE p.circle_id IS NOT NULL
    GROUP BY coalesce(j.geo_circle_id, p.circle_id)
  ),
  in_scope_circles AS MATERIALIZED (
    SELECT gc.*
    FROM public.geo_circles gc
    WHERE gc.is_active = true
      AND (
        v_actor_canon_role = 'ADMIN'
        OR EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = gc.id)
      )
  ),
  in_scope_districts AS MATERIALIZED (
    SELECT gd.*
    FROM public.geo_districts gd
    WHERE gd.is_active = true
      AND (
        v_actor_canon_role = 'ADMIN'
        OR EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = gd.id)
        OR EXISTS (SELECT 1 FROM in_scope_circles ic WHERE ic.district_id = gd.id)
      )
  ),
  in_scope_divisions AS MATERIALIZED (
    SELECT gdiv.*
    FROM public.geo_divisions gdiv
    WHERE gdiv.is_active = true
      AND (
        v_actor_canon_role = 'ADMIN'
        OR EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = gdiv.id)
        OR EXISTS (SELECT 1 FROM in_scope_districts idst WHERE idst.division_id = gdiv.id)
      )
  ),
  in_scope_tehsils AS MATERIALIZED (
    SELECT
      gt.id,
      gt.district_id,
      gt.division_id,
      gt.tehsil_code,
      gt.name,
      count(ic.id)::int AS attached_circles_count
    FROM public.geo_tehsils gt
    JOIN in_scope_districts idst ON idst.id = gt.district_id
    LEFT JOIN in_scope_circles ic ON ic.tehsil_id = gt.id
    WHERE gt.is_active = true
    GROUP BY gt.id, gt.district_id, gt.division_id, gt.tehsil_code, gt.name
  ),
  in_scope_posts AS MATERIALIZED (
    SELECT
      sp.id AS post_id,
      sp.post_code,
      sp.post_title,
      sp.role_code,
      sp.cadre_code,
      sp.jurisdiction_tier,
      sp.division_id,
      gdiv.name AS division_name,
      gdiv.abbrev AS division_abbrev,
      sp.district_id,
      gd.name AS district_name,
      gd.district_code,
      sp.circle_id,
      gc.circle_code,
      gc.name AS circle_name,
      sp.post_sequence,
      sp.min_bps,
      sp.max_bps,
      sp.is_permanent,
      sp.status,
      sp.sanctioned_order_no,
      (pa.id IS NULL) AS is_vacant,
      pa.id AS assignment_id,
      pa.user_id AS incumbent_user_id,
      u.display_name AS incumbent_name,
      CASE
        WHEN v_actor_canon_role IN ('ADMIN', 'DET', 'ETO') OR u.id = v_actor.user_id THEN u.email
        ELSE NULL
      END AS incumbent_email,
      CASE
        WHEN v_actor_canon_role IN ('ADMIN', 'DET', 'ETO') OR u.id = v_actor.user_id THEN u.phone
        ELSE NULL
      END AS incumbent_phone,
      u.ppo_number AS incumbent_ppo,
      u.bps_scale AS incumbent_bps,
      u.cadre_code AS incumbent_cadre,
      pa.charge_type,
      pa.transfer_order_number,
      pa.valid_from
    FROM public.sanctioned_posts sp
    JOIN public.geo_divisions gdiv ON gdiv.id = sp.division_id
    LEFT JOIN public.geo_districts gd ON gd.id = sp.district_id
    LEFT JOIN public.geo_circles gc ON gc.id = sp.circle_id
    LEFT JOIN public.post_assignments pa ON pa.post_id = sp.id AND pa.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = pa.user_id AND u.active = true
    WHERE (
      v_actor_canon_role = 'ADMIN'
      OR (sp.circle_id IS NOT NULL AND EXISTS (SELECT 1 FROM in_scope_circles ic WHERE ic.id = sp.circle_id))
      OR (sp.circle_id IS NULL AND sp.district_id IS NOT NULL AND EXISTS (SELECT 1 FROM in_scope_districts idst WHERE idst.id = sp.district_id))
      OR (sp.circle_id IS NULL AND sp.district_id IS NULL AND EXISTS (SELECT 1 FROM in_scope_divisions idv WHERE idv.id = sp.division_id))
    )
    ORDER BY
      CASE sp.role_code WHEN 'DET' THEN 1 WHEN 'ETO' THEN 2 WHEN 'ETI' THEN 3 WHEN 'ETC' THEN 4 ELSE 5 END,
      gd.district_code NULLS FIRST,
      gc.circle_number NULLS FIRST,
      sp.post_sequence ASC
  ),
  circle_payload AS (
    SELECT
      ic.id AS circle_id,
      ic.circle_code,
      ic.circle_number,
      ic.name AS circle_name,
      coalesce(ic.office_address, '') AS office_address,
      ic.is_immutable,
      ic.tehsil_id,
      gt.name AS tehsil_name,
      gt.tehsil_code::text AS tehsil_code,
      gd.id AS district_id,
      gd.name AS district_name,
      gd.district_code,
      gdiv.id AS division_id,
      gdiv.name AS division_name,
      coalesce(us.units_count, 0)::int AS units_count,
      coalesce(us.approved_units_count, 0)::int AS approved_units_count,
      coalesce(us.total_assessed_demand, 0)::numeric AS total_assessed_demand,
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(ip) ORDER BY CASE ip.role_code WHEN 'ETI' THEN 1 WHEN 'ETC' THEN 2 ELSE 3 END, ip.post_sequence ASC)
          FROM in_scope_posts ip
          WHERE ip.circle_id = ic.id
        ),
        '[]'::jsonb
      ) AS posts
    FROM in_scope_circles ic
    JOIN in_scope_districts gd ON gd.id = ic.district_id
    JOIN in_scope_divisions gdiv ON gdiv.id = ic.division_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = ic.tehsil_id
    LEFT JOIN unit_stats us ON us.resolved_circle_id = ic.id
    ORDER BY gd.district_code, ic.circle_number
  )
  SELECT jsonb_build_object(
    'actor', jsonb_build_object(
      'user_id', v_actor.user_id,
      'role_code', v_actor_canon_role,
      'cadre_code', v_actor_user.cadre_code,
      'bps_scale', v_actor_user.bps_scale,
      'jurisdiction_id', v_actor.jurisdiction_id,
      'jurisdiction_tier', v_actor_jur.tier,
      'can_manage_posts', v_actor_canon_role IN ('ADMIN', 'DET', 'ETO'),
      'can_rename_circles', v_actor_canon_role IN ('ADMIN', 'DET', 'ETO'),
      'can_rename_districts', v_actor_canon_role IN ('ADMIN', 'DET'),
      'can_rename_divisions', v_actor_canon_role = 'ADMIN',
      'can_sanction_circle_posts', v_actor_canon_role IN ('ADMIN', 'DET')
    ),
    'divisions', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.name) FROM in_scope_divisions d), '[]'::jsonb),
    'districts', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.district_code) FROM in_scope_districts d), '[]'::jsonb),
    'tehsils', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name) FROM in_scope_tehsils t), '[]'::jsonb),
    'circles', coalesce((SELECT jsonb_agg(to_jsonb(cp)) FROM circle_payload cp), '[]'::jsonb),
    'supervisory_posts', coalesce(
      (SELECT jsonb_agg(to_jsonb(ip)) FROM in_scope_posts ip WHERE ip.jurisdiction_tier IN ('DIVISION', 'DISTRICT')),
      '[]'::jsonb
    ),
    'posts', coalesce((SELECT jsonb_agg(to_jsonb(ip)) FROM in_scope_posts ip), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- 7.3 Backward-compatible get_district_governance_matrix() built purely relationally on sanctioned_posts
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
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor.role_code <> 'ADMIN'
  ),
  unit_stats AS MATERIALIZED (
    SELECT
      coalesce(j.geo_circle_id, p.circle_id) AS resolved_circle_id,
      count(*)::int AS units_count,
      count(*) FILTER (WHERE p.state = 'APPROVED')::int AS approved_units_count,
      coalesce(sum(p.annual_rate_pkr) FILTER (WHERE p.state = 'APPROVED'), 0)::numeric AS total_assessed_demand
    FROM public.pft3_assessment_units p
    LEFT JOIN public.jurisdictions j ON j.id = p.circle_id
    WHERE p.circle_id IS NOT NULL
    GROUP BY coalesce(j.geo_circle_id, p.circle_id)
  ),
  circle_stats AS (
    SELECT
      gc.id AS circle_id,
      gc.circle_code,
      gc.name AS circle_name,
      coalesce(gc.office_address, '') AS circle_address,
      coalesce(gt.name, 'District HQ (Unattached)') AS tehsil_name,
      coalesce(gt.tehsil_code::text, '') AS tehsil_code,
      gt.id AS tehsil_id,
      gd.id AS district_id,
      gd.name AS district_name,
      gd.district_code,
      u.id AS inspector_id,
      u.display_name AS inspector_name,
      CASE
        WHEN v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET', 'ETO') OR u.id = v_actor.user_id
          THEN u.phone
        ELSE NULL
      END AS inspector_phone,
      CASE
        WHEN v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET', 'ETO') OR u.id = v_actor.user_id
          THEN u.email
        ELSE NULL
      END AS inspector_email,
      u.ppo_number AS inspector_ppo,
      (pa.charge_type = 'SUBSTANTIVE') AS is_primary_charge,
      pa.transfer_order_number,
      pa.valid_from AS posting_date,
      coalesce(us.units_count, 0)::int AS units_count,
      coalesce(us.approved_units_count, 0)::int AS approved_units_count,
      coalesce(us.total_assessed_demand, 0)::numeric AS total_assessed_demand
    FROM public.geo_circles gc
    JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.sanctioned_posts sp
      ON sp.circle_id = gc.id
      AND sp.role_code = 'ETI'
      AND sp.post_sequence = 1
    LEFT JOIN public.post_assignments pa ON pa.post_id = sp.id AND pa.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = pa.user_id AND u.active = true
    LEFT JOIN unit_stats us ON us.resolved_circle_id = gc.id
    WHERE gc.is_active = true
      AND (
        v_actor.role_code = 'ADMIN'
        OR EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = gc.id)
      )
    ORDER BY gd.district_code, gc.circle_number
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$$;

-- 7.4 assign_officer_to_post() (Decoupled permanent post staffing)
CREATE OR REPLACE FUNCTION public.assign_officer_to_post(
  p_post_id uuid,
  p_user_id uuid,
  p_charge_type text DEFAULT 'SUBSTANTIVE',
  p_transfer_order_number text DEFAULT NULL,
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
  v_post public.sanctioned_posts;
  v_user public.app_users;
  v_charge text;
  v_order text;
  v_notes text;
  v_post_scope_id uuid;
  v_user_current_scope_id uuid;
  v_existing_incumbent record;
  v_new_assignment public.post_assignments;
  v_audit_jur uuid;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Authorized supervisor authority (Admin, DET, or ETO) is required to assign sanctioned posts'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Target post ID and officer ID are required' USING ERRCODE = '22023';
  END IF;

  IF v_actor.user_id = p_user_id THEN
    RAISE EXCEPTION 'Officers cannot assign or transfer themselves to permanent posts'
      USING ERRCODE = '42501';
  END IF;

  v_charge := upper(btrim(coalesce(p_charge_type, 'SUBSTANTIVE')));
  IF v_charge NOT IN ('SUBSTANTIVE', 'ADDITIONAL_CHARGE', 'LOOK_AFTER') THEN
    RAISE EXCEPTION 'Invalid charge type %; expected SUBSTANTIVE, ADDITIONAL_CHARGE, or LOOK_AFTER', v_charge
      USING ERRCODE = '22023';
  END IF;

  v_order := nullif(btrim(coalesce(p_transfer_order_number, '')), '');
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Government transfer or posting order number is required' USING ERRCODE = '22023';
  END IF;
  v_notes := nullif(btrim(coalesce(p_handing_over_notes, '')), '');

  -- Canonical lock order: sanctioned_posts -> app_users
  SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
  IF v_post.id IS NULL OR v_post.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Active permanent sanctioned post not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Target officer profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_user.active OR v_user.deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Suspended or inactive officer accounts cannot hold sanctioned posts' USING ERRCODE = '23514';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_post.role_code) THEN
    RAISE EXCEPTION 'Insufficient statutory authority to staff post % (%)',
      v_post.post_code, v_post.role_code
      USING ERRCODE = '42501';
  END IF;

  v_post_scope_id := coalesce(v_post.circle_id, v_post.district_id, v_post.division_id);
  IF v_actor.role_code <> 'ADMIN' THEN
    IF NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_post_scope_id) THEN
      RAISE EXCEPTION 'Target sanctioned post % is outside your assigned jurisdiction', v_post.post_code
        USING ERRCODE = '42501';
    END IF;

    v_user_current_scope_id := ptas_private.officer_scope_jurisdiction_id(p_user_id);
    IF v_user_current_scope_id IS NOT NULL
       AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_user_current_scope_id) THEN
      RAISE EXCEPTION 'Officer % belongs to another jurisdiction outside your supervisory boundary',
        v_user.display_name
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_user.cadre_code <> v_post.cadre_code THEN
    RAISE EXCEPTION 'Cadre mismatch: officer % holds cadre % and cannot be posted to % (%)',
      v_user.display_name, v_user.cadre_code, v_post.post_code, v_post.cadre_code
      USING ERRCODE = '23514';
  END IF;

  IF v_user.bps_scale IS NULL OR v_user.bps_scale < v_post.min_bps OR v_user.bps_scale > v_post.max_bps THEN
    RAISE EXCEPTION 'BPS mismatch: officer BPS-% is outside sanctioned post % range (BPS-% to BPS-%)',
      coalesce(v_user.bps_scale::text, 'UNSET'), v_post.post_code, v_post.min_bps, v_post.max_bps
      USING ERRCODE = '23514';
  END IF;

  v_audit_jur := coalesce(v_post.legacy_jurisdiction_id, v_post_scope_id);

  -- Check if target post currently has an active incumbent
  SELECT pa.*, au.display_name AS incumbent_name
  INTO v_existing_incumbent
  FROM public.post_assignments pa
  JOIN public.app_users au ON au.id = pa.user_id
  WHERE pa.post_id = v_post.id
    AND pa.valid_to IS NULL
  FOR UPDATE OF pa;

  IF v_existing_incumbent.id IS NOT NULL THEN
    IF v_existing_incumbent.user_id = p_user_id AND v_existing_incumbent.charge_type = v_charge THEN
      RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post.id,
        'post_code', v_post.post_code,
        'user_id', p_user_id,
        'charge_type', v_charge,
        'transfer_order_number', v_existing_incumbent.transfer_order_number
      );
    END IF;

    IF v_existing_incumbent.user_id <> p_user_id THEN
      IF NOT coalesce(p_relieve_current_incumbent, false) THEN
        RAISE EXCEPTION 'Sanctioned post % is currently occupied by %; relieve current incumbent or check Relieve Current Incumbent',
          v_post.post_code, v_existing_incumbent.incumbent_name
          USING ERRCODE = 'PT409';
      END IF;

      UPDATE public.post_assignments
      SET
        valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond'),
        relieved_by = v_actor.user_id,
        handing_over_notes = coalesce(v_notes, 'Relieved by posting order ' || v_order)
      WHERE id = v_existing_incumbent.id;

      PERFORM ptas_private.audit_transition(
        'POST_INCUMBENT_RELIEVED',
        'POST_ASSIGNMENT',
        v_existing_incumbent.id,
        v_actor.user_id,
        v_actor.role_code,
        v_audit_jur,
        'post-relieve:' || v_post.id::text || ':' || v_existing_incumbent.user_id::text,
        'OCCUPIED',
        'VACANT',
        'Relieved ' || v_existing_incumbent.incumbent_name || ' from ' || v_post.post_code || ' under ' || v_order
      );
    END IF;
  END IF;

  -- If assigning SUBSTANTIVE charge, close the officer's prior active SUBSTANTIVE post (if any)
  IF v_charge = 'SUBSTANTIVE' THEN
    UPDATE public.post_assignments
    SET
      valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond'),
      relieved_by = v_actor.user_id,
      handing_over_notes = coalesce(v_notes, 'Transferred to ' || v_post.post_code || ' under ' || v_order)
    WHERE user_id = p_user_id
      AND valid_to IS NULL
      AND charge_type = 'SUBSTANTIVE';
  END IF;

  -- Prevent duplicate active assignment to exact same post
  UPDATE public.post_assignments
  SET
    valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond'),
    relieved_by = v_actor.user_id,
    handing_over_notes = 'Superseded by order ' || v_order
  WHERE user_id = p_user_id
    AND post_id = v_post.id
    AND valid_to IS NULL;

  INSERT INTO public.post_assignments (
    post_id,
    user_id,
    charge_type,
    transfer_order_number,
    valid_from,
    valid_to,
    assigned_by,
    handing_over_notes
  ) VALUES (
    v_post.id,
    p_user_id,
    v_charge,
    v_order,
    now(),
    NULL,
    v_actor.user_id,
    v_notes
  )
  RETURNING * INTO v_new_assignment;

  PERFORM ptas_private.audit_transition(
    'OFFICER_ASSIGNED_TO_POST',
    'POST_ASSIGNMENT',
    v_new_assignment.id,
    v_actor.user_id,
    v_actor.role_code,
    v_audit_jur,
    'post-assign:' || v_post.id::text || ':' || p_user_id::text,
    'VACANT',
    v_post.post_code,
    coalesce(v_notes, v_user.display_name || ' posted to ' || v_post.post_code || ' (' || v_charge || ') under ' || v_order)
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_new_assignment.id,
    'post_id', v_post.id,
    'post_code', v_post.post_code,
    'post_title', v_post.post_title,
    'role_code', v_post.role_code,
    'user_id', v_user.id,
    'officer_name', v_user.display_name,
    'charge_type', v_charge,
    'transfer_order_number', v_order,
    'circle_id', v_post.circle_id
  );
END;
$$;

-- 7.5 relieve_officer_from_post() (Vacates post without deleting officer or permanent post)
CREATE OR REPLACE FUNCTION public.relieve_officer_from_post(
  p_post_id uuid,
  p_reason text,
  p_transfer_order_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_post public.sanctioned_posts;
  v_assignment public.post_assignments;
  v_incumbent public.app_users;
  v_reason text;
  v_order text;
  v_post_scope_id uuid;
  v_audit_jur uuid;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Authorized supervisor authority (Admin, DET, or ETO) is required to relieve an incumbent'
      USING ERRCODE = '42501';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Administrative reason is required when relieving an officer from a permanent post'
      USING ERRCODE = '22023';
  END IF;
  v_order := nullif(btrim(coalesce(p_transfer_order_number, '')), '');

  SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
  IF v_post.id IS NULL THEN
    RAISE EXCEPTION 'Sanctioned post not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_post.role_code) THEN
    RAISE EXCEPTION 'Insufficient authority to relieve post % (%)', v_post.post_code, v_post.role_code
      USING ERRCODE = '42501';
  END IF;

  v_post_scope_id := coalesce(v_post.circle_id, v_post.district_id, v_post.division_id);
  IF v_actor.role_code <> 'ADMIN'
     AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_post_scope_id) THEN
    RAISE EXCEPTION 'Sanctioned post % is outside your assigned jurisdiction', v_post.post_code
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assignment
  FROM public.post_assignments
  WHERE post_id = p_post_id AND valid_to IS NULL
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Sanctioned post % is already VACANT', v_post.post_code USING ERRCODE = 'PT409';
  END IF;

  IF v_assignment.user_id = v_actor.user_id THEN
    RAISE EXCEPTION 'Officers cannot relieve themselves from their own permanent post'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_incumbent FROM public.app_users WHERE id = v_assignment.user_id;

  UPDATE public.post_assignments
  SET
    valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond'),
    relieved_by = v_actor.user_id,
    handing_over_notes = CASE
      WHEN v_order IS NOT NULL THEN '[' || v_order || '] ' || v_reason
      ELSE v_reason
    END
  WHERE id = v_assignment.id;

  v_audit_jur := coalesce(v_post.legacy_jurisdiction_id, v_post_scope_id);

  PERFORM ptas_private.audit_transition(
    'OFFICER_RELIEVED_FROM_POST',
    'POST_ASSIGNMENT',
    v_assignment.id,
    v_actor.user_id,
    v_actor.role_code,
    v_audit_jur,
    'post-vacate:' || v_post.id::text || ':' || v_assignment.user_id::text,
    v_post.post_code,
    'VACANT',
    'Relieved ' || coalesce(v_incumbent.display_name, v_assignment.user_id::text) || ' from ' || v_post.post_code || ': ' || v_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'post_id', v_post.id,
    'post_code', v_post.post_code,
    'relieved_user_id', v_assignment.user_id,
    'relieved_officer_name', coalesce(v_incumbent.display_name, ''),
    'post_status', 'VACANT'
  );
END;
$$;

-- 7.6 rename_jurisdiction_entity() (Superior-only display name mutation; permanent codes stay immutable)
CREATE OR REPLACE FUNCTION public.rename_jurisdiction_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_new_name text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_type text;
  v_new_name text;
  v_reason text;
  v_old_name text;
  v_code text;
  v_circle public.geo_circles;
  v_district public.geo_districts;
  v_division public.geo_divisions;
  v_audit_jur uuid;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Authorized supervisory authority (Admin, DET, or ETO) required'
      USING ERRCODE = '42501';
  END IF;

  v_type := upper(btrim(coalesce(p_entity_type, '')));
  IF v_type NOT IN ('CIRCLE', 'DISTRICT', 'DIVISION') THEN
    RAISE EXCEPTION 'Entity type must be CIRCLE, DISTRICT, or DIVISION' USING ERRCODE = '22023';
  END IF;

  v_new_name := btrim(coalesce(p_new_name, ''));
  IF length(v_new_name) < 2 OR length(v_new_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Statutory order or administrative reason is required for renaming'
      USING ERRCODE = '22023';
  END IF;

  IF v_type = 'CIRCLE' THEN
    IF ptas_private.canonical_role_code(v_actor.role_code) NOT IN ('ADMIN', 'DET', 'ETO') THEN
      RAISE EXCEPTION 'Only ETO, DET, or Admin may rename a Circle' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_circle FROM public.geo_circles WHERE id = p_entity_id FOR UPDATE;
    IF v_circle.id IS NULL THEN
      RAISE EXCEPTION 'Circle not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor.role_code <> 'ADMIN'
       AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle.id) THEN
      RAISE EXCEPTION 'Circle % is outside your assigned jurisdiction', v_circle.circle_code
        USING ERRCODE = '42501';
    END IF;

    v_old_name := v_circle.name;
    v_code := v_circle.circle_code;
    v_audit_jur := v_circle.id;

    UPDATE public.geo_circles SET name = v_new_name WHERE id = v_circle.id;
    UPDATE public.jurisdictions
    SET name = v_new_name, display_label = v_new_name || ' (' || code || ')'
    WHERE geo_circle_id = v_circle.id;

    UPDATE public.sanctioned_posts
    SET post_title = CASE role_code
      WHEN 'ETI' THEN 'Excise & Taxation Inspector, ' || v_new_name || ' (' || v_circle.circle_code || ')'
      WHEN 'ETC' THEN 'Excise & Taxation Constable (Notice Delivery), ' || v_new_name || ' (' || v_circle.circle_code || ')'
      ELSE post_title
    END
    WHERE circle_id = v_circle.id;

  ELSIF v_type = 'DISTRICT' THEN
    IF ptas_private.canonical_role_code(v_actor.role_code) NOT IN ('ADMIN', 'DET') THEN
      RAISE EXCEPTION 'Only Divisional DET or Provincial Admin may rename a District'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_district FROM public.geo_districts WHERE id = p_entity_id FOR UPDATE;
    IF v_district.id IS NULL THEN
      RAISE EXCEPTION 'District not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor.role_code <> 'ADMIN'
       AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_district.id) THEN
      RAISE EXCEPTION 'District % is outside your assigned Division jurisdiction', v_district.district_code
        USING ERRCODE = '42501';
    END IF;

    v_old_name := v_district.name;
    v_code := v_district.district_code;
    v_audit_jur := v_district.id;

    UPDATE public.geo_districts
    SET name = v_new_name, full_name = v_new_name || ' District'
    WHERE id = v_district.id;

    UPDATE public.jurisdictions
    SET name = v_new_name, display_label = v_new_name || ' (' || code || ')'
    WHERE geo_district_id = v_district.id AND tier IN ('DISTRICT', 'ZONE');

    UPDATE public.sanctioned_posts
    SET post_title = 'Excise & Taxation Officer, District ' || v_new_name || ' (BPS-17)'
    WHERE district_id = v_district.id AND role_code = 'ETO';

  ELSE
    IF v_actor.role_code <> 'ADMIN' THEN
      RAISE EXCEPTION 'Only Provincial System Administrator may rename a Division'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_division FROM public.geo_divisions WHERE id = p_entity_id FOR UPDATE;
    IF v_division.id IS NULL THEN
      RAISE EXCEPTION 'Division not found' USING ERRCODE = 'P0002';
    END IF;

    v_old_name := v_division.name;
    v_code := v_division.abbrev;
    v_audit_jur := v_division.id;

    UPDATE public.geo_divisions SET name = v_new_name WHERE id = v_division.id;
    UPDATE public.jurisdictions
    SET name = v_new_name, display_label = v_new_name || ' (' || code || ')'
    WHERE geo_division_id = v_division.id AND tier IN ('DIVISION', 'REGION');

    UPDATE public.sanctioned_posts
    SET post_title = 'Director Excise & Taxation, ' || v_new_name || ' (BPS-19)'
    WHERE division_id = v_division.id AND role_code = 'DET';
  END IF;

  PERFORM ptas_private.audit_transition(
    'JURISDICTION_RENAMED',
    'JURISDICTION',
    p_entity_id,
    v_actor.user_id,
    v_actor.role_code,
    v_audit_jur,
    'geo-rename:' || v_type || ':' || p_entity_id::text,
    v_old_name,
    v_new_name,
    'Renamed ' || v_type || ' [' || v_code || '] from "' || v_old_name || '" to "' || v_new_name || '": ' || v_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'entity_type', v_type,
    'entity_id', p_entity_id,
    'immutable_code', v_code,
    'old_name', v_old_name,
    'new_name', v_new_name
  );
END;
$$;

-- 7.7 attach_circle_to_tehsil() (Updates geo_circles.tehsil_id; accepts same-district geo_tehsils OR NULL)
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
  v_circle public.geo_circles;
  v_old_tehsil public.geo_tehsils;
  v_new_tehsil public.geo_tehsils;
  v_reason text;
  v_old_name text;
  v_new_name text;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO), Director (DET), or Admin authority required'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve canonical geo_circles row directly or via jurisdictions.geo_circle_id bridge
  SELECT * INTO v_circle FROM public.geo_circles WHERE id = p_circle_id FOR UPDATE;
  IF v_circle.id IS NULL THEN
    SELECT gc.* INTO v_circle
    FROM public.jurisdictions j
    JOIN public.geo_circles gc ON gc.id = j.geo_circle_id
    WHERE j.id = p_circle_id
    FOR UPDATE OF gc;
  END IF;

  IF v_circle.id IS NULL OR NOT v_circle.is_active THEN
    RAISE EXCEPTION 'Target permanent Circle not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor.role_code <> 'ADMIN'
     AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle.id) THEN
    RAISE EXCEPTION 'Circle % is outside your assigned jurisdiction', v_circle.circle_code
      USING ERRCODE = '42501';
  END IF;

  IF p_tehsil_id IS NOT NULL THEN
    SELECT * INTO v_new_tehsil
    FROM public.geo_tehsils
    WHERE id = p_tehsil_id AND is_active = true;

    IF v_new_tehsil.id IS NULL THEN
      RAISE EXCEPTION 'Target Tehsil not found in geo_tehsils' USING ERRCODE = 'P0002';
    END IF;
    IF v_new_tehsil.district_id <> v_circle.district_id THEN
      RAISE EXCEPTION 'Target Tehsil (%) does not belong to the Circle District', v_new_tehsil.name
        USING ERRCODE = '23514';
    END IF;
    v_new_name := v_new_tehsil.name;
  ELSE
    v_new_name := 'District HQ (Unattached)';
  END IF;

  IF v_circle.tehsil_id IS NOT NULL THEN
    SELECT * INTO v_old_tehsil FROM public.geo_tehsils WHERE id = v_circle.tehsil_id;
    v_old_name := coalesce(v_old_tehsil.name, v_circle.tehsil_id::text);
  ELSE
    v_old_name := 'District HQ (Unattached)';
  END IF;

  UPDATE public.geo_circles
  SET tehsil_id = p_tehsil_id, updated_at = now()
  WHERE id = v_circle.id;

  v_reason := coalesce(
    nullif(btrim(coalesce(p_reason, '')), ''),
    'Circle Tehsil attachment updated by supervisory authority'
  );

  PERFORM ptas_private.audit_transition(
    CASE WHEN p_tehsil_id IS NULL THEN 'CIRCLE_TEHSIL_DETACHED' ELSE 'CIRCLE_TEHSIL_ATTACHED' END,
    'JURISDICTION',
    v_circle.id,
    v_actor.user_id,
    v_actor.role_code,
    v_circle.id,
    'tehsil-attach:' || v_circle.id::text,
    v_old_name,
    v_new_name,
    v_circle.circle_code || ': ' || v_old_name || ' -> ' || v_new_name || ' (' || v_reason || ')'
  );

  RETURN jsonb_build_object(
    'circle_id', v_circle.id,
    'circle_code', v_circle.circle_code,
    'circle_name', v_circle.name,
    'new_tehsil_id', p_tehsil_id,
    'new_tehsil_name', v_new_name
  );
END;
$$;

-- 7.8 sanction_circle_post() (Allows Admin / Divisional DET to add additional ETI/ETC posts per Circle)
CREATE OR REPLACE FUNCTION public.sanction_circle_post(
  p_circle_id uuid,
  p_role_code text,
  p_sanctioned_order_no text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_circle public.geo_circles;
  v_role text;
  v_order text;
  v_next_seq smallint;
  v_post_code text;
  v_post_title text;
  v_min_bps smallint;
  v_max_bps smallint;
  v_legacy_jur_id uuid;
  v_created public.sanctioned_posts;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Provincial Admin or Divisional DET authority is required to sanction new Circle posts'
      USING ERRCODE = '42501';
  END IF;

  v_role := ptas_private.canonical_role_code(p_role_code);
  IF v_role NOT IN ('ETI', 'ETC') THEN
    RAISE EXCEPTION 'Additional sanctioned Circle posts must belong to ETI or ETC cadre'
      USING ERRCODE = '22023';
  END IF;

  v_order := nullif(btrim(coalesce(p_sanctioned_order_no, '')), '');
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Sanction order number is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_circle FROM public.geo_circles WHERE id = p_circle_id FOR UPDATE;
  IF v_circle.id IS NULL THEN
    RAISE EXCEPTION 'Target permanent Circle not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor.role_code <> 'ADMIN'
     AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_circle.id) THEN
    RAISE EXCEPTION 'Circle % is outside your assigned Division', v_circle.circle_code
      USING ERRCODE = '42501';
  END IF;

  SELECT (coalesce(max(post_sequence), 0) + 1)::smallint
  INTO v_next_seq
  FROM public.sanctioned_posts
  WHERE circle_id = v_circle.id AND role_code = v_role;

  IF v_next_seq > 99 THEN
    RAISE EXCEPTION 'Maximum sanctioned posts per Circle reached for cadre %', v_role
      USING ERRCODE = '23514';
  END IF;

  v_post_code := CASE WHEN v_next_seq = 1 THEN v_role || '-' || v_circle.circle_code
    ELSE v_role || '-' || v_circle.circle_code || '-' || lpad(v_next_seq::text, 2, '0')
  END;

  IF v_role = 'ETI' THEN
    v_min_bps := 16;
    v_max_bps := 16;
    v_post_title := 'Excise & Taxation Inspector (Post ' || lpad(v_next_seq::text, 2, '0') || '), ' || v_circle.name || ' (' || v_circle.circle_code || ')';
  ELSE
    v_min_bps := 5;
    v_max_bps := 5;
    v_post_title := 'Excise & Taxation Constable (Notice Delivery Post ' || lpad(v_next_seq::text, 2, '0') || '), ' || v_circle.name || ' (' || v_circle.circle_code || ')';
  END IF;

  SELECT j.id INTO v_legacy_jur_id
  FROM public.jurisdictions j
  WHERE j.geo_circle_id = v_circle.id AND j.tier = 'CIRCLE'
  ORDER BY (j.id::text LIKE '00000000-%') DESC, (j.code = v_circle.circle_code) DESC, j.created_at ASC
  LIMIT 1;

  INSERT INTO public.sanctioned_posts (
    post_code, post_title, role_code, cadre_code, jurisdiction_tier,
    division_id, district_id, circle_id, legacy_jurisdiction_id,
    post_sequence, min_bps, max_bps, is_permanent, status, sanctioned_order_no
  ) VALUES (
    v_post_code, v_post_title, v_role, v_role, 'CIRCLE',
    v_circle.division_id, v_circle.district_id, v_circle.id, v_legacy_jur_id,
    v_next_seq, v_min_bps, v_max_bps, true, 'ACTIVE', v_order
  )
  RETURNING * INTO v_created;

  PERFORM ptas_private.audit_transition(
    'SANCTIONED_POST_CREATED',
    'SANCTIONED_POST',
    v_created.id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_legacy_jur_id, v_circle.id),
    'sanction-post:' || v_post_code,
    'NONE',
    v_post_code,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Sanctioned permanent post ' || v_post_code || ' under ' || v_order)
  );

  RETURN to_jsonb(v_created);
END;
$$;

-- 7.9 update_officer_profile() — STRICT NO SELF-EDIT; ONLY SUPERIOR AUTHORITY WITHIN JURISDICTION
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
  v_target_scope_id uuid;
  v_next_bps smallint;
  v_active_post public.sanctioned_posts;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Superior jurisdiction authority (Admin, DET, or ETO) required to update officer profiles'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor.user_id = p_user_id THEN
    RAISE EXCEPTION 'Officers are prohibited from modifying their own profile; only superior jurisdiction authority may update officer particulars'
      USING ERRCODE = '42501';
  END IF;

  IF p_bps_scale IS NOT NULL AND (p_bps_scale < 1 OR p_bps_scale > 22) THEN
    RAISE EXCEPTION 'BPS scale must be between 1 and 22' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_target_user.cadre_code) THEN
    RAISE EXCEPTION 'Insufficient superior authority to modify officer cadre %', v_target_user.cadre_code
      USING ERRCODE = '42501';
  END IF;

  v_target_scope_id := ptas_private.officer_scope_jurisdiction_id(p_user_id);
  IF v_actor.role_code <> 'ADMIN' THEN
    IF v_target_scope_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_scope_id) THEN
      RAISE EXCEPTION 'Target officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_next_bps := coalesce(p_bps_scale, v_target_user.bps_scale);
  IF v_next_bps IS NOT NULL THEN
    IF v_target_user.cadre_code = 'DET' AND v_next_bps <> 19 THEN
      RAISE EXCEPTION 'Director Excise & Taxation (DET) cadre requires BPS-19' USING ERRCODE = '23514';
    ELSIF v_target_user.cadre_code = 'ETO' AND v_next_bps <> 17 THEN
      RAISE EXCEPTION 'Excise & Taxation Officer (ETO) cadre requires BPS-17' USING ERRCODE = '23514';
    ELSIF v_target_user.cadre_code = 'ETI' AND v_next_bps <> 16 THEN
      RAISE EXCEPTION 'Excise & Taxation Inspector (ETI) cadre requires BPS-16' USING ERRCODE = '23514';
    ELSIF v_target_user.cadre_code = 'ETC' AND v_next_bps <> 5 THEN
      RAISE EXCEPTION 'Excise & Taxation Constable (ETC) cadre requires BPS-05' USING ERRCODE = '23514';
    END IF;

    SELECT sp.* INTO v_active_post
    FROM public.post_assignments pa
    JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
    WHERE pa.user_id = p_user_id AND pa.valid_to IS NULL
      AND (v_next_bps < sp.min_bps OR v_next_bps > sp.max_bps)
    LIMIT 1;
    IF v_active_post.id IS NOT NULL THEN
      RAISE EXCEPTION 'BPS-% violates officer current sanctioned post % grade range (% to %)',
        v_next_bps, v_active_post.post_code, v_active_post.min_bps, v_active_post.max_bps
        USING ERRCODE = '23514';
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
    bps_scale = v_next_bps,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PROFILE_UPDATED',
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_scope_id, v_actor.jurisdiction_id),
    'user-mgmt:' || p_user_id::text,
    'ACTIVE',
    'ACTIVE',
    jsonb_build_object(
      'display_name', v_target_user.display_name,
      'designation', v_target_user.designation,
      'bps_scale', v_target_user.bps_scale,
      'ppo_number', v_target_user.ppo_number
    )::text
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

-- 7.10 admin_set_officer_password() (Self password rotation allowed for all cadres; supervisor reset scoped)
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
  v_target_scope_id uuid;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR', 'ETC', 'FINANCE', 'AUDITOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS session required' USING ERRCODE = '42501';
  END IF;

  IF length(coalesce(p_new_password, '')) < 12 THEN
    RAISE EXCEPTION 'password must be at least 12 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_target_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'target user not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'target user has no linked authentication identity' USING ERRCODE = '23503';
  END IF;

  v_target_scope_id := ptas_private.officer_scope_jurisdiction_id(p_target_user_id);

  IF v_actor.user_id = p_target_user_id THEN
    -- Self password rotation remains permitted
    NULL;
  ELSIF ptas_private.can_manage_target_role(v_actor.role_code, v_target_user.cadre_code) THEN
    IF v_actor.role_code <> 'ADMIN' THEN
      IF v_target_scope_id IS NULL
         OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_scope_id) THEN
        RAISE EXCEPTION 'subordinate officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized to reset password for target role or user' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_target_user.auth_user_id;

  UPDATE public.app_users
  SET must_change_password = CASE
        WHEN v_actor.user_id = p_target_user_id THEN false
        ELSE coalesce(p_must_change, true)
      END,
      last_password_change = now(),
      updated_at = now()
  WHERE id = p_target_user_id;

  IF v_actor.user_id <> p_target_user_id THEN
    PERFORM ptas_private.revoke_user_auth_sessions(v_target_user.auth_user_id);
  END IF;

  PERFORM ptas_private.audit_transition(
    'OFFICER_PASSWORD_RESET',
    'USER_ACCOUNT',
    p_target_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_scope_id, v_actor.jurisdiction_id),
    'password-reset:' || p_target_user_id::text,
    'PREVIOUS_CREDENTIAL',
    'UPDATED_CREDENTIAL',
    'Credential reset by ' || v_actor.role_code || '; sessions_revoked=' || (v_actor.user_id <> p_target_user_id)::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'Officer password has been securely updated'
  );
END;
$$;

-- 7.11 set_officer_status() (Deactivating automatically vacates active permanent posts!)
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
  v_target_scope_id uuid;
  v_reason text;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO), Director (DET), or Admin authority required'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor.user_id = p_user_id THEN
    RAISE EXCEPTION 'officers cannot suspend or toggle their own account status'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_user FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_target_user.cadre_code) THEN
    RAISE EXCEPTION 'insufficient authority to change status for cadre %', v_target_user.cadre_code
      USING ERRCODE = '42501';
  END IF;

  v_target_scope_id := ptas_private.officer_scope_jurisdiction_id(p_user_id);
  IF v_actor.role_code <> 'ADMIN' THEN
    IF v_target_scope_id IS NULL
       OR NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_target_scope_id) THEN
      RAISE EXCEPTION 'target officer is outside your assigned jurisdiction' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Officer status modified by authorized supervisor');

  -- When suspending/deactivating, vacate all active post_assignments (permanent posts become VACANT)
  IF NOT coalesce(p_active, false) THEN
    UPDATE public.post_assignments
    SET
      valid_to = greatest(clock_timestamp(), valid_from + interval '1 millisecond'),
      relieved_by = v_actor.user_id,
      handing_over_notes = 'Post vacated on officer suspension: ' || v_reason
    WHERE user_id = p_user_id
      AND valid_to IS NULL;
  END IF;

  UPDATE public.app_users
  SET
    active = p_active,
    deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_target_user;

  IF NOT coalesce(p_active, false) THEN
    PERFORM ptas_private.revoke_user_auth_sessions(v_target_user.auth_user_id);
  END IF;

  PERFORM ptas_private.audit_transition(
    CASE WHEN p_active THEN 'OFFICER_ACTIVATED' ELSE 'OFFICER_SUSPENDED' END,
    'USER_ACCOUNT',
    p_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_target_scope_id, v_actor.jurisdiction_id),
    'officer-status:' || p_user_id::text,
    CASE WHEN p_active THEN 'INACTIVE' ELSE 'ACTIVE' END,
    CASE WHEN p_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
    v_reason
  );

  RETURN to_jsonb(v_target_user);
END;
$$;

-- 7.12 admin_create_officer() — Provisions cadre profile & posts into matching vacant sanctioned_post
DROP FUNCTION IF EXISTS public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text);

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
  p_bps_scale smallint DEFAULT NULL,
  p_transfer_order_number text DEFAULT NULL,
  p_post_id uuid DEFAULT NULL
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
  v_normalized_email text;
  v_cadre_code text;
  v_bps smallint;
  v_post public.sanctioned_posts;
  v_geo_circle public.geo_circles;
  v_geo_district public.geo_districts;
  v_geo_division public.geo_divisions;
  v_jur public.jurisdictions;
  v_post_scope_id uuid;
  v_order_no text;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Assessing Authority (ETO), Director (DET), or Admin authority required'
      USING ERRCODE = '42501';
  END IF;

  v_cadre_code := ptas_private.canonical_role_code(p_role);
  IF v_cadre_code NOT IN ('DET', 'ETO', 'ETI', 'ETC') THEN
    RAISE EXCEPTION 'Cadre role must be DET, ETO, ETI, or ETC (received %)', coalesce(p_role, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  IF NOT ptas_private.can_manage_target_role(v_actor.role_code, v_cadre_code) THEN
    RAISE EXCEPTION 'Insufficient authority to provision officer in cadre %', v_cadre_code
      USING ERRCODE = '42501';
  END IF;

  v_bps := coalesce(
    p_bps_scale,
    CASE v_cadre_code
      WHEN 'DET' THEN 19::smallint
      WHEN 'ETO' THEN 17::smallint
      WHEN 'ETI' THEN 16::smallint
      WHEN 'ETC' THEN 5::smallint
    END
  );

  IF v_cadre_code = 'DET' AND v_bps <> 19 THEN
    RAISE EXCEPTION 'Director Excise & Taxation (DET) requires BPS-19' USING ERRCODE = '22023';
  ELSIF v_cadre_code = 'ETO' AND v_bps <> 17 THEN
    RAISE EXCEPTION 'Excise & Taxation Officer (ETO) requires BPS-17' USING ERRCODE = '22023';
  ELSIF v_cadre_code = 'ETI' AND v_bps <> 16 THEN
    RAISE EXCEPTION 'Excise & Taxation Inspector (ETI) requires BPS-16' USING ERRCODE = '22023';
  ELSIF v_cadre_code = 'ETC' AND v_bps <> 5 THEN
    RAISE EXCEPTION 'Excise & Taxation Constable (ETC) requires BPS-05' USING ERRCODE = '22023';
  END IF;

  v_normalized_email := lower(btrim(coalesce(p_email, '')));
  IF v_normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'valid email address is required' USING ERRCODE = '22023';
  END IF;

  IF length(coalesce(p_initial_password, '')) < 12 THEN
    RAISE EXCEPTION 'initial password must be at least 12 characters' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'officer display name is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_normalized_email)
     OR EXISTS (SELECT 1 FROM public.app_users WHERE lower(coalesce(email, '')) = v_normalized_email) THEN
    RAISE EXCEPTION 'an officer account with this email already exists' USING ERRCODE = '23505';
  END IF;

  -- Resolve target permanent sanctioned post
  IF p_post_id IS NOT NULL THEN
    SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = p_post_id AND status = 'ACTIVE' FOR UPDATE;
  ELSIF p_circle_id IS NOT NULL THEN
    -- Allow p_circle_id to pass a Circle, District, Division, or jurisdictions UUID matching the requested cadre
    SELECT * INTO v_jur FROM public.jurisdictions WHERE id = p_circle_id;

    IF v_cadre_code IN ('ETI', 'ETC') THEN
      SELECT * INTO v_geo_circle FROM public.geo_circles WHERE id = coalesce(v_jur.geo_circle_id, p_circle_id);
      IF v_geo_circle.id IS NOT NULL THEN
        SELECT * INTO v_post
        FROM public.sanctioned_posts
        WHERE circle_id = v_geo_circle.id AND role_code = v_cadre_code AND status = 'ACTIVE'
        ORDER BY post_sequence ASC
        LIMIT 1
        FOR UPDATE;
      END IF;
    ELSIF v_cadre_code = 'ETO' THEN
      SELECT * INTO v_geo_district FROM public.geo_districts WHERE id = coalesce(v_jur.geo_district_id, p_circle_id);
      IF v_geo_district.id IS NULL THEN
        SELECT gd.* INTO v_geo_district
        FROM public.geo_circles gc
        JOIN public.geo_districts gd ON gd.id = gc.district_id
        WHERE gc.id = coalesce(v_jur.geo_circle_id, p_circle_id);
      END IF;
      IF v_geo_district.id IS NOT NULL THEN
        SELECT * INTO v_post
        FROM public.sanctioned_posts
        WHERE district_id = v_geo_district.id AND role_code = 'ETO' AND status = 'ACTIVE'
        ORDER BY post_sequence ASC
        LIMIT 1
        FOR UPDATE;
      END IF;
    ELSIF v_cadre_code = 'DET' THEN
      SELECT * INTO v_geo_division FROM public.geo_divisions WHERE id = coalesce(v_jur.geo_division_id, p_circle_id);
      IF v_geo_division.id IS NULL THEN
        SELECT gdiv.* INTO v_geo_division
        FROM public.geo_districts gd
        JOIN public.geo_divisions gdiv ON gdiv.id = gd.division_id
        WHERE gd.id = coalesce(v_jur.geo_district_id, p_circle_id);
      END IF;
      IF v_geo_division.id IS NULL THEN
        SELECT gdiv.* INTO v_geo_division
        FROM public.geo_circles gc
        JOIN public.geo_divisions gdiv ON gdiv.id = gc.division_id
        WHERE gc.id = coalesce(v_jur.geo_circle_id, p_circle_id);
      END IF;
      IF v_geo_division.id IS NOT NULL THEN
        SELECT * INTO v_post
        FROM public.sanctioned_posts
        WHERE division_id = v_geo_division.id AND role_code = 'DET' AND status = 'ACTIVE'
        ORDER BY post_sequence ASC
        LIMIT 1
        FOR UPDATE;
      END IF;
    END IF;
  END IF;

  IF v_post.id IS NULL THEN
    RAISE EXCEPTION 'Matching permanent sanctioned post for cadre % could not be resolved', v_cadre_code
      USING ERRCODE = 'P0002';
  END IF;

  IF v_post.cadre_code <> v_cadre_code THEN
    RAISE EXCEPTION 'Selected sanctioned post % requires cadre %, not %',
      v_post.post_code, v_post.cadre_code, v_cadre_code
      USING ERRCODE = '22023';
  END IF;

  v_post_scope_id := coalesce(v_post.circle_id, v_post.district_id, v_post.division_id);
  IF v_actor.role_code <> 'ADMIN'
     AND NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id, v_post_scope_id) THEN
    RAISE EXCEPTION 'Target sanctioned post % is outside your assigned jurisdiction boundary', v_post.post_code
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.post_assignments pa WHERE pa.post_id = v_post.id AND pa.valid_to IS NULL
  ) THEN
    RAISE EXCEPTION 'Sanctioned post % is currently occupied; relieve the incumbent before posting a new officer there',
      v_post.post_code
      USING ERRCODE = 'PT409';
  END IF;

  v_order_no := coalesce(nullif(btrim(coalesce(p_transfer_order_number, '')), ''), 'ONBOARDING-APPOINTMENT');

  v_auth_user_id := gen_random_uuid();
  INSERT INTO auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-4000-8000-000000000000',
    v_auth_user_id,
    'authenticated',
    'authenticated',
    v_normalized_email,
    extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', btrim(p_name), 'sub', v_auth_user_id),
    now(),
    now()
  );

  INSERT INTO auth.identities(
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, email
  ) VALUES (
    gen_random_uuid(),
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id, 'email', v_normalized_email, 'name', btrim(p_name)),
    'email',
    NULL,
    now(),
    now(),
    v_normalized_email
  );

  v_app_user_id := gen_random_uuid();
  INSERT INTO public.app_users(
    id, auth_user_id, display_name, email, phone, cnic, designation, office_address,
    ppo_number, father_name, bps_scale, cadre_code, must_change_password, active, created_at, updated_at
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
    v_bps,
    v_cadre_code,
    true,
    true,
    now(),
    now()
  );

  INSERT INTO public.post_assignments (
    post_id, user_id, charge_type, transfer_order_number,
    valid_from, valid_to, assigned_by, handing_over_notes
  ) VALUES (
    v_post.id, v_app_user_id, 'SUBSTANTIVE', v_order_no,
    now(), NULL, v_actor.user_id, 'Initial appointment to ' || v_post.post_code
  );

  PERFORM ptas_private.audit_transition(
    'OFFICER_PROVISIONED',
    'USER_ACCOUNT',
    v_app_user_id,
    v_actor.user_id,
    v_actor.role_code,
    coalesce(v_post.legacy_jurisdiction_id, v_post_scope_id),
    'officer-create:' || v_app_user_id::text,
    'NON_EXISTENT',
    v_post.post_code,
    jsonb_build_object(
      'name', btrim(p_name),
      'email', v_normalized_email,
      'cadre_code', v_cadre_code,
      'bps_scale', v_bps,
      'post_code', v_post.post_code,
      'transfer_order_number', v_order_no
    )::text
  );

  RETURN jsonb_build_object(
    'id', v_app_user_id,
    'auth_user_id', v_auth_user_id,
    'name', btrim(p_name),
    'email', v_normalized_email,
    'role', v_cadre_code,
    'cadre_code', v_cadre_code,
    'post_id', v_post.id,
    'post_code', v_post.post_code,
    'circle_id', v_post.circle_id,
    'circle_name', v_post.post_title
  );
END;
$$;

-- 7.13 transfer_officer_posting() — Clean adapter delegating to assign_officer_to_post()
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
  v_user public.app_users;
  v_jur public.jurisdictions;
  v_geo_circle_id uuid;
  v_post public.sanctioned_posts;
  v_res jsonb;
BEGIN
  SELECT * INTO v_user FROM public.app_users WHERE id = p_user_id;
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'officer not found' USING ERRCODE = 'P0002';
  END IF;

  -- Accept either a sanctioned_posts.id directly, or a geo_circles.id / legacy jurisdictions.id
  SELECT * INTO v_post FROM public.sanctioned_posts WHERE id = p_target_circle_id AND status = 'ACTIVE';
  IF v_post.id IS NULL THEN
    SELECT * INTO v_jur FROM public.jurisdictions WHERE id = p_target_circle_id;
    v_geo_circle_id := coalesce(v_jur.geo_circle_id, p_target_circle_id);
    SELECT * INTO v_post
    FROM public.sanctioned_posts
    WHERE circle_id = v_geo_circle_id
      AND role_code = v_user.cadre_code
      AND status = 'ACTIVE'
    ORDER BY post_sequence ASC
    LIMIT 1;
  END IF;

  IF v_post.id IS NULL THEN
    RAISE EXCEPTION 'target permanent sanctioned post for cadre % not found', v_user.cadre_code
      USING ERRCODE = 'P0002';
  END IF;

  v_res := public.assign_officer_to_post(
    v_post.id,
    p_user_id,
    CASE WHEN coalesce(p_is_primary, true) THEN 'SUBSTANTIVE' ELSE 'ADDITIONAL_CHARGE' END,
    coalesce(nullif(btrim(coalesce(p_transfer_order_number, '')), ''), 'ADMIN-TRANSFER'),
    p_handing_over_notes,
    coalesce(p_relieve_current_incumbent, false)
  );

  RETURN v_res;
END;
$$;

-- 7.14 get_officers_directory() — Includes UNPOSTED personnel + permanent post codes & additional charges
CREATE OR REPLACE FUNCTION public.get_officers_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_actor_canon_role text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;
  v_actor_canon_role := ptas_private.canonical_role_code(v_actor.role_code);

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor_canon_role <> 'ADMIN'
  ),
  inspector_counts AS MATERIALIZED (
    SELECT responsible_inspector_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units
    WHERE responsible_inspector_id IS NOT NULL
    GROUP BY responsible_inspector_id
  ),
  circle_counts AS MATERIALIZED (
    SELECT coalesce(j.geo_circle_id, p.circle_id) AS resolved_circle_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units p
    LEFT JOIN public.jurisdictions j ON j.id = p.circle_id
    WHERE p.circle_id IS NOT NULL
    GROUP BY coalesce(j.geo_circle_id, p.circle_id)
  ),
  officer_data AS (
    SELECT
      u.id AS user_id,
      u.auth_user_id,
      u.display_name AS name,
      coalesce(u.email, au.email, '') AS email,
      coalesce(u.phone, '') AS phone,
      CASE
        WHEN v_actor_canon_role = 'ADMIN' OR u.id = v_actor.user_id THEN coalesce(u.cnic, '')
        WHEN length(coalesce(u.cnic, '')) >= 6 THEN left(u.cnic, 5) || '-*******-' || right(u.cnic, 1)
        ELSE ''
      END AS cnic,
      coalesce(u.designation, '') AS designation,
      coalesce(u.office_address, gc.office_address, j.office_address, '') AS office_address,
      coalesce(u.ppo_number, '') AS ppo_number,
      coalesce(u.father_name, '') AS father_name,
      coalesce(
        u.bps_scale,
        CASE u.cadre_code WHEN 'DET' THEN 19 WHEN 'ETO' THEN 17 WHEN 'ETC' THEN 5 ELSE 16 END
      )::int AS bps_scale,
      coalesce(u.must_change_password, false) AS must_change_password,
      u.active,
      u.created_at,
      u.cadre_code,
      coalesce(sp.role_code, ur.role_code, u.cadre_code) AS role,
      CASE WHEN pa.id IS NOT NULL THEN 'POSTED' ELSE 'UNPOSTED' END AS posting_status,
      sp.id AS post_id,
      coalesce(sp.post_code, '') AS post_code,
      coalesce(sp.post_title, '') AS post_title,
      pa.charge_type,
      coalesce(sp.legacy_jurisdiction_id, sp.circle_id, sp.district_id, sp.division_id, ur.jurisdiction_id) AS jurisdiction_id,
      coalesce(gc.circle_code, j.code, '') AS circle_code,
      coalesce(gc.name, gd.name, gdiv.name, j.name, 'Unposted Reserve') AS circle_name,
      gc.id AS circle_id,
      gt.id AS tehsil_id,
      gt.name AS tehsil_name,
      gd.id AS district_id,
      coalesce(gd.name, '') AS district_name,
      coalesce(gd.district_code, '') AS district_code,
      coalesce(gd.pbs_code, '') AS pbs_code,
      coalesce(gdiv.name, '') AS division_name,
      (pa.id IS NULL OR pa.charge_type = 'SUBSTANTIVE') AS is_primary,
      coalesce(pa.transfer_order_number, '') AS transfer_order_number,
      pa.valid_from AS posting_date,
      coalesce(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'post_id', sp2.id,
            'post_code', sp2.post_code,
            'post_title', sp2.post_title,
            'charge_type', pa2.charge_type,
            'circle_id', sp2.circle_id,
            'circle_code', gc2.circle_code,
            'circle_name', gc2.name
          ) ORDER BY pa2.valid_from ASC)
          FROM public.post_assignments pa2
          JOIN public.sanctioned_posts sp2 ON sp2.id = pa2.post_id
          LEFT JOIN public.geo_circles gc2 ON gc2.id = sp2.circle_id
          WHERE pa2.user_id = u.id
            AND pa2.valid_to IS NULL
            AND (pa.id IS NULL OR pa2.id <> pa.id)
        ),
        '[]'::jsonb
      ) AS additional_posts,
      coalesce(ic.cnt, 0)::int AS assigned_survey_units_count,
      coalesce(cc.cnt, 0)::int AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    LEFT JOIN LATERAL (
      SELECT pa1.*
      FROM public.post_assignments pa1
      WHERE pa1.user_id = u.id AND pa1.valid_to IS NULL
      ORDER BY (pa1.charge_type = 'SUBSTANTIVE') DESC, pa1.valid_from ASC
      LIMIT 1
    ) pa ON true
    LEFT JOIN public.sanctioned_posts sp ON sp.id = pa.post_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    LEFT JOIN public.jurisdictions j ON j.id = coalesce(sp.legacy_jurisdiction_id, ur.jurisdiction_id)
    LEFT JOIN public.geo_circles gc ON gc.id = sp.circle_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.geo_districts gd ON gd.id = coalesce(sp.district_id, gc.district_id)
    LEFT JOIN public.geo_divisions gdiv ON gdiv.id = coalesce(sp.division_id, gd.division_id)
    LEFT JOIN inspector_counts ic ON ic.responsible_inspector_id = u.id
    LEFT JOIN circle_counts cc ON cc.resolved_circle_id = gc.id
    WHERE
      v_actor_canon_role = 'ADMIN'
      OR u.id = v_actor.user_id
      OR (
        v_actor_canon_role IN ('DET', 'ETO')
        AND EXISTS (
          SELECT 1 FROM allowed_jurisdictions aj
          WHERE aj.jurisdiction_id = ptas_private.officer_scope_jurisdiction_id(u.id)
        )
      )
    ORDER BY
      CASE u.cadre_code WHEN 'ADMIN' THEN 1 WHEN 'DET' THEN 2 WHEN 'ETO' THEN 3 WHEN 'ETI' THEN 4 WHEN 'ETC' THEN 5 ELSE 6 END,
      coalesce(sp.post_code, gc.circle_code, u.display_name),
      u.display_name
  )
  SELECT coalesce(jsonb_agg(to_jsonb(od)), '[]'::jsonb) INTO v_result
  FROM officer_data od;

  RETURN v_result;
END;
$$;

-- 7.15 get_user_management_audit_log() — Includes SANCTIONED_POST & POST_ASSIGNMENT events
CREATE OR REPLACE FUNCTION public.get_user_management_audit_log(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor record;
  v_actor_canon_role text;
  v_result jsonb;
  v_safe_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
BEGIN
  SELECT * INTO v_actor
  FROM ptas_private.active_actor(ARRAY['ADMIN', 'AUDITOR', 'DET', 'DIRECTOR', 'ETO', 'ETI', 'INSPECTOR']) a
  LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;
  v_actor_canon_role := ptas_private.canonical_role_code(v_actor.role_code);

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id::text AS jur_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor_canon_role <> 'ADMIN'
  ),
  audit_records AS (
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
      coalesce(ae.payload->>'from_status', ae.payload->>'previous_state') AS from_status,
      coalesce(ae.payload->>'to_status', ae.payload->>'new_state') AS to_status,
      ae.payload
    FROM public.audit_events ae
    LEFT JOIN public.app_users au ON au.id::text = ae.actor_id
    WHERE ae.aggregate_type IN ('USER_ACCOUNT', 'JURISDICTION', 'SANCTIONED_POST', 'POST_ASSIGNMENT')
      AND (
        v_actor_canon_role IN ('ADMIN', 'AUDITOR')
        OR (
          v_actor_canon_role IN ('DET', 'ETO')
          AND ae.jurisdiction_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jur_id = ae.jurisdiction_id)
        )
        OR ae.actor_id = v_actor.user_id::text
        OR ae.aggregate_id = v_actor.user_id::text
      )
    ORDER BY ae.occurred_at DESC
    LIMIT v_safe_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(ar)), '[]'::jsonb) INTO v_result
  FROM audit_records ar;

  RETURN v_result;
END;
$$;
COMMIT;

-- ============================================================================
-- 8. FUNCTION EXECUTE PERMISSIONS
-- ============================================================================

BEGIN;
REVOKE ALL ON FUNCTION ptas_private.enforce_geo_identity_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.enforce_sanctioned_post_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.validate_post_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.sync_post_assignment_to_legacy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.canonical_role_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.legacy_compat_role_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ptas_private.officer_scope_jurisdiction_id(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.resolve_my_ptas_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_my_ptas_actor() TO authenticated;

REVOKE ALL ON FUNCTION public.get_jurisdiction_governance_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jurisdiction_governance_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.get_district_governance_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_district_governance_matrix() TO authenticated;

REVOKE ALL ON FUNCTION public.assign_officer_to_post(uuid, uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_officer_to_post(uuid, uuid, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.relieve_officer_from_post(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relieve_officer_from_post(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rename_jurisdiction_entity(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_jurisdiction_entity(text, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.sanction_circle_post(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sanction_circle_post(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_officer_password(uuid, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_officer_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_officer_status(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_officer(text, text, text, uuid, text, text, text, text, text, text, text, smallint, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_officer_posting(uuid, uuid, text, boolean, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_officers_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_management_audit_log(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_management_audit_log(int) TO authenticated;
COMMIT;

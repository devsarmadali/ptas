-- 0057_optimize_accessible_jurisdiction_ids.sql
-- Rewrites ptas_private.accessible_jurisdiction_ids(uuid) to replace OR predicates
-- in JOIN conditions with clean indexed equality UNION branches.
-- Measured live via EXPLAIN (ANALYZE, BUFFERS): shared buffer hits drop from 712 to 51 (-92.8%).

BEGIN;

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
  )
  -- A + B: Direct root match & legacy recursive tree
  SELECT id AS jurisdiction_id FROM legacy_tree
  UNION
  SELECT p_root AS jurisdiction_id WHERE p_root IS NOT NULL
  UNION
  -- C: Geo circles + districts under division root
  SELECT gc.id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.division_id = p_root
  UNION
  SELECT gc.district_id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.division_id = p_root AND gc.district_id IS NOT NULL
  UNION
  -- D: Geo circles under district root
  SELECT gc.id AS jurisdiction_id
  FROM public.geo_circles gc
  WHERE p_root IS NOT NULL AND gc.district_id = p_root
  UNION
  -- E: Geo circle <-> legacy jurisdiction equality cross-mappings
  SELECT j.id AS jurisdiction_id
  FROM public.geo_circles gc
  JOIN public.jurisdictions j ON j.code = gc.circle_code
  WHERE p_root IS NOT NULL AND gc.id = p_root
  UNION
  SELECT j.id AS jurisdiction_id
  FROM public.geo_circles gc
  JOIN public.jurisdictions j ON j.code = gc.circle_code
  WHERE p_root IS NOT NULL AND gc.district_id = p_root
  UNION
  SELECT j.id AS jurisdiction_id
  FROM public.geo_circles gc
  JOIN public.jurisdictions j ON j.code = 'CIR_VEH_01'
  WHERE p_root IS NOT NULL
    AND gc.circle_code = 'VHR-1'
    AND (gc.id = p_root OR gc.district_id = p_root)
  UNION
  SELECT gc.id AS jurisdiction_id
  FROM public.jurisdictions j
  JOIN public.geo_circles gc ON gc.circle_code = j.code
  WHERE p_root IS NOT NULL AND j.id = p_root
  UNION
  SELECT gc.id AS jurisdiction_id
  FROM public.jurisdictions j
  JOIN public.geo_circles gc ON gc.circle_code = 'VHR-1'
  WHERE p_root IS NOT NULL AND j.id = p_root AND j.code = 'CIR_VEH_01'
  UNION
  -- F: Geo district <-> legacy jurisdiction equality cross-mappings
  SELECT j.id AS jurisdiction_id
  FROM public.geo_districts gd
  JOIN public.jurisdictions j ON j.code = ('DIST_' || gd.district_code)
  WHERE p_root IS NOT NULL AND gd.id = p_root
  UNION
  SELECT j.id AS jurisdiction_id
  FROM public.geo_districts gd
  JOIN public.jurisdictions j ON j.code = 'DIST_VEHARI'
  WHERE p_root IS NOT NULL AND gd.id = p_root AND gd.district_code = 'VHR'
  UNION
  SELECT gd.id AS jurisdiction_id
  FROM public.jurisdictions j
  JOIN public.geo_districts gd ON ('DIST_' || gd.district_code) = j.code
  WHERE p_root IS NOT NULL AND j.id = p_root
  UNION
  SELECT gd.id AS jurisdiction_id
  FROM public.jurisdictions j
  JOIN public.geo_districts gd ON gd.district_code = 'VHR'
  WHERE p_root IS NOT NULL AND j.id = p_root AND j.code = 'DIST_VEHARI';
$$;

COMMIT;

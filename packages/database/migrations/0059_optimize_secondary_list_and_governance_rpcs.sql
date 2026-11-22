-- 0059_optimize_secondary_list_and_governance_rpcs.sql
-- Non-destructive performance migration:
-- 1. Pre-sorts compact tuples (ordered_units / ordered_challans / ordered_receipts) before jsonb_agg
--    and short-circuits accessible_jurisdiction_ids for province-wide roles in challan/receipt RPCs.
-- 2. Replaces correlated subqueries and OR row-multiplication in get_district_governance_matrix()
--    and get_officers_directory() with single-pass materialized aggregate/jurisdiction CTEs.
-- 3. Adds partial indexes for overdue challan sweeps and inspector-assigned PFT-3 unit counts.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET') AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ordered_units.id,
        'potential_number', ordered_units.potential_number,
        'pin_number', ordered_units.pin_number,
        'provincial_uin', ordered_units.provincial_uin,
        'legal_name', ordered_units.legal_name,
        'trade_name', ordered_units.trade_name,
        'taxpayer_name', ordered_units.taxpayer_name,
        'identifier_type', ordered_units.identifier_type,
        'identifier_value', coalesce(ordered_units.identifier_value, ''),
        'address', coalesce(ordered_units.address, ''),
        'locality', ordered_units.locality,
        'circle_id', ordered_units.circle_id,
        'circle_name', ordered_units.circle_name,
        'tehsil', ordered_units.tehsil,
        'district_name', ordered_units.district_name,
        'category_code', ordered_units.category_code,
        'category_name', ordered_units.category_name,
        'subclassification_code', ordered_units.subclassification_code,
        'subclassification_name', ordered_units.subclassification_name,
        'statutory_tertiary_code', ordered_units.statutory_tertiary_code,
        'statutory_tertiary_classification', ordered_units.statutory_tertiary_classification,
        'statutory_rule_id', ordered_units.statutory_rule_id,
        'annual_rate_pkr', ordered_units.annual_rate_pkr,
        'opening_arrears', ordered_units.opening_arrears,
        'remarks', ordered_units.remarks,
        'status', ordered_units.status,
        'migrated_to_demand_no', ordered_units.migrated_to_demand_no,
        'migrated_at', ordered_units.migrated_at,
        'created_at', ordered_units.created_at,
        'updated_at', ordered_units.updated_at
      )
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT p.*
    FROM actor a
    JOIN public.potential_assessment_units p
      ON (
        a.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
        OR a.jurisdiction_id IS NULL
        OR p.circle_id IS NULL
        OR EXISTS (
          SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = p.circle_id
        )
      )
    ORDER BY p.created_at DESC, p.id
  ) ordered_units;
$function$;

CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET')
      AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(ordered_challans.snapshot), '[]'::jsonb)
  FROM (
    SELECT c.snapshot
    FROM actor a
    JOIN public.pft2_challans c
      ON (
        a.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
        OR EXISTS (
          SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = c.jurisdiction_id
        )
      )
    WHERE c.snapshot <> '{}'::jsonb
    ORDER BY c.created_at DESC
  ) ordered_challans;
$function$;

CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actor AS (
    SELECT * FROM ptas_private.active_actor(NULL) LIMIT 1
  ),
  allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM actor a
    CROSS JOIN LATERAL ptas_private.accessible_jurisdiction_ids(a.jurisdiction_id) aj
    WHERE a.role_code NOT IN ('ADMIN', 'DIRECTOR', 'DET')
      AND a.jurisdiction_id IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(ordered_receipts.snapshot), '[]'::jsonb)
  FROM (
    SELECT r.snapshot
    FROM actor a
    JOIN public.pft2_receipts r ON r.snapshot <> '{}'::jsonb
    JOIN public.pft2_challans c ON c.id = r.challan_id
    WHERE (
      a.role_code IN ('ADMIN', 'DIRECTOR', 'DET')
      OR EXISTS (
        SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = c.jurisdiction_id
      )
    )
    ORDER BY r.received_at DESC
  ) ordered_receipts;
$function$;

CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor record;
  v_result jsonb;
  v_target_district_id uuid;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_target_district_id
  FROM public.geo_districts
  WHERE district_code = 'VHR'
  LIMIT 1;

  WITH unit_stats AS MATERIALIZED (
    SELECT
      circle_id,
      count(*)::int AS units_count,
      count(*) FILTER (WHERE state = 'APPROVED')::int AS approved_units_count,
      coalesce(sum(annual_rate_pkr) FILTER (WHERE state = 'APPROVED'), 0)::numeric AS total_assessed_demand
    FROM public.pft3_assessment_units
    WHERE circle_id IS NOT NULL
    GROUP BY circle_id
  ),
  circle_stats AS (
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
      (coalesce(max(us_geo.units_count), 0) + coalesce(sum(us_leg.units_count), 0))::int AS units_count,
      (coalesce(max(us_geo.approved_units_count), 0) + coalesce(sum(us_leg.approved_units_count), 0))::int AS approved_units_count,
      (coalesce(max(us_geo.total_assessed_demand), 0) + coalesce(sum(us_leg.total_assessed_demand), 0))::numeric AS total_assessed_demand
    FROM public.geo_circles gc
    JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.circle_id = gc.id AND uja.valid_to IS NULL
    LEFT JOIN public.app_users u ON u.id = uja.user_id AND u.active = true
    LEFT JOIN public.jurisdictions leg_c
      ON leg_c.code = gc.circle_code
      OR (gc.circle_code = 'VHR-1' AND leg_c.code = 'CIR_VEH_01')
    LEFT JOIN unit_stats us_geo ON us_geo.circle_id = gc.id
    LEFT JOIN unit_stats us_leg ON leg_c.id IS NOT NULL AND leg_c.id <> gc.id AND us_leg.circle_id = leg_c.id
    WHERE gc.district_id = v_target_district_id
    GROUP BY gc.id, gc.circle_code, gc.name, gc.circle_number, gt.name, gt.tehsil_code, gt.id, gd.id, gd.name, gd.district_code, u.id, u.display_name, u.phone, u.email, u.ppo_number, uja.is_primary, uja.transfer_order_number, uja.valid_from
    ORDER BY gc.circle_number
  )
  SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) INTO v_result
  FROM circle_stats cs;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_officers_directory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM ptas_private.active_actor(NULL) a LIMIT 1;
  IF v_actor.user_id IS NULL THEN
    RAISE EXCEPTION 'active authenticated PTAS officer session required' USING ERRCODE = '42501';
  END IF;

  WITH allowed_jurisdictions AS MATERIALIZED (
    SELECT aj.jurisdiction_id
    FROM ptas_private.accessible_jurisdiction_ids(v_actor.jurisdiction_id) aj
    WHERE v_actor.role_code = 'ETO'
  ),
  inspector_counts AS MATERIALIZED (
    SELECT responsible_inspector_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units
    WHERE responsible_inspector_id IS NOT NULL
    GROUP BY responsible_inspector_id
  ),
  circle_counts AS MATERIALIZED (
    SELECT circle_id, count(*)::int AS cnt
    FROM public.pft3_assessment_units
    WHERE circle_id IS NOT NULL
    GROUP BY circle_id
  ),
  officer_data AS (
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
      coalesce(ic.cnt, 0)::int AS assigned_survey_units_count,
      (coalesce(cc_ur.cnt, 0) + coalesce(cc_gc.cnt, 0))::int AS circle_survey_units_count
    FROM public.app_users u
    LEFT JOIN auth.users au ON au.id = u.auth_user_id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.valid_to IS NULL
    LEFT JOIN public.jurisdictions j ON j.id = ur.jurisdiction_id
    LEFT JOIN public.geo_circles gc
      ON gc.circle_code = j.code
      OR gc.id = j.id
      OR gc.circle_code = 'VHR-' || NULLIF(regexp_replace(j.code, '\D', '', 'g'), '')
    LEFT JOIN public.geo_tehsils gt ON gt.id = gc.tehsil_id
    LEFT JOIN public.geo_districts gd ON gd.id = gc.district_id
    LEFT JOIN public.geo_divisions gdiv ON gdiv.id = gd.division_id
    LEFT JOIN public.jurisdictions teh ON teh.id = j.parent_id AND teh.tier = 'TEHSIL'
    LEFT JOIN public.jurisdictions dist
      ON dist.id = CASE
        WHEN j.tier = 'DISTRICT' THEN j.id
        WHEN teh.id IS NOT NULL THEN teh.parent_id
        ELSE j.parent_id
      END
      AND dist.tier = 'DISTRICT'
    LEFT JOIN public.user_jurisdiction_assignments uja ON uja.user_id = u.id AND uja.valid_to IS NULL
    LEFT JOIN inspector_counts ic ON ic.responsible_inspector_id = u.id
    LEFT JOIN circle_counts cc_ur ON cc_ur.circle_id = ur.jurisdiction_id
    LEFT JOIN circle_counts cc_gc ON gc.id IS NOT NULL AND gc.id <> ur.jurisdiction_id AND cc_gc.circle_id = gc.id
    WHERE
      v_actor.role_code IN ('ADMIN', 'DIRECTOR')
      OR (
        v_actor.role_code = 'ETO' AND (
          EXISTS (SELECT 1 FROM allowed_jurisdictions aj WHERE aj.jurisdiction_id = ur.jurisdiction_id)
          OR (gd.id IS NOT NULL AND gd.district_code = 'VHR')
        )
      )
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
$function$;

CREATE INDEX IF NOT EXISTS idx_pft2_challans_overdue_sweep
  ON public.pft2_challans (due_date)
  WHERE administrative_state = 'ISSUED' AND payment_state = 'OUTSTANDING';

CREATE INDEX IF NOT EXISTS idx_pft3_units_responsible_inspector
  ON public.pft3_assessment_units (responsible_inspector_id)
  WHERE responsible_inspector_id IS NOT NULL;

COMMIT;

BEGIN;

-- Dedicated table for Potential Assessment Units (unapproved provisional pipeline)
CREATE TABLE IF NOT EXISTS public.potential_assessment_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  potential_number text NOT NULL UNIQUE,
  pin_number text NOT NULL UNIQUE,
  provincial_uin text NOT NULL,
  legal_name text NOT NULL,
  trade_name text,
  identifier_type text NOT NULL DEFAULT 'CNIC',
  identifier_value text NOT NULL,
  address text NOT NULL,
  locality text,
  circle_id uuid REFERENCES public.jurisdictions(id),
  circle_name text NOT NULL DEFAULT 'Circle-Vehari',
  district_name text NOT NULL DEFAULT 'Vehari',
  category_code text NOT NULL,
  category_name text NOT NULL,
  subclassification_code text,
  subclassification_name text,
  statutory_tertiary_code text,
  statutory_tertiary_classification text,
  statutory_rule_id text NOT NULL,
  annual_rate_pkr integer NOT NULL DEFAULT 0,
  opening_arrears integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MIGRATED', 'CANCELLED')),
  migrated_to_demand_no text,
  migrated_at timestamptz,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_potential_units_status ON public.potential_assessment_units(status);
CREATE INDEX IF NOT EXISTS idx_potential_units_pin ON public.potential_assessment_units(pin_number);
CREATE INDEX IF NOT EXISTS idx_potential_units_potential_no ON public.potential_assessment_units(potential_number);

-- Read function for potential units
CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'potential_number', p.potential_number,
        'pin_number', p.pin_number,
        'provincial_uin', p.provincial_uin,
        'legal_name', p.legal_name,
        'trade_name', p.trade_name,
        'identifier_type', p.identifier_type,
        'identifier_value', p.identifier_value,
        'address', p.address,
        'locality', p.locality,
        'circle_id', p.circle_id,
        'circle_name', p.circle_name,
        'district_name', p.district_name,
        'category_code', p.category_code,
        'category_name', p.category_name,
        'subclassification_code', p.subclassification_code,
        'subclassification_name', p.subclassification_name,
        'statutory_tertiary_code', p.statutory_tertiary_code,
        'statutory_tertiary_classification', p.statutory_tertiary_classification,
        'statutory_rule_id', p.statutory_rule_id,
        'annual_rate_pkr', p.annual_rate_pkr,
        'opening_arrears', p.opening_arrears,
        'status', p.status,
        'migrated_to_demand_no', p.migrated_to_demand_no,
        'migrated_at', p.migrated_at,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      ORDER BY p.created_at DESC, p.id
    ),
    '[]'::jsonb
  )
  FROM public.potential_assessment_units p;
$$;

REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated;

COMMIT;

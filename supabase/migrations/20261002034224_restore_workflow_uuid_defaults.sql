BEGIN;

-- Server commands own identity generation for core workflow aggregates and
-- append-only financial entries. This also keeps retries independent of any
-- client-supplied record identifier.
ALTER TABLE public.taxpayers
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.assessments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.assessment_versions
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.demand_units
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.demand_ledger
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

COMMIT;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE jurisdiction_type AS ENUM ('REGION', 'DISTRICT', 'OFFICE', 'CIRCLE');
CREATE TYPE taxpayer_status AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'DUPLICATE_MERGED', 'ARCHIVED');
CREATE TYPE assessment_status AS ENUM (
  'DRAFT', 'SUBMITTED', 'RETURNED', 'HEARING_RECORDED', 'APPROVED',
  'REVISION_DRAFT', 'RESUBMITTED', 'DECISION_REQUESTED', 'WITHDRAWN', 'ADJUSTED'
);

CREATE TABLE jurisdiction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES jurisdiction(id),
  type jurisdiction_type NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active_from date NOT NULL,
  active_to date,
  CHECK (active_to IS NULL OR active_to >= active_from),
  UNIQUE (type, code)
);

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text NOT NULL UNIQUE,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE user_role (
  user_id uuid NOT NULL REFERENCES app_user(id),
  role_code text NOT NULL REFERENCES role(code),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  PRIMARY KEY (user_id, role_code, jurisdiction_id, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE taxpayer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permanent_demand_no text UNIQUE,
  display_name text NOT NULL,
  status taxpayer_status NOT NULL DEFAULT 'DRAFT',
  current_circle_id uuid REFERENCES jurisdiction(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1
);

CREATE TABLE taxpayer_identifier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxpayer_id uuid NOT NULL REFERENCES taxpayer(id),
  identifier_type text NOT NULL,
  normalized_value text NOT NULL,
  masked_value text NOT NULL,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  UNIQUE (identifier_type, normalized_value),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE financial_year (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  CHECK (ends_on > starts_on)
);

CREATE TABLE approval_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_identifier text NOT NULL UNIQUE,
  approving_authority text NOT NULL,
  approved_on date NOT NULL,
  source_document_sha256 text NOT NULL CHECK (length(source_document_sha256) = 64),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE legal_configuration_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type text NOT NULL,
  code text NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  effective_from date NOT NULL,
  effective_to date,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED')),
  approval_evidence_id uuid REFERENCES approval_evidence(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('DRAFT') OR approval_evidence_id IS NOT NULL),
  UNIQUE (config_type, code, version_no)
);

CREATE TABLE assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxpayer_id uuid NOT NULL REFERENCES taxpayer(id),
  financial_year_id uuid NOT NULL REFERENCES financial_year(id),
  status assessment_status NOT NULL DEFAULT 'DRAFT',
  current_version_no integer NOT NULL DEFAULT 1 CHECK (current_version_no > 0),
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taxpayer_id, financial_year_id)
);

CREATE TABLE assessment_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessment(id),
  version_no integer NOT NULL CHECK (version_no > 0),
  snapshot jsonb NOT NULL,
  status assessment_status NOT NULL,
  reason text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  approval_evidence_id uuid REFERENCES approval_evidence(id),
  UNIQUE (assessment_id, version_no),
  CHECK ((status = 'APPROVED') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE workflow_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_id uuid NOT NULL REFERENCES app_user(id),
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, idempotency_key)
);

CREATE TABLE demand_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxpayer_id uuid NOT NULL UNIQUE REFERENCES taxpayer(id),
  permanent_demand_no text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE demand_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_unit_id uuid NOT NULL REFERENCES demand_unit(id),
  financial_year_id uuid NOT NULL REFERENCES financial_year(id),
  entry_type text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  reverses_entry_id uuid REFERENCES demand_ledger(id),
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  posted_by uuid REFERENCES app_user(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (demand_unit_id, idempotency_key),
  CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE TABLE document_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  template_config_id uuid NOT NULL REFERENCES legal_configuration_version(id),
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES app_user(id),
  snapshot jsonb NOT NULL
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text,
  aggregate_id uuid,
  actor_id uuid REFERENCES app_user(id),
  actor_role text,
  jurisdiction_id uuid REFERENCES jurisdiction(id),
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; use an adjustment or new event', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER demand_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON demand_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER audit_event_no_update_delete
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX taxpayer_display_name_idx ON taxpayer USING btree (lower(display_name));
CREATE INDEX assessment_status_idx ON assessment (status, financial_year_id);
CREATE INDEX demand_ledger_unit_year_idx ON demand_ledger (demand_unit_id, financial_year_id, posted_at);
CREATE INDEX audit_event_correlation_idx ON audit_event (correlation_id, occurred_at);

COMMIT;

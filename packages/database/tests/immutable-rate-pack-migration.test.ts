import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0009_immutable_statutory_classification_rates.sql", import.meta.url)
  ),
  "utf8"
);

describe("immutable statutory classification rate packs", () => {
  it("stores immutable source evidence and formal approval metadata", () => {
    expect(migration).toContain("CREATE TABLE public.survey_classification_rate_packs");
    expect(migration).toContain("source_document_sha256 text NOT NULL UNIQUE");
    expect(migration).toContain("approval_identifier");
    expect(migration).toContain("approving_authority");
    expect(migration).toContain("approved_on");
  });

  it("permits only the controlled pending-to-active transition", () => {
    expect(migration).toContain("protect_rate_pack_mutation");
    expect(migration).toContain("ptas.rate_pack_activation");
    expect(migration).toContain("NEW.status <> 'ACTIVE'");
    expect(migration).toContain("active or retired survey classification rules are immutable");
  });

  it("activates all rules atomically and checks row counts", () => {
    expect(migration).toContain("admin_activate_survey_classification_rate_pack");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("GET DIAGNOSTICS v_inserted = ROW_COUNT");
    expect(migration).toContain("v_inserted <> v_pack.row_count");
    expect(migration).toContain("survey_classification_one_active_schedule_code");
  });

  it("is inaccessible to browser roles and records immutable audit events", () => {
    expect(migration).toContain("FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("STATUTORY_RATE_PACK_STAGED");
    expect(migration).toContain("STATUTORY_RATE_PACK_ACTIVATED");
  });
});

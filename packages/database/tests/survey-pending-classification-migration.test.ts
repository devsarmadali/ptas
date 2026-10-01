import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0011_survey_pending_classification_import.sql", import.meta.url)
  ),
  "utf8"
);

describe("survey pending-classification import migration", () => {
  it("allows only explicitly marked pending-review rows without inventing a rate", () => {
    expect(migration).toContain("lower(btrim(coalesce(remarks,''))) = 'under review'");
    expect(migration).toContain("resolved_rule_id IS NULL");
    expect(migration).toContain("PENDING_REVIEW");
    expect(migration).toContain("pft3_created',false");
  });

  it("keeps import promotion role-scoped, transactional, and idempotent", () => {
    expect(migration).toContain("active_actor(ARRAY['INSPECTOR'])");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("idempotency_key=p_idempotency_key");
    expect(migration).toContain("SURVEY_IMPORT_PROMOTED");
  });

  it("continues to reject duplicate legacy demand numbers", () => {
    expect(migration).toContain("Legacy Demand No is duplicated in this import");
    expect(migration).toContain("Legacy Demand No already exists");
  });
});

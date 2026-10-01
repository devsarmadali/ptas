import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0010_survey_digital_opening_year_and_demand_integrity.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("survey digital opening year and demand integrity migration", () => {
  it("retains the workbook financial year while resolving an effective approved rate set", () => {
    expect(migration).toContain("v_import_financial_year");
    expect(migration).toContain("v_rate_financial_year");
    expect(migration).toContain("status='ACTIVE'");
    expect(migration).toContain("AT TIME ZONE 'Asia/Karachi'");
  });

  it("preserves and uniquely constrains supplied legacy demand numbers", () => {
    expect(migration).toContain("survey_unit_profiles_legacy_demand_no_unique");
    expect(migration).toContain("lower(btrim(legacy_demand_no))");
    expect(migration).toContain("Legacy Demand No is duplicated in this import");
    expect(migration).toContain("Legacy Demand No already exists");
  });

  it("reconciles validation atomically and records an audit event", () => {
    expect(migration).toContain("SURVEY_IMPORT_VALIDATION_RECONCILED");
    expect(migration).toContain("NEEDS_CORRECTION");
    expect(migration).toContain("legacy_demand_numbers_preserved");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
  });
});

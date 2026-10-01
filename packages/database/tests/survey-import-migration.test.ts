import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../migrations/0005_survey_import_pipeline.sql", import.meta.url)),
  "utf8"
);

describe("survey import migration", () => {
  it("introduces normalized batches, rows, profiles, and effective approved rules", () => {
    expect(migration).toContain("CREATE TABLE survey_import_batches");
    expect(migration).toContain("CREATE TABLE survey_import_rows");
    expect(migration).toContain("CREATE TABLE survey_unit_profiles");
    expect(migration).toContain("CREATE TABLE survey_classification_rules");
    expect(migration).toContain("approval_identifier");
    expect(migration).toContain("source_document_sha256");
  });

  it("enforces the workbook header contract and derives legal fields server-side", () => {
    expect(migration).toContain("Survey No. (Auto)");
    expect(migration).toContain("Tax Assessment Option (Select)");
    expect(migration).toContain("Supplied assessment rate does not match server configuration");
    expect(migration).toContain("No active approved statutory classification matches this row");
  });

  it("uses transactional, role-scoped, idempotent import commands", () => {
    expect(migration).toContain("ptas_private.active_actor(ARRAY['INSPECTOR'])");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("SURVEY_IMPORT_PROMOTED");
  });

  it("separates the digital opening year from the effective statutory rate year", () => {
    const openingYearMigration = readFileSync(
      fileURLToPath(
        new URL(
          "../migrations/0010_survey_digital_opening_year_and_demand_integrity.sql",
          import.meta.url
        )
      ),
      "utf8"
    );
    expect(openingYearMigration).toContain("v_import_financial_year");
    expect(openingYearMigration).toContain("v_rate_financial_year");
    expect(openingYearMigration).toContain("legacy_demand_numbers_preserved");
    expect(openingYearMigration).toContain("survey_unit_profiles_legacy_demand_no_unique");
    expect(openingYearMigration).toContain("Legacy Demand No is duplicated in this import");
  });

  it("revokes direct writes and exposes jurisdiction-scoped reads only", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON survey_classification_rules");
    expect(migration).toContain("ptas_private.jurisdiction_contains");
  });
});

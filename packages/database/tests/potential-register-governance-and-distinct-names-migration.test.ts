import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0034_potential_register_governance_and_distinct_names.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261012100000_potential_register_governance_and_distinct_names.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("potential register governance and distinct names migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("adds distinct taxpayer_name and tehsil columns and relaxes not-null on optional fields", () => {
    expect(packageMigration).toContain("ADD COLUMN IF NOT EXISTS taxpayer_name text");
    expect(packageMigration).toContain("ADD COLUMN IF NOT EXISTS tehsil text");
    expect(packageMigration).toContain("ALTER COLUMN address");
    expect(packageMigration).toContain("ALTER COLUMN identifier_value");
  });

  it("grants full access to all statutory PTAS roles in update_potential_assessment_unit", () => {
    expect(packageMigration).toContain("ARRAY['ADMIN','ETO','INSPECTOR','ETI','DIRECTOR','DET']");
    expect(packageMigration).toContain("update_potential_assessment_unit");
    expect(packageMigration).toContain("create_potential_assessment_unit");
  });
});

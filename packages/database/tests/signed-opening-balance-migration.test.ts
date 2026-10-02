import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0018_signed_opening_balance.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002033416_signed_opening_balance.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("signed opening balance migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("preserves negative taxpayer credits in staging and profiles", () => {
    expect(packageMigration).toContain("DROP CONSTRAINT survey_import_rows_arrears_check");
    expect(packageMigration).toContain(
      "DROP CONSTRAINT survey_unit_profiles_opening_arrears_check"
    );
    expect(packageMigration).toContain("^-?[0-9]+");
    expect(packageMigration).toContain("excess payment/credit");
  });

  it("fails closed if the deployed import function shape differs", () => {
    expect(packageMigration).toContain(
      "signed opening-balance validation targets were not fully repaired"
    );
  });
});

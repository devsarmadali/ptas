import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0020_restore_workflow_uuid_defaults.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002034224_restore_workflow_uuid_defaults.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("core workflow UUID default restoration migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("generates identifiers server-side for every affected aggregate", () => {
    for (const table of [
      "taxpayers",
      "assessments",
      "assessment_versions",
      "demand_units",
      "demand_ledger"
    ]) {
      expect(packageMigration).toContain(`ALTER TABLE public.${table}`);
    }
    expect(packageMigration.match(/ALTER COLUMN id SET DEFAULT gen_random_uuid\(\)/g)).toHaveLength(
      5
    );
  });
});

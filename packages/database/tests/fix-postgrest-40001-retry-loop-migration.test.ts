import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0062_fix_postgrest_40001_retry_loop.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261123160000_fix_postgrest_40001_retry_loop.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("fix PostgREST 40001 infinite retry loop migration (0062)", () => {
  it("keeps repository and deployable migrations byte-for-byte identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("replaces all three RPCs with PT409 conflict codes and zero 40001 triggers", () => {
    expect(packageMigration).toContain("CREATE OR REPLACE FUNCTION public.transition_survey_unit");
    expect(packageMigration).toContain("CREATE OR REPLACE FUNCTION public.transition_pft2_challan");
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_activate_survey_classification_rate_pack"
    );

    const pt409Matches = packageMigration.match(/USING ERRCODE\s*=\s*'PT409'/g) ?? [];
    expect(pt409Matches).toHaveLength(3);
    expect(packageMigration).not.toMatch(/ERRCODE\s*=\s*'40001'/);
    expect(packageMigration).not.toMatch(/\b(DROP|REVOKE|DELETE\s+FROM\s+auth\.|ALTER\s+TABLE)\b/i);
  });
});

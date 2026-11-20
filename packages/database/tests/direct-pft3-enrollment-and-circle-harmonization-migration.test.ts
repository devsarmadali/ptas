import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0055_direct_pft3_enrollment_and_circle_harmonization.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261120150000_direct_pft3_enrollment_and_circle_harmonization.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("direct pft3 enrollment and circle harmonization migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("upgrades jurisdiction_contains with geo tables and cross-mapping", () => {
    expect(packageMigration).toContain("FROM public.geo_circles gc");
    expect(packageMigration).toContain("FROM public.geo_districts gd");
    expect(packageMigration).toContain("CIR_VEH_01");
  });

  it("supports direct pft3 enrollment with statutory approval for assessing authority", () => {
    expect(packageMigration).toContain("v_direct_enroll boolean;");
    expect(packageMigration).toContain("v_actor.role_code IN ('ETO', 'ADMIN', 'DIRECTOR', 'DET')");
    expect(packageMigration).toContain("enroll_direct_to_pft3");
    expect(packageMigration).toContain("v_state := 'APPROVED';");
    expect(packageMigration).toContain("v_pin_suffix := '01';");
  });
});

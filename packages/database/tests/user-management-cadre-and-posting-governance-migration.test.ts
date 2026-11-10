import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0054_user_management_cadre_and_posting_governance.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261110200000_user_management_cadre_and_posting_governance.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("user management cadre and posting governance migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("adds civil service cadre attributes to app_users and assignments", () => {
    expect(packageMigration).toContain("ppo_number text");
    expect(packageMigration).toContain("father_name text");
    expect(packageMigration).toContain("bps_scale smallint");
    expect(packageMigration).toContain("must_change_password boolean");
    expect(packageMigration).toContain("is_primary boolean");
    expect(packageMigration).toContain("handing_over_notes text");
  });

  it("maintains dual-sync trigger between jurisdiction assignments and user_roles", () => {
    expect(packageMigration).toContain("fn_sync_user_jurisdiction_to_roles");
    expect(packageMigration).toContain("trg_sync_user_jurisdiction_to_roles");
    expect(packageMigration).toContain("public.user_jurisdiction_assignments");
    expect(packageMigration).toContain("public.user_roles");
  });

  it("exports official transfer posting RPC with charge type and incumbent relief", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.transfer_officer_posting("
    );
    expect(packageMigration).toContain("p_transfer_order_number text");
    expect(packageMigration).toContain("p_is_primary boolean DEFAULT true");
    expect(packageMigration).toContain("p_relieve_current_incumbent boolean DEFAULT false");
  });

  it("upgrades district governance matrix to expose vacant circles and PPO IDs", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()"
    );
    expect(packageMigration).toContain("inspector_ppo");
    expect(packageMigration).toContain("FROM public.geo_circles gc");
  });
});

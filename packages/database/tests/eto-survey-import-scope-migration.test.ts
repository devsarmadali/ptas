import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0012_eto_survey_import_scope.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260930153047_eto_survey_import_scope.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("ETO survey-import jurisdiction migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("authorizes only active Inspectors and ETOs with the required assignment tier", () => {
    expect(packageMigration).toContain("active_actor(ARRAY['INSPECTOR','ETO'])");
    expect(packageMigration).toContain("v_actor_tier NOT IN ('DISTRICT','ZONE')");
    expect(packageMigration).toContain("ETO must be assigned to a District or Zone");
  });

  it("resolves each ETO-imported row to a contained Circle and rejects scope bypass", () => {
    expect(packageMigration).toContain(
      "ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,j.id)"
    );
    expect(packageMigration).toContain(
      "Circle is missing, ambiguous, or outside the ETO District/Zone"
    );
    expect(packageMigration).toContain(
      "NOT ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,v_row.resolved_jurisdiction_id)"
    );
  });

  it("assigns promoted units to the one active Inspector for the resolved Circle", () => {
    expect(packageMigration).toContain("ur.role_code='INSPECTOR'");
    expect(packageMigration).toContain("ur.jurisdiction_id=v_row.resolved_jurisdiction_id");
    expect(packageMigration).toContain(
      "exactly one active Inspector must be assigned to each imported Circle"
    );
    expect(packageMigration).toContain("v_row.resolved_jurisdiction_id,v_responsible_inspector_id");
  });
});

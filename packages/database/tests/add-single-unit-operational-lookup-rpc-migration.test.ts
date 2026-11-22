import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0060_add_single_unit_operational_lookup_rpc.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261122170000_add_single_unit_operational_lookup_rpc.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("single-unit operational lookup RPC migration", () => {
  it("keeps repository and deployable migrations byte-identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("is strictly non-destructive and pins empty search_path with SECURITY DEFINER", () => {
    expect(packageMigration).not.toMatch(
      /\bDROP\s+(?:TABLE|VIEW|FUNCTION|INDEX|POLICY|TRIGGER|SCHEMA)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b/i
    );
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain("SECURITY DEFINER");
  });

  it("enforces fail-closed actor, jurisdiction, inspector scope, and strict EXECUTE grants", () => {
    expect(packageMigration).toContain("ptas_private.active_actor");
    expect(packageMigration).toContain("ptas_private.accessible_jurisdiction_ids");
    expect(packageMigration).toContain("v_unit.responsible_inspector_id");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_operational_survey_unit(text) FROM PUBLIC, anon;"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_operational_survey_unit(text) TO authenticated;"
    );
  });
});

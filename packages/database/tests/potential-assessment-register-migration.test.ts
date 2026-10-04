import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0023_potential_assessment_register.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261004120000_potential_assessment_register.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("potential assessment register migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("creates the potential_assessment_units table with potential_number and pin_number", () => {
    expect(packageMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.potential_assessment_units"
    );
    expect(packageMigration).toContain("potential_number text NOT NULL UNIQUE");
    expect(packageMigration).toContain("pin_number text NOT NULL UNIQUE");
    expect(packageMigration).toContain("provincial_uin text NOT NULL");
    expect(packageMigration).toContain("migrated_to_demand_no text");
  });

  it("uses a hardened security-definer search path and explicit grants for list_potential_assessment_units", () => {
    expect(packageMigration).toContain("SECURITY DEFINER");
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.list_potential_assessment_units() FROM PUBLIC, anon"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_potential_assessment_units() TO authenticated"
    );
  });
});

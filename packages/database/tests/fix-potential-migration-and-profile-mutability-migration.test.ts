import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0031_fix_potential_migration_and_profile_mutability.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261011170000_fix_potential_migration_and_profile_mutability.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("fix potential migration and profile mutability migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("permits updating survey_unit_profiles while maintaining deletion immutability", () => {
    expect(packageMigration).toContain(
      "IF TG_TABLE_NAME = 'survey_unit_profiles' AND TG_OP = 'UPDATE' THEN"
    );
    expect(packageMigration).toContain("RETURN NEW;");
    expect(packageMigration).toContain("RAISE EXCEPTION '% is immutable', TG_TABLE_NAME");
  });

  it("allows both Inspector and ETO to migrate potential units and synchronizes database records", () => {
    expect(packageMigration).toContain("ptas_private.active_actor(ARRAY['INSPECTOR', 'ETO'])");
    expect(packageMigration).toContain("UPDATE public.potential_assessment_units");
    expect(packageMigration).toContain("UPDATE public.demand_units");
    expect(packageMigration).toContain("INSERT INTO public.pft3_register_entries");
  });

  it("enforces authentication and grants", () => {
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) FROM PUBLIC, anon;"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.migrate_potential_unit_to_pft3(uuid, text) TO authenticated;"
    );
  });
});

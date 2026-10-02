import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0014_operational_survey_read_model.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261001140832_operational_survey_read_model.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("operational survey read model migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("derives identity and role from the authenticated server context", () => {
    expect(packageMigration).toContain(
      "ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN'])"
    );
    expect(packageMigration).toContain("SECURITY DEFINER");
    expect(packageMigration).toContain("SET search_path = public,ptas_private,pg_temp");
  });

  it("enforces jurisdiction and Inspector ownership before returning units", () => {
    expect(packageMigration).toContain(
      "ptas_private.jurisdiction_contains(a.jurisdiction_id,u.jurisdiction_id)"
    );
    expect(packageMigration).toContain("u.responsible_inspector_id = a.user_id");
  });

  it("returns the authoritative workflow, assessment, demand, ledger, and PFT3 records", () => {
    for (const relation of [
      "public.survey_units",
      "public.survey_unit_profiles",
      "public.assessments",
      "public.assessment_versions",
      "public.demand_units",
      "public.demand_ledger",
      "public.pft3_register_entries"
    ]) {
      expect(packageMigration).toContain(relation);
    }
  });

  it("denies anonymous execution and grants only authenticated execution", () => {
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC,anon"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated"
    );
  });
});

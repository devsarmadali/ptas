import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0021_operational_survey_pft3_projection.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002101336_operational_survey_pft3_projection.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("operational survey PFT3 projection migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("uses a hardened security-definer search path and explicit grants", () => {
    expect(packageMigration).toContain("SECURITY DEFINER");
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.list_operational_survey_units() FROM PUBLIC,anon"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_operational_survey_units() TO authenticated"
    );
  });

  it("projects jurisdiction and immutable PFT3 registration state", () => {
    expect(packageMigration).toContain("'jurisdiction',jsonb_build_object(");
    expect(packageMigration).toContain("'pft3_registered',pft3.id IS NOT NULL");
    expect(packageMigration).toContain("'pft3_registered_at',pft3.registered_at");
    expect(packageMigration).toContain("LEFT JOIN public.pft3_register_entries pft3");
  });

  it("retains server-derived actor and jurisdiction enforcement", () => {
    expect(packageMigration).toContain(
      "ptas_private.active_actor(ARRAY['INSPECTOR','ETO','DIRECTOR','ADMIN'])"
    );
    expect(packageMigration).toContain(
      "ptas_private.jurisdiction_contains(a.jurisdiction_id,u.jurisdiction_id)"
    );
  });
});

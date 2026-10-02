import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0022_taxpayer_pin_allocation_and_backfill.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002161500_taxpayer_pin_allocation_and_backfill.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("taxpayer PIN allocation and backfill migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("uses a hardened security-definer search path and explicit grants", () => {
    expect(packageMigration).toContain("SECURITY DEFINER");
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) FROM PUBLIC,anon"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.transition_survey_unit(uuid,text,bigint,text,text,text) TO authenticated"
    );
  });

  it("defines server-enforced PIN allocation and sequence generation", () => {
    expect(packageMigration).toContain("CREATE SEQUENCE IF NOT EXISTS public.taxpayer_pin_seq");
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION ptas_private.allocate_taxpayer_pin"
    );
    expect(packageMigration).toContain("PERFORM ptas_private.allocate_taxpayer_pin(v.id);");
    expect(packageMigration).toContain("UPDATE public.taxpayers");
  });

  it("includes backfill loop for approved survey units", () => {
    expect(packageMigration).toContain("WHERE u.state = 'APPROVED'");
    expect(packageMigration).toContain("PERFORM ptas_private.allocate_taxpayer_pin(r.id);");
  });
});

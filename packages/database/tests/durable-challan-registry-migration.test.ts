import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0026_durable_challan_registry.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261007030429_durable_challan_registry.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("durable challan registry migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("uses separate regular, potential, and receipt tables", () => {
    expect(packageMigration).toContain("ALTER TABLE public.pft2_challans");
    expect(packageMigration).toContain("CREATE TABLE IF NOT EXISTS public.potential_pft2_challans");
    expect(packageMigration).toContain("ALTER TABLE public.pft2_receipts");
  });

  it("stores jurisdiction abbreviations and resolves district and circle codes", () => {
    expect(packageMigration).toContain("ADD COLUMN IF NOT EXISTS abbreviation text");
    expect(packageMigration).toContain("WHEN code='DIST_VEH' THEN 'VHR'");
    expect(packageMigration).toContain("WHERE tier IN ('DISTRICT','ZONE')");
    expect(packageMigration).toContain("WHERE tier='CIRCLE'");
    expect(packageMigration).toContain("public.get_challan_jurisdiction_codes(uuid)");
    expect(packageMigration).toContain("pg_advisory_xact_lock");
  });

  it("keeps potential migration behind the assessing-authority gate", () => {
    expect(packageMigration).toContain("ptas_private.active_actor(ARRAY['ETO'])");
    expect(packageMigration).toContain("POTENTIAL_UNIT_MIGRATION_APPROVED");
  });

  it("exposes only authenticated RPC commands for issuance, receipt, and listing", () => {
    expect(packageMigration).toContain("public.issue_pft2_challan_record(jsonb,text,text)");
    expect(packageMigration).toContain(
      "public.receive_pft2_challan_record(uuid,boolean,jsonb,text,text)"
    );
    expect(packageMigration).toContain("public.list_pft2_challan_registry()");
    expect(packageMigration).toContain("FROM PUBLIC,anon");
  });
});

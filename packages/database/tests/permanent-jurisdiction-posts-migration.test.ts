import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0063_permanent_jurisdiction_posts_and_governance.sql", import.meta.url)
  ),
  "utf8"
);

const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261123180000_permanent_jurisdiction_posts_and_governance.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("permanent sanctioned posts & jurisdiction governance migration (0063)", () => {
  it("keeps package migration and Supabase deploy migration byte-for-byte identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("enforces relational geographical FK bridge without hardcoded district/circle ID workarounds", () => {
    expect(packageMigration).toContain("ADD COLUMN geo_division_id uuid NULL");
    expect(packageMigration).toContain("ADD COLUMN geo_district_id uuid NULL");
    expect(packageMigration).toContain("ADD COLUMN geo_circle_id uuid NULL");
    expect(packageMigration).toContain("idx_jurisdictions_geo_circle_id");

    const accessibleStart = packageMigration.indexOf(
      "CREATE OR REPLACE FUNCTION ptas_private.accessible_jurisdiction_ids"
    );
    const accessibleEnd = packageMigration.indexOf(
      "CREATE OR REPLACE FUNCTION ptas_private.jurisdiction_contains"
    );
    const accessibleBody = packageMigration.slice(accessibleStart, accessibleEnd);
    expect(accessibleBody).toContain("j.geo_district_id");
    expect(accessibleBody).toContain("j.geo_circle_id");
    expect(accessibleBody).not.toContain("DIST_VEHARI");
    expect(accessibleBody).not.toContain("CIR_VEH_01");
  });

  it("enforces permanent geographical code immutability and deletes blocked on all geo tables", () => {
    for (const table of [
      "geo_divisions",
      "geo_districts",
      "geo_tehsils",
      "geo_circles",
      "jurisdictions"
    ]) {
      expect(packageMigration).toContain(`trg_${table}_identity_immutable`);
      expect(packageMigration).toContain(`BEFORE UPDATE OR DELETE ON public.${table}`);
    }
    expect(packageMigration).toContain("enforce_sanctioned_post_immutability");
    expect(packageMigration).toContain("trg_sanctioned_posts_immutable");
  });

  it("enforces DET = BPS-19, ETO = BPS-17, ETI = BPS-16, and ETC = BPS-05 Notice Delivery Only", () => {
    expect(packageMigration).toContain(
      "jurisdiction_tier = 'DIVISION' AND role_code = 'DET' AND district_id IS NULL AND circle_id IS NULL AND min_bps = 19 AND max_bps = 19"
    );
    expect(packageMigration).toContain(
      "jurisdiction_tier = 'DISTRICT' AND role_code = 'ETO' AND district_id IS NOT NULL AND circle_id IS NULL AND min_bps = 17 AND max_bps = 17"
    );
    expect(packageMigration).toContain(
      "jurisdiction_tier = 'CIRCLE' AND role_code = 'ETI' AND district_id IS NOT NULL AND circle_id IS NOT NULL AND min_bps = 16 AND max_bps = 16"
    );
    expect(packageMigration).toContain(
      "jurisdiction_tier = 'CIRCLE' AND role_code = 'ETC' AND district_id IS NOT NULL AND circle_id IS NOT NULL AND min_bps = 5 AND max_bps = 5"
    );
    expect(packageMigration).not.toContain("BPS-18");
  });

  it("decouples permanent posts from officer accounts via post_assignments partial unique indexes", () => {
    expect(packageMigration).toContain("uq_post_assignments_active_post");
    expect(packageMigration).toContain("uq_post_assignments_active_substantive_user");
    expect(packageMigration).toContain(
      "DROP TRIGGER IF EXISTS trg_sync_user_jurisdiction_to_roles ON public.user_jurisdiction_assignments;"
    );
    expect(packageMigration).toContain("trg_validate_post_assignment");
    expect(packageMigration).toContain("trg_sync_post_assignments_to_legacy");
  });

  it("isolates ETC from default active_actor(NULL) and prohibits self-profile-editing for all users", () => {
    expect(packageMigration).toContain("ptas_private.canonical_role_code(c.raw_role) <> 'ETC'");
    expect(packageMigration).toContain(
      "Officers are prohibited from modifying their own profile; only superior jurisdiction authority may update officer particulars"
    );
  });

  it("uses PT409 conflict codes and never introduces 40001/40P01 ERRCODE loops", () => {
    expect(packageMigration).toContain("USING ERRCODE = 'PT409'");
    expect(packageMigration).not.toMatch(/ERRCODE\s*=\s*'(40001|40P01)'/);
  });

  it("exports all required governance, posting, relief, renaming, and sanctioning RPCs with strict grants", () => {
    for (const fn of [
      "public.resolve_my_ptas_actor()",
      "public.get_jurisdiction_governance_overview()",
      "public.get_district_governance_matrix()",
      "public.assign_officer_to_post(uuid, uuid, text, text, text, boolean)",
      "public.relieve_officer_from_post(uuid, text, text)",
      "public.rename_jurisdiction_entity(text, uuid, text, text)",
      "public.attach_circle_to_tehsil(uuid, uuid, text)",
      "public.sanction_circle_post(uuid, text, text, text)",
      "public.update_officer_profile(uuid, text, text, text, text, text, text, text, smallint)"
    ]) {
      expect(packageMigration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon;`);
      expect(packageMigration).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`);
    }
  });
});

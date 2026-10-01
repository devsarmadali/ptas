import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../migrations/0004_organization_hierarchy.sql", import.meta.url)),
  "utf8"
);

describe("organization hierarchy migration", () => {
  it("models parallel administrative tiers with optional tehsil", () => {
    expect(migration).toContain("'DIVISION','REGION','DISTRICT','ZONE','TEHSIL','CIRCLE'");
    expect(migration).toContain("a tehsil must be under a district or zone");
    expect(migration).toContain("a circle must be under a district, zone, or tehsil");
  });

  it("limits inspectors to one active circle and validates authority tiers", () => {
    expect(migration).toContain("user_roles_one_active_inspector");
    expect(migration).toContain("Inspector must be assigned to exactly one circle");
    expect(migration).toContain("ETO must be assigned to a district or zone");
    expect(migration).toContain("Director must be assigned to a division or region");
  });

  it("inherits jurisdiction access downward while keeping admin technical-only", () => {
    expect(migration).toContain("ptas_private.jurisdiction_contains");
    expect(migration).toContain("ptas_private.can_access_jurisdiction");
    expect(migration).toContain("a.role_code='ADMIN'");
    expect(migration).not.toContain("ARRAY['ETO','ADMIN']");
  });

  it("seeds all four Multan Division districts and ten circles per branch", () => {
    for (const code of ["DIST_MULTAN", "DIST_VEH", "DIST_KHAN", "DIST_LOD"]) {
      expect(migration).toContain(code);
    }
    expect(migration).toContain("generate_series(1,10)");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0057_optimize_accessible_jurisdiction_ids.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261122153000_optimize_accessible_jurisdiction_ids.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("index-friendly accessible_jurisdiction_ids migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("is strictly non-destructive and pinpoints search_path", () => {
    expect(packageMigration).not.toMatch(
      /\bDROP\s+(?:TABLE|VIEW|FUNCTION|INDEX|POLICY|TRIGGER|SCHEMA)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b/i
    );
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain("SECURITY DEFINER");
  });

  it("uses equality join predicates across geo_circles and geo_districts mappings", () => {
    expect(packageMigration).not.toMatch(/\bON\s+[^\n;]*\bOR\b/i);
    expect(packageMigration).toContain("gc.circle_code = 'VHR-1'");
    expect(packageMigration).toContain("gd.district_code = 'VHR'");
    expect(packageMigration).toContain("j.code = 'CIR_VEH_01'");
    expect(packageMigration).toContain("j.code = 'DIST_VEHARI'");
  });
});

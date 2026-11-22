import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0059_optimize_secondary_list_and_governance_rpcs.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261122163000_optimize_secondary_list_and_governance_rpcs.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("secondary list RPCs, governance matrix, and partial indexes optimization migration", () => {
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

  it("pre-sorts registry lists, eliminates governance OR-expansion/N+1 subqueries, and adds partial indexes", () => {
    expect(packageMigration).toContain("ordered_challans");
    expect(packageMigration).toContain("ordered_receipts");
    expect(packageMigration).toContain("unit_stats");
    expect(packageMigration).toContain("inspector_counts");
    expect(packageMigration).toContain("idx_pft2_challans_overdue_sweep");
    expect(packageMigration).toContain("idx_pft3_units_responsible_inspector");
  });
});

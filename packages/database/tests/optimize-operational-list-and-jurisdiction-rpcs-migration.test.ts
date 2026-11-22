import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0058_optimize_operational_list_and_jurisdiction_rpcs.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261122160000_optimize_operational_list_and_jurisdiction_rpcs.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("operational list RPC and jurisdiction dispatch optimization migration", () => {
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

  it("implements early-exit plpgsql jurisdiction dispatch, ordered_units pre-sort, and audit index", () => {
    expect(packageMigration).toContain("IF p_root IS NULL THEN");
    expect(packageMigration).toContain("v_actor.role_code IN ('ADMIN', 'DIRECTOR', 'DET')");
    expect(packageMigration).toContain("ordered_units");
    expect(packageMigration).toContain("idx_audit_events_occurred_at_desc");
  });
});

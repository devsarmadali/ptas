import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0056_performance_security_and_concurrency_hardening.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261122120000_performance_security_and_concurrency_hardening.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("performance, security, and concurrency hardening migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("is strictly non-destructive", () => {
    expect(packageMigration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(packageMigration).not.toMatch(/\bTRUNCATE\b/i);
    expect(packageMigration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("replaces per-row recursive CTE and correlated receipt subqueries with materialized set-based joins", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION ptas_private.accessible_jurisdiction_ids(p_root uuid)"
    );
    expect(packageMigration).toContain("WITH allowed_jurisdictions AS MATERIALIZED");
    expect(packageMigration).toContain("unit_ledger AS MATERIALIZED");
    expect(packageMigration).toContain("LEFT JOIN unit_ledger ul ON ul.pft3_unit_id = u.id");
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_potential_assessment_units()"
    );
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_pft2_challan_registry()"
    );
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_pft2_receipt_registry()"
    );
  });

  it("adds covering indexes and fixes RLS, SECURITY INVOKER, search_path, and anon execute grants", () => {
    expect(packageMigration).toContain("idx_app_users_active_auth_uid");
    expect(packageMigration).toContain("idx_user_roles_user_validity");
    expect(packageMigration).toContain("idx_pft3_units_circle_created");
    expect(packageMigration).toContain("idx_pft2_receipts_pft3_unit_received");
    expect(packageMigration).toContain("ALTER VIEW IF EXISTS public.potential_pft2_challans");
    expect(packageMigration).toContain("SET (security_invoker = true)");
    expect(packageMigration).toContain(
      "ALTER TABLE public.user_jurisdiction_assignments ENABLE ROW LEVEL SECURITY"
    );
    expect(packageMigration).toContain(
      "ALTER TABLE public.designated_bank_branches ENABLE ROW LEVEL SECURITY"
    );
    expect(packageMigration).toContain(
      "DROP POLICY IF EXISTS potential_units_authenticated_policy ON public.potential_assessment_units"
    );
    expect(packageMigration).toContain(
      "DROP POLICY IF EXISTS pft3_assessment_units_select ON public.pft3_assessment_units"
    );
    expect(packageMigration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon");
    expect(packageMigration).toContain("ALTER FUNCTION %s SET search_path = ''''");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0025_designated_bank_branches.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261005120000_designated_bank_branches.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("designated bank branches migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("creates the designated_bank_branches system table with expected columns and indices", () => {
    expect(packageMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.designated_bank_branches"
    );
    expect(packageMigration).toContain("serial_no integer NOT NULL");
    expect(packageMigration).toContain(
      "bank_name text NOT NULL DEFAULT 'National Bank of Pakistan'"
    );
    expect(packageMigration).toContain("region text NOT NULL");
    expect(packageMigration).toContain("district text NOT NULL");
    expect(packageMigration).toContain("branch_name text NOT NULL");
    expect(packageMigration).toContain("branch_code text NOT NULL");
    expect(packageMigration).toContain("is_active boolean NOT NULL DEFAULT true");
    expect(packageMigration).toContain("idx_bank_branches_district");
  });

  it("exposes get_designated_bank_branches with hardened security-definer search path and grants", () => {
    expect(packageMigration).toContain("FUNCTION public.get_designated_bank_branches");
    expect(packageMigration).toContain("SECURITY DEFINER");
    expect(packageMigration).toContain("SET search_path = ''");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_designated_bank_branches(text) FROM PUBLIC"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_designated_bank_branches(text) TO authenticated, anon"
    );
  });

  it("seeds official National Bank of Pakistan branches including Vehari district", () => {
    expect(packageMigration).toContain("Main Branch, Vehari");
    expect(packageMigration).toContain("Main Branch, Burewala");
    expect(packageMigration).toContain("Main Branch, Mailsi");
  });
});

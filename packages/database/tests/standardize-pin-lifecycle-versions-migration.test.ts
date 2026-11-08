import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0046Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0046_standardize_pin_lifecycle_versions.sql", import.meta.url)
  ),
  "utf8"
);
const migration0046Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261108160000_standardize_pin_lifecycle_versions.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("standardize pin lifecycle versions migration", () => {
  it("keeps migration 0046 repository and deployable files identical", () => {
    expect(migration0046Deploy).toBe(migration0046Package);
  });

  it("assigns statutory version suffixes (-04 for potential, -01 for Form PFT-3) in ptas_private.generate_ptas_pin", () => {
    expect(migration0046Package).toContain("v_version_suffix := '-04';");
    expect(migration0046Package).toContain("v_version_suffix := '-01';");
    expect(migration0046Package).toContain("p_version ~ '^0[1-7]$'");
  });

  it("enforces base immutability while permitting lifecycle transitions across 01 through 07 in prevent_pin_mutation", () => {
    expect(migration0046Package).toContain("FUNCTION ptas_private.prevent_pin_mutation()");
    expect(migration0046Package).toContain(
      "substring(OLD.pin_number from 1 for 22) = substring(NEW.pin_number from 1 for 22)"
    );
    expect(migration0046Package).toContain("OLD.pin_number ~ '-(0[1-7])$'");
    expect(migration0046Package).toContain("NEW.pin_number ~ '-(0[1-7])$'");
  });

  it("standardizes and backfills Form PFT-3 (-01) and Potential (-04) registers", () => {
    expect(migration0046Package).toContain("regexp_replace(pin_number, '-(0[1-7])$', '') || '-01'");
    expect(migration0046Package).toContain(
      "regexp_replace(regexp_replace(pin_number, '^Potential-', '', 'i'), '-(0[1-7])$', '') || '-04'"
    );
  });

  it("upgrades migrate_potential_unit_to_pft3 to transition -04 to -01", () => {
    expect(migration0046Package).toContain("FUNCTION public.migrate_potential_unit_to_pft3");
    expect(migration0046Package).toContain("regexp_replace(v_pin, '-(0[1-7])$', '-01')");
  });
});

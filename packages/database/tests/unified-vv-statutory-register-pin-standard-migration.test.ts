import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0044Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0044_unified_vv_statutory_register_pin_standard.sql", import.meta.url)
  ),
  "utf8"
);
const migration0044Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261108110000_unified_vv_statutory_register_pin_standard.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("unified vv statutory register pin standard migration", () => {
  it("keeps migration 0044 repository and deployable files identical", () => {
    expect(migration0044Deploy).toBe(migration0044Package);
  });

  it("generates 7-digit sequence with statutory version suffixes in ptas_private.generate_ptas_pin", () => {
    expect(migration0044Package).toContain("lpad(v_seq::text, 7, '0')");
    expect(migration0044Package).toContain("v_version_suffix := '-01';");
    expect(migration0044Package).toContain("v_version_suffix := '-02';");
  });

  it("enforces base immutability with strict 01 <-> 02 transitions in prevent_pin_mutation", () => {
    expect(migration0044Package).toContain("FUNCTION ptas_private.prevent_pin_mutation()");
    expect(migration0044Package).toContain(
      "substring(OLD.pin_number from 1 for 22) = substring(NEW.pin_number from 1 for 22)"
    );
    expect(migration0044Package).toContain("OLD.pin_number ~ '-01$' AND NEW.pin_number ~ '-02$'");
    expect(migration0044Package).toContain("OLD.pin_number ~ '-02$' AND NEW.pin_number ~ '-01$'");
  });

  it("standardizes and backfills both Form PFT-3 (-02) and Potential (-01) registers", () => {
    expect(migration0044Package).toContain("regexp_replace(pin_number, '-(01|02)$', '') || '-02'");
    expect(migration0044Package).toContain(
      "regexp_replace(regexp_replace(pin_number, '^Potential-', '', 'i'), '-(01|02)$', '') || '-01'"
    );
  });

  it("upgrades migrate_potential_unit_to_pft3 to transition -01 to -02", () => {
    expect(migration0044Package).toContain("FUNCTION public.migrate_potential_unit_to_pft3");
    expect(migration0044Package).toContain("regexp_replace(v_pin, '-01$', '-02')");
  });
});

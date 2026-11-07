import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0042Package = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0042_restore_legacy_csv_demands_and_province_wide_pin.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const migration0042Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261107230000_restore_legacy_csv_demands_and_province_wide_pin.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("restore legacy csv demands and province-wide unique pin migration", () => {
  it("keeps migration 0042 repository and deployable files identical", () => {
    expect(migration0042Deploy).toBe(migration0042Package);
  });

  it("defines official PBS district resolver ptas_private.get_district_pbs_code", () => {
    expect(migration0042Package).toContain(
      "FUNCTION ptas_private.get_district_pbs_code(p_district_name text)"
    );
    expect(migration0042Package).toContain("'lahore' THEN RETURN '218'");
    expect(migration0042Package).toContain("'multan' THEN RETURN '223'");
    expect(migration0042Package).toContain("'rawalpindi' THEN RETURN '231'");
    expect(migration0042Package).toContain("'vehari' THEN RETURN '237'");
  });

  it("implements collision-free loop in ptas_private.generate_ptas_pin", () => {
    expect(migration0042Package).toContain("FUNCTION ptas_private.generate_ptas_pin");
    expect(migration0042Package).toContain("SELECT 1 FROM public.pft3_assessment_units");
    expect(migration0042Package).toContain("SELECT 1 FROM public.potential_assessment_units");
  });

  it("restores legacy demand numbers from survey_import_rows without D or V prefixes", () => {
    expect(migration0042Package).toContain(
      "JOIN public.survey_import_rows r ON u.import_row_id = r.id"
    );
    expect(migration0042Package).toContain("WHERE r.legacy_demand_no IS NOT NULL");
    expect(migration0042Package).toContain("SET permanent_demand_no = v_rec.restored_demand");
  });

  it("enforces unique indexes on pin_number and provincial_uin", () => {
    expect(migration0042Package).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS pft3_assessment_units_pin_idx"
    );
    expect(migration0042Package).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS pft3_assessment_units_uin_idx"
    );
    expect(migration0042Package).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS potential_assessment_units_uin_idx"
    );
  });
});

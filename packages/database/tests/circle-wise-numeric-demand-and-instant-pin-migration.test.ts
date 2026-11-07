import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0041Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0041_circle_wise_numeric_demand_and_instant_pin.sql", import.meta.url)
  ),
  "utf8"
);
const migration0041Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261107220000_circle_wise_numeric_demand_and_instant_pin.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("circle-wise numeric demand and instant pin migration", () => {
  it("keeps migration 0041 repository and deployable files identical", () => {
    expect(migration0041Deploy).toBe(migration0041Package);
  });

  it("defines immutable ptas_private.normalize_demand_no", () => {
    expect(migration0041Package).toContain("FUNCTION ptas_private.normalize_demand_no(p_raw text)");
    expect(migration0041Package).toContain("IMMUTABLE");
  });

  it("defines ptas_private.get_next_circle_demand_no", () => {
    expect(migration0041Package).toContain(
      "FUNCTION ptas_private.get_next_circle_demand_no(p_circle_id uuid)"
    );
  });

  it("defines ptas_private.generate_ptas_pin with resilient optional tehsil", () => {
    expect(migration0041Package).toContain("FUNCTION ptas_private.generate_ptas_pin");
    expect(migration0041Package).toContain("nextval('public.taxpayer_pin_seq')");
  });

  it("allocates instant PIN and circle-wise numeric demand in create_individual_survey_unit", () => {
    expect(migration0041Package).toContain("FUNCTION public.create_individual_survey_unit");
    expect(migration0041Package).toContain("ptas_private.generate_ptas_pin");
    expect(migration0041Package).toContain("ptas_private.get_next_circle_demand_no");
  });

  it("allocates Potential- PIN and excludes demand number in create_potential_assessment_unit", () => {
    expect(migration0041Package).toContain("FUNCTION public.create_potential_assessment_unit");
    expect(migration0041Package).toContain("p_unit->>'statutory_rule_id'");
    expect(migration0041Package).toContain("true");
  });

  it("cleans PIN prefix and allocates circle demand on migration in migrate_potential_unit_to_pft3", () => {
    expect(migration0041Package).toContain("FUNCTION public.migrate_potential_unit_to_pft3");
    expect(migration0041Package).toContain(
      "regexp_replace(coalesce(v_row.pin_number, v_row.provincial_uin, ''), '^Potential-', '', 'i')"
    );
  });

  it("exposes row_version, pin_number, and permanent_demand_no in list_operational_survey_units", () => {
    expect(migration0041Package).toContain("FUNCTION public.list_operational_survey_units");
    expect(migration0041Package).toContain("u.row_version");
    expect(migration0041Package).toContain("u.pin_number");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0040Package = readFileSync(
  fileURLToPath(new URL("../migrations/0040_workflow_survey_and_potential_standardization.sql", import.meta.url)),
  "utf8"
);
const migration0040Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261106210000_workflow_survey_and_potential_standardization.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("workflow survey and potential standardization migration", () => {
  it("keeps migration 0040 repository and deployable files identical", () => {
    expect(migration0040Deploy).toBe(migration0040Package);
  });

  it("preserves supplied survey numbers in promote_survey_import", () => {
    expect(migration0040Package).toContain("FUNCTION public.promote_survey_import");
    expect(migration0040Package).toContain("coalesce(nullif(btrim(v_row.supplied_survey_no), ''), v_row.generated_survey_no::text)");
  });

  it("preserves supplied discovery reference in create_potential_assessment_unit", () => {
    expect(migration0040Package).toContain("FUNCTION public.create_potential_assessment_unit");
    expect(migration0040Package).toContain("coalesce(p_unit->>'potential_number', p_unit->>'survey_no')");
  });

  it("provides atomic bulk_create_potential_assessment_units RPC", () => {
    expect(migration0040Package).toContain("FUNCTION public.bulk_create_potential_assessment_units");
    expect(migration0040Package).toContain("BULK_POTENTIAL_UNITS_CREATED");
    expect(migration0040Package).toContain("GRANT EXECUTE ON FUNCTION public.bulk_create_potential_assessment_units(jsonb) TO authenticated");
  });
});

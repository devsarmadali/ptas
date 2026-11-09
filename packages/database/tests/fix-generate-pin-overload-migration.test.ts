import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0048Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0048_fix_generate_pin_overload_and_survey_unit_vv.sql", import.meta.url)
  ),
  "utf8"
);
const migration0048Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261109120000_fix_generate_pin_overload_and_survey_unit_vv.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("fix generate pin overload migration", () => {
  it("keeps migration 0048 repository and deployable files identical", () => {
    expect(migration0048Deploy).toBe(migration0048Package);
  });

  it("drops the legacy 5-argument generate_ptas_pin overload to eliminate ambiguity", () => {
    expect(migration0048Package).toContain(
      "DROP FUNCTION IF EXISTS ptas_private.generate_ptas_pin(uuid, text, text, text, boolean);"
    );
  });

  it("updates create_individual_survey_unit to assign -03 VV suffix for feeded survey units", () => {
    expect(migration0048Package).toContain(
      "CREATE OR REPLACE FUNCTION public.create_individual_survey_unit"
    );
    expect(migration0048Package).toContain("ptas_private.generate_ptas_pin(");
    expect(migration0048Package).toContain("'03'");
  });

  it("records initial baseline version in public.assessment_versions", () => {
    expect(migration0048Package).toContain("INSERT INTO public.assessment_versions (");
    expect(migration0048Package).toContain("ON CONFLICT (unit_id, version_no) DO NOTHING;");
  });
});

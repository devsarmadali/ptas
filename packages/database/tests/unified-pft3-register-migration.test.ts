import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0037Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0037_unified_pft3_register_and_cleanup.sql", import.meta.url)
  ),
  "utf8"
);
const migration0037Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261106180000_unified_pft3_register_and_cleanup.sql",
      import.meta.url
    )
  ),
  "utf8"
);

const migration0038Package = readFileSync(
  fileURLToPath(new URL("../migrations/0038_retire_legacy_survey_tables.sql", import.meta.url)),
  "utf8"
);
const migration0038Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261106190000_retire_legacy_survey_tables.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("unified PFT3 register and legacy survey table cleanup migrations", () => {
  it("keeps migration 0037 repository and deployable files identical", () => {
    expect(migration0037Deploy).toBe(migration0037Package);
  });

  it("keeps migration 0038 repository and deployable files identical", () => {
    expect(migration0038Deploy).toBe(migration0038Package);
  });

  it("0037 establishes public.pft3_assessment_units with RLS and PIN allocator", () => {
    expect(migration0037Package).toContain(
      "CREATE TABLE IF NOT EXISTS public.pft3_assessment_units"
    );
    expect(migration0037Package).toContain(
      "ALTER TABLE public.pft3_assessment_units ENABLE ROW LEVEL SECURITY"
    );
    expect(migration0037Package).toContain("ptas_private.allocate_pft3_pin");
    expect(migration0037Package).toContain("ptas_private.active_actor");
  });

  it("0038 consolidates governance, directory, challan issuance and drops 8 legacy tables", () => {
    expect(migration0038Package).toContain(
      "DROP TABLE IF EXISTS public.pft3_register_entries CASCADE"
    );
    expect(migration0038Package).toContain(
      "DROP TABLE IF EXISTS public.assessment_versions CASCADE"
    );
    expect(migration0038Package).toContain("DROP TABLE IF EXISTS public.assessments CASCADE");
    expect(migration0038Package).toContain("DROP TABLE IF EXISTS public.demand_units CASCADE");
    expect(migration0038Package).toContain(
      "DROP TABLE IF EXISTS public.taxpayer_identifiers CASCADE"
    );
    expect(migration0038Package).toContain("DROP TABLE IF EXISTS public.taxpayers CASCADE");
    expect(migration0038Package).toContain(
      "DROP TABLE IF EXISTS public.survey_unit_profiles CASCADE"
    );
    expect(migration0038Package).toContain("DROP TABLE IF EXISTS public.survey_units CASCADE");
  });

  it("0038 routes issue_pft2_challan_record to pft3_assessment_units for statutory challans", () => {
    expect(migration0038Package).toContain("FROM public.pft3_assessment_units p");
    expect(migration0038Package).toContain("INSERT INTO public.pft2_challans");
    expect(migration0038Package).toContain("pft3_unit_id");
  });
});

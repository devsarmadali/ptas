import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0047Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0047_assessment_versions_and_survey_pruning.sql", import.meta.url)
  ),
  "utf8"
);
const migration0047Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261109100000_assessment_versions_and_survey_pruning.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("assessment versions and survey pruning migration", () => {
  it("keeps migration 0047 repository and deployable files identical", () => {
    expect(migration0047Deploy).toBe(migration0047Package);
  });

  it("creates public.assessment_versions table with unique constraint on (unit_id, version_no)", () => {
    expect(migration0047Package).toContain("CREATE TABLE IF NOT EXISTS public.assessment_versions");
    expect(migration0047Package).toContain(
      "CONSTRAINT uq_assessment_versions_unit_version UNIQUE (unit_id, version_no)"
    );
    expect(migration0047Package).toContain(
      "REFERENCES public.pft3_assessment_units(id) ON DELETE CASCADE"
    );
  });

  it("enforces RLS on assessment_versions", () => {
    expect(migration0047Package).toContain(
      "ALTER TABLE public.assessment_versions ENABLE ROW LEVEL SECURITY;"
    );
    expect(migration0047Package).toContain("CREATE POLICY assessment_versions_select_policy");
    expect(migration0047Package).toContain("CREATE POLICY assessment_versions_insert_policy");
  });

  it("backfills baseline version 1 records from pft3_assessment_units", () => {
    expect(migration0047Package).toContain("INSERT INTO public.assessment_versions");
    expect(migration0047Package).toContain("FROM public.pft3_assessment_units p");
    expect(migration0047Package).toContain("ON CONFLICT (unit_id, version_no) DO NOTHING;");
  });

  it("prunes approved units from survey_import_rows to reclaim database space", () => {
    expect(migration0047Package).toContain("DELETE FROM public.survey_import_rows r");
    expect(migration0047Package).toContain("WHERE r.promoted_survey_unit_id = u.id");
    expect(migration0047Package).toContain("AND u.state = 'APPROVED'");
  });

  it("upgrades transition_survey_unit to record assessment versions and prune staging upon approval", () => {
    expect(migration0047Package).toContain(
      "CREATE OR REPLACE FUNCTION public.transition_survey_unit"
    );
    expect(migration0047Package).toContain("INSERT INTO public.assessment_versions");
    expect(migration0047Package).toContain(
      "DELETE FROM public.survey_import_rows WHERE promoted_survey_unit_id = v.id;"
    );
  });

  it("provides get_assessment_versions RPC for historical audit and dossier inspection", () => {
    expect(migration0047Package).toContain(
      "CREATE OR REPLACE FUNCTION public.get_assessment_versions"
    );
    expect(migration0047Package).toContain("FROM public.assessment_versions v");
  });
});

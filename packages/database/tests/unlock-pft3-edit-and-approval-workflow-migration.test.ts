import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0028_unlock_pft3_edit_and_approval_workflow.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261011140000_unlock_pft3_edit_and_approval_workflow.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("unlock PFT3 edit and approval workflow migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("permits editing of approved units by transitioning them to SUBMITTED status", () => {
    expect(packageMigration).toContain("IF v_prev_state = 'APPROVED' THEN");
    expect(packageMigration).toContain("v_next_state := 'SUBMITTED';");
    expect(packageMigration).toContain("INSERT INTO public.assessment_versions");
  });

  it("updates transition_survey_unit to allow ETO re-approval and Inspector revision", () => {
    expect(packageMigration).toContain(
      "WHEN v.state='APPROVED' AND p_action IN ('REVISE','SUBMIT','EDIT') THEN 'SUBMITTED'"
    );
    expect(packageMigration).toContain("ON CONFLICT (survey_unit_id) DO NOTHING");
  });

  it("enforces authentication and security boundaries", () => {
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.update_individual_survey_unit"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit"
    );
    expect(packageMigration).toContain("REVOKE ALL ON FUNCTION public.transition_survey_unit");
    expect(packageMigration).toContain("GRANT EXECUTE ON FUNCTION public.transition_survey_unit");
  });
});

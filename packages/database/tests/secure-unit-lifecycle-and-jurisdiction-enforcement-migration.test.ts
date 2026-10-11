import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0027_secure_unit_lifecycle_and_jurisdiction_enforcement.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261011130000_secure_unit_lifecycle_and_jurisdiction_enforcement.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("secure unit lifecycle and jurisdiction enforcement migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("enforces active role authentication and strict jurisdiction checks", () => {
    expect(packageMigration).toContain("ptas_private.active_actor(ARRAY['INSPECTOR','ETO'])");
    expect(packageMigration).toContain("ptas_private.jurisdiction_contains");
    expect(packageMigration).toContain(
      "Tax Inspector is legally restricted to their assigned circle jurisdiction"
    );
    expect(packageMigration).toContain(
      "Specified circle is outside the Assessing Authority (ETO) district jurisdiction"
    );
  });

  it("enforces Statutory Rule 4 Governance lock on editing survey units", () => {
    expect(packageMigration).toContain("public.update_individual_survey_unit(");
    expect(packageMigration).toContain("v_unit.state NOT IN ('NEW', 'FEEDED', 'RETURNED')");
    expect(packageMigration).toContain("Editing is prohibited under Statutory Governance");
  });

  it("prevents editing of migrated potential units and restricts circle reassignment", () => {
    expect(packageMigration).toContain("public.update_potential_assessment_unit(");
    expect(packageMigration).toContain("v_row.status = 'MIGRATED'");
    expect(packageMigration).toContain(
      "Tax Inspector cannot change the circle jurisdiction of a potential unit"
    );
  });

  it("records tamper-free audit events and restricts execution to authenticated users only", () => {
    expect(packageMigration).toContain("ptas_private.audit_transition(");
    expect(packageMigration).toContain("SURVEY_UNIT_UPDATED");
    expect(packageMigration).toContain("POTENTIAL_UNIT_UPDATED");
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.create_individual_survey_unit"
    );
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.update_individual_survey_unit"
    );
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.update_potential_assessment_unit"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.update_individual_survey_unit"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.update_potential_assessment_unit"
    );
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0032_fix_pin_allocation_and_survey_update_rule_rate.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261011183000_fix_pin_allocation_and_survey_update_rule_rate.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("fix pin allocation and survey update rule rate migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("ensures allocate_taxpayer_pin preserves statutory 17-digit PIN standards", () => {
    expect(packageMigration).toContain("ptas_private.allocate_taxpayer_pin");
    expect(packageMigration).toContain("ptas_private.get_rule_uin_block");
    expect(packageMigration).toContain("public.taxpayer_pin_seq");
    expect(packageMigration).toContain("NOT v_taxpayer.permanent_demand_no LIKE 'Potential-%'");
  });

  it("fixes assessment_rate referencing in update_individual_survey_unit and migrate_potential_unit_to_pft3", () => {
    expect(packageMigration).toContain("v_rule.assessment_rate");
    expect(packageMigration).toContain("'taxAmount', v_rule.assessment_rate");
  });

  it("runs statutory PIN backfill repair for approved PFT-3 units lacking a 17-digit PIN", () => {
    expect(packageMigration).toContain("WHERE su.state = 'APPROVED'");
    expect(packageMigration).toContain(
      "PERFORM ptas_private.allocate_taxpayer_pin(v_rec.survey_unit_id);"
    );
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(new URL("../migrations/0013_bulk_survey_submit_and_approve.sql", import.meta.url)),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260930163845_bulk_survey_submit_and_approve.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("permanent bulk survey submit and approval migration", () => {
  it("keeps the repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("keeps Inspector submission and ETO approval as separate commands", () => {
    expect(packageMigration).toContain("active_actor(ARRAY['INSPECTOR'])");
    expect(packageMigration).toContain("active_actor(ARRAY['ETO'])");
    expect(packageMigration).toContain("'BULK_SUBMIT'");
    expect(packageMigration).toContain("'BULK_APPROVE'");
  });

  it("locks batches and units in deterministic order and rejects invalid states", () => {
    expect(packageMigration).toContain("WHERE id=p_batch_id\n  FOR UPDATE");
    expect(packageMigration).toContain("ORDER BY u.id\n    FOR UPDATE OF u");
    expect(packageMigration).toContain("every unit must be Feeded before bulk submission");
    expect(packageMigration).toContain("every unit must be Submitted before bulk approval");
  });

  it("scopes Inspector submission to that Inspector's assigned units", () => {
    expect(packageMigration).toContain("u.responsible_inspector_id=v_actor.user_id");
    expect(packageMigration).toContain(
      "ptas_private.jurisdiction_contains(v_actor.jurisdiction_id,u.jurisdiction_id)"
    );
    expect(packageMigration).toContain(
      "imported batch has no Feeded units assigned to this Inspector"
    );
  });

  it("requires resolved active statutory classifications before approval", () => {
    expect(packageMigration).toContain("v_profile.classification_status<>'CLASSIFIED'");
    expect(packageMigration).toContain("status='ACTIVE'");
    expect(packageMigration).toContain("financial_year_code=v_unit.financial_year_id");
  });

  it("uses the existing transition command for auditable idempotent PFT3 approval", () => {
    expect(packageMigration).toContain("public.transition_survey_unit(");
    expect(packageMigration).toContain("p_idempotency_key||':'||v_unit.id::text");
    expect(packageMigration).toContain("SURVEY_IMPORT_BULK_APPROVED");
    expect(packageMigration).not.toContain("INSERT INTO public.pft3_register_entries");
  });
});

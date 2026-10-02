import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0015_survey_import_enum_casts_after_eto_scope.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002031923_survey_import_enum_casts_after_eto_scope.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("survey import enum casts after ETO scope migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("repairs both functions replaced by the ETO scope migration", () => {
    expect(packageMigration).toContain(
      "public.stage_survey_import(text,text,text,jsonb,jsonb,text,text)"
    );
    expect(packageMigration).toContain(
      "public.stage_survey_import_current(text,text,jsonb,jsonb,text,text)"
    );
  });

  it("casts the CASE result to the persisted enum and fails closed if no target is found", () => {
    expect(packageMigration).toContain("::survey_import_batch_state");
    expect(packageMigration).toContain("survey import enum assignment target was not found");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0019_restore_survey_import_taxpayer_uuid.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002033902_restore_survey_import_taxpayer_uuid.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("survey import taxpayer UUID restoration migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("generates a taxpayer UUID inside the promotion transaction", () => {
    expect(packageMigration).toContain(
      "INSERT INTO public.taxpayers(id,display_name,status,current_circle_id,created_by)"
    );
    expect(packageMigration).toContain("VALUES(gen_random_uuid(),v_row.legal_name");
  });

  it("fails closed if the replacement function shape differs", () => {
    expect(packageMigration).toContain(
      "survey import taxpayer UUID targets were not fully repaired"
    );
  });
});

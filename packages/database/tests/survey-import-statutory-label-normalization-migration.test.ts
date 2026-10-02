import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0017_survey_import_statutory_label_normalization.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002033221_survey_import_statutory_label_normalization.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("survey import controlled-label compatibility migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("normalizes only punctuation, case, and whitespace in controlled labels", () => {
    expect(packageMigration).toContain("same_controlled_label");
    expect(packageMigration).toContain("[^[:alnum:]]+");
    expect(packageMigration).toContain("REVOKE ALL ON FUNCTION");
  });

  it("keeps statutory amounts, codes, rule IDs, and active dates authoritative", () => {
    expect(packageMigration).toContain("amounts, codes, active dates");
    expect(packageMigration).toContain("effective_from");
    expect(packageMigration).toContain("effective_to");
    expect(packageMigration).not.toContain("UPDATE public.survey_classification_rules");
  });

  it("fails closed when either deployed function shape differs", () => {
    expect(packageMigration).toContain(
      "survey import controlled-label normalization targets were not fully repaired"
    );
    expect(packageMigration).toContain(
      "bulk approval statutory effective-date target was not repaired"
    );
  });
});

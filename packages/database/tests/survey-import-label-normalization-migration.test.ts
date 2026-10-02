import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0016_survey_import_label_normalization.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261002032245_survey_import_label_normalization.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("survey import jurisdiction label normalization migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("normalizes only recognized administrative suffixes", () => {
    expect(packageMigration).toContain("(division|region|district|zone|tehsil)");
    expect(packageMigration).toContain("same_jurisdiction_label");
  });

  it("stores concise hierarchy names while preserving tier as the discriminator", () => {
    expect(packageMigration).toContain("UPDATE public.jurisdictions");
    expect(packageMigration).toContain("tier IN ('DIVISION','REGION','DISTRICT','ZONE','TEHSIL')");
    expect(packageMigration).toContain("(Division|Region|District|Zone|Tehsil)$");
  });

  it("retains server-side hierarchy containment and immutable rate resolution", () => {
    expect(packageMigration).toContain("stage_survey_import(text,text,text,jsonb,jsonb,text,text)");
    expect(packageMigration).toContain("v_rule\\.statutory_rule_id");
    expect(packageMigration).toContain("class and");
    expect(packageMigration).toContain("resolve the immutable active database rule");
    expect(packageMigration).toContain("REVOKE ALL ON FUNCTION");
  });

  it("fails closed if the deployed function shape cannot be completely repaired", () => {
    expect(packageMigration).toContain(
      "survey import label normalization targets were not fully repaired"
    );
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0043Package = readFileSync(
  fileURLToPath(
    new URL(
      "../migrations/0043_expand_pin_sequence_to_6_digits_and_lock_immutability.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const migration0043Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261108100000_expand_pin_sequence_to_6_digits_and_lock_immutability.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("expand pin sequence to 6 digits and lock immutability migration", () => {
  it("keeps migration 0043 repository and deployable files identical", () => {
    expect(migration0043Deploy).toBe(migration0043Package);
  });

  it("generates 6-digit sequence in ptas_private.generate_ptas_pin", () => {
    expect(migration0043Package).toContain("lpad(v_seq::text, 6, '0')");
    expect(migration0043Package).toContain("'-01'");
  });

  it("defines ptas_private.prevent_pin_mutation to enforce permanent immutability", () => {
    expect(migration0043Package).toContain("FUNCTION ptas_private.prevent_pin_mutation()");
    expect(migration0043Package).toContain(
      "PIN number is permanently immutable and cannot be modified once assigned"
    );
    expect(migration0043Package).toContain(
      "Provincial UIN is permanently immutable and cannot be modified once assigned"
    );
  });

  it("attaches immutability triggers to pft3_assessment_units and potential_assessment_units", () => {
    expect(migration0043Package).toContain("CREATE TRIGGER trg_pft3_pin_immutable");
    expect(migration0043Package).toContain("CREATE TRIGGER trg_potential_pin_immutable");
    expect(migration0043Package).toContain("BEFORE UPDATE ON public.pft3_assessment_units");
    expect(migration0043Package).toContain("BEFORE UPDATE ON public.potential_assessment_units");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0045Package = readFileSync(
  fileURLToPath(
    new URL("../migrations/0045_circle_wise_numeric_potential_number.sql", import.meta.url)
  ),
  "utf8"
);
const migration0045Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261108120000_circle_wise_numeric_potential_number.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("circle-wise numeric potential number migration", () => {
  it("keeps migration 0045 repository and deployable files identical", () => {
    expect(migration0045Deploy).toBe(migration0045Package);
  });

  it("drops table-wide unique constraint on potential_number", () => {
    expect(migration0045Package).toContain("ALTER TABLE public.potential_assessment_units");
    expect(migration0045Package).toContain(
      "DROP CONSTRAINT IF EXISTS potential_assessment_units_potential_number_key;"
    );
  });

  it("backfills potential_number to pure numeric format", () => {
    expect(migration0045Package).toContain("UPDATE public.potential_assessment_units");
    expect(migration0045Package).toContain("regexp_replace(potential_number, '^POT-0*', '', 'i')");
  });

  it("creates circle-scoped unique index on (circle_id, potential_number)", () => {
    expect(migration0045Package).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_potential_circle_pot_no"
    );
    expect(migration0045Package).toContain(
      "ON public.potential_assessment_units(circle_id, potential_number)"
    );
  });

  it("implements advisory-locked get_next_circle_potential_no", () => {
    expect(migration0045Package).toContain(
      "FUNCTION ptas_private.get_next_circle_potential_no(p_circle_id uuid)"
    );
    expect(migration0045Package).toContain(
      "pg_advisory_xact_lock(hashtext('circle_potential_' || p_circle_id::text))"
    );
    expect(migration0045Package).toContain(
      "SELECT coalesce(max(nullif(regexp_replace(potential_number, '[^0-9]', '', 'g'), '')::bigint), 0) + 1"
    );
  });

  it("upgrades insert_potential_assessment_unit to allocate circle-scoped numeric potential numbers", () => {
    expect(migration0045Package).toContain("FUNCTION public.insert_potential_assessment_unit");
    expect(migration0045Package).toContain(
      "ptas_private.get_next_circle_potential_no(v_circle_id)"
    );
  });

  it("upgrades bulk_insert_potential_units to allocate circle-scoped numeric potential numbers", () => {
    expect(migration0045Package).toContain("FUNCTION public.bulk_insert_potential_units");
    expect(migration0045Package).toContain(
      "regexp_replace(regexp_replace(btrim(coalesce(v_item->>'potential_number', v_item->>'survey_no')), '^POT-0*', '', 'i'), '^0+', '')"
    );
  });
});

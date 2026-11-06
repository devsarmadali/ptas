import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0039Package = readFileSync(
  fileURLToPath(new URL("../migrations/0039_durable_pft2_receipts_and_payments.sql", import.meta.url)),
  "utf8"
);
const migration0039Deploy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261106200000_durable_pft2_receipts_and_payments.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("durable PFT2 receipts and payment synchronization migration", () => {
  it("keeps migration 0039 repository and deployable files identical", () => {
    expect(migration0039Deploy).toBe(migration0039Package);
  });

  it("establishes public.pft2_receipts with RLS and dual FK links", () => {
    expect(migration0039Package).toContain("CREATE TABLE IF NOT EXISTS public.pft2_receipts");
    expect(migration0039Package).toContain("ALTER TABLE public.pft2_receipts ENABLE ROW LEVEL SECURITY");
    expect(migration0039Package).toContain("pft3_unit_id uuid REFERENCES public.pft3_assessment_units(id)");
    expect(migration0039Package).toContain("potential_unit_id uuid REFERENCES public.potential_assessment_units(id)");
    expect(migration0039Package).toContain("challan_id uuid REFERENCES public.pft2_challans(id)");
    expect(migration0039Package).toContain("potential_challan_id uuid REFERENCES public.potential_pft2_challans(id)");
  });

  it("implements list_pft2_receipt_registry with jurisdiction scoping", () => {
    expect(migration0039Package).toContain("FUNCTION public.list_pft2_receipt_registry()");
    expect(migration0039Package).toContain("ptas_private.active_actor");
    expect(migration0039Package).toContain("ptas_private.jurisdiction_contains");
  });

  it("handles both regular and provisional challans in receive_pft2_challan_record", () => {
    expect(migration0039Package).toContain("FUNCTION public.receive_pft2_challan_record");
    expect(migration0039Package).toContain("public.potential_pft2_challans");
    expect(migration0039Package).toContain("public.pft2_challans");
    expect(migration0039Package).toContain("public.pft2_receipts");
    expect(migration0039Package).toContain("public.migrate_potential_unit_to_pft3");
  });

  it("provides record_direct_statutory_receipt for manual payments", () => {
    expect(migration0039Package).toContain("FUNCTION public.record_direct_statutory_receipt");
    expect(migration0039Package).toContain("'MANUAL'");
  });

  it("projects payment credit entries in list_operational_survey_units", () => {
    expect(migration0039Package).toContain("FUNCTION public.list_operational_survey_units()");
    expect(migration0039Package).toContain("'PAYMENT_CREDIT'");
    expect(migration0039Package).toContain("FROM public.pft2_receipts r");
  });

  it("supports public receipt verification in verify_statutory_document_public", () => {
    expect(migration0039Package).toContain("FUNCTION public.verify_statutory_document_public");
    expect(migration0039Package).toContain("'FORM_PFT_RECEIPT'");
    expect(migration0039Package).toContain("FROM public.pft2_receipts r");
  });
});

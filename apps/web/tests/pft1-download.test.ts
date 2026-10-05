import { describe, it, expect } from "vitest";
import {
  generateAuthoritativePdf,
  validateDocumentLifecycleState,
  validateDocumentAuthorization
} from "../src/lib/pdf/document-engine";
import { generateFormPFT1 } from "../src/lib/statutory-forms";
import { createInitialPilotUnits } from "../src/lib/pilot-store";

describe("Form PFT-1 PDF Generation and Lifecycle Tests", () => {
  const units = createInitialPilotUnits();
  const cotton = units.find((u) => u.legalName.includes("Cotton Ginners"))!;
  const alMadina = units.find((u) => u.legalName.includes("Al-Madina"))!;

  it("successfully generates Form PFT-1 PDF directly from a StoredUnit", async () => {
    const doc = await generateAuthoritativePdf("FORM_PFT1_NOTICE", cotton, {
      role: "ETO",
      district: "Vehari",
      circle: "Circle-I"
    });
    expect(doc).toBeDefined();
    expect(doc.output("datauristring")).toContain("data:application/pdf");
  });

  it("successfully generates Form PFT-1 PDF directly from a FormPFT1Model", async () => {
    const pft1Model = generateFormPFT1(cotton);
    const doc = await generateAuthoritativePdf("FORM_PFT1_NOTICE", pft1Model, {
      role: "ETO",
      district: "Vehari",
      circle: "Circle-I"
    });
    expect(doc).toBeDefined();
    expect(doc.output("datauristring")).toContain("data:application/pdf");
  });

  it("enforces approval requirement on unapproved assessment unless isProvisional is specified", async () => {
    // Al-Madina has SUBMITTED assessment (unapproved by ETO)
    expect(alMadina.assessments[0]?.status).toBe("SUBMITTED");

    // Without isProvisional option, should throw lifecycle violation
    await expect(
      generateAuthoritativePdf("FORM_PFT1_NOTICE", alMadina, {
        role: "ETO",
        district: "Vehari",
        circle: "Circle-I"
      })
    ).rejects.toThrow("Document lifecycle violation [UNAPPROVED_ASSESSMENT]");

    // With isProvisional: true, it successfully generates provisional notice
    const provDoc = await generateAuthoritativePdf(
      "FORM_PFT1_NOTICE",
      alMadina,
      { role: "ETO", district: "Vehari", circle: "Circle-I" },
      { isProvisional: true }
    );
    expect(provDoc).toBeDefined();
  });

  it("validates jurisdiction checks correctly for ETO", () => {
    const authOk = validateDocumentAuthorization(
      "FORM_PFT1_NOTICE",
      { role: "ETO", district: "Vehari", circle: "Circle-I" },
      cotton
    );
    expect(authOk.allowed).toBe(true);

    const authFail = validateDocumentAuthorization(
      "FORM_PFT1_NOTICE",
      { role: "ETO", district: "Multan", circle: "Circle-I" },
      cotton
    );
    expect(authFail.allowed).toBe(false);
  });
});

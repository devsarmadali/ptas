import { describe, expect, it } from "vitest";
import {
  MOCK_OFFICERS,
  createInitialClearanceCertificates,
  createInitialDiscontinuances,
  createInitialPilotUnits,
  createInitialRefundAdjustments
} from "../src/lib/pilot-store.js";
import {
  generateDiscontinuanceOrder,
  generateRefundAdjustmentOrder,
  generateTaxClearanceCertificate
} from "../src/lib/statutory-forms.js";
import { verifyOfficerAuthority } from "../src/lib/supabase-auth.js";

describe("Phase 6: Tax Clearance Certificate (PFT-5) & Statutory Relief (Rules 5 & 10)", () => {
  const [inspector, eto, director] = MOCK_OFFICERS;
  const initialUnits = createInitialPilotUnits();

  it("blocks Form P.F.T-5 Clearance Certificate when unit has positive ledger arrears", () => {
    // Find a unit with unpaid balance (e.g. Kisan Pesticides has unpaid arrears)
    const unpaidUnit = initialUnits.find((u) => u.id === "unit-kisan-pesticides-02")!;
    expect(unpaidUnit).toBeDefined();

    const cert = generateTaxClearanceCertificate(unpaidUnit, eto!);
    expect(cert.isEligible).toBe(false);
    expect(cert.certificateNumber).toBe("INELIGIBLE");
    expect(cert.ineligibilityReason).toContain("Cannot issue Clearance Certificate");
    expect(cert.ineligibilityReason).toContain("outstanding arrears");
    expect(cert.currentOutstandingBalance).toBeGreaterThan(0);
    expect(cert.officialSha256).toBe("");
  });

  it("generates authentic Form P.F.T-5 when assessee has NIL outstanding balance", () => {
    // Vehari Cotton Ginners has 10,000 demand and 10,000 paid = 0 balance
    const clearedUnit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
    expect(clearedUnit).toBeDefined();

    const cert = generateTaxClearanceCertificate(clearedUnit, eto!);
    expect(cert.isEligible).toBe(true);
    expect(cert.certificateNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/PFT5\/2026-27\/\d{5}/);
    expect(cert.currentOutstandingBalance).toBe(0);
    expect(cert.totalTaxPaid).toBe(10000);
    expect(cert.headOfAccount).toContain("B01601");
    expect(cert.expiryDate).toBe("2027-06-30");
    expect(cert.officialSha256).toHaveLength(64);
    expect(cert.qrPayload).toContain("STATUS=NIL_ARREARS");
    expect(cert.canonicalCertificateText).toContain("FORM P.F.T-5");
  });

  it("generates authentic Rule 10 Discontinuance Order with non-repudiation digest", () => {
    const unit = initialUnits.find((u) => u.id === "unit-almadina-center-03")!;
    expect(unit).toBeDefined();

    const order = generateDiscontinuanceOrder(unit, {
      orderNumber: "ETO/VEH/DISC/2026/01",
      orderDate: "2026-08-15",
      noticeNumber: "DISC-VEH-2026-001",
      discontinuanceDate: "2026-07-31",
      reason: "Surrendered commercial shop lease deed.",
      inspectorFindings: "Premises verified completely vacant with 'To-Let' banner.",
      etoDecision: "APPROVED",
      etoReason: "Verified on-site closure under Rule 10. Future demand cycle frozen."
    });

    expect(order.orderNumber).toBe("ETO/VEH/DISC/2026/01");
    expect(order.etoDecision).toBe("APPROVED");
    expect(order.officialSha256).toHaveLength(64);
    expect(order.canonicalOrderText).toContain("RULE 10");
  });

  it("generates authentic Rule 5 Refund/Adjustment Order with amount in words", () => {
    const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
    expect(unit).toBeDefined();

    const order = generateRefundAdjustmentOrder(unit, {
      orderNumber: "ETO/VEH/ADJ/2026/01",
      orderDate: "2026-07-18",
      applicationNumber: "REF-VEH-2026-001",
      type: "CREDIT_ADJUSTMENT",
      amount: 2000,
      grounds: "Taxpayer erroneously paid PKR 12,000 instead of PKR 10,000 under Challan 32-A.",
      evidenceRef: "NBP Bank Scroll Deposit Ref: NBP-VHR-8849192"
    });

    expect(order.orderNumber).toBe("ETO/VEH/ADJ/2026/01");
    expect(order.type).toBe("CREDIT_ADJUSTMENT");
    expect(order.amount).toBe(2000);
    expect(order.amountWords).toContain("Two Thousand Rupees Only");
    expect(order.officialSha256).toHaveLength(64);
    expect(order.canonicalOrderText).toContain("RULE 5");
  });

  it("maintains default seed state for Clearance, Discontinuance, and Refunds", () => {
    const certs = createInitialClearanceCertificates();
    expect(certs.length).toBeGreaterThanOrEqual(1);
    expect(certs[0]?.certificateNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/PFT5\/2026-27\/\d{5}/);

    const discs = createInitialDiscontinuances();
    expect(discs.length).toBeGreaterThanOrEqual(1);
    expect(discs[0]?.status).toBe("INSPECTED");

    const refunds = createInitialRefundAdjustments();
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds[0]?.type).toBe("CREDIT_ADJUSTMENT");
  });

  it("enforces strict statutory authority matrix on Phase 6 relief actions", () => {
    // 1. Tax Clearance Certificate: Only ETO or Director
    const inspCert = verifyOfficerAuthority(inspector!, "ISSUE_CLEARANCE_CERTIFICATE");
    expect(inspCert.authorized).toBe(false);
    expect(inspCert.reason).toContain("Statutory Authority Violation");
    expect(verifyOfficerAuthority(eto!, "ISSUE_CLEARANCE_CERTIFICATE").authorized).toBe(true);
    expect(verifyOfficerAuthority(director!, "ISSUE_CLEARANCE_CERTIFICATE").authorized).toBe(true);

    // 2. Discontinuance Inspection: Inspector and ETO
    expect(verifyOfficerAuthority(inspector!, "SUBMIT_DISCONTINUANCE_INSPECTION").authorized).toBe(
      true
    );
    expect(verifyOfficerAuthority(eto!, "SUBMIT_DISCONTINUANCE_INSPECTION").authorized).toBe(true);

    // 3. Discontinuance & Refund Adjudication: Exclusive to ETO / Director
    const inspDisc = verifyOfficerAuthority(inspector!, "ADJUDICATE_DISCONTINUANCE");
    expect(inspDisc.authorized).toBe(false);
    expect(verifyOfficerAuthority(eto!, "ADJUDICATE_DISCONTINUANCE").authorized).toBe(true);

    const inspRef = verifyOfficerAuthority(inspector!, "ADJUDICATE_REFUND");
    expect(inspRef.authorized).toBe(false);
    expect(verifyOfficerAuthority(eto!, "ADJUDICATE_REFUND").authorized).toBe(true);
  });
});

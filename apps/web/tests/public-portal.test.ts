import { describe, expect, it } from "vitest";
import {
  MOCK_OFFICERS,
  createInitialClearanceCertificates,
  createInitialPilotUnits,
  type PilotState
} from "../src/lib/pilot-store.js";
import {
  calculateRule4SelfAssessment,
  generate17DigitEPayPsid,
  lookupTaxpayerLiability,
  simulateCitizenPayment,
  verifyStatutoryDocument
} from "../src/lib/public-portal.js";
import {
  generateFormPFT1,
  generateFormPFT2,
  generateTaxClearanceCertificate
} from "../src/lib/statutory-forms.js";

describe("Phase 8: Public Assessee Portal & Real-Time QR / Document Verification Engine", () => {
  const initialUnits = createInitialPilotUnits();
  const initialCerts = createInitialClearanceCertificates();
  const [, eto] = MOCK_OFFICERS;

  const mockPilotState: PilotState = {
    currentOfficer: eto!,
    units: initialUnits,
    auditLogs: [],
    reconciliations: [],
    appeals: [],
    clearanceCertificates: initialCerts,
    refundAdjustments: [],
    discontinuances: []
  };

  describe("1. Statutory QR Code Payloads on Form P.F.T-1, P.F.T-2, and P.F.T-5", () => {
    it("generates authentic QR payload and SHA-256 digest on Form P.F.T-1 (Notice of Demand)", () => {
      const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      expect(unit).toBeDefined();

      const pft1 = generateFormPFT1(unit);
      expect(pft1.qrPayload).toBeDefined();
      expect(pft1.qrPayload).toMatch(
        /^PTAS-PUNJAB:PFT-1:PDN-VEH-2026-0001:TAX=10000:YEAR=2026-2027:DUE=31\/08\/2026:SHA=/
      );
      expect(pft1.officialSha256).toHaveLength(64);
    });

    it("generates authentic QR payload on Form P.F.T-2 (3-Copy Challan) and propagates to all 3 copies", () => {
      const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      expect(unit).toBeDefined();

      const pft2 = generateFormPFT2(unit);
      expect(pft2.qrPayload).toBeDefined();
      expect(pft2.qrPayload).toMatch(
        /^PTAS-PUNJAB:PFT-2:PB\/ET\/VHR\/CIR-1\/PFT2\/2026-27\/00001:DEMAND=PDN-VEH-2026-0001:AMOUNT=10000:DUE=31\/08\/2026:SHA=/
      );
      expect(pft2.copies).toHaveLength(3);

      for (const copy of pft2.copies) {
        expect(copy.qrPayload).toBe(pft2.qrPayload);
        expect(copy.district).toBe("Vehari");
        expect(copy.headOfAccount).toContain("B01601");
      }
    });

    it("generates authentic QR payload on Form P.F.T-5 (Tax Clearance Certificate)", () => {
      const clearedUnit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      const cert = generateTaxClearanceCertificate(clearedUnit, eto!);
      expect(cert.isEligible).toBe(true);
      expect(cert.qrPayload).toMatch(
        /^PTAS-PUNJAB:PFT-5:PB\/ET\/VHR\/CIR-1\/PFT5\/2026-27\/00001:ID=NTN-7412983-1:STATUS=NIL_ARREARS:SHA=/
      );
    });
  });

  describe("2. Universal Multi-Document Verification Engine (verifyStatutoryDocument)", () => {
    it("authenticates a valid Form P.F.T-1 Notice of Demand by notice number or scanned payload", () => {
      const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      const pft1 = generateFormPFT1(unit);

      // Verify by notice number
      const res1 = verifyStatutoryDocument(pft1.noticeNumber, initialUnits, initialCerts);
      expect(res1.isValid).toBe(true);
      expect(res1.documentType).toBe("FORM_PFT1_NOTICE");
      expect(res1.verificationStatus).toBe("AUTHENTIC_VALID");
      expect(res1.unitName).toBe(unit.legalName);
      expect(res1.assessedAmount).toBe(10000);
      expect(res1.officialSha256).toBe(pft1.officialSha256);

      // Verify by raw QR payload
      const resQr = verifyStatutoryDocument(pft1.qrPayload, initialUnits, initialCerts);
      expect(resQr.isValid).toBe(true);
      expect(resQr.documentType).toBe("FORM_PFT1_NOTICE");
    });

    it("authenticates a valid Form P.F.T-2 Payment Challan by challan serial or scanned payload", () => {
      const unit = initialUnits.find((u) => u.id === "unit-kisan-pesticides-02")!;
      const pft2 = generateFormPFT2(unit);

      const res = verifyStatutoryDocument(pft2.challanNumber, initialUnits, initialCerts);
      expect(res.isValid).toBe(true);
      expect(res.documentType).toBe("FORM_PFT2_CHALLAN");
      expect(res.verificationStatus).toBe("AUTHENTIC_VALID");
      expect(res.unitName).toBe(unit.legalName);
      expect(res.scheduleEntry).toBe("Class 6(x)");
    });

    it("authenticates a valid Form P.F.T-5 Tax Clearance Certificate with NIL ledger arrears", () => {
      const existingCert = initialCerts[0];
      expect(existingCert).toBeDefined();

      const res = verifyStatutoryDocument(
        existingCert!.certificateNumber,
        initialUnits,
        initialCerts
      );
      expect(res.isValid).toBe(true);
      expect(res.documentType).toBe("FORM_PFT5_CLEARANCE");
      expect(res.verificationStatus).toBe("AUTHENTIC_VALID");
      expect(res.outstandingBalance).toBe(0);
      expect(res.message).toContain("NIL outstanding arrears");
    });

    it("revokes/invalidates Form P.F.T-5 when live ledger detects accrued unpaid arrears", () => {
      // Create a fake certificate for Kisan Pesticides which currently has unpaid arrears of 2,000
      const unpaidUnit = initialUnits.find((u) => u.id === "unit-kisan-pesticides-02")!;
      const fakeCert = {
        id: "cert-fake-01",
        certificateNumber: "PFT-CC-VEH-2026-9999",
        unitId: unpaidUnit.id,
        assesseeLegalName: unpaidUnit.legalName,
        cnicOrNtn: unpaidUnit.identifierValue,
        categoryName: unpaidUnit.statutoryRule.category,
        scheduleEntry: "Class 6(x)",
        financialYear: "2026-2027",
        issueDate: "2026-07-01",
        validUntil: "2027-06-30",
        issuedByOfficerId: "officer-eto-01",
        issuedByOfficerName: "Tariq Mahmood",
        issuedByOfficerTitle: "ETO",
        officialSha256: "fake-sha",
        qrPayload: "fake-qr",
        clearedAmountPkr: 2000
      };

      const res = verifyStatutoryDocument(fakeCert.certificateNumber, initialUnits, [fakeCert]);
      expect(res.isValid).toBe(false);
      expect(res.documentType).toBe("FORM_PFT5_CLEARANCE");
      expect(res.verificationStatus).toBe("REVOKED_ARREARS_PENDING");
      expect(res.message).toContain("INVALIDated by live ledger arrears");
      expect(res.outstandingBalance).toBeGreaterThan(0);
    });

    it("authenticates a valid document using its official 6-digit Document Security PIN", () => {
      const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      const pft2 = generateFormPFT2(unit);
      expect(pft2.pin).toMatch(/^\d{6}$/);

      // Authenticate Form PFT-2 via PIN
      const res = verifyStatutoryDocument(pft2.pin, initialUnits, initialCerts);
      expect(res.isValid).toBe(true);
      expect(res.documentType).toBe("FORM_PFT2_CHALLAN");
      expect(res.verificationStatus).toBe("AUTHENTIC_VALID");
      expect(res.pin).toBe(pft2.pin);
      expect(res.unitName).toBe(unit.legalName);
    });

    it("authenticates Form PFT-2 using the structured statutory Notice Number", () => {
      const unit = initialUnits.find((u) => u.id === "unit-vehari-cotton-01")!;
      const pft2 = generateFormPFT2(unit);

      // Authenticate via structured Notice Number
      const res = verifyStatutoryDocument(pft2.noticeNumber, initialUnits, initialCerts);
      expect(res.isValid).toBe(true);
      expect(res.documentType).toBe("FORM_PFT2_CHALLAN");
      expect(res.verificationStatus).toBe("AUTHENTIC_VALID");
      expect(res.unitName).toBe(unit.legalName);
    });

    it("returns INVALID_NOT_FOUND when non-existent document number or PIN is scanned/searched", () => {
      const res1 = verifyStatutoryDocument("PFT-UNKNOWN-99999", initialUnits, initialCerts);
      expect(res1.isValid).toBe(false);
      expect(res1.documentType).toBe("UNKNOWN");
      expect(res1.verificationStatus).toBe("INVALID_NOT_FOUND");

      const res2 = verifyStatutoryDocument("000000", initialUnits, initialCerts);
      expect(res2.isValid).toBe(false);
      expect(res2.documentType).toBe("UNKNOWN");
      expect(res2.verificationStatus).toBe("INVALID_NOT_FOUND");
    });
  });

  describe("3. Citizen Taxpayer Liability & Challan Lookup (lookupTaxpayerLiability)", () => {
    it("finds taxpayer by CNIC and computes accurate live demand, payments, and balance", () => {
      // Kisan Pesticides: CNIC 36601-2948192-3
      const result = lookupTaxpayerLiability("36601-2948192-3", initialUnits);
      expect(result).not.toBeNull();
      expect(result!.found).toBe(true);
      expect(result!.legalName).toBe("Muhammad Akram");
      expect(result!.tradeName).toBe("Kisan Pesticides & Fertilizer Agency");
      expect(result!.identifierValue).toBe("36601-2948192-3");
      expect(result!.permanentDemandNo).toBe("PDN-VEH-2026-0002");
      expect(result!.assessedTax).toBe(2000);
      expect(result!.outstandingBalance).toBe(2000);
      expect(result!.isClearanceEligible).toBe(false);
      expect(result!.noticeNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/PFT1\/2026-27\/\d{5}/);
      expect(result!.challanNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/PFT2\/2026-27\/\d{5}/);
    });

    it("finds taxpayer by NTN and confirms clearance eligibility when fully paid", () => {
      // Vehari Cotton Ginners: NTN NTN-7412983-1 (also matches "7412983-1")
      const result = lookupTaxpayerLiability("7412983-1", initialUnits);
      expect(result).not.toBeNull();
      expect(result!.found).toBe(true);
      expect(result!.legalName).toBe("Vehari Cotton Ginners (Pvt.) Ltd.");
      expect(result!.outstandingBalance).toBe(0);
      expect(result!.isClearanceEligible).toBe(true);
    });

    it("finds taxpayer by Permanent Demand Number (PDN)", () => {
      const result = lookupTaxpayerLiability("PDN-VEH-2026-0003", initialUnits);
      expect(result).not.toBeNull();
      expect(result!.legalName).toContain("Al-Madina");
    });

    it("returns null for query matching no assessee in registry", () => {
      const result = lookupTaxpayerLiability("99999-9999999-9", initialUnits);
      expect(result).toBeNull();
    });
  });

  describe("4. Rule 4 Statutory Self-Assessment Calculator (calculateRule4SelfAssessment)", () => {
    it("calculates statutory rate for Commercial Establishments outside metropolitan areas under Rule 3(i)(b) (Vehari = PKR 4,000)", () => {
      const res = calculateRule4SelfAssessment({
        categoryCode: "3",
        employeeCount: 15,
        isMetropolitan: false
      });
      expect(res.categoryCode).toBe("3");
      expect(res.ruleId).toBe("PFT-3.i.b");
      expect(res.subclassificationCode).toBe("3(i)");
      expect(res.statutoryTertiaryCode).toBe("3(i)(b)");
      expect(res.annualRatePkr).toBe(4000);
      expect(res.officialLegalText).toContain(
        "commercial establishments having 10 or more employees"
      );
    });

    it("calculates statutory rate for Commercial Establishments in Metropolitan areas under Rule 3(i)(a) (PKR 6,000)", () => {
      const res = calculateRule4SelfAssessment({
        categoryCode: "3",
        employeeCount: 20,
        isMetropolitan: true
      });
      expect(res.ruleId).toBe("PFT-3.i.a");
      expect(res.subclassificationCode).toBe("3(i)");
      expect(res.statutoryTertiaryCode).toBe("3(i)(a)");
      expect(res.annualRatePkr).toBe(6000);
    });

    it("calculates statutory rate for Small Commercial Establishments (<10 employees) under Rule 3(ii) (PKR 2,000)", () => {
      const res = calculateRule4SelfAssessment({
        categoryCode: "3",
        employeeCount: 4
      });
      expect(res.ruleId).toBe("PFT-3.ii");
      expect(res.annualRatePkr).toBe(2000);
    });

    it("calculates statutory rate for Companies under Category 1 across capital tiers", () => {
      const smallCo = calculateRule4SelfAssessment({
        categoryCode: "1",
        paidUpCapitalPkr: 4000000
      });
      expect(smallCo.ruleId).toBe("PFT-1.i");
      expect(smallCo.annualRatePkr).toBe(10000);

      const largeCo = calculateRule4SelfAssessment({
        categoryCode: "1",
        paidUpCapitalPkr: 250000000
      });
      expect(largeCo.ruleId).toBe("PFT-1.v");
      expect(largeCo.annualRatePkr).toBe(100000);
    });

    it("calculates statutory rate for Professions under Category 6 (Specialists vs Registered Medical Practitioners vs Pesticide Dealers)", () => {
      const specialist = calculateRule4SelfAssessment({
        categoryCode: "6",
        professionType: "SPECIALIST"
      });
      expect(specialist.ruleId).toBe("PFT-6.i");
      expect(specialist.annualRatePkr).toBe(5000);

      const rmp = calculateRule4SelfAssessment({
        categoryCode: "6",
        professionType: "RMP"
      });
      expect(rmp.ruleId).toBe("PFT-6.ii");
      expect(rmp.annualRatePkr).toBe(4000);

      const pesticideDealer = calculateRule4SelfAssessment({
        categoryCode: "6",
        professionType: "PESTICIDE_DEALER"
      });
      expect(pesticideDealer.ruleId).toBe("PFT-6.x");
      expect(pesticideDealer.annualRatePkr).toBe(2000);
    });

    it("calculates statutory rate for Category 10 (Air Conditioned Food) and Category 11 (Income Tax Assessees)", () => {
      const acFood = calculateRule4SelfAssessment({ categoryCode: "10" });
      expect(acFood.annualRatePkr).toBe(5000);

      const incTax = calculateRule4SelfAssessment({ categoryCode: "11" });
      expect(incTax.annualRatePkr).toBe(200);
    });
  });

  describe("5. Instant Citizen Digital Payment Simulator (simulateCitizenPayment)", () => {
    it("generates a valid 17-digit ePay Punjab PSID complying with Government standard", () => {
      const psid = generate17DigitEPayPsid("unit-kisan-pesticides-02");
      expect(psid).toHaveLength(17);
      expect(psid.startsWith("1001366")).toBe(true); // 1001 = Dept Code, 366 = Vehari District Code
    });

    it("posts append-only PAYMENT_CREDIT to unit ledger, reduces balance, and writes audit event", () => {
      const unpaidUnit = initialUnits.find((u) => u.id === "unit-kisan-pesticides-02")!;
      const prevBal = 2000;

      // Partial payment of PKR 500
      const { result, updatedUnits, updatedAudits, updatedClearanceCerts } = simulateCitizenPayment(
        unpaidUnit.id,
        500,
        "EPAY_PUNJAB",
        mockPilotState
      );

      expect(result.success).toBe(true);
      expect(result.paidAmount).toBe(500);
      expect(result.previousBalance).toBe(prevBal);
      expect(result.newBalance).toBe(1500);
      expect(result.clearanceIssued).toBe(false);

      // Verify updated unit in state
      const modUnit = updatedUnits.find((u) => u.id === unpaidUnit.id)!;
      const lastEntry = modUnit.ledgerEntries[modUnit.ledgerEntries.length - 1];
      expect(lastEntry?.entryType).toBe("PAYMENT_CREDIT");
      expect(lastEntry?.amount).toBe(-500);
      expect(lastEntry?.sourceType).toBe("CITIZEN_SELF_SERVICE_EPAY");

      // Verify audit log
      expect(updatedAudits[0]?.eventType).toBe("ONLINE_PAYMENT_SETTLED");
      expect(updatedAudits[0]?.actorRole).toBe("CITIZEN");
      expect(updatedAudits[0]?.details).toContain("Online payment of PKR 500 settled");

      // Clearance cert not yet issued because 1,500 balance remains
      expect(updatedClearanceCerts).toHaveLength(initialCerts.length);
    });

    it("auto-issues Form P.F.T-5 Tax Clearance Certificate when payment completely clears arrears to 0", () => {
      const unpaidUnit = initialUnits.find((u) => u.id === "unit-kisan-pesticides-02")!;
      const fullAmount = 2000;

      const { result, updatedClearanceCerts } = simulateCitizenPayment(
        unpaidUnit.id,
        fullAmount,
        "EPAY_PUNJAB",
        mockPilotState
      );

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(0);
      expect(result.clearanceIssued).toBe(true);
      expect(result.clearanceCertNumber).toMatch(/^PB\/ET\/VHR\/CIR-1\/PFT5\/2026-27\/\d{5}/);

      // Check clearance certificates list
      expect(updatedClearanceCerts.length).toBe(initialCerts.length + 1);
      const newCert = updatedClearanceCerts[updatedClearanceCerts.length - 1]!;
      expect(newCert.certificateNumber).toBe(result.clearanceCertNumber);
      expect(newCert.unitId).toBe(unpaidUnit.id);
      expect(newCert.clearedAmountPkr).toBe(2000);
      expect(newCert.qrPayload).toContain("STATUS=NIL_ARREARS");
    });

    it("rejects non-positive payment amounts", () => {
      const unit = initialUnits[0]!;
      expect(() => simulateCitizenPayment(unit.id, 0, "EPAY_PUNJAB", mockPilotState)).toThrow(
        "greater than zero"
      );
    });
  });
});

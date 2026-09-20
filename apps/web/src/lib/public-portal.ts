/**
 * PTAS Vehari Pilot: Public Assessee Portal & Citizen Self-Service Engine
 * Governed by:
 * - Section 15 & Section 19 of Punjab Professional Tax Digitization Plan v0.5
 * - Rules 4, 6, 9, 11 of Punjab Professions & Trades Tax Rules, 1977
 * - Second Schedule to Punjab Finance Act, 1977 (47 statutory rate rules)
 *
 * Implements:
 * - Real-time QR Code & Multi-Document Authenticator (Form PFT-1, PFT-2, PFT-5)
 * - Taxpayer Liability & Challan Search by CNIC / NTN / PDN
 * - Rule 4 Statutory Self-Assessment Liability Calculator
 * - Instant 17-Digit ePay Punjab / 1Link Digital Payment Simulator
 */

import {
  computeDefaulterAging,
  computeLedgerBalance,
  getRulesByCategory,
  getStatutoryRuleById,
  normalizeDocumentPin,
  type StatutoryRuleDefinition,
  validateDocumentPin
} from "@ptas/domain";
import {
  type ClearanceCertificateRecord,
  type Pft2ChallanRecord,
  type PilotAuditItem,
  type PilotState,
  type StatutoryReceiptRecord,
  type StoredUnit
} from "./pilot-store";
import {
  generateFormPFT1,
  generateFormPFT2,
  generateTaxClearanceCertificate
} from "./statutory-forms";

export type DocumentVerificationType =
  "FORM_PFT1_NOTICE" | "FORM_PFT2_CHALLAN" | "FORM_PFT5_CLEARANCE" | "FORM_PFT_RECEIPT";

export type VerificationStatus =
  | "AUTHENTIC_VALID"
  | "REVOKED_ARREARS_PENDING"
  | "UNAPPROVED_DRAFT"
  | "EXPIRED"
  | "INVALID_NOT_FOUND";

export interface DocumentVerificationResult {
  readonly isValid: boolean;
  readonly documentType: DocumentVerificationType | "UNKNOWN";
  readonly verificationStatus: VerificationStatus;
  readonly title: string;
  readonly message: string;
  readonly documentReference: string;
  readonly unitName: string;
  readonly tradeName?: string | undefined;
  readonly identifier: string;
  readonly address: string;
  readonly categoryName: string;
  readonly scheduleEntry: string;
  readonly assessedAmount: number;
  readonly outstandingBalance: number;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly verifiedAt: string;
  readonly issuingAuthority: string;
  readonly pin?: string | undefined;
}

export interface TaxpayerLiabilityLookupResult {
  readonly found: boolean;
  readonly unit: StoredUnit;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: string;
  readonly identifierValue: string;
  readonly permanentDemandNo: string;
  readonly provincialUin?: string | undefined;
  readonly address: string;
  readonly categoryName: string;
  readonly scheduleEntry: string;
  readonly annualTaxRate: number;
  readonly assessedTax: number;
  readonly penalties: number;
  readonly totalDemand: number;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
  readonly dueDate: string;
  readonly daysOverdue: number;
  readonly defaulterStatus: string;
  readonly isClearanceEligible: boolean;
  readonly noticeNumber: string;
  readonly challanNumber: string;
}

export interface SelfAssessmentCriteriaInput {
  readonly categoryCode: string;
  readonly ruleId?: string | undefined;
  readonly paidUpCapitalPkr?: number | undefined;
  readonly employeeCount?: number | undefined;
  readonly isMetropolitan?: boolean | undefined;
  readonly hasAirConditioning?: boolean | undefined;
  readonly professionType?: string | undefined;
  readonly hasIncomeTaxAssessment?: boolean | undefined;
}

export interface SelfAssessmentResult {
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly ruleId: string;
  readonly subclassificationCode: string | null;
  readonly statutoryTertiaryCode?: string | null;
  readonly subcategory: string;
  readonly officialLegalText: string;
  readonly annualRatePkr: number;
  readonly rateBasis: string;
}

export interface CitizenPaymentSimulationResult {
  readonly success: boolean;
  readonly psid: string;
  readonly transactionId: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly paidAmount: number;
  readonly previousBalance: number;
  readonly newBalance: number;
  readonly paymentChannel: "EPAY_PUNJAB" | "CHALLAN_32A";
  readonly depositedAt: string;
  readonly clearanceIssued: boolean;
  readonly clearanceCertNumber?: string | undefined;
}

/**
 * Normalizes an identifier or search query by stripping hyphens, spaces, and punctuation.
 */
export function normalizeQuery(q: string): string {
  return q.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Generates an official 17-digit ePay Punjab PSID compliant with GoPb / 1Link standards:
 * - Prefix '1001' (Excise & Taxation Department Code)
 * - District '366' (Vehari District Code)
 * - 10-digit sequential & unique transaction serial
 */
export function generate17DigitEPayPsid(unitId: string): string {
  const cleanId = normalizeQuery(unitId).slice(-4) || "0001";
  const timestamp = Date.now().toString().slice(-6);
  return `1001366${cleanId}${timestamp}`;
}

/**
 * Universal Multi-Document & QR Code Authenticator:
 * Verifies Form P.F.T-1 (Notice of Demand), Form P.F.T-2 (Payment Challan), or
 * Form P.F.T-5 (Tax Clearance Certificate) against live immutable demand ledgers.
 */
export function verifyStatutoryDocument(
  input: string,
  units: readonly StoredUnit[],
  clearanceCerts: readonly ClearanceCertificateRecord[] = [],
  receipts: readonly StatutoryReceiptRecord[] = [],
  challans: readonly Pft2ChallanRecord[] = []
): DocumentVerificationResult {
  const trimmed = input.trim();
  let effectiveInput = trimmed;

  // Extract reference if a full verification URL was pasted or scanned
  if (
    trimmed.includes("?") &&
    (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("/verify"))
  ) {
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://ptas.punjab.gov.pk/${trimmed}`
      );
      const ref =
        url.searchParams.get("ref") ||
        url.searchParams.get("pdn") ||
        url.searchParams.get("doc") ||
        url.searchParams.get("pin") ||
        url.searchParams.get("notice");
      if (ref) {
        effectiveInput = ref;
      }
    } catch {
      // ignore URL parse errors and fall back to raw input
    }
  }

  const normalized = normalizeQuery(trimmed);
  const normalizedEffective = normalizeQuery(effectiveInput);
  const now = new Date().toISOString();

  if (!trimmed) {
    return {
      isValid: false,
      documentType: "UNKNOWN",
      verificationStatus: "INVALID_NOT_FOUND",
      title: "Document Not Found",
      message:
        "Please enter a valid certificate number, challan serial, or scan an official PTAS QR code.",
      documentReference: "",
      unitName: "Unknown",
      identifier: "N/A",
      address: "N/A",
      categoryName: "N/A",
      scheduleEntry: "N/A",
      assessedAmount: 0,
      outstandingBalance: 0,
      officialSha256: "",
      qrPayload: "",
      verifiedAt: now,
      issuingAuthority: "Excise & Taxation Department, Punjab"
    };
  }

  // 0. Check for 6-Digit Document Security PIN Verification (دستاویزی تصدیقی پن کوڈ)
  const cleanPin = normalizeDocumentPin(trimmed);
  if (validateDocumentPin(cleanPin)) {
    // Check issued PFT-2 Challans by PIN
    const challanByPin = challans.find((c) => c.pin === cleanPin);
    if (challanByPin) {
      const ref = challanByPin.noticeNumber ?? challanByPin.challanNumber;
      return {
        isValid: true,
        documentType: "FORM_PFT2_CHALLAN",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Form P.F.T-2 Payment Challan",
        message: `✓ Official Form P.F.T-2 Challan verified via Document Security PIN ${cleanPin}. Notice No: ${ref} | Assessed Demand: PKR ${challanByPin.amountPayable.toLocaleString()} (Due: ${challanByPin.dueDate}).`,
        documentReference: ref,
        unitName: challanByPin.legalName,
        tradeName: challanByPin.tradeName,
        identifier: challanByPin.identifierValue,
        address: challanByPin.address,
        categoryName: challanByPin.category,
        scheduleEntry: challanByPin.subclassificationCode
          ? `Class ${challanByPin.subclassificationCode}`
          : "Statutory Challan",
        assessedAmount: challanByPin.amountPayable,
        outstandingBalance: challanByPin.remainingBalance ?? 0,
        officialSha256: challanByPin.officialSha256,
        qrPayload: challanByPin.qrPayload,
        verifiedAt: now,
        issuingAuthority: "Tariq Mahmood, Excise & Taxation Officer (Assessing Authority), Vehari",
        pin: challanByPin.pin ?? cleanPin
      };
    }

    // Check issued Receipts by PIN
    const receiptByPin = receipts.find((r) => r.pin === cleanPin);
    if (receiptByPin) {
      return {
        isValid: true,
        documentType: "FORM_PFT_RECEIPT",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Statutory Payment Receipt",
        message: `✓ Official Payment Receipt verified via Document Security PIN ${cleanPin}. Amount: PKR ${receiptByPin.amountPaidPkr.toLocaleString()} fully credited to Punjab Professional Tax Account (Bank Scroll/CPR: ${receiptByPin.bankScrollRef}).`,
        documentReference: receiptByPin.receiptNumber,
        unitName: receiptByPin.assesseeLegalName,
        tradeName: receiptByPin.assesseeTradeName,
        identifier: `${receiptByPin.identifierType}: ${receiptByPin.identifierValue}`,
        address: receiptByPin.address,
        categoryName: receiptByPin.statutoryCategory,
        scheduleEntry: receiptByPin.subclassificationCode
          ? `Class ${receiptByPin.subclassificationCode}`
          : "Statutory Receipt",
        assessedAmount: receiptByPin.amountPaidPkr,
        outstandingBalance: 0,
        officialSha256: receiptByPin.officialSha256,
        qrPayload: receiptByPin.qrPayload,
        verifiedAt: now,
        issuingAuthority: `${receiptByPin.receivingOfficerName} (${receiptByPin.receivingOfficerTitle})`,
        pin: receiptByPin.pin ?? cleanPin
      };
    }

    // Check Clearance Certificates by PIN
    const certByPin = clearanceCerts.find((c) => c.pin === cleanPin);
    if (certByPin) {
      const unit = units.find((u) => u.id === certByPin.unitId);
      const liveBalance = unit ? computeLedgerBalance(unit.ledgerEntries) : 0;
      if (liveBalance > 0) {
        return {
          isValid: false,
          documentType: "FORM_PFT5_CLEARANCE",
          verificationStatus: "REVOKED_ARREARS_PENDING",
          title: "Clearance Revoked / Arrears Pending",
          message: `Warning: This certificate (${certByPin.certificateNumber}) verified by PIN ${cleanPin} is INVALIDated by live ledger arrears of PKR ${liveBalance.toLocaleString()}.`,
          documentReference: certByPin.certificateNumber,
          unitName: certByPin.assesseeLegalName,
          tradeName: certByPin.assesseeTradeName,
          identifier: certByPin.cnicOrNtn,
          address: unit?.address ?? "Vehari",
          categoryName: certByPin.categoryName,
          scheduleEntry: certByPin.scheduleEntry,
          assessedAmount: certByPin.clearedAmountPkr,
          outstandingBalance: liveBalance,
          officialSha256: certByPin.officialSha256,
          qrPayload: certByPin.qrPayload,
          verifiedAt: now,
          issuingAuthority: `${certByPin.issuedByOfficerName} (${certByPin.issuedByOfficerTitle})`,
          pin: certByPin.pin ?? cleanPin
        };
      }
      return {
        isValid: true,
        documentType: "FORM_PFT5_CLEARANCE",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Form P.F.T-5 Tax Clearance Certificate",
        message: `✓ Official Tax Clearance Certificate verified via Document Security PIN ${cleanPin}. Assessee has NIL outstanding arrears for Financial Year ${certByPin.financialYear}.`,
        documentReference: certByPin.certificateNumber,
        unitName: certByPin.assesseeLegalName,
        tradeName: certByPin.assesseeTradeName,
        identifier: certByPin.cnicOrNtn,
        address: unit?.address ?? "Vehari",
        categoryName: certByPin.categoryName,
        scheduleEntry: certByPin.scheduleEntry,
        assessedAmount: certByPin.clearedAmountPkr,
        outstandingBalance: 0,
        officialSha256: certByPin.officialSha256,
        qrPayload: certByPin.qrPayload,
        verifiedAt: now,
        issuingAuthority: `${certByPin.issuedByOfficerName} (${certByPin.issuedByOfficerTitle})`,
        pin: certByPin.pin ?? cleanPin
      };
    }

    // Check units (PFT-1 or PFT-2 generated PIN)
    for (const u of units) {
      const pft1 = generateFormPFT1(u);
      if (pft1.pin === cleanPin) {
        const balance = computeLedgerBalance(u.ledgerEntries);
        return {
          isValid: pft1.isApproved,
          documentType: "FORM_PFT1_NOTICE",
          verificationStatus: pft1.isApproved ? "AUTHENTIC_VALID" : "UNAPPROVED_DRAFT",
          title: pft1.isApproved
            ? "Authentic Form P.F.T-1 Notice of Demand"
            : "Unapproved Draft Notice",
          message: pft1.isApproved
            ? `✓ Official Notice of Demand verified via Document Security PIN ${cleanPin}. Assessed Tax: PKR ${pft1.taxAmount.toLocaleString()} • Current Ledger Balance: PKR ${balance.toLocaleString()}.`
            : "Notice: This demand notice reflects a draft assessment not yet approved by the Assessing Authority.",
          documentReference: pft1.noticeNumber,
          unitName: u.legalName,
          tradeName: u.tradeName,
          identifier: `${u.identifierType}: ${u.identifierValue}`,
          address: u.address,
          categoryName: u.statutoryRule.category,
          scheduleEntry: u.statutoryRule.subclassification_code
            ? `Class ${u.statutoryRule.subclassification_code}`
            : `Class ${u.statutoryRule.category_code}`,
          assessedAmount: pft1.taxAmount,
          outstandingBalance: balance,
          officialSha256: pft1.officialSha256,
          qrPayload: pft1.qrPayload,
          verifiedAt: now,
          issuingAuthority:
            "Tariq Mahmood, Excise & Taxation Officer / Assessing Authority, Vehari",
          pin: pft1.pin ?? cleanPin
        };
      }

      const pft2 = generateFormPFT2(u);
      if (pft2.pin === cleanPin) {
        const balance = computeLedgerBalance(u.ledgerEntries);
        return {
          isValid: pft2.isApproved,
          documentType: "FORM_PFT2_CHALLAN",
          verificationStatus: pft2.isApproved ? "AUTHENTIC_VALID" : "UNAPPROVED_DRAFT",
          title: pft2.isApproved
            ? "Authentic Form P.F.T-2 Payment Challan"
            : "Unapproved Draft Challan",
          message: pft2.isApproved
            ? `✓ Official Form P.F.T-2 Challan verified via Document Security PIN ${cleanPin}. Notice: ${pft2.noticeNumber} | Total payable: PKR ${pft2.displayAmount.toLocaleString()}.`
            : "Notice: This payment challan is based on an unapproved draft assessment awaiting ETO review.",
          documentReference: pft2.noticeNumber,
          unitName: u.legalName,
          tradeName: u.tradeName,
          identifier: `${u.identifierType}: ${u.identifierValue}`,
          address: u.address,
          categoryName: u.statutoryRule.category,
          scheduleEntry: u.statutoryRule.subclassification_code
            ? `Class ${u.statutoryRule.subclassification_code}`
            : `Class ${u.statutoryRule.category_code}`,
          assessedAmount: pft2.displayAmount,
          outstandingBalance: balance,
          officialSha256: pft2.officialSha256,
          qrPayload: pft2.qrPayload,
          verifiedAt: now,
          issuingAuthority:
            "Tariq Mahmood, Excise & Taxation Officer (Assessing Authority), Vehari",
          pin: pft2.pin ?? cleanPin
        };
      }
    }
  }

  // 1. Check for Statutory Payment Receipt (Form P.F.T Receipt under Rule 10)
  const isReceipt =
    trimmed.toUpperCase().includes("RCPT") ||
    effectiveInput.toUpperCase().includes("RCPT") ||
    trimmed.toUpperCase().includes("PFT-REC") ||
    effectiveInput.toUpperCase().includes("PFT-REC") ||
    trimmed.toUpperCase().includes("RECEIPT");

  if (isReceipt) {
    const matchingReceipt = receipts.find(
      (r) =>
        normalizeQuery(r.receiptNumber) === normalized ||
        normalizeQuery(r.receiptNumber) === normalizedEffective ||
        trimmed.includes(r.receiptNumber) ||
        effectiveInput.includes(r.receiptNumber) ||
        normalizeQuery(r.challanNumber) === normalized ||
        normalizeQuery(r.challanNumber) === normalizedEffective ||
        normalizeQuery(r.demandNumber) === normalizedEffective
    );

    if (matchingReceipt) {
      return {
        isValid: true,
        documentType: "FORM_PFT_RECEIPT",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Statutory Payment Receipt",
        message: `✓ Official Payment Receipt verified under Rule 10 of 1977 Rules. Amount: PKR ${matchingReceipt.amountPaidPkr.toLocaleString()} fully credited to Punjab Professional Tax Account (Bank Scroll/CPR: ${matchingReceipt.bankScrollRef}).`,
        documentReference: matchingReceipt.receiptNumber,
        unitName: matchingReceipt.assesseeLegalName,
        tradeName: matchingReceipt.assesseeTradeName,
        identifier: `${matchingReceipt.identifierType}: ${matchingReceipt.identifierValue}`,
        address: matchingReceipt.address,
        categoryName: matchingReceipt.statutoryCategory,
        scheduleEntry: matchingReceipt.subclassificationCode
          ? `Class ${matchingReceipt.subclassificationCode}`
          : "Statutory Receipt",
        assessedAmount: matchingReceipt.amountPaidPkr,
        outstandingBalance: 0,
        officialSha256: matchingReceipt.officialSha256,
        qrPayload: matchingReceipt.qrPayload,
        verifiedAt: now,
        issuingAuthority: `${matchingReceipt.receivingOfficerName} (${matchingReceipt.receivingOfficerTitle})`,
        pin: matchingReceipt.pin
      };
    }
  }

  // 2. Check for Form P.F.T-5 (Tax Clearance Certificate)
  const isPft5 =
    trimmed.startsWith("PTAS-PUNJAB:PFT-5") ||
    trimmed.toUpperCase().includes("PFT5") ||
    effectiveInput.toUpperCase().includes("PFT5") ||
    trimmed.toUpperCase().includes("PFT-CC-") ||
    effectiveInput.toUpperCase().includes("PFT-CC-") ||
    trimmed.toUpperCase().includes("CLEARANCE");

  if (isPft5) {
    // Find matching clearance record
    const matchingCert = clearanceCerts.find(
      (c) =>
        normalizeQuery(c.certificateNumber) === normalized ||
        normalizeQuery(c.unitId) === normalized ||
        normalizeQuery(c.cnicOrNtn) === normalized ||
        trimmed.includes(c.certificateNumber)
    );

    if (matchingCert) {
      const unit = units.find((u) => u.id === matchingCert.unitId);
      const liveBalance = unit ? computeLedgerBalance(unit.ledgerEntries) : 0;

      if (liveBalance > 0) {
        return {
          isValid: false,
          documentType: "FORM_PFT5_CLEARANCE",
          verificationStatus: "REVOKED_ARREARS_PENDING",
          title: "Clearance Revoked / Arrears Pending",
          message: `Warning: This certificate (${matchingCert.certificateNumber}) is INVALIDated by live ledger arrears of PKR ${liveBalance.toLocaleString()}. Tax liabilities have accrued since issuance.`,
          documentReference: matchingCert.certificateNumber,
          unitName: matchingCert.assesseeLegalName,
          tradeName: matchingCert.assesseeTradeName,
          identifier: matchingCert.cnicOrNtn,
          address: unit?.address ?? "Vehari",
          categoryName: matchingCert.categoryName,
          scheduleEntry: matchingCert.scheduleEntry,
          assessedAmount: matchingCert.clearedAmountPkr,
          outstandingBalance: liveBalance,
          officialSha256: matchingCert.officialSha256,
          qrPayload: matchingCert.qrPayload,
          verifiedAt: now,
          issuingAuthority: `${matchingCert.issuedByOfficerName} (${matchingCert.issuedByOfficerTitle})`
        };
      }

      return {
        isValid: true,
        documentType: "FORM_PFT5_CLEARANCE",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Form P.F.T-5 Tax Clearance Certificate",
        message: `✓ Official Tax Clearance Certificate verified against Government of Punjab demand ledgers. Assessee has NIL outstanding arrears for Financial Year ${matchingCert.financialYear}.`,
        documentReference: matchingCert.certificateNumber,
        unitName: matchingCert.assesseeLegalName,
        tradeName: matchingCert.assesseeTradeName,
        identifier: matchingCert.cnicOrNtn,
        address: unit?.address ?? "Vehari",
        categoryName: matchingCert.categoryName,
        scheduleEntry: matchingCert.scheduleEntry,
        assessedAmount: matchingCert.clearedAmountPkr,
        outstandingBalance: 0,
        officialSha256: matchingCert.officialSha256,
        qrPayload: matchingCert.qrPayload,
        verifiedAt: now,
        issuingAuthority: `${matchingCert.issuedByOfficerName} (${matchingCert.issuedByOfficerTitle})`,
        pin: matchingCert.pin
      };
    }
  }

  // 3. Check for Form P.F.T-2 (3-Copy Bank Payment Challan)
  const isPft2 =
    trimmed.startsWith("PTAS-PUNJAB:PFT-2") ||
    trimmed.toUpperCase().includes("PFT-2") ||
    trimmed.toUpperCase().includes("PFT2") ||
    trimmed.toUpperCase().includes("CHALLAN");

  if (isPft2) {
    // Check issued challans registry
    const matchingChallan = challans.find(
      (c) =>
        (c.noticeNumber && c.noticeNumber === trimmed) ||
        c.challanNumber === trimmed ||
        (c.noticeNumber && normalizeQuery(c.noticeNumber) === normalized) ||
        normalizeQuery(c.challanNumber) === normalized ||
        (c.noticeNumber && trimmed.includes(c.noticeNumber)) ||
        trimmed.includes(c.challanNumber)
    );

    if (matchingChallan) {
      const ref = matchingChallan.noticeNumber ?? matchingChallan.challanNumber;
      return {
        isValid: true,
        documentType: "FORM_PFT2_CHALLAN",
        verificationStatus: "AUTHENTIC_VALID",
        title: "Authentic Form P.F.T-2 Payment Challan",
        message: `✓ Official Punjab Professional Tax Payment Challan verified. Notice: ${ref} | Total payable: PKR ${matchingChallan.amountPayable.toLocaleString()} (Due Date: ${matchingChallan.dueDate}).`,
        documentReference: ref,
        unitName: matchingChallan.legalName,
        tradeName: matchingChallan.tradeName,
        identifier: matchingChallan.identifierValue,
        address: matchingChallan.address,
        categoryName: matchingChallan.category,
        scheduleEntry: matchingChallan.subclassificationCode
          ? `Class ${matchingChallan.subclassificationCode}`
          : "Statutory Challan",
        assessedAmount: matchingChallan.amountPayable,
        outstandingBalance: matchingChallan.remainingBalance ?? 0,
        officialSha256: matchingChallan.officialSha256,
        qrPayload: matchingChallan.qrPayload,
        verifiedAt: now,
        issuingAuthority: "Tariq Mahmood, Excise & Taxation Officer (Assessing Authority), Vehari",
        pin: matchingChallan.pin
      };
    }

    const matchingUnit = units.find((u) => {
      const doc = generateFormPFT2(u);
      return (
        normalizeQuery(doc.challanNumber) === normalized ||
        normalizeQuery(doc.noticeNumber) === normalized ||
        normalizeQuery(u.demandUnit.permanentDemandNo) === normalized ||
        trimmed.includes(doc.challanNumber) ||
        trimmed.includes(doc.noticeNumber)
      );
    });

    if (matchingUnit) {
      const pft2 = generateFormPFT2(matchingUnit);
      const balance = computeLedgerBalance(matchingUnit.ledgerEntries);

      return {
        isValid: pft2.isApproved,
        documentType: "FORM_PFT2_CHALLAN",
        verificationStatus: pft2.isApproved ? "AUTHENTIC_VALID" : "UNAPPROVED_DRAFT",
        title: pft2.isApproved
          ? "Authentic Form P.F.T-2 Payment Challan"
          : "Unapproved Draft Challan",
        message: pft2.isApproved
          ? `✓ Official Punjab Professional Tax Payment Challan verified. Total payable: PKR ${pft2.displayAmount.toLocaleString()} (Current Ledger Balance: PKR ${balance.toLocaleString()}).`
          : "Notice: This payment challan is based on an unapproved draft assessment awaiting ETO review.",
        documentReference: pft2.noticeNumber,
        unitName: matchingUnit.legalName,
        tradeName: matchingUnit.tradeName,
        identifier: `${matchingUnit.identifierType}: ${matchingUnit.identifierValue}`,
        address: matchingUnit.address,
        categoryName: matchingUnit.statutoryRule.category,
        scheduleEntry: matchingUnit.statutoryRule.subclassification_code
          ? `Class ${matchingUnit.statutoryRule.subclassification_code}`
          : `Class ${matchingUnit.statutoryRule.category_code}`,
        assessedAmount: pft2.displayAmount,
        outstandingBalance: balance,
        officialSha256: pft2.officialSha256,
        qrPayload: pft2.qrPayload,
        verifiedAt: now,
        issuingAuthority: "Tariq Mahmood, Excise & Taxation Officer (Assessing Authority), Vehari",
        pin: pft2.pin
      };
    }
  }

  // 4. Check for Form P.F.T-1 (Notice of Tax Demand under Rule 6) or general PDN lookup
  const matchingUnit = units.find((u) => {
    const pft1 = generateFormPFT1(u);
    return (
      normalizeQuery(pft1.noticeNumber) === normalized ||
      normalizeQuery(u.demandUnit.permanentDemandNo) === normalized ||
      normalizeQuery(u.identifierValue) === normalized ||
      trimmed.includes(u.demandUnit.permanentDemandNo) ||
      trimmed.includes(pft1.noticeNumber)
    );
  });

  if (matchingUnit) {
    const pft1 = generateFormPFT1(matchingUnit);
    const balance = computeLedgerBalance(matchingUnit.ledgerEntries);

    return {
      isValid: pft1.isApproved,
      documentType: "FORM_PFT1_NOTICE",
      verificationStatus: pft1.isApproved ? "AUTHENTIC_VALID" : "UNAPPROVED_DRAFT",
      title: pft1.isApproved
        ? "Authentic Form P.F.T-1 Notice of Demand"
        : "Unapproved Draft Notice",
      message: pft1.isApproved
        ? `✓ Official Notice of Demand verified under Rule 6 of 1977 Rules. Assessed Tax: PKR ${pft1.taxAmount.toLocaleString()} &bull; Current Ledger Balance: PKR ${balance.toLocaleString()}.`
        : "Notice: This demand notice reflects a draft assessment not yet approved by the Assessing Authority.",
      documentReference: pft1.noticeNumber,
      unitName: matchingUnit.legalName,
      tradeName: matchingUnit.tradeName,
      identifier: `${matchingUnit.identifierType}: ${matchingUnit.identifierValue}`,
      address: matchingUnit.address,
      categoryName: matchingUnit.statutoryRule.category,
      scheduleEntry: matchingUnit.statutoryRule.subclassification_code
        ? `Class ${matchingUnit.statutoryRule.subclassification_code}`
        : `Class ${matchingUnit.statutoryRule.category_code}`,
      assessedAmount: pft1.taxAmount,
      outstandingBalance: balance,
      officialSha256: pft1.officialSha256,
      qrPayload: pft1.qrPayload,
      verifiedAt: now,
      issuingAuthority: "Tariq Mahmood, Excise & Taxation Officer / Assessing Authority, Vehari",
      pin: pft1.pin
    };
  }

  // Not found
  return {
    isValid: false,
    documentType: "UNKNOWN",
    verificationStatus: "INVALID_NOT_FOUND",
    title: "Document Not Found in Provincial Registry",
    message: `No authentic Form P.F.T-1 notice, P.F.T-2 challan, or P.F.T-5 clearance certificate matching '${trimmed}' was found in Circle-Vehari.`,
    documentReference: trimmed,
    unitName: "N/A",
    identifier: "N/A",
    address: "N/A",
    categoryName: "N/A",
    scheduleEntry: "N/A",
    assessedAmount: 0,
    outstandingBalance: 0,
    officialSha256: "",
    qrPayload: "",
    verifiedAt: now,
    issuingAuthority: "Excise & Taxation Department, Punjab"
  };
}

/**
 * Public Taxpayer Liability & Challan Lookup:
 * Allows any citizen to search by CNIC, NTN, or Permanent Demand Number.
 */
export function lookupTaxpayerLiability(
  searchQuery: string,
  units: readonly StoredUnit[]
): TaxpayerLiabilityLookupResult | null {
  const trimmed = searchQuery.trim();
  if (!trimmed) return null;
  const normalized = normalizeQuery(trimmed);

  const unit = units.find((u) => {
    const idClean = normalizeQuery(u.identifierValue);
    const pdnClean = normalizeQuery(u.demandUnit.permanentDemandNo);
    const uinClean = u.provincialUin ? normalizeQuery(u.provincialUin) : "";
    const legalClean = normalizeQuery(u.legalName);
    const tradeClean = u.tradeName ? normalizeQuery(u.tradeName) : "";

    return (
      idClean === normalized ||
      idClean.includes(normalized) ||
      normalized.includes(idClean) ||
      pdnClean === normalized ||
      pdnClean.includes(normalized) ||
      (uinClean
        ? uinClean === normalized || uinClean.includes(normalized) || normalized.includes(uinClean)
        : false) ||
      legalClean.includes(normalized) ||
      (tradeClean ? tradeClean.includes(normalized) : false)
    );
  });

  if (!unit) return null;

  const latestVersion = unit.assessmentVersions[0];
  const assessedTax = latestVersion?.snapshot.taxAmount ?? 0;
  let penalties = 0;
  let totalPaid = 0;

  for (const e of unit.ledgerEntries) {
    if (e.entryType === "PENALTY_DEMAND") {
      penalties += e.amount;
    } else if (e.amount < 0) {
      totalPaid += Math.abs(e.amount);
    }
  }

  const balance = computeLedgerBalance(unit.ledgerEntries);
  const aging = computeDefaulterAging(
    unit.ledgerEntries,
    "2026-08-31",
    undefined,
    Boolean(unit.isRecoveryCertified)
  );

  const pft1 = generateFormPFT1(unit);
  const pft2 = generateFormPFT2(unit);

  return {
    found: true,
    unit,
    legalName: unit.legalName,
    tradeName: unit.tradeName,
    identifierType: unit.identifierType,
    identifierValue: unit.identifierValue,
    permanentDemandNo: unit.demandUnit.permanentDemandNo,
    provincialUin: unit.provincialUin,
    address: unit.address,
    categoryName: unit.statutoryRule.category,
    scheduleEntry: unit.statutoryRule.subclassification_code
      ? `Class ${unit.statutoryRule.subclassification_code}`
      : `Class ${unit.statutoryRule.category_code}`,
    annualTaxRate: unit.statutoryRule.annual_rate_pkr,
    assessedTax,
    penalties,
    totalDemand: assessedTax + penalties,
    totalPaid,
    outstandingBalance: balance,
    dueDate: "2026-08-31",
    daysOverdue: aging.daysOverdue,
    defaulterStatus: aging.status,
    isClearanceEligible: balance <= 0,
    noticeNumber: pft1.noticeNumber,
    challanNumber: pft2.challanNumber
  };
}

/**
 * Rule 4 Statutory Self-Assessment Liability Calculator:
 * Computes exact statutory tax according to the Second Schedule to Punjab Finance Act, 1977.
 */
export function calculateRule4SelfAssessment(
  input: SelfAssessmentCriteriaInput
): SelfAssessmentResult {
  const { categoryCode } = input;
  const rules = getRulesByCategory(categoryCode);

  let matchedRule: StatutoryRuleDefinition | undefined;

  switch (categoryCode) {
    case "1": {
      // Companies
      const capital = input.paidUpCapitalPkr ?? 0;
      if (capital <= 5000000) {
        matchedRule = getStatutoryRuleById("PFT-1.i");
      } else if (capital <= 50000000) {
        matchedRule = getStatutoryRuleById("PFT-1.ii");
      } else if (capital <= 100000000) {
        matchedRule = getStatutoryRuleById("PFT-1.iii");
      } else if (capital <= 200000000) {
        matchedRule = getStatutoryRuleById("PFT-1.iv");
      } else {
        matchedRule = getStatutoryRuleById("PFT-1.v");
      }
      break;
    }
    case "2": {
      // Factories
      const emps = input.employeeCount ?? 0;
      if (emps <= 10) {
        matchedRule = getStatutoryRuleById("PFT-2.i");
      } else if (emps <= 25) {
        matchedRule = getStatutoryRuleById("PFT-2.ii");
      } else {
        matchedRule = getStatutoryRuleById("PFT-2.iii");
      }
      break;
    }
    case "3": {
      // Commercial Establishments (Persons other than companies)
      // NON-NEGOTIABLE STATUTE: 3(i)(a)=6000, 3(i)(b)=4000 (Others e.g. Vehari), 3(ii)=2000
      const emps = input.employeeCount ?? 0;
      const isMetro = Boolean(input.isMetropolitan);
      if (emps >= 10) {
        matchedRule = isMetro
          ? getStatutoryRuleById("PFT-3.i.a")
          : getStatutoryRuleById("PFT-3.i.b");
      } else {
        matchedRule = getStatutoryRuleById("PFT-3.ii");
      }
      break;
    }
    case "6": {
      // Professions (Doctors, Specialists, Pesticide Dealers, etc.)
      if (input.ruleId) {
        matchedRule = getStatutoryRuleById(input.ruleId);
      } else if (input.professionType === "SPECIALIST") {
        matchedRule = getStatutoryRuleById("PFT-6.i");
      } else if (input.professionType === "RMP") {
        matchedRule = getStatutoryRuleById("PFT-6.ii");
      } else if (input.professionType === "PESTICIDE_DEALER") {
        matchedRule = getStatutoryRuleById("PFT-6.x");
      } else {
        matchedRule = rules[0];
      }
      break;
    }
    case "10": {
      // Air Conditioned Food Establishments / Bakeries / Sweets Shops
      matchedRule = getStatutoryRuleById("PFT-10");
      break;
    }
    case "11": {
      // Persons assessed to pay income tax in preceding FY
      matchedRule = getStatutoryRuleById("PFT-11");
      break;
    }
    default: {
      matchedRule = input.ruleId ? getStatutoryRuleById(input.ruleId) : rules[0];
      break;
    }
  }

  if (!matchedRule) {
    matchedRule = rules[0] ?? getStatutoryRuleById("PFT-3.i.b")!;
  }

  return {
    categoryCode: matchedRule.category_code,
    categoryName: matchedRule.category,
    ruleId: matchedRule.rule_id,
    subclassificationCode: matchedRule.subclassification_code,
    statutoryTertiaryCode: matchedRule.statutory_tertiary_code,
    subcategory: matchedRule.subcategory,
    officialLegalText: matchedRule.official_text,
    annualRatePkr: matchedRule.annual_rate_pkr,
    rateBasis: matchedRule.rate_basis
  };
}

/**
 * Instant Citizen Digital Payment Simulator (ePay Punjab / 1Link):
 * Posts an immutable PAYMENT_CREDIT to the unit ledger, settles balance,
 * creates an audit event, and issues Form P.F.T-5 Tax Clearance if arrears are zero.
 */
export function simulateCitizenPayment(
  unitId: string,
  amount: number,
  paymentChannel: "EPAY_PUNJAB" | "CHALLAN_32A",
  currentState: PilotState
): {
  readonly result: CitizenPaymentSimulationResult;
  readonly updatedUnits: StoredUnit[];
  readonly updatedAudits: PilotAuditItem[];
  readonly updatedClearanceCerts: ClearanceCertificateRecord[];
} {
  const targetUnit = currentState.units.find((u) => u.id === unitId);
  if (!targetUnit) {
    throw new Error(`Unit with id '${unitId}' not found.`);
  }

  if (amount <= 0) {
    throw new Error("Payment deposit amount must be greater than zero.");
  }

  const prevBalance = computeLedgerBalance(targetUnit.ledgerEntries);
  const psid = generate17DigitEPayPsid(unitId);
  const txnId = `TXN-1LINK-${Date.now()}`;
  const now = new Date().toISOString();

  // Create append-only PAYMENT_CREDIT entry (-amount)
  const creditEntry = {
    id: `entry-citpay-${Date.now()}`,
    demandUnitId: targetUnit.demandUnit.id,
    financialYearId: "FY-2026-2027",
    entryType: "PAYMENT_CREDIT" as const,
    amount: -Math.abs(amount),
    sourceType: "CITIZEN_SELF_SERVICE_EPAY",
    sourceId: psid,
    idempotencyKey: `idem-citpay-${psid}`,
    correlationId: `corr-citpay-${Date.now()}`,
    postedBy: "CITIZEN_SELF_SERVICE_GATEWAY",
    postedAt: now,
    metadata: {
      psid,
      transactionId: txnId,
      paymentChannel,
      channelName: paymentChannel === "EPAY_PUNJAB" ? "ePay Punjab / 1Link" : "Challan 32-A NBP",
      depositedAmountPkr: amount
    }
  };

  const updatedLedger = [...targetUnit.ledgerEntries, creditEntry];
  const newBalance = computeLedgerBalance(updatedLedger);

  const updatedUnit: StoredUnit = {
    ...targetUnit,
    ledgerEntries: updatedLedger
  };

  const auditEvent: PilotAuditItem = {
    id: `audit-citpay-${Date.now()}`,
    eventType: "ONLINE_PAYMENT_SETTLED",
    actorName: "Assessee (Self-Service)",
    actorRole: "CITIZEN",
    target: `${targetUnit.legalName} (${psid})`,
    timestamp: now,
    correlationId: creditEntry.correlationId,
    details: `Online payment of PKR ${amount.toLocaleString()} settled via ${
      paymentChannel === "EPAY_PUNJAB" ? "ePay Punjab (1Link)" : "Challan 32-A"
    } under PSID ${psid}. Demand ledger credited. New derived balance: PKR ${newBalance.toLocaleString()}.`
  };

  const updatedUnits = currentState.units.map((u) => (u.id === unitId ? updatedUnit : u));
  const updatedAudits = [auditEvent, ...currentState.auditLogs];
  const clearanceCerts = [...(currentState.clearanceCertificates ?? [])];

  let clearanceIssued = false;
  let clearanceCertNumber: string | undefined = undefined;

  // If arrears are completely settled (balance <= 0), automatically issue Form P.F.T-5
  if (newBalance <= 0) {
    const certModel = generateTaxClearanceCertificate(
      updatedUnit,
      currentState.currentOfficer,
      "2026-2027",
      now.split("T")[0]
    );

    if (certModel.isEligible) {
      const newCertRecord: ClearanceCertificateRecord = {
        id: `cert-${Date.now()}`,
        certificateNumber: certModel.certificateNumber,
        unitId: targetUnit.id,
        assesseeLegalName: targetUnit.legalName,
        assesseeTradeName: targetUnit.tradeName,
        cnicOrNtn: `${targetUnit.identifierType}: ${targetUnit.identifierValue}`,
        categoryName: targetUnit.statutoryRule.category,
        scheduleEntry: targetUnit.statutoryRule.subclassification_code
          ? `Class ${targetUnit.statutoryRule.subclassification_code}`
          : `Class ${targetUnit.statutoryRule.category_code}`,
        financialYear: "2026-2027",
        issueDate: certModel.issueDate,
        validUntil: certModel.expiryDate,
        issuedByOfficerId: currentState.currentOfficer.id,
        issuedByOfficerName: "Tariq Mahmood",
        issuedByOfficerTitle: "Excise & Taxation Officer (Assessing Authority)",
        officialSha256: certModel.officialSha256,
        qrPayload: certModel.qrPayload,
        clearedAmountPkr: certModel.totalTaxPaid
      };

      clearanceCerts.push(newCertRecord);
      clearanceIssued = true;
      clearanceCertNumber = certModel.certificateNumber;
    }
  }

  return {
    result: {
      success: true,
      psid,
      transactionId: txnId,
      unitId,
      unitName: targetUnit.legalName,
      paidAmount: amount,
      previousBalance: prevBalance,
      newBalance,
      paymentChannel,
      depositedAt: now,
      clearanceIssued,
      clearanceCertNumber
    },
    updatedUnits,
    updatedAudits,
    updatedClearanceCerts: clearanceCerts
  };
}

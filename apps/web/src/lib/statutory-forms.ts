/**
 * Statutory Forms Generator for Punjab Professional Tax Administration System (PTAS)
 * Implements official gazetted formats:
 * - Form P.F.T-1: Notice of Tax Demand (Rule 6, Punjab Weekly Gazette Jan 21, 2009)
 * - Form P.F.T-2: 3-Copy Side-by-Side Payment Challan (Rule 9, Punjab Weekly Gazette Jan 21, 2009)
 * - Form P.F.T-3: Assessment & Demand Register (Rule 11, Punjab Professions & Trades Tax Rules 1977)
 */

import {
  computeContentSha256,
  computeLedgerBalance,
  computeDefaulterAging,
  generateDocumentPin,
  getStatutoryRuleById,
  getStatutoryRuleBySubclassification,
  type DefaulterAgingInfo,
  type DefaulterAgingStatus,
  type DemandLedgerEntry,
  type StatutoryRuleDefinition
} from "@ptas/domain";
export { computeLedgerBalance, computeDefaulterAging };
import type { MockOfficer, StoredUnit } from "./pilot-store";

/**
 * Resolves a full, authoritative statutory subclass code.
 * Ensures codes like "6(2)(a)(i)", "6(ii)", "3(i)(b)", "1(ii)" are properly formatted
 * with their category prefix and never truncated to just bare category numbers like "3" or "6".
 */
export function formatFullSubclassCode(
  rawSubCode?: string | null,
  categoryCode?: string | null,
  statutoryRuleId?: string | null,
  tertiaryCode?: string | null
): string {
  const cat = (categoryCode ?? "").trim();
  let code = (rawSubCode ?? "").trim();

  // If code is empty or just the bare category number (e.g. "3" or "6"), resolve from ruleId or tertiaryCode
  if (!code || code === cat) {
    if (tertiaryCode && tertiaryCode.trim() !== cat) {
      code = tertiaryCode.trim();
    } else if (statutoryRuleId) {
      const byId = getStatutoryRuleById(statutoryRuleId);
      if (byId?.rule_code && byId.rule_code !== cat) {
        code = byId.rule_code;
      } else if (byId?.statutory_tertiary_code && byId.statutory_tertiary_code !== cat) {
        code = byId.statutory_tertiary_code;
      } else if (byId?.subclassification_code && byId.subclassification_code !== cat) {
        code = byId.subclassification_code;
      } else {
        const match = statutoryRuleId.match(/^PFT-(\d+)\.(.+)$/i);
        if (match && match[1] && match[2]) {
          const parts = match[2]
            .split(".")
            .map((p) => `(${p})`)
            .join("");
          code = `${match[1]}${parts}`;
        }
      }
    }
  }

  // If code starts with parentheses like "(i)(b)" or "(2)(a)(i)" and lacks category prefix, prepend category
  if (cat && code.startsWith("(") && !code.startsWith(cat)) {
    code = `${cat}${code}`;
  }

  return code || cat;
}

/**
 * Resolves the official, statutory descriptive label/text for a given subclassification code.
 * E.g. "6(2)(a)(i)" -> "Real Estate Agents / Property Dealers"
 *      "6(x)" -> "Jewelers, Departmental Stores, Electronic Goods Stores"
 *      "1(i)" -> "Paid-up capital up to Rs 5 million"
 */
export function getSubclassLabel(
  rawSubCode?: string | null,
  categoryCode?: string | null,
  statutoryRuleId?: string | null,
  fallbackLabel?: string | null
): string {
  // 1. If a valid, non-placeholder fallbackLabel is provided, sanitize and check it
  if (fallbackLabel && typeof fallbackLabel === "string") {
    const trimmed = fallbackLabel.trim();
    if (
      trimmed &&
      trimmed.toLowerCase() !== "under review" &&
      trimmed.toLowerCase() !== "pending review" &&
      trimmed.toLowerCase() !== "pending statutory classification" &&
      trimmed !== rawSubCode &&
      trimmed !== categoryCode &&
      !/^class\s*\d+$/i.test(trimmed)
    ) {
      return trimmed;
    }
  }

  const code = formatFullSubclassCode(rawSubCode, categoryCode, statutoryRuleId);

  // 2. Check rule by ID if provided
  if (statutoryRuleId) {
    const byId = getStatutoryRuleById(statutoryRuleId);
    if (byId?.subclassification_label && byId.subclassification_label.trim() !== "") {
      return byId.subclassification_label.trim();
    }
    if (byId?.subcategory && byId.subcategory.trim() !== "") {
      return byId.subcategory.trim();
    }
  }

  // 3. Check domain rules by subclassification code
  if (code) {
    const bySub = getStatutoryRuleBySubclassification(code);
    if (bySub?.subclassification_label && bySub.subclassification_label.trim() !== "") {
      return bySub.subclassification_label.trim();
    }
    if (bySub?.subcategory && bySub.subcategory.trim() !== "") {
      return bySub.subcategory.trim();
    }

    // Also check stripped code without category prefix if code starts with category
    const cat = (categoryCode ?? "").trim();
    if (cat && code.startsWith(cat)) {
      const stripped = code.slice(cat.length);
      const byStripped = getStatutoryRuleBySubclassification(stripped);
      if (byStripped?.subclassification_label) return byStripped.subclassification_label.trim();
      if (byStripped?.subcategory) return byStripped.subcategory.trim();
    }
  }

  // 4. Fallback lookup for known statutory schedules and survey legacy codes
  const normalized = (code || "").replace(/\s+/g, "").toLowerCase();
  if (
    normalized.includes("6(2)(a)(i)") ||
    normalized.includes("2(a)(i)") ||
    normalized.includes("6(vii)(d)")
  ) {
    return "Real Estate Agents / Property Dealers";
  }
  if (normalized.includes("6(2)(a)(ii)") || normalized.includes("2(a)(ii)")) {
    return "Motor Vehicle Dealers";
  }
  if (normalized.includes("6(vii)(c)") || normalized.includes("2(a)(iii)")) {
    return "Motorcycle / Scooter Dealers";
  }
  if (normalized.includes("6(vii)(a)")) {
    return "Members of Stock Exchanges";
  }
  if (normalized.includes("6(vii)(b)")) {
    return "Money Changers";
  }
  if (normalized.includes("6(vii)(e)")) {
    return "Recruiting Agents";
  }
  if (normalized.includes("6(x)")) {
    return "Jewelers, Departmental Stores, Electronic Goods Stores";
  }
  if (normalized.includes("6(i)")) {
    return "Medical Consultants or Specialists / Dental Surgeons";
  }
  if (normalized.includes("6(ii)")) {
    return "Registered Medical Practitioners";
  }
  if (normalized.includes("6(iii)")) {
    return "Homoeopaths, Hakeems and Ayurvedics";
  }
  if (normalized.includes("6(iv)")) {
    return "Auditing Firms";
  }
  if (normalized.includes("6(v)")) {
    return "Management, Tax & Technical Consultants / Architects";
  }
  if (normalized.includes("6(vi)")) {
    return "Lawyers";
  }
  if (normalized.includes("6(viii)")) {
    return "Carriage of Goods & Passengers by Road";
  }
  if (normalized.includes("6(ix)")) {
    return "Health Clubs and Gymnasiums";
  }
  if (normalized.includes("6(xi)")) {
    return "Tobacco Vendors";
  }
  if (normalized.startsWith("1(i)")) return "Paid-up capital up to Rs 5 million";
  if (normalized.startsWith("1(ii)")) return "Paid-up capital > Rs 5M and <= Rs 50M";
  if (normalized.startsWith("1(iii)")) return "Paid-up capital > Rs 50M and <= Rs 100M";
  if (normalized.startsWith("1(iv)")) return "Paid-up capital > Rs 100M and <= Rs 200M";
  if (normalized.startsWith("1(v)")) return "Paid-up capital exceeding Rs 200M";
  if (normalized.startsWith("2(i)")) return "Employees not exceeding 10";
  if (normalized.startsWith("2(ii)")) return "Employees exceeding 10 but not exceeding 25";
  if (normalized.startsWith("2(iii)")) return "Employees exceeding 25";
  if (normalized.startsWith("3(i)")) return "10+ Employees Commercial Establishments";
  if (normalized.startsWith("3(ii)")) return "Other Commercial Establishments";
  if (normalized.startsWith("4(i)")) return "Commercial Importers / Exporters";
  if (normalized.startsWith("5(i)")) return "Contractors / Builders / Suppliers";
  if (normalized.startsWith("7")) return "Petrol Pumps / CNG Stations";
  if (normalized.startsWith("8")) return "Property Developers / Builders / Marketing Agents";
  if (normalized.startsWith("9")) return "Restaurants / Fast Food / Bakers";
  if (normalized.startsWith("10")) return "Service Stations / Car Wash";
  if (normalized.startsWith("11")) return "Marriage Halls / Banquet Halls / Event Complexes";

  return fallbackLabel || "";
}

/**
 * Formats a subclassification code and its descriptive title for select dropdowns.
 * E.g.: "Code 6(2)(a)(i) — Real Estate Agents / Property Dealers"
 */
export function formatSubclassOption(
  rawSubCode?: string | null,
  categoryCode?: string | null,
  statutoryRuleId?: string | null,
  explicitLabel?: string | null
): string {
  const code = formatFullSubclassCode(rawSubCode, categoryCode, statutoryRuleId);
  const label = getSubclassLabel(rawSubCode, categoryCode, statutoryRuleId, explicitLabel);
  const codeDisplay = code ? (code.toLowerCase().startsWith("code") ? code : `Code ${code}`) : "";

  if (!codeDisplay) return label || "All Sub-Classes";
  if (
    !label ||
    label.toLowerCase() === code.toLowerCase() ||
    label.toLowerCase() === "under review"
  ) {
    return codeDisplay;
  }
  return `${codeDisplay} — ${label}`;
}

export function cleanCircleName(circle?: string): string {
  if (!circle) return "Vehari Circle I";
  return circle
    .replace(/^CIRCLE\s*[-:]?\s*/i, "")
    .replace(/\s*\([^)]*(City|Commercial|Rural|Industrial|Grain Market)[^)]*\)/gi, "")
    .trim();
}

export function getScheduleEntryLabel(rule: StatutoryRuleDefinition): string {
  const code =
    rule.rule_code ||
    (rule as unknown as { category_code?: string }).category_code ||
    (rule as unknown as { schedule_entry?: string }).schedule_entry ||
    "1";
  if (!code || code === "undefined") {
    return "Class 1";
  }
  return String(code).startsWith("Class") ? String(code) : `Class ${code}`;
}

export interface Pft2NoticeNumberOptions {
  demandNumber: string;
  issueDate: string; // YYYY-MM-DD
  formTypeCode?: string | undefined; // "01" | "02" | "03" | "04" | "STD" | string
  demandScope?: "01" | "02" | "03" | "CURRENT" | "ARREAR" | "COMBINED" | string | undefined;
  paymentScope?: "01" | "02" | "FULL" | "PARTIAL" | string | undefined;
  amount: number;
}

/**
 * Official Punjab Form P.F.T-2 Notice / Challan Number Generator
 * Follows exact statutory pattern with numeric digit codes (NO text codes):
 * PFT2 - Demand No. - Issued month code - issue date code - form type code - current/arrear code - combined/partial code - amount
 *
 * Digit Codes:
 * - Form Type Code (2 digits):
 *     01 = Standard Challan
 *     02 = Notice-cum-Challan
 *     03 = Arrears Demand Challan
 *     04 = Revised Assessment Challan
 * - Current / Arrear Code (2 digits):
 *     01 = Current Year Demand
 *     02 = Arrears Demand Only
 *     03 = Combined (Current + Arrears)
 * - Combined / Partial Code (2 digits):
 *     01 = Full / Combined Payment
 *     02 = Partial Payment
 *
 * Example: PFT2-0001-09-20-01-01-01-5000
 */
/**
 * Formats a demand number to circle-wise 4 digits (e.g. "0005").
 * Demand numbers are circle-scoped; province-wide uniqueness is guaranteed by PIN.
 */
export function formatDemandNumber(demand: string | number | undefined | null): string {
  if (!demand) return "0001";
  const str = String(demand).trim();
  const match = str.match(/(\d{4,5})$/);
  if (match && match[1]) {
    return match[1].padStart(4, "0");
  }
  const digits = str.replace(/\D/g, "");
  return digits ? digits.slice(-4).padStart(4, "0") : "0001";
}

export function generatePft2NoticeNumber(params: Pft2NoticeNumberOptions): string {
  const demandClean = formatDemandNumber(params.demandNumber);

  // Extract 2-digit year, month, and date codes from issueDate (YYYY-MM-DD)
  const parts = params.issueDate ? params.issueDate.split("-") : [];
  const yearCode = parts.length >= 1 && parts[0] ? parts[0].slice(-2) : "26";
  const monthCode = parts.length >= 2 && parts[1] ? parts[1].padStart(2, "0") : "10";
  const dateCode = parts.length >= 3 && parts[2] ? parts[2].padStart(2, "0") : "03";

  // Form type digit code (01: Standard, 02: Notice-cum-Challan, 03: Arrears, 04: Revised)
  const rawForm = (params.formTypeCode || "01").toUpperCase().trim();
  let formTypeDigit = "01";
  if (rawForm === "01" || rawForm === "1" || rawForm === "STD" || rawForm === "STANDARD") {
    formTypeDigit = "01";
  } else if (
    rawForm === "02" ||
    rawForm === "2" ||
    rawForm === "NCUM" ||
    rawForm === "NOTICE_CUM_CHALLAN"
  ) {
    formTypeDigit = "02";
  } else if (
    rawForm === "03" ||
    rawForm === "3" ||
    rawForm === "ARR" ||
    rawForm === "ARREARS_DEMAND"
  ) {
    formTypeDigit = "03";
  } else if (
    rawForm === "04" ||
    rawForm === "4" ||
    rawForm === "REV" ||
    rawForm === "REVISED_ASSESSMENT"
  ) {
    formTypeDigit = "04";
  } else if (/^\d+$/.test(rawForm)) {
    formTypeDigit = rawForm.padStart(2, "0");
  }

  // Current / Arrear digit code (01: Current, 02: Arrear, 03: Combined)
  const rawScope = (params.demandScope || "01").toUpperCase().trim();
  let scopeDigit = "01";
  if (rawScope === "01" || rawScope === "1" || rawScope === "CUR" || rawScope === "CURRENT") {
    scopeDigit = "01";
  } else if (
    rawScope === "02" ||
    rawScope === "2" ||
    rawScope === "ARR" ||
    rawScope === "ARREAR" ||
    rawScope === "ARREARS"
  ) {
    scopeDigit = "02";
  } else if (
    rawScope === "03" ||
    rawScope === "3" ||
    rawScope === "COMB" ||
    rawScope === "COMBINED"
  ) {
    scopeDigit = "03";
  } else if (/^\d+$/.test(rawScope)) {
    scopeDigit = rawScope.padStart(2, "0");
  }

  const amountInt = Math.round(params.amount || 0);

  // Reconstructed pattern: PFT2-{demandClean}-{yearCode}{monthCode}{dateCode}{formTypeDigit}{scopeDigit}-{amountInt}
  // All internal dashes removed, year code block inserted, combination code digit 01 discarded
  return `PFT2-${demandClean}-${yearCode}${monthCode}${dateCode}${formTypeDigit}${scopeDigit}-${amountInt}`;
}

export type StatutoryDocCode =
  "PFT1" | "PFT2" | "PFT3" | "PFT5" | "RCPT" | "SCN" | "LRC" | "APP" | "DSC" | "RFD";

export interface StandardDocNumberParams {
  readonly province?: string;
  readonly department?: string;
  readonly districtCode?: string;
  readonly circleCode?: string;
  readonly docCode: StatutoryDocCode;
  readonly financialYear?: string;
  readonly sequence: number | string;
}

/**
 * Standardized Non-Overlapping Punjab Statutory Document Numbering System.
 * Guarantees zero collision across all tehsils, circles, districts, and financial years.
 * Format: [PROVINCE]/[DEPARTMENT]/[DISTRICT]/[CIRCLE]/[DOC_CODE]/[FY]/[SEQUENCE]
 * Example: PB/ET/VHR/CIR-1/PFT1/2026-27/00001
 */
export function formatStandardDocNumber(params: StandardDocNumberParams): string {
  const prov = (params.province ?? "PB").toUpperCase().trim();
  const dept = (params.department ?? "ET").toUpperCase().trim();
  const dist = (params.districtCode ?? "VHR").toUpperCase().trim();
  const circle = (params.circleCode ?? "CIR-1").toUpperCase().trim();
  const fy = (params.financialYear ?? "2026-27").trim();

  const seqStr =
    typeof params.sequence === "number"
      ? String(params.sequence).padStart(5, "0")
      : params.sequence.replace(/[^0-9]/g, "").length > 0
        ? params.sequence
            .replace(/[^0-9]/g, "")
            .slice(-5)
            .padStart(5, "0")
        : params.sequence.slice(-5).padStart(5, "0");

  return `${prov}/${dept}/${dist}/${circle}/${params.docCode}/${fy}/${seqStr}`;
}

export interface FormPFT1Model {
  readonly isApproved: boolean;
  readonly noticeNumber: string;
  readonly pin: string;
  readonly demandNumber: string;
  readonly provincialUin?: string | undefined;
  readonly taxNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly circleName: string;
  readonly districtName: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly taxAmount: number;
  readonly taxAmountWords: string;
  readonly statutoryCategoryText: string;
  readonly scheduleEntry: string;
  readonly subclassificationCode: string | null;
  readonly statutoryTertiaryCode?: string | null;
  readonly tertiarySlab: string | null;
  readonly slabRatePkr: number;
  readonly rateBasis: string;
  readonly statutoryClassificationFull: string;
  readonly financialYear: string;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalNoticeText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly serviceReceipt: {
    readonly demandNumber: string;
    readonly taxPayable: number;
    readonly dueDate: string;
    readonly assesseeName: string;
    readonly assesseeClass: string;
    readonly taxNumber: string;
    readonly serverName: string;
    readonly serverRole: string;
  };
}

export interface FormPFT2CopyModel {
  readonly copyTitle: string;
  readonly copyTitleUrdu: string;
  readonly noticeNumber?: string | undefined;
  readonly pin?: string | undefined;
  readonly securityCode?: string | undefined;
  readonly isProvisional?: boolean | undefined;
  readonly formType?: string | undefined;
  readonly demandScope?: string | undefined;
  readonly pft2TypeLabel?: string | undefined;
  readonly demandScopeLabel?: string | undefined;
  readonly paymentScope?: string | undefined;
  readonly isPartial?: boolean | undefined;
  readonly remainingBalance?: number | undefined;
  readonly headOfAccount: string;
  readonly district: string;
  readonly tehsil?: string | undefined;
  readonly locality?: string | undefined;
  readonly circleName?: string | undefined;
  readonly taxYear: string;
  readonly dueDate: string;
  readonly issueDate?: string | undefined;
  readonly qrPayload: string;
  readonly taxpayerInfo: {
    readonly taxNo: string;
    readonly provincialUin?: string | undefined;
    readonly classification: string;
    readonly categoryCode?: string | undefined;
    readonly statutoryRuleId?: string | undefined;
    readonly subclassificationCode: string | null;
    readonly subclassificationLabel?: string | null | undefined;
    readonly statutoryTertiaryCode?: string | null;
    readonly categoryName: string;
    readonly tertiarySlab: string | null;
    readonly slabRatePkr: number;
    readonly rateBasis: string;
    readonly classificationFull: string;
    readonly statutoryClassificationFull: string;
    readonly legalName: string;
    readonly tradeName?: string | undefined;
    readonly address: string;
    readonly phone: string;
    readonly email: string;
  };
  readonly taxPayable: {
    readonly currentTax: number;
    readonly arrears: number;
    readonly penalty: number;
    readonly totalPayable: number;
    readonly totalPayableWords: string;
    readonly isPartial?: boolean | undefined;
    readonly remainingBalance?: number | undefined;
  };
  readonly assessmentInfo: {
    readonly demandNo: string;
    readonly circleNo: string;
    readonly circleName: string;
    readonly tehsil?: string | undefined;
    readonly locality?: string | undefined;
    readonly etoName: string;
    readonly etoTitle: string;
  };
  readonly bankUse: {
    readonly challanSerial: string;
    readonly bankName: string;
    readonly branchName: string;
  };
}

export interface FormPFT2Model {
  readonly isApproved: boolean;
  readonly displayAmount: number;
  readonly challanNumber: string;
  readonly noticeNumber: string;
  readonly pin: string;
  readonly securityCode?: string | undefined;
  readonly isProvisional?: boolean | undefined;
  readonly issueDate?: string | undefined;
  readonly dueDate?: string | undefined;
  challanStatus?: string | undefined;
  readonly formType?: string | undefined;
  readonly demandScope?: string | undefined;
  readonly pft2TypeLabel?: string | undefined;
  readonly demandScopeLabel?: string | undefined;
  readonly paymentScope?: string | undefined;
  readonly isPartial?: boolean | undefined;
  readonly remainingBalance?: number | undefined;
  readonly canonicalChallanText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly copies: readonly [FormPFT2CopyModel, FormPFT2CopyModel, FormPFT2CopyModel];
}

export interface FormPFT3RowModel {
  readonly sourceUnitId: string;
  readonly serialNumber: number;
  readonly permanentDemandNo: string;
  readonly provincialUin?: string | undefined;
  readonly assessmentNo: string;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifier: string;
  readonly scheduleEntry: string;
  readonly categoryName: string;
  readonly subclassificationCode: string | null;
  readonly subclassificationName?: string | null | undefined;
  readonly statutoryTertiaryCode?: string | null;
  readonly tertiarySlab: string | null;
  readonly slabRatePkr: number;
  readonly rateBasis: string;
  readonly assessedCurrentTax: number;
  readonly arrears: number;
  readonly totalDemand: number;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
  readonly assessmentStatus: string;
  readonly lastPaymentDate?: string | undefined;
}

export interface ShowCausePenaltyNoticeModel {
  readonly noticeNumber: string;
  readonly pin: string;
  readonly noticeDate: string;
  readonly demandNumber: string;
  readonly provincialUin?: string | undefined;
  readonly hearingDate: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly identifier: string;
  readonly scheduleEntry: string;
  readonly originalTaxAmount: number;
  readonly daysOverdue: number;
  readonly maximumPenaltyExposable: number;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalNoticeText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
}

export interface LandRevenueRecoveryCertificateModel {
  readonly certificateNumber: string;
  readonly pin: string;
  readonly issueDate: string;
  readonly collectorDesignation: string;
  readonly collectorDistrict: string;
  readonly demandNumber: string;
  readonly provincialUin?: string | undefined;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly identifier: string;
  readonly originalTaxAmount: number;
  readonly penaltyAmount: number;
  readonly totalArrearsRecoverable: number;
  readonly totalArrearsWords: string;
  readonly recoverySection: string;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalCertificateText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
}

export interface CircleDispatchRowModel {
  readonly serialNumber: number;
  readonly noticeNumber: string;
  readonly demandNumber: string;
  readonly dispatchDate: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly identifier: string;
  readonly address: string;
  readonly scheduleEntry: string;
  readonly categoryName: string;
  readonly assessedAmount: number;
  readonly dueDate: string;
  readonly serverName: string;
  readonly serviceStatus: "PENDING" | "SERVED" | "REFUSED" | "UNTRACEABLE";
  readonly servedAt?: string | undefined;
  readonly recipientName?: string | undefined;
}

export interface CircleDispatchRegisterModel {
  readonly registerTitle: string;
  readonly registerTitleUrdu: string;
  readonly circleName: string;
  readonly district: string;
  readonly financialYear: string;
  readonly dispatchDate: string;
  readonly totalNotices: number;
  readonly totalAssessedSum: number;
  readonly totalServed: number;
  readonly totalPending: number;
  readonly rows: readonly CircleDispatchRowModel[];
  readonly officialSha256: string;
}

export interface AppellateOrderModel {
  readonly orderNumber: string;
  readonly pin: string;
  readonly provincialUin?: string | undefined;
  readonly appealNumber: string;
  readonly courtTitle: string;
  readonly courtTitleUrdu: string;
  readonly filingDate: string;
  readonly hearingDate: string;
  readonly orderDate: string;
  readonly appellantName: string;
  readonly appellantTradeName?: string | undefined;
  readonly appellantIdentifier: string;
  readonly appellantAddress: string;
  readonly respondentTitle: string;
  readonly impugnedNoticeNumber: string;
  readonly demandNumber: string;
  readonly scheduleEntry: string;
  readonly originalTaxAmount: number;
  readonly groundOfAppeal: string;
  readonly undisputedTaxDeposited: number;
  readonly decisionType:
    "CONFIRM" | "REDUCE" | "ENHANCE" | "ANNUL" | "REMAND" | "PENALTY_REMISSION";
  readonly reliefAmount: number;
  readonly revisedTaxAmount: number;
  readonly findingsAndReasoning: string;
  readonly operativeOrderUrdu: string;
  readonly appellateAuthorityName: string;
  readonly appellateAuthorityDesignation: string;
  readonly canonicalOrderText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
}

export interface GenerateAppellateOrderInput {
  readonly appealNumber: string;
  readonly orderNumber?: string | undefined;
  readonly filingDate: string;
  readonly hearingDate?: string | undefined;
  readonly orderDate?: string | undefined;
  readonly unit: StoredUnit;
  readonly groundOfAppeal: string;
  readonly undisputedTaxDeposited: number;
  readonly decisionType:
    "CONFIRM" | "REDUCE" | "ENHANCE" | "ANNUL" | "REMAND" | "PENALTY_REMISSION";
  readonly reliefAmount: number;
  readonly revisedTaxAmount: number;
  readonly findingsAndReasoning: string;
  readonly appellateAuthorityName?: string | undefined;
}

/**
 * Converts integer currency amount to official English words (Pakistani Rupees).
 */
export function numberToWordsPkr(amount: number): string {
  if (amount <= 0) return "Zero Rupees Only";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety"
  ];

  function convertChunk(num: number): string {
    let chunkStr = "";
    if (num >= 100) {
      chunkStr += ones[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num >= 20) {
      chunkStr += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      chunkStr += ones[num] + " ";
    }
    return chunkStr.trim();
  }

  let result = "";
  let remainder = Math.floor(amount);

  if (remainder >= 10000000) {
    const crore = Math.floor(remainder / 10000000);
    result += convertChunk(crore) + " Crore ";
    remainder %= 10000000;
  }

  if (remainder >= 100000) {
    const lakh = Math.floor(remainder / 100000);
    result += convertChunk(lakh) + " Lakh ";
    remainder %= 100000;
  }

  if (remainder >= 1000) {
    const thousand = Math.floor(remainder / 1000);
    result += convertChunk(thousand) + " Thousand ";
    remainder %= 1000;
  }

  if (remainder > 0) {
    result += convertChunk(remainder);
  }

  return `${result.trim()} Rupees Only`;
}

export interface GenerateFormPFT1Options {
  readonly isTampered?: boolean | undefined;
  readonly tamperedAmount?: number | undefined;
  readonly noticeNumber?: string | undefined;
  readonly pin?: string | undefined;
  readonly dueDate?: string | undefined;
  readonly issueDate?: string | undefined;
}

/**
 * Generates Form P.F.T-1 (Notice of Tax Demand under Section 3 read with Rule 6).
 */
export function generateFormPFT1(
  unit: StoredUnit,
  optionsOrTampered: GenerateFormPFT1Options | boolean = false,
  legacyTamperedAmount = 100
): FormPFT1Model {
  const opts: GenerateFormPFT1Options =
    typeof optionsOrTampered === "boolean"
      ? { isTampered: optionsOrTampered, tamperedAmount: legacyTamperedAmount }
      : (optionsOrTampered ?? {});

  const latestAssessment = unit.assessments[0];
  const latestVersion = unit.assessmentVersions[0];
  const isApproved = latestAssessment?.status === "APPROVED";

  const taxAmount = opts.isTampered
    ? (opts.tamperedAmount ?? 100)
    : (latestVersion?.snapshot.taxAmount ?? 0);
  const taxAmountWords = numberToWordsPkr(taxAmount);
  const serial = unit.demandUnit?.permanentDemandNo
    ? unit.demandUnit.permanentDemandNo.replace(/[^0-9]/g, "").slice(-4)
    : unit.id.slice(-4);
  const noticeNumber =
    opts.noticeNumber || formatStandardDocNumber({ docCode: "PFT1", sequence: serial });
  const pin = opts.pin || generateDocumentPin(noticeNumber);
  const demandNumber = formatDemandNumber(unit.demandUnit?.permanentDemandNo);
  const taxNumber = `${unit.identifierType}: ${unit.identifierValue}`;
  const issueDate = opts.issueDate || "01/07/2026";
  const dueDate = opts.dueDate || "31/08/2026";

  const subclassificationCode = unit.statutoryRule.subclassification_code;
  const statutoryTertiaryCode = unit.statutoryRule.statutory_tertiary_code;
  const tertiarySlab = unit.statutoryRule.statutory_tertiary_classification ?? null;
  const slabRatePkr = unit.statutoryRule.annual_rate_pkr;
  const rateBasis = unit.statutoryRule.rate_basis;
  const scheduleEntry = getScheduleEntryLabel(unit.statutoryRule);

  const classificationParts = [
    scheduleEntry,
    unit.statutoryRule.category,
    unit.statutoryRule.subclassification_label
      ? `Subclass: ${unit.statutoryRule.subclassification_label}`
      : null,
    tertiarySlab ? `Tertiary: ${tertiarySlab}` : null,
    `(Statutory Rate: PKR ${slabRatePkr.toLocaleString()} ${rateBasis})`
  ].filter(Boolean);
  const statutoryClassificationFull = classificationParts.join(" — ");

  const districtName = unit.districtName || "Vehari";
  const circleName = unit.circleName || "Circle-I";
  const assessingAuthorityName = unit.assessmentVersions[0]?.approvedBy || "Assessing Authority";
  const assessingAuthorityTitle = `Excise & Taxation Officer / Assessing Authority, ${districtName}`;
  const serverName = unit.servedBy || "Authorized Service Officer";
  const serverRole = unit.servedBy
    ? "Process Server / Service Officer"
    : "Authorized Service Officer / Process Server";

  const canonicalNoticeText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    "EXCISE & TAXATION OFFICER (PUNJAB PROFESSIONS & TRADES TAX)",
    `DISTRICT ${districtName.toUpperCase()} - OFFICE OF THE ASSESSING AUTHORITY`,
    "FORM P.F.T-1: NOTICE OF TAX DEMAND",
    "(Section 03 of Punjab Finance Act 1977 read with rule 6 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Notice No: ${noticeNumber} | Security PIN: ${pin}`,
    `Demand No: ${demandNumber} | Date: ${issueDate} | Circle: ${circleName}`,
    `Tax No: ${taxNumber}`,
    `To: ${unit.legalName}`,
    `Address: ${unit.address}`,
    `Statutory Notice Text: According to Section 03 of Punjab Finance Act, 1977 you are liable to pay Tax on Professions, Trades, Employment or Callings amounting to Rs. ${taxAmount} (in words) ${taxAmountWords} under ${scheduleEntry} (${unit.statutoryRule.category}${unit.statutoryRule.subclassification_label ? ` — ${unit.statutoryRule.subclassification_label}` : ""}${tertiarySlab ? ` — Slab: ${tertiarySlab}` : ""}) for the year 2026-2027.`,
    "Directive: You are directed to make the payment in the National Bank of Pakistan or State Bank of Pakistan within one month of the service of this Notice through Payment Challan Form P.F.T-2 attached herewith and furnish a copy of paid Challan to the undersigned.",
    "Statutory Default Warning: In case of default, a penalty, not exceeding the amount of tax, shall be imposed and unpaid dues shall be recovered as arrears of Land Revenue.",
    `Assessing Authority: ${assessingAuthorityName}, ${assessingAuthorityTitle}`,
    `Service Receipt Counterfoil: Demand No: ${demandNumber} | Tax Payable: Rs. ${taxAmount} | Due Date: ${dueDate} | Class: ${scheduleEntry} [${tertiarySlab ?? unit.statutoryRule.category}]`
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalNoticeText);
  const qrPayload = `PTAS-PUNJAB:PFT-1:${demandNumber}:TAX=${taxAmount}:YEAR=2026-2027:DUE=${dueDate}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    isApproved,
    noticeNumber,
    pin,
    demandNumber,
    provincialUin: unit.provincialUin,
    taxNumber,
    issueDate,
    dueDate,
    circleName,
    districtName,
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    taxAmount,
    taxAmountWords,
    statutoryCategoryText: unit.statutoryRule.category,
    scheduleEntry,
    subclassificationCode,
    statutoryTertiaryCode,
    tertiarySlab,
    slabRatePkr,
    rateBasis,
    statutoryClassificationFull,
    financialYear: "2026-2027",
    assessingAuthorityName,
    assessingAuthorityTitle,
    canonicalNoticeText,
    officialSha256,
    qrPayload,
    serviceReceipt: {
      demandNumber,
      taxPayable: taxAmount,
      dueDate,
      assesseeName: unit.legalName,
      assesseeClass: `${scheduleEntry} - ${unit.statutoryRule.category}${tertiarySlab ? ` [Slab: ${tertiarySlab}]` : ""} | Rate: PKR ${slabRatePkr.toLocaleString()}`,
      taxNumber,
      serverName,
      serverRole
    }
  };
}

export interface GenerateFormPFT2Options {
  readonly customAmount?: number | undefined;
  readonly isPartial?: boolean | undefined;
  readonly remainingBalance?: number | undefined;
  readonly dueDate?: string | undefined;
  readonly issueDate?: string | undefined;
  readonly formType?: string | undefined;
  readonly demandScope?: string | undefined;
  readonly paymentScope?: string | undefined;
  readonly noticeNumber?: string | undefined;
  readonly pin?: string | undefined;
  readonly securityCode?: string | undefined;
  readonly isProvisional?: boolean | undefined;
  readonly challanStatus?: string | undefined;
  readonly isTampered?: boolean | undefined;
  readonly tamperedAmount?: number | undefined;
  readonly officer?: { readonly name?: string; readonly title?: string } | undefined;
}

/**
 * Generates the authentic 3-copy Form P.F.T-2 (Payment Challan under Section 3 read with Rule 9).
 */
export function generateFormPFT2(
  unit: StoredUnit,
  optionsOrTampered: GenerateFormPFT2Options | boolean = false,
  legacyTamperedAmount = 100
): FormPFT2Model {
  const opts: GenerateFormPFT2Options =
    typeof optionsOrTampered === "boolean"
      ? { isTampered: optionsOrTampered, tamperedAmount: legacyTamperedAmount }
      : (optionsOrTampered ?? {});

  const latestAssessment = unit.assessments[0];
  const latestVersion = unit.assessmentVersions[0];
  const isApproved = latestAssessment?.status === "APPROVED";

  const baseTax = latestVersion?.snapshot.taxAmount ?? 0;
  const arrears = unit.openingArrears ?? 0;
  let penalty = 0;
  for (const entry of unit.ledgerEntries) {
    if (entry.entryType === "PENALTY_DEMAND") {
      penalty += entry.amount;
    }
  }

  const isProvisional = Boolean(
    opts.isProvisional ||
    unit.provincialUin?.startsWith("Potential-") ||
    unit.pinNumber?.startsWith("Potential-") ||
    unit.demandUnit?.permanentDemandNo?.startsWith("POT-")
  );

  const isPartial = isProvisional ? false : (opts.isPartial ?? opts.paymentScope === "PARTIAL");
  const paymentScope = isProvisional
    ? "FULL"
    : (opts.paymentScope ?? (isPartial ? "PARTIAL" : "FULL"));
  const demandScope = isProvisional
    ? "CURRENT"
    : (opts.demandScope ?? (arrears > 0 ? "COMBINED" : "CURRENT"));
  const formType = opts.formType ?? "STD";

  const isArrearScope = demandScope === "ARREAR" || demandScope === "ARREARS";
  const isCombinedScope = demandScope === "COMBINED";

  const pft2TypeLabel = isProvisional
    ? "PROVISIONAL"
    : isArrearScope
      ? "ARREARS"
      : isCombinedScope
        ? "COMBINED (CURRENT + ARREARS)"
        : "CURRENT";

  const scopeCurrentTax = isArrearScope ? 0 : baseTax;
  const scopeArrears = isArrearScope ? arrears : isCombinedScope ? arrears : 0;
  const scopePenalty = isCombinedScope ? penalty : 0;

  const totalAssessed = isArrearScope
    ? arrears
    : isCombinedScope
      ? baseTax + arrears + penalty
      : baseTax;

  const totalPayable = opts.isTampered
    ? (opts.tamperedAmount ?? 100)
    : opts.customAmount !== undefined
      ? opts.customAmount
      : totalAssessed;

  const remainingBalance =
    opts.remainingBalance !== undefined
      ? opts.remainingBalance
      : isPartial
        ? Math.max(0, totalAssessed - totalPayable)
        : 0;

  const totalPayableWords = numberToWordsPkr(totalPayable);
  const challanSerial = unit.demandUnit?.permanentDemandNo
    ? unit.demandUnit.permanentDemandNo.replace(/[^0-9]/g, "").slice(-4)
    : unit.id.slice(-4);
  const challanNumber = formatStandardDocNumber({ docCode: "PFT2", sequence: challanSerial });
  const demandNo = formatDemandNumber(unit.demandUnit?.permanentDemandNo);
  const dueDate = opts.dueDate || "31/08/2026";
  const issueDate = opts.issueDate || "2026-07-01";
  const taxYear = "2026-2027";
  const district = unit.districtName || "Vehari";
  const circleName = cleanCircleName(unit.circleName || "Vehari Circle I");
  const tehsil =
    unit.locality?.toLowerCase().includes("burewala") ||
    circleName.toLowerCase().includes("burewala")
      ? "Burewala"
      : unit.locality?.toLowerCase().includes("mailsi") ||
          circleName.toLowerCase().includes("mailsi")
        ? "Mailsi"
        : "Vehari";
  const locality = unit.locality || "";
  const headOfAccount = "B01601 (Punjab Professional Tax)";

  const noticeNumber =
    opts.noticeNumber ||
    generatePft2NoticeNumber({
      demandNumber: demandNo,
      issueDate,
      formTypeCode: formType,
      demandScope,
      paymentScope,
      amount: totalPayable
    });

  const pin = opts.pin || generateDocumentPin(noticeNumber || challanNumber);
  const securityCode =
    opts.securityCode ||
    (opts.pin && /^\d{6}$/.test(opts.pin)
      ? opts.pin
      : generateDocumentPin(noticeNumber || challanNumber));

  const rawSubCode =
    unit.statutoryRule?.subclassification_code ||
    (unit as unknown as { subclassificationCode?: string }).subclassificationCode ||
    null;
  const categoryCode = unit.categoryCode || unit.statutoryRule?.category_code || "";
  const subclassificationCode = formatFullSubclassCode(
    rawSubCode,
    categoryCode,
    unit.statutoryRuleId || unit.statutoryRule?.rule_id,
    unit.statutoryTertiaryCode || unit.statutoryRule?.statutory_tertiary_code
  );
  const subclassificationLabel =
    unit.statutoryRule.subclassification_label ||
    unit.statutoryRule.subcategory ||
    (unit as unknown as { subclassificationName?: string }).subclassificationName ||
    null;
  const statutoryTertiaryCode =
    unit.statutoryRule.statutory_tertiary_code ||
    (unit as unknown as { statutoryTertiaryCode?: string }).statutoryTertiaryCode ||
    null;
  const categoryName =
    unit.statutoryRule.category || (unit as unknown as { category?: string }).category || "";
  const tertiarySlab =
    unit.statutoryRule.statutory_tertiary_classification ||
    (unit as unknown as { tertiarySlab?: string }).tertiarySlab ||
    null;
  const slabRatePkr = unit.statutoryRule.annual_rate_pkr;
  const rateBasis = unit.statutoryRule.rate_basis || "per annum";
  const scheduleEntry = getScheduleEntryLabel(unit.statutoryRule);

  const classificationParts = [
    scheduleEntry,
    categoryName,
    subclassificationLabel ? `Subclass: ${subclassificationLabel}` : null,
    tertiarySlab ? `Tertiary: ${tertiarySlab}` : null,
    `(PKR ${slabRatePkr.toLocaleString()} ${rateBasis})`
  ].filter(Boolean);
  const classificationFull = classificationParts.join(" — ");

  const canonicalChallanText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    `FORM P.F.T-2: PUNJAB PROFESSIONS & TRADES TAX PAYMENT CHALLAN [${pft2TypeLabel}]`,
    "(Section 3 of Punjab Finance Act 1977 read with rule 9 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Head of Account: ${headOfAccount}`,
    `Challan No: ${challanNumber} | Notice No: ${noticeNumber} | Security PIN: ${securityCode}`,
    `District: ${district} | Tehsil: ${tehsil} | Circle: ${circleName} | Locality: ${locality || "N/A"}`,
    `Tax Year: ${taxYear} | Due Date: ${dueDate}`,
    `Form Type: ${formType} | Scope: ${demandScope} (${pft2TypeLabel}) (${paymentScope})${isPartial ? ` | Remaining Balance: PKR ${remainingBalance}` : ""}`,
    `Taxpayer: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Address: ${unit.address}`,
    `Classification: ${classificationFull}`,
    `Detail of Tax: Current Tax: Rs. ${scopeCurrentTax} | Arrears: Rs. ${scopeArrears} | Penalty: Rs. ${scopePenalty} | Total Payable: Rs. ${totalPayable}`,
    `Amount in Words: ${totalPayableWords}`,
    `Assessment Information: Demand No: ${demandNo} | Circle: ${circleName}`,
    `Assessing Authority: ${opts?.officer?.name || "Excise & Taxation Officer (Assessing Authority)"}, Tehsil ${tehsil}`,
    "Authorized Treasury: National Bank of Pakistan (Main Branch Vehari)"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalChallanText);
  const qrPayload = `PTAS-PUNJAB:PFT-2:${challanNumber}:DEMAND=${demandNo}:AMOUNT=${totalPayable}:DUE=${dueDate}:SHA=${officialSha256.slice(0, 16)}:PIN=${securityCode}`;

  const sharedData = {
    noticeNumber,
    pin,
    securityCode,
    isProvisional,
    formType,
    demandScope,
    pft2TypeLabel,
    demandScopeLabel: pft2TypeLabel,
    paymentScope,
    isPartial,
    remainingBalance,
    headOfAccount,
    district,
    tehsil,
    locality,
    circleName,
    taxYear,
    dueDate,
    issueDate,
    qrPayload,
    taxpayerInfo: {
      taxNo: `${unit.identifierType}: ${unit.identifierValue}`,
      provincialUin: unit.provincialUin,
      classification: `${scheduleEntry} - ${categoryName}`,
      categoryCode,
      statutoryRuleId: unit.statutoryRuleId || unit.statutoryRule?.rule_id,
      subclassificationCode,
      subclassificationLabel,
      statutoryTertiaryCode,
      categoryName,
      tertiarySlab,
      slabRatePkr,
      rateBasis,
      classificationFull,
      statutoryClassificationFull: classificationFull,
      legalName: unit.legalName,
      tradeName: unit.tradeName,
      address: unit.address,
      phone: "067-3360000",
      email: "info@punjab-taxpayer.gov.pk"
    },
    taxPayable: {
      currentTax: scopeCurrentTax,
      arrears: scopeArrears,
      penalty: scopePenalty,
      totalPayable,
      totalPayableWords,
      isPartial,
      remainingBalance
    },
    assessmentInfo: {
      demandNo,
      circleNo: unit.circleId || "CIR-VHR-01",
      circleName,
      tehsil,
      locality,
      etoName: opts?.officer?.name || "Excise & Taxation Officer (Assessing Authority)",
      etoTitle: `Excise & Taxation Officer, Tehsil ${tehsil}`
    },
    bankUse: {
      challanSerial: challanNumber,
      bankName: "National Bank of Pakistan",
      branchName: `Main Branch, Club Road, ${district}`
    }
  };

  const copy1: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "TAXPAYER'S COPY",
    copyTitleUrdu: ""
  };

  const copy2: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "BANK'S COPY",
    copyTitleUrdu: ""
  };

  const copy3: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "DEPARTMENT'S COPY",
    copyTitleUrdu: ""
  };

  return {
    isApproved,
    challanStatus: opts.challanStatus ?? (isApproved ? "ISSUED" : undefined),
    displayAmount: totalPayable,
    challanNumber,
    noticeNumber,
    pin,
    securityCode,
    isProvisional,
    issueDate,
    dueDate,
    formType,
    demandScope,
    pft2TypeLabel,
    demandScopeLabel: pft2TypeLabel,
    paymentScope,
    isPartial,
    remainingBalance,
    canonicalChallanText,
    officialSha256,
    qrPayload,
    copies: [copy1, copy2, copy3]
  };
}

/**
 * Generates the official Notice to Show Cause for Imposition of Penalty
 * under Section 3(4) of the Punjab Finance Act, 1977 read with Rule 10 of
 * the Punjab Professions and Trades Tax Rules, 1977.
 */
export function generateShowCausePenaltyNotice(
  unit: StoredUnit,
  customDaysOverdue?: number
): ShowCausePenaltyNoticeModel {
  const latestVersion = unit.assessmentVersions[0];
  const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
  const demandNo = formatDemandNumber(unit.demandUnit.permanentDemandNo);
  const noticeNumber = formatStandardDocNumber({ docCode: "SCN", sequence: unit.id.slice(-4) });
  const pin = generateDocumentPin(noticeNumber);
  const noticeDate = new Date().toISOString().split("T")[0]!;

  const hearingDateObj = new Date();
  hearingDateObj.setDate(hearingDateObj.getDate() + 7);
  const hearingDate = hearingDateObj.toISOString().split("T")[0]!;

  const daysOverdue = customDaysOverdue ?? 35;
  const maximumPenaltyExposable = taxAmount; // Section 3(4) statutory ceiling: not exceeding amount of tax

  const entryLabel = getScheduleEntryLabel(unit.statutoryRule);

  const canonicalNoticeText = [
    "OFFICE OF THE EXCISE & TAXATION OFFICER / ASSESSING AUTHORITY, VEHARI",
    "NOTICE TO SHOW CAUSE FOR IMPOSITION OF PENALTY",
    "(Under Section 3(4) of the Punjab Finance Act, 1977 read with Rule 10 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Notice No: ${noticeNumber} | Security PIN: ${pin} | Date of Issue: ${noticeDate} | Demand Notice No: ${demandNo}`,
    `PIN: ${unit.provincialUin ?? "N/A"}`,
    `Assessee Legal Name: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Business Address: ${unit.address}`,
    `Classification: ${entryLabel} - ${unit.statutoryRule.category}`,
    `Assessed Tax Demand: PKR ${taxAmount} | Days Overdue: ${daysOverdue} days`,
    `Maximum Statutory Penalty Imposable: PKR ${maximumPenaltyExposable} (100% of assessed tax)`,
    `Hearing / Explanation Due Date: ${hearingDate} at 10:00 AM`,
    "Authority: Excise & Taxation Officer / Assessing Authority, Tehsil Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalNoticeText);
  const qrPayload = `PTAS-PUNJAB:SCN:${noticeNumber}:DEMAND=${demandNo}:AMOUNT=${maximumPenaltyExposable}:DUE=${hearingDate}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    noticeNumber,
    pin,
    noticeDate,
    demandNumber: demandNo,
    provincialUin: unit.provincialUin,
    hearingDate,
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    scheduleEntry: `${entryLabel} - ${unit.statutoryRule.category}`,
    originalTaxAmount: taxAmount,
    daysOverdue,
    maximumPenaltyExposable,
    assessingAuthorityName: "Assessing Authority",
    assessingAuthorityTitle: "Excise & Taxation Officer / Assessing Authority, Tehsil Vehari",
    canonicalNoticeText,
    officialSha256,
    qrPayload
  };
}

/**
 * Generates the official Certificate of Recovery as Arrears of Land Revenue
 * under Section 3(4) of the Punjab Finance Act 1977 read with Rule 12 of
 * the Punjab Professions and Trades Tax Rules, 1977 and Sections 80/81 of
 * the Punjab Land Revenue Act, 1967.
 */
export function generateLandRevenueRecoveryCertificate(
  unit: StoredUnit,
  customCollectorDesignation?: string
): LandRevenueRecoveryCertificateModel {
  const latestVersion = unit.assessmentVersions[0];
  const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
  let penalty = 0;
  for (const entry of unit.ledgerEntries) {
    if (entry.entryType === "PENALTY_DEMAND") {
      penalty += entry.amount;
    }
  }
  const totalArrearsRecoverable = taxAmount + penalty;
  const totalArrearsWords = numberToWordsPkr(totalArrearsRecoverable);
  const demandNo = formatDemandNumber(unit.demandUnit.permanentDemandNo);
  const certificateNumber = formatStandardDocNumber({
    docCode: "LRC",
    sequence: unit.id.slice(-4)
  });
  const pin = generateDocumentPin(certificateNumber);
  const issueDate = new Date().toISOString().split("T")[0]!;
  const collectorDesignation =
    customCollectorDesignation ?? "The Collector / Tehsildar (Recovery), District Vehari";
  const entryLabel = getScheduleEntryLabel(unit.statutoryRule);

  const canonicalCertificateText = [
    "OFFICE OF THE EXCISE & TAXATION OFFICER / ASSESSING AUTHORITY, VEHARI",
    "CERTIFICATE OF RECOVERY AS ARREARS OF LAND REVENUE",
    "(Under Rule 12 of Punjab Professions & Trades Tax Rules, 1977 read with Sections 80 & 81 of the Punjab Land Revenue Act, 1967)",
    `Certificate No: ${certificateNumber} | Security PIN: ${pin} | Issue Date: ${issueDate}`,
    `PIN: ${unit.provincialUin ?? "N/A"}`,
    `To: ${collectorDesignation}`,
    `Defaulter Assessee: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Commercial Address: ${unit.address}`,
    `Classification: ${entryLabel} (${unit.statutoryRule.category})`,
    `Demand Reference No: ${demandNo}`,
    `Assessed Tax Arrears: PKR ${taxAmount}`,
    `Penalty Arrears (Sec 3(4)): PKR ${penalty}`,
    `Total Arrears Recoverable: PKR ${totalArrearsRecoverable} (${totalArrearsWords})`,
    "Requisition: You are hereby requested to recover the said sum of arrears from the defaulter assessee as arrears of land revenue under Section 80 and Section 81 of the Punjab Land Revenue Act, 1967 (Act XVII of 1967) and credit the same under provincial Head of Account B01601.",
    "Authority: Excise & Taxation Officer / Assessing Authority, Tehsil Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalCertificateText);
  const qrPayload = `PTAS-PUNJAB:LRC:${certificateNumber}:DEMAND=${demandNo}:AMOUNT=${totalArrearsRecoverable}:DUE=${issueDate}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    certificateNumber,
    pin,
    issueDate,
    collectorDesignation,
    collectorDistrict: "Vehari",
    demandNumber: demandNo,
    provincialUin: unit.provincialUin,
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    originalTaxAmount: taxAmount,
    penaltyAmount: penalty,
    totalArrearsRecoverable,
    totalArrearsWords,
    recoverySection: "Sections 80 & 81 of the Punjab Land Revenue Act 1967 (Act XVII of 1967)",
    assessingAuthorityName: "Assessing Authority",
    assessingAuthorityTitle: "Excise & Taxation Officer / Assessing Authority, Vehari",
    canonicalCertificateText,
    officialSha256,
    qrPayload
  };
}

export interface UnitFinancialSummary {
  readonly assessedCurrentTax: number;
  readonly arrears: number;
  readonly penalties: number;
  readonly totalDemand: number;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
  readonly lastPaymentDate?: string | undefined;
}

export function computeUnitFinancialSummary(unit: StoredUnit): UnitFinancialSummary {
  const latestVersion = unit.assessmentVersions[0];
  const assessedCurrentTax = latestVersion?.snapshot.taxAmount ?? 0;
  const arrears = unit.openingArrears ?? 0;

  let penalties = 0;
  let totalPaid = 0;
  let lastPaymentDate: string | undefined = undefined;
  let hasAssessmentDemandInLedger = false;

  for (const entry of unit.ledgerEntries) {
    if (entry.entryType === "PENALTY_DEMAND") {
      penalties += entry.amount;
    } else if (entry.entryType === "ASSESSMENT_DEMAND") {
      hasAssessmentDemandInLedger = true;
    } else if (entry.entryType === "PAYMENT_CREDIT" || entry.amount < 0) {
      totalPaid += Math.abs(entry.amount);
      const entryDate = entry.postedAt.split("T")[0];
      if (!lastPaymentDate || (entryDate && entryDate > lastPaymentDate)) {
        lastPaymentDate = entryDate;
      }
    }
  }

  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const totalDemand = round2(assessedCurrentTax + arrears + penalties);
  const ledgerBalance = computeLedgerBalance(unit.ledgerEntries);

  // If ledger has already recorded the ASSESSMENT_DEMAND (e.g. seeded pilot units),
  // ledgerBalance already includes assessedCurrentTax.
  // Otherwise, we consolidate: assessedCurrentTax + arrears + ledgerBalance (which contains payments/penalties/adjustments).
  const rawBalance = hasAssessmentDemandInLedger
    ? ledgerBalance + arrears
    : assessedCurrentTax + arrears + ledgerBalance;

  const outstandingBalance = round2(rawBalance);

  return {
    assessedCurrentTax,
    arrears,
    penalties,
    totalDemand,
    totalPaid,
    outstandingBalance,
    lastPaymentDate
  };
}

export function computeUnitBalance(unit: StoredUnit): number {
  return computeUnitFinancialSummary(unit).outstandingBalance;
}

/**
 * Computes statutory defaulter aging with automatic reconciliation between
 * raw ledger entries and assessed unit liability.
 * Prevents unpaid units with missing ledger demand rows from falsely showing as "PAID".
 */
export function computeUnitDefaulterAging(
  unit: StoredUnit,
  dueDateIso: string = "2026-08-31",
  referenceDateIso?: string
): DefaulterAgingInfo {
  const fin = computeUnitFinancialSummary(unit);
  const hasAssessmentDemand = unit.ledgerEntries.some((e) => e.entryType === "ASSESSMENT_DEMAND");
  const fallbackDemand = hasAssessmentDemand ? 0 : fin.assessedCurrentTax + fin.arrears;

  const entriesToEvaluate: DemandLedgerEntry[] = hasAssessmentDemand
    ? [...unit.ledgerEntries]
    : [
        {
          id: `synth-demand-${unit.id}`,
          demandUnitId: unit.demandUnit?.permanentDemandNo ?? unit.id,
          financialYearId: "FY-2026-2027",
          entryType: "ASSESSMENT_DEMAND",
          amount: fallbackDemand,
          sourceType: "ASSESSMENT_DEMAND",
          sourceId: unit.id,
          idempotencyKey: `synth-${unit.id}`,
          correlationId: `corr-${unit.id}`,
          postedBy: "SYSTEM",
          postedAt: `${dueDateIso}T00:00:00Z`,
          metadata: {}
        },
        ...unit.ledgerEntries
      ];

  const aging = computeDefaulterAging(
    entriesToEvaluate,
    dueDateIso,
    referenceDateIso,
    Boolean(unit.isRecoveryCertified)
  );

  // Strict statutory verification: If outstanding balance is > 0, it can NEVER be classified as PAID!
  if (fin.outstandingBalance > 0 && aging.status === "PAID") {
    const refDate = referenceDateIso ? new Date(referenceDateIso) : new Date();
    const dueDate = new Date(dueDateIso);
    const diffTime = refDate.getTime() - dueDate.getTime();
    const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    let status: DefaulterAgingStatus = "CURRENT";
    if (unit.isRecoveryCertified) {
      status = "RECOVERY_CERTIFIED";
    } else if (fin.penalties > 0) {
      status = "PENALIZED";
    } else if (daysOverdue > 30) {
      status = "PENALTY_ELIGIBLE";
    } else if (daysOverdue > 0) {
      status = "OVERDUE_30_DAYS";
    }

    return {
      ...aging,
      originalDemand: fin.assessedCurrentTax + fin.arrears,
      penaltyDemand: fin.penalties,
      totalPaid: fin.totalPaid,
      remainingBalance: fin.outstandingBalance,
      daysOverdue,
      status
    };
  }

  return {
    ...aging,
    originalDemand: hasAssessmentDemand
      ? aging.originalDemand
      : fin.assessedCurrentTax + fin.arrears,
    penaltyDemand: Math.max(aging.penaltyDemand, fin.penalties),
    totalPaid: fin.totalPaid,
    remainingBalance: fin.outstandingBalance
  };
}

/**
 * Generates the statutory Form P.F.T-3 Assessment & Demand Register rows (Rule 11).
 */
export function generateFormPFT3Rows(units: readonly StoredUnit[]): readonly FormPFT3RowModel[] {
  return units.map((u, idx) => {
    const summary = computeUnitFinancialSummary(u);
    const latestAssessment = u.assessments[0];

    const rawSubCode = u.statutoryRule.subclassification_code || u.subclassificationCode;
    const subName =
      u.statutoryRule.subclassification_label ??
      u.statutoryRule.subcategory ??
      getSubclassLabel(
        rawSubCode,
        u.categoryCode || u.statutoryRule.category_code,
        u.statutoryRuleId
      );

    return {
      sourceUnitId: u.id,
      serialNumber: idx + 1,
      permanentDemandNo: u.demandUnit.permanentDemandNo || u.demandNumber || "Not assigned",
      provincialUin: u.pinNumber || u.provincialUin || undefined,
      assessmentNo: u.assessmentNumber || "Not assigned",
      legalName: u.legalName,
      tradeName: u.tradeName,
      identifier: `${u.identifierType}: ${u.identifierValue}`,
      scheduleEntry: getScheduleEntryLabel(u.statutoryRule),
      categoryName: u.statutoryRule.category,
      subclassificationCode: rawSubCode ?? null,
      subclassificationName: subName || null,
      statutoryTertiaryCode: u.statutoryRule.statutory_tertiary_code,
      tertiarySlab: u.statutoryRule.statutory_tertiary_classification ?? null,
      slabRatePkr: u.statutoryRule.annual_rate_pkr,
      rateBasis: u.statutoryRule.rate_basis,
      assessedCurrentTax: summary.assessedCurrentTax,
      arrears: summary.arrears,
      totalDemand: summary.totalDemand,
      totalPaid: summary.totalPaid,
      outstandingBalance: summary.outstandingBalance,
      assessmentStatus: latestAssessment?.status ?? "DRAFT",
      lastPaymentDate: summary.lastPaymentDate
    };
  });
}

/**
 * Generates the official Circle Notice Dispatch & Service Register
 * Maintained under Rule 6 of 1977 Rules for field tracking by Circle Inspector.
 */
export function generateCircleDispatchRegister(
  unitsOrDistrict: readonly StoredUnit[] | string,
  customDispatchDateOrCircle: string = "2026-07-02",
  maybeUnits?: readonly StoredUnit[],
  customDate?: string
): CircleDispatchRegisterModel {
  let units: readonly StoredUnit[];
  let customDispatchDate: string;

  if (Array.isArray(unitsOrDistrict)) {
    units = unitsOrDistrict;
    customDispatchDate = customDispatchDateOrCircle || "2026-07-02";
  } else if (Array.isArray(maybeUnits)) {
    units = maybeUnits;
    customDispatchDate = customDate || "2026-07-02";
  } else {
    units = [];
    customDispatchDate = "2026-07-02";
  }

  let totalAssessedSum = 0;
  let totalServed = 0;
  let totalPending = 0;

  const rows: CircleDispatchRowModel[] = units.map((u, idx) => {
    const latestVersion = u.assessmentVersions[0];
    const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
    totalAssessedSum += taxAmount;

    const status = u.serviceStatus ?? "PENDING";
    if (status === "SERVED") {
      totalServed++;
    } else {
      totalPending++;
    }

    return {
      serialNumber: idx + 1,
      noticeNumber: formatStandardDocNumber({ docCode: "PFT1", sequence: u.id.slice(-4) }),
      demandNumber: u.demandUnit.permanentDemandNo,
      dispatchDate: customDispatchDate,
      assesseeLegalName: u.legalName,
      assesseeTradeName: u.tradeName,
      identifier: `${u.identifierType}: ${u.identifierValue}`,
      address: u.address,
      scheduleEntry: getScheduleEntryLabel(u.statutoryRule),
      categoryName: u.statutoryRule.category,
      assessedAmount: taxAmount,
      dueDate: "31/08/2026",
      serverName: u.servedBy ?? "Muhammad Aslam, Tax Inspector",
      serviceStatus: status,
      servedAt: u.servedAt,
      recipientName: u.recipientName ?? (status === "SERVED" ? u.legalName : undefined)
    };
  });

  const canonicalRegisterText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    "CIRCLE DISPATCH & NOTICE SERVICE REGISTER",
    "(Maintained under Rule 6 of Punjab Professions and Trades Tax Rules, 1977)",
    `District: Vehari | Circle: Vehari Circle I (City / Commercial) | Financial Year: 2026-2027 | Dispatch Date: ${customDispatchDate}`,
    `Total Dispatched Notices: ${rows.length} | Gross Assessed Sum: PKR ${totalAssessedSum} | Total Served: ${totalServed} | Pending: ${totalPending}`,
    ...rows.map(
      (r) =>
        `#${r.serialNumber} | ${r.noticeNumber} | ${r.demandNumber} | ${r.assesseeLegalName} | PKR ${r.assessedAmount} | Status: ${r.serviceStatus}`
    )
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalRegisterText);

  return {
    registerTitle: "Circle Notice Dispatch & Service Register (Rule 6)",
    registerTitleUrdu: "Circle Dispatch & Notice Service Register (Rule 6)",
    circleName: "Vehari Circle I (City / Commercial)",
    district: "Vehari",
    financialYear: "2026-2027",
    dispatchDate: customDispatchDate,
    totalNotices: rows.length,
    totalAssessedSum,
    totalServed,
    totalPending,
    rows,
    officialSha256
  };
}

/**
 * Generates an official judicial Appellate Order document under Section 7 of
 * Punjab Finance Act, 1977 read with Rule 13 of the Punjab Professions and Trades Tax Rules, 1977.
 */
export function generateAppellateOrderDocument(
  input: GenerateAppellateOrderInput
): AppellateOrderModel {
  const { unit } = input;
  const orderNumber = input.orderNumber ?? `ETD/MLN/APP-ORD/2026/${unit.id.slice(-4)}`;
  const pin = generateDocumentPin(orderNumber);
  const hearingDate = input.hearingDate ?? "2026-08-05";
  const orderDate = input.orderDate ?? new Date().toISOString().split("T")[0] ?? "2026-08-05";
  const courtTitle =
    "IN THE COURT OF THE APPELLATE AUTHORITY / DIRECTOR EXCISE & TAXATION, MULTAN DIVISION";
  const courtTitleUrdu =
    "Court of the Appellate Authority / Director Excise & Taxation, Multan Division";

  let operativeUrdu = "";
  switch (input.decisionType) {
    case "CONFIRM":
      operativeUrdu = "The appeal is dismissed and the original assessment notice is upheld.";
      break;
    case "REDUCE":
      operativeUrdu = `The appeal is partially allowed and assessment is reduced from PKR ${unit.assessmentVersions[0]?.snapshot.taxAmount ?? 0} to PKR ${input.revisedTaxAmount}.`;
      break;
    case "ANNUL":
      operativeUrdu = "The appeal is allowed and the impugned assessment is annulled in toto.";
      break;
    case "REMAND":
      operativeUrdu =
        "The case is remanded to Excise & Taxation Officer Vehari for fresh inquiry and verification.";
      break;
    case "PENALTY_REMISSION":
      operativeUrdu = "The default penalty under Section 3(4) is remitted.";
      break;
    case "ENHANCE":
      operativeUrdu = `The assessment is enhanced to PKR ${input.revisedTaxAmount} following appellate inquiry.`;
      break;
  }

  const noticeNumber = `PFT-1/VEH/2026/${unit.id.slice(-4)}`;
  const demandNumber = formatDemandNumber(unit.demandUnit.permanentDemandNo);
  const originalTax = unit.assessmentVersions[0]?.snapshot.taxAmount ?? 0;

  const canonicalOrderText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    courtTitle,
    "ORDER PASSED UNDER SECTION 7 OF PUNJAB FINANCE ACT, 1977 READ WITH RULE 13 OF PUNJAB PROFESSIONS & TRADES TAX RULES, 1977",
    `Appeal No: ${input.appealNumber} | Order No: ${orderNumber} | Security PIN: ${pin} | Date of Order: ${orderDate}`,
    `PIN: ${unit.provincialUin ?? "N/A"}`,
    `Appellant: ${unit.legalName} (${unit.tradeName ?? unit.legalName}) | CNIC/Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Address: ${unit.address}`,
    "Respondent: Assessing Authority / Excise & Taxation Officer, Vehari",
    `Impugned Demand Notice: ${noticeNumber} | Permanent Demand No: ${demandNumber}`,
    `Original Assessed Amount: PKR ${originalTax} | Schedule Class: ${getScheduleEntryLabel(unit.statutoryRule)}`,
    `Ground of Appeal: ${input.groundOfAppeal}`,
    `Undisputed Tax Deposited: PKR ${input.undisputedTaxDeposited}`,
    `Decision: ${input.decisionType} | Relief Granted: PKR ${input.reliefAmount} | Revised Demand: PKR ${input.revisedTaxAmount}`,
    `Judicial Reasoning & Findings: ${input.findingsAndReasoning}`,
    `Appellate Authority: ${input.appellateAuthorityName || "Director Excise & Taxation, Multan Division"}`
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalOrderText);
  const qrPayload = `PTAS-PUNJAB:APP:${orderNumber}:DEMAND=${demandNumber}:DECISION=${input.decisionType}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    orderNumber,
    pin,
    provincialUin: unit.provincialUin,
    appealNumber: input.appealNumber,
    courtTitle,
    courtTitleUrdu,
    filingDate: input.filingDate,
    hearingDate,
    orderDate,
    appellantName: unit.legalName,
    appellantTradeName: unit.tradeName,
    appellantIdentifier: `${unit.identifierType}: ${unit.identifierValue}`,
    appellantAddress: unit.address,
    respondentTitle: "Assessing Authority / Excise & Taxation Officer, Vehari",
    impugnedNoticeNumber: noticeNumber,
    demandNumber,
    scheduleEntry: `${getScheduleEntryLabel(unit.statutoryRule)} (${unit.statutoryRule.category})`,
    originalTaxAmount: originalTax,
    groundOfAppeal: input.groundOfAppeal,
    undisputedTaxDeposited: input.undisputedTaxDeposited,
    decisionType: input.decisionType,
    reliefAmount: input.reliefAmount,
    revisedTaxAmount: input.revisedTaxAmount,
    findingsAndReasoning: input.findingsAndReasoning,
    operativeOrderUrdu: operativeUrdu,
    appellateAuthorityName:
      input.appellateAuthorityName || "Director Excise & Taxation / Appellate Authority",
    appellateAuthorityDesignation:
      "Director Excise & Taxation / Appellate Authority, Multan Division",
    canonicalOrderText,
    officialSha256,
    qrPayload
  };
}

/**
 * Model for Form P.F.T-5: Official Professional Tax Clearance Certificate
 * Governed by Rule 11 & Scope: Mandatory for tenders, license renewals, and company filings.
 */
export interface TaxClearanceCertificateModel {
  readonly isEligible: boolean;
  readonly ineligibilityReason?: string | undefined;
  readonly certificateNumber: string;
  readonly pin: string;
  readonly provincialUin?: string | undefined;
  readonly issueDate: string;
  readonly expiryDate: string;
  readonly financialYear: string;
  readonly district: string;
  readonly districtName?: string;
  readonly tehsil: string;
  readonly circle: string;
  readonly circleName?: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly identifierType: "CNIC" | "NTN";
  readonly identifierValue: string;
  readonly address: string;
  readonly businessAddress?: string;
  readonly demandNo: string;
  readonly categoryName: string;
  readonly subcategoryName?: string;
  readonly scheduleEntry: string;
  readonly annualTaxAssessed: number;
  readonly taxRatePkr?: number;
  readonly totalTaxPaid: number;
  readonly currentOutstandingBalance: number;
  readonly headOfAccount: string;
  readonly issuingOfficerName: string;
  readonly issuingOfficerTitle: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly canonicalCertificateText: string;
}

export function generateTaxClearanceCertificate(
  unit: StoredUnit,
  issuingOfficer: MockOfficer,
  financialYear: string = "2026-2027",
  refDate: string = "2026-08-20"
): TaxClearanceCertificateModel {
  const currentBalance = computeLedgerBalance(unit.ledgerEntries);
  const demandNo = formatDemandNumber(unit.demandUnit.permanentDemandNo);

  if (currentBalance > 0) {
    return {
      isEligible: false,
      ineligibilityReason: `Cannot issue Clearance Certificate: Unit has PKR ${currentBalance.toLocaleString()} outstanding arrears. Total balance must be zero.`,
      certificateNumber: "INELIGIBLE",
      pin: "",
      provincialUin: unit.provincialUin,
      issueDate: refDate,
      expiryDate: "2027-06-30",
      financialYear,
      district: "Vehari",
      districtName: "Vehari",
      tehsil: "Tehsil Vehari",
      circle: unit.circleName || "Vehari Circle I (City / Commercial)",
      circleName: unit.circleName || "Vehari Circle I (City / Commercial)",
      assesseeLegalName: unit.legalName,
      assesseeTradeName: unit.tradeName,
      identifierType: unit.identifierType,
      identifierValue: unit.identifierValue,
      address: unit.address,
      businessAddress: unit.address,
      demandNo,
      categoryName: unit.statutoryRule.category,
      subcategoryName: unit.statutoryRule.subcategory,
      scheduleEntry: getScheduleEntryLabel(unit.statutoryRule),
      annualTaxAssessed: unit.statutoryRule.annual_rate_pkr,
      taxRatePkr: unit.statutoryRule.annual_rate_pkr,
      totalTaxPaid: 0,
      currentOutstandingBalance: currentBalance,
      headOfAccount: "B01601 (Punjab Professional Tax)",
      issuingOfficerName: issuingOfficer.name,
      issuingOfficerTitle: issuingOfficer.title,
      officialSha256: "",
      qrPayload: "",
      canonicalCertificateText: ""
    };
  }

  const totalPaid = Math.abs(
    unit.ledgerEntries
      .filter((e) => e.entryType === "PAYMENT_CREDIT" || e.amount < 0)
      .reduce((sum, e) => sum + (e.amount < 0 ? e.amount : -e.amount), 0)
  );

  const cleanSuffix = unit.id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();
  const certNumber = formatStandardDocNumber({ docCode: "PFT5", sequence: cleanSuffix || "0001" });
  const pin = generateDocumentPin(certNumber);

  const canonicalCertificateText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE, TAXATION & NARCOTICS CONTROL DEPARTMENT",
    "OFFICE OF THE EXCISE & TAXATION OFFICER (ASSESSING AUTHORITY), TEHSIL VEHARI",
    "FORM P.F.T-5: CERTIFICATE OF PROFESSIONAL TAX CLEARANCE",
    `Certificate Number: ${certNumber} | Security PIN: ${pin}`,
    `PIN: ${unit.provincialUin ?? "N/A"}`,
    `Financial Year: ${financialYear}`,
    `Issue Date: ${refDate} | Expiry Date: 30-JUN-2027`,
    `Assessee Legal Name: ${unit.legalName}`,
    `Trade / Business Name: ${unit.tradeName ?? unit.legalName}`,
    `CNIC / Registration No: ${unit.identifierType}: ${unit.identifierValue}`,
    `Commercial Address: ${unit.address}`,
    `Second Schedule Classification: ${getScheduleEntryLabel(unit.statutoryRule)} (${unit.statutoryRule.category})`,
    `Statutory Head of Account: B01601 (Punjab Professional Tax)`,
    `Assessed Liability: PKR ${unit.statutoryRule.annual_rate_pkr}`,
    `Discharged Liability: PKR ${totalPaid}`,
    `Outstanding Arrears as of ${refDate}: NIL (PKR 0)`,
    `Statutory Certification: This is to certify that the business establishment / professional named above has fully discharged all Professional Tax liabilities assessed under Section 3 of the Punjab Finance Act, 1977 for the Financial Year 2026-2027. There are no outstanding arrears or penalties standing against this assessee in ${unit.circleName || "Vehari Circle I (City / Commercial)"} as on the date of issue.`,
    `Issuing Assessing Authority: Excise & Taxation Officer, Vehari`
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalCertificateText);
  const qrPayload = `PTAS-PUNJAB:PFT-5:${certNumber}:ID=${unit.identifierValue}:STATUS=NIL_ARREARS:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    isEligible: true,
    certificateNumber: certNumber,
    pin,
    provincialUin: unit.provincialUin,
    issueDate: refDate,
    expiryDate: "2027-06-30",
    financialYear,
    district: "Vehari",
    districtName: "Vehari",
    tehsil: "Tehsil Vehari",
    circle: unit.circleName || "Vehari Circle I (City / Commercial)",
    circleName: unit.circleName || "Vehari Circle I (City / Commercial)",
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    identifierType: unit.identifierType,
    identifierValue: unit.identifierValue,
    address: unit.address,
    businessAddress: unit.address,
    demandNo,
    categoryName: unit.statutoryRule.category,
    subcategoryName: unit.statutoryRule.subcategory,
    scheduleEntry: getScheduleEntryLabel(unit.statutoryRule),
    annualTaxAssessed: unit.statutoryRule.annual_rate_pkr,
    taxRatePkr: unit.statutoryRule.annual_rate_pkr,
    totalTaxPaid: totalPaid,
    currentOutstandingBalance: 0,
    headOfAccount: "B01601 (Punjab Professional Tax)",
    issuingOfficerName: "Assessing Authority",
    issuingOfficerTitle: "Excise & Taxation Officer (Assessing Authority)",
    officialSha256,
    qrPayload,
    canonicalCertificateText
  };
}

export interface DiscontinuanceOrderModel {
  readonly orderNumber: string;
  readonly pin: string;
  readonly orderDate: string;
  readonly noticeNumber: string;
  readonly unitName: string;
  readonly assesseeLegalName?: string;
  readonly tradeName?: string | undefined;
  readonly assesseeTradeName?: string | undefined;
  readonly identifier: string;
  readonly identifierValue?: string;
  readonly demandNo?: string;
  readonly provincialUin?: string | undefined;
  readonly address: string;
  readonly discontinuanceDate: string;
  readonly reason: string;
  readonly inspectorFindings: string;
  readonly etoDecision: "APPROVED" | "REJECTED";
  readonly etoReason: string;
  readonly issuingOfficerName: string;
  readonly etoName?: string;
  readonly etoTitle?: string;
  readonly canonicalOrderText: string;
  readonly officialSha256: string;
  readonly qrPayload?: string | undefined;
}

export function generateDiscontinuanceOrder(
  unit: StoredUnit,
  input: {
    readonly orderNumber: string;
    readonly orderDate: string;
    readonly noticeNumber: string;
    readonly discontinuanceDate: string;
    readonly reason: string;
    readonly inspectorFindings: string;
    readonly etoDecision: "APPROVED" | "REJECTED";
    readonly etoReason: string;
  }
): DiscontinuanceOrderModel {
  const pin = generateDocumentPin(input.orderNumber);
  const demandClean = formatDemandNumber(unit.demandUnit.permanentDemandNo);
  const canonicalOrderText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT, TEHSIL VEHARI",
    "ORDER UNDER RULE 10 OF PUNJAB PROFESSIONS & TRADES TAX RULES, 1977 (BUSINESS DISCONTINUANCE)",
    `Order Number: ${input.orderNumber} | Security PIN: ${pin} | Order Date: ${input.orderDate}`,
    `PIN: ${unit.provincialUin ?? "N/A"} | Demand No: ${demandClean}`,
    `Notice Reference: ${input.noticeNumber}`,
    `Assessee: ${unit.legalName} (${unit.tradeName ?? unit.legalName}) | ${unit.identifierType}: ${unit.identifierValue}`,
    `Address: ${unit.address}`,
    `Cessation Date: ${input.discontinuanceDate}`,
    `Reason Stated: ${input.reason}`,
    `Inspector Inspection Findings: ${input.inspectorFindings}`,
    `Assessing Authority Decision: ${input.etoDecision}`,
    `Statutory Grounds: ${input.etoReason}`,
    "Assessing Authority: Excise & Taxation Officer, Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalOrderText);
  const qrPayload = `PTAS-PUNJAB:DSC:${input.orderNumber}:DEMAND=${demandClean}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    orderNumber: input.orderNumber,
    pin,
    provincialUin: unit.provincialUin,
    orderDate: input.orderDate,
    noticeNumber: input.noticeNumber,
    unitName: unit.legalName,
    assesseeLegalName: unit.legalName,
    tradeName: unit.tradeName,
    assesseeTradeName: unit.tradeName,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    identifierValue: unit.identifierValue,
    demandNo: demandClean,
    address: unit.address,
    discontinuanceDate: input.discontinuanceDate,
    reason: input.reason,
    inspectorFindings: input.inspectorFindings,
    etoDecision: input.etoDecision,
    etoReason: input.etoReason,
    issuingOfficerName: "Excise & Taxation Officer",
    etoName: "Assessing Authority",
    etoTitle: "Excise & Taxation Officer",
    canonicalOrderText,
    officialSha256,
    qrPayload
  };
}

export interface RefundAdjustmentOrderModel {
  readonly orderNumber: string;
  readonly pin: string;
  readonly orderDate: string;
  readonly applicationNumber: string;
  readonly unitName: string;
  readonly assesseeLegalName?: string;
  readonly tradeName?: string | undefined;
  readonly assesseeTradeName?: string | undefined;
  readonly identifier: string;
  readonly identifierValue?: string;
  readonly demandNo?: string;
  readonly provincialUin?: string | undefined;
  readonly address: string;
  readonly type: "CREDIT_ADJUSTMENT" | "REFUND";
  readonly reliefType?: string;
  readonly amount: number;
  readonly claimedAmount?: number;
  readonly amountWords: string;
  readonly grounds: string;
  readonly evidenceRef: string;
  readonly headOfAccount: string;
  readonly approvingOfficerName: string;
  readonly etoName?: string;
  readonly etoTitle?: string;
  readonly canonicalOrderText: string;
  readonly officialSha256: string;
  readonly qrPayload?: string | undefined;
}

export function generateRefundAdjustmentOrder(
  unit: StoredUnit,
  input: {
    readonly orderNumber: string;
    readonly orderDate: string;
    readonly applicationNumber: string;
    readonly type: "CREDIT_ADJUSTMENT" | "REFUND";
    readonly amount: number;
    readonly grounds: string;
    readonly evidenceRef: string;
  }
): RefundAdjustmentOrderModel {
  const pin = generateDocumentPin(input.orderNumber);
  const amountWords = numberToWordsPkr(input.amount);
  const demandClean = formatDemandNumber(unit.demandUnit.permanentDemandNo);
  const canonicalOrderText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT, TEHSIL VEHARI",
    "ORDER UNDER RULE 5 OF PUNJAB PROFESSIONS & TRADES TAX RULES, 1977 (STATUTORY REFUND / CREDIT ADJUSTMENT)",
    `Order Number: ${input.orderNumber} | Security PIN: ${pin} | Order Date: ${input.orderDate}`,
    `PIN: ${unit.provincialUin ?? "N/A"} | Demand No: ${demandClean}`,
    `Application Reference: ${input.applicationNumber}`,
    `Assessee: ${unit.legalName} (${unit.tradeName ?? unit.legalName}) | ${unit.identifierType}: ${unit.identifierValue}`,
    `Address: ${unit.address}`,
    `Adjustment Type: ${input.type}`,
    `Amount Authorized: PKR ${input.amount} (${amountWords})`,
    `Head of Account: B01601 (Punjab Professional Tax)`,
    `Stated Grounds: ${input.grounds}`,
    `Verified Evidence Reference: ${input.evidenceRef}`,
    "Approving Authority: Excise & Taxation Officer / Assessing Authority, Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalOrderText);
  const qrPayload = `PTAS-PUNJAB:RFD:${input.orderNumber}:DEMAND=${demandClean}:AMOUNT=${input.amount}:SHA=${officialSha256.slice(0, 16)}:PIN=${pin}`;

  return {
    orderNumber: input.orderNumber,
    pin,
    provincialUin: unit.provincialUin,
    orderDate: input.orderDate,
    applicationNumber: input.applicationNumber,
    unitName: unit.legalName,
    assesseeLegalName: unit.legalName,
    tradeName: unit.tradeName,
    assesseeTradeName: unit.tradeName,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    identifierValue: unit.identifierValue,
    demandNo: demandClean,
    address: unit.address,
    type: input.type,
    reliefType: input.type,
    amount: input.amount,
    claimedAmount: input.amount,
    amountWords,
    grounds: input.grounds,
    evidenceRef: input.evidenceRef,
    headOfAccount: "B01601",
    approvingOfficerName: "Excise & Taxation Officer",
    etoName: "Assessing Authority",
    etoTitle: "Excise & Taxation Officer",
    canonicalOrderText,
    officialSha256,
    qrPayload
  };
}

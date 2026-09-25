/**
 * PTAS Vehari Pilot In-Memory & LocalStorage Reactive Store
 * Governed by Second Schedule statutory rules, immutable assessment versions,
 * append-only demand ledger, and ePay Punjab reconciliation.
 */

import {
  type Assessment,
  type AssessmentVersion,
  type AuditActor,
  type DemandLedgerEntry,
  type DemandUnit,
  type StatutoryRuleDefinition,
  approveAssessmentVersion,
  createAssessment,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  getAllStatutoryRules,
  getStatutoryRuleById,
  submitAssessmentVersion,
  generateUinForUnit,
  generateDocumentPin,
  VEHARI_PILOT_JURISDICTION
} from "@ptas/domain";
import { formatStandardDocNumber, generatePft2NoticeNumber } from "./statutory-forms";

export type MockRole = "INSPECTOR" | "ETO" | "DIRECTOR" | "ADMIN";

export interface MockOfficer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: MockRole;
  readonly title: string;
  readonly jurisdictionId: string;
  readonly jurisdictionName: string;
  readonly jurisdictionTier: "REGION" | "DISTRICT" | "OFFICE" | "CIRCLE";
  readonly badgeText: string;
}

export interface StoredUnitSnapshot {
  taxAmount: number;
  statutoryCategory: string;
  legalBasis: string;
  ruleId: string;
  subclassificationCode: string | null;
  ruleCode?: string;
  statutoryTertiaryCode?: string | null;
  tertiaryDimensions?: Record<string, string>;
  rateSourceLevel?: "category" | "subclassification" | "statutory_tertiary";
  [key: string]: unknown;
}

export const VEHARI_LOCALITIES: readonly string[] = [
  "Vehari City Commercial Zone",
  "Club Road Commercial Area",
  "Grain Market (Galla Mandi)",
  "Karkhana Bazaar",
  "Chungi No. 9 Commercial Strip",
  "Burewala Commercial Hub",
  "Mailsi Main Bazaar",
  "Luddan Rural Market",
  "Thingi Sub-Tehsil Market",
  "Tibba Sultanpur Market",
  "Vehari Industrial Area"
];

export interface StoredUnit {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: "CNIC" | "NTN";
  readonly identifierValue: string;
  readonly address: string;
  /** Dedicated locality field separated from address for area-based operations & reporting */
  readonly locality?: string | undefined;
  readonly circleId: string;
  readonly categoryCode: string;
  readonly subclassificationCode?: string | null | undefined;
  readonly statutoryTertiaryCode?: string | null | undefined;
  readonly tertiaryDimensions?: Record<string, string> | undefined;
  readonly statutoryRuleId: string;
  readonly statutoryRule: StatutoryRuleDefinition;
  /** Lifecycle identifier 1: Survey Assessment Number (e.g. ASM-2026-0001) */
  readonly assessmentNumber: string;
  /** Lifecycle identifier 2: Permanent Demand Number (allocated strictly upon ETO approval) */
  readonly demandNumber?: string | undefined;
  /** Lifecycle identifier 3: Professional Identification Number (PIN) (allocated strictly upon ETO approval) */
  readonly pinNumber?: string | undefined;
  /** Province-wide Unique Identification Number (format: DDD-TTT-CC-SS-UU-RR-NNNNN-VV) */
  readonly provincialUin: string;
  readonly demandUnit: DemandUnit;
  readonly assessments: Assessment[];
  readonly assessmentVersions: AssessmentVersion<StoredUnitSnapshot>[];
  readonly ledgerEntries: DemandLedgerEntry[];
  readonly isRecoveryCertified?: boolean | undefined;
  readonly recoveryCertifiedAt?: string | undefined;
  readonly serviceStatus?: "PENDING" | "SERVED" | "REFUSED" | "UNTRACEABLE" | undefined;
  readonly servedAt?: string | undefined;
  readonly servedBy?: string | undefined;
  readonly recipientName?: string | undefined;
  readonly witnessDetails?: string | undefined;
  readonly isDiscontinued?: boolean | undefined;
  readonly discontinuanceStatus?:
    "ACTIVE" | "PENDING_INSPECTION" | "INSPECTED" | "DISCONTINUED" | undefined;
  readonly discontinuanceDate?: string | undefined;
  readonly discontinuanceReason?: string | undefined;
  readonly createdAt: string;
}

export interface PilotAuditItem {
  readonly id: string;
  readonly eventType: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly target: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly details: string;
}

export interface EpayReconciliationRecord {
  readonly transactionId: string;
  readonly psid: string;
  readonly unitName: string;
  readonly expectedAmount: number;
  readonly receivedAmount: number;
  readonly status: "MATCHED" | "MISMATCH_FLAGGED" | "DUPLICATE_REJECTED";
  readonly timestamp: string;
  readonly details: string;
}

export const MULTAN_REGION_ID = "00000000-0000-4000-8000-000000000001";
export const VEHARI_DISTRICT_ID = "00000000-0000-4000-8000-000000000002";
export const TEHSIL_VEHARI_ID = "00000000-0000-4000-8000-000000000003";
export const CIRCLE_VEHARI_ID = "00000000-0000-4000-8000-000000000004";
export const CIRCLE_VEHARI_2_ID = "00000000-0000-4000-8000-000000000005";
export const CIRCLE_BUREWALA_ID = "00000000-0000-4000-8000-000000000006";
export const CIRCLE_MAILSI_ID = "00000000-0000-4000-8000-000000000007";

export interface CircleMasterRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly districtId: string;
  readonly districtName: string;
  readonly tehsil: string;
  readonly description: string;
}

/**
 * Predefined permanent administrative Circles for District Vehari.
 * Protected administrative master data — fixed by Government of Punjab gazette notification.
 * Cannot be renamed, deleted, or altered through user account operations.
 */
export const DISTRICT_VEHARI_CIRCLES: readonly CircleMasterRecord[] = [
  {
    id: CIRCLE_VEHARI_ID,
    code: "CIR-VHR-01",
    name: "Vehari Circle I (City / Commercial)",
    districtId: VEHARI_DISTRICT_ID,
    districtName: "Vehari",
    tehsil: "Vehari",
    description: "Vehari City Commercial Zone, Club Road Commercial Area, Karkhana Bazaar"
  },
  {
    id: CIRCLE_VEHARI_2_ID,
    code: "CIR-VHR-02",
    name: "Vehari Circle II (Grain Market / Rural)",
    districtId: VEHARI_DISTRICT_ID,
    districtName: "Vehari",
    tehsil: "Vehari",
    description: "Grain Market (Galla Mandi), Chungi No. 9, Luddan, Thingi Sub-Tehsil"
  },
  {
    id: CIRCLE_BUREWALA_ID,
    code: "CIR-BWL-01",
    name: "Burewala Circle",
    districtId: VEHARI_DISTRICT_ID,
    districtName: "Vehari",
    tehsil: "Burewala",
    description: "Burewala Commercial Hub, Grain Market, Chichawatni Road"
  },
  {
    id: CIRCLE_MAILSI_ID,
    code: "CIR-MLS-01",
    name: "Mailsi Circle",
    districtId: VEHARI_DISTRICT_ID,
    districtName: "Vehari",
    tehsil: "Mailsi",
    description: "Mailsi Main Bazaar, Tibba Sultanpur, Colony Road"
  }
];

export const FINANCIAL_YEAR_2026_27 = "FY-2026-2027";

export const ADMIN_OFFICER: MockOfficer = {
  id: "a0000000-0000-4000-8000-000000000000",
  name: "Provincial Administrator",
  email: "admin.ptas@punjab.gov.pk",
  role: "ADMIN",
  title: "Provincial System Administrator",
  jurisdictionId: MULTAN_REGION_ID,
  jurisdictionName: "Punjab Provincial Apex (All Jurisdictions)",
  jurisdictionTier: "REGION",
  badgeText: "System Administrator (Full Statutory Powers: Director, ETO, Inspector)"
};

export const MOCK_OFFICERS: readonly [MockOfficer, MockOfficer, MockOfficer, MockOfficer] = [
  {
    id: "officer-inspector-aslam",
    name: "Muhammad Aslam",
    email: "inspector.vehari@punjab.gov.pk",
    role: "INSPECTOR",
    title: "Tax Inspector",
    jurisdictionId: CIRCLE_VEHARI_ID,
    jurisdictionName: "Circle-Vehari",
    jurisdictionTier: "CIRCLE",
    badgeText: "Inspector (Maker / Survey / Payments)"
  },
  {
    id: "officer-eto-mahmood",
    name: "Tariq Mahmood",
    email: "eto.vehari@punjab.gov.pk",
    role: "ETO",
    title: "Excise & Taxation Officer (Assessing Authority)",
    jurisdictionId: TEHSIL_VEHARI_ID,
    jurisdictionName: "Tehsil Vehari",
    jurisdictionTier: "OFFICE",
    badgeText: "Assessing Authority (Review / Approval / Form PFT-2)"
  },
  {
    id: "officer-director-nawaz",
    name: "Shahid Nawaz",
    email: "director.multan@punjab.gov.pk",
    role: "DIRECTOR",
    title: "Director",
    jurisdictionId: MULTAN_REGION_ID,
    jurisdictionName: "Multan Region (Division Oversight)",
    jurisdictionTier: "REGION",
    badgeText: "Executive (Division Analytics & Exception Desk)"
  },
  ADMIN_OFFICER
];

export interface AppealRecord {
  readonly id: string;
  readonly appealNumber: string;
  readonly unitId: string;
  readonly appellantName: string;
  readonly appellantTradeName?: string | undefined;
  readonly appellantCnic: string;
  readonly businessName: string;
  readonly businessAddress: string;
  readonly filingDate: string; // YYYY-MM-DD
  readonly limitationDays: number;
  readonly isWithinLimitation: boolean;
  readonly condonationRequested: boolean;
  readonly condonationReason?: string | undefined;
  readonly groundOfAppeal: string;
  readonly undisputedPaid: number;
  readonly status:
    | "FILED"
    | "HEARING_SCHEDULED"
    | "DECIDED_CONFIRMED"
    | "DECIDED_REDUCED"
    | "DECIDED_ANNULLED"
    | "DECIDED_REMANDED"
    | "DECIDED_PENALTY_REMITTED";
  readonly hearingDate?: string | undefined;
  readonly hearingNotes?: string | undefined;
  readonly decisionType?:
    "CONFIRM" | "REDUCE" | "ENHANCE" | "ANNUL" | "REMAND" | "PENALTY_REMISSION" | undefined;
  readonly orderNumber?: string | undefined;
  readonly orderDate?: string | undefined;
  readonly orderSummary?: string | undefined;
  readonly reliefAmount?: number | undefined;
  readonly revisedDemandAmount?: number | undefined;
  readonly sha256Hash?: string | undefined;
}

export interface DiscontinuanceRecord {
  readonly id: string;
  readonly noticeNumber: string;
  readonly unitId: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly cnicOrNtn: string;
  readonly discontinuanceDate: string; // YYYY-MM-DD
  readonly reason: string;
  readonly evidenceDetails: string;
  readonly status: "PENDING_INSPECTION" | "INSPECTED" | "APPROVED" | "REJECTED";
  readonly filedAt: string;
  readonly filedBy: string;
  readonly inspectorReport?: string | undefined;
  readonly inspectedAt?: string | undefined;
  readonly inspectedBy?: string | undefined;
  readonly etoOrderNumber?: string | undefined;
  readonly etoOrderDate?: string | undefined;
  readonly etoDecision?: "APPROVED" | "REJECTED" | undefined;
  readonly etoReason?: string | undefined;
  readonly adjudicatedBy?: string | undefined;
}

export interface FutureTaxAdjustmentRecord {
  readonly id: string;
  readonly applicationNumber: string;
  readonly unitId: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly cnicOrNtn: string;
  readonly type: "CREDIT_ADJUSTMENT";
  readonly amount: number;
  readonly originalPaymentAmount?: number | undefined;
  readonly excessAmount?: number | undefined;
  readonly adjustmentCreditBalance?: number | undefined;
  readonly amountAdjusted?: number | undefined;
  readonly remainingAdjustmentBalance?: number | undefined;
  readonly targetFutureFinancialYear?: string | undefined;
  readonly grounds: string;
  readonly evidenceReference: string;
  readonly status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  readonly filedAt: string;
  readonly filedBy: string;
  readonly orderNumber?: string | undefined;
  readonly orderDate?: string | undefined;
  readonly adjudicatedBy?: string | undefined;
  readonly rejectionReason?: string | undefined;
  readonly ledgerEntryId?: string | undefined;
}

export type RefundAdjustmentRecord = FutureTaxAdjustmentRecord;

export interface ClearanceCertificateRecord {
  readonly id: string;
  readonly certificateNumber: string;
  readonly unitId: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly cnicOrNtn: string;
  readonly categoryName: string;
  readonly scheduleEntry: string;
  readonly financialYear: string;
  readonly issueDate: string;
  readonly validUntil: string;
  readonly issuedByOfficerId: string;
  readonly issuedByOfficerName: string;
  readonly issuedByOfficerTitle: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly clearedAmountPkr: number;
  readonly pin?: string | undefined;
}

export type Pft2Status = "ISSUED" | "RECEIVED" | "CANCELLED";

export interface Pft2ChallanRecord {
  readonly id: string;
  readonly challanNumber: string;
  readonly demandNumber: string;
  readonly unitId: string;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: string;
  readonly identifierValue: string;
  readonly address: string;
  readonly subclassificationCode: string | null;
  readonly statutoryTertiaryCode?: string | null;
  readonly category: string;
  readonly tertiarySlab: string | null;
  readonly amountPayable: number;
  readonly noticeNumber?: string | undefined;
  readonly pin?: string | undefined;
  readonly formType?:
    | "STANDARD"
    | "NOTICE_CUM_CHALLAN"
    | "ARREARS_DEMAND"
    | "REVISED_ASSESSMENT"
    | string
    | undefined;
  readonly demandScope?: "CURRENT" | "ARREAR" | "COMBINED" | string | undefined;
  readonly paymentScope?: "FULL" | "PARTIAL" | string | undefined;
  readonly fullAssessedAmount?: number | undefined;
  readonly partialAmount?: number | undefined;
  readonly remainingBalance?: number | undefined;
  readonly provincialUin?: string | undefined;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly status: Pft2Status;
  readonly cancelledReason?: string | undefined;
  readonly cancelledAt?: string | undefined;
  readonly cancelledBy?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly receivedAt?: string | undefined;
  readonly receivedBy?: string | undefined;
  readonly bankScrollRef?: string | undefined;
  readonly paymentChannel?: string | undefined;
  readonly officialSha256: string;
  readonly qrPayload: string;
}

export interface StatutoryReceiptRecord {
  readonly id: string;
  readonly receiptNumber: string;
  readonly noticeNumber?: string | undefined;
  readonly pin?: string | undefined;
  readonly provincialUin?: string | undefined;
  readonly challanNumber: string;
  readonly demandNumber: string;
  readonly unitId: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly identifierType: string;
  readonly identifierValue: string;
  readonly address: string;
  readonly statutoryCategory: string;
  readonly subclassificationCode: string | null;
  readonly statutoryTertiaryCode?: string | null;
  readonly tertiarySlab: string | null;
  readonly amountPaidPkr: number;
  readonly amountPaidWords: string;
  readonly dateOfReceipt: string;
  readonly timeOfReceipt: string;
  readonly paymentChannel: string;
  readonly bankBranch?: string | undefined;
  readonly bankScrollRef: string;
  readonly receivingOfficerName: string;
  readonly receivingOfficerTitle: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
  readonly remarks?: string | undefined;
  // Consolidated Spec Section 11:
  readonly paymentSource: StatutoryReceiptSource;
  readonly issuedPft2Id?: string | undefined;
  readonly externalDocRef?: string | undefined;
}

export type StatutoryReceiptSource = "ISSUED_PFT2" | "MANUAL" | "EPAY";

export const RECEIPT_SOURCE_CONFIG: Record<
  StatutoryReceiptSource,
  { label: string; status: "Active" | "Disabled"; allowsManualAmount: boolean; badgeClass: string }
> = {
  ISSUED_PFT2: {
    label: "Received Against Issued Form PFT2",
    status: "Active",
    allowsManualAmount: false,
    badgeClass: "badge-approved"
  },
  MANUAL: {
    label: "Manual Receipt",
    status: "Active",
    allowsManualAmount: true,
    badgeClass: "badge-draft"
  },
  EPAY: {
    label: "e-Pay Against Form PFT2",
    status: "Disabled",
    allowsManualAmount: false,
    badgeClass: "badge-pending"
  }
};

export interface UserAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: MockRole;
  readonly title: string;
  readonly districtId: string;
  readonly districtName: string;
  readonly officeId: string;
  readonly officeName: string;
  readonly assignedCircleId: string;
  readonly assignedCircleName: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  readonly mobileNumber: string;
  readonly lastActiveAt?: string | undefined;
}

export interface UserManagementAuditRecord {
  readonly id: string;
  readonly performedBy: string;
  readonly performedByRole: MockRole;
  readonly targetUserId: string;
  readonly targetUserName: string;
  readonly actionType:
    | "PASSWORD_CHANGED"
    | "PROFILE_UPDATED"
    | "CIRCLE_REASSIGNED"
    | "STATUS_CHANGED"
    | "USER_CREATED";
  readonly oldValue: string;
  readonly newValue: string;
  readonly timestamp: string; // Pakistan Time UTC+05:00
}

/**
 * Returns current date formatted as YYYY-MM-DD in Pakistan Standard Time (PKT, UTC+05:00).
 */
export function getPakistanCurrentDate(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const pkt = new Date(utc + 5 * 3600000);
  return pkt.toISOString().split("T")[0]!;
}

/**
 * Returns current timestamp in Pakistan Standard Time (PKT, UTC+05:00).
 */
export function getPakistanCurrentTimestamp(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const pkt = new Date(utc + 5 * 3600000);
  return pkt.toISOString().replace("Z", "+05:00");
}

/**
 * Computes calendar month bounds for Form PFT-2 Due Date validation in Pakistan Time.
 * Section 8.2: Due date must remain within the current calendar month of issuance.
 */
export function getPakistanMonthBounds(dateStr?: string): {
  currentDate: string;
  minDueDate: string;
  maxDueDate: string;
} {
  const currentDate = dateStr || getPakistanCurrentDate();
  const parts = currentDate.split("-");
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const maxDueDate = `${parts[0]}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    currentDate,
    minDueDate: currentDate,
    maxDueDate
  };
}

export interface Pft2IssuanceValidationResult {
  readonly canIssue: boolean;
  readonly calculatedAmount: number;
  readonly error?: string | undefined;
  readonly issueDate: string;
  readonly dueDate: string;
}

/**
 * Authoritative financial validation for Form PFT-2 Challan issuance (Sections 8 & 9).
 * - Current-Year Demand: outstanding current-year demand only (if <= 0, rejects).
 * - Arrear Challan: outstanding arrear balance only (if <= 0, rejects).
 * - Combined Challan: current demand + arrear balance (negative arrear acts as adjustment). If net <= 0, rejects.
 * - Due date: strictly bounded within the current calendar month.
 */
export function validatePft2IssuanceAmount(params: {
  unit: StoredUnit;
  demandScope: "CURRENT" | "ARREAR" | "COMBINED" | string;
  requestedDueDate?: string;
}): Pft2IssuanceValidationResult {
  const { unit, demandScope, requestedDueDate } = params;
  const issueDate = getPakistanCurrentDate();
  const { minDueDate, maxDueDate } = getPakistanMonthBounds(issueDate);

  const dueDate = requestedDueDate || maxDueDate;
  if (dueDate < minDueDate || dueDate > maxDueDate) {
    return {
      canIssue: false,
      calculatedAmount: 0,
      issueDate,
      dueDate,
      error: `Due Date must belong to the current calendar month (${minDueDate} to ${maxDueDate}).`
    };
  }

  const currentAssessed = unit.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
  let currentPaid = 0;
  let arrearDemand = 0;
  let arrearPaid = 0;

  for (const entry of unit.ledgerEntries) {
    if (entry.financialYearId === FINANCIAL_YEAR_2026_27) {
      if (entry.entryType === "PAYMENT_CREDIT") {
        currentPaid += Math.abs(entry.amount);
      }
    } else {
      if (
        entry.entryType === "ASSESSMENT_DEMAND" ||
        entry.entryType === "PENALTY_DEMAND" ||
        entry.entryType === "REVISION_ADJUSTMENT"
      ) {
        arrearDemand += entry.amount;
      } else if (entry.entryType === "PAYMENT_CREDIT") {
        arrearPaid += Math.abs(entry.amount);
      }
    }
  }

  const currentOutstanding = Math.max(0, currentAssessed - currentPaid);
  const arrearBalance = arrearDemand - arrearPaid;

  if (demandScope === "CURRENT") {
    if (currentOutstanding <= 0) {
      return {
        canIssue: false,
        calculatedAmount: 0,
        issueDate,
        dueDate,
        error:
          "No Current-Year Demand Pending: There is no outstanding current-year amount available for challan issuance."
      };
    }
    return {
      canIssue: true,
      calculatedAmount: currentOutstanding,
      issueDate,
      dueDate
    };
  }

  if (demandScope === "ARREAR") {
    if (arrearBalance <= 0) {
      return {
        canIssue: false,
        calculatedAmount: 0,
        issueDate,
        dueDate,
        error:
          "No Arrear Pending: There is currently no outstanding arrear amount available for challan issuance."
      };
    }
    return {
      canIssue: true,
      calculatedAmount: arrearBalance,
      issueDate,
      dueDate
    };
  }

  // COMBINED
  const netPayable = currentOutstanding + arrearBalance;
  if (netPayable <= 0) {
    return {
      canIssue: false,
      calculatedAmount: 0,
      issueDate,
      dueDate,
      error:
        "No Amount Payable: After adjusting the applicable arrear balance against the current-year demand, there is no outstanding amount available for combined challan issuance."
    };
  }

  return {
    canIssue: true,
    calculatedAmount: netPayable,
    issueDate,
    dueDate
  };
}

export interface PilotState {
  currentOfficer: MockOfficer;
  units: StoredUnit[];
  auditLogs: PilotAuditItem[];
  reconciliations: EpayReconciliationRecord[];
  appeals: AppealRecord[];
  discontinuances?: DiscontinuanceRecord[] | undefined;
  refundAdjustments?: RefundAdjustmentRecord[] | undefined;
  clearanceCertificates?: ClearanceCertificateRecord[] | undefined;
  pft2Challans?: Pft2ChallanRecord[] | undefined;
  statutoryReceipts?: StatutoryReceiptRecord[] | undefined;
  users?: UserAccount[] | undefined;
  userAuditLogs?: UserManagementAuditRecord[] | undefined;
}

const STORAGE_KEY = "ptas_pilot_vehari_v3";

export function createInitialPilotUnits(): StoredUnit[] {
  const inspectorActor: AuditActor = {
    userId: MOCK_OFFICERS[0].id,
    roleCode: "INSPECTOR",
    jurisdictionId: CIRCLE_VEHARI_ID
  };

  const etoActor: AuditActor = {
    userId: MOCK_OFFICERS[1].id,
    roleCode: "ETO",
    jurisdictionId: TEHSIL_VEHARI_ID
  };

  const allRules = getAllStatutoryRules();
  const rule1 = getStatutoryRuleById("PFT-1.i")!; // Companies <= 5m: PKR 10,000
  const rule6x = getStatutoryRuleById("PFT-6.x")!; // Pesticide Dealer: PKR 2,000
  const rule3ib = getStatutoryRuleById("PFT-3.i.b")!; // Commercial 10+ emp, Others: PKR 4,000
  const rule10 = getStatutoryRuleById("PFT-10")!; // AC Food Establishment: PKR 5,000 (Category Direct Rate)

  // Unit 1: Vehari Cotton Ginners (Pvt.) Ltd. (Companies <= 5m -> PKR 10,000, fully paid via ePay)
  const unit1Id = "unit-vehari-cotton-01";
  const demandUnit1: DemandUnit = {
    id: "du-01",
    taxpayerId: unit1Id,
    permanentDemandNo: "0001",
    createdAt: "2026-07-01T09:00:00.000Z"
  };
  const { assessment: u1AsmInit, version: u1VerInit } = createAssessment<StoredUnitSnapshot>(
    {
      id: "asm-01",
      taxpayerId: unit1Id,
      financialYearId: FINANCIAL_YEAR_2026_27,
      snapshot: {
        taxAmount: 10000,
        statutoryCategory: rule1.category,
        legalBasis: rule1.official_text,
        ruleId: rule1.rule_id,
        ruleCode: rule1.rule_code,
        subclassificationCode: rule1.subclassification_code,
        statutoryTertiaryCode: rule1.statutory_tertiary_code,
        rateSourceLevel: rule1.rate_source_level,
        tertiaryDimensions: { entity_type: "private_limited", paid_up_capital_band: "up_to_5m" }
      }
    },
    inspectorActor,
    "2026-07-01T09:00:00.000Z"
  );
  const { assessment: u1AsmSub, version: u1VerSub } = submitAssessmentVersion(u1AsmInit, u1VerInit);
  const { assessment: u1AsmApp, version: u1VerApp } = approveAssessmentVersion(
    u1AsmSub,
    u1VerSub,
    etoActor,
    "EVD-APP-01",
    "2026-07-01T11:30:00.000Z"
  );
  const entryDemand1 = createInitialDemandEntry({
    demandUnitId: demandUnit1.id,
    financialYearId: FINANCIAL_YEAR_2026_27,
    assessmentVersionId: u1VerApp.id,
    amount: 10000,
    actorId: etoActor.userId,
    correlationId: "seed-c1",
    idempotencyKey: "seed-idem-d1",
    postedAt: "2026-07-01T11:30:00.000Z"
  });
  const entryPay1 = createPaymentReceiptEntry({
    demandUnitId: demandUnit1.id,
    financialYearId: FINANCIAL_YEAR_2026_27,
    amount: 10000,
    receiptNumber: "EPAY-PUNJAB-992144",
    paymentChannel: "EPAY_PUNJAB",
    actorId: etoActor.userId,
    correlationId: "seed-c1",
    idempotencyKey: "seed-idem-p1",
    depositDate: "2026-07-05",
    postedAt: "2026-07-05T14:22:00.000Z"
  });

  // Unit 2: Kisan Pesticides & Fertilizer Agency (Rule 6(x) -> PKR 2,000, Approved, Pending payment)
  const unit2Id = "unit-kisan-pesticides-02";
  const demandUnit2: DemandUnit = {
    id: "du-02",
    taxpayerId: unit2Id,
    permanentDemandNo: "0002",
    createdAt: "2026-07-02T10:00:00.000Z"
  };
  const { assessment: u2AsmInit, version: u2VerInit } = createAssessment<StoredUnitSnapshot>(
    {
      id: "asm-02",
      taxpayerId: unit2Id,
      financialYearId: FINANCIAL_YEAR_2026_27,
      snapshot: {
        taxAmount: 2000,
        statutoryCategory: rule6x.category,
        legalBasis: rule6x.official_text,
        ruleId: rule6x.rule_id,
        ruleCode: rule6x.rule_code,
        subclassificationCode: rule6x.subclassification_code,
        statutoryTertiaryCode: rule6x.statutory_tertiary_code,
        rateSourceLevel: rule6x.rate_source_level,
        tertiaryDimensions: { profession_type: "pesticide_dealer" }
      }
    },
    inspectorActor,
    "2026-07-02T10:00:00.000Z"
  );
  const { assessment: u2AsmSub, version: u2VerSub } = submitAssessmentVersion(u2AsmInit, u2VerInit);
  const { assessment: u2AsmApp, version: u2VerApp } = approveAssessmentVersion(
    u2AsmSub,
    u2VerSub,
    etoActor,
    "EVD-APP-02",
    "2026-07-02T12:00:00.000Z"
  );
  const entryDemand2 = createInitialDemandEntry({
    demandUnitId: demandUnit2.id,
    financialYearId: FINANCIAL_YEAR_2026_27,
    assessmentVersionId: u2VerApp.id,
    amount: 2000,
    actorId: etoActor.userId,
    correlationId: "seed-c2",
    idempotencyKey: "seed-idem-d2",
    postedAt: "2026-07-02T12:00:00.000Z"
  });

  // Unit 3: Al-Madina Commercial Center (Commercial Establishment, 10+ employees, Others -> Strictly PKR 4,000)
  // Status: SUBMITTED by Inspector, pending ETO review!
  const unit3Id = "unit-almadina-center-03";
  const demandUnit3: DemandUnit = {
    id: "du-03",
    taxpayerId: unit3Id,
    permanentDemandNo: "0003",
    createdAt: "2026-07-10T11:00:00.000Z"
  };
  const { assessment: u3AsmInit, version: u3VerInit } = createAssessment<StoredUnitSnapshot>(
    {
      id: "asm-03",
      taxpayerId: unit3Id,
      financialYearId: FINANCIAL_YEAR_2026_27,
      snapshot: {
        taxAmount: 4000,
        statutoryCategory: rule3ib.category,
        legalBasis: rule3ib.official_text,
        ruleId: rule3ib.rule_id,
        ruleCode: rule3ib.rule_code,
        subclassificationCode: rule3ib.subclassification_code,
        statutoryTertiaryCode: rule3ib.statutory_tertiary_code,
        rateSourceLevel: rule3ib.rate_source_level,
        tertiaryDimensions: { location_scope: "others", employee_band: "10_or_more" }
      }
    },
    inspectorActor,
    "2026-07-10T11:00:00.000Z"
  );
  const { assessment: u3AsmSub, version: u3VerSub } = submitAssessmentVersion(u3AsmInit, u3VerInit);

  // Unit 4: Chenab Sweets & Bakers (AC) (Class 10 -> PKR 5,000, Approved, Pending payment)
  // Direct Category Rate: subclassification_code is null!
  const unit4Id = "unit-chenab-sweets-04";
  const demandUnit4: DemandUnit = {
    id: "du-04",
    taxpayerId: unit4Id,
    permanentDemandNo: "0004",
    createdAt: "2026-07-12T14:00:00.000Z"
  };
  const { assessment: u4AsmInit, version: u4VerInit } = createAssessment<StoredUnitSnapshot>(
    {
      id: "asm-04",
      taxpayerId: unit4Id,
      financialYearId: FINANCIAL_YEAR_2026_27,
      snapshot: {
        taxAmount: 5000,
        statutoryCategory: rule10.category,
        legalBasis: rule10.official_text,
        ruleId: rule10.rule_id,
        ruleCode: rule10.rule_code,
        subclassificationCode: rule10.subclassification_code,
        statutoryTertiaryCode: rule10.statutory_tertiary_code,
        rateSourceLevel: rule10.rate_source_level,
        tertiaryDimensions: {
          air_conditioning_facility: "yes",
          food_establishment_type: "sweet_shop_bakery"
        }
      }
    },
    inspectorActor,
    "2026-07-12T14:00:00.000Z"
  );
  const { assessment: u4AsmSub, version: u4VerSub } = submitAssessmentVersion(u4AsmInit, u4VerInit);
  const { assessment: u4AsmApp, version: u4VerApp } = approveAssessmentVersion(
    u4AsmSub,
    u4VerSub,
    etoActor,
    "EVD-APP-04",
    "2026-07-12T15:00:00.000Z"
  );
  const entryDemand4 = createInitialDemandEntry({
    demandUnitId: demandUnit4.id,
    financialYearId: FINANCIAL_YEAR_2026_27,
    assessmentVersionId: u4VerApp.id,
    amount: 5000,
    actorId: etoActor.userId,
    correlationId: "seed-c4",
    idempotencyKey: "seed-idem-d4",
    postedAt: "2026-07-12T15:00:00.000Z"
  });

  return [
    {
      id: unit1Id,
      assessmentNumber: "ASM-2026-0001",
      demandNumber: "0001",
      pinNumber: "237-7704-V01",
      locality: "Club Road Commercial Area",
      legalName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      tradeName: "Vehari Ginning & Pressing Mills",
      identifierType: "NTN",
      identifierValue: "NTN-7412983-1",
      address: "Factory Area, Khanewal Road, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "1",
      subclassificationCode: rule1.subclassification_code,
      statutoryTertiaryCode: rule1.statutory_tertiary_code,
      tertiaryDimensions: { entity_type: "private_limited", paid_up_capital_band: "up_to_5m" },
      statutoryRuleId: rule1.rule_id,
      statutoryRule: rule1,
      provincialUin: generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule: rule1,
        allRules,
        sequenceNumber: 1
      }),
      demandUnit: demandUnit1,
      assessments: [u1AsmApp],
      assessmentVersions: [u1VerApp],
      ledgerEntries: [entryDemand1, entryPay1],
      serviceStatus: "SERVED",
      servedAt: "2026-07-03",
      servedBy: "Muhammad Aslam, Tax Inspector",
      recipientName: "Tariq Aziz, Director",
      createdAt: "2026-07-01T09:00:00.000Z"
    },
    {
      id: unit2Id,
      assessmentNumber: "ASM-2026-0002",
      demandNumber: "0002",
      pinNumber: "237-7704-V02",
      locality: "Grain Market (Galla Mandi)",
      legalName: "Muhammad Akram",
      tradeName: "Kisan Pesticides & Fertilizer Agency",
      identifierType: "CNIC",
      identifierValue: "36601-2948192-3",
      address: "Grain Market, Club Road, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "6",
      subclassificationCode: rule6x.subclassification_code,
      statutoryTertiaryCode: rule6x.statutory_tertiary_code,
      tertiaryDimensions: { profession_type: "pesticide_dealer" },
      statutoryRuleId: rule6x.rule_id,
      statutoryRule: rule6x,
      provincialUin: generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule: rule6x,
        allRules,
        sequenceNumber: 2
      }),
      demandUnit: demandUnit2,
      assessments: [u2AsmApp],
      assessmentVersions: [u2VerApp],
      ledgerEntries: [entryDemand2],
      serviceStatus: "SERVED",
      servedAt: "2026-07-04",
      servedBy: "Muhammad Aslam, Tax Inspector",
      recipientName: "Muhammad Akram, Proprietor",
      createdAt: "2026-07-02T10:00:00.000Z"
    },
    {
      id: unit3Id,
      assessmentNumber: "ASM-2026-0003",
      demandNumber: undefined,
      pinNumber: undefined,
      locality: "Karkhana Bazaar",
      legalName: "Al-Madina Commercial Center",
      tradeName: "Al-Madina Commercial Center",
      identifierType: "CNIC",
      identifierValue: "36601-8192847-1",
      address: "Karkhana Bazar, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "3",
      subclassificationCode: rule3ib.subclassification_code,
      statutoryTertiaryCode: rule3ib.statutory_tertiary_code,
      tertiaryDimensions: { location_scope: "others", employee_band: "10_or_more" },
      statutoryRuleId: rule3ib.rule_id,
      statutoryRule: rule3ib,
      provincialUin: generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule: rule3ib,
        allRules,
        sequenceNumber: 3
      }),
      demandUnit: demandUnit3,
      assessments: [u3AsmSub],
      assessmentVersions: [u3VerSub],
      ledgerEntries: [],
      serviceStatus: "PENDING",
      createdAt: "2026-07-10T11:00:00.000Z"
    },
    {
      id: unit4Id,
      assessmentNumber: "ASM-2026-0004",
      demandNumber: "0004",
      pinNumber: "237-7704-V04",
      locality: "Chungi No. 9 Commercial Strip",
      legalName: "Chenab Sweets & Bakers",
      tradeName: "Chenab Sweets & Bakers (AC Branch)",
      identifierType: "CNIC",
      identifierValue: "36601-4710293-7",
      address: "Luddan Road, Near DPO Chowk, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "10",
      subclassificationCode: null,
      statutoryTertiaryCode: null,
      tertiaryDimensions: {
        air_conditioning_facility: "yes",
        food_establishment_type: "sweet_shop_bakery"
      },
      statutoryRuleId: rule10.rule_id,
      statutoryRule: rule10,
      provincialUin: generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule: rule10,
        allRules,
        sequenceNumber: 4
      }),
      demandUnit: demandUnit4,
      assessments: [u4AsmApp],
      assessmentVersions: [u4VerApp],
      ledgerEntries: [entryDemand4],
      serviceStatus: "SERVED",
      servedAt: "2026-07-14",
      servedBy: "Muhammad Aslam, Tax Inspector",
      recipientName: "Chaudhry Riaz, Owner",
      createdAt: "2026-07-12T14:00:00.000Z"
    }
  ];
}

export function createInitialAuditLogs(): PilotAuditItem[] {
  return [
    {
      id: "audit-01",
      eventType: "TAX_UNIT_REGISTERED",
      actorName: "Muhammad Aslam",
      actorRole: "INSPECTOR",
      target: "Vehari Cotton Ginners (Pvt.) Ltd.",
      timestamp: "2026-07-01T09:00:00.000Z",
      correlationId: "seed-c1",
      details: "Registered under Second Schedule Rule 1(i) (Paid-up capital <= 5m) at PKR 10,000"
    },
    {
      id: "audit-02",
      eventType: "ASSESSMENT_APPROVED",
      actorName: "Tariq Mahmood",
      actorRole: "ETO",
      target: "Vehari Cotton Ginners (Pvt.) Ltd.",
      timestamp: "2026-07-01T11:30:00.000Z",
      correlationId: "seed-c1",
      details: "Statutory Approval granted for FY-2026-2027 demand of PKR 10,000"
    },
    {
      id: "audit-03",
      eventType: "PAYMENT_POSTED",
      actorName: "System (ePay Punjab)",
      actorRole: "SYSTEM",
      target: "Vehari Cotton Ginners (Pvt.) Ltd.",
      timestamp: "2026-07-05T14:22:00.000Z",
      correlationId: "seed-c1",
      details:
        "ePay Punjab settlement credited PKR 10,000 (PSID: EPAY-PUNJAB-992144); balance cleared to PKR 0"
    },
    {
      id: "audit-04",
      eventType: "TAX_UNIT_REGISTERED",
      actorName: "Muhammad Aslam",
      actorRole: "INSPECTOR",
      target: "Al-Madina Commercial Center",
      timestamp: "2026-07-10T11:00:00.000Z",
      correlationId: "seed-c3",
      details:
        "Surveyed & classified under Rule 3(i)(b) (10+ employees, Others) at statutory rate PKR 4,000; submitted to ETO"
    }
  ];
}

export function createInitialReconciliations(): EpayReconciliationRecord[] {
  return [
    {
      transactionId: "TXN-EPAY-001",
      psid: "EPAY-PUNJAB-992144",
      unitName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      expectedAmount: 10000,
      receivedAmount: 10000,
      status: "MATCHED",
      timestamp: "2026-07-05T14:22:00.000Z",
      details: "Exact amount match. Demand ledger credited automatically."
    }
  ];
}

export function createInitialAppeals(): AppealRecord[] {
  return [
    {
      id: "appeal-01",
      appealNumber: formatStandardDocNumber({ docCode: "APP", sequence: "00001" }),
      unitId: "unit-kisan-pesticides-02",
      appellantName: "Muhammad Akram",
      appellantTradeName: "Kisan Pesticides & Fertilizer Agency",
      appellantCnic: "36601-2948192-3",
      businessName: "Kisan Pesticides & Fertilizer Agency",
      businessAddress: "Grain Market, Club Road, Vehari",
      filingDate: "2026-07-20",
      limitationDays: 16,
      isWithinLimitation: true,
      condonationRequested: false,
      groundOfAppeal:
        "The appellant disputes classification under Class 6(x) (Pesticide Dealers) at PKR 2,000, claiming the business strictly retails seeds and urea without pesticide distribution.",
      undisputedPaid: 1000,
      status: "HEARING_SCHEDULED",
      hearingDate: "2026-08-05",
      hearingNotes:
        "Preliminary court scrutiny completed by Director Multan. Notice of hearing issued to appellant and assessing authority (ETO Vehari)."
    }
  ];
}

export function createInitialDiscontinuances(): DiscontinuanceRecord[] {
  return [
    {
      id: "disc-01",
      noticeNumber: formatStandardDocNumber({ docCode: "DSC", sequence: "00001" }),
      unitId: "unit-almadina-center-03",
      assesseeLegalName: "Muhammad Siddique",
      assesseeTradeName: "Al-Madina Commercial Center",
      cnicOrNtn: "36601-3829104-5",
      discontinuanceDate: "2026-07-31",
      reason:
        "Surrendered commercial shop lease agreement due to liquidation and relocation of stock.",
      evidenceDetails:
        "Notarized lease termination deed and municipal trade license cancellation receipt attached.",
      status: "INSPECTED",
      filedAt: "2026-08-05T10:00:00.000Z",
      filedBy: "officer-inspector-aslam",
      inspectorReport:
        "Physical inspection conducted on 2026-08-12 by Inspector Muhammad Aslam. Shop premises at Karkhana Bazar verified completely vacated. Shutter locked with 'To-Let' banner displayed. No commercial business active.",
      inspectedAt: "2026-08-12T11:30:00.000Z",
      inspectedBy: "officer-inspector-aslam"
    }
  ];
}

export function createInitialRefundAdjustments(): RefundAdjustmentRecord[] {
  return [
    {
      id: "ref-01",
      applicationNumber: formatStandardDocNumber({ docCode: "RFD", sequence: "00001" }),
      unitId: "unit-vehari-cotton-01",
      assesseeLegalName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      assesseeTradeName: "Vehari Ginning & Pressing Mills",
      cnicOrNtn: "NTN-7412983-1",
      type: "CREDIT_ADJUSTMENT",
      amount: 2000,
      originalPaymentAmount: 12000,
      excessAmount: 2000,
      adjustmentCreditBalance: 2000,
      amountAdjusted: 0,
      remainingAdjustmentBalance: 2000,
      targetFutureFinancialYear: "FY-2027-2028",
      grounds:
        "Taxpayer mistakenly paid PKR 12,000 under Challan 32-A against an assessment demand of PKR 10,000. Statutory credit adjustment applied under Rule 5 of 1977 Rules.",
      evidenceReference: "Challan 32-A Bank Deposit Scroll Ref: NBP-VHR-8849192",
      status: "APPROVED",
      filedAt: "2026-07-15T09:00:00.000Z",
      filedBy: "officer-inspector-aslam",
      orderNumber: "ETO/VEH/ADJ/2026/01",
      orderDate: "2026-07-18",
      adjudicatedBy: "officer-eto-mahmood",
      ledgerEntryId: "entry-adj-01"
    }
  ];
}

export function createInitialClearanceCertificates(): ClearanceCertificateRecord[] {
  const certificateNumber = formatStandardDocNumber({ docCode: "PFT5", sequence: "00001" });
  return [
    {
      id: "cert-01",
      certificateNumber,
      pin: generateDocumentPin(certificateNumber),
      unitId: "unit-vehari-cotton-01",
      assesseeLegalName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      assesseeTradeName: "Vehari Ginning & Pressing Mills",
      cnicOrNtn: "NTN-7412983-1",
      categoryName: "Companies (Paid-up capital up to Rs 5 million)",
      scheduleEntry: "1(i)",
      financialYear: FINANCIAL_YEAR_2026_27,
      issueDate: "2026-07-20",
      validUntil: "2027-06-30",
      issuedByOfficerId: "officer-eto-mahmood",
      issuedByOfficerName: "Tariq Mahmood",
      issuedByOfficerTitle: "Excise & Taxation Officer (Assessing Authority)",
      officialSha256: "3f9c6d48293e502bc14a7e91d5f2a1b384c2e6f7d0a9b8c7e6f5d4a3b2c1e0f9",
      qrPayload:
        "PTAS-PUNJAB:CERT=PFT-CC-VEH-2026-0001:CNIC=36601-1829384-5:STATUS=CLEARED:BAL=0:FY=2026-2027",
      clearedAmountPkr: 10000
    }
  ];
}

export function createInitialPft2Challans(units: StoredUnit[]): Pft2ChallanRecord[] {
  const challans: Pft2ChallanRecord[] = [];
  const issueDate = "2026-07-01";
  const dueDate = "2026-08-31";

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const demandNo =
      u.demandNumber || u.demandUnit?.permanentDemandNo || String(i + 1).padStart(4, "0");
    const serial = demandNo.replace(/[^0-9]/g, "").slice(-4) || String(i + 1).padStart(4, "0");
    const challanNumber = formatStandardDocNumber({ docCode: "PFT2", sequence: serial });
    const amountPayable = u.statutoryRule.annual_rate_pkr;
    const isPaid = u.id === "unit-vehari-cotton-01";
    const receiptNumber = isPaid
      ? formatStandardDocNumber({ docCode: "RCPT", sequence: "00001" })
      : undefined;
    const noticeNumber = generatePft2NoticeNumber({
      demandNumber: demandNo,
      issueDate,
      formTypeCode: "01",
      demandScope: "01",
      paymentScope: "01",
      amount: amountPayable
    });
    const pin = generateDocumentPin(noticeNumber);

    challans.push({
      id: `pft2-${u.id}`,
      challanNumber,
      noticeNumber,
      pin,
      demandNumber: u.demandUnit.permanentDemandNo,
      provincialUin: u.provincialUin,
      unitId: u.id,
      legalName: u.legalName,
      tradeName: u.tradeName,
      identifierType: u.identifierType,
      identifierValue: u.identifierValue,
      address: u.address,
      subclassificationCode: u.statutoryRule.subclassification_code,
      statutoryTertiaryCode: u.statutoryRule.statutory_tertiary_code,
      category: u.statutoryRule.category,
      tertiarySlab: u.statutoryRule.statutory_tertiary_classification ?? null,
      amountPayable,
      formType: "STANDARD",
      demandScope: "CURRENT",
      paymentScope: "FULL",
      fullAssessedAmount: amountPayable,
      remainingBalance: 0,
      issueDate,
      dueDate,
      status: isPaid ? "RECEIVED" : "ISSUED",
      receiptNumber,
      receivedAt: isPaid ? "2026-07-15" : undefined,
      receivedBy: isPaid ? "Muhammad Aslam (Tax Inspector)" : undefined,
      bankScrollRef: isPaid ? "ePay-PUNJAB-TXN-994182" : undefined,
      paymentChannel: isPaid ? "ePay Punjab (Digital Bank Transfer)" : undefined,
      officialSha256: `sha256-pft2-${serial}-${amountPayable}`,
      qrPayload: `https://ptas.punjab.gov.pk/verify?type=PFT-2&ref=${challanNumber}&pdn=${u.demandUnit.permanentDemandNo}&amt=${amountPayable}&pin=${pin}`
    });
  }

  // Add one cancelled challan to demonstrate complete lifecycle
  const cancelledNumber = formatStandardDocNumber({ docCode: "PFT2", sequence: "00099" });
  const cancelledNoticeNumber = "PFT2-0099-07-01-04-01-01-4000";
  const cancelledPin = generateDocumentPin(cancelledNoticeNumber);
  challans.push({
    id: "pft2-cancelled-demo",
    challanNumber: cancelledNumber,
    noticeNumber: cancelledNoticeNumber,
    pin: cancelledPin,
    demandNumber: "0099",
    unitId: "unit-demo-superseded",
    legalName: "Bismillah General Store (Vehari)",
    tradeName: "Bismillah Store",
    identifierType: "CNIC",
    identifierValue: "36601-9988776-1",
    address: "Circular Road, Vehari",
    subclassificationCode: "3(i)",
    statutoryTertiaryCode: "3(i)(b)",
    category: "Commercial Establishments",
    tertiarySlab: "Others",
    amountPayable: 4000,
    formType: "REVISED_ASSESSMENT",
    demandScope: "CURRENT",
    paymentScope: "FULL",
    fullAssessedAmount: 4000,
    remainingBalance: 0,
    issueDate: "2026-07-01",
    dueDate: "2026-08-31",
    status: "CANCELLED",
    cancelledReason: "Superseded by revised assessment under Rule 12 (employment re-verified)",
    cancelledAt: "2026-07-28",
    cancelledBy: "Tariq Mahmood (ETO)",
    officialSha256: "sha256-pft2-cancelled-00099",
    qrPayload: `https://ptas.punjab.gov.pk/verify?type=PFT-2&ref=${cancelledNumber}&pdn=0099&amt=4000&pin=${cancelledPin}`
  });

  return challans;
}

export function createInitialStatutoryReceipts(units: StoredUnit[]): StatutoryReceiptRecord[] {
  const cottonUnit = units.find((u) => u.id === "unit-vehari-cotton-01") ?? units[0];
  if (!cottonUnit) return [];
  const receiptNumber = formatStandardDocNumber({ docCode: "RCPT", sequence: "00001" });
  const challanNumber = formatStandardDocNumber({ docCode: "PFT2", sequence: "00001" });
  const demandNumber =
    cottonUnit.demandNumber || cottonUnit.demandUnit?.permanentDemandNo || "0001";
  return [
    {
      id: "rec-01",
      receiptNumber,
      challanNumber,
      demandNumber,
      unitId: cottonUnit.id,
      assesseeLegalName: cottonUnit.legalName,
      assesseeTradeName: cottonUnit.tradeName,
      identifierType: cottonUnit.identifierType,
      identifierValue: cottonUnit.identifierValue,
      address: cottonUnit.address,
      statutoryCategory: cottonUnit.statutoryRule.category,
      subclassificationCode: cottonUnit.statutoryRule.subclassification_code,
      statutoryTertiaryCode: cottonUnit.statutoryRule.statutory_tertiary_code,
      tertiarySlab: cottonUnit.statutoryRule.statutory_tertiary_classification ?? null,
      amountPaidPkr: 10000,
      amountPaidWords: "Ten Thousand Rupees Only",
      dateOfReceipt: "2026-07-15",
      timeOfReceipt: "11:24 AM",
      paymentChannel: "ePay Punjab (Digital Bank Transfer)",
      bankBranch: "State Bank / 1Link Portal",
      bankScrollRef: "ePay-PUNJAB-TXN-994182",
      receivingOfficerName: "Muhammad Aslam",
      receivingOfficerTitle: "Tax Inspector, Circle-Vehari",
      officialSha256: "8e3c1a9f02b4d6e8a1c3e5f7b9d2a4c6e8f0a2b4c6d8e0f2a4b6c8e0d2f4a6b8",
      qrPayload:
        "https://ptas.punjab.gov.pk/verify?type=PFT-REC&ref=PFT-REC-2026-0001&pdn=0001&amt=10000&sha=8e3c1a9f",
      remarks: "Full annual liability discharged via ePay Punjab electronic treasury gateway.",
      paymentSource: "ISSUED_PFT2",
      issuedPft2Id: "challan-vehari-01"
    }
  ];
}

export function createInitialUserAccounts(): UserAccount[] {
  return [
    {
      id: "usr-eto-01",
      name: "Tariq Mahmood",
      email: "eto.vehari@punjab.gov.pk",
      role: "ETO",
      title: "Excise & Taxation Officer (Assessing Authority)",
      districtId: VEHARI_DISTRICT_ID,
      districtName: "Vehari",
      officeId: TEHSIL_VEHARI_ID,
      officeName: "Tehsil Vehari",
      assignedCircleId: CIRCLE_VEHARI_ID,
      assignedCircleName: "Circle-Vehari",
      status: "ACTIVE",
      mobileNumber: "0300-1234567"
    },
    {
      id: "usr-insp-01",
      name: "Muhammad Aslam",
      email: "inspector.vehari@punjab.gov.pk",
      role: "INSPECTOR",
      title: "Tax Inspector",
      districtId: VEHARI_DISTRICT_ID,
      districtName: "Vehari",
      officeId: TEHSIL_VEHARI_ID,
      officeName: "Tehsil Vehari",
      assignedCircleId: CIRCLE_VEHARI_ID,
      assignedCircleName: "Circle-Vehari",
      status: "ACTIVE",
      mobileNumber: "0301-9876543"
    },
    {
      id: "usr-dir-01",
      name: "Shahid Nawaz",
      email: "director.multan@punjab.gov.pk",
      role: "DIRECTOR",
      title: "Director Excise & Taxation",
      districtId: VEHARI_DISTRICT_ID,
      districtName: "Vehari",
      officeId: TEHSIL_VEHARI_ID,
      officeName: "Division Multan",
      assignedCircleId: CIRCLE_VEHARI_ID,
      assignedCircleName: "All Circles (Division)",
      status: "ACTIVE",
      mobileNumber: "0302-5551234"
    }
  ];
}

export function createInitialUserAuditLogs(): UserManagementAuditRecord[] {
  return [
    {
      id: "usr-audit-01",
      performedBy: "Shahid Nawaz",
      performedByRole: "DIRECTOR",
      targetUserId: "usr-eto-01",
      targetUserName: "Tariq Mahmood",
      actionType: "CIRCLE_REASSIGNED",
      oldValue: "Unassigned",
      newValue: "Circle-Vehari (Tehsil Vehari)",
      timestamp: "2026-07-01 09:00:00+05:00"
    },
    {
      id: "usr-audit-02",
      performedBy: "Tariq Mahmood",
      performedByRole: "ETO",
      targetUserId: "usr-insp-01",
      targetUserName: "Muhammad Aslam",
      actionType: "CIRCLE_REASSIGNED",
      oldValue: "Circle-2",
      newValue: "Circle-Vehari",
      timestamp: "2026-07-01 10:15:00+05:00"
    }
  ];
}

export function loadPilotState(): PilotState {
  const initialUnits = createInitialPilotUnits();

  if (typeof window === "undefined") {
    return {
      currentOfficer: MOCK_OFFICERS[0],
      units: initialUnits,
      auditLogs: createInitialAuditLogs(),
      reconciliations: createInitialReconciliations(),
      appeals: createInitialAppeals(),
      discontinuances: createInitialDiscontinuances(),
      refundAdjustments: createInitialRefundAdjustments(),
      clearanceCertificates: createInitialClearanceCertificates(),
      pft2Challans: createInitialPft2Challans(initialUnits),
      statutoryReceipts: createInitialStatutoryReceipts(initialUnits),
      users: createInitialUserAccounts(),
      userAuditLogs: createInitialUserAuditLogs()
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: PilotState = {
        currentOfficer: MOCK_OFFICERS[0],
        units: initialUnits,
        auditLogs: createInitialAuditLogs(),
        reconciliations: createInitialReconciliations(),
        appeals: createInitialAppeals(),
        discontinuances: createInitialDiscontinuances(),
        refundAdjustments: createInitialRefundAdjustments(),
        clearanceCertificates: createInitialClearanceCertificates(),
        pft2Challans: createInitialPft2Challans(initialUnits),
        statutoryReceipts: createInitialStatutoryReceipts(initialUnits),
        users: createInitialUserAccounts(),
        userAuditLogs: createInitialUserAuditLogs()
      };
      savePilotState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as PilotState;
    const matchingOfficer =
      MOCK_OFFICERS.find(
        (o) =>
          o.id === parsed.currentOfficer?.id ||
          o.email.toLowerCase() === parsed.currentOfficer?.email?.toLowerCase()
      ) ??
      parsed.currentOfficer ??
      MOCK_OFFICERS[0];
    const rawUnits = parsed.units && parsed.units.length > 0 ? parsed.units : initialUnits;
    const safeUnits: StoredUnit[] = rawUnits.map((u, idx) => ({
      ...u,
      assessmentNumber: u.assessmentNumber || `ASM-2026-${String(idx + 1).padStart(4, "0")}`,
      demandNumber:
        u.demandNumber ??
        (u.demandUnit?.permanentDemandNo ? u.demandUnit.permanentDemandNo : undefined),
      pinNumber: u.pinNumber ?? (u.provincialUin ? u.provincialUin : undefined)
    }));
    return {
      ...parsed,
      units: safeUnits,
      appeals: parsed.appeals ?? createInitialAppeals(),
      discontinuances: parsed.discontinuances ?? createInitialDiscontinuances(),
      refundAdjustments: parsed.refundAdjustments ?? createInitialRefundAdjustments(),
      clearanceCertificates: parsed.clearanceCertificates ?? createInitialClearanceCertificates(),
      pft2Challans: parsed.pft2Challans ?? createInitialPft2Challans(safeUnits),
      statutoryReceipts: parsed.statutoryReceipts ?? createInitialStatutoryReceipts(safeUnits),
      users: parsed.users ?? createInitialUserAccounts(),
      userAuditLogs: parsed.userAuditLogs ?? createInitialUserAuditLogs(),
      currentOfficer: matchingOfficer
    };
  } catch {
    return {
      currentOfficer: MOCK_OFFICERS[0],
      units: initialUnits,
      auditLogs: createInitialAuditLogs(),
      reconciliations: createInitialReconciliations(),
      appeals: createInitialAppeals(),
      discontinuances: createInitialDiscontinuances(),
      refundAdjustments: createInitialRefundAdjustments(),
      clearanceCertificates: createInitialClearanceCertificates(),
      pft2Challans: createInitialPft2Challans(initialUnits),
      statutoryReceipts: createInitialStatutoryReceipts(initialUnits),
      users: createInitialUserAccounts(),
      userAuditLogs: createInitialUserAuditLogs()
    };
  }
}

export function savePilotState(state: PilotState): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to persist pilot state to localStorage", e);
    }
  }
}

export function resetPilotState(): PilotState {
  const initialUnits = createInitialPilotUnits();
  const cleanState: PilotState = {
    currentOfficer: MOCK_OFFICERS[0],
    units: initialUnits,
    auditLogs: createInitialAuditLogs(),
    reconciliations: createInitialReconciliations(),
    appeals: createInitialAppeals(),
    discontinuances: createInitialDiscontinuances(),
    refundAdjustments: createInitialRefundAdjustments(),
    clearanceCertificates: createInitialClearanceCertificates(),
    pft2Challans: createInitialPft2Challans(initialUnits),
    statutoryReceipts: createInitialStatutoryReceipts(initialUnits),
    users: createInitialUserAccounts(),
    userAuditLogs: createInitialUserAuditLogs()
  };
  savePilotState(cleanState);
  return cleanState;
}

export function setCurrentOfficerInStore(officer: MockOfficer): void {
  if (typeof window !== "undefined") {
    try {
      const state = loadPilotState();
      state.currentOfficer = officer;
      savePilotState(state);
    } catch (e) {
      console.error("Failed to update current officer in pilot state", e);
    }
  }
}

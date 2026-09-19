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
  getStatutoryRuleById,
  submitAssessmentVersion
} from "@ptas/domain";

export type MockRole = "INSPECTOR" | "ETO" | "DIRECTOR";

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
  subclassificationCode: string;
  [key: string]: unknown;
}

export interface StoredUnit {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: "CNIC" | "NTN";
  readonly identifierValue: string;
  readonly address: string;
  readonly circleId: string;
  readonly categoryCode: string;
  readonly statutoryRuleId: string;
  readonly statutoryRule: StatutoryRuleDefinition;
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

export const FINANCIAL_YEAR_2026_27 = "FY-2026-2027";

export const MOCK_OFFICERS: readonly [MockOfficer, MockOfficer, MockOfficer] = [
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
  }
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

export interface RefundAdjustmentRecord {
  readonly id: string;
  readonly applicationNumber: string;
  readonly unitId: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly cnicOrNtn: string;
  readonly type: "CREDIT_ADJUSTMENT" | "REFUND";
  readonly amount: number;
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
}

const STORAGE_KEY = "ptas_pilot_vehari_v2";

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

  const rule1 = getStatutoryRuleById("PFT-1.i")!; // Companies <= 5m: PKR 10,000
  const rule6x = getStatutoryRuleById("PFT-6.x")!; // Pesticide Dealer: PKR 2,000
  const rule3ib = getStatutoryRuleById("PFT-3.i.b")!; // Commercial 10+ emp, Others: PKR 4,000
  const rule10 = getStatutoryRuleById("PFT-10")!; // AC Food Establishment: PKR 5,000

  // Unit 1: Vehari Cotton Ginners (Pvt.) Ltd. (Companies <= 5m -> PKR 10,000, fully paid via ePay)
  const unit1Id = "unit-vehari-cotton-01";
  const demandUnit1: DemandUnit = {
    id: "du-01",
    taxpayerId: unit1Id,
    permanentDemandNo: "PDN-VEH-2026-0001",
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
        subclassificationCode: rule1.subclassification_code
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
    permanentDemandNo: "PDN-VEH-2026-0002",
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
        subclassificationCode: rule6x.subclassification_code
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
    permanentDemandNo: "PDN-VEH-2026-0003",
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
        subclassificationCode: rule3ib.subclassification_code
      }
    },
    inspectorActor,
    "2026-07-10T11:00:00.000Z"
  );
  const { assessment: u3AsmSub, version: u3VerSub } = submitAssessmentVersion(u3AsmInit, u3VerInit);

  // Unit 4: Chenab Sweets & Bakers (AC) (Entry 10 -> PKR 5,000, Approved, Pending payment)
  const unit4Id = "unit-chenab-sweets-04";
  const demandUnit4: DemandUnit = {
    id: "du-04",
    taxpayerId: unit4Id,
    permanentDemandNo: "PDN-VEH-2026-0004",
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
        subclassificationCode: rule10.subclassification_code
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
      legalName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      tradeName: "Vehari Ginning & Pressing Mills",
      identifierType: "NTN",
      identifierValue: "NTN-7412983-1",
      address: "Factory Area, Khanewal Road, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "1",
      statutoryRuleId: rule1.rule_id,
      statutoryRule: rule1,
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
      legalName: "Muhammad Akram",
      tradeName: "Kisan Pesticides & Fertilizer Agency",
      identifierType: "CNIC",
      identifierValue: "36601-2948192-3",
      address: "Grain Market, Club Road, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "6",
      statutoryRuleId: rule6x.rule_id,
      statutoryRule: rule6x,
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
      legalName: "Al-Madina Commercial Center",
      tradeName: "Al-Madina Commercial Center",
      identifierType: "CNIC",
      identifierValue: "36601-8192847-1",
      address: "Karkhana Bazar, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "3",
      statutoryRuleId: rule3ib.rule_id,
      statutoryRule: rule3ib,
      demandUnit: demandUnit3,
      assessments: [u3AsmSub],
      assessmentVersions: [u3VerSub],
      ledgerEntries: [],
      serviceStatus: "PENDING",
      createdAt: "2026-07-10T11:00:00.000Z"
    },
    {
      id: unit4Id,
      legalName: "Chenab Sweets & Bakers",
      tradeName: "Chenab Sweets & Bakers (AC Branch)",
      identifierType: "CNIC",
      identifierValue: "36601-4710293-7",
      address: "Luddan Road, Near DPO Chowk, Vehari",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: "10",
      statutoryRuleId: rule10.rule_id,
      statutoryRule: rule10,
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
      appealNumber: "ETD/MLN/APP/2026/001",
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
        "The appellant disputes classification under Entry 6(x) (Pesticide Dealers) at PKR 2,000, claiming the business strictly retails seeds and urea without pesticide distribution.",
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
      noticeNumber: "DISC-VEH-2026-001",
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
      applicationNumber: "REF-VEH-2026-001",
      unitId: "unit-vehari-cotton-01",
      assesseeLegalName: "Vehari Cotton Ginners (Pvt.) Ltd.",
      assesseeTradeName: "Vehari Ginning & Pressing Mills",
      cnicOrNtn: "NTN-7412983-1",
      type: "CREDIT_ADJUSTMENT",
      amount: 2000,
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
  return [
    {
      id: "cert-01",
      certificateNumber: "PFT-CC-VEH-2026-0001",
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

export function loadPilotState(): PilotState {
  if (typeof window === "undefined") {
    return {
      currentOfficer: MOCK_OFFICERS[0],
      units: createInitialPilotUnits(),
      auditLogs: createInitialAuditLogs(),
      reconciliations: createInitialReconciliations(),
      appeals: createInitialAppeals(),
      discontinuances: createInitialDiscontinuances(),
      refundAdjustments: createInitialRefundAdjustments(),
      clearanceCertificates: createInitialClearanceCertificates()
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: PilotState = {
        currentOfficer: MOCK_OFFICERS[0],
        units: createInitialPilotUnits(),
        auditLogs: createInitialAuditLogs(),
        reconciliations: createInitialReconciliations(),
        appeals: createInitialAppeals(),
        discontinuances: createInitialDiscontinuances(),
        refundAdjustments: createInitialRefundAdjustments(),
        clearanceCertificates: createInitialClearanceCertificates()
      };
      savePilotState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as PilotState;
    const matchingOfficer =
      MOCK_OFFICERS.find((o) => o.id === parsed.currentOfficer?.id) ?? MOCK_OFFICERS[0];
    return {
      ...parsed,
      appeals: parsed.appeals ?? createInitialAppeals(),
      discontinuances: parsed.discontinuances ?? createInitialDiscontinuances(),
      refundAdjustments: parsed.refundAdjustments ?? createInitialRefundAdjustments(),
      clearanceCertificates: parsed.clearanceCertificates ?? createInitialClearanceCertificates(),
      currentOfficer: matchingOfficer
    };
  } catch {
    return {
      currentOfficer: MOCK_OFFICERS[0],
      units: createInitialPilotUnits(),
      auditLogs: createInitialAuditLogs(),
      reconciliations: createInitialReconciliations(),
      appeals: createInitialAppeals(),
      discontinuances: createInitialDiscontinuances(),
      refundAdjustments: createInitialRefundAdjustments(),
      clearanceCertificates: createInitialClearanceCertificates()
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
  const cleanState: PilotState = {
    currentOfficer: MOCK_OFFICERS[0],
    units: createInitialPilotUnits(),
    auditLogs: createInitialAuditLogs(),
    reconciliations: createInitialReconciliations(),
    appeals: createInitialAppeals(),
    discontinuances: createInitialDiscontinuances(),
    refundAdjustments: createInitialRefundAdjustments(),
    clearanceCertificates: createInitialClearanceCertificates()
  };
  savePilotState(cleanState);
  return cleanState;
}

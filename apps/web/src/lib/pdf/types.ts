/**
 * Centralized Statutory Document & PDF Architecture Types for PTAS
 * Implements Punjab Finance Act 1977 and Punjab Professions & Trades Tax Rules 1977.
 *
 * Strict Architectural Rule:
 * The Web UI is NOT the PDF.
 * Database -> Server authorization & validation -> Structured document data -> Official PDF template -> PDF renderer -> Download
 */

import type { MockOfficer, MockRole, StoredUnit } from "../pilot-store";

export type OfficialDocumentType =
  | "FORM_PFT1_NOTICE"
  | "PFT1_DEMAND_NOTICE"
  | "FORM_PFT2_CHALLAN"
  | "PFT2_CHALLAN"
  | "FORM_PFT3_REGISTER"
  | "PFT3_ASSESSMENT_REGISTER"
  | "SHOW_CAUSE_NOTICE"
  | "STATUTORY_RECEIPT"
  | "EXECUTIVE_PFT2_BRIEF"
  | "STATUTORY_REPORT"
  | "STATUTORY_REPORTS"
  | "TAX_CLEARANCE_CERTIFICATE"
  | "LAND_REVENUE_RECOVERY"
  | "APPELLATE_ORDER"
  | "UNIT_DOSSIER";

export type StatutoryReportSchedule =
  | "PFT3_REGISTER"
  | "DEFAULTER_ROLL"
  | "NOTICE_DISPATCH"
  | "CLEARANCE_LOG"
  | "RELIEF_REGISTER"
  | "SLAB_DISTRIBUTION";

export interface DocumentGenerationOptions {
  readonly filename?: string | undefined;
  readonly isProvisional?: boolean | undefined;
  readonly watermark?: string | undefined;
  readonly officer?: MockOfficer | undefined;
}

export interface DocumentAuthorizationContext {
  readonly officerId?: string | undefined;
  readonly officerRole?: MockRole | undefined;
  readonly role?: string | undefined;
  readonly district?: string | undefined;
  readonly circle?: string | undefined;
  readonly jurisdictionId?: string | undefined;
  readonly jurisdictionTier?: "REGION" | "DISTRICT" | "OFFICE" | "CIRCLE" | undefined;
}

export interface DocumentLifecycleValidationResult {
  readonly isValid: boolean;
  readonly allowed?: boolean;
  readonly code:
    | "VALID"
    | "UNAPPROVED_ASSESSMENT"
    | "UNISSUED_CHALLAN"
    | "CANCELLED_CHALLAN"
    | "OUTSTANDING_BALANCE_EXISTS"
    | "UNAUTHORIZED_JURISDICTION"
    | "RECORD_NOT_FOUND";
  readonly message: string;
  readonly reason?: string;
}

export interface ExecutivePft2BriefData {
  readonly totalChallans: number;
  readonly totalAssessedSum: number;
  readonly totalReceivedSum: number;
  readonly totalOutstandingSum: number;
  readonly fullScopeCount: number;
  readonly partialScopeCount: number;
  readonly issuedCount: number;
  readonly receivedCount: number;
  readonly cancelledCount: number;
  readonly circleBreakdown: readonly {
    readonly circleName: string;
    readonly count: number;
    readonly totalAmount: number;
  }[];
  readonly categoryBreakdown: readonly {
    readonly categoryName: string;
    readonly count: number;
    readonly totalAmount: number;
  }[];
  readonly generatedAt: string;
  readonly officerName: string;
  readonly officerTitle: string;
  readonly officialSha256: string;
}

export interface UnitDossierData {
  readonly unit: StoredUnit;
  readonly generatedAt: string;
  readonly officerName: string;
  readonly officerTitle: string;
  readonly officialSha256: string;
}

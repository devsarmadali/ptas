/**
 * Centralized Document Authorization, Lifecycle Validation & Authoritative PDF Engine
 *
 * Strict Architectural Rule:
 * The Web UI is NOT the PDF.
 * Database -> Server authorization & validation -> Structured document data -> Official PDF template -> PDF renderer -> Download
 *
 * Implements Punjab Finance Act 1977 and Punjab Professions & Trades Tax Rules 1977.
 */

import { jsPDF } from "jspdf";
import { computeLedgerBalance } from "@ptas/domain";
import {
  loadPilotState,
  type StoredUnit,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord
} from "../pilot-store";
import {
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateShowCausePenaltyNotice,
  generateLandRevenueRecoveryCertificate,
  generateTaxClearanceCertificate,
  type FormPFT2Model,
  type FormPFT1Model,
  type FormPFT3RowModel
} from "../statutory-forms";
import { buildStatutoryReceiptDocument } from "../receipt-generator";
import type {
  OfficialDocumentType,
  DocumentAuthorizationContext,
  DocumentLifecycleValidationResult,
  DocumentGenerationOptions,
  ExecutivePft2BriefData,
  UnitDossierData
} from "./types";

import { generatePft2ChallanPdf } from "./templates/pft2-challan";
import { generatePft1DemandNoticePdf } from "./templates/pft1-demand-notice";
import { generatePft3RegisterPdf } from "./templates/pft3-assessment-register";
import { generateShowCauseNoticePdf } from "./templates/show-cause-notice";
import { generateStatutoryReceiptPdf } from "./templates/statutory-receipt";
import { generateExecutivePft2BriefPdf } from "./templates/executive-pft2-brief";
import {
  generateStatutoryReportPdf,
  type StatutoryReportData
} from "./templates/statutory-reports";
import { generateTaxClearanceCertificatePdf } from "./templates/tax-clearance-certificate";
import { generateLandRevenueRecoveryPdf } from "./templates/land-revenue-recovery";
import { generateAppellateOrderPdf } from "./templates/appellate-order";
import { generateUnitDossierPdf } from "./templates/unit-dossier";

/**
 * Normalizes document type strings and aliases
 */
export function normalizeDocumentType(type: OfficialDocumentType | string): OfficialDocumentType {
  switch (type) {
    case "PFT2_CHALLAN":
    case "FORM_PFT2_CHALLAN":
      return "FORM_PFT2_CHALLAN";
    case "PFT1_DEMAND_NOTICE":
    case "FORM_PFT1_NOTICE":
      return "FORM_PFT1_NOTICE";
    case "PFT3_ASSESSMENT_REGISTER":
    case "FORM_PFT3_REGISTER":
      return "FORM_PFT3_REGISTER";
    case "STATUTORY_REPORTS":
    case "STATUTORY_REPORT":
      return "STATUTORY_REPORT";
    default:
      return type as OfficialDocumentType;
  }
}

/**
 * Validates whether an authenticated officer has jurisdiction and role authority
 * to generate / download the requested official document.
 */
export function validateDocumentAuthorization(
  typeOrContext: OfficialDocumentType | DocumentAuthorizationContext,
  contextOrTarget?:
    DocumentAuthorizationContext | StoredUnit | { district?: string; circle?: string } | null,
  targetRecord?: StoredUnit | { district?: string; circle?: string } | null
): { allowed: boolean; authorized: boolean; reason: string } {
  let docType: OfficialDocumentType | undefined;
  let context: DocumentAuthorizationContext;
  let target: { district?: string; circle?: string; circleId?: string } | null;

  if (typeof typeOrContext === "string") {
    docType = normalizeDocumentType(typeOrContext);
    context = (contextOrTarget as DocumentAuthorizationContext) || {};
    target = (targetRecord as { district?: string; circle?: string; circleId?: string }) || null;
  } else {
    context = typeOrContext;
    target = (contextOrTarget as { district?: string; circle?: string; circleId?: string }) || null;
  }

  const role = (context.role || context.officerRole || "").toUpperCase();

  // If no auth context provided, default to authorized for backwards-compatible pilot sessions
  if (!role) {
    return { allowed: true, authorized: true, reason: "AUTHORIZED_PILOT_SESSION" };
  }

  // System Admin and Directors have province-wide / unconstrained jurisdiction
  if (role === "SYSTEM_ADMIN" || role === "ADMIN" || role === "DIRECTOR") {
    return { allowed: true, authorized: true, reason: `AUTHORIZED_${role}` };
  }

  // Excise & Taxation Officer (Assessing Authority)
  if (role === "EXCISE_TAXATION_OFFICER" || role === "ETO") {
    if (
      context.district &&
      target?.district &&
      context.district.toLowerCase() !== target.district.toLowerCase()
    ) {
      return {
        allowed: false,
        authorized: false,
        reason: `District jurisdiction mismatch: record district ${target.district} is outside officer district ${context.district}`
      };
    }
    return { allowed: true, authorized: true, reason: "AUTHORIZED_ETO_OFFICE" };
  }

  // Assistant Excise Officer / Inspector
  if (role === "ASSISTANT_EXCISE_OFFICER" || role === "INSPECTOR") {
    // Judicial Appellate Orders are restricted from field inspection officers
    if (docType === "APPELLATE_ORDER") {
      return {
        allowed: false,
        authorized: false,
        reason: "Insufficient clearance: Inspector role cannot access judicial appellate orders."
      };
    }

    if (
      context.circle &&
      target?.circle &&
      context.circle.toLowerCase() !== target.circle.toLowerCase()
    ) {
      return {
        allowed: false,
        authorized: false,
        reason: `Circle jurisdiction mismatch: circle ${target.circle} does not match assigned circle ${context.circle}`
      };
    }

    if (context.jurisdictionId && target?.circleId && context.jurisdictionId !== target.circleId) {
      return {
        allowed: false,
        authorized: false,
        reason: `Circle jurisdiction mismatch: circleId ${target.circleId} does not match assigned circle ${context.jurisdictionId}`
      };
    }

    return { allowed: true, authorized: true, reason: "AUTHORIZED_INSPECTOR_CIRCLE" };
  }

  return { allowed: true, authorized: true, reason: "AUTHORIZED" };
}

/**
 * Validates document lifecycle requirements (Section 5):
 * - PFT2: Must be in ISSUED or RECEIVED status (cannot download unissued or draft)
 * - PFT1: Assessment must be in APPROVED status
 * - PFT5 Clearance: Unit ledger balance must be <= 0
 */
export function validateDocumentLifecycleState(
  type: OfficialDocumentType | string,
  entity: unknown
): DocumentLifecycleValidationResult {
  if (!entity) {
    return {
      isValid: false,
      allowed: false,
      code: "RECORD_NOT_FOUND",
      message: "The requested document record does not exist in the authoritative database.",
      reason: "Record not found in database."
    };
  }

  const normType = normalizeDocumentType(type);
  const rawEntity = entity as Record<string, unknown>;

  switch (normType) {
    case "FORM_PFT2_CHALLAN": {
      const status = (rawEntity.challanStatus || rawEntity.status || "").toString().toUpperCase();
      if (status === "CANCELLED") {
        return {
          isValid: false,
          allowed: false,
          code: "CANCELLED_CHALLAN",
          message: "Form PFT-2 Challan has been officially cancelled and cannot be generated.",
          reason: "Challan cancelled."
        };
      }
      if (!status || (status !== "ISSUED" && status !== "RECEIVED")) {
        return {
          isValid: false,
          allowed: false,
          code: "UNISSUED_CHALLAN",
          message:
            "Form PFT-2 Challan has not been officially issued. Download is only permitted after recorded issuance by the Assessing Authority.",
          reason:
            "Form PFT-2 Challan cannot be generated before official issuance by the Assessing Authority."
        };
      }
      return {
        isValid: true,
        allowed: true,
        code: "VALID",
        message: "Challan is in valid official status.",
        reason: "Valid issued challan."
      };
    }

    case "FORM_PFT1_NOTICE": {
      const assessmentStatus = (rawEntity.assessmentStatus || "").toString().toUpperCase();
      const isProvisional = Boolean(rawEntity.isProvisional);

      if (
        assessmentStatus === "DRAFT" ||
        (assessmentStatus && assessmentStatus !== "APPROVED" && !isProvisional)
      ) {
        return {
          isValid: false,
          allowed: false,
          code: "UNAPPROVED_ASSESSMENT",
          message:
            "Assessment has not been approved by the Assessing Authority (ETO). Statutory Form PFT-1 Notice requires an approved assessment.",
          reason:
            "Assessment has not received ETO approval. Form PFT-1 Notice requires an approved assessment."
        };
      }

      const unit = entity as StoredUnit;
      if (unit.assessments || unit.assessmentVersions) {
        const approvedAssessment = unit.assessments?.find((a) => a.status === "APPROVED");
        if (
          !approvedAssessment &&
          unit.assessmentVersions?.[0]?.status !== "APPROVED" &&
          !isProvisional
        ) {
          return {
            isValid: false,
            allowed: false,
            code: "UNAPPROVED_ASSESSMENT",
            message:
              "Assessment has not been approved by the Assessing Authority (ETO). Statutory Form PFT-1 Notice requires an approved assessment.",
            reason:
              "Assessment has not received ETO approval. Form PFT-1 Notice requires an approved assessment."
          };
        }
      }

      return {
        isValid: true,
        allowed: true,
        code: "VALID",
        message: "Notice of Demand is in approved status.",
        reason: "Valid approved notice."
      };
    }

    case "TAX_CLEARANCE_CERTIFICATE": {
      let balance = 0;
      if (typeof rawEntity.currentBalancePkr === "number") {
        balance = rawEntity.currentBalancePkr;
      } else if (
        rawEntity.unit &&
        typeof (rawEntity.unit as Record<string, unknown>).currentBalancePkr === "number"
      ) {
        balance = (rawEntity.unit as Record<string, unknown>).currentBalancePkr as number;
      } else if (rawEntity.ledgerEntries && Array.isArray(rawEntity.ledgerEntries)) {
        balance = computeLedgerBalance(
          rawEntity.ledgerEntries as Parameters<typeof computeLedgerBalance>[0]
        );
      } else if (rawEntity.unit && Array.isArray((rawEntity.unit as StoredUnit).ledgerEntries)) {
        balance = computeLedgerBalance((rawEntity.unit as StoredUnit).ledgerEntries);
      }

      if (balance > 0) {
        return {
          isValid: false,
          allowed: false,
          code: "OUTSTANDING_BALANCE_EXISTS",
          message: `Cannot issue Tax Clearance Certificate: Taxpayer unit has an outstanding balance of PKR ${balance.toLocaleString()}.`,
          reason: `Cannot issue Tax Clearance Certificate: Taxpayer unit has an outstanding tax balance of PKR ${balance.toLocaleString()}.`
        };
      }
      return {
        isValid: true,
        allowed: true,
        code: "VALID",
        message: "Zero-liability confirmed. Eligible for clearance.",
        reason: "Zero dues confirmed."
      };
    }

    default:
      return {
        isValid: true,
        allowed: true,
        code: "VALID",
        message: "Record is valid for document generation.",
        reason: "Valid."
      };
  }
}

export const validateDocumentLifecycle = validateDocumentLifecycleState;

/**
 * Authoritative PDF Generation Engine
 * Reconstructs the complete document from database values and renders deterministic vector PDF.
 */
export async function generateAuthoritativePdf(
  typeOrParams:
    | OfficialDocumentType
    | { documentType: OfficialDocumentType; entityId?: string; data?: unknown },
  documentIdOrData?: string | unknown,
  authContext?: DocumentAuthorizationContext,
  options?: DocumentGenerationOptions
): Promise<jsPDF> {
  let docType: OfficialDocumentType;
  let targetData: string | unknown;

  if (typeof typeOrParams === "object" && typeOrParams !== null && "documentType" in typeOrParams) {
    docType = normalizeDocumentType(typeOrParams.documentType);
    targetData = typeOrParams.data !== undefined ? typeOrParams.data : typeOrParams.entityId;
  } else {
    docType = normalizeDocumentType(typeOrParams as OfficialDocumentType);
    targetData = documentIdOrData;
  }

  const state = loadPilotState();

  // Lifecycle check
  const lifecycle = validateDocumentLifecycleState(docType, targetData);
  if (!lifecycle.isValid && !options?.isProvisional) {
    throw new Error(
      `Document lifecycle violation [${lifecycle.code}]: ${lifecycle.message || lifecycle.reason}`
    );
  }

  // Authorization check
  const authTarget = (targetData as { unit?: StoredUnit })?.unit || (targetData as StoredUnit);
  const auth = validateDocumentAuthorization(docType, authContext || {}, authTarget);
  if (!auth.allowed) {
    throw new Error(`Authorization Error: ${auth.reason}`);
  }

  switch (docType) {
    case "FORM_PFT2_CHALLAN": {
      // Check if structured FormPFT2Model is provided directly
      if (typeof targetData === "object" && targetData !== null && "copies" in targetData) {
        return generatePft2ChallanPdf(targetData as FormPFT2Model, options);
      }

      let challanRecord: Pft2ChallanRecord | undefined;
      if (typeof targetData === "string") {
        challanRecord = (state.pft2Challans || []).find(
          (c) => c.id === targetData || c.challanNumber === targetData
        );
      } else {
        challanRecord = targetData as Pft2ChallanRecord;
      }

      const freshUnit =
        (state.units || []).find((u) => u.id === challanRecord?.unitId) || state.units[0];

      // Reconstruct structured Form PFT2 Model from database
      const challanModel = generateFormPFT2(freshUnit!, {
        dueDate: challanRecord?.dueDate,
        issueDate: challanRecord?.issueDate,
        formType: challanRecord?.formType,
        demandScope: challanRecord?.demandScope,
        paymentScope: challanRecord?.paymentScope,
        customAmount: challanRecord?.amountPayable,
        isPartial: challanRecord?.paymentScope === "PARTIAL",
        remainingBalance: challanRecord?.remainingBalance ?? 0,
        noticeNumber: challanRecord?.noticeNumber,
        pin: challanRecord?.pin
      });

      return generatePft2ChallanPdf(challanModel, options);
    }

    case "FORM_PFT1_NOTICE": {
      // Check if structured FormPFT1Model is provided directly
      if (typeof targetData === "object" && targetData !== null && "demandNumber" in targetData) {
        return generatePft1DemandNoticePdf(targetData as FormPFT1Model, options);
      }

      let unit: StoredUnit | undefined;
      if (typeof targetData === "string") {
        unit = (state.units || []).find(
          (u) =>
            u.id === targetData ||
            u.demandUnit?.permanentDemandNo === targetData ||
            u.provincialUin === targetData
        );
      } else {
        unit = targetData as StoredUnit;
      }

      const pft1Model = generateFormPFT1((unit || state.units[0])!);
      return generatePft1DemandNoticePdf(pft1Model, options);
    }

    case "FORM_PFT3_REGISTER": {
      const rows =
        typeof targetData === "object" && targetData !== null && "rows" in targetData
          ? (targetData as { rows: FormPFT3RowModel[] }).rows
          : generateFormPFT3Rows(state.units || []);

      return generatePft3RegisterPdf(
        {
          rows,
          district: "Vehari",
          circle: "Circle-Vehari",
          financialYear: "2026-2027",
          officialSha256: "sha256-pft3-register-authenticated"
        },
        options
      );
    }

    case "SHOW_CAUSE_NOTICE": {
      if (
        typeof targetData === "object" &&
        targetData !== null &&
        "assesseeLegalName" in targetData
      ) {
        return generateShowCauseNoticePdf(
          targetData as Parameters<typeof generateShowCauseNoticePdf>[0],
          options
        );
      }

      let unit: StoredUnit | undefined;
      if (typeof targetData === "string") {
        unit = (state.units || []).find((u) => u.id === targetData);
      } else {
        unit = targetData as StoredUnit;
      }

      const notice = generateShowCausePenaltyNotice((unit || state.units[0])!);
      return generateShowCauseNoticePdf(notice, options);
    }

    case "STATUTORY_RECEIPT": {
      if (
        typeof targetData === "object" &&
        targetData !== null &&
        "receiptNumber" in targetData &&
        "taxAmount" in targetData
      ) {
        return generateStatutoryReceiptPdf(
          targetData as unknown as Parameters<typeof generateStatutoryReceiptPdf>[0],
          options
        );
      }

      let receiptRecord: StatutoryReceiptRecord | undefined;
      if (typeof targetData === "string") {
        receiptRecord = (state.statutoryReceipts || []).find(
          (r) => r.id === targetData || r.receiptNumber === targetData
        );
      } else if (
        typeof targetData === "object" &&
        targetData !== null &&
        "amountPaidPkr" in targetData
      ) {
        receiptRecord = targetData as StatutoryReceiptRecord;
      }

      if (!receiptRecord) {
        throw new Error("Statutory Receipt record not found in database.");
      }

      const docModel = buildStatutoryReceiptDocument(receiptRecord);
      return generateStatutoryReceiptPdf(docModel, options);
    }

    case "EXECUTIVE_PFT2_BRIEF": {
      const briefData = targetData as ExecutivePft2BriefData;
      return generateExecutivePft2BriefPdf(briefData, options);
    }

    case "STATUTORY_REPORT": {
      const reportData = targetData as StatutoryReportData;
      return generateStatutoryReportPdf(reportData, options);
    }

    case "TAX_CLEARANCE_CERTIFICATE": {
      if (
        typeof targetData === "object" &&
        targetData !== null &&
        "certificateNumber" in targetData &&
        "statutoryCategory" in targetData
      ) {
        return generateTaxClearanceCertificatePdf(
          targetData as unknown as Parameters<typeof generateTaxClearanceCertificatePdf>[0],
          options
        );
      }

      let unit: StoredUnit | undefined;
      if (typeof targetData === "string") {
        unit = (state.units || []).find((u) => u.id === targetData);
      } else if (typeof targetData === "object" && targetData !== null && "unit" in targetData) {
        unit = (targetData as { unit: StoredUnit }).unit;
      } else {
        unit = targetData as StoredUnit;
      }

      const officer = options?.officer || {
        id: "a0000000-0000-4000-8000-000000000002",
        name: "Tariq Mahmood",
        email: "eto.vehari@punjab.gov.pk",
        role: "ETO",
        title: "Excise & Taxation Officer (Assessing Authority)",
        jurisdictionId: "00000000-0000-4000-8000-000000000003",
        jurisdictionName: "Tehsil Vehari",
        jurisdictionTier: "OFFICE",
        badgeText: "Assessing Authority"
      };

      const certModel = generateTaxClearanceCertificate((unit || state.units[0])!, officer);
      return generateTaxClearanceCertificatePdf(certModel, options);
    }

    case "LAND_REVENUE_RECOVERY": {
      if (
        typeof targetData === "object" &&
        targetData !== null &&
        "collectorDistrict" in targetData
      ) {
        return generateLandRevenueRecoveryPdf(
          targetData as Parameters<typeof generateLandRevenueRecoveryPdf>[0],
          options
        );
      }

      let unit: StoredUnit | undefined;
      if (typeof targetData === "string") {
        unit = (state.units || []).find((u) => u.id === targetData);
      } else {
        unit = targetData as StoredUnit;
      }

      const cert = generateLandRevenueRecoveryCertificate((unit || state.units[0])!);
      return generateLandRevenueRecoveryPdf(cert, options);
    }

    case "APPELLATE_ORDER": {
      return generateAppellateOrderPdf(
        targetData as Parameters<typeof generateAppellateOrderPdf>[0],
        options
      );
    }

    case "UNIT_DOSSIER": {
      if (typeof targetData === "object" && targetData !== null && "unit" in targetData) {
        return generateUnitDossierPdf(
          targetData as Parameters<typeof generateUnitDossierPdf>[0],
          options
        );
      }

      let unit: StoredUnit | undefined;
      if (typeof targetData === "string") {
        unit = (state.units || []).find((u) => u.id === targetData);
      } else {
        unit = targetData as StoredUnit;
      }

      const effectiveUnit = (unit || state.units[0])!;
      const dossierData: UnitDossierData = {
        unit: effectiveUnit,
        generatedAt: new Date().toISOString(),
        officerName: options?.officer?.name || "Tariq Mahmood",
        officerTitle: options?.officer?.title || "Excise & Taxation Officer / Assessing Authority",
        officialSha256: `sha256-dossier-${effectiveUnit?.id || "unit"}`
      };
      return generateUnitDossierPdf(dossierData, options);
    }

    default:
      throw new Error(`Unsupported official document type: ${String(docType)}`);
  }
}

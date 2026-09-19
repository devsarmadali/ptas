import type { AuditActor } from "./audit.js";
import type { AssessmentAction, AssessmentStatus } from "./assessment-workflow.js";
import { transitionAssessment } from "./assessment-workflow.js";

export interface Assessment {
  readonly id: string;
  readonly taxpayerId: string;
  readonly financialYearId: string;
  readonly status: AssessmentStatus;
  readonly currentVersionNo: number;
  readonly createdBy: string;
  readonly createdAt: string; // ISO 8601
}

export interface AssessmentVersion<TSnapshot = Record<string, unknown>> {
  readonly id: string;
  readonly assessmentId: string;
  readonly versionNo: number;
  readonly snapshot: Readonly<TSnapshot>;
  readonly status: AssessmentStatus;
  readonly reason?: string | undefined;
  readonly createdBy: string;
  readonly createdAt: string; // ISO 8601
  readonly approvedBy?: string | undefined;
  readonly approvedAt?: string | undefined; // ISO 8601
  readonly approvalEvidenceId?: string | undefined;
}

export interface CreateAssessmentInput<TSnapshot = Record<string, unknown>> {
  readonly id?: string | undefined;
  readonly taxpayerId: string;
  readonly financialYearId: string;
  readonly snapshot: TSnapshot;
}

const STATUTORY_APPROVAL_ROLES = new Set(["ETO", "DIRECTOR", "ADMIN"]);

export function createAssessment<TSnapshot = Record<string, unknown>>(
  input: CreateAssessmentInput<TSnapshot>,
  actor: AuditActor,
  asOf: Date | string = new Date()
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  const taxpayerId = input.taxpayerId.trim();
  if (!taxpayerId) {
    throw new Error("Assessment taxpayerId is required");
  }

  const financialYearId = input.financialYearId.trim();
  if (!financialYearId) {
    throw new Error("Assessment financialYearId is required");
  }

  if (!input.snapshot || typeof input.snapshot !== "object") {
    throw new Error("Assessment snapshot is required and must be an object");
  }

  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();
  const assessmentId = input.id ?? crypto.randomUUID();

  const assessment: Assessment = Object.freeze({
    id: assessmentId,
    taxpayerId,
    financialYearId,
    status: "DRAFT",
    currentVersionNo: 1,
    createdBy: actor.userId,
    createdAt: timestamp
  });

  const version: AssessmentVersion<TSnapshot> = Object.freeze({
    id: crypto.randomUUID(),
    assessmentId,
    versionNo: 1,
    snapshot: Object.freeze({ ...input.snapshot }),
    status: "DRAFT",
    createdBy: actor.userId,
    createdAt: timestamp
  });

  return { assessment, version };
}

export function submitAssessmentVersion<TSnapshot>(
  assessment: Assessment,
  version: AssessmentVersion<TSnapshot>
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  assertApprovedVersionImmutable(version);

  const nextStatus = transitionAssessment(version.status, "SUBMIT");

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus
  });

  const updatedVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    ...version,
    status: nextStatus
  });

  return { assessment: updatedAssessment, version: updatedVersion };
}

export function returnAssessmentVersion<TSnapshot>(
  assessment: Assessment,
  version: AssessmentVersion<TSnapshot>,
  reason: string,
  actor: AuditActor
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  assertApprovedVersionImmutable(version);

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("Returning an assessment requires an explanatory reason");
  }

  if (!STATUTORY_APPROVAL_ROLES.has(actor.roleCode)) {
    throw new Error(
      `Role ${actor.roleCode} is not authorized to return assessments (requires ETO or higher)`
    );
  }

  const nextStatus = transitionAssessment(version.status, "RETURN");

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus
  });

  const updatedVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    ...version,
    status: nextStatus,
    reason: trimmedReason
  });

  return { assessment: updatedAssessment, version: updatedVersion };
}

export function recordHearingEvidence<TSnapshot>(
  assessment: Assessment,
  version: AssessmentVersion<TSnapshot>,
  hearingEvidence: string,
  actor: AuditActor
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  assertApprovedVersionImmutable(version);

  const trimmedEvidence = hearingEvidence.trim();
  if (!trimmedEvidence) {
    throw new Error("Hearing evidence is required to record a hearing");
  }

  if (!STATUTORY_APPROVAL_ROLES.has(actor.roleCode)) {
    throw new Error(`Role ${actor.roleCode} is not authorized to record assessment hearings`);
  }

  const nextStatus = transitionAssessment(version.status, "RECORD_HEARING");

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus
  });

  const updatedVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    ...version,
    status: nextStatus,
    reason: trimmedEvidence
  });

  return { assessment: updatedAssessment, version: updatedVersion };
}

export function approveAssessmentVersion<TSnapshot>(
  assessment: Assessment,
  version: AssessmentVersion<TSnapshot>,
  actor: AuditActor,
  approvalEvidenceId?: string | undefined,
  asOf: Date | string = new Date()
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  assertApprovedVersionImmutable(version);

  // Non-negotiable domain rule: Never bypass the legally authorized ETO/assessing-authority approval step.
  if (!STATUTORY_APPROVAL_ROLES.has(actor.roleCode)) {
    throw new Error(
      `Role ${actor.roleCode} is not legally authorized to approve statutory assessments (requires assessing authority ETO or higher)`
    );
  }

  const action: AssessmentAction = version.status === "RESUBMITTED" ? "APPROVE" : "APPROVE";

  const nextStatus = transitionAssessment(version.status, action);
  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus
  });

  const updatedVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    ...version,
    status: nextStatus,
    approvedBy: actor.userId,
    approvedAt: timestamp,
    approvalEvidenceId
  });

  return { assessment: updatedAssessment, version: updatedVersion };
}

export function createAssessmentRevision<TSnapshot>(
  assessment: Assessment,
  approvedVersion: AssessmentVersion<TSnapshot>,
  revisionReason: string,
  newSnapshot: TSnapshot,
  actor: AuditActor,
  asOf: Date | string = new Date()
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  const trimmedReason = revisionReason.trim();
  if (!trimmedReason) {
    throw new Error("A reason is required to create an assessment revision");
  }

  if (approvedVersion.status !== "APPROVED" && approvedVersion.status !== "ADJUSTED") {
    throw new Error(
      `Cannot create a revision from status ${approvedVersion.status}; only APPROVED or ADJUSTED assessments may be revised`
    );
  }

  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();
  const nextVersionNo = assessment.currentVersionNo + 1;

  const nextStatus = transitionAssessment(approvedVersion.status, "CREATE_REVISION");

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus,
    currentVersionNo: nextVersionNo
  });

  const revisionVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    id: crypto.randomUUID(),
    assessmentId: assessment.id,
    versionNo: nextVersionNo,
    snapshot: Object.freeze({ ...newSnapshot }),
    status: nextStatus,
    reason: trimmedReason,
    createdBy: actor.userId,
    createdAt: timestamp
  });

  return { assessment: updatedAssessment, version: revisionVersion };
}

export function resubmitAssessmentRevision<TSnapshot>(
  assessment: Assessment,
  revisionVersion: AssessmentVersion<TSnapshot>
): { assessment: Assessment; version: AssessmentVersion<TSnapshot> } {
  assertApprovedVersionImmutable(revisionVersion);

  const nextStatus = transitionAssessment(revisionVersion.status, "RESUBMIT");

  const updatedAssessment: Assessment = Object.freeze({
    ...assessment,
    status: nextStatus
  });

  const updatedVersion: AssessmentVersion<TSnapshot> = Object.freeze({
    ...revisionVersion,
    status: nextStatus
  });

  return { assessment: updatedAssessment, version: updatedVersion };
}

export function assertApprovedVersionImmutable(version: AssessmentVersion<unknown>): void {
  if (version.status === "APPROVED") {
    throw new Error(
      `Cannot modify approved assessment version v${version.versionNo} in place. Approved snapshots are immutable; create an authorized revision version.`
    );
  }
}

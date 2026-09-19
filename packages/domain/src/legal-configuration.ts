import type { AuditActor } from "./audit.js";

export type ConfigType = "SCHEDULE" | "CATEGORY" | "RATE" | "FORM" | "ACCOUNT_HEAD";

export type ConfigStatus = "DRAFT" | "APPROVED" | "ACTIVE" | "RETIRED";

export interface ApprovalEvidence {
  readonly id: string;
  readonly approvalIdentifier: string;
  readonly approvingAuthority: string;
  readonly approvedOn: string; // YYYY-MM-DD
  readonly sourceDocumentSha256: string; // 64 hex characters
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | undefined; // YYYY-MM-DD
  readonly createdBy: string;
  readonly createdAt: string; // ISO 8601
}

export interface LegalConfigurationVersion<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly configType: ConfigType;
  readonly code: string;
  readonly versionNo: number;
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | undefined; // YYYY-MM-DD
  readonly payload: Readonly<TPayload>;
  readonly status: ConfigStatus;
  readonly approvalEvidenceId?: string | undefined;
  readonly createdAt: string; // ISO 8601
}

export interface CreateApprovalEvidenceInput {
  readonly id?: string | undefined;
  readonly approvalIdentifier: string;
  readonly approvingAuthority: string;
  readonly approvedOn: string; // YYYY-MM-DD
  readonly sourceDocumentSha256: string; // 64 hex characters
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | undefined; // YYYY-MM-DD
}

export interface CreateDraftConfigurationInput<TPayload = Record<string, unknown>> {
  readonly id?: string | undefined;
  readonly configType: ConfigType;
  readonly code: string;
  readonly versionNo: number;
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | undefined; // YYYY-MM-DD
  readonly payload: TPayload;
}

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateApprovalEvidence(evidence: ApprovalEvidence): void {
  if (!evidence.approvalIdentifier || !evidence.approvalIdentifier.trim()) {
    throw new Error("ApprovalEvidence requires an approvalIdentifier");
  }

  if (!evidence.approvingAuthority || !evidence.approvingAuthority.trim()) {
    throw new Error("ApprovalEvidence requires an approvingAuthority");
  }

  if (!evidence.approvedOn || !DATE_FORMAT_REGEX.test(evidence.approvedOn)) {
    throw new Error("ApprovalEvidence requires approvedOn in YYYY-MM-DD format");
  }

  if (!evidence.sourceDocumentSha256 || !SHA256_HEX_REGEX.test(evidence.sourceDocumentSha256)) {
    throw new Error(
      "ApprovalEvidence sourceDocumentSha256 must be a valid 64-character hexadecimal SHA-256 hash"
    );
  }

  if (!evidence.effectiveFrom || !DATE_FORMAT_REGEX.test(evidence.effectiveFrom)) {
    throw new Error("ApprovalEvidence requires effectiveFrom in YYYY-MM-DD format");
  }

  if (evidence.effectiveTo) {
    if (!DATE_FORMAT_REGEX.test(evidence.effectiveTo)) {
      throw new Error("ApprovalEvidence effectiveTo must be in YYYY-MM-DD format");
    }
    if (evidence.effectiveTo < evidence.effectiveFrom) {
      throw new Error("ApprovalEvidence effectiveTo cannot be earlier than effectiveFrom");
    }
  }
}

export function createApprovalEvidence(
  input: CreateApprovalEvidenceInput,
  actor: AuditActor,
  asOf: Date | string = new Date()
): ApprovalEvidence {
  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();
  const evidence: ApprovalEvidence = {
    id: input.id ?? crypto.randomUUID(),
    approvalIdentifier: input.approvalIdentifier.trim(),
    approvingAuthority: input.approvingAuthority.trim(),
    approvedOn: input.approvedOn.trim(),
    sourceDocumentSha256: input.sourceDocumentSha256.trim().toLowerCase(),
    effectiveFrom: input.effectiveFrom.trim(),
    effectiveTo: input.effectiveTo?.trim(),
    createdBy: actor.userId,
    createdAt: timestamp
  };

  validateApprovalEvidence(evidence);
  return Object.freeze(evidence);
}

export function createDraftConfiguration<TPayload = Record<string, unknown>>(
  input: CreateDraftConfigurationInput<TPayload>,
  asOf: Date | string = new Date()
): LegalConfigurationVersion<TPayload> {
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new Error("Configuration code cannot be empty");
  }

  if (!Number.isInteger(input.versionNo) || input.versionNo <= 0) {
    throw new Error("Configuration versionNo must be a positive integer");
  }

  if (!input.effectiveFrom || !DATE_FORMAT_REGEX.test(input.effectiveFrom)) {
    throw new Error("Configuration requires effectiveFrom in YYYY-MM-DD format");
  }

  if (input.effectiveTo) {
    if (!DATE_FORMAT_REGEX.test(input.effectiveTo)) {
      throw new Error("Configuration effectiveTo must be in YYYY-MM-DD format");
    }
    if (input.effectiveTo < input.effectiveFrom) {
      throw new Error("Configuration effectiveTo cannot be earlier than effectiveFrom");
    }
  }

  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("Configuration payload is required and must be an object");
  }

  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();

  const version: LegalConfigurationVersion<TPayload> = {
    id: input.id ?? crypto.randomUUID(),
    configType: input.configType,
    code,
    versionNo: input.versionNo,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    payload: Object.freeze({ ...input.payload }),
    status: "DRAFT",
    createdAt: timestamp
  };

  return Object.freeze(version);
}

export function approveConfiguration<TPayload = Record<string, unknown>>(
  version: LegalConfigurationVersion<TPayload>,
  evidence: ApprovalEvidence
): LegalConfigurationVersion<TPayload> {
  if (version.status !== "DRAFT") {
    throw new Error(
      `Cannot approve configuration with status ${version.status}; version must be in DRAFT status`
    );
  }

  validateApprovalEvidence(evidence);

  // Evidence effective window check
  if (evidence.effectiveFrom > version.effectiveFrom) {
    throw new Error(
      `Approval evidence effectiveFrom (${evidence.effectiveFrom}) is after configuration effectiveFrom (${version.effectiveFrom})`
    );
  }

  if (evidence.effectiveTo) {
    if (!version.effectiveTo || version.effectiveTo > evidence.effectiveTo) {
      throw new Error(
        `Configuration effectiveTo extends beyond approval evidence effectiveTo (${evidence.effectiveTo})`
      );
    }
  }

  const approved: LegalConfigurationVersion<TPayload> = {
    ...version,
    status: "APPROVED",
    approvalEvidenceId: evidence.id
  };

  return Object.freeze(approved);
}

export function activateConfiguration<TPayload = Record<string, unknown>>(
  version: LegalConfigurationVersion<TPayload>,
  asOf: Date | string = new Date()
): LegalConfigurationVersion<TPayload> {
  if (version.status !== "APPROVED") {
    throw new Error(
      `Cannot activate unapproved configuration: status is ${version.status}. Only APPROVED configurations can be activated`
    );
  }

  if (!version.approvalEvidenceId) {
    throw new Error("Cannot activate configuration without formal approvalEvidenceId");
  }

  const asOfStr = typeof asOf === "string" ? asOf : asOf.toISOString().slice(0, 10);
  const asOfDate = asOfStr.slice(0, 10);

  if (asOfDate < version.effectiveFrom) {
    throw new Error(
      `Cannot activate configuration before effectiveFrom date (${version.effectiveFrom}); current date is ${asOfDate}`
    );
  }

  if (version.effectiveTo && asOfDate > version.effectiveTo) {
    throw new Error(
      `Cannot activate configuration after effectiveTo date (${version.effectiveTo}); current date is ${asOfDate}`
    );
  }

  const activated: LegalConfigurationVersion<TPayload> = {
    ...version,
    status: "ACTIVE"
  };

  return Object.freeze(activated);
}

export function retireConfiguration<TPayload = Record<string, unknown>>(
  version: LegalConfigurationVersion<TPayload>
): LegalConfigurationVersion<TPayload> {
  if (version.status !== "ACTIVE" && version.status !== "APPROVED") {
    throw new Error(
      `Cannot retire configuration with status ${version.status}; only ACTIVE or APPROVED configurations may be retired`
    );
  }

  const retired: LegalConfigurationVersion<TPayload> = {
    ...version,
    status: "RETIRED"
  };

  return Object.freeze(retired);
}

export function isConfigurationEffective(
  version: LegalConfigurationVersion,
  asOf: Date | string = new Date()
): boolean {
  if (version.status !== "ACTIVE") {
    return false;
  }

  const asOfStr = typeof asOf === "string" ? asOf : asOf.toISOString().slice(0, 10);
  const dateOnly = asOfStr.slice(0, 10);

  if (dateOnly < version.effectiveFrom) {
    return false;
  }

  if (version.effectiveTo && dateOnly > version.effectiveTo) {
    return false;
  }

  return true;
}

export function findActiveConfiguration<TPayload = Record<string, unknown>>(
  versions: readonly LegalConfigurationVersion<TPayload>[],
  configType: ConfigType,
  code: string,
  asOf: Date | string = new Date()
): LegalConfigurationVersion<TPayload> | null {
  const normCode = code.trim().toUpperCase();

  const matching = versions.filter(
    (v) => v.configType === configType && v.code === normCode && isConfigurationEffective(v, asOf)
  );

  if (matching.length === 0) {
    return null;
  }

  // Pick highest versionNo if multiple active periods overlap
  return matching.reduce((highest, current) =>
    current.versionNo > highest.versionNo ? current : highest
  );
}

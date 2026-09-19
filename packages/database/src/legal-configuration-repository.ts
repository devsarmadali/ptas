import type { Sql } from "postgres";
import type {
  ApprovalEvidence,
  AuditContext,
  ConfigType,
  LegalConfigurationVersion
} from "@ptas/domain";
import { createAuditEvent, findActiveConfiguration } from "@ptas/domain";
import type { AppendOnlyAuditRepository } from "./audit-repository.js";

export interface LegalConfigurationRepository {
  saveApprovalEvidence(
    evidence: ApprovalEvidence,
    auditContext: AuditContext
  ): Promise<ApprovalEvidence>;
  findApprovalEvidenceById(id: string): Promise<ApprovalEvidence | null>;
  findApprovalEvidenceByIdentifier(identifier: string): Promise<ApprovalEvidence | null>;
  createVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion>;
  updateVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion>;
  findVersion(
    configType: ConfigType,
    code: string,
    versionNo: number
  ): Promise<LegalConfigurationVersion | null>;
  findActiveVersion(
    configType: ConfigType,
    code: string,
    asOf: string
  ): Promise<LegalConfigurationVersion | null>;
  listVersions(
    configType?: ConfigType,
    code?: string
  ): Promise<readonly LegalConfigurationVersion[]>;
}

export class InMemoryLegalConfigurationRepository implements LegalConfigurationRepository {
  private readonly evidenceById = new Map<string, ApprovalEvidence>();
  private readonly evidenceByIdentifier = new Map<string, string>();

  private readonly versionsById = new Map<string, LegalConfigurationVersion>();
  private readonly versionKeys = new Map<string, string>(); // type:code:versionNo -> id

  constructor(private readonly auditRepo?: AppendOnlyAuditRepository) {}

  private makeVersionKey(type: string, code: string, versionNo: number): string {
    return `${type}:${code.toUpperCase()}:${versionNo}`;
  }

  async saveApprovalEvidence(
    evidence: ApprovalEvidence,
    auditContext: AuditContext
  ): Promise<ApprovalEvidence> {
    if (this.evidenceById.has(evidence.id)) {
      throw new Error(`Approval evidence with id ${evidence.id} already exists`);
    }

    if (this.evidenceByIdentifier.has(evidence.approvalIdentifier)) {
      throw new Error(
        `Approval evidence with identifier ${evidence.approvalIdentifier} already exists`
      );
    }

    const frozen = Object.freeze({ ...evidence });
    this.evidenceById.set(evidence.id, frozen);
    this.evidenceByIdentifier.set(evidence.approvalIdentifier, evidence.id);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: "APPROVAL_EVIDENCE_RECORDED",
        aggregateType: "APPROVAL_EVIDENCE",
        aggregateId: evidence.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: evidence.createdAt,
        payload: {
          approvalIdentifier: evidence.approvalIdentifier,
          approvingAuthority: evidence.approvingAuthority,
          approvedOn: evidence.approvedOn,
          sourceDocumentSha256: evidence.sourceDocumentSha256,
          effectiveFrom: evidence.effectiveFrom,
          effectiveTo: evidence.effectiveTo
        }
      });
      await this.auditRepo.append(event);
    }

    return frozen;
  }

  async findApprovalEvidenceById(id: string): Promise<ApprovalEvidence | null> {
    const found = this.evidenceById.get(id);
    return found ? Object.freeze({ ...found }) : null;
  }

  async findApprovalEvidenceByIdentifier(identifier: string): Promise<ApprovalEvidence | null> {
    const id = this.evidenceByIdentifier.get(identifier);
    if (!id) return null;
    return this.findApprovalEvidenceById(id);
  }

  async createVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion> {
    const key = this.makeVersionKey(version.configType, version.code, version.versionNo);
    if (this.versionKeys.has(key)) {
      throw new Error(
        `Configuration version already exists: ${version.configType} ${version.code} v${version.versionNo}`
      );
    }

    // Database check constraint check: (status IN ('DRAFT') OR approval_evidence_id IS NOT NULL)
    if (version.status !== "DRAFT" && !version.approvalEvidenceId) {
      throw new Error(`Configuration with status ${version.status} requires an approvalEvidenceId`);
    }

    const frozen = Object.freeze({ ...version });
    this.versionsById.set(version.id, frozen);
    this.versionKeys.set(key, version.id);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: "CONFIG_VERSION_CREATED",
        aggregateType: "LEGAL_CONFIGURATION_VERSION",
        aggregateId: version.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: version.createdAt,
        payload: {
          configType: version.configType,
          code: version.code,
          versionNo: version.versionNo,
          status: version.status,
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
          approvalEvidenceId: version.approvalEvidenceId
        }
      });
      await this.auditRepo.append(event);
    }

    return frozen;
  }

  async updateVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion> {
    const existing = this.versionsById.get(version.id);
    if (!existing) {
      throw new Error(`Configuration version with id ${version.id} not found`);
    }

    if (version.status !== "DRAFT" && !version.approvalEvidenceId) {
      throw new Error(`Configuration with status ${version.status} requires an approvalEvidenceId`);
    }

    const frozen = Object.freeze({ ...version });
    this.versionsById.set(version.id, frozen);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: `CONFIG_VERSION_${version.status}`,
        aggregateType: "LEGAL_CONFIGURATION_VERSION",
        aggregateId: version.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: new Date().toISOString(),
        payload: {
          configType: version.configType,
          code: version.code,
          versionNo: version.versionNo,
          fromStatus: existing.status,
          toStatus: version.status,
          approvalEvidenceId: version.approvalEvidenceId
        }
      });
      await this.auditRepo.append(event);
    }

    return frozen;
  }

  async findVersion(
    configType: ConfigType,
    code: string,
    versionNo: number
  ): Promise<LegalConfigurationVersion | null> {
    const key = this.makeVersionKey(configType, code, versionNo);
    const id = this.versionKeys.get(key);
    if (!id) return null;
    const found = this.versionsById.get(id);
    return found ? Object.freeze({ ...found }) : null;
  }

  async findActiveVersion(
    configType: ConfigType,
    code: string,
    asOf: string
  ): Promise<LegalConfigurationVersion | null> {
    const all = await this.listVersions(configType, code);
    return findActiveConfiguration(all, configType, code, asOf);
  }

  async listVersions(
    configType?: ConfigType,
    code?: string
  ): Promise<readonly LegalConfigurationVersion[]> {
    let list = Array.from(this.versionsById.values());
    if (configType) {
      list = list.filter((v) => v.configType === configType);
    }
    if (code) {
      const normCode = code.trim().toUpperCase();
      list = list.filter((v) => v.code === normCode);
    }
    return Object.freeze(list);
  }
}

interface ApprovalEvidenceRow {
  id: string;
  approval_identifier: string;
  approving_authority: string;
  approved_on: string;
  source_document_sha256: string;
  effective_from: string;
  effective_to: string | null;
  created_by: string;
  created_at: string;
}

interface LegalConfigRow {
  id: string;
  config_type: string;
  code: string;
  version_no: number;
  effective_from: string;
  effective_to: string | null;
  payload: Record<string, unknown>;
  status: string;
  approval_evidence_id: string | null;
  created_at: string;
}

export class PostgresLegalConfigurationRepository implements LegalConfigurationRepository {
  constructor(private readonly sql: Sql) {}

  async saveApprovalEvidence(
    evidence: ApprovalEvidence,
    auditContext: AuditContext
  ): Promise<ApprovalEvidence> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO approval_evidence (
          id,
          approval_identifier,
          approving_authority,
          approved_on,
          source_document_sha256,
          effective_from,
          effective_to,
          created_by,
          created_at
        ) VALUES (
          ${evidence.id},
          ${evidence.approvalIdentifier},
          ${evidence.approvingAuthority},
          ${evidence.approvedOn},
          ${evidence.sourceDocumentSha256},
          ${evidence.effectiveFrom},
          ${evidence.effectiveTo ?? null},
          ${evidence.createdBy},
          ${evidence.createdAt}
        )
      `;

      const auditEvent = createAuditEvent({
        eventType: "APPROVAL_EVIDENCE_RECORDED",
        aggregateType: "APPROVAL_EVIDENCE",
        aggregateId: evidence.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: evidence.createdAt,
        payload: {
          approvalIdentifier: evidence.approvalIdentifier,
          approvingAuthority: evidence.approvingAuthority,
          approvedOn: evidence.approvedOn,
          sourceDocumentSha256: evidence.sourceDocumentSha256,
          effectiveFrom: evidence.effectiveFrom,
          effectiveTo: evidence.effectiveTo
        }
      });

      await tx`
        INSERT INTO audit_event (
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          actor_id,
          actor_role,
          jurisdiction_id,
          correlation_id,
          occurred_at,
          payload
        ) VALUES (
          ${auditEvent.id},
          ${auditEvent.eventType},
          ${auditEvent.aggregateType ?? null},
          ${auditEvent.aggregateId ?? null},
          ${auditEvent.actorId},
          ${auditEvent.actorRole},
          ${auditEvent.jurisdictionId ?? null},
          ${auditEvent.correlationId},
          ${auditEvent.occurredAt},
          ${tx.json(auditEvent.payload as unknown as Parameters<typeof tx.json>[0])}
        )
      `;
    });

    return evidence;
  }

  async findApprovalEvidenceById(id: string): Promise<ApprovalEvidence | null> {
    const rows = await this.sql<ApprovalEvidenceRow[]>`
      SELECT
        id,
        approval_identifier,
        approving_authority,
        approved_on::text,
        source_document_sha256,
        effective_from::text,
        effective_to::text,
        created_by,
        created_at::text
      FROM approval_evidence
      WHERE id = ${id}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      approvalIdentifier: row.approval_identifier,
      approvingAuthority: row.approving_authority,
      approvedOn: row.approved_on,
      sourceDocumentSha256: row.source_document_sha256,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? undefined,
      createdBy: row.created_by,
      createdAt: row.created_at
    });
  }

  async findApprovalEvidenceByIdentifier(identifier: string): Promise<ApprovalEvidence | null> {
    const rows = await this.sql<ApprovalEvidenceRow[]>`
      SELECT
        id,
        approval_identifier,
        approving_authority,
        approved_on::text,
        source_document_sha256,
        effective_from::text,
        effective_to::text,
        created_by,
        created_at::text
      FROM approval_evidence
      WHERE approval_identifier = ${identifier}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      approvalIdentifier: row.approval_identifier,
      approvingAuthority: row.approving_authority,
      approvedOn: row.approved_on,
      sourceDocumentSha256: row.source_document_sha256,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? undefined,
      createdBy: row.created_by,
      createdAt: row.created_at
    });
  }

  async createVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO legal_configuration_version (
          id,
          config_type,
          code,
          version_no,
          effective_from,
          effective_to,
          payload,
          status,
          approval_evidence_id,
          created_at
        ) VALUES (
          ${version.id},
          ${version.configType},
          ${version.code},
          ${version.versionNo},
          ${version.effectiveFrom},
          ${version.effectiveTo ?? null},
          ${tx.json(version.payload as unknown as Parameters<typeof tx.json>[0])},
          ${version.status},
          ${version.approvalEvidenceId ?? null},
          ${version.createdAt}
        )
      `;

      const auditEvent = createAuditEvent({
        eventType: "CONFIG_VERSION_CREATED",
        aggregateType: "LEGAL_CONFIGURATION_VERSION",
        aggregateId: version.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: version.createdAt,
        payload: {
          configType: version.configType,
          code: version.code,
          versionNo: version.versionNo,
          status: version.status,
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
          approvalEvidenceId: version.approvalEvidenceId
        }
      });

      await tx`
        INSERT INTO audit_event (
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          actor_id,
          actor_role,
          jurisdiction_id,
          correlation_id,
          occurred_at,
          payload
        ) VALUES (
          ${auditEvent.id},
          ${auditEvent.eventType},
          ${auditEvent.aggregateType ?? null},
          ${auditEvent.aggregateId ?? null},
          ${auditEvent.actorId},
          ${auditEvent.actorRole},
          ${auditEvent.jurisdictionId ?? null},
          ${auditEvent.correlationId},
          ${auditEvent.occurredAt},
          ${tx.json(auditEvent.payload as unknown as Parameters<typeof tx.json>[0])}
        )
      `;
    });

    return version;
  }

  async updateVersion(
    version: LegalConfigurationVersion,
    auditContext: AuditContext
  ): Promise<LegalConfigurationVersion> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE legal_configuration_version
        SET
          status = ${version.status},
          approval_evidence_id = ${version.approvalEvidenceId ?? null}
        WHERE id = ${version.id}
      `;

      const auditEvent = createAuditEvent({
        eventType: `CONFIG_VERSION_${version.status}`,
        aggregateType: "LEGAL_CONFIGURATION_VERSION",
        aggregateId: version.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: new Date().toISOString(),
        payload: {
          configType: version.configType,
          code: version.code,
          versionNo: version.versionNo,
          status: version.status,
          approvalEvidenceId: version.approvalEvidenceId
        }
      });

      await tx`
        INSERT INTO audit_event (
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          actor_id,
          actor_role,
          jurisdiction_id,
          correlation_id,
          occurred_at,
          payload
        ) VALUES (
          ${auditEvent.id},
          ${auditEvent.eventType},
          ${auditEvent.aggregateType ?? null},
          ${auditEvent.aggregateId ?? null},
          ${auditEvent.actorId},
          ${auditEvent.actorRole},
          ${auditEvent.jurisdictionId ?? null},
          ${auditEvent.correlationId},
          ${auditEvent.occurredAt},
          ${tx.json(auditEvent.payload as unknown as Parameters<typeof tx.json>[0])}
        )
      `;
    });

    return version;
  }

  async findVersion(
    configType: ConfigType,
    code: string,
    versionNo: number
  ): Promise<LegalConfigurationVersion | null> {
    const rows = await this.sql<LegalConfigRow[]>`
      SELECT
        id,
        config_type,
        code,
        version_no,
        effective_from::text,
        effective_to::text,
        payload,
        status,
        approval_evidence_id,
        created_at::text
      FROM legal_configuration_version
      WHERE config_type = ${configType} AND code = ${code.toUpperCase()} AND version_no = ${versionNo}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      configType: row.config_type as ConfigType,
      code: row.code,
      versionNo: row.version_no,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? undefined,
      payload: Object.freeze(row.payload),
      status: row.status as LegalConfigurationVersion["status"],
      approvalEvidenceId: row.approval_evidence_id ?? undefined,
      createdAt: row.created_at
    });
  }

  async findActiveVersion(
    configType: ConfigType,
    code: string,
    asOf: string
  ): Promise<LegalConfigurationVersion | null> {
    const versions = await this.listVersions(configType, code);
    return findActiveConfiguration(versions, configType, code, asOf);
  }

  async listVersions(
    configType?: ConfigType,
    code?: string
  ): Promise<readonly LegalConfigurationVersion[]> {
    const rows = await this.sql<LegalConfigRow[]>`
      SELECT
        id,
        config_type,
        code,
        version_no,
        effective_from::text,
        effective_to::text,
        payload,
        status,
        approval_evidence_id,
        created_at::text
      FROM legal_configuration_version
      WHERE (${configType ?? null}::text IS NULL OR config_type = ${configType ?? null})
        AND (${code ? code.toUpperCase() : null}::text IS NULL OR code = ${code ? code.toUpperCase() : null})
      ORDER BY version_no DESC
    `;

    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          configType: row.config_type as ConfigType,
          code: row.code,
          versionNo: row.version_no,
          effectiveFrom: row.effective_from,
          effectiveTo: row.effective_to ?? undefined,
          payload: Object.freeze(row.payload),
          status: row.status as LegalConfigurationVersion["status"],
          approvalEvidenceId: row.approval_evidence_id ?? undefined,
          createdAt: row.created_at
        })
      )
    );
  }
}

import type { Sql } from "postgres";
import type { Assessment, AssessmentStatus, AssessmentVersion, AuditContext } from "@ptas/domain";
import { createAuditEvent } from "@ptas/domain";
import type { AppendOnlyAuditRepository } from "./audit-repository.js";

export interface AssessmentRepository {
  findByTaxpayerAndYear(taxpayerId: string, financialYearId: string): Promise<Assessment | null>;
  findById(id: string): Promise<Assessment | null>;
  findVersion(assessmentId: string, versionNo: number): Promise<AssessmentVersion | null>;
  listVersions(assessmentId: string): Promise<readonly AssessmentVersion[]>;
  createAssessment(
    assessment: Assessment,
    initialVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }>;
  updateVersion(
    assessment: Assessment,
    version: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }>;
  createRevision(
    assessment: Assessment,
    newVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }>;
}

export class InMemoryAssessmentRepository implements AssessmentRepository {
  private readonly assessmentsById = new Map<string, Assessment>();
  private readonly taxpayerYearToId = new Map<string, string>(); // taxpayerId:fyId -> assessmentId

  private readonly versionsById = new Map<string, AssessmentVersion>();
  private readonly assessmentVersions = new Map<string, string[]>(); // assessmentId -> versionId[]

  constructor(private readonly auditRepo?: AppendOnlyAuditRepository) {}

  private makeTaxpayerYearKey(taxpayerId: string, financialYearId: string): string {
    return `${taxpayerId}:${financialYearId}`;
  }

  async findByTaxpayerAndYear(
    taxpayerId: string,
    financialYearId: string
  ): Promise<Assessment | null> {
    const key = this.makeTaxpayerYearKey(taxpayerId, financialYearId);
    const id = this.taxpayerYearToId.get(key);
    if (!id) return null;
    return this.findById(id);
  }

  async findById(id: string): Promise<Assessment | null> {
    const found = this.assessmentsById.get(id);
    return found ? Object.freeze({ ...found }) : null;
  }

  async findVersion(assessmentId: string, versionNo: number): Promise<AssessmentVersion | null> {
    const vIds = this.assessmentVersions.get(assessmentId) ?? [];
    for (const vId of vIds) {
      const v = this.versionsById.get(vId);
      if (v && v.versionNo === versionNo) {
        return Object.freeze({ ...v });
      }
    }
    return null;
  }

  async listVersions(assessmentId: string): Promise<readonly AssessmentVersion[]> {
    const vIds = this.assessmentVersions.get(assessmentId) ?? [];
    const list: AssessmentVersion[] = [];
    for (const vId of vIds) {
      const v = this.versionsById.get(vId);
      if (v) {
        list.push(Object.freeze({ ...v }));
      }
    }
    list.sort((a, b) => a.versionNo - b.versionNo);
    return Object.freeze(list);
  }

  async createAssessment(
    assessment: Assessment,
    initialVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    // Non-negotiable domain rule: Never create a second assessment for the same taxpayer and financial year.
    const key = this.makeTaxpayerYearKey(assessment.taxpayerId, assessment.financialYearId);
    if (this.taxpayerYearToId.has(key)) {
      throw new Error(
        `Assessment already exists for taxpayer ${assessment.taxpayerId} and financial year ${assessment.financialYearId}. Revisions must belong to the same assessment.`
      );
    }

    if (this.assessmentsById.has(assessment.id)) {
      throw new Error(`Assessment with id ${assessment.id} already exists`);
    }

    const frozenAssessment = Object.freeze({ ...assessment });
    const frozenVersion = Object.freeze({ ...initialVersion });

    this.assessmentsById.set(assessment.id, frozenAssessment);
    this.taxpayerYearToId.set(key, assessment.id);

    this.versionsById.set(initialVersion.id, frozenVersion);
    this.assessmentVersions.set(assessment.id, [initialVersion.id]);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: "ASSESSMENT_CREATED",
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: assessment.createdAt,
        payload: {
          assessmentId: assessment.id,
          taxpayerId: assessment.taxpayerId,
          financialYearId: assessment.financialYearId,
          versionNo: initialVersion.versionNo,
          status: assessment.status
        }
      });
      await this.auditRepo.append(event);
    }

    return { assessment: frozenAssessment, version: frozenVersion };
  }

  async updateVersion(
    assessment: Assessment,
    version: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    const existingVersion = this.versionsById.get(version.id);
    if (!existingVersion) {
      throw new Error(`Assessment version ${version.id} not found`);
    }

    // Non-negotiable domain rule: Never edit an approved assessment version in place.
    if (existingVersion.status === "APPROVED") {
      throw new Error(
        `Cannot edit approved assessment version v${existingVersion.versionNo} in place (immutable)`
      );
    }

    // Schema constraint: CHECK ((status = 'APPROVED') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
    if (version.status === "APPROVED" && (!version.approvedBy || !version.approvedAt)) {
      throw new Error("Approved assessment version requires approvedBy and approvedAt");
    }

    const frozenAssessment = Object.freeze({ ...assessment });
    const frozenVersion = Object.freeze({ ...version });

    this.assessmentsById.set(assessment.id, frozenAssessment);
    this.versionsById.set(version.id, frozenVersion);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: `ASSESSMENT_${version.status}`,
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: version.approvedAt ?? new Date().toISOString(),
        payload: {
          assessmentId: assessment.id,
          versionNo: version.versionNo,
          fromStatus: existingVersion.status,
          toStatus: version.status,
          approvedBy: version.approvedBy,
          approvalEvidenceId: version.approvalEvidenceId
        }
      });
      await this.auditRepo.append(event);
    }

    return { assessment: frozenAssessment, version: frozenVersion };
  }

  async createRevision(
    assessment: Assessment,
    newVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    const existing = this.assessmentsById.get(assessment.id);
    if (!existing) {
      throw new Error(`Assessment ${assessment.id} not found`);
    }

    const frozenAssessment = Object.freeze({ ...assessment });
    const frozenVersion = Object.freeze({ ...newVersion });

    this.assessmentsById.set(assessment.id, frozenAssessment);
    this.versionsById.set(newVersion.id, frozenVersion);

    const vList = this.assessmentVersions.get(assessment.id) ?? [];
    vList.push(newVersion.id);
    this.assessmentVersions.set(assessment.id, vList);

    if (this.auditRepo) {
      const event = createAuditEvent({
        eventType: "ASSESSMENT_REVISION_CREATED",
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: newVersion.createdAt,
        payload: {
          assessmentId: assessment.id,
          versionNo: newVersion.versionNo,
          status: newVersion.status,
          reason: newVersion.reason
        }
      });
      await this.auditRepo.append(event);
    }

    return { assessment: frozenAssessment, version: frozenVersion };
  }
}

interface AssessmentRow {
  id: string;
  taxpayer_id: string;
  financial_year_id: string;
  status: string;
  current_version_no: number;
  created_by: string;
  created_at: string;
}

interface AssessmentVersionRow {
  id: string;
  assessment_id: string;
  version_no: number;
  snapshot: Record<string, unknown>;
  status: string;
  reason: string | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_evidence_id: string | null;
}

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly sql: Sql) {}

  async findByTaxpayerAndYear(
    taxpayerId: string,
    financialYearId: string
  ): Promise<Assessment | null> {
    const rows = await this.sql<AssessmentRow[]>`
      SELECT
        id,
        taxpayer_id,
        financial_year_id,
        status,
        current_version_no,
        created_by,
        created_at::text
      FROM assessment
      WHERE taxpayer_id = ${taxpayerId} AND financial_year_id = ${financialYearId}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      taxpayerId: row.taxpayer_id,
      financialYearId: row.financial_year_id,
      status: row.status as AssessmentStatus,
      currentVersionNo: row.current_version_no,
      createdBy: row.created_by,
      createdAt: row.created_at
    });
  }

  async findById(id: string): Promise<Assessment | null> {
    const rows = await this.sql<AssessmentRow[]>`
      SELECT
        id,
        taxpayer_id,
        financial_year_id,
        status,
        current_version_no,
        created_by,
        created_at::text
      FROM assessment
      WHERE id = ${id}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      taxpayerId: row.taxpayer_id,
      financialYearId: row.financial_year_id,
      status: row.status as AssessmentStatus,
      currentVersionNo: row.current_version_no,
      createdBy: row.created_by,
      createdAt: row.created_at
    });
  }

  async findVersion(assessmentId: string, versionNo: number): Promise<AssessmentVersion | null> {
    const rows = await this.sql<AssessmentVersionRow[]>`
      SELECT
        id,
        assessment_id,
        version_no,
        snapshot,
        status,
        reason,
        created_by,
        created_at::text,
        approved_by,
        approved_at::text,
        approval_evidence_id
      FROM assessment_version
      WHERE assessment_id = ${assessmentId} AND version_no = ${versionNo}
    `;

    const row = rows[0];
    if (!row) return null;

    return Object.freeze({
      id: row.id,
      assessmentId: row.assessment_id,
      versionNo: row.version_no,
      snapshot: Object.freeze(row.snapshot),
      status: row.status as AssessmentStatus,
      reason: row.reason ?? undefined,
      createdBy: row.created_by,
      createdAt: row.created_at,
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      approvalEvidenceId: row.approval_evidence_id ?? undefined
    });
  }

  async listVersions(assessmentId: string): Promise<readonly AssessmentVersion[]> {
    const rows = await this.sql<AssessmentVersionRow[]>`
      SELECT
        id,
        assessment_id,
        version_no,
        snapshot,
        status,
        reason,
        created_by,
        created_at::text,
        approved_by,
        approved_at::text,
        approval_evidence_id
      FROM assessment_version
      WHERE assessment_id = ${assessmentId}
      ORDER BY version_no ASC
    `;

    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          assessmentId: row.assessment_id,
          versionNo: row.version_no,
          snapshot: Object.freeze(row.snapshot),
          status: row.status as AssessmentStatus,
          reason: row.reason ?? undefined,
          createdBy: row.created_by,
          createdAt: row.created_at,
          approvedBy: row.approved_by ?? undefined,
          approvedAt: row.approved_at ?? undefined,
          approvalEvidenceId: row.approval_evidence_id ?? undefined
        })
      )
    );
  }

  async createAssessment(
    assessment: Assessment,
    initialVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO assessment (
          id,
          taxpayer_id,
          financial_year_id,
          status,
          current_version_no,
          created_by,
          created_at
        ) VALUES (
          ${assessment.id},
          ${assessment.taxpayerId},
          ${assessment.financialYearId},
          ${assessment.status},
          ${assessment.currentVersionNo},
          ${assessment.createdBy},
          ${assessment.createdAt}
        )
      `;

      await tx`
        INSERT INTO assessment_version (
          id,
          assessment_id,
          version_no,
          snapshot,
          status,
          reason,
          created_by,
          created_at
        ) VALUES (
          ${initialVersion.id},
          ${initialVersion.assessmentId},
          ${initialVersion.versionNo},
          ${tx.json(initialVersion.snapshot as unknown as Parameters<typeof tx.json>[0])},
          ${initialVersion.status},
          ${initialVersion.reason ?? null},
          ${initialVersion.createdBy},
          ${initialVersion.createdAt}
        )
      `;

      const auditEvent = createAuditEvent({
        eventType: "ASSESSMENT_CREATED",
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: assessment.createdAt,
        payload: {
          assessmentId: assessment.id,
          taxpayerId: assessment.taxpayerId,
          financialYearId: assessment.financialYearId,
          versionNo: initialVersion.versionNo,
          status: assessment.status
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

    return { assessment, version: initialVersion };
  }

  async updateVersion(
    assessment: Assessment,
    version: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE assessment
        SET status = ${assessment.status}
        WHERE id = ${assessment.id}
      `;

      await tx`
        UPDATE assessment_version
        SET
          status = ${version.status},
          reason = ${version.reason ?? null},
          approved_by = ${version.approvedBy ?? null},
          approved_at = ${version.approvedAt ?? null},
          approval_evidence_id = ${version.approvalEvidenceId ?? null}
        WHERE id = ${version.id}
      `;

      const auditEvent = createAuditEvent({
        eventType: `ASSESSMENT_${version.status}`,
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: version.approvedAt ?? new Date().toISOString(),
        payload: {
          assessmentId: assessment.id,
          versionNo: version.versionNo,
          status: version.status,
          approvedBy: version.approvedBy,
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

    return { assessment, version };
  }

  async createRevision(
    assessment: Assessment,
    newVersion: AssessmentVersion,
    auditContext: AuditContext
  ): Promise<{ assessment: Assessment; version: AssessmentVersion }> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE assessment
        SET
          status = ${assessment.status},
          current_version_no = ${assessment.currentVersionNo}
        WHERE id = ${assessment.id}
      `;

      await tx`
        INSERT INTO assessment_version (
          id,
          assessment_id,
          version_no,
          snapshot,
          status,
          reason,
          created_by,
          created_at
        ) VALUES (
          ${newVersion.id},
          ${newVersion.assessmentId},
          ${newVersion.versionNo},
          ${tx.json(newVersion.snapshot as unknown as Parameters<typeof tx.json>[0])},
          ${newVersion.status},
          ${newVersion.reason ?? null},
          ${newVersion.createdBy},
          ${newVersion.createdAt}
        )
      `;

      const auditEvent = createAuditEvent({
        eventType: "ASSESSMENT_REVISION_CREATED",
        aggregateType: "ASSESSMENT",
        aggregateId: assessment.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: newVersion.createdAt,
        payload: {
          assessmentId: assessment.id,
          versionNo: newVersion.versionNo,
          status: newVersion.status,
          reason: newVersion.reason
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

    return { assessment, version: newVersion };
  }
}

import type { Sql } from "postgres";
import type { AuditContext, DocumentRecord } from "@ptas/domain";
import { createAuditEvent } from "@ptas/domain";
import type { AppendOnlyAuditRepository } from "./audit-repository.js";

export interface DocumentRepository {
  saveDocument(doc: DocumentRecord, auditContext: AuditContext): Promise<DocumentRecord>;
  findById(id: string): Promise<DocumentRecord | null>;
  findByObjectKey(objectKey: string): Promise<DocumentRecord | null>;
  listByAggregate(aggregateType: string, aggregateId: string): Promise<readonly DocumentRecord[]>;
}

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly docsById = new Map<string, DocumentRecord>();
  private readonly docsByObjectKey = new Map<string, string>(); // objectKey -> id
  private readonly aggregateDocs = new Map<string, string[]>(); // `${aggregateType}:${aggregateId}` -> id[]

  constructor(private readonly auditRepo?: AppendOnlyAuditRepository) {}

  private makeAggregateKey(aggregateType: string, aggregateId: string): string {
    return `${aggregateType}:${aggregateId}`;
  }

  async saveDocument(doc: DocumentRecord, auditContext: AuditContext): Promise<DocumentRecord> {
    if (!doc.sha256 || doc.sha256.length !== 64) {
      throw new Error("Document sha256 must be a 64-character hash");
    }

    if (this.docsById.has(doc.id)) {
      throw new Error(`Document with id '${doc.id}' already exists`);
    }

    if (this.docsByObjectKey.has(doc.objectKey)) {
      throw new Error(`Unique constraint violation: objectKey '${doc.objectKey}' already exists`);
    }

    const frozenDoc: DocumentRecord = Object.freeze({
      ...doc,
      snapshot: Object.freeze({ ...doc.snapshot })
    });

    this.docsById.set(doc.id, frozenDoc);
    this.docsByObjectKey.set(doc.objectKey, doc.id);

    const aggKey = this.makeAggregateKey(doc.aggregateType, doc.aggregateId);
    const existingList = this.aggregateDocs.get(aggKey) ?? [];
    existingList.push(doc.id);
    this.aggregateDocs.set(aggKey, existingList);

    if (this.auditRepo) {
      const auditEvent = createAuditEvent({
        eventType: "DOCUMENT_GENERATED",
        aggregateType: doc.aggregateType,
        aggregateId: doc.aggregateId,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: doc.generatedAt,
        payload: {
          documentId: doc.id,
          templateConfigId: doc.templateConfigId,
          objectKey: doc.objectKey,
          sha256: doc.sha256,
          isProvisional: doc.isProvisional
        }
      });
      await this.auditRepo.append(auditEvent);
    }

    return frozenDoc;
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const doc = this.docsById.get(id);
    return doc ? Object.freeze({ ...doc }) : null;
  }

  async findByObjectKey(objectKey: string): Promise<DocumentRecord | null> {
    const id = this.docsByObjectKey.get(objectKey);
    if (!id) return null;
    return this.findById(id);
  }

  async listByAggregate(
    aggregateType: string,
    aggregateId: string
  ): Promise<readonly DocumentRecord[]> {
    const aggKey = this.makeAggregateKey(aggregateType, aggregateId);
    const docIds = this.aggregateDocs.get(aggKey) ?? [];
    const list: DocumentRecord[] = [];

    for (const id of docIds) {
      const doc = this.docsById.get(id);
      if (doc) {
        list.push(Object.freeze({ ...doc }));
      }
    }

    return Object.freeze(list);
  }
}

interface DocumentRecordRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  template_config_id: string;
  object_key: string;
  sha256: string;
  generated_at: Date | string;
  generated_by: string;
  snapshot: Record<string, unknown>;
}

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly sql: Sql) {}

  private mapRow(row: DocumentRecordRow): DocumentRecord {
    return Object.freeze({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      templateConfigId: row.template_config_id,
      objectKey: row.object_key,
      sha256: row.sha256,
      generatedAt:
        typeof row.generated_at === "string" ? row.generated_at : row.generated_at.toISOString(),
      generatedBy: row.generated_by,
      snapshot: Object.freeze({ ...(row.snapshot ?? {}) }),
      isProvisional: false, // Default reconstructed metadata; source document contains rendered header
      renderedContent: ""
    });
  }

  async saveDocument(doc: DocumentRecord, auditContext: AuditContext): Promise<DocumentRecord> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<DocumentRecordRow[]>`
        INSERT INTO document_record (
          id,
          aggregate_type,
          aggregate_id,
          template_config_id,
          object_key,
          sha256,
          generated_at,
          generated_by,
          snapshot
        ) VALUES (
          ${doc.id},
          ${doc.aggregateType},
          ${doc.aggregateId},
          ${doc.templateConfigId},
          ${doc.objectKey},
          ${doc.sha256},
          ${doc.generatedAt},
          ${doc.generatedBy},
          ${tx.json(doc.snapshot as unknown as Parameters<typeof tx.json>[0])}
        )
        RETURNING
          id,
          aggregate_type,
          aggregate_id,
          template_config_id,
          object_key,
          sha256,
          generated_at,
          generated_by,
          snapshot
      `;

      const auditEvent = createAuditEvent({
        eventType: "DOCUMENT_GENERATED",
        aggregateType: doc.aggregateType,
        aggregateId: doc.aggregateId,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: doc.generatedAt,
        payload: {
          documentId: doc.id,
          templateConfigId: doc.templateConfigId,
          objectKey: doc.objectKey,
          sha256: doc.sha256,
          isProvisional: doc.isProvisional
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

      return this.mapRow(rows[0]!);
    });
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const rows = await this.sql<DocumentRecordRow[]>`
      SELECT
        id,
        aggregate_type,
        aggregate_id,
        template_config_id,
        object_key,
        sha256,
        generated_at,
        generated_by,
        snapshot
      FROM document_record
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]!);
  }

  async findByObjectKey(objectKey: string): Promise<DocumentRecord | null> {
    const rows = await this.sql<DocumentRecordRow[]>`
      SELECT
        id,
        aggregate_type,
        aggregate_id,
        template_config_id,
        object_key,
        sha256,
        generated_at,
        generated_by,
        snapshot
      FROM document_record
      WHERE object_key = ${objectKey}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]!);
  }

  async listByAggregate(
    aggregateType: string,
    aggregateId: string
  ): Promise<readonly DocumentRecord[]> {
    const rows = await this.sql<DocumentRecordRow[]>`
      SELECT
        id,
        aggregate_type,
        aggregate_id,
        template_config_id,
        object_key,
        sha256,
        generated_at,
        generated_by,
        snapshot
      FROM document_record
      WHERE aggregate_type = ${aggregateType}
        AND aggregate_id = ${aggregateId}
      ORDER BY generated_at DESC
    `;
    return Object.freeze(rows.map((r) => this.mapRow(r)));
  }
}

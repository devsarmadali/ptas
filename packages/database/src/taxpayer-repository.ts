import type { Sql } from "postgres";
import type {
  AuditContext,
  CandidateTaxpayerInput,
  DuplicateMatch,
  Taxpayer,
  TaxpayerIdentifier,
  TaxpayerSearchQuery,
  TaxpayerSearchResult
} from "@ptas/domain";
import {
  createAuditEvent,
  filterTaxpayersByJurisdiction,
  findDuplicateCandidates
} from "@ptas/domain";
import type { AppendOnlyAuditRepository } from "./audit-repository.js";

export interface TaxpayerRepository {
  findById(id: string): Promise<Taxpayer | null>;
  create(taxpayer: Taxpayer, auditContext: AuditContext): Promise<Taxpayer>;
  search(query: TaxpayerSearchQuery): Promise<readonly TaxpayerSearchResult[]>;
  findDuplicateCandidates(candidate: CandidateTaxpayerInput): Promise<readonly DuplicateMatch[]>;
  listAll?(): Promise<readonly Taxpayer[]>;
}

export class InMemoryTaxpayerRepository implements TaxpayerRepository {
  private readonly taxpayers = new Map<string, Taxpayer>();

  constructor(private readonly auditRepo?: AppendOnlyAuditRepository) {}

  async findById(id: string): Promise<Taxpayer | null> {
    const found = this.taxpayers.get(id);
    return found ? Object.freeze({ ...found }) : null;
  }

  async create(taxpayer: Taxpayer, auditContext: AuditContext): Promise<Taxpayer> {
    if (this.taxpayers.has(taxpayer.id)) {
      throw new Error(`Taxpayer with id ${taxpayer.id} already exists`);
    }

    const frozen = Object.freeze({ ...taxpayer });
    this.taxpayers.set(taxpayer.id, frozen);

    if (this.auditRepo) {
      const auditEvent = createAuditEvent({
        eventType: "TAXPAYER_CREATED",
        aggregateType: "TAXPAYER",
        aggregateId: taxpayer.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: taxpayer.createdAt,
        payload: {
          taxpayerId: taxpayer.id,
          displayName: taxpayer.displayName,
          status: taxpayer.status,
          currentCircleId: taxpayer.currentCircleId,
          identifierCount: taxpayer.identifiers.length
        }
      });
      await this.auditRepo.append(auditEvent);
    }

    return frozen;
  }

  async search(query: TaxpayerSearchQuery): Promise<readonly TaxpayerSearchResult[]> {
    const all = Array.from(this.taxpayers.values());
    return filterTaxpayersByJurisdiction(all, query);
  }

  async findDuplicateCandidates(
    candidate: CandidateTaxpayerInput
  ): Promise<readonly DuplicateMatch[]> {
    const all = Array.from(this.taxpayers.values());
    return findDuplicateCandidates(candidate, all);
  }

  async listAll(): Promise<readonly Taxpayer[]> {
    return Object.freeze(Array.from(this.taxpayers.values()));
  }
}

interface TaxpayerRow {
  id: string;
  permanent_demand_no: string | null;
  display_name: string;
  status: string;
  current_circle_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  row_version: string | number;
}

interface TaxpayerIdentifierRow {
  id: string;
  taxpayer_id: string;
  identifier_type: string;
  normalized_value: string;
  masked_value: string;
  valid_from: string;
  valid_to: string | null;
}

export class PostgresTaxpayerRepository implements TaxpayerRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<Taxpayer | null> {
    const rows = await this.sql<TaxpayerRow[]>`
      SELECT
        id,
        permanent_demand_no,
        display_name,
        status,
        current_circle_id,
        created_at::text,
        created_by,
        updated_at::text,
        row_version
      FROM taxpayer
      WHERE id = ${id}
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    const idRows = await this.sql<TaxpayerIdentifierRow[]>`
      SELECT
        id,
        taxpayer_id,
        identifier_type,
        normalized_value,
        masked_value,
        valid_from::text,
        valid_to::text
      FROM taxpayer_identifier
      WHERE taxpayer_id = ${id}
    `;

    const identifiers: TaxpayerIdentifier[] = idRows.map((ir) =>
      Object.freeze({
        identifierType: ir.identifier_type as TaxpayerIdentifier["identifierType"],
        normalizedValue: ir.normalized_value,
        maskedValue: ir.masked_value,
        validFrom: ir.valid_from,
        validTo: ir.valid_to ?? undefined
      })
    );

    return Object.freeze({
      id: row.id,
      permanentDemandNo: row.permanent_demand_no ?? undefined,
      displayName: row.display_name,
      status: row.status as Taxpayer["status"],
      currentCircleId: row.current_circle_id,
      identifiers: Object.freeze(identifiers),
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      rowVersion: Number(row.row_version)
    });
  }

  async create(taxpayer: Taxpayer, auditContext: AuditContext): Promise<Taxpayer> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO taxpayer (
          id,
          permanent_demand_no,
          display_name,
          status,
          current_circle_id,
          created_at,
          created_by,
          updated_at,
          row_version
        ) VALUES (
          ${taxpayer.id},
          ${taxpayer.permanentDemandNo ?? null},
          ${taxpayer.displayName},
          ${taxpayer.status},
          ${taxpayer.currentCircleId},
          ${taxpayer.createdAt},
          ${taxpayer.createdBy},
          ${taxpayer.updatedAt},
          ${taxpayer.rowVersion}
        )
      `;

      for (const idDef of taxpayer.identifiers) {
        await tx`
          INSERT INTO taxpayer_identifier (
            taxpayer_id,
            identifier_type,
            normalized_value,
            masked_value,
            valid_from,
            valid_to
          ) VALUES (
            ${taxpayer.id},
            ${idDef.identifierType},
            ${idDef.normalizedValue},
            ${idDef.maskedValue},
            ${idDef.validFrom},
            ${idDef.validTo ?? null}
          )
        `;
      }

      const auditEvent = createAuditEvent({
        eventType: "TAXPAYER_CREATED",
        aggregateType: "TAXPAYER",
        aggregateId: taxpayer.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: taxpayer.createdAt,
        payload: {
          taxpayerId: taxpayer.id,
          displayName: taxpayer.displayName,
          status: taxpayer.status,
          currentCircleId: taxpayer.currentCircleId,
          identifierCount: taxpayer.identifiers.length
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

    return taxpayer;
  }

  async search(query: TaxpayerSearchQuery): Promise<readonly TaxpayerSearchResult[]> {
    // Read all taxpayers accessible within jurisdiction and project masked results
    const rows = await this.sql<TaxpayerRow[]>`
      SELECT
        id,
        permanent_demand_no,
        display_name,
        status,
        current_circle_id,
        created_at::text,
        created_by,
        updated_at::text,
        row_version
      FROM taxpayer
      ORDER BY created_at DESC
    `;

    const idRows = await this.sql<TaxpayerIdentifierRow[]>`
      SELECT
        id,
        taxpayer_id,
        identifier_type,
        normalized_value,
        masked_value,
        valid_from::text,
        valid_to::text
      FROM taxpayer_identifier
    `;

    const idMap = new Map<string, TaxpayerIdentifier[]>();
    for (const ir of idRows) {
      const list = idMap.get(ir.taxpayer_id) ?? [];
      list.push(
        Object.freeze({
          identifierType: ir.identifier_type as TaxpayerIdentifier["identifierType"],
          normalizedValue: ir.normalized_value,
          maskedValue: ir.masked_value,
          validFrom: ir.valid_from,
          validTo: ir.valid_to ?? undefined
        })
      );
      idMap.set(ir.taxpayer_id, list);
    }

    const allTaxpayers: Taxpayer[] = rows.map((r) =>
      Object.freeze({
        id: r.id,
        permanentDemandNo: r.permanent_demand_no ?? undefined,
        displayName: r.display_name,
        status: r.status as Taxpayer["status"],
        currentCircleId: r.current_circle_id,
        identifiers: Object.freeze(idMap.get(r.id) ?? []),
        createdAt: r.created_at,
        createdBy: r.created_by,
        updatedAt: r.updated_at,
        rowVersion: Number(r.row_version)
      })
    );

    return filterTaxpayersByJurisdiction(allTaxpayers, query);
  }

  async findDuplicateCandidates(
    candidate: CandidateTaxpayerInput
  ): Promise<readonly DuplicateMatch[]> {
    const taxpayers = await this.listAll();
    return findDuplicateCandidates(candidate, taxpayers);
  }

  async listAll(): Promise<readonly Taxpayer[]> {
    const rows = await this.sql<TaxpayerRow[]>`
      SELECT
        id,
        permanent_demand_no,
        display_name,
        status,
        current_circle_id,
        created_at::text,
        created_by,
        updated_at::text,
        row_version
      FROM taxpayer
    `;

    const idRows = await this.sql<TaxpayerIdentifierRow[]>`
      SELECT
        id,
        taxpayer_id,
        identifier_type,
        normalized_value,
        masked_value,
        valid_from::text,
        valid_to::text
      FROM taxpayer_identifier
    `;

    const idMap = new Map<string, TaxpayerIdentifier[]>();
    for (const ir of idRows) {
      const list = idMap.get(ir.taxpayer_id) ?? [];
      list.push(
        Object.freeze({
          identifierType: ir.identifier_type as TaxpayerIdentifier["identifierType"],
          normalizedValue: ir.normalized_value,
          maskedValue: ir.masked_value,
          validFrom: ir.valid_from,
          validTo: ir.valid_to ?? undefined
        })
      );
      idMap.set(ir.taxpayer_id, list);
    }

    return Object.freeze(
      rows.map((r) =>
        Object.freeze({
          id: r.id,
          permanentDemandNo: r.permanent_demand_no ?? undefined,
          displayName: r.display_name,
          status: r.status as Taxpayer["status"],
          currentCircleId: r.current_circle_id,
          identifiers: Object.freeze(idMap.get(r.id) ?? []),
          createdAt: r.created_at,
          createdBy: r.created_by,
          updatedAt: r.updated_at,
          rowVersion: Number(r.row_version)
        })
      )
    );
  }
}

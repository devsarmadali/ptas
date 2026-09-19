import type { Sql } from "postgres";
import type {
  AuditContext,
  DemandLedgerEntry,
  DemandLedgerEntryType,
  DemandUnit
} from "@ptas/domain";
import { assertLedgerEntryImmutable, computeLedgerBalance, createAuditEvent } from "@ptas/domain";
import type { AppendOnlyAuditRepository } from "./audit-repository.js";

export interface DemandLedgerRepository {
  findOrCreateDemandUnit(taxpayerId: string, permanentDemandNo: string): Promise<DemandUnit>;
  findDemandUnitByTaxpayerId(taxpayerId: string): Promise<DemandUnit | null>;
  findDemandUnitById(id: string): Promise<DemandUnit | null>;
  postEntry(entry: DemandLedgerEntry, auditContext: AuditContext): Promise<DemandLedgerEntry>;
  listEntries(
    demandUnitId: string,
    financialYearId?: string
  ): Promise<readonly DemandLedgerEntry[]>;
  getBalance(demandUnitId: string, financialYearId?: string): Promise<number>;
}

export class InMemoryDemandLedgerRepository implements DemandLedgerRepository {
  private readonly unitsById = new Map<string, DemandUnit>();
  private readonly taxpayerToUnitId = new Map<string, string>();
  private readonly entriesById = new Map<string, DemandLedgerEntry>();
  private readonly unitEntries = new Map<string, string[]>(); // demandUnitId -> entryId[]
  private readonly idempotencyKeys = new Set<string>(); // `${demandUnitId}:${idempotencyKey}`

  constructor(private readonly auditRepo?: AppendOnlyAuditRepository) {}

  async findOrCreateDemandUnit(taxpayerId: string, permanentDemandNo: string): Promise<DemandUnit> {
    const existingId = this.taxpayerToUnitId.get(taxpayerId);
    if (existingId) {
      const existing = this.unitsById.get(existingId);
      if (existing) return Object.freeze({ ...existing });
    }

    const id = crypto.randomUUID();
    const unit: DemandUnit = Object.freeze({
      id,
      taxpayerId,
      permanentDemandNo,
      createdAt: new Date().toISOString()
    });

    this.unitsById.set(id, unit);
    this.taxpayerToUnitId.set(taxpayerId, id);
    return unit;
  }

  async findDemandUnitByTaxpayerId(taxpayerId: string): Promise<DemandUnit | null> {
    const unitId = this.taxpayerToUnitId.get(taxpayerId);
    if (!unitId) return null;
    const unit = this.unitsById.get(unitId);
    return unit ? Object.freeze({ ...unit }) : null;
  }

  async findDemandUnitById(id: string): Promise<DemandUnit | null> {
    const unit = this.unitsById.get(id);
    return unit ? Object.freeze({ ...unit }) : null;
  }

  async postEntry(
    entry: DemandLedgerEntry,
    auditContext: AuditContext
  ): Promise<DemandLedgerEntry> {
    // Non-negotiable domain rule: Balances and demands are append-only; entries cannot have zero amount
    if (entry.amount === 0) {
      throw new Error("Ledger entry amount cannot be zero (CHECK amount <> 0)");
    }

    // Check self reversal
    if (entry.reversesEntryId && entry.reversesEntryId === entry.id) {
      throw new Error("Ledger entry cannot reverse itself (reverses_entry_id <> id)");
    }

    // Check unique idempotency constraint scoped to demand unit
    const idemKey = `${entry.demandUnitId}:${entry.idempotencyKey}`;
    if (this.idempotencyKeys.has(idemKey)) {
      throw new Error(
        `Unique constraint violation: idempotency_key '${entry.idempotencyKey}' already exists for demand_unit '${entry.demandUnitId}'`
      );
    }

    // Verify reverses entry exists if specified
    if (entry.reversesEntryId && !this.entriesById.has(entry.reversesEntryId)) {
      throw new Error(
        `Referenced original entry '${entry.reversesEntryId}' does not exist for reversal`
      );
    }

    if (this.entriesById.has(entry.id)) {
      throw new Error(`Ledger entry with id '${entry.id}' already exists`);
    }

    const frozenEntry: DemandLedgerEntry = Object.freeze({
      ...entry,
      metadata: Object.freeze({ ...entry.metadata })
    });

    this.entriesById.set(entry.id, frozenEntry);
    this.idempotencyKeys.add(idemKey);

    const entriesForUnit = this.unitEntries.get(entry.demandUnitId) ?? [];
    entriesForUnit.push(entry.id);
    this.unitEntries.set(entry.demandUnitId, entriesForUnit);

    // Audit event generation
    if (this.auditRepo) {
      const auditEvent = createAuditEvent({
        eventType: "DEMAND_LEDGER_POSTED",
        aggregateType: "DEMAND_LEDGER",
        aggregateId: entry.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: entry.postedAt,
        payload: {
          demandUnitId: entry.demandUnitId,
          financialYearId: entry.financialYearId,
          entryType: entry.entryType,
          amount: entry.amount,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          reversesEntryId: entry.reversesEntryId ?? null,
          idempotencyKey: entry.idempotencyKey
        }
      });
      await this.auditRepo.append(auditEvent);
    }

    return frozenEntry;
  }

  async listEntries(
    demandUnitId: string,
    financialYearId?: string
  ): Promise<readonly DemandLedgerEntry[]> {
    const entryIds = this.unitEntries.get(demandUnitId) ?? [];
    const entries: DemandLedgerEntry[] = [];

    for (const id of entryIds) {
      const entry = this.entriesById.get(id);
      if (entry) {
        if (!financialYearId || entry.financialYearId === financialYearId) {
          entries.push(Object.freeze({ ...entry }));
        }
      }
    }

    return Object.freeze(entries);
  }

  async getBalance(demandUnitId: string, financialYearId?: string): Promise<number> {
    const entries = await this.listEntries(demandUnitId, financialYearId);
    return computeLedgerBalance(entries, financialYearId);
  }

  // Non-negotiable domain rule: Never update or delete posted ledger entries
  async updateEntry(): Promise<never> {
    return assertLedgerEntryImmutable();
  }

  async deleteEntry(): Promise<never> {
    return assertLedgerEntryImmutable();
  }
}

interface DemandUnitRow {
  id: string;
  taxpayer_id: string;
  permanent_demand_no: string;
  created_at: Date | string;
}

interface DemandLedgerRow {
  id: string;
  demand_unit_id: string;
  financial_year_id: string;
  entry_type: string;
  amount: string | number;
  source_type: string;
  source_id: string;
  reverses_entry_id: string | null;
  idempotency_key: string;
  correlation_id: string;
  posted_by: string;
  posted_at: Date | string;
  metadata: Record<string, unknown>;
}

export class PostgresDemandLedgerRepository implements DemandLedgerRepository {
  constructor(private readonly sql: Sql) {}

  private mapUnit(row: DemandUnitRow): DemandUnit {
    return Object.freeze({
      id: row.id,
      taxpayerId: row.taxpayer_id,
      permanentDemandNo: row.permanent_demand_no,
      createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString()
    });
  }

  private mapEntry(row: DemandLedgerRow): DemandLedgerEntry {
    return Object.freeze({
      id: row.id,
      demandUnitId: row.demand_unit_id,
      financialYearId: row.financial_year_id,
      entryType: row.entry_type as DemandLedgerEntryType,
      amount: Number(row.amount),
      sourceType: row.source_type,
      sourceId: row.source_id,
      reversesEntryId: row.reverses_entry_id ?? undefined,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      postedBy: row.posted_by,
      postedAt: typeof row.posted_at === "string" ? row.posted_at : row.posted_at.toISOString(),
      metadata: Object.freeze({ ...(row.metadata ?? {}) })
    });
  }

  async findOrCreateDemandUnit(taxpayerId: string, permanentDemandNo: string): Promise<DemandUnit> {
    const rows = await this.sql<DemandUnitRow[]>`
      INSERT INTO demand_unit (
        taxpayer_id,
        permanent_demand_no
      ) VALUES (
        ${taxpayerId},
        ${permanentDemandNo}
      )
      ON CONFLICT (taxpayer_id) DO UPDATE
      SET taxpayer_id = EXCLUDED.taxpayer_id
      RETURNING id, taxpayer_id, permanent_demand_no, created_at
    `;
    return this.mapUnit(rows[0]!);
  }

  async findDemandUnitByTaxpayerId(taxpayerId: string): Promise<DemandUnit | null> {
    const rows = await this.sql<DemandUnitRow[]>`
      SELECT id, taxpayer_id, permanent_demand_no, created_at
      FROM demand_unit
      WHERE taxpayer_id = ${taxpayerId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapUnit(rows[0]!);
  }

  async findDemandUnitById(id: string): Promise<DemandUnit | null> {
    const rows = await this.sql<DemandUnitRow[]>`
      SELECT id, taxpayer_id, permanent_demand_no, created_at
      FROM demand_unit
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return this.mapUnit(rows[0]!);
  }

  async postEntry(
    entry: DemandLedgerEntry,
    auditContext: AuditContext
  ): Promise<DemandLedgerEntry> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<DemandLedgerRow[]>`
        INSERT INTO demand_ledger (
          id,
          demand_unit_id,
          financial_year_id,
          entry_type,
          amount,
          source_type,
          source_id,
          reverses_entry_id,
          idempotency_key,
          correlation_id,
          posted_by,
          posted_at,
          metadata
        ) VALUES (
          ${entry.id},
          ${entry.demandUnitId},
          ${entry.financialYearId},
          ${entry.entryType},
          ${entry.amount},
          ${entry.sourceType},
          ${entry.sourceId},
          ${entry.reversesEntryId ?? null},
          ${entry.idempotencyKey},
          ${entry.correlationId},
          ${entry.postedBy},
          ${entry.postedAt},
          ${tx.json(entry.metadata as unknown as Parameters<typeof tx.json>[0])}
        )
        RETURNING
          id,
          demand_unit_id,
          financial_year_id,
          entry_type,
          amount,
          source_type,
          source_id,
          reverses_entry_id,
          idempotency_key,
          correlation_id,
          posted_by,
          posted_at,
          metadata
      `;

      const auditEvent = createAuditEvent({
        eventType: "DEMAND_LEDGER_POSTED",
        aggregateType: "DEMAND_LEDGER",
        aggregateId: entry.id,
        actor: auditContext.actor,
        correlationId: auditContext.correlationId,
        causationId: auditContext.causationId,
        occurredAt: entry.postedAt,
        payload: {
          demandUnitId: entry.demandUnitId,
          financialYearId: entry.financialYearId,
          entryType: entry.entryType,
          amount: entry.amount,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          reversesEntryId: entry.reversesEntryId ?? null,
          idempotencyKey: entry.idempotencyKey
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

      return this.mapEntry(rows[0]!);
    });
  }

  async listEntries(
    demandUnitId: string,
    financialYearId?: string
  ): Promise<readonly DemandLedgerEntry[]> {
    const rows = financialYearId
      ? await this.sql<DemandLedgerRow[]>`
          SELECT
            id,
            demand_unit_id,
            financial_year_id,
            entry_type,
            amount,
            source_type,
            source_id,
            reverses_entry_id,
            idempotency_key,
            correlation_id,
            posted_by,
            posted_at,
            metadata
          FROM demand_ledger
          WHERE demand_unit_id = ${demandUnitId}
            AND financial_year_id = ${financialYearId}
          ORDER BY posted_at ASC
        `
      : await this.sql<DemandLedgerRow[]>`
          SELECT
            id,
            demand_unit_id,
            financial_year_id,
            entry_type,
            amount,
            source_type,
            source_id,
            reverses_entry_id,
            idempotency_key,
            correlation_id,
            posted_by,
            posted_at,
            metadata
          FROM demand_ledger
          WHERE demand_unit_id = ${demandUnitId}
          ORDER BY posted_at ASC
        `;

    return Object.freeze(rows.map((r) => this.mapEntry(r)));
  }

  async getBalance(demandUnitId: string, financialYearId?: string): Promise<number> {
    const rows = financialYearId
      ? await this.sql<[{ balance: string | number | null }]>`
          SELECT COALESCE(SUM(amount), 0) AS balance
          FROM demand_ledger
          WHERE demand_unit_id = ${demandUnitId}
            AND financial_year_id = ${financialYearId}
        `
      : await this.sql<[{ balance: string | number | null }]>`
          SELECT COALESCE(SUM(amount), 0) AS balance
          FROM demand_ledger
          WHERE demand_unit_id = ${demandUnitId}
        `;

    const raw = Number(rows[0]?.balance ?? 0);
    return Math.round((raw + Number.EPSILON) * 100) / 100;
  }
}

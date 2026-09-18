import type { Sql } from "postgres";
import type { AuditEvent } from "@ptas/domain";

export interface AppendOnlyAuditRepository {
  append(event: AuditEvent): Promise<void>;
  appendBatch(events: readonly AuditEvent[]): Promise<void>;
  queryByCorrelationId(correlationId: string): Promise<readonly AuditEvent[]>;
  queryByAggregate(aggregateType: string, aggregateId: string): Promise<readonly AuditEvent[]>;
  queryAll?(): Promise<readonly AuditEvent[]>;
}

export class InMemoryAuditRepository implements AppendOnlyAuditRepository {
  private readonly events: AuditEvent[] = [];
  private readonly idSet = new Set<string>();

  async append(event: AuditEvent): Promise<void> {
    if (this.idSet.has(event.id)) {
      throw new Error(`Audit event with id ${event.id} already exists (append-only)`);
    }
    this.events.push(Object.freeze({ ...event }));
    this.idSet.add(event.id);
  }

  async appendBatch(events: readonly AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async queryByCorrelationId(correlationId: string): Promise<readonly AuditEvent[]> {
    return this.events
      .filter((e) => e.correlationId === correlationId)
      .map((e) => Object.freeze({ ...e }));
  }

  async queryByAggregate(
    aggregateType: string,
    aggregateId: string
  ): Promise<readonly AuditEvent[]> {
    return this.events
      .filter((e) => e.aggregateType === aggregateType && e.aggregateId === aggregateId)
      .map((e) => Object.freeze({ ...e }));
  }

  async queryAll(): Promise<readonly AuditEvent[]> {
    return this.events.map((e) => Object.freeze({ ...e }));
  }
}

export class PostgresAuditRepository implements AppendOnlyAuditRepository {
  constructor(private readonly sql: Sql) {}

  async append(event: AuditEvent): Promise<void> {
    await this.sql`
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
        ${event.id},
        ${event.eventType},
        ${event.aggregateType ?? null},
        ${event.aggregateId ?? null},
        ${event.actorId},
        ${event.actorRole},
        ${event.jurisdictionId ?? null},
        ${event.correlationId},
        ${event.occurredAt},
        ${this.sql.json(event.payload as unknown as Parameters<typeof this.sql.json>[0])}
      )
    `;
  }

  async appendBatch(events: readonly AuditEvent[]): Promise<void> {
    if (events.length === 0) return;

    await this.sql.begin(async (tx) => {
      for (const event of events) {
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
            ${event.id},
            ${event.eventType},
            ${event.aggregateType ?? null},
            ${event.aggregateId ?? null},
            ${event.actorId},
            ${event.actorRole},
            ${event.jurisdictionId ?? null},
            ${event.correlationId},
            ${event.occurredAt},
            ${tx.json(event.payload as unknown as Parameters<typeof tx.json>[0])}
          )
        `;
      }
    });
  }

  async queryByCorrelationId(correlationId: string): Promise<readonly AuditEvent[]> {
    const rows = await this.sql<
      {
        id: string;
        event_type: string;
        aggregate_type: string | null;
        aggregate_id: string | null;
        actor_id: string;
        actor_role: string;
        jurisdiction_id: string | null;
        correlation_id: string;
        occurred_at: string;
        payload: Record<string, unknown>;
      }[]
    >`
      SELECT
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        actor_id,
        actor_role,
        jurisdiction_id,
        correlation_id,
        occurred_at::text,
        payload
      FROM audit_event
      WHERE correlation_id = ${correlationId}
      ORDER BY occurred_at ASC
    `;

    return rows.map((r) =>
      Object.freeze({
        id: r.id,
        eventType: r.event_type,
        aggregateType: r.aggregate_type ?? undefined,
        aggregateId: r.aggregate_id ?? undefined,
        actorId: r.actor_id,
        actorRole: r.actor_role,
        jurisdictionId: r.jurisdiction_id ?? undefined,
        correlationId: r.correlation_id,
        occurredAt: r.occurred_at,
        payload: Object.freeze(r.payload)
      })
    );
  }

  async queryByAggregate(
    aggregateType: string,
    aggregateId: string
  ): Promise<readonly AuditEvent[]> {
    const rows = await this.sql<
      {
        id: string;
        event_type: string;
        aggregate_type: string | null;
        aggregate_id: string | null;
        actor_id: string;
        actor_role: string;
        jurisdiction_id: string | null;
        correlation_id: string;
        occurred_at: string;
        payload: Record<string, unknown>;
      }[]
    >`
      SELECT
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        actor_id,
        actor_role,
        jurisdiction_id,
        correlation_id,
        occurred_at::text,
        payload
      FROM audit_event
      WHERE aggregate_type = ${aggregateType} AND aggregate_id = ${aggregateId}
      ORDER BY occurred_at ASC
    `;

    return rows.map((r) =>
      Object.freeze({
        id: r.id,
        eventType: r.event_type,
        aggregateType: r.aggregate_type ?? undefined,
        aggregateId: r.aggregate_id ?? undefined,
        actorId: r.actor_id,
        actorRole: r.actor_role,
        jurisdictionId: r.jurisdiction_id ?? undefined,
        correlationId: r.correlation_id,
        occurredAt: r.occurred_at,
        payload: Object.freeze(r.payload)
      })
    );
  }
}

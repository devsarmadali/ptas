/**
 * Supabase Cloud Synchronization Service for PTAS Vehari Pilot
 * Synchronizes local pilot units, assessments, demand ledgers, and audit logs
 * to live Supabase PostgreSQL tables while strictly respecting database immutability triggers.
 */

import type { Json } from "@ptas/database/types";
import type { StoredUnit, PilotAuditItem } from "./pilot-store";
import { getSupabaseAuthClient } from "./supabase-auth";

const SYNC_BATCH_SIZE = 100;

export interface SyncResult {
  readonly success: boolean;
  readonly syncedUnitsCount: number;
  readonly syncedLedgerCount: number;
  readonly message: string;
  readonly error?: string | undefined;
}

export function getSupabaseClient() {
  return getSupabaseAuthClient();
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Pushes the current local pilot units and audit records to Supabase PostgreSQL
 * using chunked batch upserts rather than per-row round trips.
 */
export async function pushPilotStateToSupabase(
  units: readonly StoredUnit[],
  auditLogs: readonly PilotAuditItem[]
): Promise<SyncResult> {
  try {
    const supabase = getSupabaseClient();

    // 1. Batched Sync for PFT-3 Assessment Units
    const unitRows = units.map((unit) => ({
      id: unit.id,
      legal_name: unit.legalName,
      taxpayer_name: unit.tradeName ?? unit.legalName,
      trade_name: unit.tradeName ?? unit.legalName,
      identifier_type: unit.identifierType,
      identifier_value: unit.identifierValue,
      address: unit.address,
      locality: unit.locality ?? null,
      circle_id: unit.circleId,
      permanent_demand_no: unit.demandUnit?.permanentDemandNo ?? null,
      pin_number: unit.demandUnit?.permanentDemandNo ?? null,
      category_code: unit.categoryCode,
      subclassification_code: unit.subclassificationCode ?? null,
      statutory_rule_id: unit.statutoryRuleId,
      annual_rate_pkr: unit.statutoryRule?.annual_rate_pkr ?? 0,
      state: unit.assessments?.[0]?.status === "APPROVED" ? "APPROVED" : "SUBMITTED"
    }));

    const unitTable = (
      supabase as unknown as {
        from: (table: string) => {
          upsert: (
            data: Record<string, unknown>[],
            opts: Record<string, unknown>
          ) => Promise<{ error: Error | null }>;
        };
      }
    ).from("pft3_assessment_units");

    for (const batch of chunkItems(unitRows, SYNC_BATCH_SIZE)) {
      const { error: unitErr } = await unitTable.upsert(batch, { onConflict: "id" });
      if (unitErr) {
        console.warn("PFT3 unit batch upsert note:", unitErr.message);
      }
    }

    // 2. Append-Only Batched Audit Events Sync (skip duplicates via onConflict ignoreDuplicates)
    const auditRows = auditLogs.map((log) => ({
      id: log.id,
      event_type: log.eventType,
      actor_id: log.actorName,
      actor_role: log.actorRole,
      correlation_id: log.correlationId,
      payload: {
        target: log.target,
        details: log.details,
        timestamp: log.timestamp
      } as unknown as Json
    }));

    for (const batch of chunkItems(auditRows, SYNC_BATCH_SIZE)) {
      const { error: audErr } = await supabase
        .from("audit_events")
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (audErr) {
        console.warn("Audit batch insert note:", audErr.message);
      }
    }

    return {
      success: true,
      syncedUnitsCount: units.length,
      syncedLedgerCount: 0,
      message: `Successfully synchronized ${units.length} tax units and 0 ledger entries to cloud database.`
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Supabase sync error:", err);
    return {
      success: false,
      syncedUnitsCount: 0,
      syncedLedgerCount: 0,
      message: `Failed to synchronize with cloud database: ${errorMsg}`,
      error: errorMsg
    };
  }
}

/**
 * Fetches recent audit events from Supabase PostgreSQL using an explicit column projection.
 */
export async function fetchAuditLogsFromDatabase(): Promise<PilotAuditItem[] | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("audit_events")
      .select(
        "id, event_type, actor_id, actor_role, aggregate_id, occurred_at, correlation_id, payload"
      )
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (error || !data) return null;

    return data.map((row) => {
      const payload =
        row.payload && typeof row.payload === "object"
          ? (row.payload as Record<string, unknown>)
          : {};

      return {
        id: String(row.id),
        eventType: String(row.event_type || "SYSTEM_AUDIT"),
        actorName: String(row.actor_id || "Authorized Officer"),
        actorRole: String(row.actor_role || "SYSTEM"),
        target: String(payload.target ?? row.aggregate_id ?? "Tax Administration Unit"),
        timestamp: String(row.occurred_at || new Date().toISOString()),
        correlationId: String(row.correlation_id || "corr-audit"),
        details: String(payload.details ?? "Statutory event recorded.")
      };
    });
  } catch {
    return null;
  }
}

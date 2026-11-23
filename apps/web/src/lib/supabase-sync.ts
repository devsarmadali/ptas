/**
 * Supabase Cloud Synchronization Service for PTAS Vehari Pilot
 * Synchronizes local pilot units, assessments, demand ledgers, and audit logs
 * to live Supabase PostgreSQL tables while strictly respecting database immutability triggers.
 */

import type { StoredUnit, PilotAuditItem } from "./pilot-store";
import { getSupabaseAuthClient } from "./supabase-auth";
import { PTAS_CACHE_KEYS, getOrFetchCached } from "./query-cache";

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

/**
 * Legacy browser table-sync stub fails closed. All statutory mutations must execute through
 * server-side transactional RPC workflows rather than direct client table upserts.
 */
export async function pushPilotStateToSupabase(
  units: readonly StoredUnit[],
  auditLogs: readonly PilotAuditItem[]
): Promise<SyncResult> {
  void units;
  void auditLogs;
  return {
    success: false,
    syncedUnitsCount: 0,
    syncedLedgerCount: 0,
    message:
      "Direct client table synchronization is disabled. Use audited server workflow RPCs for all statutory writes.",
    error: "DIRECT_TABLE_SYNC_DISABLED"
  };
}

/**
 * Fetches recent audit events from Supabase PostgreSQL using an explicit column projection.
 */
export async function fetchAuditLogsFromDatabase(options?: {
  readonly force?: boolean | undefined;
}): Promise<PilotAuditItem[] | null> {
  return getOrFetchCached(
    PTAS_CACHE_KEYS.AUDIT_LOGS,
    60_000,
    async () => {
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
    },
    { force: options?.force, shouldCache: (value) => value !== null }
  );
}

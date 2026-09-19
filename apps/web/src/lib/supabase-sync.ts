/**
 * Supabase Cloud Synchronization Service for PTAS Vehari Pilot
 * Synchronizes local pilot units, assessments, demand ledgers, and audit logs
 * to live Supabase PostgreSQL tables while strictly respecting database immutability triggers.
 */

import { createPtasSupabaseClient } from "@ptas/database/client";
import type { Json } from "@ptas/database/types";
import type { StoredUnit, PilotAuditItem } from "./pilot-store";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zvadxmxasutvqpltszim.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_aTqvnS7QhGZq95GwtPW8Ig_vjPV76i5";

export interface SyncResult {
  readonly success: boolean;
  readonly syncedUnitsCount: number;
  readonly syncedLedgerCount: number;
  readonly message: string;
  readonly error?: string | undefined;
}

export function getSupabaseClient() {
  return createPtasSupabaseClient({
    url: SUPABASE_URL,
    key: SUPABASE_KEY
  });
}

/**
 * Pushes the current local pilot units and audit records to Supabase PostgreSQL.
 * Handles append-only ledger and audit constraints safely by only inserting new entries.
 */
export async function pushPilotStateToSupabase(
  units: readonly StoredUnit[],
  auditLogs: readonly PilotAuditItem[]
): Promise<SyncResult> {
  try {
    const supabase = getSupabaseClient();

    // 1. Sync Taxpayers & Demand Units
    for (const unit of units) {
      // Upsert Taxpayer
      const { error: tpErr } = await supabase.from("taxpayers").upsert(
        {
          id: unit.id,
          display_name: unit.legalName,
          current_circle_id: unit.circleId,
          permanent_demand_no: unit.demandUnit.permanentDemandNo,
          status: "ACTIVE",
          created_by: "system-seed"
        },
        { onConflict: "id" }
      );
      if (tpErr) {
        console.warn("Taxpayer upsert note:", tpErr.message);
      }

      // Upsert Taxpayer Identifier
      const identifierId = `ident-${unit.id}`;
      const { error: idErr } = await supabase.from("taxpayer_identifiers").upsert(
        {
          id: identifierId,
          taxpayer_id: unit.id,
          identifier_type: unit.identifierType,
          normalized_value: unit.identifierValue,
          masked_value: unit.identifierValue.replace(/\d(?=\d{4})/g, "*"),
          is_primary: true
        },
        { onConflict: "id" }
      );
      if (idErr) {
        console.warn("Identifier upsert note:", idErr.message);
      }

      // Upsert Demand Unit
      const { error: duErr } = await supabase.from("demand_units").upsert(
        {
          id: unit.demandUnit.id,
          taxpayer_id: unit.id,
          permanent_demand_no: unit.demandUnit.permanentDemandNo
        },
        { onConflict: "id" }
      );
      if (duErr) {
        console.warn("Demand Unit upsert note:", duErr.message);
      }

      // Upsert Assessments
      for (const asm of unit.assessments) {
        const { error: asmErr } = await supabase.from("assessments").upsert(
          {
            id: asm.id,
            taxpayer_id: unit.id,
            financial_year_id: asm.financialYearId,
            status: asm.status,
            current_version_no: asm.currentVersionNo,
            created_by: asm.createdBy
          },
          { onConflict: "id" }
        );
        if (asmErr) {
          console.warn("Assessment upsert note:", asmErr.message);
        }
      }

      // Upsert Assessment Versions
      for (const ver of unit.assessmentVersions) {
        const { error: verErr } = await supabase.from("assessment_versions").upsert(
          {
            id: ver.id,
            assessment_id: ver.assessmentId,
            version_no: ver.versionNo,
            status: ver.status,
            snapshot: ver.snapshot as unknown as Json,
            created_by: ver.createdBy,
            approved_by: ver.approvedBy ?? null,
            approved_at: ver.approvedAt ?? null,
            approval_evidence_id: ver.approvalEvidenceId ?? null
          },
          { onConflict: "id" }
        );
        if (verErr) {
          console.warn("Assessment Version upsert note:", verErr.message);
        }
      }
    }

    // 2. Sync Demand Ledger (Append-Only: query existing to never trigger UPDATE/DELETE)
    let newLedgerEntriesCount = 0;
    const { data: existingLedgerRows } = await supabase.from("demand_ledger").select("id");
    const existingLedgerIds = new Set((existingLedgerRows || []).map((r) => r.id));

    for (const unit of units) {
      for (const entry of unit.ledgerEntries) {
        if (!existingLedgerIds.has(entry.id)) {
          const { error: ledErr } = await supabase.from("demand_ledger").insert({
            id: entry.id,
            demand_unit_id: entry.demandUnitId,
            financial_year_id: entry.financialYearId,
            entry_type: entry.entryType,
            amount: entry.amount,
            source_type: entry.sourceType,
            source_id: entry.sourceId,
            idempotency_key: entry.idempotencyKey,
            correlation_id: entry.correlationId,
            posted_by: entry.postedBy,
            posted_at: entry.postedAt,
            metadata: entry.metadata as unknown as Json
          });

          if (!ledErr) {
            newLedgerEntriesCount++;
            existingLedgerIds.add(entry.id);
          } else {
            console.warn("Ledger insert note:", ledErr.message);
          }
        }
      }
    }

    // 3. Sync Audit Events (Append-Only: check existing)
    const { data: existingAuditRows } = await supabase.from("audit_events").select("id");
    const existingAuditIds = new Set((existingAuditRows || []).map((r) => r.id));

    for (const log of auditLogs) {
      if (!existingAuditIds.has(log.id)) {
        const { error: audErr } = await supabase.from("audit_events").insert({
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
        });

        if (!audErr) {
          existingAuditIds.add(log.id);
        } else {
          console.warn("Audit insert note:", audErr.message);
        }
      }
    }

    return {
      success: true,
      syncedUnitsCount: units.length,
      syncedLedgerCount: newLedgerEntriesCount,
      message: `Successfully synchronized ${units.length} tax units and ${newLedgerEntriesCount} ledger entries to Supabase cloud.`
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Supabase sync error:", err);
    return {
      success: false,
      syncedUnitsCount: 0,
      syncedLedgerCount: 0,
      message: `Failed to synchronize with Supabase: ${errorMsg}`,
      error: errorMsg
    };
  }
}

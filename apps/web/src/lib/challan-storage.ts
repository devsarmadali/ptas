import type { StoredUnit, Pft2ChallanRecord, StatutoryReceiptRecord } from "./pilot-store";
export type { Pft2ChallanRecord, StatutoryReceiptRecord };
import { numberToWordsPkr, generatePft2NoticeNumber } from "./statutory-forms";
import { generateDocumentPin } from "@ptas/domain";
import { loadPersistedMigratedUnits } from "./potential-units-storage";
import { getSupabaseAuthClient } from "./supabase-auth";
import type { Json } from "@ptas/database/types";

export const PFT2_CHALLANS_STORAGE_KEY = "ptas_pft2_challans_v4";
export const STATUTORY_RECEIPTS_STORAGE_KEY = "ptas_statutory_receipts_v4";
export const CHALLANS_UPDATED_EVENT = "ptas-challans-updated";
export const RECEIPTS_UPDATED_EVENT = "ptas-receipts-updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface ChallanJurisdictionCodes {
  districtCode: string;
  circleCode: string;
}

/** Resolve registered numbering identifiers through the server-authorized hierarchy. */
export async function loadChallanJurisdictionCodes(
  jurisdictionId: string
): Promise<ChallanJurisdictionCodes> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("get_challan_jurisdiction_codes", {
    p_jurisdiction_id: jurisdictionId
  });
  if (error) throw new Error(`Unable to resolve challan jurisdiction codes: ${error.message}`);
  if (!isRecord(data)) throw new Error("Jurisdiction code registry returned an invalid record");
  const districtCode = String(data.district_code ?? "").trim();
  const circleCode = String(data.circle_code ?? "").trim();
  if (!districtCode || !circleCode) {
    throw new Error("District and circle challan codes are not configured");
  }
  return { districtCode, circleCode };
}

/** Load the jurisdiction-scoped statutory registers from PostgreSQL. */
export async function loadDurableChallanRegistry(): Promise<{
  challans: Pft2ChallanRecord[];
  receipts: StatutoryReceiptRecord[];
}> {
  const supabase = getSupabaseAuthClient();
  const [challansResult, receiptsResult] = await Promise.all([
    supabase.rpc("list_pft2_challan_registry"),
    supabase.rpc("list_pft2_receipt_registry")
  ]);
  if (challansResult.error) {
    throw new Error(`Unable to load PFT-2 challans: ${challansResult.error.message}`);
  }
  if (receiptsResult.error) {
    throw new Error(`Unable to load statutory receipts: ${receiptsResult.error.message}`);
  }
  return {
    challans: Array.isArray(challansResult.data)
      ? (challansResult.data as unknown as Pft2ChallanRecord[])
      : [],
    receipts: Array.isArray(receiptsResult.data)
      ? (receiptsResult.data as unknown as StatutoryReceiptRecord[])
      : []
  };
}

/** Issue a challan transactionally; the canonical Notice No. is also its Challan No. */
export async function issueDurablePft2Challan(
  draft: Pft2ChallanRecord,
  idempotencyKey: string,
  correlationId: string
): Promise<Pft2ChallanRecord> {
  if (!draft.noticeNumber || draft.challanNumber !== draft.noticeNumber) {
    throw new Error("Challan No. must be identical to the canonical Notice No.");
  }
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("issue_pft2_challan_record", {
    p_challan: draft as unknown as Json,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: correlationId
  });
  if (error) throw new Error(`Unable to issue PFT-2 challan: ${error.message}`);
  if (!isRecord(data)) throw new Error("PFT-2 issuance returned an invalid record");
  return data as unknown as Pft2ChallanRecord;
}

export async function receiveDurablePft2Challan(
  challan: Pft2ChallanRecord,
  receipt: StatutoryReceiptRecord,
  idempotencyKey: string,
  correlationId: string
): Promise<StatutoryReceiptRecord> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("receive_pft2_challan_record", {
    p_challan_id: challan.id,
    p_is_potential: challan.isProvisional === true,
    p_receipt: receipt as unknown as Json,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: correlationId
  });
  if (error) throw new Error(`Unable to receive PFT-2 challan: ${error.message}`);
  const payload = isRecord(data) ? data : {};
  if (!isRecord(payload.receipt)) throw new Error("Receipt command returned an invalid record");
  return payload.receipt as unknown as StatutoryReceiptRecord;
}

export async function cancelDurablePft2Challan(
  challan: Pft2ChallanRecord,
  reason: string,
  idempotencyKey: string,
  correlationId: string
): Promise<Pft2ChallanRecord> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("cancel_pft2_challan_record", {
    p_challan_id: challan.id,
    p_is_potential: challan.isProvisional === true,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: correlationId
  });
  if (error) throw new Error(`Unable to cancel PFT-2 challan: ${error.message}`);
  if (!isRecord(data)) throw new Error("PFT-2 cancellation returned an invalid record");
  return data as unknown as Pft2ChallanRecord;
}

/**
 * Safely load persisted Form PFT-2 Challans from browser storage.
 */
export function loadPersistedPft2Challans(): Pft2ChallanRecord[] {
  if (typeof window === "undefined") return [];
  try {
    // Purge deprecated bulk pre-generated keys from earlier versions
    localStorage.removeItem("ptas_pft2_challans_v2");
    localStorage.removeItem("ptas_pft2_challans_v3");
    localStorage.removeItem("ptas_pft2_challans");

    const raw = localStorage.getItem(PFT2_CHALLANS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Pft2ChallanRecord[];
  } catch (err) {
    console.warn("Failed to load persisted PFT-2 challans from storage:", err);
  }
  return [];
}

/**
 * Save Form PFT-2 Challans to browser storage and notify active subscribers.
 */
export function savePersistedPft2Challans(challans: readonly Pft2ChallanRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PFT2_CHALLANS_STORAGE_KEY, JSON.stringify(challans));
    window.dispatchEvent(new CustomEvent(CHALLANS_UPDATED_EVENT, { detail: challans }));
  } catch (err) {
    console.error("Failed to save PFT-2 challans to storage:", err);
  }
}

/**
 * Persist an individually issued Form PFT-2 Challan.
 * If a challan with matching ID, notice number, or challan number exists, it is updated.
 * Otherwise, the newly issued challan is prepended to the register.
 */
export function saveIssuedPft2Challan(newChallan: Pft2ChallanRecord): Pft2ChallanRecord[] {
  const current = loadPersistedPft2Challans();
  const index = current.findIndex(
    (c) =>
      c.id === newChallan.id ||
      (c.noticeNumber && c.noticeNumber === newChallan.noticeNumber) ||
      c.challanNumber === newChallan.challanNumber
  );

  let updated: Pft2ChallanRecord[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = newChallan;
  } else {
    updated = [newChallan, ...current];
  }

  savePersistedPft2Challans(updated);
  return updated;
}

/**
 * Safely load persisted Statutory Receipts (Rule 10) from browser storage.
 */
export function loadPersistedStatutoryReceipts(): StatutoryReceiptRecord[] {
  if (typeof window === "undefined") return [];
  try {
    // Purge deprecated bulk receipt keys
    localStorage.removeItem("ptas_statutory_receipts_v2");
    localStorage.removeItem("ptas_statutory_receipts_v3");
    localStorage.removeItem("ptas_statutory_receipts");

    const raw = localStorage.getItem(STATUTORY_RECEIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StatutoryReceiptRecord[];
  } catch (err) {
    console.warn("Failed to load persisted statutory receipts from storage:", err);
  }
  return [];
}

/**
 * Save Statutory Receipts to browser storage and notify active subscribers.
 */
export function savePersistedStatutoryReceipts(receipts: readonly StatutoryReceiptRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATUTORY_RECEIPTS_STORAGE_KEY, JSON.stringify(receipts));
    window.dispatchEvent(new CustomEvent(RECEIPTS_UPDATED_EVENT, { detail: receipts }));
  } catch (err) {
    console.error("Failed to save statutory receipts to storage:", err);
  }
}

/**
 * Synchronize and ensure officially issued Form PFT-2 Challans and
 * corresponding Statutory Receipts.
 *
 * Statutory Rule:
 * Challans are NOT automatically pre-issued for all surveyed units.
 * A Form PFT-2 Challan only exists when an Assessing Authority / Inspector
 * has formally issued it.
 */
export function ensureChallansAndReceiptsForUnits(units?: readonly StoredUnit[]): {
  challans: Pft2ChallanRecord[];
  receipts: StatutoryReceiptRecord[];
} {
  void units;
  const storedChallans = loadPersistedPft2Challans();
  const storedReceipts = loadPersistedStatutoryReceipts();

  const mergedChallans: Pft2ChallanRecord[] = [...storedChallans];
  const mergedReceipts: StatutoryReceiptRecord[] = [...storedReceipts];
  const existingReceiptNumbers = new Set(mergedReceipts.map((r) => r.receiptNumber));

  // Ensure every received challan has its matching Rule 10 statutory receipt
  for (const c of mergedChallans) {
    if (
      c.status === "RECEIVED" &&
      c.receiptNumber &&
      !existingReceiptNumbers.has(c.receiptNumber)
    ) {
      const noticeNo =
        c.noticeNumber ??
        generatePft2NoticeNumber({
          demandNumber: c.demandNumber,
          issueDate: c.issueDate,
          formTypeCode: c.formType,
          demandScope: c.demandScope,
          paymentScope: c.paymentScope,
          amount: c.amountPayable
        });
      const pin = c.pin ?? generateDocumentPin(noticeNo);

      mergedReceipts.push({
        id: `rec-${c.id}`,
        receiptNumber: c.receiptNumber,
        noticeNumber: noticeNo,
        pin,
        provincialUin: c.provincialUin,
        challanNumber: c.challanNumber,
        demandNumber: c.demandNumber,
        unitId: c.unitId,
        assesseeLegalName: c.legalName,
        assesseeTradeName: c.tradeName,
        identifierType: c.identifierType,
        identifierValue: c.identifierValue,
        address: c.address,
        statutoryCategory: c.category,
        subclassificationCode: c.subclassificationCode,
        statutoryTertiaryCode: c.statutoryTertiaryCode ?? null,
        tertiarySlab: c.tertiarySlab,
        amountPaidPkr: c.amountPayable,
        amountPaidWords: numberToWordsPkr(c.amountPayable),
        dateOfReceipt: c.receivedAt ?? c.issueDate,
        timeOfReceipt: "11:30 AM",
        paymentChannel: c.paymentChannel ?? "National Bank of Pakistan",
        bankBranch: "Main Treasury Branch, Vehari (Treasury 0142)",
        bankScrollRef: c.bankScrollRef ?? "NBP-CPR-VERIFIED",
        receivingOfficerName: c.receivedBy ?? "Tax Inspector",
        receivingOfficerTitle: "Tax Inspector, Vehari Circle I (City / Commercial)",
        officialSha256: c.officialSha256,
        qrPayload: `https://ptas.punjab.gov.pk/verify?type=PFT-REC&ref=${c.receiptNumber}&pdn=${c.demandNumber}&amt=${c.amountPayable}`,
        remarks: "Discharged under Rule 10.",
        paymentSource: "ISSUED_PFT2",
        receiptCategory: c.isProvisional ? "PROVISIONAL_POTENTIAL" : "REGULAR_PFT3",
        issuedPft2Id: c.id
      });
      existingReceiptNumbers.add(c.receiptNumber);
    }
  }

  savePersistedStatutoryReceipts(mergedReceipts);

  return { challans: mergedChallans, receipts: mergedReceipts };
}

/**
 * Merges persisted migrated potential units and applies any received challans
 * or statutory receipts to unit ledger entries to ensure realized recovery is accurate.
 */
export function applyReceiptsAndMigratedUnitsToStoredUnits(
  baseUnits: readonly StoredUnit[]
): StoredUnit[] {
  const migratedUnits = loadPersistedMigratedUnits();
  const storedReceipts = loadPersistedStatutoryReceipts();
  const storedChallans = loadPersistedPft2Challans();

  // Combine base units with migrated units, deduplicating by ID, demandNumber, and PIN
  const unitMap = new Map<string, StoredUnit>();
  for (const u of baseUnits) {
    unitMap.set(u.id, u);
  }
  for (const mu of migratedUnits) {
    const existingKey = Array.from(unitMap.keys()).find((k) => {
      const existing = unitMap.get(k)!;
      return (
        existing.id === mu.id ||
        (mu.demandNumber &&
          (existing.demandNumber === mu.demandNumber ||
            existing.demandUnit?.permanentDemandNo === mu.demandNumber)) ||
        (mu.provincialUin &&
          (existing.provincialUin === mu.provincialUin || existing.pinNumber === mu.provincialUin))
      );
    });
    if (existingKey) {
      const existing = unitMap.get(existingKey)!;
      unitMap.set(existingKey, {
        ...existing,
        ...mu,
        id: existing.id,
        pft3Registered: true,
        ledgerEntries:
          mu.ledgerEntries.length > existing.ledgerEntries.length
            ? mu.ledgerEntries
            : existing.ledgerEntries
      });
    } else {
      unitMap.set(mu.id, mu);
    }
  }

  const allUnits = Array.from(unitMap.values());
  const receivedChallans = storedChallans.filter((c) => c.status === "RECEIVED");

  return allUnits.map((unit) => {
    // Normalise existing ledger entries so PAYMENT_CREDIT is always negative
    const updatedLedger = unit.ledgerEntries.map((e) => {
      if (e.entryType === "PAYMENT_CREDIT" && e.amount > 0) {
        return { ...e, amount: -Math.abs(e.amount) };
      }
      return e;
    });
    let ledgerModified = updatedLedger.some((e, i) => e !== unit.ledgerEntries[i]);

    // Check matching statutory receipts
    const matchingReceipts = storedReceipts.filter(
      (r) =>
        r.unitId === unit.id ||
        (r.demandNumber &&
          (r.demandNumber === unit.demandUnit?.permanentDemandNo ||
            r.demandNumber === unit.demandNumber)) ||
        (r.provincialUin &&
          (r.provincialUin === unit.provincialUin || r.provincialUin === unit.pinNumber)) ||
        (r.pin && (r.pin === unit.pinNumber || r.pin === unit.provincialUin)) ||
        (r.identifierValue && r.identifierValue === unit.identifierValue)
    );

    for (const r of matchingReceipts) {
      const alreadyCredited = updatedLedger.some(
        (e) =>
          e.entryType === "PAYMENT_CREDIT" &&
          (e.sourceId === r.receiptNumber ||
            e.idempotencyKey === `idem-rcpt-${r.receiptNumber}` ||
            e.idempotencyKey === `idem-${r.receiptNumber}` ||
            e.correlationId === `corr-${r.receiptNumber}` ||
            e.metadata?.receiptNumber === r.receiptNumber ||
            (r.challanNumber &&
              (e.sourceId === r.challanNumber ||
                e.idempotencyKey === `idem-ch-${r.challanNumber}` ||
                e.metadata?.challanNumber === r.challanNumber)))
      );
      if (!alreadyCredited && r.amountPaidPkr > 0) {
        updatedLedger.push({
          id: `led-rcpt-${r.receiptNumber}`,
          demandUnitId: unit.demandUnit?.id ?? `dem-${unit.id}`,
          financialYearId: "FY-2026-27",
          entryType: "PAYMENT_CREDIT",
          amount: -Math.abs(r.amountPaidPkr),
          sourceType: "PAYMENT_RECEIPT",
          sourceId: r.receiptNumber,
          idempotencyKey: `idem-rcpt-${r.receiptNumber}`,
          correlationId: `corr-rcpt-${r.receiptNumber}`,
          postedBy: r.receivingOfficerName || "Authorized Treasury Counter (NBP)",
          postedAt: r.dateOfReceipt ? `${r.dateOfReceipt}T00:00:00.000Z` : new Date().toISOString(),
          metadata: {
            receiptNumber: r.receiptNumber,
            paymentChannel: r.paymentChannel,
            bankScrollRef: r.bankScrollRef,
            challanNumber: r.challanNumber
          }
        });
        ledgerModified = true;
      }
    }

    // Check matching received challans if receipt not yet created
    const matchingReceivedChallans = receivedChallans.filter(
      (c) =>
        c.unitId === unit.id ||
        (c.demandNumber &&
          (c.demandNumber === unit.demandUnit?.permanentDemandNo ||
            c.demandNumber === unit.demandNumber)) ||
        (c.provincialUin &&
          (c.provincialUin === unit.provincialUin || c.provincialUin === unit.pinNumber)) ||
        (c.pin && (c.pin === unit.pinNumber || c.pin === unit.provincialUin)) ||
        (c.identifierValue && c.identifierValue === unit.identifierValue)
    );

    for (const c of matchingReceivedChallans) {
      const receiptNo = c.receiptNumber;
      const alreadyCredited = updatedLedger.some(
        (e) =>
          e.entryType === "PAYMENT_CREDIT" &&
          (e.sourceId === c.challanNumber ||
            e.idempotencyKey === `idem-ch-${c.challanNumber}` ||
            e.metadata?.challanNumber === c.challanNumber ||
            (receiptNo &&
              (e.sourceId === receiptNo ||
                e.idempotencyKey === `idem-${receiptNo}` ||
                e.idempotencyKey === `idem-rcpt-${receiptNo}` ||
                e.correlationId === `corr-${receiptNo}` ||
                e.metadata?.receiptNumber === receiptNo)))
      );
      if (!alreadyCredited && c.amountPayable > 0) {
        updatedLedger.push({
          id: `led-ch-${c.challanNumber}`,
          demandUnitId: unit.demandUnit?.id ?? `dem-${unit.id}`,
          financialYearId: "FY-2026-27",
          entryType: "PAYMENT_CREDIT",
          amount: -Math.abs(c.amountPayable),
          sourceType: "CHALLAN_PFT2",
          sourceId: c.challanNumber,
          idempotencyKey: `idem-ch-${c.challanNumber}`,
          correlationId: `corr-ch-${c.challanNumber}`,
          postedBy: c.receivedBy || "Authorized Treasury Counter (NBP)",
          postedAt: c.receivedAt ? `${c.receivedAt}T00:00:00.000Z` : new Date().toISOString(),
          metadata: {
            receiptNumber: c.receiptNumber,
            challanNumber: c.challanNumber,
            paymentChannel: c.paymentChannel,
            bankScrollRef: c.bankScrollRef
          }
        });
        ledgerModified = true;
      }
    }

    if (ledgerModified) {
      return {
        ...unit,
        ledgerEntries: updatedLedger
      };
    }

    return unit;
  });
}

import type { StoredUnit, Pft2ChallanRecord, StatutoryReceiptRecord } from "./pilot-store";
import { createInitialPft2Challans, createInitialStatutoryReceipts } from "./pilot-store";
import { numberToWordsPkr, generatePft2NoticeNumber } from "./statutory-forms";
import { generateDocumentPin } from "@ptas/domain";

export const PFT2_CHALLANS_STORAGE_KEY = "ptas_pft2_challans_v2";
export const STATUTORY_RECEIPTS_STORAGE_KEY = "ptas_statutory_receipts_v2";
export const CHALLANS_UPDATED_EVENT = "ptas-challans-updated";
export const RECEIPTS_UPDATED_EVENT = "ptas-receipts-updated";

/**
 * Safely load persisted Form PFT-2 Challans from browser storage.
 */
export function loadPersistedPft2Challans(): Pft2ChallanRecord[] {
  if (typeof window === "undefined") return [];
  try {
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
 * Synchronize and ensure all survey units have valid Form PFT-2 Challans and
 * corresponding Statutory Receipts.
 *
 * Rules:
 * 1. Stored custom / updated challans (RECEIVED, CANCELLED, custom amounts) take highest precedence.
 * 2. Units without a registered challan receive a generated baseline challan from statutory assessment.
 * 3. Any challan marked RECEIVED must have an authentic Statutory Receipt in the receipts registry.
 */
export function ensureChallansAndReceiptsForUnits(units: readonly StoredUnit[]): {
  challans: Pft2ChallanRecord[];
  receipts: StatutoryReceiptRecord[];
} {
  const storedChallans = loadPersistedPft2Challans();
  const baselineChallans = createInitialPft2Challans(units as StoredUnit[]);

  const mergedChallans: Pft2ChallanRecord[] = [...storedChallans];
  const registeredUnitIds = new Set(
    storedChallans.map((c) => c.unitId).concat(storedChallans.map((c) => c.demandNumber))
  );

  for (const base of baselineChallans) {
    if (!registeredUnitIds.has(base.unitId) && !registeredUnitIds.has(base.demandNumber)) {
      mergedChallans.push(base);
      registeredUnitIds.add(base.unitId);
    }
  }

  savePersistedPft2Challans(mergedChallans);

  // Sync Receipts
  const storedReceipts = loadPersistedStatutoryReceipts();
  const mergedReceipts: StatutoryReceiptRecord[] =
    storedReceipts.length > 0
      ? [...storedReceipts]
      : createInitialStatutoryReceipts(units as StoredUnit[]);

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
        issuedPft2Id: c.id
      });
      existingReceiptNumbers.add(c.receiptNumber);
    }
  }

  savePersistedStatutoryReceipts(mergedReceipts);

  return { challans: mergedChallans, receipts: mergedReceipts };
}

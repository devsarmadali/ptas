import { describe, expect, it } from "vitest";
import {
  assertLedgerEntryImmutable,
  computeLedgerBalance,
  createDemandLedgerEntry,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  createReversalEntry,
  createRevisionAdjustmentEntry
} from "../src/ledger.js";

describe("ledger domain operations", () => {
  const demandUnitId = "11111111-1111-4111-8111-111111111111";
  const fyId1 = "22222222-2222-4222-8222-222222222222";
  const fyId2 = "33333333-3333-4333-8333-333333333333";
  const version1Id = "44444444-4444-4444-8444-444444444444";
  const version2Id = "55555555-5555-4555-8555-555555555555";
  const actorId = "66666666-6666-4666-8666-666666666666";

  it("creates an initial assessment demand entry", () => {
    const entry = createInitialDemandEntry({
      demandUnitId,
      financialYearId: fyId1,
      assessmentVersionId: version1Id,
      amount: 5000,
      actorId,
      correlationId: "corr-1",
      idempotencyKey: "idem-1"
    });

    expect(entry.entryType).toBe("ASSESSMENT_DEMAND");
    expect(entry.amount).toBe(5000);
    expect(entry.sourceType).toBe("ASSESSMENT");
    expect(entry.sourceId).toBe(version1Id);
    expect(entry.reversesEntryId).toBeUndefined();
    expect(entry.metadata.assessmentVersionId).toBe(version1Id);
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it("rejects non-positive amounts for initial assessment demand", () => {
    expect(() =>
      createInitialDemandEntry({
        demandUnitId,
        financialYearId: fyId1,
        assessmentVersionId: version1Id,
        amount: 0,
        actorId,
        correlationId: "corr-1",
        idempotencyKey: "idem-1"
      })
    ).toThrow(/greater than zero/);

    expect(() =>
      createInitialDemandEntry({
        demandUnitId,
        financialYearId: fyId1,
        assessmentVersionId: version1Id,
        amount: -500,
        actorId,
        correlationId: "corr-1",
        idempotencyKey: "idem-1"
      })
    ).toThrow(/greater than zero/);
  });

  it("creates upward revision adjustment entry", () => {
    const entry = createRevisionAdjustmentEntry({
      demandUnitId,
      financialYearId: fyId1,
      revisionVersionId: version2Id,
      previousAmount: 5000,
      newAmount: 7500,
      actorId,
      correlationId: "corr-rev-1",
      idempotencyKey: "idem-rev-1"
    });

    expect(entry.entryType).toBe("REVISION_ADJUSTMENT");
    expect(entry.amount).toBe(2500);
    expect(entry.sourceType).toBe("ASSESSMENT");
    expect(entry.sourceId).toBe(version2Id);
    expect(entry.metadata.previousAmount).toBe(5000);
    expect(entry.metadata.newAmount).toBe(7500);
    expect(entry.metadata.delta).toBe(2500);
  });

  it("creates downward revision adjustment entry", () => {
    const entry = createRevisionAdjustmentEntry({
      demandUnitId,
      financialYearId: fyId1,
      revisionVersionId: version2Id,
      previousAmount: 5000,
      newAmount: 3000,
      actorId,
      correlationId: "corr-rev-2",
      idempotencyKey: "idem-rev-2"
    });

    expect(entry.entryType).toBe("REVISION_ADJUSTMENT");
    expect(entry.amount).toBe(-2000);
    expect(entry.metadata.delta).toBe(-2000);
  });

  it("rejects revision adjustment when delta is zero", () => {
    expect(() =>
      createRevisionAdjustmentEntry({
        demandUnitId,
        financialYearId: fyId1,
        revisionVersionId: version2Id,
        previousAmount: 5000,
        newAmount: 5000,
        actorId,
        correlationId: "corr-rev-3",
        idempotencyKey: "idem-rev-3"
      })
    ).toThrow(/delta is zero/);
  });

  it("creates an equal-and-opposite reversal entry referencing the original entry", () => {
    const original = createInitialDemandEntry({
      demandUnitId,
      financialYearId: fyId1,
      assessmentVersionId: version1Id,
      amount: 4500,
      actorId,
      correlationId: "corr-orig",
      idempotencyKey: "idem-orig"
    });

    const reversal = createReversalEntry(
      original,
      "Erronous assessment order vacated on appeal",
      actorId,
      "corr-rev",
      "idem-rev"
    );

    expect(reversal.entryType).toBe("REVERSAL");
    expect(reversal.amount).toBe(-4500);
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.metadata.reversedEntryId).toBe(original.id);
    expect(reversal.metadata.reversalReason).toBe("Erronous assessment order vacated on appeal");
    expect(reversal.metadata.reversedAmount).toBe(4500);
  });

  it("validates ledger entry invariants", () => {
    // Zero amount rejected
    expect(() =>
      createDemandLedgerEntry({
        demandUnitId,
        financialYearId: fyId1,
        entryType: "MANUAL_ADJUSTMENT",
        amount: 0,
        sourceType: "MANUAL",
        sourceId: "man-1",
        idempotencyKey: "idem-man-1",
        correlationId: "corr-man-1",
        postedBy: actorId
      })
    ).toThrow(/amount cannot be zero/);

    // Self-reversal rejected
    const id = crypto.randomUUID();
    expect(() =>
      createDemandLedgerEntry({
        id,
        demandUnitId,
        financialYearId: fyId1,
        entryType: "REVERSAL",
        amount: -100,
        sourceType: "TEST",
        sourceId: "src-1",
        reversesEntryId: id,
        idempotencyKey: "idem-self",
        correlationId: "corr-self",
        postedBy: actorId
      })
    ).toThrow(/cannot reverse itself/);
  });

  it("computes derived ledger balance across entries and financial years", () => {
    const initial1 = createInitialDemandEntry({
      demandUnitId,
      financialYearId: fyId1,
      assessmentVersionId: version1Id,
      amount: 10000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "k1"
    });

    const revAdj1 = createRevisionAdjustmentEntry({
      demandUnitId,
      financialYearId: fyId1,
      revisionVersionId: version2Id,
      previousAmount: 10000,
      newAmount: 12000,
      actorId,
      correlationId: "c2",
      idempotencyKey: "k2"
    });

    const initial2 = createInitialDemandEntry({
      demandUnitId,
      financialYearId: fyId2,
      assessmentVersionId: crypto.randomUUID(),
      amount: 6000,
      actorId,
      correlationId: "c3",
      idempotencyKey: "k3"
    });

    const entries = [initial1, revAdj1, initial2];

    // Total across all years
    expect(computeLedgerBalance(entries)).toBe(18000);

    // Filtered by FY1 (10000 + 2000 = 12000)
    expect(computeLedgerBalance(entries, fyId1)).toBe(12000);

    // Filtered by FY2 (6000)
    expect(computeLedgerBalance(entries, fyId2)).toBe(6000);

    // After reversal of initial2
    const reversal2 = createReversalEntry(initial2, "Vacated", actorId, "c4", "k4");
    const updatedEntries = [...entries, reversal2];
    expect(computeLedgerBalance(updatedEntries, fyId2)).toBe(0);
    expect(computeLedgerBalance(updatedEntries)).toBe(12000);
  });

  it("creates a payment receipt entry that reduces derived balance", () => {
    const demandEntry = createInitialDemandEntry({
      demandUnitId,
      financialYearId: fyId1,
      assessmentVersionId: version1Id,
      amount: 4000,
      actorId,
      correlationId: "c-pay-1",
      idempotencyKey: "k-pay-1"
    });

    const paymentEntry = createPaymentReceiptEntry({
      demandUnitId,
      financialYearId: fyId1,
      amount: 4000,
      receiptNumber: "CHALLAN-32A-2026-0091",
      paymentChannel: "CHALLAN_32A",
      actorId,
      correlationId: "c-pay-2",
      idempotencyKey: "k-pay-2",
      depositDate: "2026-07-15"
    });

    expect(paymentEntry.entryType).toBe("PAYMENT_CREDIT");
    expect(paymentEntry.amount).toBe(-4000); // Signed negative credit
    expect(paymentEntry.sourceType).toBe("PAYMENT_RECEIPT");
    expect(paymentEntry.sourceId).toBe("CHALLAN-32A-2026-0091");
    expect(paymentEntry.metadata.paymentChannel).toBe("CHALLAN_32A");
    expect(paymentEntry.metadata.depositedAmount).toBe(4000);

    // Derived balance should drop from 4000 to 0
    expect(computeLedgerBalance([demandEntry, paymentEntry], fyId1)).toBe(0);
  });

  it("rejects non-positive payment receipt amounts", () => {
    expect(() =>
      createPaymentReceiptEntry({
        demandUnitId,
        financialYearId: fyId1,
        amount: 0,
        receiptNumber: "CHALLAN-0",
        paymentChannel: "CHALLAN_32A",
        actorId,
        correlationId: "c-err",
        idempotencyKey: "k-err"
      })
    ).toThrow(/greater than zero/);
  });

  it("enforces immutable ledger guard", () => {
    expect(() => assertLedgerEntryImmutable()).toThrow(/append-only/);
  });
});

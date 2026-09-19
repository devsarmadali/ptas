import { describe, expect, it } from "vitest";
import type { AuditContext } from "@ptas/domain";
import {
  createDemandLedgerEntry,
  createInitialDemandEntry,
  createReversalEntry,
  createRevisionAdjustmentEntry
} from "@ptas/domain";
import { InMemoryAuditRepository, InMemoryDemandLedgerRepository } from "../src/index.js";

describe("InMemoryDemandLedgerRepository", () => {
  const taxpayerId = "11111111-1111-4111-8111-111111111111";
  const fyId1 = "22222222-2222-4222-8222-222222222222";
  const fyId2 = "33333333-3333-4333-8333-333333333333";
  const permanentDemandNo = "LHR-PROF-2026-0001";
  const actorId = "44444444-4444-4444-8444-444444444444";

  const auditContext: AuditContext = {
    actor: {
      userId: actorId,
      roleCode: "ETO",
      jurisdictionId: "55555555-5555-4555-8555-555555555555"
    },
    correlationId: "corr-ledger-test-01"
  };

  it("creates and retrieves a demand unit idempotently", async () => {
    const repo = new InMemoryDemandLedgerRepository();

    const unit1 = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);
    expect(unit1.taxpayerId).toBe(taxpayerId);
    expect(unit1.permanentDemandNo).toBe(permanentDemandNo);

    // Second call returns existing unit
    const unit2 = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);
    expect(unit2.id).toBe(unit1.id);

    const foundByTaxpayer = await repo.findDemandUnitByTaxpayerId(taxpayerId);
    expect(foundByTaxpayer?.id).toBe(unit1.id);

    const foundById = await repo.findDemandUnitById(unit1.id);
    expect(foundById?.permanentDemandNo).toBe(permanentDemandNo);
  });

  it("posts an initial demand entry and emits an audit event", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryDemandLedgerRepository(auditRepo);

    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);
    const initialEntry = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-assessment-id",
      amount: 5000,
      actorId,
      correlationId: auditContext.correlationId,
      idempotencyKey: "idem-initial-1"
    });

    const posted = await repo.postEntry(initialEntry, auditContext);
    expect(posted.id).toBe(initialEntry.id);
    expect(posted.amount).toBe(5000);

    // Verify balance
    const balance = await repo.getBalance(unit.id);
    expect(balance).toBe(5000);

    // Verify audit event
    const auditEvents = await auditRepo.queryByCorrelationId(auditContext.correlationId);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.eventType).toBe("DEMAND_LEDGER_POSTED");
    expect(auditEvents[0]?.payload.amount).toBe(5000);
  });

  it("rejects duplicate idempotency key within the same demand unit", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);

    const entry1 = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-assessment-id",
      amount: 4000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "idem-dup-test"
    });

    await repo.postEntry(entry1, auditContext);

    // Second entry with identical idempotencyKey
    const entry2 = createDemandLedgerEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      entryType: "PENALTY_DEMAND",
      amount: 500,
      sourceType: "PENALTY",
      sourceId: "pen-1",
      idempotencyKey: "idem-dup-test",
      correlationId: "c2",
      postedBy: actorId
    });

    await expect(repo.postEntry(entry2, auditContext)).rejects.toThrow(
      /idempotency_key 'idem-dup-test' already exists/
    );
  });

  it("posts revision adjustment entries and updates derived balance", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);

    const initial = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-id",
      amount: 5000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "idem-rev-init"
    });
    await repo.postEntry(initial, auditContext);

    // Upward revision from 5000 to 8000 (delta: +3000)
    const revAdjustment = createRevisionAdjustmentEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      revisionVersionId: "v2-id",
      previousAmount: 5000,
      newAmount: 8000,
      actorId,
      correlationId: "c2",
      idempotencyKey: "idem-rev-adj-1"
    });
    await repo.postEntry(revAdjustment, auditContext);

    expect(await repo.getBalance(unit.id)).toBe(8000);
    expect(await repo.getBalance(unit.id, fyId1)).toBe(8000);

    // Downward revision from 8000 to 6000 (delta: -2000)
    const revAdjustment2 = createRevisionAdjustmentEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      revisionVersionId: "v3-id",
      previousAmount: 8000,
      newAmount: 6000,
      actorId,
      correlationId: "c3",
      idempotencyKey: "idem-rev-adj-2"
    });
    await repo.postEntry(revAdjustment2, auditContext);

    expect(await repo.getBalance(unit.id)).toBe(6000);

    const entries = await repo.listEntries(unit.id, fyId1);
    expect(entries).toHaveLength(3);
  });

  it("posts equal-and-opposite reversal referencing original entry", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);

    const initial = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-id",
      amount: 4000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "idem-rev-init"
    });
    await repo.postEntry(initial, auditContext);

    const reversal = createReversalEntry(
      initial,
      "Order vacated in appeal",
      actorId,
      "c-reversal",
      "idem-reversal"
    );

    const postedReversal = await repo.postEntry(reversal, auditContext);
    expect(postedReversal.amount).toBe(-4000);
    expect(postedReversal.reversesEntryId).toBe(initial.id);

    // Balance after reversal is 0
    expect(await repo.getBalance(unit.id)).toBe(0);
  });

  it("rejects reversal referencing non-existent entry", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);

    const fakeEntry = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-id",
      amount: 4000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "idem-fake"
    });

    const reversal = createReversalEntry(
      fakeEntry,
      "Order vacated",
      actorId,
      "c-rev",
      "idem-rev-fake"
    );

    await expect(repo.postEntry(reversal, auditContext)).rejects.toThrow(
      /Referenced original entry .* does not exist/
    );
  });

  it("prohibits update and delete methods (append-only enforcement)", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    await expect(repo.updateEntry()).rejects.toThrow(/append-only/);
    await expect(repo.deleteEntry()).rejects.toThrow(/append-only/);
  });

  it("filters entries by financial year correctly", async () => {
    const repo = new InMemoryDemandLedgerRepository();
    const unit = await repo.findOrCreateDemandUnit(taxpayerId, permanentDemandNo);

    const fy1Entry = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId1,
      assessmentVersionId: "v1-id",
      amount: 3000,
      actorId,
      correlationId: "c1",
      idempotencyKey: "idem-fy1"
    });
    await repo.postEntry(fy1Entry, auditContext);

    const fy2Entry = createInitialDemandEntry({
      demandUnitId: unit.id,
      financialYearId: fyId2,
      assessmentVersionId: "v2-id",
      amount: 7000,
      actorId,
      correlationId: "c2",
      idempotencyKey: "idem-fy2"
    });
    await repo.postEntry(fy2Entry, auditContext);

    expect(await repo.getBalance(unit.id)).toBe(10000);
    expect(await repo.getBalance(unit.id, fyId1)).toBe(3000);
    expect(await repo.getBalance(unit.id, fyId2)).toBe(7000);

    const entriesFy1 = await repo.listEntries(unit.id, fyId1);
    expect(entriesFy1).toHaveLength(1);
    expect(entriesFy1[0]?.amount).toBe(3000);

    const entriesFy2 = await repo.listEntries(unit.id, fyId2);
    expect(entriesFy2).toHaveLength(1);
    expect(entriesFy2[0]?.amount).toBe(7000);
  });
});

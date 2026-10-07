import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { createInitialPilotUnits, type StatutoryReceiptRecord } from "../src/lib/pilot-store";
import {
  createInitialPotentialUnits,
  migratePotentialUnitToPft3,
  savePersistedMigratedUnit,
  loadPersistedMigratedUnits
} from "../src/lib/potential-units-storage";
import { generateFormPFT3Rows, computeUnitFinancialSummary } from "../src/lib/statutory-forms";
import {
  applyReceiptsAndMigratedUnitsToStoredUnits,
  savePersistedStatutoryReceipts
} from "../src/lib/challan-storage";
import { createPaymentReceiptEntry } from "@ptas/domain";

class MockStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

describe("Receive Challan Simulation Test", () => {
  let mockStorage: MockStorage;

  beforeAll(() => {
    mockStorage = new MockStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        dispatchEvent: () => true
      },
      writable: true,
      configurable: true
    });
  });

  beforeEach(() => {
    mockStorage.clear();
  });

  it("simulates receiving a regular PFT-2 challan for an existing unit and validates PFT-3 row & balance", () => {
    const units = createInitialPilotUnits();
    const target = units[1]!; // second unit (kisan)
    expect(target.ledgerEntries.filter((e) => e.amount < 0)).toHaveLength(0);

    const initialSummary = computeUnitFinancialSummary(target);
    expect(initialSummary.totalPaid).toBe(0);
    expect(initialSummary.outstandingBalance).toBe(2000);

    // Simulate receiving challan
    const payableAmount = 2000;
    const paymentEntry = createPaymentReceiptEntry({
      demandUnitId: target.demandUnit.id,
      amount: payableAmount,
      financialYearId: "FY-2026-27",
      receiptNumber: "RCPT-TEST-001",
      paymentChannel: "CHALLAN_32A",
      actorId: "officer-1",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
      depositDate: "2026-07-15"
    });

    const updatedUnit = {
      ...target,
      ledgerEntries: [...target.ledgerEntries, paymentEntry]
    };
    const updatedUnits = units.map((u) => (u.id === target.id ? updatedUnit : u));

    const rows = generateFormPFT3Rows(updatedUnits);
    const row = rows.find((r) => r.sourceUnitId === target.id)!;

    // Must display in Paid column
    expect(row.totalPaid).toBe(2000);
    // Must deduct from outstanding balance
    expect(row.outstandingBalance).toBe(0);

    // Recovery statistics calculation
    const totalRecoveredKpi = rows.reduce((acc, r) => acc + r.totalPaid, 0);
    expect(totalRecoveredKpi).toBeGreaterThanOrEqual(2000);
  });

  it("simulates receiving a potential provisional challan and migrating to Form PFT-3", () => {
    const units = createInitialPilotUnits();
    const potentialUnits = createInitialPotentialUnits();
    const potTarget = potentialUnits[0]!;

    const payableAmount = potTarget.annualRatePkr;
    const migration = migratePotentialUnitToPft3(potTarget, units, payableAmount);

    expect(migration.migratedUnit.pft3Registered).toBe(true);
    expect(migration.migratedUnit.circleName).not.toBe("Circle-Vehari");

    // Save persisted migrated unit
    savePersistedMigratedUnit(migration.migratedUnit);
    expect(loadPersistedMigratedUnits()).toHaveLength(1);

    const updatedUnits = [migration.migratedUnit, ...units];
    const rows = generateFormPFT3Rows(updatedUnits);
    const row = rows.find((r) => r.sourceUnitId === migration.migratedUnit.id)!;

    // Migrated unit must display paid amount in Paid column
    expect(row.totalPaid).toBe(payableAmount);
    // Outstanding balance must be discharged (0)
    expect(row.outstandingBalance).toBe(0);

    // Verify recovery card statistics
    const totalRecoveredKpi = rows.reduce((acc, r) => acc + r.totalPaid, 0);
    expect(totalRecoveredKpi).toBeGreaterThanOrEqual(payableAmount);
  });

  it("persists receipt and restores paid amount via applyReceiptsAndMigratedUnitsToStoredUnits", () => {
    const units = createInitialPilotUnits();
    const target = units[1]!; // Kisan Zarai Markaz (unpaid 2000)

    const receipt: StatutoryReceiptRecord = {
      id: "rec-test-1",
      receiptNumber: "RCPT-00099",
      paymentSource: "ISSUED_PFT2",
      challanNumber: "PFT2-00099",
      demandNumber: target.demandUnit.permanentDemandNo || "0002",
      unitId: target.id,
      assesseeLegalName: target.legalName,
      identifierType: target.identifierType,
      identifierValue: target.identifierValue,
      address: target.address,
      statutoryCategory: target.categoryCode,
      subclassificationCode: null,
      tertiarySlab: null,
      amountPaidPkr: 2000,
      amountPaidWords: "Two Thousand Rupees Only",
      dateOfReceipt: "2026-07-20",
      timeOfReceipt: "10:30",
      paymentChannel: "National Bank of Pakistan",
      bankBranch: "Vehari Main Branch",
      bankScrollRef: "CPR-987654",
      receivingOfficerName: "ETO Vehari",
      receivingOfficerTitle: "Excise & Taxation Officer",
      pin: target.pinNumber || "237-0010106110200002-01",
      officialSha256: "sha256-hash",
      qrPayload: "https://ptas.punjab.gov.pk"
    };

    savePersistedStatutoryReceipts([receipt]);

    // Apply persisted receipts to freshly loaded survey units
    const synced = applyReceiptsAndMigratedUnitsToStoredUnits(units);
    const syncedTarget = synced.find((u) => u.id === target.id)!;

    const summary = computeUnitFinancialSummary(syncedTarget);
    expect(summary.totalPaid).toBe(2000);
    expect(summary.outstandingBalance).toBe(0);

    const rows = generateFormPFT3Rows(synced);
    const row = rows.find((r) => r.sourceUnitId === target.id)!;
    expect(row.totalPaid).toBe(2000);
    expect(row.outstandingBalance).toBe(0);
  });
});

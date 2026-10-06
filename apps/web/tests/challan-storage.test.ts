import { describe, expect, it, beforeEach, beforeAll } from "vitest";
import {
  loadPersistedPft2Challans,
  savePersistedPft2Challans,
  saveIssuedPft2Challan,
  loadPersistedStatutoryReceipts,
  savePersistedStatutoryReceipts,
  ensureChallansAndReceiptsForUnits,
  applyReceiptsAndMigratedUnitsToStoredUnits,
  PFT2_CHALLANS_STORAGE_KEY,
  STATUTORY_RECEIPTS_STORAGE_KEY
} from "../src/lib/challan-storage";
import { createInitialPilotUnits, type Pft2ChallanRecord } from "../src/lib/pilot-store";
import { computeUnitFinancialSummary } from "../src/lib/statutory-forms";

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

describe("Form P.F.T-2 Challans & Statutory Receipts Persistence Layer", () => {
  beforeAll(() => {
    const mockStorage = new MockStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true
    });
    if (typeof (globalThis as unknown as { window?: unknown }).window === "undefined") {
      Object.defineProperty(globalThis, "window", {
        value: {
          dispatchEvent: () => true,
          addEventListener: () => {},
          removeEventListener: () => {}
        },
        writable: true,
        configurable: true
      });
    }
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("loads empty arrays when localStorage is pristine", () => {
    expect(loadPersistedPft2Challans()).toEqual([]);
    expect(loadPersistedStatutoryReceipts()).toEqual([]);
  });

  it("persists and reloads Form PFT-2 Challans", () => {
    const mockChallan: Pft2ChallanRecord = {
      id: "pft2-test-01",
      challanNumber: "PFT2-VHR-2026-00001",
      noticeNumber: "PFT2-0001-260701010101-10000",
      pin: "741298",
      demandNumber: "0001",
      unitId: "unit-01",
      legalName: "Test Enterprise (Pvt) Ltd",
      identifierType: "NTN",
      identifierValue: "1234567-8",
      address: "Club Road, Vehari",
      category: "Companies",
      subclassificationCode: "1.i",
      tertiarySlab: null,
      amountPayable: 10000,
      issueDate: "2026-07-01",
      dueDate: "2026-07-31",
      status: "ISSUED",
      officialSha256: "sha256-sample",
      qrPayload: "https://ptas.punjab.gov.pk/verify"
    };

    savePersistedPft2Challans([mockChallan]);
    const loaded = loadPersistedPft2Challans();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.challanNumber).toBe("PFT2-VHR-2026-00001");
    expect(loaded[0]?.amountPayable).toBe(10000);
  });

  it("prepends newly issued challan and updates existing challans correctly", () => {
    const challan1: Pft2ChallanRecord = {
      id: "pft2-test-01",
      challanNumber: "PFT2-VHR-2026-00001",
      noticeNumber: "PFT2-0001-260701010101-10000",
      demandNumber: "0001",
      unitId: "unit-01",
      legalName: "First Unit",
      identifierType: "NTN",
      identifierValue: "1111111-1",
      address: "Vehari",
      category: "Companies",
      subclassificationCode: "1.i",
      tertiarySlab: null,
      amountPayable: 10000,
      issueDate: "2026-07-01",
      dueDate: "2026-07-31",
      status: "ISSUED",
      officialSha256: "sha256-1",
      qrPayload: "qr-1"
    };

    saveIssuedPft2Challan(challan1);
    expect(loadPersistedPft2Challans()).toHaveLength(1);

    const challan2: Pft2ChallanRecord = {
      id: "pft2-test-02",
      challanNumber: "PFT2-VHR-2026-00002",
      noticeNumber: "PFT2-0002-260701010101-2000",
      demandNumber: "0002",
      unitId: "unit-02",
      legalName: "Second Unit",
      identifierType: "CNIC",
      identifierValue: "36601-1111111-1",
      address: "Vehari",
      category: "Pesticide",
      subclassificationCode: "6.x",
      tertiarySlab: null,
      amountPayable: 2000,
      issueDate: "2026-07-01",
      dueDate: "2026-07-31",
      status: "ISSUED",
      officialSha256: "sha256-2",
      qrPayload: "qr-2"
    };

    saveIssuedPft2Challan(challan2);
    const list = loadPersistedPft2Challans();
    expect(list).toHaveLength(2);
    // Newly issued challan is prepended
    expect(list[0]?.id).toBe("pft2-test-02");
    expect(list[1]?.id).toBe("pft2-test-01");

    // Updating existing challan
    const updatedChallan1: Pft2ChallanRecord = {
      ...challan1,
      status: "RECEIVED",
      receiptNumber: "RCPT-2026-00001"
    };
    saveIssuedPft2Challan(updatedChallan1);
    const updatedList = loadPersistedPft2Challans();
    expect(updatedList).toHaveLength(2);
    const found1 = updatedList.find((c) => c.id === "pft2-test-01");
    expect(found1?.status).toBe("RECEIVED");
    expect(found1?.receiptNumber).toBe("RCPT-2026-00001");
  });

  it("maintains only officially issued challans and ensures receipts for received challans", () => {
    const units = createInitialPilotUnits();
    // Initially without issued challans, it returns empty (never auto-generates 750 unissued challans)
    const initial = ensureChallansAndReceiptsForUnits(units);
    expect(initial.challans).toHaveLength(0);

    // Save an issued challan
    const challan: Pft2ChallanRecord = {
      id: "pft2-v4-01",
      challanNumber: "PFT2-0001",
      noticeNumber: "PFT2-0001-2607010101-10000",
      demandNumber: "0001",
      unitId: units[0]!.id,
      legalName: units[0]!.legalName,
      identifierType: "NTN",
      identifierValue: "1234567-8",
      address: "Vehari",
      category: "Companies",
      subclassificationCode: "1(i)",
      tertiarySlab: null,
      amountPayable: 10000,
      issueDate: "2026-07-01",
      dueDate: "2026-08-31",
      status: "RECEIVED",
      receiptNumber: "RCPT-00001",
      officialSha256: "sha-01",
      qrPayload: "qr-01"
    };
    saveIssuedPft2Challan(challan);

    const { challans, receipts } = ensureChallansAndReceiptsForUnits(units);
    expect(challans).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.receiptNumber).toBe("RCPT-00001");
  });

  it("applies received challans and receipts to unit ledgers and updates recovery", () => {
    const units = createInitialPilotUnits();
    const targetUnit = units[0]!;

    // Save a received challan
    const challan: Pft2ChallanRecord = {
      id: "pft2-v4-rec-01",
      challanNumber: "PFT2-0099",
      noticeNumber: "PFT2-0099-2607010101-5000",
      demandNumber: targetUnit.demandUnit.permanentDemandNo,
      unitId: targetUnit.id,
      legalName: targetUnit.legalName,
      identifierType: targetUnit.identifierType,
      identifierValue: targetUnit.identifierValue,
      address: targetUnit.address,
      category: targetUnit.categoryCode,
      subclassificationCode: targetUnit.subclassificationCode ?? null,
      tertiarySlab: null,
      amountPayable: 5000,
      issueDate: "2026-07-01",
      dueDate: "2026-08-31",
      status: "RECEIVED",
      receiptNumber: "RCPT-0099",
      officialSha256: "sha-02",
      qrPayload: "qr-02"
    };
    savePersistedPft2Challans([challan]);

    const syncedUnits = applyReceiptsAndMigratedUnitsToStoredUnits(units);
    const updated = syncedUnits.find((u) => u.id === targetUnit.id)!;

    const paymentEntry = updated.ledgerEntries.find((e) => e.sourceId === "PFT2-0099");
    expect(paymentEntry).toBeDefined();
    expect(paymentEntry?.amount).toBe(-5000);

    const summary = computeUnitFinancialSummary(updated);
    expect(summary.totalPaid).toBeGreaterThanOrEqual(5000);
  });
});

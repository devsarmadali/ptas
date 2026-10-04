import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  formatPotentialPin,
  cleanPotentialPin,
  resolveDemandNumberCollision,
  createInitialPotentialUnits,
  loadPersistedPotentialUnits,
  savePersistedPotentialUnits,
  migratePotentialUnitToPft3,
  importPotentialUnitsCsv,
  POTENTIAL_UNITS_STORAGE_KEY
} from "../src/lib/potential-units-storage";
import type { StoredUnit } from "../src/lib/pilot-store";

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

describe("Potential Assessment Register Persistence & Migration Layer", () => {
  beforeAll(() => {
    const mockStorage = new MockStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        dispatchEvent: () => true
      },
      writable: true
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("correctly applies and cleans the 'Potential-' PIN prefix", () => {
    const rawPin = "237-0010106110200054-01";
    const potentialPin = formatPotentialPin(rawPin);
    expect(potentialPin).toBe("Potential-237-0010106110200054-01");

    const cleaned = cleanPotentialPin(potentialPin);
    expect(cleaned).toBe("237-0010106110200054-01");
  });

  it("resolves demand number collisions with /1, /2 suffix convention", () => {
    const existing = [
      { demandNumber: "D-0101", demandUnit: { permanentDemandNo: "D-0101" } },
      { demandNumber: "D-0101/1", demandUnit: { permanentDemandNo: "D-0101/1" } },
      { demandNumber: "D-0202", demandUnit: { permanentDemandNo: "D-0202" } }
    ] as unknown as StoredUnit[];

    // No collision
    expect(resolveDemandNumberCollision("D-0303", existing)).toBe("D-0303");

    // Collision with D-0202
    expect(resolveDemandNumberCollision("D-0202", existing)).toBe("D-0202/1");

    // Double collision with D-0101 and D-0101/1
    expect(resolveDemandNumberCollision("D-0101", existing)).toBe("D-0101/2");
  });

  it("loads initial seed units and saves to localStorage", () => {
    const units = loadPersistedPotentialUnits();
    expect(units.length).toBeGreaterThanOrEqual(5);
    expect(units[0]?.pinNumber).toMatch(/^Potential-/);
    expect(units[0]?.potentialNumber).toMatch(/^POT-/);

    // Persisted in localStorage
    const storedRaw = localStorage.getItem(POTENTIAL_UNITS_STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
  });

  it("imports potential units directly without requiring ETO approval", () => {
    const initialUnits = createInitialPotentialUnits();
    const csv = `Legal Name,Identifier,Category Code,Subclass Code,Address,Locality,Arrears,Trade Name
"Burewala Textiles Ltd","36603-9998881-1","1","1(i)","Main Road","Burewala Commercial Hub",2000,"Burewala Mills"
"Vehari Agro Clinic","36603-8887772-2","4","4(i)","Stadium Road","Vehari City Commercial Zone",0,"Agro Clinic"`;

    const result = importPotentialUnitsCsv(csv, initialUnits, "Inspector Ahmad");
    expect(result.importedUnits).toHaveLength(2);
    expect(result.importedUnits[0]?.legalName).toBe("Burewala Textiles Ltd");
    expect(result.importedUnits[0]?.pinNumber).toMatch(/^Potential-/);
    expect(result.importedUnits[0]?.potentialNumber).toMatch(/^POT-/);
    expect(result.importedUnits[0]?.createdBy).toBe("Inspector Ahmad");
  });

  it("migrates potential unit to PFT-3 upon payment realization", () => {
    const potentialUnits = createInitialPotentialUnits();
    const target = potentialUnits[0]!;
    const existingPft3Units: StoredUnit[] = [];

    const { migratedUnit, assignedDemandNo, cleanPin } = migratePotentialUnitToPft3(
      target,
      existingPft3Units,
      target.annualRatePkr
    );

    // Clean PIN without prefix
    expect(cleanPin).not.toContain("Potential-");
    expect(migratedUnit.pinNumber).toBe(cleanPin);
    expect(migratedUnit.provincialUin).toBe(cleanPin);

    // Demand number assigned
    expect(assignedDemandNo).toBe(`D-${target.potentialNumber.replace(/^POT-/i, "")}`);
    expect(migratedUnit.demandNumber).toBe(assignedDemandNo);
    expect(migratedUnit.pft3Registered).toBe(true);

    // Assessment is approved
    expect(migratedUnit.assessments[0]?.status).toBe("APPROVED");
    expect(migratedUnit.assessmentVersions[0]?.status).toBe("APPROVED");

    // Ledger has assessment and payment credit
    expect(migratedUnit.ledgerEntries.length).toBeGreaterThanOrEqual(2);
    expect(migratedUnit.ledgerEntries.some((e) => e.entryType === "PAYMENT_CREDIT")).toBe(true);
  });
});

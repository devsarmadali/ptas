import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  formatPotentialPin,
  cleanPotentialPin,
  resolveDemandNumberCollision,
  createInitialPotentialUnits,
  loadPersistedPotentialUnits,
  savePersistedPotentialUnits,
  migratePotentialUnitToPft3,
  migrateVDemandUnitsToPotentialRegister,
  V_UNITS_MIGRATION_FLAG_KEY,
  importPotentialUnitsCsv,
  generatePotentialCsvTemplate,
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
    expect(result.importedUnits[0]?.openingArrears).toBe(0);
  });

  it("generates authentic CSV template with Vehari jurisdiction headers and no arrears", () => {
    const template = generatePotentialCsvTemplate();
    expect(template).toContain("District,Circle,Tehsil,Locality,Commercial Address");
    expect(template).toContain("Vehari Circle I (City / Commercial)");
    expect(template).toContain("Burewala Circle");
    expect(template).toContain("Mailsi Circle");
    expect(template).not.toContain("Arrears");
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

  it("migrates V- demand units to potential register with zero arrears and idempotent flag", () => {
    // Initial state has seed potential units
    const initialUnits = loadPersistedPotentialUnits();
    const initialCount = initialUnits.length;

    const mockSurveyUnits = [
      {
        id: "unit-v1",
        legalName: "Vehari Trading Corp",
        tradeName: "V-Trade",
        identifierType: "CNIC",
        identifierValue: "36603-1111111-1",
        address: "Club Road",
        locality: "Club Road Commercial Area",
        circleId: "00000000-0000-4000-8000-000000000004",
        circleName: "Vehari Circle I (City / Commercial)",
        districtName: "Vehari",
        categoryCode: "1",
        subclassificationCode: "1(i)",
        statutoryRuleId: "PFT-1.i",
        assessmentNumber: "ASM-V-01-100",
        demandNumber: "V-01-100",
        provincialUin: "237-0010106110200100-01",
        demandUnit: {
          id: "dem-v1",
          taxpayerId: "tax-v1",
          permanentDemandNo: "V-01-100",
          createdAt: new Date().toISOString()
        },
        assessments: [],
        assessmentVersions: [
          {
            id: "av-v1",
            assessmentId: "asm-v1",
            versionNo: 1,
            status: "APPROVED" as const,
            reason: "Initial survey",
            createdBy: "Survey",
            snapshot: {
              taxAmount: 10000,
              statutoryCategory: "Commercial",
              legalBasis: "Punjab Finance Act",
              ruleId: "PFT-1.i",
              subclassificationCode: "1(i)"
            },
            createdAt: new Date().toISOString()
          }
        ],
        ledgerEntries: [],
        openingArrears: 5000, // Arrears in PFT-3 survey
        createdAt: new Date().toISOString()
      },
      {
        id: "unit-non-v",
        legalName: "Standard Corp",
        identifierType: "CNIC",
        identifierValue: "36603-2222222-2",
        address: "Main Road",
        demandNumber: "D-0500",
        demandUnit: {
          id: "dem-non-v",
          taxpayerId: "tax-non-v",
          permanentDemandNo: "D-0500",
          createdAt: new Date().toISOString()
        },
        assessments: [],
        assessmentVersions: [],
        ledgerEntries: [],
        createdAt: new Date().toISOString()
      }
    ] as unknown as StoredUnit[];

    migrateVDemandUnitsToPotentialRegister(mockSurveyUnits);

    // Verify flag was set
    expect(localStorage.getItem(V_UNITS_MIGRATION_FLAG_KEY)).not.toBeNull();

    // Verify potential units were updated
    const after = loadPersistedPotentialUnits();
    expect(after.length).toBe(initialCount + 1);

    const migrated = after.find((u) => u.legalName === "Vehari Trading Corp");
    expect(migrated).toBeDefined();
    expect(migrated?.potentialNumber).toMatch(/^POT-/);
    expect(migrated?.pinNumber).toBe("Potential-237-0010106110200100-01");
    expect(migrated?.openingArrears).toBe(0); // STRICT DOMAIN RULE: zero arrears
    expect(migrated?.annualRatePkr).toBe(10000);
    expect(migrated?.status).toBe("ACTIVE");

    // Idempotency: running again should not add more
    migrateVDemandUnitsToPotentialRegister(mockSurveyUnits);
    const afterSecond = loadPersistedPotentialUnits();
    expect(afterSecond.length).toBe(after.length);
  });

  it("converts a PotentialUnitRecord into a valid StoredUnit that works with Form PFT-1 and PFT-2", async () => {
    const { convertPotentialUnitToStoredUnit } = await import("../src/lib/potential-units-storage");
    const { generateFormPFT1, generateFormPFT2, formatFullSubclassCode } =
      await import("../src/lib/statutory-forms");

    const initialUnits = createInitialPotentialUnits();
    const pot = initialUnits[0]!;
    expect(pot).toBeDefined();

    const stored = convertPotentialUnitToStoredUnit(pot);

    // Verify vital StoredUnit properties
    expect(stored.id).toBe(pot.id);
    expect(stored.pinNumber).toBe(pot.pinNumber);
    expect(stored.statutoryRule).toBeDefined();
    expect(stored.statutoryRule.category).toBe(pot.categoryName);
    expect(stored.statutoryRule.subclassification_code).toBe("1(i)");
    expect(stored.assessments).toHaveLength(1);
    expect(stored.assessments[0]?.status).toBe("APPROVED");
    expect(stored.assessmentVersions).toHaveLength(1);
    expect(stored.assessmentVersions[0]?.snapshot.taxAmount).toBe(pot.annualRatePkr);
    expect(stored.openingArrears).toBe(0);

    // Verify Form PFT-1 generation succeeds without throwing undefined errors
    const pft1 = generateFormPFT1(stored);
    expect(pft1).toBeDefined();
    expect(pft1.assesseeLegalName).toBe(pot.legalName);
    expect(pft1.taxAmount).toBe(pot.annualRatePkr);
    expect(pft1.scheduleEntry).toContain("Class 1");

    // Verify Form PFT-2 generation succeeds
    const pft2 = generateFormPFT2(stored);
    expect(pft2).toBeDefined();
    expect(pft2.copies[0]?.taxpayerInfo.subclassificationCode).toBe("1(i)");

    // Test formatFullSubclassCode
    expect(formatFullSubclassCode("3(i)(b)", "3")).toBe("3(i)(b)");
    expect(formatFullSubclassCode("3", "3", "PFT-3.i.b")).toBe("3(i)(b)");
    expect(formatFullSubclassCode("(2)(a)(i)", "6")).toBe("6(2)(a)(i)");
    expect(formatFullSubclassCode("6(ii)", "6")).toBe("6(ii)");
    expect(formatFullSubclassCode(null, "6", "PFT-6.ii")).toBe("6(ii)");
  });
});

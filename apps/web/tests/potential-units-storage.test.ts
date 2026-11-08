import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  formatPotentialPin,
  cleanPotentialPin,
  resolveDemandNumberCollision,
  createInitialPotentialUnits,
  loadPersistedPotentialUnits,
  savePersistedPotentialUnits,
  migratePotentialUnitToPft3,
  loadPersistedMigratedUnits,
  savePersistedMigratedUnits,
  migrateVDemandUnitsToPotentialRegister,
  V_UNITS_MIGRATION_FLAG_KEY,
  importPotentialUnitsCsv,
  parseBulkPotentialUnits,
  generatePotentialCsvTemplate,
  POTENTIAL_UNITS_STORAGE_KEY
} from "../src/lib/potential-units-storage";
import { type StoredUnit, MOCK_OFFICERS } from "../src/lib/pilot-store";

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

  it("correctly applies -01 for potential and promotes to -02 for PFT-3", () => {
    const rawPin = "237-001010611020000054-01";
    const potentialPin = formatPotentialPin(rawPin);
    expect(potentialPin).toBe("237-001010611020000054-01");

    const cleaned = cleanPotentialPin(potentialPin);
    expect(cleaned).toBe("237-001010611020000054-02");
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
    expect(units[0]?.pinNumber).toMatch(/-01$/);
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
    expect(result.importedUnits[0]?.pinNumber).toMatch(/-01$/);
    expect(result.importedUnits[0]?.potentialNumber).toMatch(/^POT-/);
    expect(result.importedUnits[0]?.createdBy).toBe("Inspector Ahmad");
    expect(result.importedUnits[0]?.openingArrears).toBe(2000);
    expect(result.importedUnits[1]?.openingArrears).toBe(0);
  });

  it("enforces circle jurisdiction boundary for Inspector on potential units import", () => {
    const inspector = MOCK_OFFICERS[0]; // Inspector Aslam (Vehari Circle I)
    const initialUnits = createInitialPotentialUnits();
    const csv = `Legal Name,Identifier,Category Code,Subclass Code,Address,Locality,Circle
"Madina Book Depot","36603-1111222-1","1","1(i)","Club Road","Vehari City Commercial Zone","Vehari Circle I (City / Commercial)"
"Farooq Cloth Shop","36603-2222333-2","3","3(i)","Main Bazar","Burewala Commercial Hub","Burewala Circle"`;

    const result = parseBulkPotentialUnits(csv, initialUnits, inspector);
    expect(result.totalRows).toBe(2);
    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[0]?.parsedUnit?.status).toBe("ACTIVE");
    expect(result.rows[1]?.status).toBe("ERROR");
    expect(result.rows[1]?.errors[0]).toContain("Jurisdiction mismatch: Inspector");
  });

  it("enforces district and sub-jurisdiction boundaries for ETO on potential units import", () => {
    const eto = MOCK_OFFICERS[1]; // ETO Vehari
    const initialUnits = createInitialPotentialUnits();
    const csv = `District,Circle,Tehsil,Locality,Commercial Address,Legal Name,Trade Name,Identifier Type,Identifier Value,Category Code,Subclass Code
Vehari,Vehari Circle I (City / Commercial),Vehari,Commercial Zone,"Club Road",Al-Rehman Traders,Al-Rehman,CNIC,36603-5555666-1,1,1(i)
Vehari,Burewala Circle,Burewala,Commercial Strip,"Chichawatni Road",Kisan Seed Corp,Kisan Seeds,NTN,4455667-1,4,4(ii)
Multan,Multan Circle 1,Multan,Cantt,"Mall Road",Nishat Fabrics,Nishat,NTN,8899001-1,1,1(i)`;

    const result = parseBulkPotentialUnits(csv, initialUnits, eto);
    expect(result.totalRows).toBe(3);
    expect(result.validRowsCount).toBe(2);
    expect(result.errorRowsCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[1]?.status).toBe("VALID");
    expect(result.rows[2]?.status).toBe("ERROR");
    expect(result.rows[2]?.errors[0]).toContain("Jurisdiction mismatch");
  });

  it("discards potential units with duplicate legal names in the same circle", () => {
    const initialUnits = createInitialPotentialUnits();
    const existingName = initialUnits[0]!.legalName; // Already in Vehari Circle I
    const csv = `Legal Name,Identifier,Category Code,Subclass Code,Address,Locality,Circle
"${existingName.toLowerCase()}","36603-7777888-1","1","1(i)","Karkhana Bazar","Vehari City Commercial Zone","Vehari Circle I (City / Commercial)"
"${existingName}","36603-7777889-2","1","1(i)","Colony Road","Mailsi Main Bazaar","Mailsi Circle"`;

    const result = parseBulkPotentialUnits(csv, initialUnits);
    expect(result.totalRows).toBe(2);
    // Row 1 discarded due to existing legal name in Circle I
    expect(result.rows[0]?.status).toBe("ERROR");
    expect(result.rows[0]?.errors[0]).toContain("Duplicate legal name: Legal name");
    expect(result.rows[0]?.errors[0]).toContain("already exists in circle");
    // Row 2 is valid because it belongs to Mailsi Circle
    expect(result.rows[1]?.status).toBe("VALID");
    expect(result.duplicateCount).toBe(1);
    expect(result.validRowsCount).toBe(1);
    expect(result.validUnits[0]?.status).toBe("ACTIVE");
  });

  it("discards intra-batch duplicate legal names in the same circle", () => {
    const initialUnits = createInitialPotentialUnits();
    const csv = `Legal Name,Identifier,Category Code,Subclass Code,Address,Locality,Circle
"New Punjab Bakery","36603-1212121-1","10","","Main Bazar","Vehari Commercial Zone","Vehari Circle I (City / Commercial)"
"new punjab bakery","36603-1212122-2","10","","Shop 2 Main Bazar","Vehari Commercial Zone","Vehari Circle I (City / Commercial)"`;

    const result = parseBulkPotentialUnits(csv, initialUnits);
    expect(result.totalRows).toBe(2);
    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[1]?.status).toBe("ERROR");
    expect(result.rows[1]?.errors[0]).toContain("Duplicate legal name in upload file");
  });

  it("generates authentic CSV template with Vehari jurisdiction headers and prioritized columns", () => {
    const template = generatePotentialCsvTemplate();
    expect(template).toContain("Survey No. (Auto)");
    expect(template).toContain("Division");
    expect(template).toContain("District");
    expect(template).toContain("Circle");
    expect(template).toContain("Commercial Address");
    expect(template).toContain("Arrears,Remarks");
    expect(template).toContain("Vehari Circle I (City / Commercial)");
    expect(template).toContain("Burewala Circle");
    expect(template).toContain("Mailsi Circle");
    expect(template).toContain("SURV-2026-001");
  });

  it("accurately parses standardized 30-column template with strict jurisdiction checks", () => {
    const inspector = MOCK_OFFICERS[0]!; // Inspector Aslam (Vehari Circle I)
    const eto = MOCK_OFFICERS[1]!; // ETO Vehari
    const initialUnits = createInitialPotentialUnits();

    // 30-column row format:
    // 0: Survey No. (Auto), 1: Division, 2: Region, 3: District, 4: Zone, 5: Tehsil, 6: Circle, 7: Locality,
    // 8: Commercial Address, 9: Legal Name / Entity Name, 10: Taxpayer Name / Proprietor, 11: Identifier Type,
    // 12: Identifier Value, 13: Phone, 14: Email, 15: Tax Class (Select), 16: Tax Assessment Option (Select),
    // 17: Tax Sub-Class (Auto), 18: Statutory Assessment Rate (PKR) (Auto), 19: Primary Class Code (Auto),
    // 20: Schedule Sub-Class Code (Auto), 21: Rate Basis (Auto), 22: Statutory Rule ID (Auto),
    // 23: Financial Year (Auto), 24: Survey Date (Auto), 25: Taxpayer Status, 26: Legacy Demand No,
    // 27: Arrears, 28: Remarks, 29: Import Status (Auto)

    const template = generatePotentialCsvTemplate();
    // Template includes 4 sample rows:
    // Row 1: Vehari Circle I (City / Commercial)
    // Row 2: Vehari Circle II (Grain Market / Rural)
    // Row 3: Burewala Circle
    // Row 4: Mailsi Circle

    // When Inspector of Circle 1 parses the template:
    const inspectorResult = parseBulkPotentialUnits(template, initialUnits, inspector);
    expect(inspectorResult.totalRows).toBe(4);
    // Row 1 matches Inspector Circle I
    expect(inspectorResult.rows[0]?.status).toBe("VALID");
    expect(inspectorResult.rows[0]?.parsedUnit?.circleName).toBe("Circle 1");
    expect(inspectorResult.rows[0]?.parsedUnit?.openingArrears).toBe(0);
    expect(inspectorResult.rows[0]?.parsedUnit?.remarks).toBe("Discovered during field survey");
    // Rows 2, 3, 4 are outside Inspector Circle I
    expect(inspectorResult.rows[1]?.status).toBe("ERROR");
    expect(inspectorResult.rows[1]?.errors[0]).toContain("Jurisdiction mismatch: Inspector");
    expect(inspectorResult.rows[2]?.status).toBe("ERROR");
    expect(inspectorResult.rows[2]?.errors[0]).toContain("Jurisdiction mismatch: Inspector");
    expect(inspectorResult.rows[3]?.status).toBe("ERROR");
    expect(inspectorResult.rows[3]?.errors[0]).toContain("Jurisdiction mismatch: Inspector");

    // When ETO of Vehari District parses the template:
    const etoResult = parseBulkPotentialUnits(template, initialUnits, eto);
    expect(etoResult.totalRows).toBe(4);
    // All 4 rows are in Vehari district sub-circles, so all should be valid
    expect(etoResult.validRowsCount).toBe(4);
    expect(etoResult.errorRowsCount).toBe(0);
    expect(etoResult.rows[2]?.parsedUnit?.openingArrears).toBe(2500);
    expect(etoResult.rows[2]?.parsedUnit?.remarks).toBe(
      "Brought forward balance from previous inspection"
    );
  });

  it("preserves supplied survey number, arrears, and remarks on potential units import", () => {
    const initialUnits = createInitialPotentialUnits();
    const csv = `Survey No,District,Circle,Tehsil,Locality,Commercial Address,Legal Name,Trade Name,Identifier Type,Identifier Value,Category Code,Subclass Code,Arrears,Remarks
SURV-2026-999,Vehari,Vehari Circle I (City / Commercial),Vehari,City Zone,"Shop 99 Club Road",Hussain Super Store,Hussain Traders,CNIC,36603-9999999-1,1,1(i),4500,"Discovered during survey"`;

    const result = importPotentialUnitsCsv(csv, initialUnits, "Inspector Survey");
    expect(result.errors).toHaveLength(0);
    expect(result.importedUnits).toHaveLength(1);
    const unit = result.importedUnits[0]!;
    expect(unit.potentialNumber).toBe("SURV-2026-999");
    expect(unit.legalName).toBe("Hussain Super Store");
    expect(unit.tradeName).toBe("Hussain Traders");
    expect(unit.openingArrears).toBe(4500);
    expect(unit.remarks).toBe("Discovered during survey");
    expect(unit.tehsil).toBe("Vehari");
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

    // Demand number assigned as next circle numeric demand
    expect(assignedDemandNo).toBe("1");
    expect(migratedUnit.demandNumber).toBe("1");
    expect(migratedUnit.pft3Registered).toBe(true);

    // Assessment is approved
    expect(migratedUnit.assessments[0]?.status).toBe("APPROVED");
    expect(migratedUnit.assessmentVersions[0]?.status).toBe("APPROVED");

    // Ledger has assessment and payment credit
    expect(migratedUnit.ledgerEntries.length).toBeGreaterThanOrEqual(2);
    const payEntry = migratedUnit.ledgerEntries.find((e) => e.entryType === "PAYMENT_CREDIT");
    expect(payEntry).toBeDefined();
    expect(payEntry?.amount).toBe(-target.annualRatePkr);

    // Persisted in migrated units storage
    const persisted = loadPersistedMigratedUnits();
    expect(persisted.some((u) => u.id === migratedUnit.id)).toBe(true);
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
    expect(migrated?.pinNumber).toBe("237-0010106110200100-01");
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

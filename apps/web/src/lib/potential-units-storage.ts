import type { StatutoryRuleDefinition, DemandLedgerEntry } from "@ptas/domain";
import {
  getStatutoryRuleById,
  getStatutoryRuleBySubclassification,
  getAllStatutoryRules
} from "@ptas/domain";
import type { StoredUnit } from "./pilot-store";

export const POTENTIAL_UNITS_STORAGE_KEY = "ptas_potential_units_v1";
export const POTENTIAL_UNITS_UPDATED_EVENT = "ptas-potential-units-updated";

function resolveRule(
  ruleIdOrCode: string,
  subclassificationCode?: string
): StatutoryRuleDefinition {
  const byId = getStatutoryRuleById(ruleIdOrCode);
  if (byId) return byId;
  if (subclassificationCode) {
    const bySub = getStatutoryRuleBySubclassification(subclassificationCode);
    if (bySub) return bySub;
  }
  const byCode = getStatutoryRuleById(`PFT-${ruleIdOrCode}`);
  if (byCode) return byCode;
  return getAllStatutoryRules()[0]!;
}

export interface PotentialUnitRecord {
  readonly id: string;
  readonly potentialNumber: string; // e.g. "POT-0001"
  readonly pinNumber: string; // e.g. "Potential-237-0010106110200054-01"
  readonly provincialUin: string; // matches pinNumber
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: "CNIC" | "NTN";
  readonly identifierValue: string;
  readonly address: string;
  readonly locality?: string | undefined;
  readonly circleId: string;
  readonly circleName?: string | undefined;
  readonly districtName?: string | undefined;
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly subclassificationCode?: string | null | undefined;
  readonly subclassificationName?: string | null | undefined;
  readonly statutoryTertiaryCode?: string | null | undefined;
  readonly statutoryTertiaryClassification?: string | null | undefined;
  readonly statutoryRuleId: string;
  readonly statutoryRule: StatutoryRuleDefinition;
  readonly annualRatePkr: number;
  readonly openingArrears?: number | undefined;
  readonly status: "ACTIVE" | "MIGRATED" | "CANCELLED";
  readonly migratedToDemandNo?: string | undefined;
  readonly migratedAt?: string | undefined;
  readonly createdAt: string;
  readonly createdBy?: string | undefined;
}

/**
 * Generate a statutory potential PIN with the mandatory "Potential-" prefix.
 */
export function formatPotentialPin(rawUinOrPin: string): string {
  const cleaned = rawUinOrPin.replace(/^Potential-/i, "").trim();
  return `Potential-${cleaned}`;
}

/**
 * Strip the "Potential-" prefix to restore clean statutory PIN upon PFT-3 migration.
 */
export function cleanPotentialPin(potentialPin: string): string {
  return potentialPin.replace(/^Potential-/i, "").trim();
}

/**
 * Resolve collision if a converted demand number already exists in Form PFT-3.
 * Follows Rule: collision marked as Demand/1, Demand/2, etc.
 */
export function resolveDemandNumberCollision(
  candidateDemandNo: string,
  existingUnits: readonly StoredUnit[]
): string {
  const existingDemands = new Set<string>();
  for (const u of existingUnits) {
    if (u.demandNumber) {
      existingDemands.add(u.demandNumber.trim().toUpperCase());
    }
    if (u.demandUnit?.permanentDemandNo) {
      existingDemands.add(u.demandUnit.permanentDemandNo.trim().toUpperCase());
    }
  }

  const normalized = candidateDemandNo.trim();
  if (!existingDemands.has(normalized.toUpperCase())) {
    return normalized;
  }

  let counter = 1;
  while (counter < 1000) {
    const candidate = `${normalized}/${counter}`;
    if (!existingDemands.has(candidate.toUpperCase())) {
      return candidate;
    }
    counter++;
  }
  return `${normalized}/${Date.now()}`;
}

/**
 * Seed initial mock potential assessment units in Vehari district for operational inspection.
 */
export function createInitialPotentialUnits(): PotentialUnitRecord[] {
  const seeds: Array<{
    seq: number;
    legalName: string;
    tradeName: string;
    identifierType: "CNIC" | "NTN";
    identifierValue: string;
    address: string;
    locality: string;
    ruleCode: string;
    subclassificationCode?: string;
    arrears: number;
  }> = [
    {
      seq: 1,
      legalName: "Al-Rehman Agro Chemicals & Seed Store",
      tradeName: "Al-Rehman Agro Traders",
      identifierType: "CNIC",
      identifierValue: "36603-1928471-1",
      address: "Shop # 14-B, Grain Market, Vehari",
      locality: "Grain Market (Galla Mandi)",
      ruleCode: "1",
      subclassificationCode: "1(i)",
      arrears: 0
    },
    {
      seq: 2,
      legalName: "Vehari Diagnostic Clinical Laboratory",
      tradeName: "Vehari Diagnostics",
      identifierType: "NTN",
      identifierValue: "7193842-4",
      address: "Plot 45, Club Road Commercial Area, Vehari",
      locality: "Club Road Commercial Area",
      ruleCode: "4",
      subclassificationCode: "4(ii)",
      arrears: 1500
    },
    {
      seq: 3,
      legalName: "Chenab Cotton Ginning & Pressing Mills",
      tradeName: "Chenab Ginners",
      identifierType: "NTN",
      identifierValue: "2837192-9",
      address: "Burewala Road, Vehari Industrial Area",
      locality: "Vehari Industrial Area",
      ruleCode: "1",
      subclassificationCode: "1(ii)",
      arrears: 5000
    },
    {
      seq: 4,
      legalName: "Bismillah General Order Supplier & Importers",
      tradeName: "Bismillah Suppliers",
      identifierType: "CNIC",
      identifierValue: "36601-8291047-3",
      address: "Karkhana Bazaar near Rail Gate, Vehari",
      locality: "Karkhana Bazaar",
      ruleCode: "2",
      subclassificationCode: "2(i)",
      arrears: 0
    },
    {
      seq: 5,
      legalName: "Horizon Tech Computer Training Academy",
      tradeName: "Horizon Institute",
      identifierType: "CNIC",
      identifierValue: "36603-5591024-7",
      address: "Civil Lines, Chungi No. 9, Vehari",
      locality: "Chungi No. 9 Commercial Strip",
      ruleCode: "3",
      subclassificationCode: "3(i)",
      arrears: 0
    }
  ];

  return seeds.map((s) => {
    const rule = resolveRule(s.ruleCode, s.subclassificationCode);
    const potNum = `POT-${s.seq.toString().padStart(4, "0")}`;
    const basePin = `237-00101061102000${s.seq.toString().padStart(2, "0")}-01`;
    const pinNumber = formatPotentialPin(basePin);
    const annualRate = rule.annual_rate_pkr ?? 4000;

    return {
      id: `pot-${Date.now()}-${s.seq}`,
      potentialNumber: potNum,
      pinNumber,
      provincialUin: pinNumber,
      legalName: s.legalName,
      tradeName: s.tradeName,
      identifierType: s.identifierType,
      identifierValue: s.identifierValue,
      address: s.address,
      locality: s.locality,
      circleId: "00000000-0000-4000-8000-000000000004",
      circleName: "Circle-Vehari",
      districtName: "Vehari",
      categoryCode: rule.category_code,
      categoryName: rule.category,
      subclassificationCode: rule.subclassification_code,
      subclassificationName: rule.subcategory,
      statutoryTertiaryCode: rule.statutory_tertiary_code,
      statutoryTertiaryClassification: rule.statutory_tertiary_classification,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      annualRatePkr: annualRate,
      openingArrears: s.arrears,
      status: "ACTIVE",
      createdAt: "2026-09-01T08:00:00.000Z",
      createdBy: "Inspector Field Survey"
    };
  });
}

/**
 * Load persisted potential units from localStorage.
 */
export function loadPersistedPotentialUnits(): PotentialUnitRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POTENTIAL_UNITS_STORAGE_KEY);
    if (!raw) {
      const initial = createInitialPotentialUnits();
      savePersistedPotentialUnits(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as PotentialUnitRecord[];
    }
    const initial = createInitialPotentialUnits();
    savePersistedPotentialUnits(initial);
    return initial;
  } catch {
    return createInitialPotentialUnits();
  }
}

/**
 * Save persisted potential units to localStorage.
 */
export function savePersistedPotentialUnits(units: readonly PotentialUnitRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POTENTIAL_UNITS_STORAGE_KEY, JSON.stringify(units));
    window.dispatchEvent(new Event(POTENTIAL_UNITS_UPDATED_EVENT));
  } catch (err) {
    console.error("Failed to save potential assessment units:", err);
  }
}

/**
 * Migrate a Potential Assessment Unit into the Form P.F.T-3 Assessment Register upon realization of payment.
 */
export function migratePotentialUnitToPft3(
  potentialUnit: PotentialUnitRecord,
  existingUnits: readonly StoredUnit[],
  paidAmount: number
): {
  migratedUnit: StoredUnit;
  assignedDemandNo: string;
  cleanPin: string;
} {
  // Convert Potential Number to Demand Number, e.g. POT-0001 -> D-0001
  const rawNum = potentialUnit.potentialNumber.replace(/^POT-/i, "").replace(/^P-/i, "").trim();
  const candidateDemandNo = `D-${rawNum}`;
  const assignedDemandNo = resolveDemandNumberCollision(candidateDemandNo, existingUnits);

  // Clean the PIN by stripping the "Potential-" prefix
  const cleanPin = cleanPotentialPin(potentialUnit.pinNumber);

  const unitId = `migrated-${Date.now()}-${assignedDemandNo.replace(/[^a-zA-Z0-9]/g, "")}`;
  const nowIso = new Date().toISOString();

  const demandLedgerEntries: DemandLedgerEntry[] = [
    {
      id: `led-asm-${Date.now()}`,
      demandUnitId: `dem-${unitId}`,
      financialYearId: "FY-2026-27",
      entryType: "ASSESSMENT_DEMAND",
      amount: potentialUnit.annualRatePkr,
      sourceType: "ASSESSMENT",
      sourceId: `asm-${unitId}`,
      idempotencyKey: `idem-asm-${unitId}`,
      correlationId: `corr-asm-${unitId}`,
      postedBy: "System (Migrated from Potential Register)",
      postedAt: nowIso,
      metadata: {
        potentialNumber: potentialUnit.potentialNumber,
        originalPin: potentialUnit.pinNumber,
        migratedAt: nowIso
      }
    }
  ];

  if ((potentialUnit.openingArrears ?? 0) > 0) {
    demandLedgerEntries.push({
      id: `led-arr-${Date.now()}`,
      demandUnitId: `dem-${unitId}`,
      financialYearId: "FY-2026-27",
      entryType: "MANUAL_ADJUSTMENT",
      amount: potentialUnit.openingArrears ?? 0,
      sourceType: "MANUAL_ADJUSTMENT",
      sourceId: `arr-${unitId}`,
      idempotencyKey: `idem-arr-${unitId}`,
      correlationId: `corr-arr-${unitId}`,
      postedBy: "System (Opening Arrears)",
      postedAt: nowIso,
      metadata: { note: "Brought forward arrears balance" }
    });
  }

  if (paidAmount > 0) {
    demandLedgerEntries.push({
      id: `led-pay-${Date.now()}`,
      demandUnitId: `dem-${unitId}`,
      financialYearId: "FY-2026-27",
      entryType: "PAYMENT_CREDIT",
      amount: paidAmount,
      sourceType: "PAYMENT",
      sourceId: `pay-${unitId}`,
      idempotencyKey: `idem-pay-${unitId}`,
      correlationId: `corr-pay-${unitId}`,
      postedBy: "Authorized Treasury Counter (NBP)",
      postedAt: nowIso,
      metadata: {
        note: "Statutory Rule 10 discharge upon migration to PFT-3 Register",
        sourcePotentialNumber: potentialUnit.potentialNumber
      }
    });
  }

  const migratedUnit: StoredUnit = {
    id: unitId,
    legalName: potentialUnit.legalName,
    tradeName: potentialUnit.tradeName,
    identifierType: potentialUnit.identifierType,
    identifierValue: potentialUnit.identifierValue,
    address: potentialUnit.address,
    locality: potentialUnit.locality,
    circleId: potentialUnit.circleId || "00000000-0000-4000-8000-000000000004",
    circleName: potentialUnit.circleName || "Circle-Vehari",
    districtName: potentialUnit.districtName || "Vehari",
    categoryCode: potentialUnit.categoryCode,
    subclassificationCode: potentialUnit.subclassificationCode,
    statutoryTertiaryCode: potentialUnit.statutoryTertiaryCode,
    statutoryRuleId: potentialUnit.statutoryRuleId,
    statutoryRule: potentialUnit.statutoryRule,
    assessmentNumber: `ASM-${assignedDemandNo}`,
    demandNumber: assignedDemandNo,
    pinNumber: cleanPin,
    provincialUin: cleanPin,
    pft3Registered: true,
    demandUnit: {
      id: `dem-${unitId}`,
      taxpayerId: `tax-${unitId}`,
      permanentDemandNo: assignedDemandNo,
      createdAt: nowIso
    },
    assessments: [
      {
        id: `asm-${unitId}`,
        taxpayerId: `tax-${unitId}`,
        financialYearId: "FY-2026-27",
        status: "APPROVED",
        currentVersionNo: 1,
        createdBy: "ETO-Vehari",
        createdAt: nowIso
      }
    ],
    assessmentVersions: [
      {
        id: `av-${unitId}`,
        assessmentId: `asm-${unitId}`,
        versionNo: 1,
        status: "APPROVED",
        reason: `Migrated from Potential Register (${potentialUnit.potentialNumber}) upon recovery.`,
        createdBy: "ETO-Vehari",
        approvedBy: "ETO-Vehari",
        approvedAt: nowIso,
        snapshot: {
          taxAmount: potentialUnit.annualRatePkr,
          statutoryCategory: potentialUnit.categoryName,
          legalBasis: "Punjab Finance Act, 1977 (Second Schedule)",
          ruleId: potentialUnit.statutoryRuleId,
          subclassificationCode: potentialUnit.subclassificationCode ?? null,
          ruleCode: potentialUnit.categoryCode
        },
        createdAt: nowIso
      }
    ],
    ledgerEntries: demandLedgerEntries,
    openingArrears: potentialUnit.openingArrears ?? 0,
    createdAt: nowIso
  };

  return { migratedUnit, assignedDemandNo, cleanPin };
}

/**
 * Parse and import potential units from a raw CSV or structured text.
 * Requires no ETO approval; Inspector can immediately import into the Potential Register.
 */
export function importPotentialUnitsCsv(
  csvContent: string,
  existingPotentialUnits: readonly PotentialUnitRecord[],
  officerName = "Inspector Field Survey"
): {
  importedUnits: PotentialUnitRecord[];
  errors: string[];
} {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errors: string[] = [];
  const importedUnits: PotentialUnitRecord[] = [];

  if (lines.length === 0) {
    return { importedUnits, errors: ["CSV content is empty."] };
  }

  // Check if first line is header
  const firstLine = lines[0]!.toLowerCase();
  const startIndex =
    firstLine.includes("name") || firstLine.includes("legal") || firstLine.includes("potential")
      ? 1
      : 0;

  let currentSequence =
    existingPotentialUnits.reduce((max, u) => {
      const match = u.potentialNumber.match(/\d+/);
      const val = match ? parseInt(match[0], 10) : 0;
      return Math.max(max, val);
    }, 0) + 1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;
    // Split by comma while respecting quotes
    const cols = line.split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
    if (cols.length < 2) continue;

    // Expected layout:
    // [0] Legal Name, [1] Identifier (CNIC/NTN), [2] Category Code, [3] Subclass Code, [4] Address, [5] Locality, [6] Arrears, [7] Trade Name
    const legalName = cols[0] || `Establishment ${currentSequence}`;
    const idVal = cols[1] || `36603-${Math.floor(1000000 + Math.random() * 9000000)}-1`;
    const catCode = cols[2] || "1";
    const subCode = cols[3] || undefined;
    const address = cols[4] || "Vehari City Commercial Zone";
    const locality = cols[5] || "Vehari City Commercial Zone";
    const arrears = cols[6] ? parseInt(cols[6], 10) || 0 : 0;
    const tradeName = cols[7] || undefined;

    const identifierType: "CNIC" | "NTN" =
      idVal.includes("-") && idVal.length <= 10 ? "NTN" : "CNIC";
    const rule = resolveRule(catCode, subCode);
    const potNum = `POT-${currentSequence.toString().padStart(4, "0")}`;
    const pinNumber = formatPotentialPin(
      `237-00101061102${currentSequence.toString().padStart(4, "0")}-01`
    );

    importedUnits.push({
      id: `pot-import-${Date.now()}-${currentSequence}`,
      potentialNumber: potNum,
      pinNumber,
      provincialUin: pinNumber,
      legalName,
      tradeName,
      identifierType,
      identifierValue: idVal,
      address,
      locality,
      circleId: "00000000-0000-4000-8000-000000000004",
      circleName: "Circle-Vehari",
      districtName: "Vehari",
      categoryCode: rule.category_code,
      categoryName: rule.category,
      subclassificationCode: rule.subclassification_code,
      subclassificationName: rule.subcategory,
      statutoryTertiaryCode: rule.statutory_tertiary_code,
      statutoryTertiaryClassification: rule.statutory_tertiary_classification,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      annualRatePkr: rule.annual_rate_pkr ?? 4000,
      openingArrears: arrears,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      createdBy: officerName
    });

    currentSequence++;
  }

  return { importedUnits, errors };
}

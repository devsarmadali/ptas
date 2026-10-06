import type { StatutoryRuleDefinition, DemandLedgerEntry } from "@ptas/domain";
import {
  getStatutoryRuleById,
  getStatutoryRuleBySubclassification,
  getAllStatutoryRules
} from "@ptas/domain";
import type { StoredUnit } from "./pilot-store";
import { getSupabaseAuthClient } from "./supabase-auth";

export const POTENTIAL_UNITS_STORAGE_KEY = "ptas_potential_units_v2";
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
 * Converts a PotentialUnitRecord into a complete, valid StoredUnit model.
 * Provides fully resolved statutoryRule, approved assessment version,
 * and zero arrears, ensuring Form PFT-1, Unit Dossier, and PFT-2 can render without crashes.
 */
export function convertPotentialUnitToStoredUnit(pot: PotentialUnitRecord): StoredUnit {
  const rule =
    pot.statutoryRule && pot.statutoryRule.rule_id
      ? pot.statutoryRule
      : resolveRule(
          pot.statutoryRuleId || pot.categoryCode,
          pot.subclassificationCode || undefined
        );

  const subclassificationCode =
    pot.subclassificationCode && pot.subclassificationCode !== pot.categoryCode
      ? pot.subclassificationCode
      : rule.subclassification_code || pot.subclassificationCode || pot.categoryCode;

  const subclassificationName =
    pot.subclassificationName || rule.subcategory || rule.subclassification_label;

  const annualRate = pot.annualRatePkr || rule.annual_rate_pkr || 4000;
  const pin = pot.pinNumber || pot.provincialUin;

  return {
    id: pot.id,
    legalName: pot.legalName,
    tradeName: pot.tradeName || pot.legalName,
    identifierType: pot.identifierType,
    identifierValue: pot.identifierValue,
    address: pot.address,
    locality: pot.locality || "Vehari City Commercial Zone",
    circleId: pot.circleId,
    circleName: pot.circleName ?? "Vehari Circle I (City / Commercial)",
    districtName: pot.districtName ?? "Vehari",
    categoryCode: pot.categoryCode || rule.category_code,
    subclassificationCode,
    statutoryTertiaryCode: pot.statutoryTertiaryCode || rule.statutory_tertiary_code,
    statutoryRuleId: pot.statutoryRuleId || rule.rule_id,
    statutoryRule: {
      ...rule,
      category_code: pot.categoryCode || rule.category_code,
      category: pot.categoryName || rule.category,
      subclassification_code: subclassificationCode,
      subcategory: subclassificationName || rule.subcategory,
      subclassification_label: subclassificationName || rule.subcategory || null,
      annual_rate_pkr: annualRate,
      statutory_tertiary_code: pot.statutoryTertiaryCode || rule.statutory_tertiary_code || null,
      statutory_tertiary_classification:
        pot.statutoryTertiaryClassification || rule.statutory_tertiary_classification || null
    },
    assessmentNumber: `POT-ASM-${pot.potentialNumber.replace(/^POT-?/i, "")}`,
    demandNumber: pot.potentialNumber,
    pinNumber: pin,
    provincialUin: pin,
    pft3Registered: false,
    demandUnit: {
      id: pot.id,
      taxpayerId: pot.id,
      permanentDemandNo: pot.potentialNumber,
      createdAt: pot.createdAt || new Date().toISOString()
    },
    assessments: [
      {
        id: `asm-${pot.id}`,
        taxpayerId: pot.id,
        financialYearId: "2026-2027",
        status: "APPROVED",
        currentVersionNo: 1,
        createdBy: pot.createdBy || "System (Potential Register)",
        createdAt: pot.createdAt || new Date().toISOString()
      }
    ],
    assessmentVersions: [
      {
        id: `v-${pot.id}`,
        assessmentId: `asm-${pot.id}`,
        versionNo: 1,
        status: "APPROVED",
        createdAt: pot.createdAt || new Date().toISOString(),
        createdBy: pot.createdBy || "System (Potential Register)",
        approvedBy: "ETO / Assessing Authority",
        approvedAt: pot.createdAt || new Date().toISOString(),
        snapshot: {
          taxAmount: annualRate,
          openingArrears: 0,
          statutoryCategory: pot.categoryName || rule.category,
          legalBasis: rule.official_text || "Punjab Finance Act, 1977",
          ruleId: pot.statutoryRuleId || rule.rule_id,
          categoryCode: pot.categoryCode,
          categoryTitle: pot.categoryName || rule.category,
          subclassificationCode: subclassificationCode,
          subclassificationTitle: subclassificationName || rule.subcategory
        }
      }
    ],
    ledgerEntries: [],
    openingArrears: 0,
    createdAt: pot.createdAt || new Date().toISOString()
  };
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
    circleId: string;
    circleName: string;
    districtName: string;
    ruleCode: string;
    subclassificationCode?: string;
  }> = [
    {
      seq: 1,
      legalName: "Al-Rehman Agro Chemicals & Seed Store",
      tradeName: "Al-Rehman Agro Traders",
      identifierType: "CNIC",
      identifierValue: "36603-1928471-1",
      address: "Shop # 14-B, Grain Market, Vehari",
      locality: "Grain Market (Galla Mandi)",
      circleId: "00000000-0000-4000-8000-000000000004",
      circleName: "Vehari Circle I (City / Commercial)",
      districtName: "Vehari",
      ruleCode: "1",
      subclassificationCode: "1(i)"
    },
    {
      seq: 2,
      legalName: "Vehari Diagnostic Clinical Laboratory",
      tradeName: "Vehari Diagnostics",
      identifierType: "NTN",
      identifierValue: "7193842-4",
      address: "Plot 45, Club Road Commercial Area, Vehari",
      locality: "Club Road Commercial Area",
      circleId: "00000000-0000-4000-8000-000000000004",
      circleName: "Vehari Circle I (City / Commercial)",
      districtName: "Vehari",
      ruleCode: "4",
      subclassificationCode: "4(ii)"
    },
    {
      seq: 3,
      legalName: "Chenab Cotton Ginning & Pressing Mills",
      tradeName: "Chenab Ginners",
      identifierType: "NTN",
      identifierValue: "2837192-9",
      address: "Chichawatni Road, Burewala Industrial Area",
      locality: "Burewala Industrial Area",
      circleId: "00000000-0000-4000-8000-000000000003",
      circleName: "Burewala Circle",
      districtName: "Vehari",
      ruleCode: "1",
      subclassificationCode: "1(ii)"
    },
    {
      seq: 4,
      legalName: "Bismillah General Order Supplier & Importers",
      tradeName: "Bismillah Suppliers",
      identifierType: "CNIC",
      identifierValue: "36601-8291047-3",
      address: "Karkhana Bazaar near Rail Gate, Vehari",
      locality: "Karkhana Bazaar",
      circleId: "00000000-0000-4000-8000-000000000005",
      circleName: "Vehari Circle II (Grain Market / Rural)",
      districtName: "Vehari",
      ruleCode: "2",
      subclassificationCode: "2(i)"
    },
    {
      seq: 5,
      legalName: "Horizon Tech Computer Training Academy",
      tradeName: "Horizon Institute",
      identifierType: "CNIC",
      identifierValue: "36603-5591024-7",
      address: "Main Commercial Bazaar, Mailsi",
      locality: "Mailsi Commercial Strip",
      circleId: "00000000-0000-4000-8000-000000000002",
      circleName: "Mailsi Circle",
      districtName: "Vehari",
      ruleCode: "3",
      subclassificationCode: "3(i)"
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
      circleId: s.circleId,
      circleName: s.circleName,
      districtName: s.districtName,
      categoryCode: rule.category_code,
      categoryName: rule.category,
      subclassificationCode: rule.subclassification_code,
      subclassificationName: rule.subcategory,
      statutoryTertiaryCode: rule.statutory_tertiary_code,
      statutoryTertiaryClassification: rule.statutory_tertiary_classification,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      annualRatePkr: annualRate,
      openingArrears: 0,
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
    // Purge legacy v1 records containing mock arrears
    if (localStorage.getItem("ptas_potential_units_v1")) {
      localStorage.removeItem("ptas_potential_units_v1");
    }

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
 * Load potential assessment units from Supabase RPC list_potential_assessment_units.
 * Returns null if network/session error occurs (falling back to localStorage).
 */
export async function fetchPotentialAssessmentUnitsFromDatabase(): Promise<
  PotentialUnitRecord[] | null
> {
  if (typeof window === "undefined") return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.rpc("list_potential_assessment_units");
    if (error || !Array.isArray(data)) {
      return null;
    }
    if (data.length === 0) {
      return [];
    }
    const rows = data as unknown as Array<Record<string, unknown>>;
    const units: PotentialUnitRecord[] = rows.map((row) => {
      const catCode = String(row.category_code || "1");
      const subCode = row.subclassification_code ? String(row.subclassification_code) : undefined;
      const rule = resolveRule(catCode, subCode);
      const potNum = String(row.potential_number || "");
      const pinNum = formatPotentialPin(String(row.pin_number || potNum));
      return {
        id: String(row.id),
        potentialNumber: potNum,
        pinNumber: pinNum,
        provincialUin: pinNum,
        legalName: String(row.legal_name || "Unnamed Unit"),
        tradeName: row.trade_name ? String(row.trade_name) : undefined,
        identifierType: String(row.identifier_type).toUpperCase() === "NTN" ? "NTN" : "CNIC",
        identifierValue: String(row.identifier_value || "36603-0000000-0"),
        address: String(row.address || "Vehari"),
        locality: row.locality ? String(row.locality) : undefined,
        circleId: String(row.circle_id || "00000000-0000-4000-8000-000000000004"),
        circleName: String(row.circle_name || "Vehari Circle I (City / Commercial)"),
        districtName: String(row.district_name || "Vehari"),
        categoryCode: catCode,
        categoryName: String(row.category_name || rule.category),
        subclassificationCode: subCode ?? rule.subclassification_code,
        subclassificationName: row.subclassification_name
          ? String(row.subclassification_name)
          : rule.subcategory,
        statutoryTertiaryCode: row.statutory_tertiary_code
          ? String(row.statutory_tertiary_code)
          : rule.statutory_tertiary_code,
        statutoryTertiaryClassification: row.statutory_tertiary_classification
          ? String(row.statutory_tertiary_classification)
          : rule.statutory_tertiary_classification,
        statutoryRuleId: String(row.statutory_rule_id || rule.rule_id),
        statutoryRule: rule,
        annualRatePkr: Number(row.annual_rate_pkr) || rule.annual_rate_pkr || 4000,
        openingArrears: 0,
        status:
          row.status === "MIGRATED" || row.status === "CANCELLED"
            ? (row.status as "MIGRATED" | "CANCELLED")
            : ("ACTIVE" as const),
        migratedToDemandNo: row.migrated_to_demand_no
          ? String(row.migrated_to_demand_no)
          : undefined,
        migratedAt: row.migrated_at ? String(row.migrated_at) : undefined,
        createdAt: String(row.created_at || new Date().toISOString()),
        createdBy: row.created_by ? String(row.created_by) : undefined
      };
    });
    savePersistedPotentialUnits(units);
    return units;
  } catch (err) {
    console.warn("fetchPotentialAssessmentUnitsFromDatabase encountered error:", err);
    return null;
  }
}

/**
 * Persist a newly created potential unit to Supabase via create_potential_assessment_unit RPC.
 */
export async function persistPotentialUnitToDatabase(
  unit: PotentialUnitRecord
): Promise<PotentialUnitRecord | null> {
  if (typeof window === "undefined") return null;
  try {
    const supabase = getSupabaseAuthClient();
    const payload = {
      potential_number: unit.potentialNumber,
      pin_number: unit.pinNumber,
      provincial_uin: unit.provincialUin,
      legal_name: unit.legalName,
      trade_name: unit.tradeName,
      identifier_type: unit.identifierType,
      identifier_value: unit.identifierValue,
      address: unit.address,
      locality: unit.locality,
      circle_id: unit.circleId,
      circle_name: unit.circleName,
      district_name: unit.districtName,
      category_code: unit.categoryCode,
      category_name: unit.categoryName,
      subclassification_code: unit.subclassificationCode,
      subclassification_name: unit.subclassificationName,
      statutory_tertiary_code: unit.statutoryTertiaryCode,
      statutory_tertiary_classification: unit.statutoryTertiaryClassification,
      statutory_rule_id: unit.statutoryRuleId,
      annual_rate_pkr: unit.annualRatePkr,
      opening_arrears: 0
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("create_potential_assessment_unit", {
      p_unit: payload
    });
    if (error) {
      console.warn("persistPotentialUnitToDatabase error:", error.message);
      return null;
    }
    return unit;
  } catch (err) {
    console.warn("persistPotentialUnitToDatabase failed:", err);
    return null;
  }
}

/**
 * Update a potential unit's status in Supabase when migrated to PFT-3.
 */
export async function recordPotentialUnitMigrationInDatabase(
  potentialId: string,
  assignedDemandNo: string
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const supabase = getSupabaseAuthClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("migrate_potential_unit_to_pft3", {
      p_potential_id: potentialId,
      p_assigned_demand_no: assignedDemandNo
    });
  } catch (err) {
    console.warn("recordPotentialUnitMigrationInDatabase failed:", err);
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
      amount: -Math.abs(paidAmount),
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

  savePersistedMigratedUnit(migratedUnit);

  return { migratedUnit, assignedDemandNo, cleanPin };
}

export const MIGRATED_UNITS_STORAGE_KEY = "ptas_migrated_units_v1";

/**
 * Safely load persisted migrated units from browser storage.
 */
export function loadPersistedMigratedUnits(): StoredUnit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MIGRATED_UNITS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredUnit[];
  } catch (err) {
    console.warn("Failed to load persisted migrated units:", err);
  }
  return [];
}

/**
 * Save migrated units to browser storage.
 */
export function savePersistedMigratedUnits(units: readonly StoredUnit[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MIGRATED_UNITS_STORAGE_KEY, JSON.stringify(units));
  } catch (err) {
    console.error("Failed to save persisted migrated units:", err);
  }
}

/**
 * Persist an individual migrated unit into storage.
 */
export function savePersistedMigratedUnit(unit: StoredUnit): void {
  if (typeof window === "undefined") return;
  const existing = loadPersistedMigratedUnits();
  const filtered = existing.filter((u) => u.id !== unit.id && u.demandNumber !== unit.demandNumber);
  savePersistedMigratedUnits([unit, ...filtered]);
}

export const V_UNITS_MIGRATION_FLAG_KEY = "ptas_v_units_migration_done";

/**
 * One-time migration: convert V- demand units loaded from Supabase
 * into PotentialUnitRecord entries and seed them into localStorage.
 * Potential units strictly have no arrears (openingArrears: 0).
 * Idempotent — skips if already performed or if no V- units present.
 */
export function migrateVDemandUnitsToPotentialRegister(surveyUnits: readonly StoredUnit[]): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(V_UNITS_MIGRATION_FLAG_KEY)) return;

  const vUnits = surveyUnits.filter(
    (u) => u.demandUnit?.permanentDemandNo?.startsWith("V-") || u.demandNumber?.startsWith("V-")
  );
  if (vUnits.length === 0) return;

  const existing = loadPersistedPotentialUnits();
  const existingPotNos = new Set(existing.map((e) => e.potentialNumber));
  const existingPins = new Set(existing.map((e) => e.pinNumber));
  const existingProvincialUins = new Set(existing.map((e) => e.provincialUin));

  let maxSeq = existing.reduce((max, u) => {
    const m = u.potentialNumber.match(/\d+/);
    return m ? Math.max(max, parseInt(m[0], 10)) : max;
  }, 0);

  const newPots: PotentialUnitRecord[] = [];
  for (const u of vUnits) {
    const demandNo = u.demandUnit?.permanentDemandNo || u.demandNumber || "";
    const rawPin = u.provincialUin || u.pinNumber || demandNo;
    const pin = formatPotentialPin(rawPin);

    // Skip duplicates
    if (
      existingPins.has(pin) ||
      existingPins.has(rawPin) ||
      existingProvincialUins.has(pin) ||
      existingProvincialUins.has(rawPin)
    ) {
      continue;
    }

    let potNum: string;
    do {
      maxSeq++;
      potNum = `POT-${maxSeq.toString().padStart(4, "0")}`;
    } while (existingPotNos.has(potNum));

    existingPotNos.add(potNum);
    existingPins.add(pin);
    existingProvincialUins.add(pin);

    const rule =
      u.statutoryRule ||
      resolveRule(u.statutoryRuleId || u.categoryCode || "1", u.subclassificationCode || undefined);
    const annualRate =
      u.assessmentVersions?.[0]?.snapshot?.taxAmount ?? rule?.annual_rate_pkr ?? 4000;

    newPots.push({
      id: `v-migrated-${u.id}`,
      potentialNumber: potNum,
      pinNumber: pin,
      provincialUin: pin,
      legalName: u.legalName,
      tradeName: u.tradeName,
      identifierType: u.identifierType,
      identifierValue: u.identifierValue,
      address: u.address,
      locality: u.locality,
      circleId: u.circleId || "00000000-0000-4000-8000-000000000004",
      circleName: u.circleName || "Vehari Circle I (City / Commercial)",
      districtName: u.districtName ?? "Vehari",
      categoryCode: u.categoryCode ?? rule?.category_code ?? "1",
      categoryName: rule?.category ?? "Commercial Establishments",
      subclassificationCode: u.subclassificationCode ?? rule?.subclassification_code,
      subclassificationName: rule?.subcategory,
      statutoryTertiaryCode: u.statutoryTertiaryCode ?? rule?.statutory_tertiary_code,
      statutoryTertiaryClassification: rule?.statutory_tertiary_classification,
      statutoryRuleId: u.statutoryRuleId ?? rule?.rule_id ?? "PFT-1.i",
      statutoryRule: rule,
      annualRatePkr: annualRate,
      openingArrears: 0, // Potential register strictly has no arrears
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      createdBy: "System Migration (V- Demand Units)"
    });
  }

  if (newPots.length > 0) {
    const updated = [...existing, ...newPots];
    savePersistedPotentialUnits(updated);
  }
  localStorage.setItem(V_UNITS_MIGRATION_FLAG_KEY, new Date().toISOString());
}

/**
 * Official CSV Template for Bulk Potential Discovery Units Ingestion.
 * Contains authentic Vehari jurisdiction circles and realistic commercial examples without arrears.
 */
export function generatePotentialCsvTemplate(): string {
  const headers = [
    "District",
    "Circle",
    "Tehsil",
    "Locality",
    "Commercial Address",
    "Legal Name",
    "Trade Name",
    "Identifier Type",
    "Identifier Value",
    "Category Code",
    "Subclass Code"
  ].join(",");

  const sampleRows = [
    [
      "Vehari",
      "Vehari Circle I (City / Commercial)",
      "Vehari",
      "Club Road Commercial Area",
      '"Shop # 12, Club Road, Vehari"',
      "Al-Madina Medical & Surgical Store",
      "Al-Madina Pharmacy",
      "CNIC",
      "36603-1234567-1",
      "1",
      "1(i)"
    ].join(","),
    [
      "Vehari",
      "Vehari Circle II (Grain Market / Rural)",
      "Vehari",
      "Grain Market (Galla Mandi)",
      '"Plot 44-B, Grain Market, Vehari"',
      "Ittehad Seed & Pesticides Corporation",
      "Ittehad Seeds",
      "NTN",
      "4192837-1",
      "4",
      "4(ii)"
    ].join(","),
    [
      "Vehari",
      "Burewala Circle",
      "Burewala",
      "Chichawatni Road Commercial Strip",
      '"Main Chichawatni Road, Burewala"',
      "Bismillah Engineering & Spares Works",
      "Bismillah Engineering",
      "CNIC",
      "36601-9876543-3",
      "2",
      "2(i)"
    ].join(","),
    [
      "Vehari",
      "Mailsi Circle",
      "Mailsi",
      "Mailsi Main Bazaar",
      '"Shop 18, Colony Road, Mailsi"',
      "Chenab Fabrics & Garments Emporium",
      "Chenab Fabrics",
      "CNIC",
      "36602-5432109-5",
      "3",
      "3(i)"
    ].join(",")
  ].join("\r\n");

  return `\uFEFF${headers}\r\n${sampleRows}\r\n`;
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

  // Parse header if present
  const firstLineCols = lines[0]!.split(",").map((c) =>
    c
      .replace(/^["']|["']$/g, "")
      .trim()
      .toLowerCase()
  );

  const hasHeaders =
    firstLineCols.some((c) => c.includes("legal") || c.includes("name")) ||
    firstLineCols.some((c) => c.includes("identifier") || c.includes("cnic")) ||
    firstLineCols.some((c) => c.includes("district") || c.includes("circle"));

  const startIndex = hasHeaders ? 1 : 0;
  const headerMap = new Map<string, number>();

  if (hasHeaders) {
    firstLineCols.forEach((col, idx) => {
      if (col.includes("district")) headerMap.set("district", idx);
      else if (col.includes("circle")) headerMap.set("circle", idx);
      else if (col.includes("tehsil")) headerMap.set("tehsil", idx);
      else if (col.includes("locality")) headerMap.set("locality", idx);
      else if (col.includes("address")) headerMap.set("address", idx);
      else if (col.includes("legal") || (col.includes("name") && !col.includes("trade"))) {
        headerMap.set("legalName", idx);
      } else if (col.includes("trade") || col.includes("business")) headerMap.set("tradeName", idx);
      else if (col.includes("id type") || col.includes("identifier type")) {
        headerMap.set("idType", idx);
      } else if (
        col.includes("id val") ||
        col.includes("identifier val") ||
        col === "identifier" ||
        col === "cnic" ||
        col === "ntn"
      ) {
        headerMap.set("idVal", idx);
      } else if (col.includes("cat") || col.includes("class")) {
        if (col.includes("sub")) headerMap.set("subCode", idx);
        else headerMap.set("catCode", idx);
      }
    });
  }

  let currentSequence =
    existingPotentialUnits.reduce((max, u) => {
      const match = u.potentialNumber.match(/\d+/);
      const val = match ? parseInt(match[0], 10) : 0;
      return Math.max(max, val);
    }, 0) + 1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const cols = line.split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
    if (cols.length < 2) continue;

    let legalName: string;
    let tradeName: string | undefined;
    let idTypeVal: string;
    let idVal: string;
    let catCode: string;
    let subCode: string | undefined;
    let address: string;
    let locality: string;
    let circleStr: string;
    let districtStr: string;

    if (hasHeaders && headerMap.size >= 2) {
      legalName = (headerMap.has("legalName") ? cols[headerMap.get("legalName")!] : cols[0]) || "";
      idVal = (headerMap.has("idVal") ? cols[headerMap.get("idVal")!] : cols[1]) || "";
      tradeName = headerMap.has("tradeName") ? cols[headerMap.get("tradeName")!] : undefined;
      idTypeVal = headerMap.has("idType") ? cols[headerMap.get("idType")!] || "" : "";
      catCode = (headerMap.has("catCode") ? cols[headerMap.get("catCode")!] : cols[2]) || "1";
      subCode = headerMap.has("subCode") ? cols[headerMap.get("subCode")!] : cols[3] || undefined;
      address =
        (headerMap.has("address") ? cols[headerMap.get("address")!] : cols[4]) ||
        "Vehari Commercial Area";
      locality =
        (headerMap.has("locality") ? cols[headerMap.get("locality")!] : cols[5]) ||
        "Vehari City Commercial Zone";
      circleStr =
        (headerMap.has("circle") ? cols[headerMap.get("circle")!] : "") ||
        "Vehari Circle I (City / Commercial)";
      districtStr = (headerMap.has("district") ? cols[headerMap.get("district")!] : "") || "Vehari";
    } else if (cols.length >= 10) {
      // 10 or 11 column template layout
      districtStr = cols[0] || "Vehari";
      circleStr = cols[1] || "Vehari Circle I (City / Commercial)";
      locality = cols[3] || "Vehari City Commercial Zone";
      address = cols[4] || "Vehari Commercial Area";
      legalName = cols[5] || `Establishment ${currentSequence}`;
      tradeName = cols[6] || undefined;
      idTypeVal = cols[7] || "";
      idVal = cols[8] || `36603-${Math.floor(1000000 + Math.random() * 9000000)}-1`;
      catCode = cols[9] || "1";
      subCode = cols[10] || undefined;
    } else {
      // Legacy positional layout
      districtStr = "Vehari";
      circleStr = "Vehari Circle I (City / Commercial)";
      idTypeVal = "";
      legalName = cols[0] || `Establishment ${currentSequence}`;
      idVal = cols[1] || `36603-${Math.floor(1000000 + Math.random() * 9000000)}-1`;
      catCode = cols[2] || "1";
      subCode = cols[3] || undefined;
      address = cols[4] || "Vehari Commercial Area";
      locality = cols[5] || "Vehari City Commercial Zone";
      tradeName = cols[7] || undefined;
    }

    if (!legalName) legalName = `Establishment ${currentSequence}`;
    if (!idVal) idVal = `36603-${Math.floor(1000000 + Math.random() * 9000000)}-1`;

    const identifierType: "CNIC" | "NTN" =
      idTypeVal.toUpperCase() === "NTN" || (!idTypeVal && idVal.includes("-") && idVal.length <= 10)
        ? "NTN"
        : "CNIC";

    const rule = resolveRule(catCode, subCode);
    const potNum = `POT-${currentSequence.toString().padStart(4, "0")}`;
    const pinNumber = formatPotentialPin(
      `237-00101061102${currentSequence.toString().padStart(4, "0")}-01`
    );

    // Resolve authoritative circle and circleId
    let circleName = "Vehari Circle I (City / Commercial)";
    let circleId = "00000000-0000-4000-8000-000000000004";
    const lowerCircle = circleStr.toLowerCase();
    if (lowerCircle.includes("burewala")) {
      circleName = "Burewala Circle";
      circleId = "00000000-0000-4000-8000-000000000003";
    } else if (lowerCircle.includes("mailsi")) {
      circleName = "Mailsi Circle";
      circleId = "00000000-0000-4000-8000-000000000002";
    } else if (
      lowerCircle.includes("circle ii") ||
      lowerCircle.includes("circle 2") ||
      lowerCircle.includes("grain")
    ) {
      circleName = "Vehari Circle II (Grain Market / Rural)";
      circleId = "00000000-0000-4000-8000-000000000005";
    }

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
      circleId,
      circleName,
      districtName: districtStr || "Vehari",
      categoryCode: rule.category_code,
      categoryName: rule.category,
      subclassificationCode: rule.subclassification_code,
      subclassificationName: rule.subcategory,
      statutoryTertiaryCode: rule.statutory_tertiary_code,
      statutoryTertiaryClassification: rule.statutory_tertiary_classification,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      annualRatePkr: rule.annual_rate_pkr ?? 4000,
      openingArrears: 0,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      createdBy: officerName
    });

    currentSequence++;
  }

  return { importedUnits, errors };
}

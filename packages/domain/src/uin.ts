/**
 * Provincial Unique Identification Number (UIN) for Punjab Professional Tax
 *
 * A structured multi-block composite identifier that encodes the full
 * jurisdiction hierarchy and statutory classification into a single
 * province-wide key. The UIN is permanent across financial years —
 * it identifies the taxpayer unit, not a specific FY assessment.
 *
 * Format: DDD-TTT-CC-SS-UU-RR-NNNNN-VV
 *
 *   DDD   = 3-digit PBS district code (e.g. 237 = Vehari)
 *   TTT   = 3-digit tehsil code within district
 *   CC    = 2-digit circle code within tehsil
 *   SS    = 2-digit Second Schedule category (01-11)
 *   UU    = 2-digit sub-classification index (00 = direct category rate)
 *   RR    = 2-digit tertiary classification index (00 = no tertiary split)
 *   NNNNN = 5-digit sequence within circle (max 99,999)
 *   VV    = 2-digit version (starts 01; increments on reclassification)
 *
 * Example: 237-001-01-03-01-02-00001-01
 *
 * District codes sourced from Pakistan Bureau of Statistics (PBS).
 */

import type { StatutoryRuleDefinition } from "./statutory-rules.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JurisdictionCodes {
  /** 3-digit PBS district code (e.g. "237" for Vehari) */
  readonly districtCode: string;
  /** 3-digit tehsil code within district (e.g. "001") */
  readonly tehsilCode: string;
  /** 2-digit circle code within tehsil (e.g. "01") */
  readonly circleCode: string;
}

export interface ClassificationBlock {
  /** 2-digit zero-padded schedule category (e.g. "03" for Category 3) */
  readonly classCode: string;
  /** 2-digit zero-padded sub-classification index (e.g. "01"; "00" = direct) */
  readonly subclassCode: string;
  /** 2-digit zero-padded tertiary index (e.g. "02"; "00" = none) */
  readonly tertiaryCode: string;
}

export interface UinComponents {
  readonly jurisdiction: JurisdictionCodes;
  readonly classification: ClassificationBlock;
  /** 5-digit circle-scoped sequential number (e.g. "00001") */
  readonly sequence: string;
  /** 2-digit version number (e.g. "01") */
  readonly version: string;
}

// ---------------------------------------------------------------------------
// Punjab PBS District Codes (Official — Pakistan Bureau of Statistics)
// Source: PBS Census / PSLM administrative coding, Punjab 200-series
// ---------------------------------------------------------------------------

export interface PunjabDistrictEntry {
  readonly code: string;
  readonly name: string;
  readonly divisionName: string;
}

/**
 * Official PBS district codes for Punjab province.
 * The 200-series is used by PBS for all Punjab districts.
 * Newly notified districts can be added with codes > 237.
 */
export const PBS_PUNJAB_DISTRICTS: readonly PunjabDistrictEntry[] = [
  { code: "201", name: "Attock", divisionName: "Rawalpindi" },
  { code: "202", name: "Bahawalnagar", divisionName: "Bahawalpur" },
  { code: "203", name: "Bahawalpur", divisionName: "Bahawalpur" },
  { code: "204", name: "Bhakkar", divisionName: "Sargodha" },
  { code: "205", name: "Chakwal", divisionName: "Rawalpindi" },
  { code: "206", name: "Chiniot", divisionName: "Faisalabad" },
  { code: "207", name: "Dera Ghazi Khan", divisionName: "D.G. Khan" },
  { code: "208", name: "Faisalabad", divisionName: "Faisalabad" },
  { code: "209", name: "Gujranwala", divisionName: "Gujranwala" },
  { code: "210", name: "Gujrat", divisionName: "Gujranwala" },
  { code: "211", name: "Hafizabad", divisionName: "Gujranwala" },
  { code: "212", name: "Islamabad", divisionName: "Rawalpindi" },
  { code: "213", name: "Jhelum", divisionName: "Rawalpindi" },
  { code: "214", name: "Jhang", divisionName: "Faisalabad" },
  { code: "215", name: "Kasur", divisionName: "Lahore" },
  { code: "216", name: "Khanewal", divisionName: "Multan" },
  { code: "217", name: "Khushab", divisionName: "Sargodha" },
  { code: "218", name: "Lahore", divisionName: "Lahore" },
  { code: "219", name: "Layyah", divisionName: "D.G. Khan" },
  { code: "220", name: "Lodhran", divisionName: "Multan" },
  { code: "221", name: "Mandi Bahauddin", divisionName: "Gujranwala" },
  { code: "222", name: "Mianwali", divisionName: "Sargodha" },
  { code: "223", name: "Multan", divisionName: "Multan" },
  { code: "224", name: "Muzaffargarh", divisionName: "D.G. Khan" },
  { code: "225", name: "Nankana Sahib", divisionName: "Lahore" },
  { code: "226", name: "Narowal", divisionName: "Gujranwala" },
  { code: "227", name: "Okara", divisionName: "Sahiwal" },
  { code: "228", name: "Pakpattan", divisionName: "Sahiwal" },
  { code: "229", name: "Rahim Yar Khan", divisionName: "Bahawalpur" },
  { code: "230", name: "Rajanpur", divisionName: "D.G. Khan" },
  { code: "231", name: "Rawalpindi", divisionName: "Rawalpindi" },
  { code: "232", name: "Sahiwal", divisionName: "Sahiwal" },
  { code: "233", name: "Sargodha", divisionName: "Sargodha" },
  { code: "234", name: "Sheikhupura", divisionName: "Lahore" },
  { code: "235", name: "Sialkot", divisionName: "Gujranwala" },
  { code: "236", name: "Toba Tek Singh", divisionName: "Faisalabad" },
  { code: "237", name: "Vehari", divisionName: "Multan" }
];

/**
 * Tehsils for Vehari district (pilot scope).
 * Additional districts' tehsils should be added as the system scales.
 */
export interface TehsilEntry {
  readonly code: string;
  readonly name: string;
  readonly districtCode: string;
}

export const VEHARI_TEHSILS: readonly TehsilEntry[] = [
  { code: "001", name: "Vehari", districtCode: "237" },
  { code: "002", name: "Burewala", districtCode: "237" },
  { code: "003", name: "Mailsi", districtCode: "237" }
];

// ---------------------------------------------------------------------------
// Vehari Pilot Jurisdiction Constants
// ---------------------------------------------------------------------------

/** Default jurisdiction codes for the Vehari pilot circle */
export const VEHARI_PILOT_JURISDICTION: JurisdictionCodes = {
  districtCode: "237",
  tehsilCode: "001",
  circleCode: "01"
};

// ---------------------------------------------------------------------------
// Classification Block Computation
// ---------------------------------------------------------------------------

/**
 * Builds the sub-classification index map for a given category.
 * The index is the 1-based position of the sub-classification within
 * the category's sorted sub-classification list.
 *
 * Categories without sub-classifications return "00" for all lookups.
 */
function buildSubclassIndex(
  categoryCode: string,
  allRules: readonly StatutoryRuleDefinition[]
): Map<string | null, string> {
  const map = new Map<string | null, string>();

  // Collect unique sub-classification codes for this category
  const subCodes = new Set<string>();
  for (const r of allRules) {
    if (r.category_code === categoryCode && r.subclassification_code) {
      subCodes.add(r.subclassification_code);
    }
  }

  if (subCodes.size === 0) {
    // Direct category rate — no sub-classifications
    map.set(null, "00");
    return map;
  }

  // Sort sub-classification codes lexicographically for deterministic ordering
  const sorted = [...subCodes].sort();
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i]!, String(i + 1).padStart(2, "0"));
  }
  map.set(null, "00");
  return map;
}

/**
 * Builds the tertiary classification index map for a given sub-classification.
 * The index is the 1-based position within the sub-classification's
 * sorted tertiary list.
 */
function buildTertiaryIndex(
  categoryCode: string,
  subclassificationCode: string | null,
  allRules: readonly StatutoryRuleDefinition[]
): Map<string | null, string> {
  const map = new Map<string | null, string>();

  const tertCodes = new Set<string>();
  for (const r of allRules) {
    if (
      r.category_code === categoryCode &&
      r.subclassification_code === subclassificationCode &&
      r.statutory_tertiary_code
    ) {
      tertCodes.add(r.statutory_tertiary_code);
    }
  }

  if (tertCodes.size === 0) {
    map.set(null, "00");
    return map;
  }

  const sorted = [...tertCodes].sort();
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i]!, String(i + 1).padStart(2, "0"));
  }
  map.set(null, "00");
  return map;
}

/**
 * Computes the 3-block classification segment of a UIN from a statutory rule.
 *
 * @param rule - The resolved statutory rule definition
 * @param allRules - Complete list of all statutory rules (needed for index computation)
 * @returns ClassificationBlock with zero-padded codes
 */
export function computeClassificationBlock(
  rule: StatutoryRuleDefinition,
  allRules: readonly StatutoryRuleDefinition[]
): ClassificationBlock {
  const classCode = rule.category_code.padStart(2, "0");

  const subIndex = buildSubclassIndex(rule.category_code, allRules);
  const subclassCode = subIndex.get(rule.subclassification_code ?? null) ?? "00";

  const tertIndex = buildTertiaryIndex(
    rule.category_code,
    rule.subclassification_code ?? null,
    allRules
  );
  const tertiaryCode = tertIndex.get(rule.statutory_tertiary_code ?? null) ?? "00";

  return { classCode, subclassCode, tertiaryCode };
}

// ---------------------------------------------------------------------------
// UIN Generation
// ---------------------------------------------------------------------------

/**
 * Generates a formatted Provincial UIN string from its components.
 *
 * @returns UIN in format "DDD-TTT-CC-SS-UU-RR-NNNNN-VV"
 */
export function generateUin(components: UinComponents): string {
  const { jurisdiction, classification, sequence, version } = components;

  // Validate component widths
  if (jurisdiction.districtCode.length !== 3) {
    throw new Error(`District code must be 3 digits, got "${jurisdiction.districtCode}"`);
  }
  if (jurisdiction.tehsilCode.length !== 3) {
    throw new Error(`Tehsil code must be 3 digits, got "${jurisdiction.tehsilCode}"`);
  }
  if (jurisdiction.circleCode.length !== 2) {
    throw new Error(`Circle code must be 2 digits, got "${jurisdiction.circleCode}"`);
  }
  if (classification.classCode.length !== 2) {
    throw new Error(`Class code must be 2 digits, got "${classification.classCode}"`);
  }
  if (classification.subclassCode.length !== 2) {
    throw new Error(`Sub-class code must be 2 digits, got "${classification.subclassCode}"`);
  }
  if (classification.tertiaryCode.length !== 2) {
    throw new Error(`Tertiary code must be 2 digits, got "${classification.tertiaryCode}"`);
  }
  if (sequence.length !== 5) {
    throw new Error(`Sequence must be 5 digits, got "${sequence}"`);
  }
  if (version.length !== 2) {
    throw new Error(`Version must be 2 digits, got "${version}"`);
  }

  // 3 grouped parts: DDD - TTTCCSSUURRNNNNN - VV (e.g. 237-0010106100100005-01)
  const middleGroup = `${jurisdiction.tehsilCode}${jurisdiction.circleCode}${classification.classCode}${classification.subclassCode}${classification.tertiaryCode}${sequence}`;
  return `${jurisdiction.districtCode}-${middleGroup}-${version}`;
}

/**
 * Generates the compact (no-dash) form of the PIN for machine processing.
 * 21-digit numeric string (3+3+2+2+2+2+5+2).
 */
export function generateCompactUin(components: UinComponents): string {
  return generateUin(components).replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// PIN Parsing
// ---------------------------------------------------------------------------

/** 3-group PIN format regex: DDD-TTTCCSSUURRNNNNN-VV (e.g. 237-0010106100100005-01) */
const PIN_3GROUP_FORMAT = /^(\d{3})-(\d{3})(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})-(\d{2})$/;

/** Legacy 8-group format regex: DDD-TTT-CC-SS-UU-RR-NNNNN-VV */
const UIN_8GROUP_FORMAT = /^(\d{3})-(\d{3})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{5})-(\d{2})$/;

/** Compact PIN format regex: 21 contiguous digits */
const UIN_COMPACT_FORMAT = /^(\d{3})(\d{3})(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})(\d{2})$/;

/**
 * Parses a PIN / UIN string (3-group, 8-group, or compact) into its components.
 *
 * @throws Error if the format is invalid
 */
export function parseUin(uin: string): UinComponents {
  const trimmed = uin.trim();
  const match =
    PIN_3GROUP_FORMAT.exec(trimmed) ??
    UIN_8GROUP_FORMAT.exec(trimmed) ??
    UIN_COMPACT_FORMAT.exec(trimmed);

  if (!match) {
    throw new Error(
      `Invalid PIN / UIN format: "${uin}". Expected 3-group DDD-TTTCCSSUURRNNNNN-VV or 21-digit compact form.`
    );
  }

  return {
    jurisdiction: {
      districtCode: match[1]!,
      tehsilCode: match[2]!,
      circleCode: match[3]!
    },
    classification: {
      classCode: match[4]!,
      subclassCode: match[5]!,
      tertiaryCode: match[6]!
    },
    sequence: match[7]!,
    version: match[8]!
  };
}

// ---------------------------------------------------------------------------
// PIN Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a string is a well-formed PIN / UIN (3-group, legacy 8-group, or compact).
 * Does NOT verify that the district/classification codes exist — only format.
 */
export function validateUin(uin: string): boolean {
  const trimmed = uin.trim();
  return (
    PIN_3GROUP_FORMAT.test(trimmed) ||
    UIN_8GROUP_FORMAT.test(trimmed) ||
    UIN_COMPACT_FORMAT.test(trimmed)
  );
}

/**
 * Validates a UIN against the known PBS district registry.
 * Returns an error message or null if valid.
 */
export function validateUinDistrict(uin: string): string | null {
  if (!validateUin(uin)) {
    return "Invalid UIN format";
  }
  const components = parseUin(uin);
  const district = PBS_PUNJAB_DISTRICTS.find(
    (d) => d.code === components.jurisdiction.districtCode
  );
  if (!district) {
    return `Unknown district code: ${components.jurisdiction.districtCode}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convenience: Full UIN from Rule + Jurisdiction + Sequence
// ---------------------------------------------------------------------------

/**
 * High-level convenience function that generates a complete UIN for a new
 * taxpayer unit given the jurisdiction, statutory rule, sequence, and
 * the full rule set for index computation.
 */
export function generateUinForUnit(params: {
  readonly jurisdiction: JurisdictionCodes;
  readonly rule: StatutoryRuleDefinition;
  readonly allRules: readonly StatutoryRuleDefinition[];
  readonly sequenceNumber: number;
  readonly version?: number;
}): string {
  const classification = computeClassificationBlock(params.rule, params.allRules);
  const sequence = String(params.sequenceNumber).padStart(5, "0");
  const version = String(params.version ?? 1).padStart(2, "0");

  return generateUin({
    jurisdiction: params.jurisdiction,
    classification,
    sequence,
    version
  });
}

/**
 * Looks up a PBS district entry by code.
 */
export function getPbsDistrict(code: string): PunjabDistrictEntry | undefined {
  return PBS_PUNJAB_DISTRICTS.find((d) => d.code === code);
}

/**
 * Returns all tehsils for a given district code.
 * Currently only Vehari tehsils are populated (pilot scope).
 */
export function getTehsilsByDistrict(districtCode: string): readonly TehsilEntry[] {
  // For pilot, only Vehari tehsils are populated
  if (districtCode === "237") {
    return VEHARI_TEHSILS;
  }
  return [];
}

// ---------------------------------------------------------------------------
// PIN (Professional Identification Number) Aliases
// ---------------------------------------------------------------------------

export const generatePin = generateUin;
export const generateCompactPin = generateCompactUin;
export const parsePin = parseUin;
export const validatePin = validateUin;
export const validatePinDistrict = validateUinDistrict;
export const generatePinForUnit = generateUinForUnit;

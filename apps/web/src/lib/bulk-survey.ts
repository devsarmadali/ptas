/**
 * PTAS Vehari Pilot: Bulk Field Survey Ingestion Module
 * Governed by:
 * - Rule 4 & 5 (Survey & Notice) of Punjab Professions & Trades Tax Rules 1977
 * - Rule 11 (Assessment Register Form P.F.T-3)
 * - Second Schedule to Punjab Finance Act 1977 (47 statutory categories)
 * - Duplicate Detection and Statutory Rule Verification
 */

import {
  type AuditActor,
  type StatutoryRuleDefinition,
  type Taxpayer,
  VEHARI_PILOT_JURISDICTION,
  createAssessment,
  createTaxpayer,
  findDuplicateCandidates,
  generateUinForUnit,
  getAllStatutoryRules,
  getStatutoryRuleById,
  getStatutoryRuleBySubclassification,
  maskIdentifier,
  normalizeIdentifier,
  submitAssessmentVersion
} from "@ptas/domain";
import {
  CIRCLE_VEHARI_ID,
  FINANCIAL_YEAR_2026_27,
  type MockOfficer,
  type PilotAuditItem,
  type StoredUnit,
  type StoredUnitSnapshot
} from "./pilot-store";

export interface ValidSurveyUnit {
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifierType: "CNIC" | "NTN";
  readonly identifierValue: string;
  readonly normalizedIdentifier: string;
  readonly maskedIdentifier: string;
  readonly address: string;
  readonly statutoryRule: StatutoryRuleDefinition;
  readonly categoryCode: string;
  readonly taxAmount: number;
  readonly phone?: string | undefined;
}

export interface BulkSurveyValidationRow {
  readonly rowNumber: number;
  readonly rawData: Record<string, string>;
  readonly status: "VALID" | "ERROR";
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly parsedUnit?: ValidSurveyUnit | undefined;
}

export interface BulkSurveyParseResult {
  readonly totalRows: number;
  readonly validRowsCount: number;
  readonly errorRowsCount: number;
  readonly duplicateCount: number;
  readonly rows: readonly BulkSurveyValidationRow[];
  readonly validUnits: readonly ValidSurveyUnit[];
}

/**
 * Standard CSV Template with realistic Vehari commercial survey records.
 */
export function generateSurveyCsvTemplate(): string {
  const headers = [
    "Legal Name",
    "Trade Name",
    "Identifier Type",
    "Identifier Value",
    "Commercial Address",
    "Statutory Rule ID",
    "Phone"
  ];

  const sampleRows = [
    [
      "Vehari Grain Commission Shop",
      "Al-Rehman Traders",
      "CNIC",
      "36601-5829103-1",
      "Shop 14, Grain Market, Club Road, Vehari",
      "PFT-6.x",
      "0300-7712345"
    ],
    [
      "Burewala Model Clinic",
      "Dr. Tariq Medical Clinic",
      "CNIC",
      "36601-9823712-5",
      "Club Road, Opp. Civil Hospital, Vehari",
      "PFT-6.ii",
      "0301-6623912"
    ],
    [
      "Ittehad Sweet Palace & Bakers",
      "Ittehad Bakers",
      "CNIC",
      "36601-4458921-7",
      "Karkhana Bazar, Near Chowk, Vehari",
      "PFT-10",
      "0302-8812903"
    ],
    [
      "Vehari Hardware & Sanitary Store",
      "Al-Makkah Hardware",
      "CNIC",
      "36601-3312984-9",
      "Luddan Road, Commercial Hub, Vehari",
      "PFT-3.i.b",
      "0303-4419283"
    ],
    [
      "Chenab Housing Developers",
      "Chenab Real Estate Builders",
      "NTN",
      "4182931-4",
      "Multan Road, Near Bypass, Vehari",
      "PFT-8",
      "0300-9928172"
    ]
  ];

  const escapeCell = (cell: string): string => {
    if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  const lines = [
    headers.map(escapeCell).join(","),
    ...sampleRows.map((row) => row.map(escapeCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Standard RFC-4180 CSV parser handling quotes, escaped quotes, and CRLF/LF.
 */
export function parseCsvContent(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, ""); // Remove UTF-8 BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote: "" -> "
        currentCell += '"';
        i++;
      } else {
        // Toggle quote mode
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      // Cell boundary
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      // Line boundary
      if (char === "\r" && nextChar === "\n") {
        i++; // Skip LF in CRLF
      }
      currentRow.push(currentCell.trim());
      // Only push non-empty rows
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  // Push final cell and row if non-empty
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Resolves header aliases to canonical field names.
 */
function normalizeHeaderName(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (h.includes("legalname") || h === "legal" || h === "businessname" || h === "assessee") {
    return "legalName";
  }
  if (h.includes("tradename") || h === "trade" || h === "shopname" || h === "brand") {
    return "tradeName";
  }
  if (h.includes("identifiertype") || h === "idtype") {
    return "identifierType";
  }
  if (
    h.includes("identifiervalue") ||
    h === "identifier" ||
    h === "cnic" ||
    h === "ntn" ||
    h === "cnicntn"
  ) {
    return "identifierValue";
  }
  if (h.includes("address") || h === "location" || h === "shopaddress") {
    return "address";
  }
  if (
    h.includes("statutoryrule") ||
    h.includes("ruleid") ||
    h === "rule" ||
    h.includes("schedule") ||
    h.includes("subclassification") ||
    h === "categorycode"
  ) {
    return "statutoryRuleId";
  }
  if (h.includes("phone") || h.includes("mobile") || h.includes("contact")) {
    return "phone";
  }
  return header.trim();
}

/**
 * Validates and parses bulk survey CSV content.
 */
export function parseBulkSurveyCsv(
  csvText: string,
  existingUnits: readonly StoredUnit[]
): BulkSurveyParseResult {
  const rawRows = parseCsvContent(csvText);
  if (rawRows.length === 0) {
    return {
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateCount: 0,
      rows: [],
      validUnits: []
    };
  }

  const rawHeaders = rawRows[0] ?? [];
  const normalizedHeaders = rawHeaders.map(normalizeHeaderName);
  const dataRows = rawRows.slice(1);

  // Build existing normalized identifier index
  const existingIdIndex = new Map<string, StoredUnit>();
  for (const u of existingUnits) {
    try {
      const norm = normalizeIdentifier(u.identifierType, u.identifierValue);
      existingIdIndex.set(norm, u);
    } catch {
      existingIdIndex.set(u.identifierValue.trim(), u);
    }
  }

  // Build existing taxpayers for domain similarity detection
  const dummyActor: AuditActor = {
    userId: "bulk-survey-auditor",
    roleCode: "INSPECTOR",
    jurisdictionId: CIRCLE_VEHARI_ID
  };

  const existingTaxpayers: Taxpayer[] = existingUnits
    .map((u) => {
      try {
        return createTaxpayer(
          {
            id: u.id,
            displayName: u.legalName,
            currentCircleId: u.circleId,
            identifiers: [
              {
                identifierType: u.identifierType,
                value: u.identifierValue
              }
            ]
          },
          dummyActor
        );
      } catch {
        return null;
      }
    })
    .filter((t): t is Taxpayer => t !== null);

  // Track in-file normalized identifiers to catch intra-batch duplicates
  const inBatchIdIndex = new Map<string, number>();

  const validatedRows: BulkSurveyValidationRow[] = [];
  const validUnits: ValidSurveyUnit[] = [];
  let duplicateCount = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx] ?? [];
    const rowNumber = idx + 2; // Line 1 is header
    const errors: string[] = [];
    const warnings: string[] = [];

    // Map row values to headers
    const rowMap: Record<string, string> = {};
    for (let c = 0; c < normalizedHeaders.length; c++) {
      const key = normalizedHeaders[c];
      if (key) {
        rowMap[key] = (row[c] ?? "").trim();
      }
    }

    const legalName = rowMap["legalName"] ?? "";
    const tradeName = rowMap["tradeName"] || undefined;
    const identifierTypeRaw = (rowMap["identifierType"] ?? "").toUpperCase();
    const identifierValueRaw = rowMap["identifierValue"] ?? "";
    const address = rowMap["address"] ?? "";
    const statutoryRuleIdRaw = rowMap["statutoryRuleId"] ?? "";
    const phone = rowMap["phone"] || undefined;

    // 1. Validate Legal Name
    if (!legalName) {
      errors.push("Missing required field: Legal Name");
    }

    // 2. Validate Identifier Value & Infer Type
    let identifierType: "CNIC" | "NTN" = "CNIC";
    let normalizedId = "";
    let maskedId = "";

    if (!identifierValueRaw) {
      errors.push("Missing required field: Identifier Value (CNIC or NTN)");
    } else {
      // Auto-infer identifier type if missing or ambiguous
      const digitsOnly = identifierValueRaw.replace(/\D/g, "");
      if (!identifierTypeRaw || (identifierTypeRaw !== "CNIC" && identifierTypeRaw !== "NTN")) {
        if (digitsOnly.length === 13) {
          identifierType = "CNIC";
        } else if (digitsOnly.length >= 7 && digitsOnly.length <= 8) {
          identifierType = "NTN";
        } else {
          identifierType = "CNIC";
        }
      } else {
        identifierType = identifierTypeRaw as "CNIC" | "NTN";
      }

      // Check normalization under domain rules
      try {
        normalizedId = normalizeIdentifier(identifierType, identifierValueRaw);
        maskedId = maskIdentifier(identifierType, normalizedId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Invalid ${identifierType}: ${msg}`);
      }
    }

    // 3. Validate Commercial Address
    if (!address) {
      errors.push("Missing required field: Commercial Address");
    }

    // 4. Validate Statutory Rule ID / Schedule Code
    let resolvedRule: StatutoryRuleDefinition | undefined;
    if (!statutoryRuleIdRaw) {
      errors.push("Missing required field: Statutory Rule ID or Subclassification");
    } else {
      // Try direct rule ID lookup (e.g. "PFT-6.x", "PFT-3.i.b", "PFT-10")
      resolvedRule = getStatutoryRuleById(statutoryRuleIdRaw);
      // Fallback: try subclassification code (e.g. "6(x)", "3(i)(b)", "10")
      if (!resolvedRule) {
        resolvedRule = getStatutoryRuleBySubclassification(statutoryRuleIdRaw);
      }
      if (!resolvedRule) {
        errors.push(
          `Unrecognized Statutory Rule "${statutoryRuleIdRaw}". Must match Second Schedule (e.g., "PFT-6.x", "PFT-3.i.b", "PFT-10", "PFT-8", etc.)`
        );
      }
    }

    // 5. Duplicate Identification Checks
    if (normalizedId) {
      // Check in-file duplicate
      const seenRow = inBatchIdIndex.get(normalizedId);
      if (seenRow !== undefined) {
        errors.push(
          `Duplicate identifier in upload file: ${identifierType} (${maskedId}) already appeared on row ${seenRow}`
        );
        duplicateCount++;
      } else {
        inBatchIdIndex.set(normalizedId, rowNumber);
      }

      // Check existing units in database
      const existing = existingIdIndex.get(normalizedId);
      if (existing) {
        errors.push(
          `Already registered: ${identifierType} (${maskedId}) exists for "${existing.legalName}" (${existing.demandUnit.permanentDemandNo})`
        );
        duplicateCount++;
      }
    }

    // 6. Name Similarity Candidate Check (Warning only)
    if (legalName) {
      const candidates = findDuplicateCandidates(
        {
          displayName: legalName,
          currentCircleId: CIRCLE_VEHARI_ID
        },
        existingTaxpayers
      );
      const highMatch = candidates.find((c) => c.confidence === "EXACT" || c.confidence === "HIGH");
      if (highMatch) {
        warnings.push(
          `Similar business name found in system: "${highMatch.existingDisplayName}" (${highMatch.matchReason})`
        );
      }
    }

    const isValid = errors.length === 0 && resolvedRule !== undefined;

    let parsedUnit: ValidSurveyUnit | undefined;
    if (isValid && resolvedRule) {
      parsedUnit = {
        legalName,
        tradeName,
        identifierType,
        identifierValue: identifierValueRaw,
        normalizedIdentifier: normalizedId,
        maskedIdentifier: maskedId,
        address,
        statutoryRule: resolvedRule,
        categoryCode: resolvedRule.category_code,
        taxAmount: resolvedRule.annual_rate_pkr,
        phone
      };
      validUnits.push(parsedUnit);
    }

    validatedRows.push({
      rowNumber,
      rawData: rowMap,
      status: isValid ? "VALID" : "ERROR",
      errors,
      warnings,
      parsedUnit
    });
  }

  const validRowsCount = validatedRows.filter((r) => r.status === "VALID").length;
  const errorRowsCount = validatedRows.filter((r) => r.status === "ERROR").length;

  return {
    totalRows: dataRows.length,
    validRowsCount,
    errorRowsCount,
    duplicateCount,
    rows: validatedRows,
    validUnits
  };
}

/**
 * Converts validated survey units into StoredUnit records and audit events,
 * establishing initial submitted assessments ready for ETO statutory approval.
 */
export function convertValidSurveyUnitsToStoredUnits(
  validUnits: readonly ValidSurveyUnit[],
  officer: MockOfficer,
  existingUnitsCount: number
): {
  newUnits: StoredUnit[];
  auditItems: PilotAuditItem[];
} {
  const actor: AuditActor = {
    userId: officer.id,
    roleCode: officer.role,
    jurisdictionId: officer.jurisdictionId
  };

  const newUnits: StoredUnit[] = [];
  const baseTimestamp = new Date().toISOString();
  let totalAssessedDemand = 0;

  for (let idx = 0; idx < validUnits.length; idx++) {
    const item = validUnits[idx];
    if (!item) continue;

    const unitId = `unit-survey-${Date.now()}-${idx}`;
    const demandUnitId = `du-survey-${Date.now()}-${idx}`;
    const sequenceNumber = existingUnitsCount + idx + 1;
    const permanentDemandNo = `PDN-VEH-2026-${String(sequenceNumber).padStart(4, "0")}`;
    const provincialUin = generateUinForUnit({
      jurisdiction: VEHARI_PILOT_JURISDICTION,
      rule: item.statutoryRule,
      allRules: getAllStatutoryRules(),
      sequenceNumber
    });

    // Create Draft Assessment under official statutory rule
    const { assessment: draftAsm, version: draftVer } = createAssessment<StoredUnitSnapshot>(
      {
        id: `asm-survey-${Date.now()}-${idx}`,
        taxpayerId: unitId,
        financialYearId: FINANCIAL_YEAR_2026_27,
        snapshot: {
          taxAmount: item.taxAmount,
          statutoryCategory: item.statutoryRule.category,
          legalBasis: item.statutoryRule.official_text,
          ruleId: item.statutoryRule.rule_id,
          ruleCode: item.statutoryRule.rule_code,
          subclassificationCode: item.statutoryRule.subclassification_code,
          statutoryTertiaryCode: item.statutoryRule.statutory_tertiary_code,
          rateSourceLevel: item.statutoryRule.rate_source_level
        }
      },
      actor,
      baseTimestamp
    );

    // Auto-submit assessment for ETO review & approval
    const { assessment: submittedAsm, version: submittedVer } = submitAssessmentVersion(
      draftAsm,
      draftVer
    );

    const unit: StoredUnit = {
      id: unitId,
      legalName: item.legalName,
      tradeName: item.tradeName,
      identifierType: item.identifierType,
      identifierValue: item.identifierValue,
      address: item.address,
      circleId: CIRCLE_VEHARI_ID,
      provincialUin,
      categoryCode: item.categoryCode,
      subclassificationCode: item.statutoryRule.subclassification_code,
      statutoryTertiaryCode: item.statutoryRule.statutory_tertiary_code,
      statutoryRuleId: item.statutoryRule.rule_id,
      statutoryRule: item.statutoryRule,
      demandUnit: {
        id: demandUnitId,
        taxpayerId: unitId,
        permanentDemandNo,
        createdAt: baseTimestamp
      },
      assessments: [submittedAsm],
      assessmentVersions: [submittedVer],
      ledgerEntries: [],
      createdAt: baseTimestamp
    };

    totalAssessedDemand += item.taxAmount;
    newUnits.push(unit);
  }

  const auditCorrelationId = `corr-bulk-survey-${Date.now()}`;
  const auditItem: PilotAuditItem = {
    id: `audit-survey-${Date.now()}`,
    eventType: "BULK_SURVEY_IMPORTED",
    actorName: officer.name,
    actorRole: officer.role,
    target: `Batch Survey Import (${validUnits.length} Units)`,
    timestamp: baseTimestamp,
    correlationId: auditCorrelationId,
    details: `Imported ${validUnits.length} survey units into Form P.F.T-3 Assessment Register for Circle-Vehari. Total assessed demand submitted: PKR ${totalAssessedDemand.toLocaleString()}`
  };

  return {
    newUnits,
    auditItems: [auditItem]
  };
}

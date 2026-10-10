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
  SURVEY_IMPORT_COLUMNS,
  createSurveyImportCsvTemplate,
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
  normalizeIdentifier
} from "@ptas/domain";
import {
  CIRCLE_VEHARI_ID,
  DISTRICT_VEHARI_CIRCLES,
  FINANCIAL_YEAR_2026_27,
  type MockOfficer,
  type PilotAuditItem,
  type StoredUnit,
  type StoredUnitSnapshot
} from "./pilot-store";
import {
  MAX_BULK_IMPORT_ROWS,
  normalizeEntityLegalName,
  validateOfficerImportJurisdiction
} from "./bulk-import-standards";

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
  readonly openingArrears?: number | undefined;
  readonly phone?: string | undefined;
  readonly circleId?: string | undefined;
  readonly circleName?: string | undefined;
  readonly districtName?: string | undefined;
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

export type SurveyImportPayloadRow = Record<string, string>;

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Reads the exact survey-import worksheet contract from an Excel workbook and
 * converts it to RFC-4180 CSV for the existing validation and RPC pipeline.
 * The source workbook itself is never uploaded by this helper.
 */
export async function convertSurveyWorkbookToCsv(file: File): Promise<string> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const source = await file.arrayBuffer();
  await workbook.xlsx.load(source as Parameters<typeof workbook.xlsx.load>[0]);

  const expectedHeaders = SURVEY_IMPORT_COLUMNS.map((column) => column.header);
  const matchingWorksheets = workbook.worksheets.filter((candidate) =>
    expectedHeaders.every(
      (header, index) =>
        candidate
          .getRow(1)
          .getCell(index + 1)
          .text.trim() === header
    )
  );
  if (matchingWorksheets.length === 0) {
    throw new Error("No worksheet matches the approved Survey_Import_Filled column contract.");
  }

  // Prioritize worksheet with 'filled' in name, or with highest populated data rows
  let worksheet = matchingWorksheets.find((candidate) =>
    candidate.name.toLowerCase().includes("filled")
  );
  if (!worksheet) {
    let maxPopulated = -1;
    for (const candidate of matchingWorksheets) {
      let count = 0;
      for (let r = 2; r <= Math.min(candidate.actualRowCount, 25); r++) {
        const legalName = candidate.getRow(r).getCell(10).text?.trim();
        if (legalName) count++;
      }
      if (count > maxPopulated) {
        maxPopulated = count;
        worksheet = candidate;
      }
    }
  }
  if (!worksheet) {
    worksheet = matchingWorksheets[0]!;
  }

  const rows: string[][] = [expectedHeaders];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    // Skip empty template placeholder rows
    const legalNameCell = row.getCell(10);
    const legalName = (legalNameCell.text || "").trim();
    if (!legalName) continue;

    const values = expectedHeaders.map((header, index) => {
      const cell = row.getCell(index + 1);
      if (header === "Survey Date (Auto)" && cell.value instanceof Date) {
        return cell.value.toISOString().slice(0, 10);
      }
      // Handle Excel formula results safely
      if (cell.value && typeof cell.value === "object" && "result" in cell.value) {
        const res = (cell.value as { result: unknown }).result;
        if (res instanceof Date) return res.toISOString().slice(0, 10);
        return res !== null && res !== undefined ? String(res).trim() : "";
      }
      return cell.text ? cell.text.trim() : "";
    });
    if (values.some((value) => value.length > 0)) rows.push(values);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function parseSurveyImportPayloadRows(csvText: string): SurveyImportPayloadRow[] {
  const rows = parseCsvContent(csvText);
  const headers = rows[0] ?? [];
  const keyByHeader = new Map<string, string>(
    SURVEY_IMPORT_COLUMNS.map((column) => [column.header, column.key])
  );
  return rows.slice(1).map((row) => {
    const result: SurveyImportPayloadRow = {};
    for (let index = 0; index < headers.length; index++) {
      const key = keyByHeader.get(headers[index] ?? "");
      if (key) result[key] = (row[index] ?? "").trim();
    }
    // If tax_assessment_option is empty and row is under review, standardize remarks to "Under review" for postgres RPC compatibility
    if (
      !result.tax_assessment_option &&
      result.remarks &&
      result.remarks.toLowerCase() !== "under review"
    ) {
      result.remarks = "Under review";
    }
    return result;
  });
}

/**
 * Standard CSV Template with realistic Vehari commercial survey records.
 */
export function generateSurveyCsvTemplate(): string {
  return createSurveyImportCsvTemplate();
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
  if (h.includes("taxpayername") || h.includes("proprietor")) return "tradeName";
  if (h === "division") return "division";
  if (h === "region") return "region";
  if (h === "district") return "district";
  if (h === "zone") return "zone";
  if (h === "tehsil") return "tehsil";
  if (h === "circle") return "circle";
  if (h === "locality") return "locality";
  if (h.includes("taxclass")) return "taxClass";
  if (h.includes("taxassessmentoption")) return "taxAssessmentOption";
  if (h.includes("financialyear")) return "financialYear";
  if (h.includes("taxpayerstatus")) return "taxpayerStatus";
  if (h === "remarks" || h === "remark") return "remarks";
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
  if (h.includes("schedulesubclass") || h.includes("subclasscode")) {
    return "scheduleSubclassCode";
  }
  if (h.includes("taxsubclass")) {
    return "taxSubclass";
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
  existingUnits: readonly StoredUnit[],
  officer?: MockOfficer | undefined
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

  if (dataRows.length > MAX_BULK_IMPORT_ROWS) {
    return {
      totalRows: dataRows.length,
      validRowsCount: 0,
      errorRowsCount: dataRows.length,
      duplicateCount: 0,
      rows: [
        {
          rowNumber: 1,
          rawData: {},
          status: "ERROR",
          errors: [
            `Upload exceeds maximum statutory batch limit of ${MAX_BULK_IMPORT_ROWS.toLocaleString()} records (found ${dataRows.length}).`
          ],
          warnings: []
        }
      ],
      validUnits: []
    };
  }

  // Build existing normalized identifier index
  const existingIdIndex = new Map<string, StoredUnit>();
  // Build existing circle-scoped legal name index
  const existingCircleLegalNameIndex = new Map<string, StoredUnit>();

  for (const u of existingUnits) {
    try {
      const norm = normalizeIdentifier(u.identifierType, u.identifierValue);
      existingIdIndex.set(norm, u);
    } catch {
      existingIdIndex.set(u.identifierValue.trim(), u);
    }

    if (u.legalName && u.circleId) {
      const normName = normalizeEntityLegalName(u.legalName);
      existingCircleLegalNameIndex.set(`${u.circleId}:${normName}`, u);
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
  // Track in-file circle-scoped legal names to catch intra-batch duplicate legal names
  const inBatchCircleLegalNameIndex = new Map<string, number>();

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
    const scheduleSubclassRaw = rowMap["scheduleSubclassCode"] ?? "";
    const taxAssessmentOptionRaw = rowMap["taxAssessmentOption"] ?? "";
    const taxSubclassRaw = rowMap["taxSubclass"] ?? "";
    const phone = rowMap["phone"] || undefined;
    const remarksRaw = (rowMap["remarks"] ?? "").trim();
    const isPendingClassificationReview =
      !taxAssessmentOptionRaw ||
      remarksRaw.toLowerCase().includes("review") ||
      remarksRaw.toLowerCase().includes("demolished") ||
      remarksRaw.toLowerCase().includes("mapping") ||
      remarksRaw.toLowerCase().includes("anomal");

    // 1. Validate Legal Name
    if (!legalName) {
      errors.push("Missing required field: Legal Name");
    }

    // 2. Validate Identifier Value & Infer Type
    let identifierType: "CNIC" | "NTN" = "CNIC";
    let normalizedId = "";
    let maskedId = "";

    if (!identifierValueRaw && identifierTypeRaw) {
      errors.push("Identifier Value is required when Identifier Type is supplied");
    } else if (identifierValueRaw) {
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

    // 4. Role & Jurisdiction Boundary Enforcement
    const jurisResult = validateOfficerImportJurisdiction(
      officer,
      rowMap["circle"],
      rowMap["district"] || rowMap["zone"],
      rowMap["division"] || rowMap["region"]
    );
    if (!jurisResult.allowed && jurisResult.error) {
      errors.push(jurisResult.error);
    }
    const resolvedCircle = jurisResult.resolvedCircle ?? DISTRICT_VEHARI_CIRCLES[0]!;
    const resolvedDistrict = jurisResult.resolvedDistrict;

    // 5. Validate Statutory Rule ID / Schedule Code

    // Multi-candidate statutory rule resolution
    const allRules = getAllStatutoryRules();
    function resolveStatutoryRuleCandidate(
      rawRuleId: string,
      subclassCode: string,
      assessmentOption: string,
      subclassLabel: string
    ): StatutoryRuleDefinition | undefined {
      if (rawRuleId) {
        let rule = getStatutoryRuleById(rawRuleId);
        if (rule) return rule;
        rule = getStatutoryRuleBySubclassification(rawRuleId);
        if (rule) return rule;

        // Extract code from full statutory citation like "Punjab Finance Act, 1977 - Section 3 / Second Schedule 1(iii)"
        const match = rawRuleId.match(/Second Schedule\s+([0-9]+(?:\([a-z0-9]+\))*)/i);
        if (match && match[1]) {
          rule = getStatutoryRuleBySubclassification(match[1]);
          if (rule) return rule;
          rule = getStatutoryRuleById(match[1]);
          if (rule) return rule;
          rule = getStatutoryRuleById(`PFT-${match[1]}`);
          if (rule) return rule;
        }
      }

      if (subclassCode) {
        let rule = getStatutoryRuleBySubclassification(subclassCode);
        if (rule) return rule;
        rule = getStatutoryRuleById(subclassCode);
        if (rule) return rule;
        rule = getStatutoryRuleById(`PFT-${subclassCode}`);
        if (rule) return rule;
      }

      if (assessmentOption) {
        const optionNorm = assessmentOption.split("|")[0]?.trim().toLowerCase();
        if (optionNorm) {
          const rule = allRules.find(
            (r) =>
              r.subclassification_label?.toLowerCase() === optionNorm ||
              r.official_text?.toLowerCase().includes(optionNorm)
          );
          if (rule) return rule;
        }
      }

      if (subclassLabel) {
        const labelNorm = subclassLabel.trim().toLowerCase();
        const rule = allRules.find((r) => r.subclassification_label?.toLowerCase() === labelNorm);
        if (rule) return rule;
      }

      return undefined;
    }

    const resolvedRule = resolveStatutoryRuleCandidate(
      statutoryRuleIdRaw,
      scheduleSubclassRaw,
      taxAssessmentOptionRaw,
      taxSubclassRaw
    );

    if (!resolvedRule) {
      if (statutoryRuleIdRaw || scheduleSubclassRaw) {
        errors.push(
          `Unrecognized Statutory Rule "${statutoryRuleIdRaw || scheduleSubclassRaw}". Must match Second Schedule (e.g., "PFT-6.x", "PFT-3.i.b", "PFT-10", "PFT-8", etc.)`
        );
      } else if (!isPendingClassificationReview) {
        errors.push("Missing required field: Statutory Rule / Tax Assessment Option");
      }
    }

    for (const [key, label] of [
      ["division", "Division"],
      ["region", "Region"],
      ["district", "District"],
      ["zone", "Zone"],
      ["taxClass", "Tax Class"],
      ["taxAssessmentOption", "Tax Assessment Option"],
      ["financialYear", "Financial Year"],
      ["taxpayerStatus", "Taxpayer Status"]
    ] as const) {
      if (
        normalizedHeaders.length === SURVEY_IMPORT_COLUMNS.length &&
        !rowMap[key] &&
        !(key === "taxAssessmentOption" && isPendingClassificationReview)
      ) {
        errors.push(`Missing required field: ${label}`);
      }
    }

    if (isPendingClassificationReview) {
      warnings.push(
        "Assessment classification is pending Inspector review; this row remains outside PFT-3 until classified, submitted, and approved."
      );
    }

    // 6. Duplicate Identification Checks
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

    // 7. Circle-scoped Legal Name Duplication Check
    // Duplication rules: already existing legal names in that circle must be discarded by flagging them
    if (legalName && resolvedCircle) {
      const normLegal = normalizeEntityLegalName(legalName);
      const circleKey = `${resolvedCircle.id}:${normLegal}`;

      const seenCircleRow = inBatchCircleLegalNameIndex.get(circleKey);
      if (seenCircleRow !== undefined) {
        errors.push(
          `Duplicate legal name in upload file: Legal name "${legalName}" already appeared on row ${seenCircleRow} for circle "${resolvedCircle.name}". Discarded per circle duplication rules.`
        );
        duplicateCount++;
      } else {
        inBatchCircleLegalNameIndex.set(circleKey, rowNumber);
      }

      const existingInCircle = existingCircleLegalNameIndex.get(circleKey);
      if (existingInCircle) {
        errors.push(
          `Duplicate legal name: Legal name "${legalName}" already exists in circle "${resolvedCircle.name}" (Record: ${existingInCircle.demandUnit?.permanentDemandNo || existingInCircle.assessmentNumber || existingInCircle.id}). Discarded per circle duplication rules.`
        );
        duplicateCount++;
      }
    }

    // 8. Name Similarity Candidate Check (Warning only for cross-circle or approximate matches)
    if (legalName) {
      const candidates = findDuplicateCandidates(
        {
          displayName: legalName,
          currentCircleId: resolvedCircle.id
        },
        existingTaxpayers
      );
      const highMatch = candidates.find((c) => c.confidence === "EXACT" || c.confidence === "HIGH");
      if (highMatch && !errors.some((e) => e.includes("Duplicate legal name"))) {
        warnings.push(
          `Similar business name found in system: "${highMatch.existingDisplayName}" (${highMatch.matchReason})`
        );
      }
    }

    const isValid = errors.length === 0;

    let parsedUnit: ValidSurveyUnit | undefined;
    if (isValid && resolvedRule) {
      const arrearsRaw = rowMap["arrears"] || rowMap["Arrears"] || "0";
      const openingArrears = Number.parseFloat(arrearsRaw) || 0;
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
        openingArrears,
        phone,
        circleId: resolvedCircle.id,
        circleName: resolvedCircle.name,
        districtName: resolvedDistrict
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
    const permanentDemandNo = String(sequenceNumber).padStart(4, "0");
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

    const unitCircleId = item.circleId || CIRCLE_VEHARI_ID;
    const unitCircleName =
      item.circleName || officer.jurisdictionName || "Vehari Circle I (City / Commercial)";
    const unitDistrictName = item.districtName || "Vehari";

    const unit: StoredUnit = {
      id: unitId,
      assessmentNumber: `ASM-${FINANCIAL_YEAR_2026_27.split("-")[1] ?? "2026"}-${String(sequenceNumber).padStart(4, "0")}`,
      demandNumber: undefined,
      pinNumber: undefined,
      locality: undefined,
      legalName: item.legalName,
      tradeName: item.tradeName,
      identifierType: item.identifierType,
      identifierValue: item.identifierValue,
      address: item.address,
      circleId: unitCircleId,
      circleName: unitCircleName,
      districtName: unitDistrictName,
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
      assessments: [draftAsm],
      assessmentVersions: [draftVer],
      ledgerEntries: [],
      openingArrears: item.openingArrears ?? 0,
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
    details: `Imported ${validUnits.length} survey units in Feeded / Draft status for ${officer.jurisdictionName || "Vehari Circle I (City / Commercial)"}. Total surveyed demand: PKR ${totalAssessedDemand.toLocaleString()}`
  };

  return {
    newUnits,
    auditItems: [auditItem]
  };
}

/**
 * PTAS Vehari Pilot: Standardized Bulk Import Rules & Jurisdiction Engine
 * Governed by:
 * - Rules 4, 5 & 11 of Punjab Professions & Trades Tax Rules 1977
 * - Second Schedule to Punjab Finance Act 1977
 * - Statutory Jurisdiction & Role Boundaries (Assigned Circle for Inspector, District & Sub-circles for ETO)
 * - Duplication Rules (CNIC/NTN duplicates & Circle-wise Legal Name duplication)
 */

import {
  CIRCLE_VEHARI_ID,
  CIRCLE_VEHARI_2_ID,
  CIRCLE_BUREWALA_ID,
  CIRCLE_MAILSI_ID,
  DISTRICT_VEHARI_CIRCLES,
  type CircleMasterRecord,
  type MockOfficer
} from "./pilot-store";

export const MAX_BULK_IMPORT_ROWS = 10000;

/**
 * Normalizes an entity's legal name for robust, circle-level duplicate detection.
 * Collapses whitespace, strips surrounding punctuation, and lowercases.
 */
export function normalizeEntityLegalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a raw circle string (from CSV/Excel column) to the authoritative CircleMasterRecord.
 */
export function resolveJurisdictionCircle(
  circleStr?: string | null,
  tehsilStr?: string | null,
  defaultCircleId?: string
): CircleMasterRecord | undefined {
  if (circleStr) {
    const raw = circleStr.trim().toLowerCase();

    // Check exact name match first
    const exact = DISTRICT_VEHARI_CIRCLES.find(
      (c) => c.name.toLowerCase() === raw || c.code.toLowerCase() === raw
    );
    if (exact) return exact;

    // Check distinctive keywords
    if (raw.includes("burewala")) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_BUREWALA_ID);
    }
    if (raw.includes("mailsi")) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_MAILSI_ID);
    }
    if (
      raw.includes("circle ii") ||
      raw.includes("circle 2") ||
      raw.includes("grain") ||
      raw.includes("rural") ||
      raw.includes("galla mandi")
    ) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_VEHARI_2_ID);
    }
    if (
      raw.includes("circle i") ||
      raw.includes("circle 1") ||
      raw.includes("city") ||
      raw.includes("commercial") ||
      raw.includes("club road")
    ) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_VEHARI_ID);
    }
  }

  // Fallback to tehsil matching if circle was unspecified
  if (tehsilStr) {
    const t = tehsilStr.trim().toLowerCase();
    if (t.includes("burewala")) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_BUREWALA_ID);
    }
    if (t.includes("mailsi")) {
      return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === CIRCLE_MAILSI_ID);
    }
  }

  // Fallback to default circle ID if provided
  if (defaultCircleId) {
    return DISTRICT_VEHARI_CIRCLES.find((c) => c.id === defaultCircleId);
  }

  return undefined;
}

export interface JurisdictionValidationResult {
  readonly allowed: boolean;
  readonly error?: string | undefined;
  readonly resolvedCircle?: CircleMasterRecord | undefined;
  readonly resolvedDistrict: string;
}

/**
 * Enforces role and jurisdiction boundaries on import rows:
 * - Inspector: Allowed to import ONLY records matching their assigned Circle.
 * - ETO: Allowed to import records matching their assigned District AND its sub-jurisdiction circles.
 * - Director / Admin: Allowed across division/province jurisdiction.
 */
export function validateOfficerImportJurisdiction(
  officer: MockOfficer | undefined,
  rowCircleStr?: string | null,
  rowDistrictStr?: string | null,
  rowDivisionStr?: string | null
): JurisdictionValidationResult {
  // If no officer context is supplied (e.g. legacy batch tests), resolve circle gracefully
  if (!officer) {
    const fallbackCircle =
      resolveJurisdictionCircle(rowCircleStr, undefined, CIRCLE_VEHARI_ID) ??
      DISTRICT_VEHARI_CIRCLES[0]!;
    return {
      allowed: true,
      resolvedCircle: fallbackCircle,
      resolvedDistrict: rowDistrictStr?.trim() || "Vehari"
    };
  }

  const normalizedDistrict = (rowDistrictStr ?? "").trim().toLowerCase();
  const normalizedDivision = (rowDivisionStr ?? "").trim().toLowerCase();

  // 1. Division / District sanity check
  if (
    normalizedDivision &&
    !normalizedDivision.includes("multan") &&
    !normalizedDivision.includes("punjab")
  ) {
    return {
      allowed: false,
      error: `Jurisdiction mismatch: Division "${rowDivisionStr}" is outside Punjab / Multan Division jurisdiction.`,
      resolvedDistrict: rowDistrictStr?.trim() || "Unknown"
    };
  }

  if (normalizedDistrict && !normalizedDistrict.includes("vehari")) {
    return {
      allowed: false,
      error: `Jurisdiction mismatch: District "${rowDistrictStr}" is outside Vehari pilot jurisdiction.`,
      resolvedDistrict: rowDistrictStr?.trim() || "Unknown"
    };
  }

  // 2. Resolve target circle
  const defaultCircleForInspector =
    officer.role === "INSPECTOR" ? officer.jurisdictionId : undefined;
  const resolvedCircle = resolveJurisdictionCircle(
    rowCircleStr,
    undefined,
    defaultCircleForInspector
  );

  // 3. Role-specific jurisdiction constraints
  if (officer.role === "INSPECTOR") {
    // Inspector is restricted to their assigned circle
    const inspectorCircle = DISTRICT_VEHARI_CIRCLES.find(
      (c) =>
        c.id === officer.jurisdictionId ||
        c.name.toLowerCase() === officer.jurisdictionName.toLowerCase()
    );

    // If row explicitly supplied a circle that does not resolve or match the inspector's circle:
    if (rowCircleStr && rowCircleStr.trim()) {
      if (!resolvedCircle) {
        return {
          allowed: false,
          error: `Unrecognized Circle "${rowCircleStr}". Inspector ${officer.name} may only import records for assigned circle "${officer.jurisdictionName}".`,
          resolvedDistrict: "Vehari"
        };
      }

      if (inspectorCircle && resolvedCircle.id !== inspectorCircle.id) {
        return {
          allowed: false,
          error: `Jurisdiction mismatch: Inspector ${officer.name} is assigned to "${officer.jurisdictionName}". Cannot import record for Circle "${resolvedCircle.name}".`,
          resolvedCircle,
          resolvedDistrict: "Vehari"
        };
      }
    }

    const effectiveCircle = resolvedCircle ?? inspectorCircle ?? DISTRICT_VEHARI_CIRCLES[0]!;
    return {
      allowed: true,
      resolvedCircle: effectiveCircle,
      resolvedDistrict: "Vehari"
    };
  }

  if (officer.role === "ETO") {
    // ETO is authorized for District Vehari and all its sub-jurisdiction circles
    if (!resolvedCircle) {
      if (rowCircleStr && rowCircleStr.trim()) {
        return {
          allowed: false,
          error: `Jurisdiction mismatch: Circle "${rowCircleStr}" is outside District Vehari sub-jurisdiction circles.`,
          resolvedDistrict: "Vehari"
        };
      }
      // If circle is omitted in ETO import row, require explicit circle assignment
      return {
        allowed: false,
        error:
          "Missing circle: Assessing Authority (ETO) import requires explicit Circle identification for each record.",
        resolvedDistrict: "Vehari"
      };
    }

    // Verify resolved circle belongs to Vehari District circles
    const isVehariCircle = DISTRICT_VEHARI_CIRCLES.some((c) => c.id === resolvedCircle.id);
    if (!isVehariCircle) {
      return {
        allowed: false,
        error: `Jurisdiction mismatch: Circle "${resolvedCircle.name}" is outside District Vehari sub-jurisdiction circles.`,
        resolvedCircle,
        resolvedDistrict: "Vehari"
      };
    }

    return {
      allowed: true,
      resolvedCircle,
      resolvedDistrict: "Vehari"
    };
  }

  // Director / Admin role: allow across all Vehari circles
  const effectiveCircle = resolvedCircle ?? DISTRICT_VEHARI_CIRCLES[0]!;
  return {
    allowed: true,
    resolvedCircle: effectiveCircle,
    resolvedDistrict: "Vehari"
  };
}

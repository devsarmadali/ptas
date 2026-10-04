import type {
  Assessment,
  AssessmentVersion,
  DemandLedgerEntry,
  DemandLedgerEntryType,
  StatutoryRuleDefinition
} from "@ptas/domain";
import type { Json } from "@ptas/database/types";
import type { StoredUnit, StoredUnitSnapshot } from "./pilot-store";
import { getSupabaseAuthClient, resolveAuthenticatedOfficer } from "./supabase-auth";
import type { MockOfficer } from "./pilot-store";

const ASSESSMENT_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "HEARING_RECORDED",
  "APPROVED",
  "REVISION_DRAFT",
  "RESUBMITTED",
  "DECISION_REQUESTED",
  "WITHDRAWN",
  "ADJUSTED"
]);

const LEDGER_ENTRY_TYPES = new Set([
  "ASSESSMENT_DEMAND",
  "REVISION_ADJUSTMENT",
  "PENALTY_DEMAND",
  "MANUAL_ADJUSTMENT",
  "PAYMENT_CREDIT",
  "REVERSAL"
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asPublicBusinessIdentifier(value: unknown): string | undefined {
  const identifier = asOptionalString(value)?.trim();
  return identifier && !UUID_PATTERN.test(identifier) ? identifier : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function mapAssessmentStatus(value: unknown, surveyState: string) {
  const status = asString(value);
  if (ASSESSMENT_STATUSES.has(status)) {
    return status as Assessment["status"];
  }
  if (surveyState === "SUBMITTED") return "SUBMITTED" as const;
  if (surveyState === "RETURNED") return "RETURNED" as const;
  if (surveyState === "APPROVED") return "APPROVED" as const;
  return "DRAFT" as const;
}

function mapRule(value: unknown): StatutoryRuleDefinition {
  const row = asRecord(value);
  const ruleId = asString(row.statutory_rule_id, "PENDING_CLASSIFICATION");
  const classCode = asString(row.primary_class_code, "PENDING");
  const subclassCode = asOptionalString(row.schedule_subclass_code);
  const taxClass = asString(row.tax_class, "Pending statutory classification");
  const taxSubclass = asString(row.tax_subclass, "Under review");

  return {
    rule_id: ruleId,
    rule_code: classCode,
    category_code: classCode,
    category: taxClass,
    subcategory: taxSubclass,
    subclassification_code: subclassCode ?? null,
    subclassification_label: taxSubclass,
    statutory_tertiary_code: null,
    statutory_tertiary_classification: null,
    official_text: ruleId,
    annual_rate_pkr: asNumber(row.assessment_rate),
    rate_basis: asString(row.rate_basis, "Pending review"),
    criteria: [],
    source_page: 0,
    notes: asString(row.approval_identifier),
    rate_source_level: subclassCode ? "subclassification" : "category",
    assigned_code: subclassCode ?? classCode,
    assigned_code_level: subclassCode ? "subclass" : "class"
  };
}

function mapLedgerEntry(value: unknown): DemandLedgerEntry | null {
  const row = asRecord(value);
  const entryType = asString(row.entry_type);
  if (!LEDGER_ENTRY_TYPES.has(entryType)) return null;

  return {
    id: asString(row.id),
    demandUnitId: asString(row.demand_unit_id),
    financialYearId: asString(row.financial_year_id),
    entryType: entryType as DemandLedgerEntryType,
    amount: asNumber(row.amount),
    sourceType: asString(row.source_type),
    sourceId: asString(row.source_id),
    reversesEntryId: asOptionalString(row.reverses_entry_id),
    idempotencyKey: asString(row.idempotency_key),
    correlationId: asString(row.correlation_id),
    postedBy: asString(row.posted_by),
    postedAt: asString(row.posted_at),
    metadata: asRecord(row.metadata)
  };
}

export function mapOperationalUnit(value: unknown): StoredUnit {
  const row = asRecord(value);
  const taxpayer = asRecord(row.taxpayer);
  const identifier = asRecord(row.identifier);
  const profile = asRecord(row.profile);
  const jurisdiction = asRecord(row.jurisdiction);
  const assessmentRow = asRecord(row.assessment);
  const versionRow = asRecord(row.assessment_version);
  const demandRow = asRecord(row.demand_unit);
  const surveyState = asString(row.state);
  const rule = mapRule(row.classification);
  const unitId = asString(row.id);
  const taxpayerId = asString(row.taxpayer_id);
  const financialYearId = asString(row.financial_year_id);
  const createdAt = asString(row.created_at);
  const assessmentStatus = mapAssessmentStatus(assessmentRow.status, surveyState);
  const assessmentId = asString(assessmentRow.id, `pending-assessment:${unitId}`);
  const snapshotRow = asRecord(versionRow.snapshot);
  const snapshot: StoredUnitSnapshot = {
    ...snapshotRow,
    taxAmount: asNumber(snapshotRow.taxAmount ?? snapshotRow.assessment_rate, rule.annual_rate_pkr),
    statutoryCategory: asString(snapshotRow.statutoryCategory, rule.category),
    legalBasis: asString(snapshotRow.legalBasis, rule.official_text),
    ruleId: asString(snapshotRow.ruleId, rule.rule_id),
    ruleCode: asString(snapshotRow.ruleCode, rule.rule_code),
    subclassificationCode:
      asOptionalString(snapshotRow.subclassificationCode) ?? rule.subclassification_code,
    statutoryTertiaryCode:
      asOptionalString(snapshotRow.statutoryTertiaryCode) ?? rule.statutory_tertiary_code,
    rateSourceLevel: rule.rate_source_level,
    tertiaryDimensions: asStringRecord(snapshotRow.tertiaryDimensions)
  };

  const assessment: Assessment = {
    id: assessmentId,
    taxpayerId,
    financialYearId,
    status: assessmentStatus,
    currentVersionNo: asNumber(assessmentRow.current_version_no, 1),
    createdBy: asString(assessmentRow.created_by, asString(row.responsible_inspector_id)),
    createdAt: asString(assessmentRow.created_at, createdAt)
  };

  const version: AssessmentVersion<StoredUnitSnapshot> = {
    id: asString(versionRow.id, `pending-version:${unitId}`),
    assessmentId,
    versionNo: asNumber(versionRow.version_no, 1),
    snapshot,
    status: mapAssessmentStatus(versionRow.status, surveyState),
    reason: asOptionalString(versionRow.reason) ?? asOptionalString(profile.remarks),
    createdBy: asString(versionRow.created_by, assessment.createdBy),
    createdAt: asString(versionRow.created_at, assessment.createdAt),
    approvedBy: asOptionalString(versionRow.approved_by),
    approvedAt: asOptionalString(versionRow.approved_at),
    approvalEvidenceId: asOptionalString(versionRow.approval_evidence_id)
  };

  const rawPdn = asOptionalString(taxpayer.permanent_demand_no);
  const rawLegacy = asOptionalString(profile.legacy_demand_no);
  const rawDemandRowPdn = asOptionalString(demandRow.permanent_demand_no);

  const isUinPattern = (val?: string | null): boolean =>
    typeof val === "string" && /^\d{3}-/.test(val) && val.length >= 15;

  const pinNumber = rawPdn?.startsWith("PIN-")
    ? rawPdn
    : (asOptionalString(profile.pin_number) ?? undefined);

  const provincialUin =
    (isUinPattern(rawPdn) ? rawPdn : null) ??
    (isUinPattern(rawLegacy) ? rawLegacy : null) ??
    (isUinPattern(rawDemandRowPdn) ? rawDemandRowPdn : null) ??
    (rawPdn?.startsWith("PIN-") ? rawPdn : null) ??
    (isUinPattern(asOptionalString(profile.provincial_uin))
      ? asString(profile.provincial_uin)
      : null) ??
    "";

  const demandNumber =
    (!isUinPattern(rawLegacy) ? rawLegacy : null) ??
    (!isUinPattern(rawDemandRowPdn) ? rawDemandRowPdn : null) ??
    (!isUinPattern(rawPdn) && !rawPdn?.startsWith("PIN-") ? rawPdn : null) ??
    rawLegacy ??
    rawDemandRowPdn;

  const demandUnitId = asString(demandRow.id, `pending-demand:${unitId}`);
  const ledgerEntries = Array.isArray(row.ledger_entries)
    ? row.ledger_entries
        .map(mapLedgerEntry)
        .filter((entry): entry is DemandLedgerEntry => entry !== null)
    : [];

  const rawAddress = asString(profile.commercial_address);
  const locality = asOptionalString(profile.locality);
  const cleanAddress = rawAddress.replace(/\s*•\s*Locality:\s*.*$/i, "").trim();

  return {
    id: unitId,
    legalName: asString(profile.legal_name, asString(taxpayer.display_name)),
    tradeName: asOptionalString(profile.taxpayer_name),
    identifierType: asString(identifier.type).toUpperCase() === "CNIC" ? "CNIC" : "NTN",
    identifierValue: asString(identifier.value),
    address: cleanAddress || rawAddress,
    locality,
    circleId: asString(row.jurisdiction_id),
    categoryCode: rule.category_code,
    subclassificationCode: rule.subclassification_code,
    statutoryTertiaryCode: rule.statutory_tertiary_code,
    statutoryRuleId: rule.rule_id,
    statutoryRule: rule,
    assessmentNumber:
      asPublicBusinessIdentifier(assessmentRow.assessment_number) ??
      asPublicBusinessIdentifier(profile.assessment_number) ??
      "",
    demandNumber,
    pinNumber,
    provincialUin,
    circleName: asOptionalString(jurisdiction.name),
    districtName:
      asOptionalString(jurisdiction.district_name) ??
      asOptionalString(jurisdiction.parent_name) ??
      "Vehari",
    pft3Registered: row.pft3_registered === true,
    demandUnit: {
      id: demandUnitId,
      taxpayerId,
      permanentDemandNo: demandNumber ?? "",
      createdAt: asString(demandRow.created_at, createdAt)
    },
    assessments: [assessment],
    assessmentVersions: [version],
    ledgerEntries,
    openingArrears: asNumber(profile.opening_arrears ?? profile.arrears, 0),
    createdAt
  };
}

export async function loadOperationalSurveyUnits(): Promise<StoredUnit[]> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("list_operational_survey_units");
  if (error) {
    throw new Error(`Unable to load operational survey units: ${error.message}`);
  }
  if (!Array.isArray(data)) {
    if (data === null) return [];
    throw new Error("Operational survey query returned an invalid response");
  }
  return (data as Json[]).map(mapOperationalUnit);
}

export async function loadOperationalContext(): Promise<{
  readonly officer: MockOfficer;
  readonly units: StoredUnit[];
}> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Unable to load operational context: authenticated PTAS session required");
  }

  const [officer, units] = await Promise.all([
    resolveAuthenticatedOfficer(data.user),
    loadOperationalSurveyUnits()
  ]);
  return { officer, units };
}

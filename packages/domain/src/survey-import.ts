export const SURVEY_IMPORT_COLUMNS = [
  { header: "Survey No. (Auto)", key: "survey_no", mode: "SERVER_DERIVED" },
  { header: "Division", key: "division", mode: "INPUT" },
  { header: "Region", key: "region", mode: "INPUT" },
  { header: "District", key: "district", mode: "INPUT" },
  { header: "Zone", key: "zone", mode: "INPUT" },
  { header: "Tehsil", key: "tehsil", mode: "OPTIONAL_INPUT" },
  { header: "Circle", key: "circle", mode: "OPTIONAL_INPUT" },
  { header: "Locality", key: "locality", mode: "OPTIONAL_INPUT" },
  { header: "Commercial Address", key: "commercial_address", mode: "INPUT" },
  { header: "Legal Name / Entity Name", key: "legal_name", mode: "INPUT" },
  { header: "Taxpayer Name / Proprietor", key: "taxpayer_name", mode: "OPTIONAL_INPUT" },
  { header: "Identifier Type", key: "identifier_type", mode: "OPTIONAL_INPUT" },
  { header: "Identifier Value", key: "identifier_value", mode: "OPTIONAL_INPUT" },
  { header: "Phone", key: "phone", mode: "OPTIONAL_INPUT" },
  { header: "Email", key: "email", mode: "OPTIONAL_INPUT" },
  { header: "Tax Class (Select)", key: "tax_class", mode: "INPUT" },
  {
    header: "Tax Assessment Option (Select)",
    key: "tax_assessment_option",
    mode: "INPUT"
  },
  { header: "Tax Sub-Class (Auto)", key: "tax_subclass", mode: "SERVER_DERIVED" },
  {
    header: "Statutory Assessment Rate (PKR) (Auto)",
    key: "assessment_rate",
    mode: "SERVER_DERIVED"
  },
  { header: "Primary Class Code (Auto)", key: "primary_class_code", mode: "SERVER_DERIVED" },
  {
    header: "Schedule Sub-Class Code (Auto)",
    key: "schedule_subclass_code",
    mode: "SERVER_DERIVED"
  },
  { header: "Rate Basis (Auto)", key: "rate_basis", mode: "SERVER_DERIVED" },
  { header: "Statutory Rule ID (Auto)", key: "statutory_rule_id", mode: "SERVER_DERIVED" },
  { header: "Financial Year (Auto)", key: "financial_year", mode: "SERVER_DERIVED" },
  { header: "Survey Date (Auto)", key: "survey_date", mode: "SERVER_DERIVED" },
  { header: "Taxpayer Status", key: "taxpayer_status", mode: "INPUT" },
  { header: "Legacy Demand No", key: "legacy_demand_no", mode: "OPTIONAL_INPUT" },
  { header: "Arrears", key: "arrears", mode: "OPTIONAL_INPUT" },
  { header: "Remarks", key: "remarks", mode: "OPTIONAL_INPUT" },
  { header: "Import Status (Auto)", key: "import_status", mode: "SERVER_DERIVED" }
] as const;

export type SurveyImportColumn = (typeof SURVEY_IMPORT_COLUMNS)[number];
export type SurveyImportKey = SurveyImportColumn["key"];

export const SURVEY_IMPORT_HEADERS = SURVEY_IMPORT_COLUMNS.map((column) => column.header);

export const SURVEY_IMPORT_REQUIRED_INPUT_KEYS = [
  "division",
  "region",
  "district",
  "zone",
  "commercial_address",
  "legal_name",
  "tax_class",
  "tax_assessment_option",
  "taxpayer_status"
] as const satisfies readonly SurveyImportKey[];

export function createSurveyImportCsvTemplate(): string {
  return `\uFEFF${SURVEY_IMPORT_HEADERS.join(",")}\r\n`;
}

export function isExactSurveyImportHeader(headers: readonly string[]): boolean {
  return (
    headers.length === SURVEY_IMPORT_HEADERS.length &&
    headers.every((header, index) => header.trim() === SURVEY_IMPORT_HEADERS[index])
  );
}

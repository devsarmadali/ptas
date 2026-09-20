import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const v3 = JSON.parse(
  fs.readFileSync(path.join(rootDir, "punjab_professional_tax_rules_v3.json"), "utf8")
);

const tsContent = `/**
 * Punjab Professional Tax - Second Schedule Statutory Rate Rules (v3.0.0)
 * Canonical machine-readable rule definitions generated from punjab_professional_tax_rules_v3.json.
 */

export interface StatutoryCriterionV3 {
  readonly field: string;
  readonly operator: string;
  readonly value: string | number | boolean | readonly string[];
}

export interface StatutoryTertiaryItemV3 {
  readonly tertiary_code: string;
  readonly tertiary_classification: string;
  readonly annual_rate_pkr: number;
  readonly rule_code: string;
  readonly criteria: readonly StatutoryCriterionV3[];
  readonly source_page: number;
}

export interface StatutorySubclassificationV3 {
  readonly subclassification_code: string;
  readonly subclassification: string;
  readonly analytic_tertiary_dimension_ids: readonly string[];
  readonly statutory_tertiary_classifications: readonly StatutoryTertiaryItemV3[];
  readonly rate_determined_by?: string | null | undefined;
  readonly annual_rate_pkr?: number | null | undefined;
  readonly rule_code?: string | null | undefined;
  readonly criteria?: readonly StatutoryCriterionV3[] | undefined;
  readonly source_page?: number | null | undefined;
}

export interface StatutoryCategoryV3 {
  readonly category_code: string;
  readonly category: string;
  readonly category_level_analytic_tertiary_dimension_ids: readonly string[];
  readonly subclassifications: readonly StatutorySubclassificationV3[];
  readonly direct_annual_rate_pkr?: number | null | undefined;
  readonly direct_rule_code?: string | null | undefined;
  readonly direct_criteria?: readonly StatutoryCriterionV3[] | undefined;
  readonly source_page?: number | null | undefined;
}

export interface AssessmentRuleV3 {
  readonly rule_code: string;
  readonly rule_id: string;
  readonly category_code: string;
  readonly category: string;
  readonly subclassification_code: string | null;
  readonly subclassification: string | null;
  readonly statutory_tertiary_code: string | null;
  readonly statutory_tertiary_classification: string | null;
  readonly analytic_tertiary_dimension_ids: readonly string[];
  readonly annual_rate_pkr: number;
  readonly rate_basis: string;
  readonly criteria: readonly StatutoryCriterionV3[];
  readonly official_text: string;
  readonly source_page: number;
  readonly notes: string;
}

export interface TertiaryTaxonomyEntryV3 {
  readonly tertiary_code: string;
  readonly code_type: "statutory" | "synthetic_analytic";
  readonly parent_category_code: string;
  readonly parent_subclassification_code: string | null;
  readonly dimension: string;
  readonly tertiary_classification: string;
  readonly source_term: string;
  readonly aliases: readonly string[];
  readonly rate_effect: "determines_rate" | "none" | "qualifies_entry";
  readonly annual_rate_pkr?: number | null | undefined;
  readonly required_for_rate?: boolean | null | undefined;
  readonly source_page?: number | null | undefined;
  readonly notes?: string | undefined;
}

export interface AnalyticTertiaryOptionV3 {
  readonly tertiary_code: string;
  readonly tertiary_classification: string;
  readonly source_term: string;
  readonly aliases: readonly string[];
}

export interface AnalyticTertiaryDimensionV3 {
  readonly dimension_id: string;
  readonly parent_category_code: string;
  readonly parent_subclassification_code: string | null;
  readonly dimension: string;
  readonly code_type: "synthetic_analytic";
  readonly required_when_identifiable: boolean;
  readonly multi_select: boolean;
  readonly rate_effect: "none";
  readonly notes: string;
  readonly options: readonly AnalyticTertiaryOptionV3[];
}

export const CATEGORIES_V3: readonly StatutoryCategoryV3[] = ${JSON.stringify(v3.categories, null, 2)} as const;

export const ASSESSMENT_RULES_V3: readonly AssessmentRuleV3[] = ${JSON.stringify(v3.assessment_rules, null, 2)} as const;

export const TERTIARY_TAXONOMY_V3: readonly TertiaryTaxonomyEntryV3[] = ${JSON.stringify(v3.tertiary_taxonomy, null, 2)} as const;

export const ANALYTIC_TERTIARY_DIMENSIONS_V3: readonly AnalyticTertiaryDimensionV3[] = ${JSON.stringify(v3.analytic_tertiary_dimensions, null, 2)} as const;
`;

const targetPath = path.join(rootDir, "packages", "domain", "src", "statutory-rules-v3-data.ts");
fs.writeFileSync(targetPath, tsContent, "utf8");
console.log(`Successfully generated ${targetPath}`);

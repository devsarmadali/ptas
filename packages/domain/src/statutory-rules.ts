/**
 * Punjab Professional Tax - Second Schedule Statutory Rate Rules
 * Source: Punjab Finance Act 1977 (Second Schedule, Section 3)
 * Governs all official statutory rates, classifications, and eligibility criteria.
 */

import {
  STATUTORY_RULES_DATA,
  type StatutoryCriterion,
  type StatutoryRuleDefinition
} from "./statutory-rules-data";

export type { StatutoryCriterion, StatutoryRuleDefinition };

export interface StatutoryCategorySummary {
  readonly category_code: string;
  readonly category_name: string;
  readonly rule_count: number;
}

export type LocationScope = "METROPOLITAN_OR_MUNICIPAL_CORPORATION" | "OTHER";

export interface TaxpayerAssessmentCriteria {
  readonly categoryCode: string;
  readonly ruleId?: string | undefined;
  readonly isCompany?: boolean | undefined;
  readonly paidUpCapitalPkr?: number | undefined;
  readonly employeeCount?: number | undefined;
  readonly locationScope?: LocationScope | undefined;
  readonly importExportValuePkr?: number | undefined;
  readonly supplyContractValuePkr?: number | undefined;
  readonly professionType?: string | undefined;
  readonly hasAirConditioning?: boolean | undefined;
  readonly hasAssessedIncomeTax?: boolean | undefined;
}

/**
 * Returns all 47 official statutory rules from the Second Schedule.
 */
export function getAllStatutoryRules(): readonly StatutoryRuleDefinition[] {
  return STATUTORY_RULES_DATA;
}

/**
 * Returns summaries of all 11 statutory categories.
 */
export function getStatutoryCategories(): readonly StatutoryCategorySummary[] {
  const categoryMap = new Map<string, { name: string; count: number }>();

  for (const rule of STATUTORY_RULES_DATA) {
    const existing = categoryMap.get(rule.category_code);
    if (existing) {
      existing.count += 1;
    } else {
      categoryMap.set(rule.category_code, {
        name: rule.category,
        count: 1
      });
    }
  }

  const result: StatutoryCategorySummary[] = [];
  for (const [code, info] of categoryMap.entries()) {
    result.push({
      category_code: code,
      category_name: info.name,
      rule_count: info.count
    });
  }

  // Sort by integer category code
  return result.sort((a, b) => parseInt(a.category_code, 10) - parseInt(b.category_code, 10));
}

/**
 * Returns all statutory rules belonging to a specific schedule category (e.g. "1", "3", "6").
 */
export function getRulesByCategory(categoryCode: string): readonly StatutoryRuleDefinition[] {
  const trimmed = categoryCode.trim();
  return STATUTORY_RULES_DATA.filter((r) => r.category_code === trimmed);
}

/**
 * Finds a rule by its unique statutory machine key (e.g. "PFT-1.i", "PFT-3.i.b", "PFT-6.x").
 */
export function getStatutoryRuleById(ruleId: string): StatutoryRuleDefinition | undefined {
  const trimmed = ruleId.trim();
  return STATUTORY_RULES_DATA.find((r) => r.rule_id === trimmed);
}

/**
 * Finds a rule by its printed schedule subclassification code (e.g. "1(i)", "3(i)(b)", "6(x)").
 */
export function getStatutoryRuleBySubclassification(
  subclassificationCode: string
): StatutoryRuleDefinition | undefined {
  const trimmed = subclassificationCode.trim();
  return STATUTORY_RULES_DATA.find((r) => r.subclassification_code === trimmed);
}

/**
 * Evaluates the statutory tax rate (PKR per annum) for a given rule ID.
 * Throws an error if the rule ID does not exist in the official Second Schedule.
 */
export function evaluateStatutoryRate(ruleId: string): number {
  const rule = getStatutoryRuleById(ruleId);
  if (!rule) {
    throw new Error(`Statutory rule '${ruleId}' does not exist in the official Second Schedule`);
  }
  return rule.annual_rate_pkr;
}

/**
 * Resolves the applicable statutory rule based on assessment parameters.
 * If ruleId is explicitly specified and valid, it returns that rule directly.
 */
export function matchStatutoryRule(
  criteria: TaxpayerAssessmentCriteria
): StatutoryRuleDefinition | undefined {
  if (criteria.ruleId) {
    return getStatutoryRuleById(criteria.ruleId);
  }

  const categoryRules = getRulesByCategory(criteria.categoryCode);
  if (categoryRules.length === 0) {
    return undefined;
  }

  // If category has only 1 rule (e.g. Category 7, 8, 9, 10, 11), return it immediately
  if (categoryRules.length === 1) {
    return categoryRules[0];
  }

  // Category 1: Companies (criteria: paid_up_capital_pkr)
  if (criteria.categoryCode === "1" && criteria.paidUpCapitalPkr !== undefined) {
    const cap = criteria.paidUpCapitalPkr;
    if (cap <= 5000000) return getStatutoryRuleById("PFT-1.i");
    if (cap <= 50000000) return getStatutoryRuleById("PFT-1.ii");
    if (cap <= 100000000) return getStatutoryRuleById("PFT-1.iii");
    if (cap <= 200000000) return getStatutoryRuleById("PFT-1.iv");
    return getStatutoryRuleById("PFT-1.v");
  }

  // Category 2: Factories (criteria: employee_count)
  if (criteria.categoryCode === "2" && criteria.employeeCount !== undefined) {
    const emp = criteria.employeeCount;
    if (emp <= 10) return getStatutoryRuleById("PFT-2.i");
    if (emp <= 25) return getStatutoryRuleById("PFT-2.ii");
    return getStatutoryRuleById("PFT-2.iii");
  }

  // Category 3: Commercial Establishments
  // 3(i)(a): 10+ emp, Metro/MC (Rs 6,000)
  // 3(i)(b): 10+ emp, Others (Rs 4,000)
  // 3(ii): All others (Rs 2,000)
  if (criteria.categoryCode === "3") {
    const emp = criteria.employeeCount ?? 0;
    const loc = criteria.locationScope ?? "OTHER";
    if (emp >= 10) {
      if (loc === "METROPOLITAN_OR_MUNICIPAL_CORPORATION") {
        return getStatutoryRuleById("PFT-3.i.a");
      }
      return getStatutoryRuleById("PFT-3.i.b");
    }
    return getStatutoryRuleById("PFT-3.ii");
  }

  // Category 4: Importers / Exporters
  if (criteria.categoryCode === "4" && criteria.importExportValuePkr !== undefined) {
    const val = criteria.importExportValuePkr;
    if (val <= 1000000) return getStatutoryRuleById("PFT-4.i");
    if (val <= 5000000) return getStatutoryRuleById("PFT-4.ii");
    return getStatutoryRuleById("PFT-4.iii");
  }

  // Category 5: Contractors / Builders
  if (criteria.categoryCode === "5" && criteria.supplyContractValuePkr !== undefined) {
    const val = criteria.supplyContractValuePkr;
    if (val <= 1000000) return getStatutoryRuleById("PFT-5.i");
    if (val <= 10000000) return getStatutoryRuleById("PFT-5.ii");
    if (val <= 50000000) return getStatutoryRuleById("PFT-5.iii");
    return getStatutoryRuleById("PFT-5.iv");
  }

  // Default to the first subclassification of the category if ambiguous
  return categoryRules[0];
}

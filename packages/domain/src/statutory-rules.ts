/**
 * Punjab Professional Tax - Second Schedule Statutory Rate Rules (v3.0.0)
 * Source: Punjab Finance Act 1977 (Second Schedule, Section 3)
 * Canonical machine-readable classification and current-year statutory assessment engine.
 */

import {
  ASSESSMENT_RULES_V3,
  CATEGORIES_V3,
  TERTIARY_TAXONOMY_V3,
  ANALYTIC_TERTIARY_DIMENSIONS_V3,
  type AssessmentRuleV3,
  type StatutoryCategoryV3,
  type StatutoryCriterionV3,
  type StatutorySubclassificationV3,
  type TertiaryTaxonomyEntryV3,
  type AnalyticTertiaryDimensionV3
} from "./statutory-rules-v3-data.js";

export type {
  AssessmentRuleV3,
  StatutoryCategoryV3,
  StatutoryCriterionV3,
  StatutorySubclassificationV3,
  TertiaryTaxonomyEntryV3,
  AnalyticTertiaryDimensionV3
};

export type RateSourceLevel = "category" | "subclassification" | "statutory_tertiary";

export type AssignedCodeLevel = "class" | "subclass" | "tertiary";

export type ClassificationStatus = "resolved" | "review_required" | "unresolved";

export type LocationScope = "METROPOLITAN_OR_MUNICIPAL_CORPORATION" | "OTHER";

export interface AnalyticTertiaryAllocation {
  readonly code: string;
  readonly label: string;
  readonly dimension: string;
  readonly type: "analytic";
}

export interface StatutoryTertiaryAllocation {
  readonly code: string;
  readonly label: string;
  readonly dimension: string;
  readonly type: "statutory";
}

export interface TertiaryDimensions {
  readonly profession_type?: AnalyticTertiaryAllocation | undefined;
  readonly location_scope?: StatutoryTertiaryAllocation | undefined;
  readonly trade_direction?: AnalyticTertiaryAllocation | undefined;
  readonly business_type?: AnalyticTertiaryAllocation | undefined;
  readonly dealer_type?: AnalyticTertiaryAllocation | undefined;
  readonly entity_type?: AnalyticTertiaryAllocation | undefined;
  readonly transport_type?: AnalyticTertiaryAllocation | undefined;
  readonly establishment_type?: AnalyticTertiaryAllocation | undefined;
  readonly trade_level?: AnalyticTertiaryAllocation | undefined;
  readonly business_role?: AnalyticTertiaryAllocation | undefined;
  readonly property_business_role?: AnalyticTertiaryAllocation | undefined;
  readonly lodging_type?: AnalyticTertiaryAllocation | undefined;
  readonly food_establishment_type?: AnalyticTertiaryAllocation | undefined;
  readonly engagement_basis?: AnalyticTertiaryAllocation | undefined;
  readonly [dimension: string]:
    AnalyticTertiaryAllocation | StatutoryTertiaryAllocation | undefined;
}

export interface ResolvedClassification {
  readonly category_code: string;
  readonly category_label: string;
  readonly subclassification_code: string | null;
  readonly subclassification_label: string | null;
  readonly statutory_tertiary_code: string | null;
  readonly statutory_tertiary_label: string | null;
  readonly tertiary_dimensions: TertiaryDimensions;
  readonly criteria: Record<string, unknown>;
  readonly annual_rate_pkr: number | null;
  readonly current_year_assessment_pkr: number | null;
  readonly rate_source_level: RateSourceLevel | null;
  readonly classification_status: ClassificationStatus;
  readonly classification_confidence: number;
  readonly classification_note?: string | undefined;
  readonly rule_id: string | null;
  readonly rule_code: string | null;
  readonly assigned_code: string | null;
  readonly assigned_code_level: AssignedCodeLevel | null;
}

export interface TaxpayerClassificationInput {
  readonly rawInput?: Record<string, unknown> | undefined;
  readonly categoryCode?: string | undefined;
  readonly subclassificationCode?: string | undefined;
  readonly statutoryTertiaryCode?: string | undefined;
  readonly ruleId?: string | undefined;
  readonly ruleCode?: string | undefined;
  readonly assignedCode?: string | undefined;

  // Specific entity facts
  readonly isCompany?: boolean | undefined;
  readonly paidUpCapitalPkr?: number | undefined;
  readonly employeeCount?: number | undefined;
  readonly locationScope?: LocationScope | undefined;
  readonly importExportValuePkr?: number | undefined;
  readonly supplyContractValuePkr?: number | undefined;

  // Analytic / profession / establishment facts
  readonly professionType?: string | undefined;
  readonly entityType?: string | undefined;
  readonly businessType?: string | undefined;
  readonly tradeDirection?: string | undefined;
  readonly foodEstablishmentType?: string | undefined;
  readonly lodgingType?: string | undefined;
  readonly transportType?: string | undefined;
  readonly dealerType?: string | undefined;
  readonly businessRole?: string | undefined;
  readonly engagementBasis?: string | undefined;

  // Specific criteria
  readonly airConditioningFacility?: boolean | undefined;
  readonly assessedToPayIncomeTax?: boolean | undefined;
  readonly educationalInstitutionHostel?: boolean | undefined;
}

/**
 * Backward-compatible wrapper for legacy callers expecting StatutoryCriterion and StatutoryRuleDefinition
 */
export type StatutoryCriterion = StatutoryCriterionV3;

export interface StatutoryRuleDefinition {
  readonly subclassification_code: string | null;
  readonly subclassification_label?: string | null;
  readonly rule_id: string;
  readonly rule_code: string;
  readonly category_code: string;
  readonly category: string;
  readonly subcategory: string;
  readonly statutory_tertiary_code: string | null;
  readonly statutory_tertiary_classification: string | null;
  readonly official_text: string;
  readonly annual_rate_pkr: number;
  readonly rate_basis: string;
  readonly criteria: readonly StatutoryCriterion[];
  readonly source_page: number;
  readonly notes: string;
  readonly rate_source_level: RateSourceLevel;
  readonly assigned_code: string;
  readonly assigned_code_level: AssignedCodeLevel;
}

export interface StatutoryCategorySummary {
  readonly category_code: string;
  readonly category_name: string;
  readonly rule_count: number;
}

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

const DIRECT_RATE_CATEGORIES = new Set(["7", "8", "9", "10", "11"]);

const STATUTORY_LOCATION_SUBCLASSES = new Set([
  "3(i)",
  "6(iii)",
  "6(iv)",
  "6(v)",
  "6(vii)(b)",
  "6(vii)(c)",
  "6(vii)(d)",
  "6(vii)(e)",
  "6(viii)",
  "6(ix)"
]);

/**
 * Resolves a normalized statutory classification, criteria, annual rate, and current-year assessment
 * strictly following the v3 hierarchy and resolution order.
 */
export function resolveStatutoryClassification(
  input: TaxpayerClassificationInput
): ResolvedClassification {
  // Step 1: Preserve raw facts
  const criteriaObj: Record<string, unknown> = {
    ...(input.rawInput ?? {})
  };

  // Populate criteria from specific fields
  if (input.paidUpCapitalPkr !== undefined)
    criteriaObj.paid_up_capital_pkr = input.paidUpCapitalPkr;
  if (input.employeeCount !== undefined) criteriaObj.employee_count = input.employeeCount;
  if (input.locationScope !== undefined) criteriaObj.location_scope = input.locationScope;
  if (input.importExportValuePkr !== undefined)
    criteriaObj.import_export_value_pkr = input.importExportValuePkr;
  if (input.supplyContractValuePkr !== undefined)
    criteriaObj.supply_contract_value_pkr = input.supplyContractValuePkr;
  if (input.airConditioningFacility !== undefined)
    criteriaObj.air_conditioning_facility = input.airConditioningFacility;
  if (input.assessedToPayIncomeTax !== undefined)
    criteriaObj.assessed_to_pay_income_tax = input.assessedToPayIncomeTax;

  // Step 1.5: Direct assigned code, rule code, or rule ID resolution if provided
  const codeCandidate = (input.assignedCode ?? input.ruleCode ?? input.ruleId)?.trim();
  if (codeCandidate) {
    const targetRule = ASSESSMENT_RULES_V3.find(
      (r) => r.rule_code === codeCandidate || r.rule_id === codeCandidate
    );
    if (targetRule) {
      if (targetRule.category_code === "10") {
        if (input.airConditioningFacility === false) {
          return {
            category_code: targetRule.category_code,
            category_label: targetRule.category,
            subclassification_code: null,
            subclassification_label: null,
            statutory_tertiary_code: null,
            statutory_tertiary_label: null,
            tertiary_dimensions: {},
            criteria: criteriaObj,
            annual_rate_pkr: null,
            current_year_assessment_pkr: null,
            rate_source_level: null,
            classification_status: "review_required",
            classification_confidence: 0.4,
            classification_note:
              "Category 10 strictly requires air conditioning facility; assessee premises lack AC facility",
            rule_id: null,
            rule_code: null,
            assigned_code: targetRule.rule_code,
            assigned_code_level: "class"
          };
        }
        if (input.airConditioningFacility === undefined) {
          return {
            category_code: targetRule.category_code,
            category_label: targetRule.category,
            subclassification_code: null,
            subclassification_label: null,
            statutory_tertiary_code: null,
            statutory_tertiary_label: null,
            tertiary_dimensions: {},
            criteria: criteriaObj,
            annual_rate_pkr: null,
            current_year_assessment_pkr: null,
            rate_source_level: null,
            classification_status: "review_required",
            classification_confidence: 0.5,
            classification_note:
              "Air conditioning facility status unknown; inspection required before applying Category 10",
            rule_id: null,
            rule_code: null,
            assigned_code: targetRule.rule_code,
            assigned_code_level: "class"
          };
        }
      }

      const tertDims: Record<string, AnalyticTertiaryAllocation | StatutoryTertiaryAllocation> = {};
      if (targetRule.statutory_tertiary_code) {
        tertDims.location_scope = {
          code: targetRule.statutory_tertiary_code,
          label: targetRule.statutory_tertiary_classification ?? "",
          dimension: "location_scope",
          type: "statutory"
        };
      }

      // Check analytic tertiary from input
      matchAnalyticTertiary(
        input,
        targetRule.category_code,
        targetRule.subclassification_code,
        tertDims
      );

      const rateSourceLevel: RateSourceLevel = targetRule.statutory_tertiary_code
        ? "statutory_tertiary"
        : targetRule.subclassification_code
          ? "subclassification"
          : "category";

      const assignedCodeLevel: AssignedCodeLevel = targetRule.statutory_tertiary_code
        ? "tertiary"
        : targetRule.subclassification_code
          ? "subclass"
          : "class";

      return {
        category_code: targetRule.category_code,
        category_label: targetRule.category,
        subclassification_code: targetRule.subclassification_code,
        subclassification_label: targetRule.subclassification,
        statutory_tertiary_code: targetRule.statutory_tertiary_code,
        statutory_tertiary_label: targetRule.statutory_tertiary_classification,
        tertiary_dimensions: tertDims,
        criteria: criteriaObj,
        annual_rate_pkr: targetRule.annual_rate_pkr,
        current_year_assessment_pkr: targetRule.annual_rate_pkr,
        rate_source_level: rateSourceLevel,
        classification_status: "resolved",
        classification_confidence: 1.0,
        classification_note: "Resolved directly from statutory rule identifier",
        rule_id: targetRule.rule_id,
        rule_code: targetRule.rule_code,
        assigned_code: targetRule.rule_code,
        assigned_code_level: assignedCodeLevel
      };
    }

    // Check if codeCandidate matches an intermediate subclassification that may be split into tertiary branches
    for (const cat of CATEGORIES_V3) {
      const sub = cat.subclassifications.find((s) => s.subclassification_code === codeCandidate);
      if (sub) {
        if (sub.statutory_tertiary_classifications.length > 0) {
          const hasLocation =
            input.locationScope !== undefined || input.statutoryTertiaryCode !== undefined;
          if (hasLocation) {
            let matchedTert = input.statutoryTertiaryCode
              ? sub.statutory_tertiary_classifications.find(
                  (t) => t.tertiary_code === input.statutoryTertiaryCode
                )
              : undefined;
            if (!matchedTert && input.locationScope) {
              const isMetro = input.locationScope === "METROPOLITAN_OR_MUNICIPAL_CORPORATION";
              matchedTert = sub.statutory_tertiary_classifications.find((t) =>
                isMetro
                  ? t.tertiary_classification.includes("Metropolitan")
                  : t.tertiary_classification === "Others"
              );
            }
            if (matchedTert) {
              const leafRule = ASSESSMENT_RULES_V3.find(
                (r) => r.rule_code === matchedTert?.rule_code
              );
              const tertDims: Record<
                string,
                AnalyticTertiaryAllocation | StatutoryTertiaryAllocation
              > = {
                location_scope: {
                  code: matchedTert.tertiary_code,
                  label: matchedTert.tertiary_classification,
                  dimension: "location_scope",
                  type: "statutory"
                }
              };
              matchAnalyticTertiary(input, cat.category_code, sub.subclassification_code, tertDims);
              return {
                category_code: cat.category_code,
                category_label: cat.category,
                subclassification_code: sub.subclassification_code,
                subclassification_label: sub.subclassification,
                statutory_tertiary_code: matchedTert.tertiary_code,
                statutory_tertiary_label: matchedTert.tertiary_classification,
                tertiary_dimensions: tertDims,
                criteria: criteriaObj,
                annual_rate_pkr: matchedTert.annual_rate_pkr,
                current_year_assessment_pkr: matchedTert.annual_rate_pkr,
                rate_source_level: "statutory_tertiary",
                classification_status: "resolved",
                classification_confidence: 1.0,
                classification_note: `Resolved tertiary leaf '${matchedTert.rule_code}' from split code '${codeCandidate}' with location scope`,
                rule_id: leafRule?.rule_id ?? `PFT-${matchedTert.rule_code}`,
                rule_code: matchedTert.rule_code,
                assigned_code: matchedTert.rule_code,
                assigned_code_level: "tertiary"
              };
            }
          }

          const splitsDesc = sub.statutory_tertiary_classifications
            .map(
              (t) =>
                `${t.tertiary_code} ${t.tertiary_classification} (PKR ${t.annual_rate_pkr.toLocaleString()})`
            )
            .join(" and ");
          return {
            category_code: cat.category_code,
            category_label: cat.category,
            subclassification_code: sub.subclassification_code,
            subclassification_label: sub.subclassification,
            statutory_tertiary_code: null,
            statutory_tertiary_label: null,
            tertiary_dimensions: {},
            criteria: criteriaObj,
            annual_rate_pkr: null,
            current_year_assessment_pkr: null,
            rate_source_level: null,
            classification_status: "review_required",
            classification_confidence: 0.6,
            classification_note: `Subclassification '${sub.subclassification_code}' (${sub.subclassification}) requires location scope (Metropolitan/MC vs Other) to allocate assessment; further split into: ${splitsDesc}.`,
            rule_id: null,
            rule_code: null,
            assigned_code: sub.subclassification_code,
            assigned_code_level: "subclass"
          };
        } else {
          const leafRule = ASSESSMENT_RULES_V3.find((r) => r.rule_code === sub.rule_code);
          const rate = sub.annual_rate_pkr ?? leafRule?.annual_rate_pkr ?? 0;
          const tertDims: Record<string, AnalyticTertiaryAllocation | StatutoryTertiaryAllocation> =
            {};
          matchAnalyticTertiary(input, cat.category_code, sub.subclassification_code, tertDims);
          return {
            category_code: cat.category_code,
            category_label: cat.category,
            subclassification_code: sub.subclassification_code,
            subclassification_label: sub.subclassification,
            statutory_tertiary_code: null,
            statutory_tertiary_label: null,
            tertiary_dimensions: tertDims,
            criteria: criteriaObj,
            annual_rate_pkr: rate,
            current_year_assessment_pkr: rate,
            rate_source_level: "subclassification",
            classification_status: "resolved",
            classification_confidence: 1.0,
            classification_note: `Resolved subclassification leaf '${sub.subclassification_code}'`,
            rule_id: leafRule?.rule_id ?? `PFT-${sub.subclassification_code}`,
            rule_code: sub.rule_code ?? sub.subclassification_code,
            assigned_code: sub.subclassification_code,
            assigned_code_level: "subclass"
          };
        }
      }
    }

    // Check if codeCandidate matches a category code
    const matchedCategory = CATEGORIES_V3.find((c) => c.category_code === codeCandidate);
    if (matchedCategory && !DIRECT_RATE_CATEGORIES.has(codeCandidate)) {
      return {
        category_code: matchedCategory.category_code,
        category_label: matchedCategory.category,
        subclassification_code: null,
        subclassification_label: null,
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {},
        criteria: criteriaObj,
        annual_rate_pkr: null,
        current_year_assessment_pkr: null,
        rate_source_level: null,
        classification_status: "review_required",
        classification_confidence: 0.3,
        classification_note: `Category '${matchedCategory.category_code}' has ${matchedCategory.subclassifications.length} subclassifications; specific assigned subclassification code is required.`,
        rule_id: null,
        rule_code: null,
        assigned_code: matchedCategory.category_code,
        assigned_code_level: "class"
      };
    }

    // Unrecognized code
    return {
      category_code: codeCandidate,
      category_label: "Unrecognized Statutory Code",
      subclassification_code: null,
      subclassification_label: null,
      statutory_tertiary_code: null,
      statutory_tertiary_label: null,
      tertiary_dimensions: {},
      criteria: criteriaObj,
      annual_rate_pkr: null,
      current_year_assessment_pkr: null,
      rate_source_level: null,
      classification_status: "unresolved",
      classification_confidence: 0.0,
      classification_note: `Code '${codeCandidate}' does not exist in the official Second Schedule`,
      rule_id: null,
      rule_code: null,
      assigned_code: codeCandidate,
      assigned_code_level: null
    };
  }

  // Step 2: Determine Category
  const catCode = (input.categoryCode ?? "").trim();
  const category = CATEGORIES_V3.find((c) => c.category_code === catCode);
  if (!category) {
    return {
      category_code: catCode || "UNRESOLVED",
      category_label: "Unresolved Category",
      subclassification_code: null,
      subclassification_label: null,
      statutory_tertiary_code: null,
      statutory_tertiary_label: null,
      tertiary_dimensions: {},
      criteria: criteriaObj,
      annual_rate_pkr: null,
      current_year_assessment_pkr: null,
      rate_source_level: null,
      classification_status: "review_required",
      classification_confidence: 0.0,
      classification_note: "Category could not be determined from reliable entity facts",
      rule_id: null,
      rule_code: null,
      assigned_code: catCode || null,
      assigned_code_level: null
    };
  }

  const tertDims: Record<string, AnalyticTertiaryAllocation | StatutoryTertiaryAllocation> = {};

  // Step 3: Handle Direct Rate Categories (7, 8, 9, 10, 11)
  if (DIRECT_RATE_CATEGORIES.has(catCode)) {
    // Check specific criteria for Category 10 (AC Facility)
    if (catCode === "10") {
      if (input.airConditioningFacility === false) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.4,
          classification_note:
            "Category 10 strictly requires air conditioning facility; assessee premises lack AC facility",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      if (input.airConditioningFacility === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note:
            "Air conditioning facility status unknown; inspection required before applying Category 10",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
    }

    // Match analytic tertiary allocation (e.g. Bakery, Motel, Franchisee)
    matchAnalyticTertiary(input, catCode, null, tertDims);

    const directRate = category.direct_annual_rate_pkr ?? 0;
    return {
      category_code: catCode,
      category_label: category.category,
      subclassification_code: null,
      subclassification_label: null,
      statutory_tertiary_code: null,
      statutory_tertiary_label: null,
      tertiary_dimensions: tertDims,
      criteria: criteriaObj,
      annual_rate_pkr: directRate,
      current_year_assessment_pkr: directRate,
      rate_source_level: "category",
      classification_status: "resolved",
      classification_confidence: 1.0,
      classification_note: "Direct category-level statutory rate applied",
      rule_id: `PFT-${catCode}`,
      rule_code: catCode,
      assigned_code: catCode,
      assigned_code_level: "class"
    };
  }

  // Step 4: Determine Statutory Subclassification for Categories 1 to 6
  let subCode: string | null = input.subclassificationCode ?? null;
  let matchedSub: StatutorySubclassificationV3 | undefined;

  if (subCode) {
    matchedSub = category.subclassifications.find((s) => s.subclassification_code === subCode);
  }

  // Automatic criteria matching if subCode is not explicitly provided
  if (!matchedSub) {
    if (catCode === "1") {
      if (input.paidUpCapitalPkr === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note: "Company paid-up capital unknown; subclassification unresolved",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      const cap = input.paidUpCapitalPkr;
      if (cap <= 5000000) subCode = "1(i)";
      else if (cap <= 50000000) subCode = "1(ii)";
      else if (cap <= 100000000) subCode = "1(iii)";
      else if (cap <= 200000000) subCode = "1(iv)";
      else subCode = "1(v)";
    } else if (catCode === "2") {
      if (input.employeeCount === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note: "Factory employee count unknown; subclassification unresolved",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      const emp = input.employeeCount;
      if (emp <= 10) subCode = "2(i)";
      else if (emp <= 25) subCode = "2(ii)";
      else subCode = "2(iii)";
    } else if (catCode === "3") {
      const emp = input.employeeCount;
      if (emp === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note: "Commercial establishment employee count unknown",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      if (emp >= 10) subCode = "3(i)";
      else subCode = "3(ii)";
    } else if (catCode === "4") {
      if (input.importExportValuePkr === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note: "Import/Export transaction value unknown",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      const val = input.importExportValuePkr;
      if (val <= 1000000) subCode = "4(i)";
      else if (val <= 5000000) subCode = "4(ii)";
      else subCode = "4(iii)";
    } else if (catCode === "5") {
      if (input.supplyContractValuePkr === undefined) {
        return {
          category_code: catCode,
          category_label: category.category,
          subclassification_code: null,
          subclassification_label: null,
          statutory_tertiary_code: null,
          statutory_tertiary_label: null,
          tertiary_dimensions: tertDims,
          criteria: criteriaObj,
          annual_rate_pkr: null,
          current_year_assessment_pkr: null,
          rate_source_level: null,
          classification_status: "review_required",
          classification_confidence: 0.5,
          classification_note: "Contract / work supply value unknown",
          rule_id: null,
          rule_code: null,
          assigned_code: catCode,
          assigned_code_level: "class"
        };
      }
      const val = input.supplyContractValuePkr;
      if (val <= 1000000) subCode = "5(i)";
      else if (val <= 10000000) subCode = "5(ii)";
      else if (val <= 50000000) subCode = "5(iii)";
      else subCode = "5(iv)";
    }

    if (subCode) {
      matchedSub = category.subclassifications.find((s) => s.subclassification_code === subCode);
    }
  }

  if (!matchedSub) {
    return {
      category_code: catCode,
      category_label: category.category,
      subclassification_code: null,
      subclassification_label: null,
      statutory_tertiary_code: null,
      statutory_tertiary_label: null,
      tertiary_dimensions: tertDims,
      criteria: criteriaObj,
      annual_rate_pkr: null,
      current_year_assessment_pkr: null,
      rate_source_level: null,
      classification_status: "review_required",
      classification_confidence: 0.4,
      classification_note: "Subclassification could not be resolved from provided facts",
      rule_id: null,
      rule_code: null,
      assigned_code: catCode,
      assigned_code_level: "class"
    };
  }

  const subLabel = matchedSub.subclassification;

  // Step 5: Match Analytic Tertiary allocations where available
  matchAnalyticTertiary(input, catCode, matchedSub.subclassification_code, tertDims);

  // Step 6: Determine Statutory Tertiary Branch where required
  if (STATUTORY_LOCATION_SUBCLASSES.has(matchedSub.subclassification_code)) {
    const hasLocationScope =
      input.locationScope !== undefined || input.statutoryTertiaryCode !== undefined;
    if (!hasLocationScope) {
      const splitsDesc = matchedSub.statutory_tertiary_classifications
        .map(
          (t) =>
            `${t.tertiary_code} ${t.tertiary_classification} (PKR ${t.annual_rate_pkr.toLocaleString()})`
        )
        .join(" and ");
      return {
        category_code: catCode,
        category_label: category.category,
        subclassification_code: matchedSub.subclassification_code,
        subclassification_label: subLabel,
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: tertDims,
        criteria: criteriaObj,
        annual_rate_pkr: null,
        current_year_assessment_pkr: null,
        rate_source_level: null,
        classification_status: "review_required",
        classification_confidence: 0.6,
        classification_note: `Subclassification '${matchedSub.subclassification_code}' (${subLabel}) requires location scope (Metropolitan/MC vs Other) to allocate assessment; further split into: ${splitsDesc}.`,
        rule_id: null,
        rule_code: null,
        assigned_code: matchedSub.subclassification_code,
        assigned_code_level: "subclass"
      };
    }

    // Resolve statutory tertiary branch
    let statTert: (typeof matchedSub.statutory_tertiary_classifications)[number] | undefined;
    if (input.statutoryTertiaryCode) {
      statTert = matchedSub.statutory_tertiary_classifications.find(
        (t) => t.tertiary_code === input.statutoryTertiaryCode
      );
    }
    if (!statTert && input.locationScope) {
      const isMetro = input.locationScope === "METROPOLITAN_OR_MUNICIPAL_CORPORATION";
      statTert = matchedSub.statutory_tertiary_classifications.find((t) =>
        isMetro
          ? t.tertiary_classification.includes("Metropolitan")
          : t.tertiary_classification === "Others"
      );
    }

    if (!statTert) {
      return {
        category_code: catCode,
        category_label: category.category,
        subclassification_code: matchedSub.subclassification_code,
        subclassification_label: subLabel,
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: tertDims,
        criteria: criteriaObj,
        annual_rate_pkr: null,
        current_year_assessment_pkr: null,
        rate_source_level: null,
        classification_status: "review_required",
        classification_confidence: 0.6,
        classification_note: "Location statutory tertiary branch could not be resolved",
        rule_id: null,
        rule_code: null,
        assigned_code: matchedSub.subclassification_code,
        assigned_code_level: "subclass"
      };
    }

    tertDims.location_scope = {
      code: statTert.tertiary_code,
      label: statTert.tertiary_classification,
      dimension: "location_scope",
      type: "statutory"
    };

    const matchingRule = ASSESSMENT_RULES_V3.find((r) => r.rule_code === statTert.rule_code);

    return {
      category_code: catCode,
      category_label: category.category,
      subclassification_code: matchedSub.subclassification_code,
      subclassification_label: subLabel,
      statutory_tertiary_code: statTert.tertiary_code,
      statutory_tertiary_label: statTert.tertiary_classification,
      tertiary_dimensions: tertDims,
      criteria: criteriaObj,
      annual_rate_pkr: statTert.annual_rate_pkr,
      current_year_assessment_pkr: statTert.annual_rate_pkr,
      rate_source_level: "statutory_tertiary",
      classification_status: "resolved",
      classification_confidence: 1.0,
      classification_note: "Statutory tertiary location branch rate resolved",
      rule_id: matchingRule?.rule_id ?? `PFT-${statTert.rule_code}`,
      rule_code: statTert.rule_code,
      assigned_code: statTert.rule_code,
      assigned_code_level: "tertiary"
    };
  }

  // Step 7: Subclass without statutory tertiary branches
  const annualRate = matchedSub.annual_rate_pkr ?? 0;
  const matchingRule = ASSESSMENT_RULES_V3.find((r) => r.rule_code === matchedSub?.rule_code);

  return {
    category_code: catCode,
    category_label: category.category,
    subclassification_code: matchedSub.subclassification_code,
    subclassification_label: subLabel,
    statutory_tertiary_code: null,
    statutory_tertiary_label: null,
    tertiary_dimensions: tertDims,
    criteria: criteriaObj,
    annual_rate_pkr: annualRate,
    current_year_assessment_pkr: annualRate,
    rate_source_level: "subclassification",
    classification_status: "resolved",
    classification_confidence: 1.0,
    classification_note: "Statutory subclassification rate resolved",
    rule_id: matchingRule?.rule_id ?? `PFT-${matchedSub.rule_code}`,
    rule_code: matchedSub.rule_code ?? matchedSub.subclassification_code,
    assigned_code: matchedSub.rule_code ?? matchedSub.subclassification_code,
    assigned_code_level: "subclass"
  };
}

/**
 * Helper to match and allocate analytic tertiary dimensions without altering statutory tax rates
 */
function matchAnalyticTertiary(
  input: TaxpayerClassificationInput,
  categoryCode: string,
  subclassificationCode: string | null,
  dimensionsMap: Record<string, AnalyticTertiaryAllocation | StatutoryTertiaryAllocation>
): void {
  // Find matching dimension definitions for this category and subclassification
  const dimensions = ANALYTIC_TERTIARY_DIMENSIONS_V3.filter((d) => {
    if (d.parent_category_code !== categoryCode) return false;
    if (d.parent_subclassification_code !== null) {
      return d.parent_subclassification_code === subclassificationCode;
    }
    return true;
  });

  for (const dim of dimensions) {
    let candidateValue: string | undefined;

    switch (dim.dimension) {
      case "profession_type":
        candidateValue = input.professionType;
        break;
      case "entity_type":
        candidateValue = input.entityType;
        break;
      case "business_type":
        candidateValue = input.businessType;
        break;
      case "trade_direction":
        candidateValue = input.tradeDirection;
        break;
      case "dealer_type":
        candidateValue = input.dealerType;
        break;
      case "transport_type":
        candidateValue = input.transportType;
        break;
      case "establishment_type":
        candidateValue = input.entityType ?? input.businessType;
        break;
      case "business_role":
        candidateValue = input.businessRole;
        break;
      case "property_business_role":
        candidateValue = input.businessRole ?? input.entityType;
        break;
      case "lodging_type":
        candidateValue = input.lodgingType;
        break;
      case "food_establishment_type":
        candidateValue = input.foodEstablishmentType ?? input.businessType;
        break;
      case "engagement_basis":
        candidateValue = input.engagementBasis;
        break;
      default:
        break;
    }

    if (candidateValue) {
      const trimmed = candidateValue.trim().toLowerCase();
      const matchedOption = dim.options.find(
        (opt) =>
          opt.tertiary_classification.toLowerCase() === trimmed ||
          opt.source_term.toLowerCase() === trimmed ||
          opt.aliases.some((a) => a.toLowerCase() === trimmed)
      );

      if (matchedOption) {
        dimensionsMap[dim.dimension] = {
          code: matchedOption.tertiary_code,
          label: matchedOption.tertiary_classification,
          dimension: dim.dimension,
          type: "analytic"
        };
      }
    }
  }
}

/**
 * Returns all 47 official statutory assessment rules from the Second Schedule.
 */
export function getAllStatutoryRules(): readonly StatutoryRuleDefinition[] {
  return ASSESSMENT_RULES_V3.map((r) => {
    const rateSourceLevel: RateSourceLevel = r.statutory_tertiary_code
      ? "statutory_tertiary"
      : r.subclassification_code
        ? "subclassification"
        : "category";

    const assignedCodeLevel: AssignedCodeLevel = r.statutory_tertiary_code
      ? "tertiary"
      : r.subclassification_code
        ? "subclass"
        : "class";

    const subcategoryText =
      r.statutory_tertiary_classification ??
      r.subclassification ??
      (r.subclassification_code ? r.category : "Direct Category Rate");

    return {
      subclassification_code: r.subclassification_code,
      subclassification_label: r.subclassification,
      rule_id: r.rule_id,
      rule_code: r.rule_code,
      assigned_code: r.rule_code,
      assigned_code_level: assignedCodeLevel,
      category_code: r.category_code,
      category: r.category,
      subcategory: subcategoryText,
      statutory_tertiary_code: r.statutory_tertiary_code,
      statutory_tertiary_classification: r.statutory_tertiary_classification,
      official_text: r.official_text,
      annual_rate_pkr: r.annual_rate_pkr,
      rate_basis: r.rate_basis,
      criteria: r.criteria,
      source_page: r.source_page,
      notes: r.notes,
      rate_source_level: rateSourceLevel
    };
  });
}

/**
 * Returns summaries of all 11 statutory categories.
 */
export function getStatutoryCategories(): readonly StatutoryCategorySummary[] {
  const categoryMap = new Map<string, { name: string; count: number }>();

  for (const rule of ASSESSMENT_RULES_V3) {
    const existing = categoryMap.get(rule.category_code);
    if (existing) {
      existing.count += 1;
    } else {
      existingCategoryName(categoryMap, rule.category_code, rule.category);
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

  return result.sort((a, b) => parseInt(a.category_code, 10) - parseInt(b.category_code, 10));
}

function existingCategoryName(
  map: Map<string, { name: string; count: number }>,
  code: string,
  rawName: string
): void {
  const cat = CATEGORIES_V3.find((c) => c.category_code === code);
  map.set(code, {
    name: cat ? cat.category : rawName,
    count: 1
  });
}

/**
 * Returns all statutory rules belonging to a specific schedule category (e.g. "1", "3", "6").
 */
export function getRulesByCategory(categoryCode: string): readonly StatutoryRuleDefinition[] {
  const all = getAllStatutoryRules();
  const trimmed = categoryCode.trim();
  return all.filter((r) => r.category_code === trimmed);
}

/**
 * Finds a rule by its unique statutory machine key (e.g. "PFT-1.i", "PFT-3.i.b", "PFT-6.x", "PFT-10").
 */
export function getStatutoryRuleById(ruleId: string): StatutoryRuleDefinition | undefined {
  const all = getAllStatutoryRules();
  const trimmed = ruleId.trim();
  return all.find((r) => r.rule_id === trimmed);
}

/**
 * Finds a rule by its rule_code (e.g. "1(i)", "3(i)(a)", "6(vii)(e)(i)", "10").
 */
export function getStatutoryRuleByRuleCode(ruleCode: string): StatutoryRuleDefinition | undefined {
  const all = getAllStatutoryRules();
  const trimmed = ruleCode.trim();
  return all.find((r) => r.rule_code === trimmed);
}

/**
 * Finds a rule by its printed schedule subclassification code (e.g. "1(i)", "3(i)(b)", "6(x)").
 */
export function getStatutoryRuleBySubclassification(
  subclassificationCode: string
): StatutoryRuleDefinition | undefined {
  const all = getAllStatutoryRules();
  const trimmed = subclassificationCode.trim();
  return all.find((r) => r.rule_code === trimmed || r.subclassification_code === trimmed);
}

/**
 * Evaluates the statutory tax rate (PKR per annum) for a given rule ID.
 */
export function evaluateStatutoryRate(ruleId: string): number {
  const rule = getStatutoryRuleById(ruleId);
  if (!rule) {
    throw new Error(`Statutory rule '${ruleId}' does not exist in the official Second Schedule`);
  }
  return rule.annual_rate_pkr;
}

/**
 * Resolves the applicable statutory rule definition based on assessment parameters.
 */
export function matchStatutoryRule(
  criteria: TaxpayerAssessmentCriteria
): StatutoryRuleDefinition | undefined {
  if (criteria.ruleId) {
    return getStatutoryRuleById(criteria.ruleId);
  }

  const resolved = resolveStatutoryClassification({
    categoryCode: criteria.categoryCode,
    paidUpCapitalPkr: criteria.paidUpCapitalPkr,
    employeeCount: criteria.employeeCount,
    locationScope: criteria.locationScope,
    importExportValuePkr: criteria.importExportValuePkr,
    supplyContractValuePkr: criteria.supplyContractValuePkr,
    professionType: criteria.professionType,
    airConditioningFacility: criteria.hasAirConditioning,
    assessedToPayIncomeTax: criteria.hasAssessedIncomeTax
  });

  if (resolved.classification_status === "resolved" && resolved.rule_code) {
    return getStatutoryRuleByRuleCode(resolved.rule_code);
  }

  return undefined;
}

/**
 * Returns all 77 entries of the tertiary taxonomy.
 */
export function getAllTertiaryTaxonomy(): readonly TertiaryTaxonomyEntryV3[] {
  return TERTIARY_TAXONOMY_V3;
}

/**
 * Returns all 16 analytic tertiary dimensions.
 */
export function getAnalyticDimensions(): readonly AnalyticTertiaryDimensionV3[] {
  return ANALYTIC_TERTIARY_DIMENSIONS_V3;
}

/**
 * Resolves a statutory classification directly from an assigned statutory code
 * (class, sub-class, or tertiary split leaf), with optional location context.
 */
export function resolveByAssignedCode(
  assignedCode: string,
  context?: {
    readonly locationScope?: LocationScope | undefined;
    readonly statutoryTertiaryCode?: string | undefined;
    readonly airConditioningFacility?: boolean | undefined;
    readonly assessedToPayIncomeTax?: boolean | undefined;
    readonly rawInput?: Record<string, unknown> | undefined;
  }
): ResolvedClassification {
  return resolveStatutoryClassification({
    assignedCode: (assignedCode ?? "").trim(),
    locationScope: context?.locationScope,
    statutoryTertiaryCode: context?.statutoryTertiaryCode,
    airConditioningFacility: context?.airConditioningFacility,
    assessedToPayIncomeTax: context?.assessedToPayIncomeTax,
    rawInput: context?.rawInput
  });
}

/**
 * Classification Validator for Punjab Professional Tax Rules v3
 * Enforces the 13 statutory integrity rules defined in the v3 Rule Pack specification.
 */

import type { ResolvedClassification } from "./statutory-rules.js";
import { ASSESSMENT_RULES_V3, TERTIARY_TAXONOMY_V3 } from "./statutory-rules-v3-data.js";

export interface ClassificationValidationError {
  readonly ruleId: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly ClassificationValidationError[];
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

const CODE_ONLY_REGEX = /^\d+(\([a-z0-9]+\))*$/i;

/**
 * Validates a resolved statutory classification against the 13 mandatory integrity rules.
 */
export function validateClassification(
  resolved: ResolvedClassification,
  context?: {
    readonly forcedByHistoricalRecovery?: boolean;
    readonly collapsedDimensionsField?: string;
  }
): ValidationResult {
  const errors: ClassificationValidationError[] = [];

  // Rule 1: Tertiary label copied from subclass merely to fill a field
  if (
    resolved.subclassification_label &&
    resolved.statutory_tertiary_label &&
    resolved.subclassification_label.trim().toLowerCase() ===
      resolved.statutory_tertiary_label.trim().toLowerCase()
  ) {
    errors.push({
      ruleId: "RULE_1_TERTIARY_COPIED_FROM_SUBCLASS",
      message: `Tertiary label '${resolved.statutory_tertiary_label}' is copied verbatim from subclassification label; must be null if no genuine further split exists.`
    });
  }

  // Rule 2: Code used as human-readable label
  if (resolved.category_label && CODE_ONLY_REGEX.test(resolved.category_label.trim())) {
    errors.push({
      ruleId: "RULE_2_CODE_USED_AS_LABEL",
      message: `Category label '${resolved.category_label}' is a statutory code, not a human-readable class name.`
    });
  }
  if (
    resolved.subclassification_label &&
    CODE_ONLY_REGEX.test(resolved.subclassification_label.trim())
  ) {
    errors.push({
      ruleId: "RULE_2_CODE_USED_AS_LABEL",
      message: `Subclassification label '${resolved.subclassification_label}' is a statutory code, not a human-readable class name.`
    });
  }
  if (
    resolved.statutory_tertiary_label &&
    CODE_ONLY_REGEX.test(resolved.statutory_tertiary_label.trim())
  ) {
    errors.push({
      ruleId: "RULE_2_CODE_USED_AS_LABEL",
      message: `Statutory tertiary label '${resolved.statutory_tertiary_label}' is a statutory code, not a human-readable class name.`
    });
  }

  // Rule 3: Synthetic analytic tertiary code marked as statutory
  for (const dimKey of Object.keys(resolved.tertiary_dimensions)) {
    const dim = resolved.tertiary_dimensions[dimKey];
    if (dim) {
      const taxonomyEntry = TERTIARY_TAXONOMY_V3.find((t) => t.tertiary_code === dim.code);
      if (taxonomyEntry?.code_type === "synthetic_analytic" && dim.type === "statutory") {
        errors.push({
          ruleId: "RULE_3_SYNTHETIC_MARKED_AS_STATUTORY",
          message: `Analytic tertiary code '${dim.code}' cannot be marked as statutory.`
        });
      }
    }
  }

  // Rule 4: Invalid tertiary code for the selected parent
  if (resolved.statutory_tertiary_code) {
    const statEntry = TERTIARY_TAXONOMY_V3.find(
      (t) => t.tertiary_code === resolved.statutory_tertiary_code
    );
    if (!statEntry) {
      errors.push({
        ruleId: "RULE_4_INVALID_TERTIARY_FOR_PARENT",
        message: `Statutory tertiary code '${resolved.statutory_tertiary_code}' does not exist in v3 taxonomy.`
      });
    } else {
      if (statEntry.parent_category_code !== resolved.category_code) {
        errors.push({
          ruleId: "RULE_4_INVALID_TERTIARY_FOR_PARENT",
          message: `Tertiary code '${resolved.statutory_tertiary_code}' belongs to category '${statEntry.parent_category_code}', not '${resolved.category_code}'.`
        });
      }
      if (
        statEntry.parent_subclassification_code &&
        statEntry.parent_subclassification_code !== resolved.subclassification_code
      ) {
        errors.push({
          ruleId: "RULE_4_INVALID_TERTIARY_FOR_PARENT",
          message: `Tertiary code '${resolved.statutory_tertiary_code}' belongs to subclassification '${statEntry.parent_subclassification_code}', not '${resolved.subclassification_code}'.`
        });
      }
    }
  }

  // Rule 5: Statutory location branch overwritten by analytic entity type
  if (
    resolved.subclassification_code &&
    STATUTORY_LOCATION_SUBCLASSES.has(resolved.subclassification_code)
  ) {
    // Must have a statutory location branch resolved or marked unresolved, not replaced by an analytic entity type
    if (
      resolved.tertiary_dimensions.location_scope &&
      resolved.tertiary_dimensions.location_scope.type !== "statutory"
    ) {
      errors.push({
        ruleId: "RULE_5_LOCATION_BRANCH_OVERWRITTEN",
        message: `Statutory location branch for subclass '${resolved.subclassification_code}' cannot be overwritten by an analytic entity type.`
      });
    }
  }

  // Rule 6: Fabricated statutory subclass where none exists (categories 7-11)
  if (DIRECT_RATE_CATEGORIES.has(resolved.category_code)) {
    if (resolved.subclassification_code !== null || resolved.subclassification_label !== null) {
      errors.push({
        ruleId: "RULE_6_FABRICATED_SUBCLASS_ON_DIRECT_RATE",
        message: `Category '${resolved.category_code}' has a direct statutory rate; subclassification must be null.`
      });
    }
  }

  // Rule 7: A criterion such as AC facility stored as entity-type tertiary
  for (const dimKey of Object.keys(resolved.tertiary_dimensions)) {
    const dim = resolved.tertiary_dimensions[dimKey];
    if (dim) {
      const lower = dim.label.toLowerCase();
      if (
        lower.includes("air condition") ||
        lower.includes("ac facility") ||
        dim.code.includes("AIR-CONDITION")
      ) {
        errors.push({
          ruleId: "RULE_7_CRITERION_STORED_AS_TERTIARY",
          message: `Air conditioning facility is a statutory criterion, not an entity-type tertiary allocation.`
        });
      }
    }
  }

  // Rule 8: Rate assigned at the wrong hierarchy level
  if (resolved.classification_status === "resolved") {
    if (DIRECT_RATE_CATEGORIES.has(resolved.category_code)) {
      if (resolved.rate_source_level !== "category") {
        errors.push({
          ruleId: "RULE_8_RATE_WRONG_HIERARCHY_LEVEL",
          message: `Direct-rate category '${resolved.category_code}' must have rate_source_level = 'category', got '${resolved.rate_source_level}'.`
        });
      }
    } else if (
      resolved.subclassification_code &&
      STATUTORY_LOCATION_SUBCLASSES.has(resolved.subclassification_code)
    ) {
      if (resolved.rate_source_level !== "statutory_tertiary") {
        errors.push({
          ruleId: "RULE_8_RATE_WRONG_HIERARCHY_LEVEL",
          message: `Subclass '${resolved.subclassification_code}' requires location statutory tertiary rate; rate_source_level must be 'statutory_tertiary', got '${resolved.rate_source_level}'.`
        });
      }
    } else if (resolved.subclassification_code) {
      if (resolved.rate_source_level !== "subclassification") {
        errors.push({
          ruleId: "RULE_8_RATE_WRONG_HIERARCHY_LEVEL",
          message: `Subclass '${resolved.subclassification_code}' without statutory tertiary branches must have rate_source_level = 'subclassification', got '${resolved.rate_source_level}'.`
        });
      }
    }
  }

  // Rule 9: Annual rate inconsistent with the selected statutory leaf
  if (resolved.classification_status === "resolved" && resolved.rule_code) {
    const matchingRule = ASSESSMENT_RULES_V3.find((r) => r.rule_code === resolved.rule_code);
    if (matchingRule && matchingRule.annual_rate_pkr !== resolved.annual_rate_pkr) {
      errors.push({
        ruleId: "RULE_9_INCONSISTENT_ANNUAL_RATE",
        message: `Annual rate PKR ${resolved.annual_rate_pkr} does not match statutory leaf rate PKR ${matchingRule.annual_rate_pkr} for rule '${resolved.rule_code}'.`
      });
    }
  }

  // Rule 10: Analytic tertiary type not belonging to the selected category/subclass
  for (const dimKey of Object.keys(resolved.tertiary_dimensions)) {
    const dim = resolved.tertiary_dimensions[dimKey];
    if (dim && dim.type === "analytic") {
      const taxonomyEntry = TERTIARY_TAXONOMY_V3.find((t) => t.tertiary_code === dim.code);
      if (taxonomyEntry) {
        if (taxonomyEntry.parent_category_code !== resolved.category_code) {
          errors.push({
            ruleId: "RULE_10_ANALYTIC_TYPE_MISMATCH",
            message: `Analytic tertiary type '${dim.code}' belongs to category '${taxonomyEntry.parent_category_code}', not '${resolved.category_code}'.`
          });
        }
        if (
          taxonomyEntry.parent_subclassification_code &&
          taxonomyEntry.parent_subclassification_code !== resolved.subclassification_code
        ) {
          errors.push({
            ruleId: "RULE_10_ANALYTIC_TYPE_MISMATCH",
            message: `Analytic tertiary type '${dim.code}' belongs to subclassification '${taxonomyEntry.parent_subclassification_code}', not '${resolved.subclassification_code}'.`
          });
        }
      }
    }
  }

  // Rule 11: Multiple tertiary dimensions collapsed into one field
  if (context?.collapsedDimensionsField) {
    errors.push({
      ruleId: "RULE_11_COLLAPSED_TERTIARY_DIMENSIONS",
      message: `Multiple tertiary dimensions were collapsed into single field '${context.collapsedDimensionsField}'; they must coexist in structured tertiary_dimensions.`
    });
  }

  // Rule 12: Current-year assessment not equal to the resolved annual rate
  if (resolved.classification_status === "resolved") {
    if (resolved.current_year_assessment_pkr !== resolved.annual_rate_pkr) {
      errors.push({
        ruleId: "RULE_12_ASSESSMENT_NOT_EQUAL_TO_ANNUAL_RATE",
        message: `Current-year assessment PKR ${resolved.current_year_assessment_pkr} must equal resolved annual rate PKR ${resolved.annual_rate_pkr}.`
      });
    }
  }

  // Rule 13: Historical payment/recovery amount used to force current-year category/subclass selection
  if (context?.forcedByHistoricalRecovery) {
    errors.push({
      ruleId: "RULE_13_FORCED_BY_HISTORICAL_RECOVERY",
      message: `Historical recovery/payment amount must not be used to infer current-year statutory category or subclassification.`
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

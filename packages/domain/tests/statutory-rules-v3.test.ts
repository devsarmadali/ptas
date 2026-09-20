import { describe, expect, it } from "vitest";
import {
  resolveStatutoryClassification,
  resolveByAssignedCode,
  getAllStatutoryRules,
  getStatutoryCategories,
  getAllTertiaryTaxonomy,
  getAnalyticDimensions
} from "../src/statutory-rules.js";
import { validateClassification } from "../src/classification-validator.js";

describe("Punjab Professional Tax Rules v3 Canonical Rule Engine", () => {
  describe("1. Canonical Rule Source Integrity (v3.0.0)", () => {
    it("loads exactly 47 statutory rate rules with correct rate ownership levels", () => {
      const rules = getAllStatutoryRules();
      expect(rules).toHaveLength(47);

      const categoryLevel = rules.filter((r) => r.rate_source_level === "category");
      const subclassLevel = rules.filter((r) => r.rate_source_level === "subclassification");
      const tertiaryLevel = rules.filter((r) => r.rate_source_level === "statutory_tertiary");

      expect(categoryLevel).toHaveLength(5); // Categories 7, 8, 9, 10, 11
      expect(subclassLevel).toHaveLength(22); // Categories 1(5), 2(3), 3(1), 4(3), 5(4), 6(6)
      expect(tertiaryLevel).toHaveLength(20); // Exactly 20 location branches across 3(i) and 6
      expect(categoryLevel.length + subclassLevel.length + tertiaryLevel.length).toBe(47);
    });

    it("identifies all 11 schedule categories without fabricating subclasses for direct-rate categories", () => {
      const categories = getStatutoryCategories();
      expect(categories).toHaveLength(11);
      expect(categories.map((c) => c.category_code)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11"
      ]);
    });

    it("provides the complete 77-entry tertiary taxonomy and 16 analytic dimensions", () => {
      const taxonomy = getAllTertiaryTaxonomy();
      expect(taxonomy).toHaveLength(77);

      const dimensions = getAnalyticDimensions();
      expect(dimensions).toHaveLength(16);
    });
  });

  describe("2. Mandatory Statutory Tests A through G", () => {
    it("Test A — entry 1(i): Companies up to Rs 5 million", () => {
      const res = resolveStatutoryClassification({
        categoryCode: "1",
        paidUpCapitalPkr: 3500000
      });

      expect(res.category_code).toBe("1");
      expect(res.category_label).toContain("Companies");
      expect(res.subclassification_code).toBe("1(i)");
      expect(res.subclassification_label).toBe("Paid-up capital up to Rs 5 million");
      expect(res.statutory_tertiary_code).toBeNull();
      expect(res.statutory_tertiary_label).toBeNull();
      expect(res.annual_rate_pkr).toBe(10000);
      expect(res.current_year_assessment_pkr).toBe(10000);
      expect(res.rate_source_level).toBe("subclassification");
      expect(res.classification_status).toBe("resolved");

      const validation = validateClassification(res);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("Test B — Recruiting Agent / Metro limits", () => {
      const res = resolveStatutoryClassification({
        categoryCode: "6",
        subclassificationCode: "6(vii)(e)",
        locationScope: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      });

      expect(res.category_code).toBe("6");
      expect(res.subclassification_code).toBe("6(vii)(e)");
      expect(res.subclassification_label).toBe("Recruiting Agents");
      expect(res.statutory_tertiary_code).toBe("6(vii)(e)(i)");
      expect(res.statutory_tertiary_label).toBe(
        "Within Metropolitan and Municipal Corporation limits"
      );
      expect(res.annual_rate_pkr).toBe(20000);
      expect(res.current_year_assessment_pkr).toBe(20000);
      expect(res.rate_source_level).toBe("statutory_tertiary");
      expect(res.classification_status).toBe("resolved");

      const validation = validateClassification(res);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("Test C — entry 6(x), Jeweler", () => {
      const res = resolveStatutoryClassification({
        categoryCode: "6",
        subclassificationCode: "6(x)",
        entityType: "Jeweler"
      });

      expect(res.category_code).toBe("6");
      expect(res.subclassification_code).toBe("6(x)");
      expect(res.subclassification_label).toContain("Jewelers");
      expect(res.statutory_tertiary_code).toBeNull(); // No statutory tertiary split!
      expect(res.statutory_tertiary_label).toBeNull();

      // Analytic tertiary is allocated in dimensions
      expect(res.tertiary_dimensions.establishment_type).toBeDefined();
      expect(res.tertiary_dimensions.establishment_type?.code).toBe("PFT-T06X-JEWELER");
      expect(res.tertiary_dimensions.establishment_type?.label).toBe("Jeweler");
      expect(res.tertiary_dimensions.establishment_type?.type).toBe("analytic");

      // The statutory rule code remains 6(x) - analytic tertiary is not a new statutory tax code
      expect(res.rule_code).toBe("6(x)");
      expect(res.annual_rate_pkr).toBe(2000);
      expect(res.current_year_assessment_pkr).toBe(2000);
      expect(res.rate_source_level).toBe("subclassification");
      expect(res.classification_status).toBe("resolved");

      const validation = validateClassification(res);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("Test D — entry 6(v), Architect + Metro limits (multiple dimensions coexist)", () => {
      const res = resolveStatutoryClassification({
        categoryCode: "6",
        subclassificationCode: "6(v)",
        professionType: "Architect",
        locationScope: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      });

      expect(res.category_code).toBe("6");
      expect(res.subclassification_code).toBe("6(v)");

      // Both dimensions coexist cleanly without one overwriting the other
      expect(res.tertiary_dimensions.profession_type).toBeDefined();
      expect(res.tertiary_dimensions.profession_type?.code).toBe("PFT-T06V-ARCHITECT");
      expect(res.tertiary_dimensions.profession_type?.label).toBe("Architect");
      expect(res.tertiary_dimensions.profession_type?.type).toBe("analytic");

      expect(res.tertiary_dimensions.location_scope).toBeDefined();
      expect(res.tertiary_dimensions.location_scope?.code).toBe("6(v)(a)");
      expect(res.tertiary_dimensions.location_scope?.label).toBe(
        "Within Metropolitan and Municipal Corporation limits"
      );
      expect(res.tertiary_dimensions.location_scope?.type).toBe("statutory");

      expect(res.statutory_tertiary_code).toBe("6(v)(a)");
      expect(res.statutory_tertiary_label).toBe(
        "Within Metropolitan and Municipal Corporation limits"
      );
      expect(res.annual_rate_pkr).toBe(6000);
      expect(res.current_year_assessment_pkr).toBe(6000);
      expect(res.rate_source_level).toBe("statutory_tertiary");
      expect(res.classification_status).toBe("resolved");

      const validation = validateClassification(res);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("Test E — category 10, Bakery with air conditioning facility", () => {
      const res = resolveStatutoryClassification({
        categoryCode: "10",
        foodEstablishmentType: "Bakery",
        airConditioningFacility: true
      });

      expect(res.category_code).toBe("10");
      expect(res.category_label).toContain("Restaurants / Eateries");
      expect(res.subclassification_code).toBeNull(); // Direct rate: subclassification must be null!
      expect(res.subclassification_label).toBeNull();
      expect(res.statutory_tertiary_code).toBeNull();
      expect(res.statutory_tertiary_label).toBeNull();

      // Analytic tertiary allocation
      expect(res.tertiary_dimensions.food_establishment_type).toBeDefined();
      expect(res.tertiary_dimensions.food_establishment_type?.code).toBe("PFT-T10-BAKERY");
      expect(res.tertiary_dimensions.food_establishment_type?.label).toBe("Bakery");
      expect(res.tertiary_dimensions.food_establishment_type?.type).toBe("analytic");

      // Criteria validation
      expect(res.criteria.air_conditioning_facility).toBe(true);
      expect(res.annual_rate_pkr).toBe(5000);
      expect(res.current_year_assessment_pkr).toBe(5000);
      expect(res.rate_source_level).toBe("category");
      expect(res.classification_status).toBe("resolved");

      const validation = validateClassification(res);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("Test F — no fake tertiary: subclasses without genuine splits return null tertiary", () => {
      // Category 2(i): Factories <= 10 employees
      const resFactory = resolveStatutoryClassification({
        categoryCode: "2",
        employeeCount: 8
      });
      expect(resFactory.subclassification_code).toBe("2(i)");
      expect(resFactory.statutory_tertiary_code).toBeNull();
      expect(resFactory.statutory_tertiary_label).toBeNull();

      // Category 3(ii): Commercial establishments (Others)
      const resCommercial = resolveStatutoryClassification({
        categoryCode: "3",
        employeeCount: 4
      });
      expect(resCommercial.subclassification_code).toBe("3(ii)");
      expect(resCommercial.statutory_tertiary_code).toBeNull();
      expect(resCommercial.statutory_tertiary_label).toBeNull();

      // Category 4(i): Importers/Exporters <= 1M
      const resImport = resolveStatutoryClassification({
        categoryCode: "4",
        importExportValuePkr: 500000
      });
      expect(resImport.subclassification_code).toBe("4(i)");
      expect(resImport.statutory_tertiary_code).toBeNull();
      expect(resImport.statutory_tertiary_label).toBeNull();
    });

    it("Test G — unresolved facts do not produce invented assessment", () => {
      // Factory known, but employee count unknown
      const resFactoryUnknown = resolveStatutoryClassification({
        categoryCode: "2"
      });

      expect(resFactoryUnknown.category_code).toBe("2");
      expect(resFactoryUnknown.subclassification_code).toBeNull();
      expect(resFactoryUnknown.annual_rate_pkr).toBeNull();
      expect(resFactoryUnknown.current_year_assessment_pkr).toBeNull();
      expect(resFactoryUnknown.classification_status).toBe("review_required");
      expect(resFactoryUnknown.classification_note).toContain("employee count unknown");

      // Recruiting Agent known, but location scope unknown
      const resAgentUnknown = resolveStatutoryClassification({
        categoryCode: "6",
        subclassificationCode: "6(vii)(e)"
      });
      expect(resAgentUnknown.subclassification_code).toBe("6(vii)(e)");
      expect(resAgentUnknown.statutory_tertiary_code).toBeNull();
      expect(resAgentUnknown.annual_rate_pkr).toBeNull();
      expect(resAgentUnknown.current_year_assessment_pkr).toBeNull();
      expect(resAgentUnknown.classification_status).toBe("review_required");
      expect(resAgentUnknown.classification_note).toContain("requires location scope");

      // Bakery known, but air conditioning status unknown
      const resBakeryUnknown = resolveStatutoryClassification({
        categoryCode: "10",
        foodEstablishmentType: "Bakery"
      });
      expect(resBakeryUnknown.annual_rate_pkr).toBeNull();
      expect(resBakeryUnknown.current_year_assessment_pkr).toBeNull();
      expect(resBakeryUnknown.classification_status).toBe("review_required");
      expect(resBakeryUnknown.classification_note).toContain(
        "Air conditioning facility status unknown"
      );
    });
  });

  describe("3. Automated Validation Rules (13 Integrity Checks)", () => {
    it("flags Rule 1: tertiary label copied verbatim from subclassification label", () => {
      const invalid = {
        category_code: "1",
        category_label: "Companies",
        subclassification_code: "1(i)",
        subclassification_label: "Paid-up capital up to Rs 5 million",
        statutory_tertiary_code: "1(i)",
        statutory_tertiary_label: "Paid-up capital up to Rs 5 million",
        tertiary_dimensions: {},
        criteria: {},
        annual_rate_pkr: 10000,
        current_year_assessment_pkr: 10000,
        rate_source_level: "subclassification" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-1.i",
        rule_code: "1(i)",
        assigned_code: "1(i)",
        assigned_code_level: "subclass" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === "RULE_1_TERTIARY_COPIED_FROM_SUBCLASS")).toBe(
        true
      );
    });

    it("flags Rule 2: code used as human-readable label", () => {
      const invalid = {
        category_code: "1",
        category_label: "1", // Invalid code as label
        subclassification_code: "1(i)",
        subclassification_label: "1(i)", // Invalid code as label
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {},
        criteria: {},
        annual_rate_pkr: 10000,
        current_year_assessment_pkr: 10000,
        rate_source_level: "subclassification" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-1.i",
        rule_code: "1(i)",
        assigned_code: "1(i)",
        assigned_code_level: "subclass" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === "RULE_2_CODE_USED_AS_LABEL")).toBe(true);
    });

    it("flags Rule 3: synthetic analytic tertiary code marked as statutory", () => {
      const invalid = {
        category_code: "6",
        category_label: "Professions",
        subclassification_code: "6(x)",
        subclassification_label: "Jewelers",
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {
          establishment_type: {
            code: "PFT-T06X-JEWELER",
            label: "Jeweler",
            dimension: "establishment_type",
            type: "statutory" as const // Invalid!
          }
        },
        criteria: {},
        annual_rate_pkr: 2000,
        current_year_assessment_pkr: 2000,
        rate_source_level: "subclassification" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-6.x",
        rule_code: "6(x)",
        assigned_code: "6(x)",
        assigned_code_level: "subclass" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === "RULE_3_SYNTHETIC_MARKED_AS_STATUTORY")).toBe(
        true
      );
    });

    it("flags Rule 6: fabricated statutory subclass on direct-rate categories", () => {
      const invalid = {
        category_code: "10",
        category_label: "Restaurants / Eateries",
        subclassification_code: "10", // Fabricated!
        subclassification_label: "With AC facility", // Fabricated!
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {},
        criteria: {},
        annual_rate_pkr: 5000,
        current_year_assessment_pkr: 5000,
        rate_source_level: "category" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-10",
        rule_code: "10",
        assigned_code: "10",
        assigned_code_level: "class" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.ruleId === "RULE_6_FABRICATED_SUBCLASS_ON_DIRECT_RATE")
      ).toBe(true);
    });

    it("flags Rule 7: criterion stored as entity-type tertiary", () => {
      const invalid = {
        category_code: "10",
        category_label: "Restaurants / Eateries",
        subclassification_code: null,
        subclassification_label: null,
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {
          food_establishment_type: {
            code: "PFT-T10-AIR-CONDITION",
            label: "Air conditioning facility",
            dimension: "food_establishment_type",
            type: "analytic" as const
          }
        },
        criteria: {},
        annual_rate_pkr: 5000,
        current_year_assessment_pkr: 5000,
        rate_source_level: "category" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-10",
        rule_code: "10",
        assigned_code: "10",
        assigned_code_level: "class" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === "RULE_7_CRITERION_STORED_AS_TERTIARY")).toBe(
        true
      );
    });

    it("flags Rule 12: current-year assessment not equal to resolved annual rate", () => {
      const invalid = {
        category_code: "1",
        category_label: "Companies",
        subclassification_code: "1(i)",
        subclassification_label: "Paid-up capital up to Rs 5 million",
        statutory_tertiary_code: null,
        statutory_tertiary_label: null,
        tertiary_dimensions: {},
        criteria: {},
        annual_rate_pkr: 10000,
        current_year_assessment_pkr: 30000, // Invalid: year multiplier or arbitrary amount
        rate_source_level: "subclassification" as const,
        classification_status: "resolved" as const,
        classification_confidence: 1.0,
        rule_id: "PFT-1.i",
        rule_code: "1(i)",
        assigned_code: "1(i)",
        assigned_code_level: "subclass" as const
      };

      const result = validateClassification(invalid);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.ruleId === "RULE_12_ASSESSMENT_NOT_EQUAL_TO_ANNUAL_RATE")
      ).toBe(true);
    });

    it("flags Rule 13: historical payment/recovery amount used to force current-year classification", () => {
      const validClassification = resolveStatutoryClassification({
        categoryCode: "1",
        paidUpCapitalPkr: 2000000
      });

      const result = validateClassification(validClassification, {
        forcedByHistoricalRecovery: true
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === "RULE_13_FORCED_BY_HISTORICAL_RECOVERY")).toBe(
        true
      );
    });
  });

  describe("4. Statutory Code Hierarchy Assignment & Assessment Allocation", () => {
    it("assigns code to Class level for direct-rate categories (7, 8, 9, 10, 11)", () => {
      // Category 7: Contractors/Suppliers/Consultants
      const res7 = resolveByAssignedCode("7");
      expect(res7.category_code).toBe("7");
      expect(res7.assigned_code).toBe("7");
      expect(res7.assigned_code_level).toBe("class");
      expect(res7.subclassification_code).toBeNull();
      expect(res7.statutory_tertiary_code).toBeNull();
      expect(res7.annual_rate_pkr).toBe(5000);
      expect(res7.current_year_assessment_pkr).toBe(5000);
      expect(res7.classification_status).toBe("resolved");

      // Category 10: AC Food Establishment
      const res10 = resolveByAssignedCode("10", { airConditioningFacility: true });
      expect(res10.category_code).toBe("10");
      expect(res10.assigned_code).toBe("10");
      expect(res10.assigned_code_level).toBe("class");
      expect(res10.annual_rate_pkr).toBe(5000);
      expect(res10.current_year_assessment_pkr).toBe(5000);
      expect(res10.classification_status).toBe("resolved");

      // Category 10 without AC facility cannot allocate rate
      const res10NoAc = resolveByAssignedCode("10", { airConditioningFacility: false });
      expect(res10NoAc.classification_status).toBe("review_required");
      expect(res10NoAc.annual_rate_pkr).toBeNull();
      expect(res10NoAc.current_year_assessment_pkr).toBeNull();
    });

    it("assigns code to Sub-class level when no further statutory split exists: 6(vii)(a) Members of Stock Exchanges", () => {
      const resStock = resolveByAssignedCode("6(vii)(a)");
      expect(resStock.category_code).toBe("6");
      expect(resStock.subclassification_code).toBe("6(vii)(a)");
      expect(resStock.subclassification_label).toBe("Members of Stock Exchanges");
      expect(resStock.statutory_tertiary_code).toBeNull();
      expect(resStock.assigned_code).toBe("6(vii)(a)");
      expect(resStock.assigned_code_level).toBe("subclass");
      expect(resStock.annual_rate_pkr).toBe(10000);
      expect(resStock.current_year_assessment_pkr).toBe(10000);
      expect(resStock.classification_status).toBe("resolved");
    });

    it("assigns code to Tertiary split level for Money Changer: 6(vii)(b)(i) vs 6(vii)(b)(ii)", () => {
      // 6(vii)(b)(i): Money Changer - Within Metropolitan and Municipal Corporation limits -> PKR 6,000
      const resMetro = resolveByAssignedCode("6(vii)(b)(i)");
      expect(resMetro.category_code).toBe("6");
      expect(resMetro.subclassification_code).toBe("6(vii)(b)");
      expect(resMetro.subclassification_label).toBe("Money Changer");
      expect(resMetro.statutory_tertiary_code).toBe("6(vii)(b)(i)");
      expect(resMetro.statutory_tertiary_label).toBe(
        "Within Metropolitan and Municipal Corporation limits"
      );
      expect(resMetro.assigned_code).toBe("6(vii)(b)(i)");
      expect(resMetro.assigned_code_level).toBe("tertiary");
      expect(resMetro.annual_rate_pkr).toBe(6000);
      expect(resMetro.current_year_assessment_pkr).toBe(6000);
      expect(resMetro.classification_status).toBe("resolved");

      // 6(vii)(b)(ii): Money Changer - Others -> PKR 2,000
      const resOther = resolveByAssignedCode("6(vii)(b)(ii)");
      expect(resOther.category_code).toBe("6");
      expect(resOther.subclassification_code).toBe("6(vii)(b)");
      expect(resOther.subclassification_label).toBe("Money Changer");
      expect(resOther.statutory_tertiary_code).toBe("6(vii)(b)(ii)");
      expect(resOther.statutory_tertiary_label).toBe("Others");
      expect(resOther.assigned_code).toBe("6(vii)(b)(ii)");
      expect(resOther.assigned_code_level).toBe("tertiary");
      expect(resOther.annual_rate_pkr).toBe(2000);
      expect(resOther.current_year_assessment_pkr).toBe(2000);
      expect(resOther.classification_status).toBe("resolved");
    });

    it("requires location scope when intermediate split code 6(vii)(b) is passed without tertiary resolution", () => {
      // Passing 6(vii)(b) alone without location must NOT allocate assessment amount
      const resUnsplit = resolveByAssignedCode("6(vii)(b)");
      expect(resUnsplit.classification_status).toBe("review_required");
      expect(resUnsplit.annual_rate_pkr).toBeNull();
      expect(resUnsplit.current_year_assessment_pkr).toBeNull();
      expect(resUnsplit.assigned_code).toBe("6(vii)(b)");
      expect(resUnsplit.assigned_code_level).toBe("subclass");
      expect(resUnsplit.classification_note).toContain(
        "further split into: 6(vii)(b)(i) Within Metropolitan and Municipal Corporation limits (PKR 6,000) and 6(vii)(b)(ii) Others (PKR 2,000)"
      );
      expect(resUnsplit.classification_note).toContain("requires location scope");

      // Providing locationScope resolves to the proper tertiary leaf and allocates exact assessment
      const resWithMetro = resolveByAssignedCode("6(vii)(b)", {
        locationScope: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      });
      expect(resWithMetro.classification_status).toBe("resolved");
      expect(resWithMetro.assigned_code).toBe("6(vii)(b)(i)");
      expect(resWithMetro.assigned_code_level).toBe("tertiary");
      expect(resWithMetro.annual_rate_pkr).toBe(6000);
      expect(resWithMetro.current_year_assessment_pkr).toBe(6000);

      const resWithOther = resolveByAssignedCode("6(vii)(b)", {
        locationScope: "OTHER"
      });
      expect(resWithOther.classification_status).toBe("resolved");
      expect(resWithOther.assigned_code).toBe("6(vii)(b)(ii)");
      expect(resWithOther.assigned_code_level).toBe("tertiary");
      expect(resWithOther.annual_rate_pkr).toBe(2000);
      expect(resWithOther.current_year_assessment_pkr).toBe(2000);
    });

    it("verifies all 47 statutory rules expose canonical assigned_code and assigned_code_level", () => {
      const allRules = getAllStatutoryRules();
      expect(allRules).toHaveLength(47);

      for (const rule of allRules) {
        expect(rule.assigned_code).toBe(rule.rule_code);
        if (rule.statutory_tertiary_code) {
          expect(rule.assigned_code_level).toBe("tertiary");
        } else if (rule.subclassification_code) {
          expect(rule.assigned_code_level).toBe("subclass");
        } else {
          expect(rule.assigned_code_level).toBe("class");
        }
      }
    });
  });
});

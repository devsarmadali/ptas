import { describe, expect, it } from "vitest";
import {
  evaluateStatutoryRate,
  getAllStatutoryRules,
  getRulesByCategory,
  getStatutoryCategories,
  getStatutoryRuleById,
  getStatutoryRuleBySubclassification,
  matchStatutoryRule
} from "../src/statutory-rules.js";

describe("Punjab Professional Tax Statutory Rules (Second Schedule, Section 3)", () => {
  it("loads all 47 official statutory rules from the Second Schedule", () => {
    const rules = getAllStatutoryRules();
    expect(rules).toHaveLength(47);
  });

  it("identifies all 11 schedule categories", () => {
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

  describe("Entry 1: Companies registered under Companies Act 2017", () => {
    it("returns correct statutory rates based on paid-up capital", () => {
      expect(evaluateStatutoryRate("PFT-1.i")).toBe(10000);
      expect(evaluateStatutoryRate("PFT-1.ii")).toBe(30000);
      expect(evaluateStatutoryRate("PFT-1.iii")).toBe(70000);
      expect(evaluateStatutoryRate("PFT-1.iv")).toBe(100000);
      expect(evaluateStatutoryRate("PFT-1.v")).toBe(100000);
    });

    it("matches rule based on paid-up capital criteria", () => {
      const match1 = matchStatutoryRule({ categoryCode: "1", paidUpCapitalPkr: 2000000 });
      expect(match1?.rule_id).toBe("PFT-1.i");
      expect(match1?.annual_rate_pkr).toBe(10000);

      const match2 = matchStatutoryRule({ categoryCode: "1", paidUpCapitalPkr: 25000000 });
      expect(match2?.rule_id).toBe("PFT-1.ii");
      expect(match2?.annual_rate_pkr).toBe(30000);
    });
  });

  describe("Entry 2: Factories (persons other than companies)", () => {
    it("returns correct rates based on employee count", () => {
      expect(evaluateStatutoryRate("PFT-2.i")).toBe(1500);
      expect(evaluateStatutoryRate("PFT-2.ii")).toBe(5000);
      expect(evaluateStatutoryRate("PFT-2.iii")).toBe(7500);
    });
  });

  describe("Entry 3: Commercial Establishments (persons other than companies)", () => {
    it("contains ONLY rates of 6,000, 4,000, and 2,000 - ZERO entries with 5,000 rate", () => {
      const cat3Rules = getRulesByCategory("3");
      expect(cat3Rules).toHaveLength(3);

      const rates = cat3Rules.map((r) => r.annual_rate_pkr);
      expect(rates).toEqual([6000, 4000, 2000]);

      // Strict domain rule: NO commercial establishment has a 5,000 rate
      expect(rates).not.toContain(5000);
    });

    it("evaluates 3(i)(a) for Metropolitan/MC limits (PKR 6,000)", () => {
      const rule = getStatutoryRuleById("PFT-3.i.a");
      expect(rule?.subclassification_code).toBe("3(i)(a)");
      expect(rule?.annual_rate_pkr).toBe(6000);
    });

    it("evaluates 3(i)(b) for 10+ employees Others e.g. Vehari (PKR 4,000)", () => {
      const rule = getStatutoryRuleById("PFT-3.i.b");
      expect(rule?.subclassification_code).toBe("3(i)(b)");
      expect(rule?.annual_rate_pkr).toBe(4000);
    });

    it("evaluates 3(ii) for other commercial establishments (PKR 2,000)", () => {
      const rule = getStatutoryRuleById("PFT-3.ii");
      expect(rule?.subclassification_code).toBe("3(ii)");
      expect(rule?.annual_rate_pkr).toBe(2000);
    });

    it("matches Commercial Establishment criteria accurately", () => {
      const mcEstablishment = matchStatutoryRule({
        categoryCode: "3",
        employeeCount: 15,
        locationScope: "METROPOLITAN_OR_MUNICIPAL_CORPORATION"
      });
      expect(mcEstablishment?.rule_id).toBe("PFT-3.i.a");
      expect(mcEstablishment?.annual_rate_pkr).toBe(6000);

      const vehariEstablishment = matchStatutoryRule({
        categoryCode: "3",
        employeeCount: 12,
        locationScope: "OTHER"
      });
      expect(vehariEstablishment?.rule_id).toBe("PFT-3.i.b");
      expect(vehariEstablishment?.annual_rate_pkr).toBe(4000);

      const smallShop = matchStatutoryRule({
        categoryCode: "3",
        employeeCount: 3
      });
      expect(smallShop?.rule_id).toBe("PFT-3.ii");
      expect(smallShop?.annual_rate_pkr).toBe(2000);
    });
  });

  describe("Entry 6: Professions and Service Providers", () => {
    it("evaluates Medical Consultants as PKR 5,000 and Registered Medical Practitioners as PKR 4,000", () => {
      expect(evaluateStatutoryRate("PFT-6.i")).toBe(5000);
      expect(evaluateStatutoryRate("PFT-6.ii")).toBe(4000);
    });

    it("evaluates Pesticide Dealers (6(x)) as PKR 2,000", () => {
      const rule = getStatutoryRuleById("PFT-6.x");
      expect(rule?.annual_rate_pkr).toBe(2000);
    });

    it("evaluates Motor Vehicle Dealers & Real Estate Agents (6(vii)(d))", () => {
      expect(evaluateStatutoryRate("PFT-6.vii.d.i")).toBe(20000); // Metro/MC
      expect(evaluateStatutoryRate("PFT-6.vii.d.ii")).toBe(10000); // Others
    });
  });

  describe("Flat Rate Categories (7, 8, 9, 10, 11)", () => {
    it("evaluates Entry 7 (Franchisees/Authorized Dealers) at flat PKR 5,000", () => {
      expect(evaluateStatutoryRate("PFT-7")).toBe(5000);
    });

    it("evaluates Entry 8 (Property Developers) at flat PKR 50,000", () => {
      expect(evaluateStatutoryRate("PFT-8")).toBe(50000);
    });

    it("evaluates Entry 9 (Hotels/Resorts) at flat PKR 5,000", () => {
      expect(evaluateStatutoryRate("PFT-9")).toBe(5000);
    });

    it("evaluates Entry 10 (AC Food Establishments) at flat PKR 5,000", () => {
      expect(evaluateStatutoryRate("PFT-10")).toBe(5000);
    });

    it("evaluates Entry 11 (Income Tax Assessees) at flat PKR 200", () => {
      expect(evaluateStatutoryRate("PFT-11")).toBe(200);
    });
  });

  describe("Error handling and lookups", () => {
    it("throws for unknown rule ID", () => {
      expect(() => evaluateStatutoryRate("UNKNOWN-RULE")).toThrow(/does not exist/);
    });

    it("retrieves rule by subclassification code", () => {
      const rule = getStatutoryRuleBySubclassification("3(i)(b)");
      expect(rule?.rule_id).toBe("PFT-3.i.b");
      expect(rule?.annual_rate_pkr).toBe(4000);
    });
  });
});

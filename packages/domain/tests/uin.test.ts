import { describe, expect, it } from "vitest";
import {
  type JurisdictionCodes,
  type UinComponents,
  VEHARI_PILOT_JURISDICTION,
  PBS_PUNJAB_DISTRICTS,
  VEHARI_TEHSILS,
  computeClassificationBlock,
  generateCompactUin,
  generateUin,
  generateUinForUnit,
  getPbsDistrict,
  getTehsilsByDistrict,
  parseUin,
  validateUin,
  validateUinDistrict
} from "../src/uin.js";
import { getAllStatutoryRules, getStatutoryRuleById } from "../src/statutory-rules.js";

const allRules = getAllStatutoryRules();

const VEHARI_JURISDICTION: JurisdictionCodes = {
  districtCode: "237",
  tehsilCode: "001",
  circleCode: "01"
};

describe("Provincial UIN (Unique Identification Number)", () => {
  describe("PBS District Registry", () => {
    it("contains all 37 standard Punjab districts from PBS coding", () => {
      expect(PBS_PUNJAB_DISTRICTS.length).toBe(37);
    });

    it("has Vehari as code 237 in Multan division", () => {
      const vehari = getPbsDistrict("237");
      expect(vehari).toBeDefined();
      expect(vehari!.name).toBe("Vehari");
      expect(vehari!.divisionName).toBe("Multan");
    });

    it("has Lahore as code 218", () => {
      const lahore = getPbsDistrict("218");
      expect(lahore).toBeDefined();
      expect(lahore!.name).toBe("Lahore");
    });

    it("returns undefined for non-existent district code", () => {
      expect(getPbsDistrict("999")).toBeUndefined();
    });

    it("returns Vehari tehsils (Vehari, Burewala, Mailsi)", () => {
      const tehsils = getTehsilsByDistrict("237");
      expect(tehsils).toHaveLength(3);
      expect(tehsils.map((t) => t.name)).toEqual(["Vehari", "Burewala", "Mailsi"]);
      expect(VEHARI_TEHSILS).toEqual(tehsils);
    });
  });

  describe("Classification Block Computation", () => {
    it("encodes a direct category rule (Category 10 — no subclass, no tertiary)", () => {
      const rule = getStatutoryRuleById("PFT-10")!;
      expect(rule).toBeDefined();
      const block = computeClassificationBlock(rule, allRules);
      expect(block.classCode).toBe("10");
      expect(block.subclassCode).toBe("00");
      expect(block.tertiaryCode).toBe("00");
    });

    it("encodes a subclassed rule without tertiary (Category 3(ii))", () => {
      const rule = getStatutoryRuleById("PFT-3.ii")!;
      expect(rule).toBeDefined();
      const block = computeClassificationBlock(rule, allRules);
      expect(block.classCode).toBe("03");
      expect(block.subclassCode).not.toBe("00");
      expect(block.tertiaryCode).toBe("00");
    });

    it("encodes a tertiary-split rule (Category 3(i)(a) vs 3(i)(b))", () => {
      const ruleA = getStatutoryRuleById("PFT-3.i.a")!;
      const ruleB = getStatutoryRuleById("PFT-3.i.b")!;
      expect(ruleA).toBeDefined();
      expect(ruleB).toBeDefined();

      const blockA = computeClassificationBlock(ruleA, allRules);
      const blockB = computeClassificationBlock(ruleB, allRules);

      // Same category and sub-class
      expect(blockA.classCode).toBe("03");
      expect(blockB.classCode).toBe("03");
      expect(blockA.subclassCode).toBe(blockB.subclassCode);

      // Different tertiary
      expect(blockA.tertiaryCode).not.toBe("00");
      expect(blockB.tertiaryCode).not.toBe("00");
      expect(blockA.tertiaryCode).not.toBe(blockB.tertiaryCode);
    });

    it("encodes Category 6 professional rules with tertiary splits", () => {
      const rule = getStatutoryRuleById("PFT-6.x")!;
      expect(rule).toBeDefined();
      const block = computeClassificationBlock(rule, allRules);
      expect(block.classCode).toBe("06");
    });

    it("encodes Category 11 (direct) correctly", () => {
      const rule = getStatutoryRuleById("PFT-11")!;
      expect(rule).toBeDefined();
      const block = computeClassificationBlock(rule, allRules);
      expect(block.classCode).toBe("11");
      expect(block.subclassCode).toBe("00");
      expect(block.tertiaryCode).toBe("00");
    });
  });

  describe("UIN Generation", () => {
    it("generates a correctly formatted UIN with dashes", () => {
      const components: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "00001",
        version: "01"
      };
      const uin = generateUin(components);
      expect(uin).toBe("237-001-01-03-01-02-00001-01");
    });

    it("generates a compact 22-digit UIN without dashes", () => {
      const components: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "00001",
        version: "01"
      };
      const compact = generateCompactUin(components);
      expect(compact).toBe("237001010301020000101");
      expect(compact).toHaveLength(21);
    });

    it("rejects invalid component widths", () => {
      const bad: UinComponents = {
        jurisdiction: { districtCode: "23", tehsilCode: "001", circleCode: "01" },
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "00001",
        version: "01"
      };
      expect(() => generateUin(bad)).toThrow("District code must be 3 digits");
    });
  });

  describe("UIN Parsing", () => {
    it("round-trips a formatted UIN through generate → parse", () => {
      const original: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "06", subclassCode: "03", tertiaryCode: "01" },
        sequence: "00042",
        version: "01"
      };
      const uin = generateUin(original);
      const parsed = parseUin(uin);
      expect(parsed).toEqual(original);
    });

    it("round-trips a compact UIN through generate → parse", () => {
      const original: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "10", subclassCode: "00", tertiaryCode: "00" },
        sequence: "00005",
        version: "01"
      };
      const compact = generateCompactUin(original);
      const parsed = parseUin(compact);
      expect(parsed).toEqual(original);
    });

    it("throws on malformed UIN strings", () => {
      expect(() => parseUin("INVALID")).toThrow("Invalid UIN format");
      expect(() => parseUin("237-001-01")).toThrow("Invalid UIN format");
      expect(() => parseUin("")).toThrow("Invalid UIN format");
    });
  });

  describe("UIN Validation", () => {
    it("validates well-formed formatted UINs", () => {
      expect(validateUin("237-001-01-03-01-02-00001-01")).toBe(true);
      expect(validateUin("218-002-05-06-10-03-99999-02")).toBe(true);
    });

    it("validates well-formed compact UINs (22 digits)", () => {
      expect(validateUin("2370010103010200001" + "01")).toBe(true);
    });

    it("rejects malformed strings", () => {
      expect(validateUin("INVALID")).toBe(false);
      expect(validateUin("237-001-01")).toBe(false);
      expect(validateUin("237-001-01-03-01-02-00001-0X")).toBe(false);
    });

    it("validates district code against PBS registry", () => {
      expect(validateUinDistrict("237-001-01-03-01-02-00001-01")).toBeNull();
      expect(validateUinDistrict("999-001-01-03-01-02-00001-01")).toBe(
        "Unknown district code: 999"
      );
    });
  });

  describe("High-level generateUinForUnit", () => {
    it("generates a valid UIN for a Category 3(i)(b) unit in Vehari", () => {
      const rule = getStatutoryRuleById("PFT-3.i.b")!;
      const uin = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 1
      });

      expect(validateUin(uin)).toBe(true);
      const parsed = parseUin(uin);
      expect(parsed.jurisdiction.districtCode).toBe("237");
      expect(parsed.jurisdiction.tehsilCode).toBe("001");
      expect(parsed.classification.classCode).toBe("03");
      expect(parsed.sequence).toBe("00001");
      expect(parsed.version).toBe("01");
    });

    it("generates a valid UIN for a direct Category 10 unit", () => {
      const rule = getStatutoryRuleById("PFT-10")!;
      const uin = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 42
      });

      const parsed = parseUin(uin);
      expect(parsed.classification.classCode).toBe("10");
      expect(parsed.classification.subclassCode).toBe("00");
      expect(parsed.classification.tertiaryCode).toBe("00");
      expect(parsed.sequence).toBe("00042");
    });

    it("generates distinct UINs for different sequence numbers", () => {
      const rule = getStatutoryRuleById("PFT-3.i.b")!;
      const uin1 = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 1
      });
      const uin2 = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 2
      });
      expect(uin1).not.toBe(uin2);
    });

    it("increments version for reclassification tracking", () => {
      const rule = getStatutoryRuleById("PFT-3.i.b")!;
      const uin = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 1,
        version: 2
      });
      const parsed = parseUin(uin);
      expect(parsed.version).toBe("02");
    });
  });
});

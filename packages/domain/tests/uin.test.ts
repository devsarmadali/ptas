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
  validateUinDistrict,
  isPotentialPin,
  isPft3Pin,
  promotePinToPft3,
  revertPinToPotential,
  getBasePin
} from "../src/uin.js";
import { getAllStatutoryRules, getStatutoryRuleById } from "../src/statutory-rules.js";

const allRules = getAllStatutoryRules();

const VEHARI_JURISDICTION: JurisdictionCodes = {
  districtCode: "237",
  tehsilCode: "001",
  circleCode: "01"
};

describe("Provincial UIN (Unique Identification Number) / Statutory PIN", () => {
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

  describe("UIN / PIN Generation", () => {
    it("generates a correctly formatted 25-character PIN with dashes and 7-digit sequence", () => {
      const components: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "0000001",
        version: "02"
      };
      const uin = generateUin(components);
      expect(uin).toBe("237-001010301020000001-02");
      expect(uin).toHaveLength(25);
    });

    it("generates Potential Register PIN with version -01", () => {
      const components: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "06", subclassCode: "11", tertiaryCode: "02" },
        sequence: "0000042",
        version: "01"
      };
      const uin = generateUin(components);
      expect(uin).toBe("237-001010611020000042-01");
      expect(uin).toHaveLength(25);
      expect(isPotentialPin(uin)).toBe(true);
      expect(isPft3Pin(uin)).toBe(false);
    });

    it("generates a compact 23-digit UIN without dashes", () => {
      const components: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "0000001",
        version: "02"
      };
      const compact = generateCompactUin(components);
      expect(compact).toBe("23700101030102000000102");
      expect(compact).toHaveLength(23);
    });

    it("rejects invalid component widths or version", () => {
      const badDistrict: UinComponents = {
        jurisdiction: { districtCode: "23", tehsilCode: "001", circleCode: "01" },
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "0000001",
        version: "01"
      };
      expect(() => generateUin(badDistrict)).toThrow("District code must be 3 digits");

      const badSeq: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "03", subclassCode: "01", tertiaryCode: "02" },
        sequence: "0001", // only 4 digits
        version: "01"
      };
      expect(() => generateUin(badSeq)).toThrow("Sequence must be 7 digits");
    });
  });

  describe("UIN Parsing", () => {
    it("round-trips a formatted UIN through generate → parse", () => {
      const original: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "06", subclassCode: "03", tertiaryCode: "01" },
        sequence: "0000042",
        version: "02"
      };
      const uin = generateUin(original);
      const parsed = parseUin(uin);
      expect(parsed).toEqual(original);
    });

    it("round-trips a compact UIN through generate → parse", () => {
      const original: UinComponents = {
        jurisdiction: VEHARI_JURISDICTION,
        classification: { classCode: "10", subclassCode: "00", tertiaryCode: "00" },
        sequence: "0000005",
        version: "01"
      };
      const compact = generateCompactUin(original);
      const parsed = parseUin(compact);
      expect(parsed).toEqual(original);
    });

    it("throws on malformed UIN strings", () => {
      expect(() => parseUin("INVALID")).toThrow("Invalid PIN / UIN format");
      expect(() => parseUin("237-001-01")).toThrow("Invalid PIN / UIN format");
      expect(() => parseUin("237-001010611020000001-03")).toThrow("Invalid PIN / UIN format");
      expect(() => parseUin("")).toThrow("Invalid PIN / UIN format");
    });
  });

  describe("UIN Validation", () => {
    it("validates well-formed 25-character formatted PINs (-01 and -02)", () => {
      expect(validateUin("237-001010301020000001-01")).toBe(true);
      expect(validateUin("237-001010301020000001-02")).toBe(true);
      expect(validateUin("218-002050610030099999-02")).toBe(true);
    });

    it("validates well-formed compact PINs (23 digits)", () => {
      expect(validateUin("23700101030102000000101")).toBe(true);
      expect(validateUin("23700101030102000000102")).toBe(true);
    });

    it("rejects malformed strings or invalid versions", () => {
      expect(validateUin("INVALID")).toBe(false);
      expect(validateUin("237-001-01")).toBe(false);
      expect(validateUin("237-001010301020000001-03")).toBe(false);
      expect(validateUin("237-001010301020000001-0X")).toBe(false);
    });

    it("validates district code against PBS registry", () => {
      expect(validateUinDistrict("237-001010301020000001-01")).toBeNull();
      expect(validateUinDistrict("237-001010301020000001-02")).toBeNull();
      expect(validateUinDistrict("999-001010301020000001-01")).toBe("Unknown district code: 999");
    });
  });

  describe("Register Transition Helpers", () => {
    it("promotes Potential PIN (-01) to Form PFT-3 PIN (-02)", () => {
      const potPin = "237-001010611020000001-01";
      expect(isPotentialPin(potPin)).toBe(true);
      expect(isPft3Pin(potPin)).toBe(false);

      const pft3Pin = promotePinToPft3(potPin);
      expect(pft3Pin).toBe("237-001010611020000001-02");
      expect(isPft3Pin(pft3Pin)).toBe(true);
      expect(isPotentialPin(pft3Pin)).toBe(false);
    });

    it("reverts Form PFT-3 PIN (-02) back to Potential PIN (-01)", () => {
      const pft3Pin = "237-001010611020000001-02";
      const potPin = revertPinToPotential(pft3Pin);
      expect(potPin).toBe("237-001010611020000001-01");
      expect(isPotentialPin(potPin)).toBe(true);
    });

    it("extracts immutable base PIN identical for both registers", () => {
      const potPin = "237-001010611020000001-01";
      const pft3Pin = "237-001010611020000001-02";
      expect(getBasePin(potPin)).toBe("237-001010611020000001");
      expect(getBasePin(pft3Pin)).toBe("237-001010611020000001");
      expect(getBasePin(potPin)).toBe(getBasePin(pft3Pin));
    });
  });

  describe("High-level generateUinForUnit", () => {
    it("generates a valid Form PFT-3 PIN by default (-02) with 7-digit sequence", () => {
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
      expect(parsed.sequence).toBe("0000001");
      expect(parsed.version).toBe("02");
    });

    it("generates a valid Potential PIN when version '01' is requested", () => {
      const rule = getStatutoryRuleById("PFT-10")!;
      const uin = generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule,
        allRules,
        sequenceNumber: 42,
        version: "01"
      });

      const parsed = parseUin(uin);
      expect(parsed.classification.classCode).toBe("10");
      expect(parsed.classification.subclassCode).toBe("00");
      expect(parsed.classification.tertiaryCode).toBe("00");
      expect(parsed.sequence).toBe("0000042");
      expect(parsed.version).toBe("01");
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
  });
});

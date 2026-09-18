import { describe, expect, it } from "vitest";
import {
  Jurisdiction,
  validateJurisdictionHierarchy,
  getJurisdictionAncestors,
  getJurisdictionDescendantIds,
  isDescendantOrSelf,
  isJurisdictionActive
} from "../src/jurisdiction.js";

const sampleHierarchy: readonly Jurisdiction[] = [
  {
    id: "reg-lahore",
    type: "REGION",
    code: "REG_LHR",
    name: "Lahore Region",
    parentId: null,
    activeFrom: "2020-01-01",
    activeTo: null
  },
  {
    id: "dist-lahore",
    type: "DISTRICT",
    code: "DIST_LHR",
    name: "Lahore District",
    parentId: "reg-lahore",
    activeFrom: "2020-01-01",
    activeTo: null
  },
  {
    id: "off-zone-1",
    type: "OFFICE",
    code: "ETO_ZONE_1",
    name: "ETO Zone 1",
    parentId: "dist-lahore",
    activeFrom: "2020-01-01",
    activeTo: null
  },
  {
    id: "circ-a",
    type: "CIRCLE",
    code: "CIRC_A",
    name: "Circle A",
    parentId: "off-zone-1",
    activeFrom: "2020-01-01",
    activeTo: null
  },
  {
    id: "circ-b",
    type: "CIRCLE",
    code: "CIRC_B",
    name: "Circle B",
    parentId: "off-zone-1",
    activeFrom: "2020-01-01",
    activeTo: null
  }
];

describe("jurisdiction hierarchy", () => {
  it("validates a compliant 4-tier hierarchy", () => {
    const result = validateJurisdictionHierarchy(sampleHierarchy);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a circle attached directly to a region", () => {
    const invalidNodes: Jurisdiction[] = [
      ...sampleHierarchy.filter((n) => n.id !== "circ-a"),
      {
        id: "circ-a",
        type: "CIRCLE",
        code: "CIRC_A",
        name: "Circle A",
        parentId: "reg-lahore", // invalid: CIRCLE must have parent of type OFFICE
        activeFrom: "2020-01-01"
      }
    ];

    const result = validateJurisdictionHierarchy(invalidNodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_PARENT_TYPE")).toBe(true);
  });

  it("rejects circular references", () => {
    const circularNodes: Jurisdiction[] = [
      {
        id: "reg-1",
        type: "REGION",
        code: "REG_1",
        name: "Region 1",
        parentId: "circ-1", // circular
        activeFrom: "2020-01-01"
      },
      {
        id: "dist-1",
        type: "DISTRICT",
        code: "DIST_1",
        name: "District 1",
        parentId: "reg-1",
        activeFrom: "2020-01-01"
      },
      {
        id: "off-1",
        type: "OFFICE",
        code: "OFF_1",
        name: "Office 1",
        parentId: "dist-1",
        activeFrom: "2020-01-01"
      },
      {
        id: "circ-1",
        type: "CIRCLE",
        code: "CIRC_1",
        name: "Circle 1",
        parentId: "off-1",
        activeFrom: "2020-01-01"
      }
    ];

    const result = validateJurisdictionHierarchy(circularNodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
  });

  it("rejects duplicate codes within the same jurisdiction type", () => {
    const duplicateCodeNodes: Jurisdiction[] = [
      ...sampleHierarchy,
      {
        id: "circ-duplicate",
        type: "CIRCLE",
        code: "CIRC_A", // duplicate in CIRCLE
        name: "Circle A Duplicate",
        parentId: "off-zone-1",
        activeFrom: "2020-01-01"
      }
    ];

    const result = validateJurisdictionHierarchy(duplicateCodeNodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_TYPE_CODE")).toBe(true);
  });

  it("rejects child whose active window starts before parent activeFrom", () => {
    const invalidDateNodes: Jurisdiction[] = [
      ...sampleHierarchy.filter((n) => n.id !== "circ-a"),
      {
        id: "circ-a",
        type: "CIRCLE",
        code: "CIRC_A",
        name: "Circle A",
        parentId: "off-zone-1",
        activeFrom: "2018-01-01" // earlier than off-zone-1 (2020-01-01)
      }
    ];

    const result = validateJurisdictionHierarchy(invalidDateNodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "ACTIVE_BEFORE_PARENT")).toBe(true);
  });

  it("evaluates jurisdiction active status accurately", () => {
    const jurisdiction: Jurisdiction = {
      id: "test",
      type: "CIRCLE",
      code: "C1",
      name: "Circle 1",
      parentId: null,
      activeFrom: "2025-01-01",
      activeTo: "2025-12-31"
    };

    expect(isJurisdictionActive(jurisdiction, "2024-12-31")).toBe(false);
    expect(isJurisdictionActive(jurisdiction, "2025-06-01")).toBe(true);
    expect(isJurisdictionActive(jurisdiction, "2026-01-01")).toBe(false);
  });

  it("traverses ancestors correctly up to root", () => {
    const ancestors = getJurisdictionAncestors("circ-a", sampleHierarchy);
    expect(ancestors.map((a) => a.id)).toEqual(["off-zone-1", "dist-lahore", "reg-lahore"]);
  });

  it("resolves all descendants correctly from any level", () => {
    const districtDescendants = getJurisdictionDescendantIds("dist-lahore", sampleHierarchy);
    expect(districtDescendants).toContain("dist-lahore");
    expect(districtDescendants).toContain("off-zone-1");
    expect(districtDescendants).toContain("circ-a");
    expect(districtDescendants).toContain("circ-b");
    expect(districtDescendants).not.toContain("reg-lahore");
  });

  it("checks descendant-or-self relationship reliably", () => {
    expect(isDescendantOrSelf("circ-a", "reg-lahore", sampleHierarchy)).toBe(true);
    expect(isDescendantOrSelf("circ-a", "dist-lahore", sampleHierarchy)).toBe(true);
    expect(isDescendantOrSelf("circ-a", "off-zone-1", sampleHierarchy)).toBe(true);
    expect(isDescendantOrSelf("circ-a", "circ-a", sampleHierarchy)).toBe(true);
    expect(isDescendantOrSelf("circ-a", "circ-b", sampleHierarchy)).toBe(false);
    expect(isDescendantOrSelf("reg-lahore", "circ-a", sampleHierarchy)).toBe(false);
  });
});

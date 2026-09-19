import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, hasExactDuplicate } from "../src/duplicate-detector.js";
import { createTaxpayer } from "../src/taxpayer.js";
import type { AuditActor } from "../src/audit.js";

const TEST_ACTOR: AuditActor = {
  userId: "usr-eto-1",
  roleCode: "ETO",
  jurisdictionId: "dist-lhr"
};

describe("duplicate candidate detection", () => {
  const existing1 = createTaxpayer(
    {
      id: "tp-001",
      displayName: "Al-Rehman Pharmacy",
      currentCircleId: "circle-01",
      identifiers: [
        {
          identifierType: "CNIC",
          value: "35201-1111111-1"
        }
      ]
    },
    TEST_ACTOR
  );

  const existing2 = createTaxpayer(
    {
      id: "tp-002",
      displayName: "Punjab Logistics Services",
      currentCircleId: "circle-02",
      identifiers: [
        {
          identifierType: "NTN",
          value: "9988776-5"
        }
      ]
    },
    TEST_ACTOR
  );

  const existingTaxpayers = [existing1, existing2];

  it("surfaces EXACT match when candidate shares an identical identifier", () => {
    const candidate = {
      displayName: "Different Trading Name",
      currentCircleId: "circle-03",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "3520111111111" // same CNIC without hyphens
        }
      ]
    };

    const duplicates = findDuplicateCandidates(candidate, existingTaxpayers);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.existingTaxpayerId).toBe("tp-001");
    expect(duplicates[0]?.confidence).toBe("EXACT");
    expect(duplicates[0]?.matchReason).toContain("Exact identifier match on CNIC");
    expect(duplicates[0]?.matchReason).toContain("35201*******1");
    expect(hasExactDuplicate(duplicates)).toBe(true);
  });

  it("surfaces HIGH match when candidate has identical display name in same circle", () => {
    const candidate = {
      displayName: "Al-Rehman Pharmacy",
      currentCircleId: "circle-01",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "35201-2222222-2"
        }
      ]
    };

    const duplicates = findDuplicateCandidates(candidate, existingTaxpayers);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.existingTaxpayerId).toBe("tp-001");
    expect(duplicates[0]?.confidence).toBe("HIGH");
    expect(duplicates[0]?.matchReason).toContain("Identical taxpayer name in the same circle");
    expect(hasExactDuplicate(duplicates)).toBe(false);
  });

  it("surfaces MEDIUM match when candidate has identical name registered in another circle", () => {
    const candidate = {
      displayName: "Al-Rehman Pharmacy",
      currentCircleId: "circle-09",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "35201-3333333-3"
        }
      ]
    };

    const duplicates = findDuplicateCandidates(candidate, existingTaxpayers);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.existingTaxpayerId).toBe("tp-001");
    expect(duplicates[0]?.confidence).toBe("MEDIUM");
    expect(duplicates[0]?.matchReason).toContain(
      "Identical taxpayer name registered in another circle"
    );
  });

  it("surfaces MEDIUM match when candidate has high name similarity in same circle", () => {
    const candidate = {
      displayName: "Al-Rehman Pharmacy Store",
      currentCircleId: "circle-01",
      identifiers: []
    };

    const duplicates = findDuplicateCandidates(candidate, existingTaxpayers);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.existingTaxpayerId).toBe("tp-001");
    expect(duplicates[0]?.confidence).toBe("MEDIUM");
    expect(duplicates[0]?.matchReason).toContain("High name similarity");
  });

  it("returns empty array for non-duplicate distinct candidate", () => {
    const distinctCandidate = {
      displayName: "Khyber Book Depot",
      currentCircleId: "circle-05",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "35201-4444444-4"
        }
      ]
    };

    const duplicates = findDuplicateCandidates(distinctCandidate, existingTaxpayers);
    expect(duplicates).toHaveLength(0);
    expect(hasExactDuplicate(duplicates)).toBe(false);
  });

  it("ignores self-comparison when candidate.id matches existing taxpayer", () => {
    const candidateSelf = {
      id: "tp-001",
      displayName: "Al-Rehman Pharmacy",
      currentCircleId: "circle-01",
      identifiers: [
        {
          identifierType: "CNIC" as const,
          value: "35201-1111111-1"
        }
      ]
    };

    const duplicates = findDuplicateCandidates(candidateSelf, existingTaxpayers);
    expect(duplicates).toHaveLength(0);
  });
});

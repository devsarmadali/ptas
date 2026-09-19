import { describe, expect, it } from "vitest";
import {
  createTaxpayer,
  maskIdentifier,
  normalizeIdentifier,
  validateIdentifier
} from "../src/taxpayer.js";
import type { AuditActor } from "../src/audit.js";

const TEST_ACTOR: AuditActor = {
  userId: "usr-inspector-1",
  roleCode: "INSPECTOR",
  jurisdictionId: "circle-lhr-01"
};

describe("taxpayer identifier normalization and validation", () => {
  it("normalizes and validates 13-digit CNIC in hyphenated or raw format", () => {
    const rawHyphenated = "35201-1234567-1";
    const normalized = normalizeIdentifier("CNIC", rawHyphenated);
    expect(normalized).toBe("3520112345671");
    expect(validateIdentifier("CNIC", rawHyphenated).valid).toBe(true);

    const rawDigits = "3520112345671";
    expect(normalizeIdentifier("CNIC", rawDigits)).toBe("3520112345671");
  });

  it("rejects invalid CNIC length or non-digit input", () => {
    expect(() => normalizeIdentifier("CNIC", "35201-123456")).toThrow(
      "CNIC must contain exactly 13 digits"
    );
    expect(() => normalizeIdentifier("CNIC", "35201-1234567-123")).toThrow(
      "CNIC must contain exactly 13 digits"
    );
    expect(validateIdentifier("CNIC", "invalid-cnic").valid).toBe(false);
  });

  it("normalizes NTN by stripping hyphens and checking digit bounds", () => {
    const rawNtn = "1234567-8";
    expect(normalizeIdentifier("NTN", rawNtn)).toBe("12345678");
    expect(validateIdentifier("NTN", rawNtn).valid).toBe(true);
  });

  it("rejects empty identifier values", () => {
    expect(() => normalizeIdentifier("CNIC", "   ")).toThrow("cannot be empty");
  });
});

describe("taxpayer identifier masking", () => {
  it("masks CNIC preserving first 5 and last 1 digits", () => {
    const masked = maskIdentifier("CNIC", "3520112345671");
    expect(masked).toBe("35201*******1");
  });

  it("masks NTN preserving first 4 and last digit", () => {
    const masked = maskIdentifier("NTN", "12345678");
    expect(masked).toBe("1234***-8");
  });

  it("masks alphanumeric registrations preserving start and end", () => {
    const masked = maskIdentifier("REGISTRATION_NO", "ABC12345XYZ");
    expect(masked).toBe("AB*******YZ");
  });
});

describe("taxpayer entity creation", () => {
  it("creates an immutable synthetic taxpayer with normalized and masked identifiers", () => {
    const taxpayer = createTaxpayer(
      {
        displayName: "Lahore Traders Corp",
        currentCircleId: "circle-lhr-01",
        identifiers: [
          {
            identifierType: "CNIC",
            value: "35201-7654321-1"
          },
          {
            identifierType: "NTN",
            value: "7654321-9"
          }
        ]
      },
      TEST_ACTOR,
      new Date("2026-07-01T09:00:00.000Z")
    );

    expect(taxpayer.displayName).toBe("Lahore Traders Corp");
    expect(taxpayer.status).toBe("DRAFT");
    expect(taxpayer.currentCircleId).toBe("circle-lhr-01");
    expect(taxpayer.createdBy).toBe("usr-inspector-1");
    expect(taxpayer.createdAt).toBe("2026-07-01T09:00:00.000Z");
    expect(taxpayer.rowVersion).toBe(1);

    expect(taxpayer.identifiers).toHaveLength(2);
    const cnic = taxpayer.identifiers.find((i) => i.identifierType === "CNIC");
    expect(cnic).toBeDefined();
    expect(cnic?.normalizedValue).toBe("3520176543211");
    expect(cnic?.maskedValue).toBe("35201*******1");

    const ntn = taxpayer.identifiers.find((i) => i.identifierType === "NTN");
    expect(ntn).toBeDefined();
    expect(ntn?.normalizedValue).toBe("76543219");
    expect(ntn?.maskedValue).toBe("7654***-9");

    expect(Object.isFrozen(taxpayer)).toBe(true);
    expect(Object.isFrozen(taxpayer.identifiers)).toBe(true);
  });

  it("rejects taxpayer creation with empty display name", () => {
    expect(() =>
      createTaxpayer(
        {
          displayName: "   ",
          currentCircleId: "circle-lhr-01"
        },
        TEST_ACTOR
      )
    ).toThrow("displayName cannot be empty");
  });

  it("rejects taxpayer creation with missing circle jurisdiction", () => {
    expect(() =>
      createTaxpayer(
        {
          displayName: "Valid Name",
          currentCircleId: "  "
        },
        TEST_ACTOR
      )
    ).toThrow("currentCircleId is required");
  });
});

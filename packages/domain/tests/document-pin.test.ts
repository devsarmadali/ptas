import { describe, expect, it } from "vitest";
import {
  generateDocumentPin,
  normalizeDocumentPin,
  validateDocumentPin
} from "../src/document-pin.js";

describe("Document Security PIN Module", () => {
  it("generates a valid 6-digit numeric PIN", () => {
    const pin = generateDocumentPin();
    expect(pin).toHaveLength(6);
    expect(/^\d{6}$/.test(pin)).toBe(true);
    expect(validateDocumentPin(pin)).toBe(true);
  });

  it("generates deterministic PINs for the same seed", () => {
    const pin1 = generateDocumentPin("PFT2-2026-0001");
    const pin2 = generateDocumentPin("PFT2-2026-0001");
    expect(pin1).toBe(pin2);
    expect(pin1).toHaveLength(6);
    expect(validateDocumentPin(pin1)).toBe(true);
  });

  it("generates different PINs for different seeds", () => {
    const pinA = generateDocumentPin("DOC-A");
    const pinB = generateDocumentPin("DOC-B");
    expect(pinA).not.toBe(pinB);
  });

  it("validates legitimate 6-digit PINs", () => {
    expect(validateDocumentPin("123456")).toBe(true);
    expect(validateDocumentPin("987654")).toBe(true);
    expect(validateDocumentPin("PIN: 481920")).toBe(true);
    expect(validateDocumentPin("PIN-592014")).toBe(true);
  });

  it("rejects invalid PIN formats", () => {
    expect(validateDocumentPin("")).toBe(false);
    expect(validateDocumentPin("123")).toBe(false);
    expect(validateDocumentPin("1234567")).toBe(false);
    expect(validateDocumentPin("ABCDEF")).toBe(false);
    expect(validateDocumentPin("012345")).toBe(false);
  });

  it("normalizes PIN strings properly", () => {
    expect(normalizeDocumentPin("PIN: 849201")).toBe("849201");
    expect(normalizeDocumentPin(" PIN-481920 ")).toBe("481920");
    expect(normalizeDocumentPin("748 192")).toBe("748192");
  });
});

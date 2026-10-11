/**
 * PTAS Document Security Code Module
 * Generates and validates official 6-digit Document Security Codes
 * embedded on all issued notices, challans, and certificates for citizen verification.
 */

import { createHash } from "node:crypto";

function getRandomSixDigitNumber(): number {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    const val = array[0] ?? 0;
    return 100000 + (val % 900000);
  }
  return Math.floor(100000 + Math.random() * 900000);
}

/**
 * Generates a deterministic or cryptographically pseudo-random 6-digit Document Security Code (100000 - 999999).
 * If a seed string or number is provided, generates a reproducible code using SHA-256 digest.
 */
export function generateDocumentPin(seed?: string | number, secretKey?: string): string {
  if (seed !== undefined && seed !== null && seed !== "") {
    const hash = createHash("sha256")
      .update(secretKey ? `${secretKey}:${String(seed)}` : String(seed), "utf8")
      .digest();
    const num = 100000 + (hash.readUInt32BE(0) % 900000);
    return String(num);
  }
  return String(getRandomSixDigitNumber());
}

/**
 * Validates whether a candidate string is a well-formed 6-digit Document Security Code.
 */
export function validateDocumentPin(pin: string): boolean {
  if (!pin || typeof pin !== "string") return false;
  const clean = pin.trim().replace(/^PIN[-:]?\s*/i, "");
  return /^[1-9]\d{5}$/.test(clean);
}

/**
 * Normalizes a candidate Document Security Code by removing formatting, prefixes, and whitespace.
 */
export function normalizeDocumentPin(pin: string): string {
  if (!pin) return "";
  return pin
    .trim()
    .replace(/^PIN[-:]?\s*/i, "")
    .replace(/\s+/g, "");
}

/** Canonical system-wide aliases: Document Security Code */
export const generateSecurityCode = generateDocumentPin;
export const validateSecurityCode = validateDocumentPin;
export const normalizeSecurityCode = normalizeDocumentPin;

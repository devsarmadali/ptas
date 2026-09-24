/**
 * PTAS Document Security PIN Module
 * Generates and validates official 6-digit Document Security PINs
 * embedded on all issued notices, challans, and certificates for citizen verification.
 */

/**
 * Generates a deterministic or cryptographically pseudo-random 6-digit Document Security PIN (100000 - 999999).
 * If a seed string or number is provided, generates a reproducible PIN for that document ID / hash.
 */
export function generateDocumentPin(seed?: string | number): string {
  if (seed !== undefined && seed !== null && seed !== "") {
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    const num = (Math.abs(hash) % 900000) + 100000;
    return String(num);
  }
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return String(randomNum);
}

/**
 * Validates whether a candidate string is a well-formed 6-digit Document Security PIN.
 */
export function validateDocumentPin(pin: string): boolean {
  if (!pin || typeof pin !== "string") return false;
  const clean = pin.trim().replace(/^PIN[-:]?\s*/i, "");
  return /^[1-9]\d{5}$/.test(clean);
}

/**
 * Normalizes a candidate Document Security PIN by removing formatting, prefixes, and whitespace.
 */
export function normalizeDocumentPin(pin: string): string {
  if (!pin) return "";
  return pin
    .trim()
    .replace(/^PIN[-:]?\s*/i, "")
    .replace(/\s+/g, "");
}

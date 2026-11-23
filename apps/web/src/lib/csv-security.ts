/**
 * Browser-safe CSV formula-injection neutralization helpers (OWASP CSV Injection mitigation).
 */

const PURE_SIGNED_NUMBER_REGEX = /^[+-]?\d+(?:\.\d+)?$/;
const DANGEROUS_FORMULA_PREFIX_REGEX = /^\s*[=+\-@\t\r]/;

/**
 * Neutralizes Excel / LibreOffice / Google Sheets formula injection prefixes
 * (`=`, `+`, `-`, `@`, TAB, CR) while leaving legitimate signed numeric literals
 * such as `-500` or `4000` untouched.
 */
export function neutralizeCsvFormula(raw: string): string {
  if (!raw) return raw;
  if (PURE_SIGNED_NUMBER_REGEX.test(raw.trim())) {
    return raw;
  }
  if (DANGEROUS_FORMULA_PREFIX_REGEX.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

/**
 * Dynamic Application Base URL and Verification Link Generator
 *
 * Automatically resolves the active runtime domain (window.location.origin,
 * NEXT_PUBLIC_APP_URL, VERCEL_URL, or relative root) so the application functions
 * seamlessly on any domain, localhost, or hosting environment without any hardcoded
 * domain restrictions.
 */

export function getPublicBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    const v = process.env.NEXT_PUBLIC_VERCEL_URL;
    return v.startsWith("http") ? v.replace(/\/$/, "") : `https://${v}`.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return "";
}

/**
 * Builds an absolute or root-relative verification URL for statutory documents,
 * challans, payment receipts, and QR codes.
 */
export function buildVerificationUrl(
  params: Record<string, string | number | undefined | null>
): string {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      query.set(key, String(val).trim());
    }
  }
  const base = getPublicBaseUrl();
  const queryString = query.toString();
  const path = queryString ? `/verify?${queryString}` : "/verify";
  return base ? `${base}${path}` : path;
}

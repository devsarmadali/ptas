import { createHash, randomUUID } from "node:crypto";
import type { OfficialDocumentType } from "./pdf/types";

export const MAX_WORKFLOW_BODY_BYTES = 2 * 1024 * 1024;
const MAX_RATE_LIMIT_BUCKETS = 5_000;

export const ALLOWED_OFFICIAL_DOCUMENT_TYPES = new Set<OfficialDocumentType>([
  "FORM_PFT1_NOTICE",
  "PFT1_DEMAND_NOTICE",
  "FORM_PFT2_CHALLAN",
  "PFT2_CHALLAN",
  "FORM_PFT3_REGISTER",
  "PFT3_ASSESSMENT_REGISTER",
  "SHOW_CAUSE_NOTICE",
  "STATUTORY_RECEIPT",
  "EXECUTIVE_PFT2_BRIEF",
  "STATUTORY_REPORT",
  "STATUTORY_REPORTS",
  "TAX_CLEARANCE_CERTIFICATE",
  "LAND_REVENUE_RECOVERY",
  "APPELLATE_ORDER",
  "UNIT_DOSSIER"
]);

export function createRequestId(): string {
  return randomUUID();
}

export function buildNoStoreHeaders(
  requestId: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
    ...extra
  };
}

export function extractClientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "local";
}

export function hashRateLimitSubject(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function clearRateLimitBuckets(): void {
  rateLimitBuckets.clear();
}

export function checkSlidingWindowRateLimit(
  bucketKey: string,
  options: { readonly limit: number; readonly windowMs: number; readonly nowMs?: number }
): RateLimitResult {
  const now = options.nowMs ?? Date.now();
  const { limit, windowMs } = options;

  if (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    for (const [key, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAtMs <= now) {
        rateLimitBuckets.delete(key);
      }
    }
    while (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      const oldestKey = rateLimitBuckets.keys().next().value;
      if (oldestKey === undefined) break;
      rateLimitBuckets.delete(oldestKey);
    }
  }

  const existing = rateLimitBuckets.get(bucketKey);
  if (!existing || existing.resetAtMs <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAtMs: now + windowMs });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000)
    };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000))
  };
}

export function isAllowedDocumentType(rawType: string): rawType is OfficialDocumentType {
  return ALLOWED_OFFICIAL_DOCUMENT_TYPES.has(rawType.trim().toUpperCase() as OfficialDocumentType);
}

export function sanitizeDocumentId(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (trimmed.includes("..")) return null;
  if (!/^[a-zA-Z0-9._:@-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeDownloadFilename(rawFilename: string): string {
  const cleaned = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "statutory-document.pdf";
}

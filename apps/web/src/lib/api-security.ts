import { createHash, randomUUID } from "node:crypto";
import type { OfficialDocumentType } from "./pdf/types";
export { neutralizeCsvFormula } from "./csv-security";

export const MAX_WORKFLOW_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_WORKFLOW_ARRAY_ITEMS = 5_000;
const MAX_RATE_LIMIT_BUCKETS = 5_000;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const WORKFLOW_ALLOWED_PAYLOAD_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  SURVEY_TRANSITION: new Set([
    "p_unit_id",
    "p_action",
    "p_expected_version",
    "p_idempotency_key",
    "p_correlation_id",
    "p_reason"
  ]),
  REQUEST_DEMAND_DELETION: new Set([
    "p_unit_id",
    "p_demand_unit_id",
    "p_reason",
    "p_expected_version",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  REVIEW_DEMAND_DELETION: new Set([
    "p_request_id",
    "p_unit_id",
    "p_action",
    "p_reason",
    "p_expected_version",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  SHOW_CAUSE_TRANSITION: new Set([
    "p_show_cause_id",
    "p_unit_id",
    "p_action",
    "p_expected_version",
    "p_reason",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  PFT2_TRANSITION: new Set([
    "p_challan_id",
    "p_action",
    "p_expected_version",
    "p_reason",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  RECEIVE_PFT2_PAYMENT: new Set([
    "p_challan_id",
    "p_receipt",
    "p_amount",
    "p_payment_channel",
    "p_bank_branch",
    "p_bank_transaction_id",
    "p_deposit_date",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  STAGE_SURVEY_IMPORT: new Set([
    "p_source_filename",
    "p_file_sha256",
    "p_headers",
    "p_rows",
    "p_idempotency_key",
    "p_correlation_id"
  ]),
  PROMOTE_SURVEY_IMPORT: new Set(["p_batch_id", "p_idempotency_key", "p_correlation_id"]),
  BULK_SUBMIT_SURVEY_IMPORT: new Set(["p_batch_id", "p_idempotency_key", "p_correlation_id"]),
  BULK_APPROVE_SURVEY_IMPORT: new Set([
    "p_batch_id",
    "p_idempotency_key",
    "p_correlation_id",
    "p_reason"
  ])
};

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
  const vercelIp = headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    const hops = vercelIp
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted.slice(0, 64);
  }

  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp.slice(0, 64);

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  // Use the rightmost proxy-appended IP in X-Forwarded-For rather than the client-spoofable first hop
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const proxyHop = hops[hops.length - 1];
    if (proxyHop) return proxyHop.slice(0, 64);
  }

  return "local";
}

function containsUnsafeJsonConstructs(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (value === null || typeof value !== "object") return false;

  if (Array.isArray(value)) {
    if (value.length > MAX_WORKFLOW_ARRAY_ITEMS) return true;
    for (const item of value) {
      if (containsUnsafeJsonConstructs(item, depth + 1)) return true;
    }
    return false;
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_JSON_KEYS.has(key)) return true;
    if (containsUnsafeJsonConstructs((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

export function validateWorkflowCommandPayload(
  type: string,
  payload: Record<string, unknown>
): { readonly valid: boolean; readonly error?: string } {
  const allowedKeys = WORKFLOW_ALLOWED_PAYLOAD_KEYS[type];
  if (!allowedKeys) {
    return { valid: false, error: "Unsupported workflow command" };
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return { valid: false, error: "Workflow command payload must not be empty" };
  }

  for (const key of keys) {
    if (FORBIDDEN_JSON_KEYS.has(key) || !allowedKeys.has(key)) {
      return { valid: false, error: `Unsupported workflow parameter: ${key}` };
    }
  }

  if (containsUnsafeJsonConstructs(payload)) {
    return {
      valid: false,
      error: "Workflow command payload exceeds complexity/batch bounds or contains forbidden keys"
    };
  }

  return { valid: true };
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

const DISTRIBUTED_RATE_LIMIT_LUA =
  "local c = redis.call('INCR', KEYS[1]); " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; " +
  "local ttl = redis.call('PTTL', KEYS[1]); " +
  "return {c, ttl}";

/**
 * Distributed fixed/sliding window rate limiter using Upstash Redis / Vercel KV REST API
 * when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN)
 * are configured, falling back to in-memory sliding-window buckets if unconfigured or unavailable.
 */
export async function checkDistributedRateLimit(
  bucketKey: string,
  options: { readonly limit: number; readonly windowMs: number; readonly nowMs?: number }
): Promise<RateLimitResult> {
  const restUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
  const restToken = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ""
  ).trim();

  if (!restUrl || !restToken) {
    return checkSlidingWindowRateLimit(bucketKey, options);
  }

  try {
    const response = await fetch(restUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        "EVAL",
        DISTRIBUTED_RATE_LIMIT_LUA,
        "1",
        `ptas:rl:${bucketKey}`,
        String(options.windowMs)
      ]),
      signal: AbortSignal.timeout(1500)
    });

    if (!response.ok) {
      return checkSlidingWindowRateLimit(bucketKey, options);
    }

    const parsed = (await response.json()) as { result?: unknown };
    if (!Array.isArray(parsed.result) || parsed.result.length < 2) {
      return checkSlidingWindowRateLimit(bucketKey, options);
    }

    const count = Number(parsed.result[0]);
    const pttlMs = Number(parsed.result[1]);
    if (!Number.isFinite(count) || count <= 0) {
      return checkSlidingWindowRateLimit(bucketKey, options);
    }

    const effectiveTtlMs = Number.isFinite(pttlMs) && pttlMs > 0 ? pttlMs : options.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(effectiveTtlMs / 1000));
    return {
      allowed: count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds
    };
  } catch {
    return checkSlidingWindowRateLimit(bucketKey, options);
  }
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

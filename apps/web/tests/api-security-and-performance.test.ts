import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  computeLedgerBalance,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  type DemandLedgerEntry
} from "@ptas/domain";
import {
  buildNoStoreHeaders,
  checkSlidingWindowRateLimit,
  clearRateLimitBuckets,
  isAllowedDocumentType,
  MAX_WORKFLOW_BODY_BYTES,
  sanitizeDocumentId,
  sanitizeDownloadFilename
} from "../src/lib/api-security.js";

const mockAuthGetUser = vi.fn();
const mockAuthSignOut = vi.fn();
const mockAuthOnStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const mockRpc = vi.fn();

vi.mock("@ptas/database/client", () => ({
  createPtasSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockAuthGetUser,
      signOut: mockAuthSignOut,
      onAuthStateChange: mockAuthOnStateChange
    },
    rpc: mockRpc
  })),
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockAuthGetUser,
      signOut: mockAuthSignOut,
      onAuthStateChange: mockAuthOnStateChange
    },
    rpc: mockRpc
  }))
}));

import { POST as workflowsPost } from "../src/app/api/workflows/route.js";
import { GET as documentPdfGet } from "../src/app/api/documents/[type]/[id]/pdf/route.js";
import {
  clearAuthenticatedOfficerCache,
  resolveAuthenticatedOfficer,
  signOutOfficer
} from "../src/lib/supabase-auth.js";

describe("API Security, Rate Limiting, Actor Caching & Concurrency Invariants", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    clearRateLimitBuckets();
    clearAuthenticatedOfficerCache();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
  });

  afterEach(() => {
    clearRateLimitBuckets();
    clearAuthenticatedOfficerCache();
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  });

  it("validates official document allowlist, identifier sanitization, and download filenames", () => {
    expect(isAllowedDocumentType("form_pft2_challan")).toBe(true);
    expect(isAllowedDocumentType("PFT1_DEMAND_NOTICE")).toBe(true);
    expect(isAllowedDocumentType("ARBITRARY_SQL")).toBe(false);

    expect(sanitizeDocumentId("PFT2-0001-2026-07-0001")).toBe("PFT2-0001-2026-07-0001");
    expect(sanitizeDocumentId("unit:uuid-1234")).toBe("unit:uuid-1234");
    expect(sanitizeDocumentId("../etc/passwd")).toBeNull();
    expect(sanitizeDocumentId('bad"\r\nid')).toBeNull();
    expect(sanitizeDocumentId("a".repeat(129))).toBeNull();

    expect(sanitizeDownloadFilename('doc"\r\nX-Inject: 1/../../p.pdf')).not.toMatch(/[\r\n"\\/]/);
  });

  it("enforces sliding-window rate limits with clean window resets", () => {
    const start = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      expect(
        checkSlidingWindowRateLimit("test-key", { limit: 3, windowMs: 1000, nowMs: start }).allowed
      ).toBe(true);
    }
    const blocked = checkSlidingWindowRateLimit("test-key", {
      limit: 3,
      windowMs: 1000,
      nowMs: start + 100
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const reset = checkSlidingWindowRateLimit("test-key", {
      limit: 3,
      windowMs: 1000,
      nowMs: start + 1001
    });
    expect(reset.allowed).toBe(true);
    expect(buildNoStoreHeaders("req-1")["Cache-Control"]).toContain("no-store");
  });

  it("hardens POST /api/workflows against cross-origin, unauthenticated, oversized, malformed, and burst requests", async () => {
    const crossOriginReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "ptas.gov.pk",
        authorization: "Bearer token-1"
      },
      body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: {} })
    });
    const crossOriginRes = await workflowsPost(crossOriginReq);
    expect(crossOriginRes.status).toBe(403);
    expect(crossOriginRes.headers.get("X-Request-Id")).toBeTruthy();

    const unauthReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: { host: "ptas.gov.pk" },
      body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: {} })
    });
    expect((await workflowsPost(unauthReq)).status).toBe(401);

    const oversizedReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-size",
        "content-length": String(MAX_WORKFLOW_BODY_BYTES + 1)
      },
      body: "{}"
    });
    expect((await workflowsPost(oversizedReq)).status).toBe(413);

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "eto@punjab.gov.pk" } },
      error: null
    });
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    const arrayPayloadReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-valid",
        "content-type": "application/json"
      },
      body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: ["bad"] })
    });
    expect((await workflowsPost(arrayPayloadReq)).status).toBe(400);

    const validReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-ok",
        "content-type": "application/json"
      },
      body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: { p_unit_id: "u-1" } })
    });
    const validRes = await workflowsPost(validReq);
    expect(validRes.status).toBe(200);
    expect(validRes.headers.get("Cache-Control")).toContain("no-store");

    // Exhaust 60/min workflow rate limit on single bearer token
    for (let i = 0; i < 60; i++) {
      await workflowsPost(
        new Request("https://ptas.gov.pk/api/workflows", {
          method: "POST",
          headers: {
            host: "ptas.gov.pk",
            authorization: "Bearer burst-token",
            "x-forwarded-for": "10.0.0.5",
            "content-type": "application/json"
          },
          body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: { p_unit_id: "u-1" } })
        })
      );
    }
    const throttled = await workflowsPost(
      new Request("https://ptas.gov.pk/api/workflows", {
        method: "POST",
        headers: {
          host: "ptas.gov.pk",
          authorization: "Bearer burst-token",
          "x-forwarded-for": "10.0.0.5",
          "content-type": "application/json"
        },
        body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: { p_unit_id: "u-1" } })
      })
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
  });

  it("hardens GET /api/documents/[type]/[id]/pdf against invalid types, traversal IDs, missing auth, and bursts", async () => {
    const badTypeReq = new NextRequest("https://ptas.gov.pk/api/documents/BAD_TYPE/unit-1/pdf");
    const badTypeRes = await documentPdfGet(badTypeReq, {
      params: Promise.resolve({ type: "BAD_TYPE", id: "unit-1" })
    });
    expect(badTypeRes.status).toBe(400);

    const badIdReq = new NextRequest(
      "https://ptas.gov.pk/api/documents/form_pft2_challan/..%2Fsecret/pdf"
    );
    const badIdRes = await documentPdfGet(badIdReq, {
      params: Promise.resolve({ type: "form_pft2_challan", id: "../secret" })
    });
    expect(badIdRes.status).toBe(400);

    const unauthPdfReq = new NextRequest(
      "https://ptas.gov.pk/api/documents/form_pft2_challan/unit-1/pdf"
    );
    const unauthPdfRes = await documentPdfGet(unauthPdfReq, {
      params: Promise.resolve({ type: "form_pft2_challan", id: "unit-1" })
    });
    expect(unauthPdfRes.status).toBe(401);
    expect(unauthPdfRes.headers.get("Cache-Control")).toContain("no-store");

    for (let i = 0; i < 30; i++) {
      await documentPdfGet(
        new NextRequest("https://ptas.gov.pk/api/documents/form_pft2_challan/unit-1/pdf", {
          headers: { authorization: "Bearer pdf-burst-token", "x-forwarded-for": "10.0.0.99" }
        }),
        { params: Promise.resolve({ type: "form_pft2_challan", id: "unit-1" }) }
      );
    }
    const throttledPdf = await documentPdfGet(
      new NextRequest("https://ptas.gov.pk/api/documents/form_pft2_challan/unit-1/pdf", {
        headers: { authorization: "Bearer pdf-burst-token", "x-forwarded-for": "10.0.0.99" }
      }),
      { params: Promise.resolve({ type: "form_pft2_challan", id: "unit-1" }) }
    );
    expect(throttledPdf.status).toBe(429);
    expect(throttledPdf.headers.get("Retry-After")).toBeTruthy();
  });

  it("deduplicates 50 concurrent resolveAuthenticatedOfficer calls into 1 RPC and invalidates on signOut", async () => {
    mockRpc.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return {
        data: {
          user_id: "officer-uuid-1",
          display_name: "Concurrency Officer",
          role: "ETO",
          jurisdiction_id: "dist-vehari-uuid",
          jurisdiction_name: "District Vehari",
          jurisdiction_tier: "DISTRICT"
        },
        error: null
      };
    });

    const user = { id: "auth-uuid-1", email: "eto@punjab.gov.pk" } as Parameters<
      typeof resolveAuthenticatedOfficer
    >[0];

    const results = await Promise.all(
      Array.from({ length: 50 }, () => resolveAuthenticatedOfficer(user))
    );
    expect(results).toHaveLength(50);
    expect(results.every((r) => r.role === "ETO" && r.jurisdictionId === "dist-vehari-uuid")).toBe(
      true
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Cached repeat call inside TTL makes zero additional RPC calls
    await resolveAuthenticatedOfficer(user);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Sign out clears cached officer identity
    await signOutOfficer();
    await resolveAuthenticatedOfficer(user);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("preserves exact ledger balance and idempotency invariants across 100 concurrent virtual payment workers", async () => {
    const demand = createInitialDemandEntry({
      demandUnitId: "demand-unit-100",
      financialYearId: "2026-2027",
      assessmentVersionId: "ver-1",
      amount: 100_000,
      actorId: "eto-1",
      correlationId: "corr-init",
      idempotencyKey: "init-demand-100"
    });

    // Simulate 100 concurrent payment operations + 25 duplicate idempotency retries
    const postedByKey = new Map<string, DemandLedgerEntry>();
    postedByKey.set(demand.idempotencyKey, demand);

    await Promise.all(
      Array.from({ length: 125 }, async (_, index) => {
        const logicalOp = index % 100;
        const idempotencyKey = `pay-op-${logicalOp}`;
        if (postedByKey.has(idempotencyKey)) {
          return;
        }
        const entry = createPaymentReceiptEntry({
          demandUnitId: "demand-unit-100",
          financialYearId: "2026-2027",
          amount: 1000,
          receiptNumber: `RCPT-${logicalOp}`,
          paymentChannel: "EPAY_PUNJAB",
          actorId: `cashier-${logicalOp}`,
          correlationId: `corr-${logicalOp}`,
          idempotencyKey
        });
        if (!postedByKey.has(idempotencyKey)) {
          postedByKey.set(idempotencyKey, entry);
        }
      })
    );

    const allEntries = Array.from(postedByKey.values());
    expect(allEntries).toHaveLength(101);
    expect(computeLedgerBalance(allEntries, "2026-2027")).toBe(0);
  });
});

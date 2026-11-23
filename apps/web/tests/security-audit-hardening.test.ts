import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuthGetUser = vi.fn();
const mockAuthSignOut = vi.fn();
const mockAuthOnStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const mockRpc = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageCreateSignedUrl = vi.fn();
const mockStorageFrom = vi.fn(() => ({
  upload: mockStorageUpload,
  createSignedUrl: mockStorageCreateSignedUrl
}));
const mockDbUpsert = vi.fn();
const mockDbFrom = vi.fn(() => ({
  upsert: mockDbUpsert
}));

const sharedMockSupabaseClient = {
  auth: {
    getUser: mockAuthGetUser,
    signOut: mockAuthSignOut,
    onAuthStateChange: mockAuthOnStateChange
  },
  rpc: mockRpc,
  storage: {
    from: mockStorageFrom
  },
  from: mockDbFrom
};

vi.mock("@ptas/database/client", () => ({
  createPtasSupabaseClient: vi.fn(() => sharedMockSupabaseClient),
  createBrowserSupabaseClient: vi.fn(() => sharedMockSupabaseClient)
}));

import { POST as workflowsPost } from "../src/app/api/workflows/route.js";
import { GET as documentDownloadGet } from "../src/app/api/documents/download/route.js";
import {
  checkDistributedRateLimit,
  clearRateLimitBuckets,
  extractClientIp,
  neutralizeCsvFormula,
  validateWorkflowCommandPayload
} from "../src/lib/api-security.js";
import { buildNonceCspHeader, generateCspNonce, proxy } from "../src/proxy.js";
import {
  generateAuthoritativePdf,
  validateDocumentAuthorization
} from "../src/lib/pdf/document-engine.js";
import type { OperationalRpcClient } from "../src/lib/operational-survey.js";
import { escapeCsvCell as misEscapeCsvCell } from "../src/lib/mis-analytics.js";
import { exportPft2ChallansCsv } from "../src/lib/receipt-generator.js";
import { lookupTaxpayerLiability } from "../src/lib/public-portal.js";
import {
  createInitialPilotUnits,
  type MockOfficer,
  type Pft2ChallanRecord
} from "../src/lib/pilot-store.js";
import { validateOfficerImportJurisdiction } from "../src/lib/bulk-import-standards.js";
import { MAX_RECEIPT_UPLOAD_BYTES, uploadReceiptScan } from "../src/lib/storage.js";
import { pushPilotStateToSupabase } from "../src/lib/supabase-sync.js";

describe("Comprehensive Security Audit & Integrity Controls", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    clearRateLimitBuckets();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
  });

  afterEach(() => {
    clearRateLimitBuckets();
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  });

  it("extracts trusted proxy client IPs without trusting spoofed X-Forwarded-For prefixes", () => {
    const spoofedHeaders = new Headers({
      "x-forwarded-for": "203.0.113.1, 198.51.100.42"
    });
    expect(extractClientIp(spoofedHeaders)).toBe("198.51.100.42");

    const vercelHeaders = new Headers({
      "x-forwarded-for": "203.0.113.1",
      "x-vercel-forwarded-for": "192.0.2.10, 198.51.100.99"
    });
    expect(extractClientIp(vercelHeaders)).toBe("198.51.100.99");

    const cfHeaders = new Headers({
      "x-forwarded-for": "203.0.113.1",
      "cf-connecting-ip": "198.51.100.77"
    });
    expect(extractClientIp(cfHeaders)).toBe("198.51.100.77");
  });

  it("rejects non-JSON Content-Type, prototype pollution keys, unknown RPC parameters, and oversized workflow arrays", async () => {
    const nonJsonReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-1",
        "content-type": "text/plain"
      },
      body: JSON.stringify({ type: "SURVEY_TRANSITION", payload: { p_unit_id: "u-1" } })
    });
    expect((await workflowsPost(nonJsonReq)).status).toBe(415);

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "eto@punjab.gov.pk" } },
      error: null
    });

    const protoJsonReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-proto",
        "content-type": "application/json"
      },
      body: '{"type":"SURVEY_TRANSITION","payload":{"__proto__":{"polluted":true},"p_unit_id":"u-1"}}'
    });
    expect((await workflowsPost(protoJsonReq)).status).toBe(400);

    const unknownParamReq = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-unknown",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        type: "SURVEY_TRANSITION",
        payload: { p_unit_id: "u-1", admin_override: true }
      })
    });
    expect((await workflowsPost(unknownParamReq)).status).toBe(400);

    const oversizedPayload = validateWorkflowCommandPayload("STAGE_SURVEY_IMPORT", {
      p_source_filename: "bulk.csv",
      p_file_sha256: "a".repeat(64),
      p_headers: ["Legal Name"],
      p_rows: Array.from({ length: 5001 }, () => ({}))
    });
    expect(oversizedPayload.valid).toBe(false);
  });

  it("throttles pre-auth IP flooding on /api/workflows even across rotating fake bearer tokens", async () => {
    const attackerIp = "198.51.100.200";
    for (let i = 0; i < 120; i++) {
      const res = await workflowsPost(
        new Request("https://ptas.gov.pk/api/workflows", {
          method: "POST",
          headers: {
            host: "ptas.gov.pk",
            "x-real-ip": attackerIp,
            "content-type": "application/json"
          },
          body: "{}"
        })
      );
      expect(res.status).toBe(401);
    }

    const blocked = await workflowsPost(
      new Request("https://ptas.gov.pk/api/workflows", {
        method: "POST",
        headers: {
          host: "ptas.gov.pk",
          authorization: "Bearer rotated-attacker-token",
          "x-real-ip": attackerIp,
          "content-type": "application/json"
        },
        body: "{}"
      })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("hardens GET /api/documents/download with type/id validation, non-cached 307 redirects, and rate limits", async () => {
    const invalidType = await documentDownloadGet(
      new NextRequest("https://ptas.gov.pk/api/documents/download?type=SQL&id=unit-1", {
        headers: { "x-real-ip": "198.51.100.20" }
      })
    );
    expect(invalidType.status).toBe(400);
    expect(invalidType.headers.get("Cache-Control")).toContain("no-store");

    const invalidId = await documentDownloadGet(
      new NextRequest(
        "https://ptas.gov.pk/api/documents/download?type=FORM_PFT2_CHALLAN&id=..%2Fetc%2Fpasswd",
        { headers: { "x-real-ip": "198.51.100.20" } }
      )
    );
    expect(invalidId.status).toBe(400);

    const validRedirect = await documentDownloadGet(
      new NextRequest(
        "https://ptas.gov.pk/api/documents/download?type=FORM_PFT2_CHALLAN&id=unit-123",
        { headers: { "x-real-ip": "198.51.100.20" } }
      )
    );
    expect(validRedirect.status).toBe(307);
    expect(validRedirect.headers.get("Location")).toBe(
      "https://ptas.gov.pk/api/documents/form_pft2_challan/unit-123/pdf"
    );
    expect(validRedirect.headers.get("Cache-Control")).toContain("no-store");

    for (let i = 0; i < 57; i++) {
      await documentDownloadGet(
        new NextRequest("https://ptas.gov.pk/api/documents/download?type=UNIT_DOSSIER&id=u-1", {
          headers: { "x-real-ip": "198.51.100.20" }
        })
      );
    }
    const throttled = await documentDownloadGet(
      new NextRequest("https://ptas.gov.pk/api/documents/download?type=UNIT_DOSSIER&id=u-1", {
        headers: { "x-real-ip": "198.51.100.20" }
      })
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
  });

  it("enforces Inspector & Finance/Auditor PDF document restrictions and never fabricates fallback units", async () => {
    const inspectorCtx = {
      role: "INSPECTOR" as const,
      district: "Vehari",
      circle: "Circle-I"
    };
    expect(
      validateDocumentAuthorization("TAX_CLEARANCE_CERTIFICATE", inspectorCtx, {
        district: "Vehari",
        circle: "Circle-I"
      }).authorized
    ).toBe(false);
    expect(
      validateDocumentAuthorization("LAND_REVENUE_RECOVERY", inspectorCtx, {
        district: "Vehari",
        circle: "Circle-I"
      }).authorized
    ).toBe(false);
    expect(
      validateDocumentAuthorization("APPELLATE_ORDER", inspectorCtx, {
        district: "Vehari",
        circle: "Circle-I"
      }).authorized
    ).toBe(false);

    for (const roRole of ["FINANCE", "AUDITOR"] as const) {
      expect(
        validateDocumentAuthorization("STATUTORY_REPORT", { role: roRole }, { district: "Vehari" })
          .authorized
      ).toBe(true);
      expect(
        validateDocumentAuthorization("FORM_PFT2_CHALLAN", { role: roRole }, { district: "Vehari" })
          .authorized
      ).toBe(false);
    }

    const emptyClient: OperationalRpcClient = {
      rpc: async () => ({ data: [], error: null })
    };
    await expect(
      generateAuthoritativePdf(
        "FORM_PFT1_NOTICE",
        "nonexistent-unit-pin-999999",
        { role: "ETO", district: "Vehari", circle: "Circle-I" },
        { supabaseClient: emptyClient }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("neutralizes dangerous CSV formulas while preserving numeric literals across exporters", () => {
    expect(neutralizeCsvFormula("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(neutralizeCsvFormula("+1+1")).toBe("'+1+1");
    expect(neutralizeCsvFormula("-2+3")).toBe("'-2+3");
    expect(neutralizeCsvFormula("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(neutralizeCsvFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeCsvFormula("\r=1+1")).toBe("'\r=1+1");
    expect(neutralizeCsvFormula(" =cmd|' /C calc'!A0")).toBe("' =cmd|' /C calc'!A0");
    expect(neutralizeCsvFormula("-500")).toBe("-500");
    expect(neutralizeCsvFormula("4000")).toBe("4000");

    expect(misEscapeCsvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");

    const sampleChallan = {
      id: "ch-1",
      unitId: "unit-1",
      challanNumber: '=HYPERLINK("http://evil","click")',
      demandNumber: "0001",
      pin: "123456",
      legalName: "@SUM(1,1)",
      identifierType: "CNIC",
      identifierValue: "36601-1111111-1",
      address: "Vehari",
      category: "Category 3",
      subclassificationCode: "3(i)",
      tertiarySlab: "3(i)(b)",
      formType: "NORMAL",
      demandScope: "CURRENT",
      paymentScope: "FULL",
      amountPayable: 4000,
      remainingBalance: 0,
      issueDate: "2026-07-01",
      dueDate: "2026-08-31",
      status: "ISSUED",
      financialYear: "2026-2027"
    } as unknown as Pft2ChallanRecord;

    const csv = exportPft2ChallansCsv([sampleChallan]);
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain('"\'@SUM(1,1)"');
  });

  it("prevents short/substring enumeration in lookupTaxpayerLiability while keeping exact matches intact", () => {
    const units = createInitialPilotUnits();

    expect(lookupTaxpayerLiability("a", units)).toBeNull();
    expect(lookupTaxpayerLiability("3", units)).toBeNull();
    expect(lookupTaxpayerLiability("000", units)).toBeNull();
    expect(lookupTaxpayerLiability("2948192", units)).toBeNull();

    expect(lookupTaxpayerLiability("36601-2948192-3", units)?.legalName).toBe("Muhammad Akram");
    expect(lookupTaxpayerLiability("7412983-1", units)?.legalName).toBe(
      "Vehari Cotton Ginners (Pvt.) Ltd."
    );
    expect(lookupTaxpayerLiability("0003", units)?.legalName).toContain("Al-Madina");
  });

  it("blocks non-field roles from bulk survey staging jurisdiction checks", () => {
    for (const blockedRole of ["DIRECTOR", "ADMIN", "FINANCE", "AUDITOR"]) {
      const officer: MockOfficer = {
        id: `officer-${blockedRole.toLowerCase()}`,
        name: `Test ${blockedRole}`,
        email: `${blockedRole.toLowerCase()}@punjab.gov.pk`,
        role: blockedRole as unknown as MockOfficer["role"],
        title: blockedRole,
        jurisdictionId: "jur-vehari",
        jurisdictionName: "District Vehari",
        jurisdictionTier: blockedRole === "DIRECTOR" ? "REGION" : "DISTRICT",
        badgeText: blockedRole
      };
      const result = validateOfficerImportJurisdiction(officer, "Circle 1", "Vehari", "Multan");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("strictly for field Inspectors and Assessing Authorities");
    }

    const etoOfficer: MockOfficer = {
      id: "officer-eto",
      name: "Test ETO",
      email: "eto@punjab.gov.pk",
      role: "ETO",
      title: "ETO",
      jurisdictionId: "jur-vehari",
      jurisdictionName: "District Vehari",
      jurisdictionTier: "DISTRICT",
      badgeText: "ETO"
    };
    expect(
      validateOfficerImportJurisdiction(etoOfficer, "Circle 1", "Vehari", "Multan").allowed
    ).toBe(true);
  });

  it("enforces session, unitId, size, MIME, and signed-URL protections on uploadReceiptScan", async () => {
    const validPng = new File([new Uint8Array([137, 80, 78, 71])], "receipt.png", {
      type: "image/png"
    });

    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(uploadReceiptScan(validPng, "unit-123", "RCPT-001")).rejects.toThrow(
      /Authentication required/i
    );

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "eto@punjab.gov.pk" } },
      error: null
    });

    await expect(uploadReceiptScan(validPng, "../other-unit", "RCPT-001")).rejects.toThrow(
      /Invalid unit identifier/i
    );

    const svgFile = new File(["<svg></svg>"], "evil.svg", { type: "image/svg+xml" });
    await expect(uploadReceiptScan(svgFile, "unit-123", "RCPT-001")).rejects.toThrow(
      /Unsupported receipt evidence file type/i
    );

    const mismatchedExt = new File(["<html></html>"], "evil.html", { type: "image/png" });
    await expect(uploadReceiptScan(mismatchedExt, "unit-123", "RCPT-001")).rejects.toThrow(
      /extension does not match/i
    );

    const oversized = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)], "huge.png", {
      type: "image/png"
    });
    await expect(uploadReceiptScan(oversized, "unit-123", "RCPT-001")).rejects.toThrow(
      /at most 5 MB/i
    );

    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://mock.supabase.co/storage/v1/object/sign/receipts/signed" },
      error: null
    });

    const res = await uploadReceiptScan(validPng, "unit-123", "RCPT-001");
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^receipts\/unit-123\/RCPT-001-\d+-[a-zA-Z0-9_-]+\.png$/),
      validPng,
      expect.objectContaining({ upsert: false, contentType: "image/png" })
    );
    expect(res.url).toContain("https://mock.supabase.co/storage/v1/object/sign/");
    expect(res.sha256).toHaveLength(64);
  });

  it("fails closed inside legacy pushPilotStateToSupabase without direct client table writes", async () => {
    const units = createInitialPilotUnits();
    const res = await pushPilotStateToSupabase(units, []);
    expect(res.success).toBe(false);
    expect(res.error).toBe("DIRECT_TABLE_SYNC_DISABLED");
    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockDbUpsert).not.toHaveBeenCalled();
  });

  it("supports Upstash Redis REST distributed rate limiting and falls back safely on error", async () => {
    const prevUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.mock.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-upstash-token";

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ result: [1, 60_000] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
      const allowedRes = await checkDistributedRateLimit("wf:user-1", {
        limit: 5,
        windowMs: 60_000
      });
      expect(allowedRes.allowed).toBe(true);
      expect(allowedRes.remaining).toBe(4);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://redis.mock.upstash.io",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer mock-upstash-token" })
        })
      );

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ result: [6, 42_000] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
      const blockedRes = await checkDistributedRateLimit("wf:user-1", {
        limit: 5,
        windowMs: 60_000
      });
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.remaining).toBe(0);
      expect(blockedRes.retryAfterSeconds).toBe(42);

      // Network failure falls back cleanly to local sliding-window limiter
      fetchSpy.mockRejectedValueOnce(new Error("Redis timeout"));
      const fallbackRes = await checkDistributedRateLimit("wf:user-fallback", {
        limit: 2,
        windowMs: 60_000
      });
      expect(fallbackRes.allowed).toBe(true);
      expect(fallbackRes.remaining).toBe(1);
    } finally {
      fetchSpy.mockRestore();
      if (prevUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = prevUpstashUrl;
      if (prevUpstashToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = prevUpstashToken;
    }
  });

  it("generates unique per-request nonces and strict CSP headers without unsafe-inline or unsafe-eval in production", () => {
    const nonceA = generateCspNonce();
    const nonceB = generateCspNonce();
    expect(nonceA).not.toBe(nonceB);
    expect(nonceA.length).toBeGreaterThanOrEqual(20);

    const prodCsp = buildNonceCspHeader(nonceA, {
      isProduction: true,
      isHttpsDeployment: true
    });
    expect(prodCsp).toContain(`script-src 'self' 'nonce-${nonceA}' 'strict-dynamic'`);
    expect(prodCsp).not.toContain("'unsafe-eval'");
    expect(prodCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(prodCsp).toContain("object-src 'none'");
    expect(prodCsp).toContain("upgrade-insecure-requests");

    const req = new NextRequest("https://ptas.gov.pk/sign-in");
    const res = proxy(req);
    const headerCsp = res.headers.get("Content-Security-Policy") ?? "";
    expect(headerCsp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(headerCsp).toContain("object-src 'none'");
  });

  it("maps PostgreSQL PostgREST PT409 conflict SQLSTATE to HTTP 409 without leaking raw RPC errors", async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", email: "eto@punjab.gov.pk" } },
      error: null
    });
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PT409",
        message: "stale workflow version"
      }
    });

    const req = new Request("https://ptas.gov.pk/api/workflows", {
      method: "POST",
      headers: {
        host: "ptas.gov.pk",
        authorization: "Bearer token-pt409",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        type: "SURVEY_TRANSITION",
        payload: { p_unit_id: "unit-1", p_expected_version: 1 }
      })
    });

    const res = await workflowsPost(req);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; code: string; requestId: string };
    expect(body.code).toBe("PT409");
    expect(body.error).toBe(
      "Conflict: Record has been concurrently updated or duplicate identifier exists."
    );
    expect(body.error).not.toContain("stale workflow version");
    expect(body.requestId).toBeTruthy();
  });

  it("excludes ETC (BS-05 Notice Delivery Only) from statutory PDFs and bulk survey imports", () => {
    const etcCtx = {
      role: "ETC" as const,
      district: "Vehari",
      circle: "VHR-1"
    };
    for (const docType of [
      "FORM_PFT1_NOTICE",
      "FORM_PFT2_CHALLAN",
      "FORM_PFT3_REGISTER",
      "STATUTORY_RECEIPT",
      "STATUTORY_REPORT",
      "TAX_CLEARANCE_CERTIFICATE",
      "LAND_REVENUE_RECOVERY",
      "APPELLATE_ORDER"
    ] as const) {
      const decision = validateDocumentAuthorization(docType, etcCtx, {
        district: "Vehari",
        circle: "VHR-1"
      });
      expect(decision.authorized).toBe(false);
    }

    const etcOfficer: MockOfficer = {
      id: "officer-etc-1",
      name: "Constable Bilal",
      email: "etc.vhr1@punjab.gov.pk",
      role: "ETC",
      cadreCode: "ETC",
      bpsScale: 5,
      postCode: "ETC-VHR-1",
      title: "Excise & Taxation Constable (BPS-05 — Notice Delivery)",
      jurisdictionId: "cir-vhr-1",
      jurisdictionName: "Circle 1 Vehari",
      jurisdictionTier: "CIRCLE",
      badgeText: "ETC • ETC-VHR-1"
    };
    const importDecision = validateOfficerImportJurisdiction(
      etcOfficer,
      "Circle 1",
      "Vehari",
      "Multan"
    );
    expect(importDecision.allowed).toBe(false);
    expect(importDecision.error).toContain(
      "strictly for field Inspectors and Assessing Authorities"
    );
  });
});

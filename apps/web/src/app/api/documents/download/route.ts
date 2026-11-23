/**
 * Server-Side Document Download Route (Canonical Redirect)
 * Consolidates legacy query-based endpoint: GET /api/documents/download?type=FORM_PFT2_CHALLAN&id=123
 * into the canonical RESTful route: GET /api/documents/[type]/[id]/pdf
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildNoStoreHeaders,
  checkDistributedRateLimit,
  createRequestId,
  extractClientIp,
  hashRateLimitSubject,
  isAllowedDocumentType,
  sanitizeDocumentId
} from "../../../../lib/api-security";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const baseHeaders = buildNoStoreHeaders(requestId);
  const clientIp = extractClientIp(request.headers);

  const rateLimit = await checkDistributedRateLimit(`doc-dl:${hashRateLimitSubject(clientIp)}`, {
    limit: 60,
    windowMs: 60_000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many download requests. Please retry shortly.", requestId },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const rawId = searchParams.get("id");

  if (!rawType || !rawId) {
    return NextResponse.json(
      { success: false, error: "Missing required 'type' or 'id' query parameters.", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  const normalizedType = rawType.trim().toUpperCase();
  if (!isAllowedDocumentType(normalizedType)) {
    return NextResponse.json(
      { success: false, error: "Unsupported statutory document type.", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  const sanitizedId = sanitizeDocumentId(rawId);
  if (!sanitizedId) {
    return NextResponse.json(
      { success: false, error: "Invalid statutory document identifier.", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  // Temporary 307 redirect so invalidation/auth headers are never cached by intermediaries
  const canonicalUrl = new URL(
    `/api/documents/${encodeURIComponent(normalizedType.toLowerCase())}/${encodeURIComponent(sanitizedId)}/pdf`,
    request.url
  );

  return NextResponse.redirect(canonicalUrl, { status: 307, headers: baseHeaders });
}

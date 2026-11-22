/**
 * Server-Side Authoritative Document Generation API Route
 * Implements Sections 4, 9, and 12 of the Consolidated Implementation Specification:
 * Database -> Server-side authorization & validation -> Structured document data -> Official PDF template -> PDF renderer -> Download
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildNoStoreHeaders,
  checkSlidingWindowRateLimit,
  createRequestId,
  extractClientIp,
  hashRateLimitSubject,
  isAllowedDocumentType,
  sanitizeDocumentId,
  sanitizeDownloadFilename
} from "../../../../../../lib/api-security";
import { generateAuthoritativePdf } from "../../../../../../lib/pdf/document-engine";
import { resolveDocumentActor } from "../../../../../../lib/server-actor";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string; id: string }> }
) {
  const requestId = createRequestId();
  const baseHeaders = buildNoStoreHeaders(requestId);
  const { type: rawType, id: rawId } = await context.params;
  const type = rawType.trim().toUpperCase();

  if (!isAllowedDocumentType(type)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unsupported statutory document type.",
        requestId
      },
      { status: 400, headers: baseHeaders }
    );
  }

  const sanitizedId = sanitizeDocumentId(rawId);
  if (!sanitizedId) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid statutory document identifier.",
        requestId
      },
      { status: 400, headers: baseHeaders }
    );
  }

  const authorizationHeader = request.headers.get("authorization");
  const rateSubject = authorizationHeader
    ? `${authorizationHeader}:${extractClientIp(request.headers)}`
    : extractClientIp(request.headers);
  const rateLimit = checkSlidingWindowRateLimit(`pdf:${hashRateLimitSubject(rateSubject)}`, {
    limit: 30,
    windowMs: 60_000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many document generation requests. Please retry shortly.",
        requestId
      },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  try {
    const authContext = await resolveDocumentActor(authorizationHeader);
    const doc = await generateAuthoritativePdf(type, sanitizedId, authContext);
    const pdfBuffer = doc.output("arraybuffer");

    const filename = sanitizeDownloadFilename(
      `${type.toLowerCase().replace(/_/g, "-")}-${sanitizedId}.pdf`
    );

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        Vary: "Authorization, Accept-Encoding"
      }
    });
  } catch (error) {
    console.error(
      `Server PDF generation failed [req=${requestId} type=${type} id=${sanitizedId}]:`,
      error
    );
    const rawMessage = error instanceof Error ? error.message : "Document generation failed";

    let status = 500;
    let clientMessage = "Authoritative PDF generation failed due to a server processing error.";

    if (rawMessage.startsWith("Authorization required") || rawMessage.includes("expired session")) {
      status = 401;
      clientMessage = rawMessage;
    } else if (
      rawMessage.includes("Authorization denied") ||
      rawMessage.includes("Authorization Violation") ||
      rawMessage.includes("Statutory Authority") ||
      rawMessage.includes("Authorization service is not configured")
    ) {
      status = rawMessage.includes("not configured") ? 503 : 403;
      clientMessage = rawMessage;
    } else if (
      rawMessage.includes("Lifecycle") ||
      rawMessage.includes("cannot be generated") ||
      rawMessage.includes("not found")
    ) {
      status = rawMessage.includes("not found") ? 404 : 400;
      clientMessage = rawMessage;
    }

    return NextResponse.json(
      {
        success: false,
        error: clientMessage,
        requestId,
        documentType: type,
        documentId: sanitizedId
      },
      { status, headers: baseHeaders }
    );
  }
}

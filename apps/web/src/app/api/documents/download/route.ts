/**
 * Server-Side Document Download Route
 * Query-based endpoint: GET /api/documents/download?type=FORM_PFT2_CHALLAN&id=123
 */

import { NextRequest, NextResponse } from "next/server";
import { generateAuthoritativePdf } from "../../../../lib/pdf/document-engine";
import type { OfficialDocumentType, DocumentAuthorizationContext } from "../../../../lib/pdf/types";
import type { MockRole } from "../../../../lib/pilot-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const id = searchParams.get("id");

  if (!rawType || !id) {
    return NextResponse.json(
      { success: false, error: "Missing required 'type' or 'id' query parameters." },
      { status: 400 }
    );
  }

  const officerRole = (request.headers.get("x-officer-role") ||
    searchParams.get("role") ||
    "INSPECTOR") as MockRole;
  const jurisdictionId =
    request.headers.get("x-jurisdiction-id") || searchParams.get("jurisdictionId") || undefined;

  const authContext: DocumentAuthorizationContext = {
    officerRole,
    jurisdictionId
  };

  const type = rawType.toUpperCase() as OfficialDocumentType;

  try {
    const doc = await generateAuthoritativePdf(type, id, authContext);
    const pdfBuffer = doc.output("arraybuffer");
    const filename = `${type.toLowerCase().replace(/_/g, "-")}-${id}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate"
      }
    });
  } catch (error) {
    console.error(`Document download failed for [${type} / ${id}]:`, error);
    const message = error instanceof Error ? error.message : "Document generation failed";
    const status = message.includes("Authorization")
      ? 403
      : message.includes("Lifecycle")
        ? 400
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
        documentType: type,
        documentId: id
      },
      { status }
    );
  }
}

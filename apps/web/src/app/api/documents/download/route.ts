/**
 * Server-Side Document Download Route (Canonical Redirect)
 * Consolidates legacy query-based endpoint: GET /api/documents/download?type=FORM_PFT2_CHALLAN&id=123
 * into the canonical RESTful route: GET /api/documents/[type]/[id]/pdf
 */

import { NextRequest, NextResponse } from "next/server";

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

  // Canonical 308 permanent redirect to RESTful resource endpoint
  const canonicalUrl = new URL(
    `/api/documents/${encodeURIComponent(rawType.toLowerCase())}/${encodeURIComponent(id)}/pdf`,
    request.url
  );

  return NextResponse.redirect(canonicalUrl, 308);
}

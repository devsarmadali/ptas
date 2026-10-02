/**
 * Centralized Client-Side Document Download Service
 * Replaces all DOM-querying, viewport-capturing, and html2canvas routines.
 *
 * Implements Section 4 & 12:
 * Reconstructs complete document from database values and saves vector PDF directly.
 * Deterministic output across all devices, viewports, zoom levels, and orientations.
 *
 * Error contract:
 *   - Returns false on failure and throws the error so callers can catch and display toast feedback.
 *   - Never swallows errors silently.
 *   - Never alerts() directly — UI feedback is the caller's responsibility.
 */

import { generateAuthoritativePdf } from "./document-engine";
import { getSupabaseAuthClient, resolveAuthenticatedOfficer } from "../supabase-auth";
import type {
  OfficialDocumentType,
  DocumentAuthorizationContext,
  DocumentGenerationOptions
} from "./types";
import type { MockOfficer } from "../pilot-store";

export interface DownloadPdfParams {
  readonly type: OfficialDocumentType;
  readonly documentIdOrData: string | unknown;
  readonly defaultFilename?: string;
  readonly authContext?: DocumentAuthorizationContext;
  readonly options?: DocumentGenerationOptions;
}

async function resolveBrowserDocumentActor(): Promise<{
  readonly authContext: DocumentAuthorizationContext;
  readonly officer: MockOfficer;
}> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Authorization required: authenticated PTAS session missing");
  }

  const officer = await resolveAuthenticatedOfficer(data.user);
  return {
    officer,
    authContext: {
      officerId: officer.id,
      role: officer.role,
      officerRole: officer.role,
      jurisdictionId: officer.jurisdictionId,
      jurisdictionTier: officer.jurisdictionTier,
      ...(officer.jurisdictionTier === "CIRCLE"
        ? { circle: officer.jurisdictionName }
        : { district: officer.jurisdictionName })
    }
  };
}

/**
 * Downloads an official statutory document as a vector PDF.
 * Never touches the DOM, never relies on viewport size, scroll position, or zoom.
 *
 * On failure: logs the error, re-throws it so callers can display toast/alert feedback.
 * Returns true on success, false on failure.
 */
export async function downloadOfficialPdf(params: DownloadPdfParams): Promise<boolean> {
  try {
    // Browser callers cannot self-assert their role. Resolve it from the active
    // Supabase session and the server-controlled PTAS assignment RPC.
    const browserActor =
      typeof window !== "undefined" ? await resolveBrowserDocumentActor() : undefined;
    const verifiedAuthContext = browserActor?.authContext ?? params.authContext;

    const doc = await generateAuthoritativePdf(
      params.type,
      params.documentIdOrData,
      verifiedAuthContext,
      browserActor ? { ...params.options, officer: browserActor.officer } : params.options
    );

    const filename =
      params.defaultFilename ??
      params.options?.filename ??
      `${params.type.toLowerCase().replace(/_/g, "-")}.pdf`;

    const safeFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

    if (typeof window !== "undefined") {
      doc.save(safeFilename);
      return true;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[downloadOfficialPdf] Failed to generate [${params.type}]: ${message}`, error);
    // Re-throw so callers (page.tsx handlers) can catch and display toast feedback
    throw error;
  }
}

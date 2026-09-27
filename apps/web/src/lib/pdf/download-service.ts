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
import type {
  OfficialDocumentType,
  DocumentAuthorizationContext,
  DocumentGenerationOptions
} from "./types";

export interface DownloadPdfParams {
  readonly type: OfficialDocumentType;
  readonly documentIdOrData: string | unknown;
  readonly defaultFilename?: string;
  readonly authContext?: DocumentAuthorizationContext;
  readonly options?: DocumentGenerationOptions;
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
    const doc = await generateAuthoritativePdf(
      params.type,
      params.documentIdOrData,
      params.authContext,
      params.options
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

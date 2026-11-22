/**
 * PTAS Central Statutory Document & PDF Architecture Entry Point
 * Keeps heavy PDF generation dependencies (jsPDF, logo assets, templates) lazily split
 * out of initial page bundles until an officer or taxpayer explicitly triggers a PDF export.
 */

export * from "./types";
export type { DownloadPdfParams } from "./download-service";

export async function downloadOfficialPdf(
  params: import("./download-service").DownloadPdfParams
): Promise<boolean> {
  const { downloadOfficialPdf: impl } = await import("./download-service");
  return impl(params);
}

export async function generateAuthoritativePdf(
  ...args: Parameters<typeof import("./document-engine").generateAuthoritativePdf>
): ReturnType<typeof import("./document-engine").generateAuthoritativePdf> {
  const { generateAuthoritativePdf: impl } = await import("./document-engine");
  return impl(...args);
}

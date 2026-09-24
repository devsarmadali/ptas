"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface PdfExportOptions {
  readonly orientation?: "portrait" | "landscape";
  readonly filename?: string;
  readonly scale?: number;
}

/**
 * Downloads a targeted DOM element as an authentic, high-resolution standalone PDF file.
 * Captures only the targeted container, rendering with crisp vector/raster quality
 * without browser headers, navigation bars, or tab chrome.
 *
 * Implements Section 1.1 of the Consolidated Implementation Specification:
 * - Download PDF remains available and fully functional everywhere statutory documents are issued.
 * - Browser Print functionality is completely eliminated in favor of direct PDF output.
 */
export async function downloadDocumentPdf(
  elementId: string,
  defaultFilename: string = "Statutory_Document.pdf",
  options?: PdfExportOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`downloadDocumentPdf: Element with id "${elementId}" not found.`);
    return false;
  }

  try {
    const scale = options?.scale ?? 2;
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    const orientation =
      options?.orientation ?? (canvas.width > canvas.height ? "landscape" : "portrait");

    // Standard A4 dimensions in mm: 210 x 297
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth - 20; // 10mm margins on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10; // top margin

    pdf.addImage(imgData, "JPEG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;

    // Support multi-page if document exceeds A4 height
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
    }

    const safeFilename = defaultFilename.endsWith(".pdf")
      ? defaultFilename
      : `${defaultFilename}.pdf`;

    pdf.save(safeFilename);
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    return false;
  }
}

/**
 * @deprecated Section 1.1: Browser print functionality has been completely removed
 * throughout the application. Use downloadDocumentPdf() for all official outputs.
 */
export function printIsolatedElement(elementId: string): boolean {
  console.warn(
    `printIsolatedElement called for "${elementId}". Browser print is removed per Consolidated Implementation Specification Section 1.1. Triggering downloadDocumentPdf instead.`
  );
  downloadDocumentPdf(elementId);
  return false;
}

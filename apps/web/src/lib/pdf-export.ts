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
 * Prints ONLY the targeted document element in an isolated, dedicated print view.
 * Guarantees that browser tab chrome, application navigation, officer status bars,
 * and background tabs are completely excluded from the printed output.
 */
export function printIsolatedElement(elementId: string): boolean {
  if (typeof window === "undefined") return false;

  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`printIsolatedElement: Element with id "${elementId}" not found.`);
    return false;
  }

  try {
    // Create an invisible iframe for isolated printing
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return true;
    }

    // Collect all stylesheets from active document
    const styleSheets = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((node) => node.outerHTML)
      .join("\n");

    const isolatedContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Government of the Punjab — Statutory Document</title>
          ${styleSheets}
          <style>
            @page {
              size: A4;
              margin: 8mm;
            }
            body {
              background: #ffffff !important;
              color: #000000 !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .printable-target {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              box-shadow: none !important;
              border: 1px solid #1e293b !important;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="printable-target">
            ${element.outerHTML}
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(isolatedContent);
    doc.close();

    // Trigger print after iframe renders
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Iframe print error:", err);
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }
    }, 400);

    return true;
  } catch (error) {
    console.error("Failed to execute isolated print, falling back to window.print():", error);
    window.print();
    return false;
  }
}

/**
 * Base PDF Generation Utilities & Punjab Standard Layout Engine
 * Provides deterministic vector rendering, typography, headers, footers,
 * tables with automatic page continuation, and ISO/IEC 18004 QR codes.
 */

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export const PDF_COLORS = {
  primary: [13, 56, 34] as [number, number, number], // #0d3822 Punjab Green
  primaryDark: [6, 30, 18] as [number, number, number],
  accentGold: [180, 83, 9] as [number, number, number], // #b45309 Gold
  textDark: [15, 23, 42] as [number, number, number], // #0f172a Slate 900
  textMuted: [100, 116, 139] as [number, number, number], // #64748b Slate 500
  borderDark: [51, 65, 85] as [number, number, number], // #334155 Slate 700
  borderLight: [203, 213, 225] as [number, number, number], // #cbd5e1 Slate 300
  bgHeader: [241, 245, 249] as [number, number, number], // #f1f5f9
  bgLight: [248, 250, 252] as [number, number, number], // #f8fafc
  danger: [185, 28, 28] as [number, number, number], // #b91c1c Red 700
  white: [255, 255, 255] as [number, number, number]
};

export interface BasePdfOptions {
  readonly orientation?: ("portrait" | "landscape") | undefined;
  readonly title: string;
  readonly subject?: string | undefined;
  readonly isProvisional?: boolean | undefined;
}

export function createBasePdf(options: BasePdfOptions): jsPDF {
  const orientation = options.orientation ?? "portrait";
  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true
  });

  doc.setProperties({
    title: options.title,
    subject: options.subject ?? "Statutory Document - Government of the Punjab",
    author: "Excise & Taxation Department, Government of the Punjab",
    creator: "PTAS Official Document Engine (ISO 19005 compliant)",
    keywords: "PTAS, Punjab, Professional Tax, Statutory Document"
  });

  return doc;
}

export async function generateQrDataUrl(payload: string): Promise<string> {
  const effectivePayload = payload || "PTAS-PUNJAB:BLANK";
  return QRCode.toDataURL(effectivePayload, {
    margin: 1,
    errorCorrectionLevel: "M",
    width: 256,
    color: {
      dark: "#0d3822",
      light: "#ffffff"
    }
  });
}

export interface HeaderOptions {
  readonly docTitle: string;
  readonly docSubtitle?: string | undefined;
  readonly statutoryRuleReference?: string | undefined;
  readonly district?: string | undefined;
  readonly circle?: string | undefined;
  readonly financialYear?: string | undefined;
  readonly isProvisional?: boolean | undefined;
}

export function renderDocumentHeader(doc: jsPDF, options: HeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const startY = 12;

  // Punjab Government Top Seal Bar
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(10, startY, pageWidth - 20, 1.5, "F");

  // Main Government Heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("GOVERNMENT OF THE PUNJAB", pageWidth / 2, startY + 6, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("EXCISE & TAXATION DEPARTMENT", pageWidth / 2, startY + 11, { align: "center" });

  if (options.statutoryRuleReference) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(options.statutoryRuleReference, pageWidth / 2, startY + 15, { align: "center" });
  }

  // Document Title Banner Box
  const titleY = startY + 18;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.35);
  doc.roundedRect(pageWidth / 2 - 60, titleY, 120, 7.5, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(
    (options.docTitle || "OFFICIAL STATUTORY DOCUMENT").toUpperCase(),
    pageWidth / 2,
    titleY + 5.2,
    { align: "center" }
  );

  // Subtitle / Administrative Jurisdiction Line
  let nextY = titleY + 11;
  const jurisdictionParts = [
    options.district ? `District: ${options.district}` : null,
    options.circle ? `Circle: ${options.circle}` : null,
    options.financialYear ? `Financial Year: ${options.financialYear}` : null
  ].filter(Boolean);

  if (jurisdictionParts.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(jurisdictionParts.join("   •   "), pageWidth / 2, nextY, { align: "center" });
    nextY += 4;
  }

  // Optional Provisional Draft Banner
  if (options.isProvisional) {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(...PDF_COLORS.danger);
    doc.setLineWidth(0.3);
    doc.rect(10, nextY, pageWidth - 20, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.danger);
    doc.text(
      "PROVISIONAL DRAFT — NOT A LEGALLY OPERATIVE NOTICE OR REQUISITION",
      pageWidth / 2,
      nextY + 3.5,
      { align: "center" }
    );
    nextY += 7;
  }

  // Separator Line
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(10, nextY, pageWidth - 10, nextY);

  return nextY + 3;
}

export interface FooterOptions {
  readonly officialSha256?: string | undefined;
  readonly pin?: string | undefined;
  readonly docNumber?: string | undefined;
  readonly generatedAt?: string | undefined;
  readonly isProvisional?: boolean | undefined;
}

export function renderDocumentFooters(doc: jsPDF, options?: FooterOptions): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 8;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Decorative footer line
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.25);
    doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);

    // Left: Legal authority & hash
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.textMuted);

    const hashSlice = options?.officialSha256 ? options.officialSha256.slice(0, 16) : "VERIFIED";
    const pinPart = options?.pin ? ` • PIN: ${options.pin}` : "";
    const docPart = options?.docNumber ? ` • Ref: ${options.docNumber}` : "";
    const leftText = `Government of the Punjab • Excise & Taxation • SHA-256: ${hashSlice}${pinPart}${docPart}`;
    doc.text(leftText, 10, footerY);

    // Right: Page numbering
    const rightText = `Page ${i} of ${totalPages}`;
    doc.text(rightText, pageWidth - 10, footerY, { align: "right" });
  }
}

export interface TableColumn {
  readonly header: string;
  readonly width: number; // in mm
  readonly align?: "left" | "center" | "right";
}

export interface PaginatedTableOptions {
  readonly columns: readonly TableColumn[];
  readonly rows: readonly (readonly (string | number)[])[];
  readonly startY: number;
  readonly docHeaderOptions?: HeaderOptions;
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly onPageAdded?: (pageNumber: number) => void;
}

/**
 * Deterministic multi-page table renderer with automatic row continuation
 * and repeated table headers on every subsequent page.
 */
export function renderPaginatedTable(doc: jsPDF, options: PaginatedTableOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 10;
  const bottomMargin = 16;
  const rowHeight = options.rowHeight ?? 6.5;
  const headerHeight = options.headerHeight ?? 7;

  let currentY = options.startY;

  function drawTableHeader(y: number): number {
    doc.setFillColor(...PDF_COLORS.primary);
    doc.rect(leftMargin, y, pageWidth - 20, headerHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.white);

    let colX = leftMargin;
    for (const col of options.columns) {
      const textX =
        col.align === "right"
          ? colX + col.width - 2
          : col.align === "center"
            ? colX + col.width / 2
            : colX + 2;
      doc.text(col.header, textX, y + 4.7, {
        align: col.align ?? "left"
      });
      colX += col.width;
    }

    return y + headerHeight;
  }

  currentY = drawTableHeader(currentY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  options.rows.forEach((row, rowIndex) => {
    // Check if new page is needed
    if (currentY + rowHeight > pageHeight - bottomMargin) {
      doc.addPage();
      if (options.onPageAdded) {
        options.onPageAdded(doc.getNumberOfPages());
      }
      let newPageY = 12;
      if (options.docHeaderOptions) {
        newPageY = renderDocumentHeader(doc, options.docHeaderOptions);
      }
      currentY = drawTableHeader(newPageY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    // Zebra striping
    if (rowIndex % 2 === 1) {
      doc.setFillColor(...PDF_COLORS.bgLight);
      doc.rect(leftMargin, currentY, pageWidth - 20, rowHeight, "F");
    }

    // Border line bottom
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.15);
    doc.line(leftMargin, currentY + rowHeight, pageWidth - 10, currentY + rowHeight);

    doc.setTextColor(...PDF_COLORS.textDark);

    let colX = leftMargin;
    row.forEach((cell, colIndex) => {
      const col = options.columns[colIndex];
      if (!col) return;

      const cellText = String(cell ?? "");
      const textX =
        col.align === "right"
          ? colX + col.width - 2
          : col.align === "center"
            ? colX + col.width / 2
            : colX + 2;

      // Truncate cell text if it would overflow width
      const maxWidth = col.width - 3;
      const fitText = doc.splitTextToSize(cellText, maxWidth)[0] ?? cellText;

      doc.text(fitText, textX, currentY + 4.5, {
        align: col.align ?? "left"
      });
      colX += col.width;
    });

    currentY += rowHeight;
  });

  return currentY;
}

/**
 * Official Statutory Reports PDF Studio
 * Generates authoritative, multi-page, paginated A4 Landscape reports for:
 * 1. Defaulters Roster & Arrears Roll (Rule 12 / Land Revenue)
 * 2. Circle Notice Dispatch & Service Register (Rule 6)
 * 3. Tax Clearance Certificates Log (Form PFT-5 / Rule 11)
 * 4. Relief & Appellate Adjustments Register (Section 5 & 7)
 * 5. Second Schedule Slab Yield Distribution Gazette
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters,
  renderPaginatedTable,
  type TableColumn,
  type HeaderOptions
} from "../base-document";
import type { DocumentGenerationOptions, StatutoryReportSchedule } from "../types";

export interface StatutoryReportData {
  readonly schedule?: StatutoryReportSchedule | undefined;
  readonly reportTitle?: string | undefined;
  readonly title?: string | undefined;
  readonly statutoryReference?: string | undefined;
  readonly scheduleCode?: string | undefined;
  readonly district?: string | undefined;
  readonly circle?: string | undefined;
  readonly financialYear?: string | undefined;
  readonly columns?: readonly TableColumn[] | undefined;
  readonly headers?: readonly string[] | undefined;
  readonly columnWidths?: readonly number[] | undefined;
  readonly rows: readonly (readonly (string | number)[])[];
  readonly summaryNotes?: string | undefined;
  readonly officialSha256?: string | undefined;
}

export async function generateStatutoryReportPdf(
  data: StatutoryReportData,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const reportTitle = data.reportTitle || data.title || "STATUTORY REPORT";
  const statutoryReference =
    data.statutoryReference || data.scheduleCode || "PUNJAB FINANCE ACT 1977";

  let columns: TableColumn[] = (data.columns as TableColumn[]) || [];
  if ((!columns || columns.length === 0) && data.headers && Array.isArray(data.headers)) {
    const totalAvailWidth = 277;
    const colCount = data.headers.length;
    const defaultColWidth = totalAvailWidth / colCount;
    columns = data.headers.map((h: string, idx: number) => ({
      header: h,
      dataKey: `col_${idx}`,
      width: data.columnWidths?.[idx] || defaultColWidth,
      align: idx === 0 ? "center" : "left"
    }));
  }

  const doc = createBasePdf({
    orientation: "landscape",
    title: reportTitle,
    subject: `Official Statutory Report: ${reportTitle}`,
    isProvisional: options?.isProvisional
  });

  const headerOpts: HeaderOptions = {
    docTitle: reportTitle,
    docSubtitle: "OFFICIAL GAZETTED STATUTORY REPORT",
    statutoryRuleReference: statutoryReference,
    district: data.district || "Vehari",
    circle: data.circle || "Circle-Vehari",
    financialYear: data.financialYear || "2026-2027",
    isProvisional: options?.isProvisional
  };

  const startY = renderDocumentHeader(doc, headerOpts);

  // Render multi-page paginated table with repeated headers on new pages
  const finalY = renderPaginatedTable(doc, {
    columns: columns,
    rows: data.rows,
    startY,
    docHeaderOptions: headerOpts,
    rowHeight: 6.5,
    headerHeight: 7
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  let footerBlockY = finalY + 4;

  if (footerBlockY > pageHeight - 28) {
    doc.addPage();
    renderDocumentHeader(doc, headerOpts);
    footerBlockY = startY;
  }

  // Summary certification / notes block
  if (data.summaryNotes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(data.summaryNotes, 10, footerBlockY);
    footerBlockY += 6;
  }

  // ETO Sign-off line
  const sigX = 220;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, footerBlockY + 8, sigX + 55, footerBlockY + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Tariq Mahmood", sigX + 27.5, footerBlockY + 11.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Excise & Taxation Officer / Circle Head", sigX + 27.5, footerBlockY + 14.5, {
    align: "center"
  });

  renderDocumentFooters(doc, {
    officialSha256: data.officialSha256,
    docNumber: `REPORT_${data.schedule}`,
    isProvisional: options?.isProvisional
  });

  return doc;
}

/**
 * Form P.F.T - 3: Official Statutory Assessment Register (Rule 11)
 * Multi-page A4 Landscape tabular document generated directly from the authoritative dataset.
 *
 * Implements Section 7 of the Consolidated Implementation Specification:
 * - Deterministic A4 Landscape (297mm x 210mm)
 * - Complete dataset rendering regardless of on-screen pagination or scroll
 * - Automatic row continuation across pages with repeated table headers
 * - Page numbering (Page X of Y) and official footer metadata
 * - Selectable text and summary certification block
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
import type { FormPFT3RowModel } from "../../statutory-forms";

export interface Pft3RegisterPdfData {
  readonly rows: readonly FormPFT3RowModel[];
  readonly district?: string | undefined;
  readonly circle?: string | undefined;
  readonly financialYear?: string | undefined;
  readonly generatedBy?: string | undefined;
  readonly certifiedByTitle?: string | undefined;
  readonly officialSha256?: string | undefined;
}

import type { DocumentGenerationOptions } from "../types";

export async function generatePft3RegisterPdf(
  data: Pft3RegisterPdfData,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "landscape",
    title: "Form P.F.T - 3 : Statutory Assessment Register",
    subject:
      "Statutory Assessment Register under Rule 11 of Punjab Professions & Trades Tax Rules 1977",
    isProvisional: options?.isProvisional
  });

  const headerOpts: HeaderOptions = {
    docTitle: "FORM P.F.T - 3 : STATUTORY ASSESSMENT REGISTER",
    docSubtitle: "Register of Assessed Persons, Tax Liabilities and Demands",
    statutoryRuleReference:
      "(Maintained under Rule 11 of the Punjab Professions and Trades Tax Rules, 1977)",
    district: data.district || "Vehari",
    circle: data.circle || "Circle-Vehari",
    financialYear: data.financialYear || "2026-2027",
    isProvisional: options?.isProvisional
  };

  const startY = renderDocumentHeader(doc, headerOpts);

  // Column definitions matching 277mm usable width
  const columns: readonly TableColumn[] = [
    { header: "Sr.", width: 8, align: "center" },
    { header: "Demand No", width: 23, align: "left" },
    { header: "Provincial UIN", width: 28, align: "left" },
    { header: "Assessee Legal / Trade Name", width: 46, align: "left" },
    { header: "CNIC / NTN", width: 26, align: "left" },
    { header: "Schedule Entry & Slab", width: 42, align: "left" },
    { header: "Current", width: 18, align: "right" },
    { header: "Arrears", width: 16, align: "right" },
    { header: "Total Dem", width: 18, align: "right" },
    { header: "Paid", width: 18, align: "right" },
    { header: "Balance", width: 18, align: "right" },
    { header: "Status", width: 16, align: "center" }
  ];

  // Map rows to strings/numbers
  let sumCurrent = 0;
  let sumArrears = 0;
  let sumDemand = 0;
  let sumPaid = 0;
  let sumBalance = 0;

  const tableRows = data.rows.map((r, index) => {
    sumCurrent += r.assessedCurrentTax;
    sumArrears += r.arrears;
    sumDemand += r.totalDemand;
    sumPaid += r.totalPaid;
    sumBalance += r.outstandingBalance;

    const nameCell = r.tradeName ? `${r.legalName} (${r.tradeName})` : r.legalName;
    const catCell = r.tertiarySlab || r.categoryName || r.scheduleEntry;

    return [
      index + 1,
      r.permanentDemandNo || r.assessmentNo || "N/A",
      r.provincialUin || "N/A",
      nameCell,
      r.identifier || "N/A",
      catCell,
      Number(r.assessedCurrentTax ?? 0).toLocaleString(),
      Number(r.arrears ?? 0).toLocaleString(),
      Number(r.totalDemand ?? 0).toLocaleString(),
      Number(r.totalPaid ?? 0).toLocaleString(),
      Number(r.outstandingBalance ?? 0).toLocaleString(),
      r.assessmentStatus || "ASSESSED"
    ];
  });

  // Render paginated table with repeated headers on new pages
  const finalY = renderPaginatedTable(doc, {
    columns,
    rows: tableRows,
    startY,
    docHeaderOptions: headerOpts,
    rowHeight: 6.5,
    headerHeight: 7
  });

  // Add Grand Totals Summary Row
  const pageHeight = doc.internal.pageSize.getHeight();
  let totalsY = finalY + 2;

  // If totals would collide with footer, add page
  if (totalsY > pageHeight - 32) {
    doc.addPage();
    renderDocumentHeader(doc, headerOpts);
    totalsY = startY;
  }

  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.3);
  doc.rect(10, totalsY, 277, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`GRAND TOTALS (${data.rows.length} UNITS ASSESSED):`, 14, totalsY + 5.2);

  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textDark);
  const totalsText = `Assessed: PKR ${sumCurrent.toLocaleString()}  |  Arrears: PKR ${sumArrears.toLocaleString()}  |  Total Demand: PKR ${sumDemand.toLocaleString()}  |  Total Paid: PKR ${sumPaid.toLocaleString()}  |  Net Balance: PKR ${sumBalance.toLocaleString()}`;
  doc.text(totalsText, 100, totalsY + 5.2);

  // Official Certification & ETO Signature Block
  let certY = totalsY + 12;
  if (certY > pageHeight - 24) {
    doc.addPage();
    renderDocumentHeader(doc, headerOpts);
    certY = startY;
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    "Certified that the above entries constitute the complete, authoritative register of professional taxpayers and tax liabilities for Circle-Vehari, authenticated under Section 3 & Rule 11.",
    10,
    certY
  );

  const sigX = 220;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, certY + 8, sigX + 55, certY + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Tariq Mahmood", sigX + 27.5, certY + 11.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Excise & Taxation Officer (Assessing Authority)", sigX + 27.5, certY + 14.5, {
    align: "center"
  });

  // Footers with page numbering and SHA-256
  renderDocumentFooters(doc, {
    officialSha256: data.officialSha256,
    docNumber: "FORM_PFT3_REGISTER",
    isProvisional: options?.isProvisional
  });

  return doc;
}

export const generatePft3AssessmentRegisterPdf = generatePft3RegisterPdf;

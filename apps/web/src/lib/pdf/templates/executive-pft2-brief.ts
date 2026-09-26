/**
 * Form P.F.T - 2: Executive Management Statistical Brief
 * Generates an executive-level analytical document of all issued PFT-2 payment instruments:
 * - Gross demand assessed vs actual treasury collections
 * - Circle-level distribution and yields
 * - Category-level breakdown
 * - Full vs partial payment scope distribution
 * - Executive KPIs and official authentication
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters,
  renderPaginatedTable
} from "../base-document";
import type { DocumentGenerationOptions, ExecutivePft2BriefData } from "../types";

export async function generateExecutivePft2BriefPdf(
  data: ExecutivePft2BriefData,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "portrait",
    title: "Executive PFT-2 Management Statistical Brief",
    subject:
      "Executive Management Information System (MIS) Statistical Brief of Form PFT-2 Challans",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "EXECUTIVE P.F.T - 2 MANAGEMENT BRIEF",
    docSubtitle: "Statistical Analysis of Form P.F.T-2 Challans & Treasury Receipts",
    statutoryRuleReference: "(Executive MIS Intelligence & Revenue Monitoring — District Vehari)",
    district: "Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // KPI Metric Cards (4 cards in a row)
  const cardW = (contentWidth - 9) / 4;
  const cardH = 18;

  const totalChallans = data.totalChallans ?? 0;
  const totalAssessedSum = data.totalAssessedSum ?? 0;
  const totalReceivedSum = data.totalReceivedSum ?? 0;
  const totalOutstandingSum =
    data.totalOutstandingSum ?? Math.max(0, totalAssessedSum - totalReceivedSum);
  const issuedCount = data.issuedCount ?? totalChallans;

  const collectionRate =
    totalAssessedSum > 0 ? ((totalReceivedSum / totalAssessedSum) * 100).toFixed(1) : "0.0";

  const cards = [
    { title: "CHALLANS ISSUED", val: totalChallans.toString(), sub: `${issuedCount} Active` },
    { title: "GROSS DEMAND", val: `PKR ${(totalAssessedSum / 1000).toFixed(0)}k`, sub: "Assessed" },
    {
      title: "COLLECTED",
      val: `PKR ${(totalReceivedSum / 1000).toFixed(0)}k`,
      sub: `${collectionRate}% Yield`
    },
    {
      title: "OUTSTANDING",
      val: `PKR ${(totalOutstandingSum / 1000).toFixed(0)}k`,
      sub: "Receivable"
    }
  ];

  cards.forEach((c, idx) => {
    const cardX = left + idx * (cardW + 3);
    doc.setFillColor(...PDF_COLORS.bgHeader);
    doc.setDrawColor(...PDF_COLORS.primary);
    doc.setLineWidth(0.25);
    doc.roundedRect(cardX, curY, cardW, cardH, 1, 1, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(c.title, cardX + cardW / 2, curY + 4.5, { align: "center" });

    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(c.val, cardX + cardW / 2, curY + 10.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...PDF_COLORS.textDark);
    doc.text(c.sub, cardX + cardW / 2, curY + 15, { align: "center" });
  });

  // Section 1: Circle Yield Breakdown Table
  curY += cardH + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("1. ADMINISTRATIVE CIRCLE REVENUE YIELD BREAKDOWN", left, curY);

  curY += 3;
  const circleColumns = [
    { header: "Circle Name", width: 80, align: "left" as const },
    { header: "Challans Issued", width: 45, align: "center" as const },
    { header: "Total Assessed (PKR)", width: 57, align: "right" as const }
  ];

  const circleRows = (data.circleBreakdown || []).map((c) => [
    c.circleName,
    c.count,
    c.totalAmount.toLocaleString()
  ]);

  curY = renderPaginatedTable(doc, {
    columns: circleColumns,
    rows: circleRows,
    startY: curY,
    rowHeight: 6,
    headerHeight: 6.5
  });

  // Section 2: Statutory Category Distribution Table
  curY += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("2. STATUTORY CATEGORY DISTRIBUTION & YIELD", left, curY);

  curY += 3;
  const categoryColumns = [
    { header: "Statutory Activity Category", width: 95, align: "left" as const },
    { header: "Challans", width: 35, align: "center" as const },
    { header: "Assessed Amount (PKR)", width: 52, align: "right" as const }
  ];

  const categoryRows = (data.categoryBreakdown || []).map((c) => [
    c.categoryName,
    c.count,
    c.totalAmount.toLocaleString()
  ]);

  curY = renderPaginatedTable(doc, {
    columns: categoryColumns,
    rows: categoryRows,
    startY: curY,
    rowHeight: 6,
    headerHeight: 6.5
  });

  // Section 3: Payment Scope & Status Summary
  curY += 6;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 16, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PAYMENT SCOPE & STATUS COMPLIANCE SUMMARY:", left + 4, curY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`Full Scope Payment Challans: ${data.fullScopeCount}`, left + 4, curY + 9.5);
  doc.text(`Partial Scope Installment Challans: ${data.partialScopeCount}`, left + 4, curY + 13.5);

  doc.text(`Issued / In-Circulation: ${data.issuedCount}`, left + 85, curY + 9.5);
  doc.text(`Received / Deposited: ${data.receivedCount}`, left + 85, curY + 13.5);

  doc.text(`Cancelled / Recalled: ${data.cancelledCount}`, left + 140, curY + 9.5);
  doc.text(
    `Generation Date: ${data.generatedAt || new Date().toISOString().split("T")[0]}`,
    left + 140,
    curY + 13.5
  );

  // Executive Sign-off Block
  curY += 24;
  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 10, sigX + 60, curY + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(data.officerName || "Shahid Nawaz", sigX + 30, curY + 13.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    data.officerTitle || "Director Excise & Taxation / Executive Reviewer",
    sigX + 30,
    curY + 17,
    { align: "center" }
  );

  renderDocumentFooters(doc, {
    officialSha256: data.officialSha256,
    docNumber: "EXECUTIVE_PFT2_BRIEF",
    isProvisional: options?.isProvisional
  });

  return doc;
}

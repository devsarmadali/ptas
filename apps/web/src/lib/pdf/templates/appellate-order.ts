/**
 * Appellate Authority Judicial Order (Section 7 & Rule 13)
 * Official judicial decree resolving statutory appeals against Form P.F.T-1 assessment notices.
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { AppellateOrderModel } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

export async function generateAppellateOrderPdf(
  order: AppellateOrderModel,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const appealNumber = order.appealNumber || "APP-0000";
  const orderNumber = order.orderNumber || `ORD-${appealNumber}`;
  const pin = order.pin || "68000000";
  const orderDate = order.orderDate || "2026-08-05";
  const appellantName = order.appellantName || "Appellant";
  const appellantTradeName = order.appellantTradeName || "";
  const appellantIdentifier = order.appellantIdentifier || "N/A";
  const appellantAddress = order.appellantAddress || "Vehari";
  const respondentTitle =
    order.respondentTitle || "Assessing Authority / Excise & Taxation Officer, Vehari";
  const impugnedNoticeNumber = order.impugnedNoticeNumber || "PFT1-DEMAND-NOTICE";
  const demandNumber = order.demandNumber || "N/A";
  const groundOfAppeal = order.groundOfAppeal || "Disputed assessment classification";
  const undisputedTaxDeposited = order.undisputedTaxDeposited ?? 0;
  const findingsAndReasoning =
    order.findingsAndReasoning || "Appeal reviewed and adjudicated pursuant to Section 7.";
  const originalTaxAmount = order.originalTaxAmount ?? 4000;
  const revisedTaxAmount = order.revisedTaxAmount ?? originalTaxAmount;
  const reliefAmount = order.reliefAmount ?? Math.max(0, originalTaxAmount - revisedTaxAmount);
  const decisionType = order.decisionType || (reliefAmount > 0 ? "REDUCE" : "CONFIRM");
  const appellateAuthorityName = order.appellateAuthorityName || "Shahid Nawaz";
  const appellateAuthorityDesignation =
    order.appellateAuthorityDesignation ||
    "Director Excise & Taxation / Appellate Authority, Multan Division";
  const qrPayload =
    order.qrPayload || JSON.stringify({ appealNumber, orderNumber, decisionType, reliefAmount });
  const officialSha256 = order.officialSha256 || "sha256-appellate-authenticated";

  const doc = createBasePdf({
    orientation: "portrait",
    title: `Appellate Order - ${orderNumber}`,
    subject: "Statutory Judicial Decree under Section 7 of Punjab Finance Act, 1977",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "JUDICIAL ORDER OF APPELLATE AUTHORITY",
    docSubtitle: "ORDER PASSED UNDER SECTION 7 READ WITH RULE 13",
    statutoryRuleReference:
      "(Court of Appellate Authority / Director Excise & Taxation, Multan Division)",
    district: "Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // Appeal & Order Reference Box
  curY += 2;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 14, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Appeal Number:", left + 4, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(String(appealNumber), left + 28, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Order Number:", left + 95, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(String(orderNumber), left + 120, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 4, curY + 10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${pin}`, left + 28, curY + 10);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Order Date:", left + 95, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(String(orderDate), left + 120, curY + 10);

  // Cause Title: Parties
  curY += 18;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PARTIES TO THE STATUTORY APPEAL:", left + 4, curY + 4);

  curY += 7;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.setFont("helvetica", "bold");
  doc.text("Appellant:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  const appellantLabel = appellantTradeName
    ? `${appellantName} (${appellantTradeName})`
    : appellantName;
  doc.text(`${appellantLabel} • ${appellantIdentifier}`, left + 24, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Address:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(String(appellantAddress), left + 24, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Respondent:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(String(respondentTitle), left + 24, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Impugned Notice:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(`${impugnedNoticeNumber} (Demand No: ${demandNumber})`, left + 32, curY + 4);

  // Decision Verdict Banner (Highlighted)
  curY += 10;
  const decisionColors: Record<
    string,
    { bg: [number, number, number]; text: [number, number, number] }
  > = {
    CONFIRM: { bg: [254, 242, 242], text: [185, 28, 28] },
    CONFIRMED: { bg: [254, 242, 242], text: [185, 28, 28] },
    REDUCE: { bg: [240, 253, 244], text: [4, 120, 87] },
    PARTIALLY_ALLOWED: { bg: [240, 253, 244], text: [4, 120, 87] },
    ANNUL: { bg: [239, 246, 255], text: [29, 78, 216] },
    REMAND: { bg: [255, 251, 235], text: [180, 83, 9] },
    PENALTY_REMISSION: { bg: [240, 253, 244], text: [4, 120, 87] },
    ENHANCE: { bg: [254, 242, 242], text: [185, 28, 28] }
  };

  const fallbackColors: { bg: [number, number, number]; text: [number, number, number] } = {
    bg: [240, 253, 244],
    text: [4, 120, 87]
  };
  const colorScheme = decisionColors[decisionType] || fallbackColors;

  doc.setFillColor(...colorScheme.bg);
  doc.setDrawColor(...colorScheme.text);
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...colorScheme.text);
  doc.text(
    `APPELLATE DECISION: ${decisionType}  •  RELIEF GRANTED: PKR ${Number(reliefAmount).toLocaleString()}`,
    pageWidth / 2,
    curY + 5.5,
    { align: "center" }
  );

  // Judicial Reasoning & Operative Order
  curY += 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("JUDICIAL FINDINGS & OPERATIVE ORDER:", left, curY);

  curY += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_COLORS.textDark);

  const findingsText = [
    `Ground of Appeal: ${groundOfAppeal}`,
    `Undisputed Tax Deposited Prior to Hearing: PKR ${Number(undisputedTaxDeposited).toLocaleString()}`,
    "",
    `Findings: ${findingsAndReasoning}`,
    "",
    `Operative Order: Assessment of Professional Tax for the Financial Year 2026-2027 is hereby revised to PKR ${Number(revisedTaxAmount).toLocaleString()}. The Assessing Authority Vehari is directed to update the Demand Ledger and issue an amended Form PFT-2 accordingly.`
  ];

  for (const para of findingsText) {
    if (para === "") {
      curY += 2;
    } else {
      const lines = doc.splitTextToSize(para, contentWidth);
      doc.text(lines, left, curY);
      curY += lines.length * 4.2;
    }
  }

  // Summary Ledger Effect Table
  curY += 4;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("ORIGINAL DEMAND", left + 4, curY + 4.8);
  doc.text("APPELLATE RELIEF", left + 70, curY + 4.8);
  doc.text("FINAL REVISED DEMAND", left + contentWidth - 4, curY + 4.8, { align: "right" });

  curY += 7;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, 8, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.line(left, curY + 8, left + contentWidth, curY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`PKR ${Number(originalTaxAmount).toLocaleString()}`, left + 4, curY + 5.2);
  doc.text(`PKR ${Number(reliefAmount).toLocaleString()}`, left + 70, curY + 5.2);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(
    `PKR ${Number(revisedTaxAmount).toLocaleString()}`,
    left + contentWidth - 4,
    curY + 5.2,
    { align: "right" }
  );

  // QR Code & Appellate Authority Seal
  curY += 16;
  const qrDataUrl = await generateQrDataUrl(qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${pin}`, left + 15, curY + 26, { align: "center" });

  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 16, sigX + 60, curY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(appellateAuthorityName, sigX + 30, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(appellateAuthorityDesignation, sigX + 30, curY + 24, { align: "center" });
  doc.text("Division Multan / Appellate Court", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256,
    pin,
    docNumber: orderNumber,
    isProvisional: options?.isProvisional
  });

  return doc;
}

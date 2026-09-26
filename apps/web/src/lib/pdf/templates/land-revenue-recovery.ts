/**
 * Land Revenue Recovery Certificate
 * Governed by Section 11 of Punjab Finance Act, 1977 read with Section 67 of Punjab Land Revenue Act, 1967.
 * Statutory requisition to the Collector of the District for recovery of tax default as arrears of land revenue.
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { LandRevenueRecoveryCertificateModel } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

export async function generateLandRevenueRecoveryPdf(
  cert: LandRevenueRecoveryCertificateModel,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "portrait",
    title: `Recovery Certificate - ${cert.certificateNumber}`,
    subject: "Statutory Requisition for Recovery of Arrears as Arrears of Land Revenue",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "CERTIFICATE FOR RECOVERY AS ARREARS OF LAND REVENUE",
    docSubtitle: "STATUTORY REQUISITION UNDER SECTION 11 READ WITH PUNJAB LAND REVENUE ACT, 1967",
    statutoryRuleReference:
      "(Issued under Section 11 of the Punjab Finance Act, 1977 read with Section 67 of Punjab Land Revenue Act, 1967)",
    district: cert.collectorDistrict || "Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // Requisition Banner Box
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 14, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Certificate Ref:", left + 4, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(cert.certificateNumber, left + 28, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Permanent Demand No:", left + 95, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(cert.demandNumber, left + 138, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 4, curY + 10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${cert.pin}`, left + 28, curY + 10);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Date of Certificate:", left + 95, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(cert.issueDate || "2026-08-01", left + 138, curY + 10);

  // Addressed to Collector
  curY += 18;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TO THE COLLECTOR OF THE DISTRICT:", left + 4, curY + 4);

  curY += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("The Deputy Commissioner / Collector,", left + 4, curY + 4);
  doc.text(`District ${cert.collectorDistrict || "Vehari"}, Punjab.`, left + 4, curY + 8);

  // Legal Recital
  curY += 14;
  const legalText = [
    `WHEREAS the person whose particulars are set out below has made default in the payment of Professional Tax assessed under Section 3 of the Punjab Finance Act, 1977, together with statutory penalties accrued thereon under Section 3(5);`,
    "",
    `AND WHEREAS an official Notice of Demand (Form PFT-1) and Show Cause Notice were duly served upon the defaulter and the prescribed statutory period has expired without payment;`,
    "",
    `NOW THEREFORE, under Section 11 of the Punjab Finance Act, 1977, I, Tariq Mahmood, Excise & Taxation Officer / Assessing Authority, hereby certify that the sum of PKR ${cert.totalArrearsRecoverable.toLocaleString()} (${cert.totalArrearsWords}) is lawfully due and recoverable from the said defaulter as an arrear of land revenue under the Punjab Land Revenue Act, 1967.`,
    "",
    "You are requested to recover the said amount forthwith from the defaulter through revenue recovery process and remit the proceeds to Provincial Head of Account: 0113-Taxes on Professions, Trades and Callings."
  ];

  for (const paragraph of legalText) {
    if (paragraph === "") {
      curY += 2;
    } else {
      const lines = doc.splitTextToSize(paragraph, contentWidth);
      doc.text(lines, left, curY);
      curY += lines.length * 4.2;
    }
  }

  // Defaulter Particulars & Amount Table
  curY += 4;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("DEFAULTER PARTICULARS", left + 4, curY + 4.8);
  doc.text("IDENTIFIER", left + 85, curY + 4.8);
  doc.text("TOTAL ARREARS DUE (PKR)", left + contentWidth - 4, curY + 4.8, { align: "right" });

  curY += 7;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, 14, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.line(left, curY + 14, left + contentWidth, curY + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(cert.assesseeLegalName, left + 4, curY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(cert.address, left + 4, curY + 9.5, { maxWidth: 75 });

  doc.text(cert.identifier, left + 85, curY + 5);
  doc.text(`Section: ${cert.recoverySection || "Section 11"}`, left + 85, curY + 9.5, {
    maxWidth: 50
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.danger);
  doc.text(
    `PKR ${cert.totalArrearsRecoverable.toLocaleString()}`,
    left + contentWidth - 4,
    curY + 8,
    { align: "right" }
  );

  // QR Code & Assessing Authority Signature
  curY += 20;
  const qrDataUrl = await generateQrDataUrl(cert.qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${cert.pin}`, left + 15, curY + 26, { align: "center" });

  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 16, sigX + 60, curY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(cert.assessingAuthorityName || "Tariq Mahmood", sigX + 30, curY + 20, {
    align: "center"
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    cert.assessingAuthorityTitle || "Excise & Taxation Officer / Assessing Authority",
    sigX + 30,
    curY + 24,
    { align: "center" }
  );
  doc.text("District Vehari", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256: cert.officialSha256,
    pin: cert.pin,
    docNumber: cert.certificateNumber,
    isProvisional: options?.isProvisional
  });

  return doc;
}

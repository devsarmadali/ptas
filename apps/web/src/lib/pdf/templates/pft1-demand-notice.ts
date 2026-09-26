/**
 * Form P.F.T - 1: Official Notice of Demand of Professional Tax
 * Governed by Section 3 of Punjab Finance Act, 1977 and Rule 6 of 1977 Rules.
 *
 * Implements A4 Portrait vector statutory document with:
 * - Legal notice header and seal
 * - Assessee particulars & assessment breakdown
 * - Statutory appeal and penalty warnings
 * - Vector QR code with security PIN
 * - Tear-off Rule 6 Service Receipt Counterfoil at bottom
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { FormPFT1Model } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

export async function generatePft1DemandNoticePdf(
  notice: FormPFT1Model,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "portrait",
    title: `Notice of Demand Form P.F.T-1 - ${notice.noticeNumber}`,
    subject: "Statutory Notice of Demand of Professional Tax (Rule 6)",
    isProvisional: options?.isProvisional || !notice.isApproved
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28; // 182mm

  // 1. Official Header
  let curY = renderDocumentHeader(doc, {
    docTitle: "FORM P.F.T - 1 : NOTICE OF TAX DEMAND",
    docSubtitle: "NOTICE OF DEMAND OF PROFESSIONAL TAX",
    statutoryRuleReference:
      "(Prescribed under Rule 6 of the Punjab Professions and Trades Tax Rules, 1977)",
    district: notice.districtName || "Vehari",
    circle: notice.circleName || "Circle-Vehari",
    financialYear: notice.financialYear || "2026-2027",
    isProvisional: options?.isProvisional || !notice.isApproved
  });

  // 2. Reference & Due Date Meta Grid
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 16, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Notice Ref:", left + 4, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(notice.noticeNumber, left + 24, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Permanent Demand No:", left + 100, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(notice.demandNumber, left + 140, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 4, curY + 10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${notice.pin || "68000000"}`, left + 24, curY + 10.5);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Issue Date:", left + 65, curY + 10.5);
  doc.setFont("helvetica", "normal");
  doc.text(notice.issueDate || "2026-08-01", left + 82, curY + 10.5);

  // Due Date Highlight Box
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(217, 119, 6);
  doc.rect(left + 115, curY + 7.5, 63, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text(`DUE DATE: ${notice.dueDate || "31/08/2026"}`, left + 146.5, curY + 11.8, {
    align: "center"
  });

  // 3. Addressee / Assessee Particulars Box
  curY += 20;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TO (ASSESSEE PARTICULARS):", left + 4, curY + 4);

  curY += 6.5;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.setFont("helvetica", "bold");
  doc.text("Legal Name:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(notice.assesseeLegalName, left + 30, curY + 4);

  if (notice.assesseeTradeName) {
    doc.setFont("helvetica", "bold");
    doc.text("Trade Name:", left + 100, curY + 4);
    doc.setFont("helvetica", "normal");
    doc.text(notice.assesseeTradeName, left + 122, curY + 4);
  }

  curY += 6;
  doc.setFont("helvetica", "bold");
  doc.text("CNIC / NTN:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(notice.taxNumber || "N/A", left + 30, curY + 4);

  if (notice.provincialUin) {
    doc.setFont("helvetica", "bold");
    doc.text("Provincial UIN:", left + 100, curY + 4);
    doc.setFont("helvetica", "normal");
    doc.text(notice.provincialUin, left + 124, curY + 4);
  }

  curY += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Business Address:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  const addrWrapped = doc.splitTextToSize(notice.address || "", contentWidth - 36);
  doc.text(addrWrapped[0] || "", left + 30, curY + 4);

  // 4. Formal Statutory Demand Text
  curY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  const formalText =
    "Please take notice that for the financial year 2026-2027, an assessment of Professional Tax under Section 3 of the Punjab Finance Act, 1977 has been determined against you by the undersigned Assessing Authority under Rule 4 of the Punjab Professions and Trades Tax Rules, 1977 as set forth below:";
  const formalLines = doc.splitTextToSize(formalText, contentWidth);
  doc.text(formalLines, left, curY);

  // 5. Assessment Schedule Table
  curY += formalLines.length * 4.5 + 4;
  const tableH = 7;

  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, tableH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("STATUTORY ENTRY & ACTIVITY CLASS", left + 4, curY + 4.8);
  doc.text("CLASSIFICATION / SLAB", left + 85, curY + 4.8);
  doc.text("TAX ASSESSED (PKR)", left + contentWidth - 4, curY + 4.8, { align: "right" });

  curY += tableH;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, 8, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(left, curY + 8, left + contentWidth, curY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(notice.scheduleEntry || "Schedule Entry", left + 4, curY + 5.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const classText = notice.tertiarySlab || notice.statutoryCategoryText || "Applicable Slab";
  doc.text(classText, left + 85, curY + 5.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(`PKR ${notice.taxAmount.toLocaleString()}`, left + contentWidth - 4, curY + 5.2, {
    align: "right"
  });

  // Total Demand Highlight Box
  curY += 8;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, 9, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TOTAL STATUTORY DEMAND PAYABLE:", left + 4, curY + 6);
  doc.setFontSize(10.5);
  doc.text(`PKR ${notice.taxAmount.toLocaleString()}`, left + contentWidth - 4, curY + 6.2, {
    align: "right"
  });

  // Amount in words
  curY += 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Amount in Words:", left, curY);
  doc.setFont("helvetica", "italic");
  doc.text(notice.taxAmountWords || "", left + 28, curY);

  // 6. Statutory Warnings & Appeal Information
  curY += 8;
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(left, curY, left + contentWidth, curY);

  curY += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("STATUTORY COMPLIANCE & LEGAL INSTRUCTIONS:", left, curY);

  curY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textDark);
  const instructions = [
    `1. Payment Instrument: You are required to deposit the demand of PKR ${notice.taxAmount.toLocaleString()} on or before ${notice.dueDate || "31/08/2026"} into the National Bank of Pakistan (NBP), State Bank of Pakistan (SBP), or via 1Link ePay using official Challan Form P.F.T-2.`,
    "2. Right of Appeal: If you dispute this assessment, an appeal under Section 7 of the Punjab Finance Act, 1977 read with Rule 13 may be preferred to the Director Excise & Taxation (Appellate Authority) within thirty (30) days of the date of service of this notice, provided that undisputed tax is first deposited.",
    "3. Consequence of Default: Failure to pay by the due date shall render you liable to a default penalty up to the full tax amount under Section 3(5) of the Act, and recovery as arrears of land revenue under Section 11."
  ];

  for (const inst of instructions) {
    const lines = doc.splitTextToSize(inst, contentWidth);
    doc.text(lines, left, curY);
    curY += lines.length * 3.5 + 1.5;
  }

  // 7. QR Code and Assessing Authority Signature
  const qrDataUrl = await generateQrDataUrl(notice.qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY + 2, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${notice.pin}`, left + 15, curY + 28, { align: "center" });

  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 16, sigX + 60, curY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(notice.assessingAuthorityName || "Tariq Mahmood", sigX + 30, curY + 20, {
    align: "center"
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    notice.assessingAuthorityTitle || "Excise & Taxation Officer / Assessing Authority",
    sigX + 30,
    curY + 24,
    { align: "center" }
  );
  doc.text("Tehsil / District Vehari", sigX + 30, curY + 27.5, { align: "center" });

  // 8. Perforated Rule 6 Service Receipt Counterfoil
  const counterfoilY = 246;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(left, counterfoilY, left + contentWidth, counterfoilY);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    "✂  TEAR-OFF SERVICE COUNTERFOIL (RULE 6 RECEIPT)  ✂",
    pageWidth / 2,
    counterfoilY - 1.5,
    { align: "center" }
  );

  let receiptY = counterfoilY + 5;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, receiptY, contentWidth, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("SERVICE RECEIPT — TO BE COMPLETED UPON DELIVERY", left + 4, receiptY + 3.6);

  receiptY += 7.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text(`Demand No: ${notice.demandNumber}`, left + 4, receiptY);
  doc.text(`Tax Payable: PKR ${notice.taxAmount.toLocaleString()}`, left + 60, receiptY);
  doc.text(`Due Date: ${notice.dueDate || "31/08/2026"}`, left + 120, receiptY);

  receiptY += 5;
  doc.text(`Assessee: ${notice.assesseeLegalName}`, left + 4, receiptY);
  doc.text(`CNIC/NTN: ${notice.taxNumber || "N/A"}`, left + 120, receiptY);

  receiptY += 5.5;
  doc.text("Served By: Muhammad Aslam, Tax Inspector", left + 4, receiptY);
  doc.text("Date of Service: ____ / ____ / 2026", left + 80, receiptY);

  receiptY += 6;
  doc.line(left + 4, receiptY + 6, left + 55, receiptY + 6);
  doc.text("Signature of Serving Officer", left + 29.5, receiptY + 9.5, { align: "center" });

  doc.line(left + 120, receiptY + 6, left + contentWidth - 4, receiptY + 6);
  doc.text("Signature / Thumbprint of Assessee", left + 150, receiptY + 9.5, { align: "center" });

  // Footers
  renderDocumentFooters(doc, {
    officialSha256: notice.officialSha256,
    pin: notice.pin,
    docNumber: notice.noticeNumber,
    isProvisional: options?.isProvisional || !notice.isApproved
  });

  return doc;
}

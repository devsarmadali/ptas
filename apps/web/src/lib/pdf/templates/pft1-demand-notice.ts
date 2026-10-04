/**
 * Form P.F.T - 1: Official Notice of Demand of Professional Tax
 * Governed by Section 3 of Punjab Finance Act, 1977 and Rule 6 of 1977 Rules.
 *
 * Implements A4 Portrait vector statutory document with:
 * - Legal notice header and government seal
 * - Assessee particulars & assessment breakdown
 * - Accounting-grade statutory assessment schedule
 * - Clear legal compliance, default penalty, and appeal directives
 * - Scannable vector QR code with Security Code badge placed below
 * - Assessing authority signature & seal
 * - Tear-off Rule 6 Service Receipt Counterfoil at bottom with process server lines
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

  const district = notice.districtName || "Vehari";
  const circle = notice.circleName || "Circle-I";

  // 1. Official Header
  let curY = renderDocumentHeader(doc, {
    docTitle: "FORM P.F.T - 1 : NOTICE OF TAX DEMAND",
    docSubtitle: "STATUTORY NOTICE OF DEMAND OF PROFESSIONAL TAX",
    statutoryRuleReference:
      "(Prescribed under Rule 6 of the Punjab Professions and Trades Tax Rules, 1977)",
    district,
    circle,
    financialYear: notice.financialYear || "2026-2027",
    isProvisional: options?.isProvisional || !notice.isApproved
  });

  // 2. Reference & Due Date Meta Grid (Clean 2-row layout)
  const metaGridH = 17.0;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.roundedRect(left, curY, contentWidth, metaGridH, 1, 1, "FD");

  // Row 1: Notice No & Demand Number
  let mY = curY + 5.0;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.0);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Notice Ref:", left + 4, mY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(30, 58, 138); // blue
  doc.text(notice.noticeNumber, left + 24, mY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.0);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Demand Number:", left + 105, mY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(notice.demandNumber, left + 138, mY);

  // Row 2: Issue Date, Jurisdiction & Due Date Callout
  mY += 6.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Issue Date:", left + 4, mY);
  doc.setFont("helvetica", "normal");
  doc.text(notice.issueDate || "01/07/2026", left + 24, mY);

  doc.setFont("helvetica", "bold");
  doc.text("Jurisdiction:", left + 55, mY);
  doc.setFont("helvetica", "normal");
  doc.text(`${circle} • ${district}`, left + 75, mY);

  // Due Date Highlight Pill
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.25);
  doc.roundedRect(left + 118, curY + 9.5, 60, 6.0, 0.8, 0.8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(185, 28, 28);
  doc.text(`STATUTORY DUE DATE: ${notice.dueDate || "31/08/2026"}`, left + 148, curY + 13.8, {
    align: "center"
  });

  curY += metaGridH + 3.5;

  // 3. Taxpayer / Assessee Particulars Box
  const taxpayerBoxH = 26.0;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.roundedRect(left, curY, contentWidth, taxpayerBoxH, 1, 1, "FD");

  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.0);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TO (ASSESSEE PARTICULARS):", left + 4, curY + 4.0);

  let tY = curY + 9.8;
  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_COLORS.textDark);

  // Row 1: Legal Name & Proprietor
  doc.setFont("helvetica", "bold");
  doc.text("Legal Name:", left + 4, tY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.text(notice.assesseeLegalName, left + 26, tY);

  if (notice.assesseeTradeName && notice.assesseeTradeName !== notice.assesseeLegalName) {
    doc.setFontSize(7.8);
    doc.setFont("helvetica", "bold");
    doc.text("Trade Name:", left + 105, tY);
    doc.setFont("helvetica", "normal");
    doc.text(notice.assesseeTradeName, left + 128, tY);
  }

  // Row 2: CNIC / NTN & Provincial UIN
  tY += 5.2;
  doc.setFontSize(7.8);
  doc.setFont("helvetica", "bold");
  doc.text("CNIC / NTN:", left + 4, tY);
  doc.setFont("helvetica", "normal");
  doc.text(notice.taxNumber || "N/A", left + 26, tY);

  doc.setFont("helvetica", "bold");
  doc.text("Provincial UIN:", left + 105, tY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 138);
  doc.text(notice.provincialUin || notice.pin, left + 128, tY);

  // Row 3: Commercial Address
  tY += 5.2;
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Address:", left + 4, tY);
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(notice.address || "", contentWidth - 32);
  doc.text(addrLines[0] ?? "", left + 26, tY);

  curY += taxpayerBoxH + 3.5;

  // 4. Formal Statutory Demand Text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_COLORS.textDark);
  const formalText = `Please take notice that for the financial year ${notice.financialYear || "2026-2027"}, an assessment of Professional Tax under Section 3 of the Punjab Finance Act, 1977 has been formally determined against you by the undersigned Assessing Authority under Rule 4 of the Punjab Professions and Trades Tax Rules, 1977 as itemized below:`;
  const formalLines = doc.splitTextToSize(formalText, contentWidth);
  doc.text(formalLines, left, curY);
  curY += formalLines.length * 4.0 + 2.5;

  // 5. Assessment Schedule Table (Accounting Grade)
  const tblHeaderH = 6.2;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, tblHeaderH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("SCHEDULE ENTRY & CLASS", left + 4, curY + 4.2);
  doc.text("STATUTORY CLASSIFICATION & SLAB", left + 55, curY + 4.2);
  doc.text("RATE BASIS", left + 125, curY + 4.2);
  doc.text("ASSESSED TAX (PKR)", left + contentWidth - 4, curY + 4.2, { align: "right" });

  curY += tblHeaderH;

  const dataRowH = 8.5;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, dataRowH, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(left, curY + dataRowH, left + contentWidth, curY + dataRowH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.0);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(notice.scheduleEntry || "Second Schedule", left + 4, curY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const classText = notice.tertiarySlab || notice.statutoryCategoryText || "Applicable Slab";
  const classLines = doc.splitTextToSize(classText, 65);
  doc.text(classLines[0] ?? classText, left + 55, curY + 5.5);

  doc.text(notice.rateBasis || "Per Annum", left + 125, curY + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.0);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PKR ${notice.taxAmount.toLocaleString()}`, left + contentWidth - 4, curY + 5.5, {
    align: "right"
  });

  curY += dataRowH;

  // Total Demand Highlight Banner
  const totalBoxH = 8.5;
  doc.setFillColor(220, 252, 231); // light mint #dcfce7
  doc.setDrawColor(22, 101, 52); // green #166534
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, totalBoxH, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TOTAL STATUTORY DEMAND PAYABLE:", left + 4, curY + 5.6);

  doc.setFontSize(11.0);
  doc.setTextColor(22, 101, 52);
  doc.text(`PKR ${notice.taxAmount.toLocaleString()} /-`, left + contentWidth - 4, curY + 5.8, {
    align: "right"
  });

  curY += totalBoxH + 2.5;

  // Amount in Words
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Amount in Words:", left, curY + 3.0);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(30, 58, 138);
  doc.text(notice.taxAmountWords || "", left + 30, curY + 3.0);

  curY += 7.0;

  // 6. Statutory Compliance & Legal Instructions
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(left, curY, left + contentWidth, curY);
  curY += 3.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("STATUTORY COMPLIANCE, PENALTY & APPEAL DIRECTIVES:", left, curY);

  curY += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_COLORS.textDark);

  const directives = [
    `1. Mode of Payment: Deposit the demand of PKR ${notice.taxAmount.toLocaleString()} on or before ${notice.dueDate || "31/08/2026"} at any authorized branch of National Bank of Pakistan (NBP), State Bank of Pakistan (SBP), or via Punjab ePay using official Challan Form P.F.T-2.`,
    "2. Right of Appeal: If you contest this assessment, an appeal under Section 7 of the Punjab Finance Act, 1977 read with Rule 13 may be preferred before the Director Excise & Taxation (Appellate Authority) within thirty (30) days of service of this notice, provided all undisputed tax has been deposited.",
    "3. Consequence of Default: Failure to pay by the statutory due date shall render you liable to default surcharge/penalty up to the full assessed amount under Section 3(5) of the Act, and coercive recovery as arrears of land revenue under Section 11."
  ];

  for (const d of directives) {
    const dLines = doc.splitTextToSize(d, contentWidth);
    doc.text(dLines, left, curY);
    curY += dLines.length * 3.3 + 1.2;
  }

  // 7. QR Code with Security Code Below & Assessing Authority Signature
  curY = Math.max(curY + 2.0, 204.0);

  // Left: Scannable Vector QR Code with Security Code Badge Directly Below
  const qrDataUrl = await generateQrDataUrl(notice.qrPayload);
  const QR_SIZE = 20.0;
  doc.addImage(qrDataUrl, "PNG", left + 2, curY, QR_SIZE, QR_SIZE);

  const secBoxY = curY + QR_SIZE + 1.0;
  const secBoxW = QR_SIZE;
  const secBoxH = 6.2;
  doc.setFillColor(224, 242, 254);
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.2);
  doc.roundedRect(left + 2, secBoxY, secBoxW, secBoxH, 0.6, 0.6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138);
  doc.text(notice.pin, left + 2 + secBoxW / 2, secBoxY + 4.3, { align: "center" });

  // Right: Assessing Authority Signature & Seal Block
  const sigX = left + contentWidth - 75;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineWidth(0.3);
  doc.line(sigX, curY + 16, sigX + 70, curY + 16);

  const authName = notice.assessingAuthorityName || "Assessing Authority";
  const authTitle =
    notice.assessingAuthorityTitle ||
    `Excise & Taxation Officer / Assessing Authority, ${district}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(authName, sigX + 35, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.0);
  doc.setTextColor(...PDF_COLORS.textMuted);
  const titleLines = doc.splitTextToSize(authTitle, 70);
  doc.text(titleLines[0] ?? authTitle, sigX + 35, curY + 23.8, { align: "center" });
  doc.text(`District ${district}, Government of the Punjab`, sigX + 35, curY + 27.2, {
    align: "center"
  });

  // 8. Perforated Rule 6 Service Receipt Counterfoil
  const counterfoilY = 246.0;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(left, counterfoilY, left + contentWidth, counterfoilY);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.0);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    "✂  TEAR-OFF SERVICE COUNTERFOIL (RULE 6 RECEIPT)  ✂",
    pageWidth / 2,
    counterfoilY - 1.5,
    { align: "center" }
  );

  let receiptY = counterfoilY + 4.5;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, receiptY, contentWidth, 5.0, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("SERVICE RECEIPT — TO BE COMPLETED UPON DELIVERY (RULE 6)", left + 4, receiptY + 3.6);

  receiptY += 7.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.0);
  doc.setTextColor(...PDF_COLORS.textDark);

  // Line 1: Demand No, Tax Amount, Due Date
  doc.text(`Demand Number: ${notice.demandNumber}`, left + 4, receiptY);
  doc.text(`Tax Payable: PKR ${notice.taxAmount.toLocaleString()}`, left + 62, receiptY);
  doc.text(`Due Date: ${notice.dueDate || "31/08/2026"}`, left + 125, receiptY);

  // Line 2: Legal Name, CNIC/NTN, PIN
  receiptY += 5.0;
  doc.text(`Assessee: ${notice.assesseeLegalName}`, left + 4, receiptY);
  doc.text(`CNIC/NTN: ${notice.taxNumber || "N/A"}`, left + 85, receiptY);
  doc.text(`PIN: ${notice.provincialUin || notice.pin}`, left + 138, receiptY);

  // Line 3: Served By, Date of Service
  receiptY += 5.2;
  doc.text(
    `Served By: _____________________________________ (Service Officer)`,
    left + 4,
    receiptY
  );
  doc.text("Date of Service: _____ / _____ / 2026", left + 115, receiptY);

  // Line 4: Signature Lines
  receiptY += 6.5;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineWidth(0.2);
  doc.line(left + 4, receiptY + 6.0, left + 55, receiptY + 6.0);
  doc.text("Signature of Serving Officer", left + 29.5, receiptY + 9.5, { align: "center" });

  doc.line(left + 120, receiptY + 6.0, left + contentWidth - 4, receiptY + 6.0);
  doc.text("Signature / Thumbprint of Assessee", left + 151, receiptY + 9.5, { align: "center" });

  // Footers
  renderDocumentFooters(doc, {
    officialSha256: notice.officialSha256,
    pin: notice.pin,
    docNumber: notice.noticeNumber,
    isProvisional: options?.isProvisional || !notice.isApproved
  });

  return doc;
}

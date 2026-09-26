/**
 * Form Statutory Receipt Voucher (Rule 10)
 * Official payment acknowledgment voucher under Rule 10 of Punjab Professions and
 * Trades Tax Rules, 1977. Provides statutory proof of treasury deposit.
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { StatutoryReceiptDocument } from "../../receipt-generator";
import type { DocumentGenerationOptions } from "../types";

export async function generateStatutoryReceiptPdf(
  receipt: StatutoryReceiptDocument,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const receiptNumber = receipt.receiptNumber || "REC-0000";
  const demandNumber = receipt.demandNumber || "N/A";
  const pin = receipt.pin || "N/A";
  const dateStr = receipt.dateOfReceipt || "2026-07-01";
  const timeStr = receipt.timeOfReceipt || "12:00:00";
  const amountPaidPkr = receipt.amountPaid ?? 0;
  const assesseeLegalName = receipt.assesseeLegalName || "Assessee";
  const assesseeTradeName = receipt.assesseeTradeName || "";
  const identifier = receipt.identifier || "N/A";
  const provincialUin = receipt.provincialUin || "";
  const statutoryCategory = receipt.statutoryCategory || "General Professions";
  const tertiarySlab = receipt.tertiarySlab || "Standard";
  const address = receipt.address || "Vehari";
  const paymentChannel = receipt.paymentChannel || "1Link OTC / e-Pay Punjab";
  const bankScrollRef = receipt.bankScrollRef || "SCR-0000";
  const amountPaidWords = receipt.amountPaidWords || "Rupees Only";
  const qrPayload = receipt.qrPayload || JSON.stringify({ receiptNumber, amountPaidPkr, pin });
  const receivingOfficerName = receipt.receivingOfficerName || "Muhammad Aslam";
  const receivingOfficerTitle = receipt.receivingOfficerTitle || "Tax Inspector / Scroll Officer";
  const officialSha256 = receipt.officialSha256 || "sha256-receipt-authenticated";

  const doc = createBasePdf({
    orientation: "portrait",
    title: `Payment Receipt - ${receiptNumber}`,
    subject:
      "Statutory Payment Receipt Voucher under Rule 10 of Punjab Professions and Trades Tax Rules, 1977",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "STATUTORY PAYMENT RECEIPT / VOUCHER",
    docSubtitle: "OFFICIAL ACKNOWLEDGEMENT OF PROFESSIONAL TAX DEPOSIT",
    statutoryRuleReference:
      "(Issued under Rule 10 of the Punjab Professions and Trades Tax Rules, 1977)",
    district: "Vehari",
    circle: "Circle-Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // Receipt Reference Box
  curY += 2;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 16, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Receipt Number:", left + 4, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(String(receiptNumber), left + 30, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Permanent Demand No:", left + 95, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(String(demandNumber), left + 138, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 4, curY + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${pin}`, left + 30, curY + 11);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Date & Time:", left + 95, curY + 11);
  doc.setFont("helvetica", "normal");
  doc.text(`${dateStr} ${timeStr}`, left + 120, curY + 11);

  // Success Deposit Banner
  curY += 20;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(
    `PAYMENT RECEIVED IN TREASURY • AMOUNT: PKR ${amountPaidPkr.toLocaleString()}`,
    pageWidth / 2,
    curY + 5.5,
    { align: "center" }
  );

  // Assessee & Account Box
  curY += 12;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PAYMENT PARTICULARS & TAXPAYER IDENTIFICATION:", left + 4, curY + 4);

  curY += 7;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.setFont("helvetica", "bold");
  doc.text("Payer Legal Name:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  const nameLine = assesseeTradeName
    ? `${assesseeLegalName} (${assesseeTradeName})`
    : assesseeLegalName;
  doc.text(String(nameLine), left + 34, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Identifier / CNIC:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(identifier, left + 34, curY + 4);

  if (provincialUin) {
    doc.setFont("helvetica", "bold");
    doc.text("Provincial UIN:", left + 105, curY + 4);
    doc.setFont("helvetica", "normal");
    doc.text(String(provincialUin), left + 130, curY + 4);
  }

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Category:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(`${statutoryCategory} (${tertiarySlab})`, left + 34, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Business Address:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(String(address), left + 34, curY + 4);

  // Financial Deposit Voucher Table
  curY += 10;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("DESCRIPTION / ACCOUNT HEAD", left + 4, curY + 4.8);
  doc.text("CHANNEL / SCROLL REF", left + 90, curY + 4.8);
  doc.text("AMOUNT DEPOSITED (PKR)", left + contentWidth - 4, curY + 4.8, { align: "right" });

  curY += 7;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, 10, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.line(left, curY + 10, left + contentWidth, curY + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("0113-Taxes on Professions, Trades & Callings", left + 4, curY + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text("Form PFT-2 Challan Treasury Deposit", left + 4, curY + 8.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`${paymentChannel} • ${bankScrollRef}`, left + 90, curY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PKR ${amountPaidPkr.toLocaleString()}`, left + contentWidth - 4, curY + 6.5, {
    align: "right"
  });

  // Amount in Words
  curY += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Amount in Words:", left, curY);
  doc.setFont("helvetica", "italic");
  doc.text(String(amountPaidWords), left + 28, curY);

  // Verification & Legal Certificate Text
  curY += 8;
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(left, curY, left + contentWidth, curY);

  curY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...PDF_COLORS.textDark);
  const legalCertification =
    "This statutory receipt constitutes conclusive prima facie evidence of payment of the specified professional tax under Rule 10 of the Punjab Professions and Trades Tax Rules, 1977. Credit has been posted to the Provincial Consolidated Fund Account No. 1 (Non-Food).";
  const certLines = doc.splitTextToSize(legalCertification, contentWidth);
  doc.text(certLines, left, curY);

  // QR Code & Receiving Officer Signature
  curY += 12;
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
  doc.text(receivingOfficerName, sigX + 30, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(receivingOfficerTitle, sigX + 30, curY + 24, { align: "center" });
  doc.text("Circle-Vehari", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256,
    pin,
    docNumber: receiptNumber,
    isProvisional: options?.isProvisional
  });

  return doc;
}

/**
 * Form P.F.T-5 Tax Clearance Certificate (Rule 11)
 * Official statutory certificate of zero-liability issued upon full satisfaction
 * of annual professional tax liabilities. Required for procurement, trade licenses, etc.
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { TaxClearanceCertificateModel } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

export async function generateTaxClearanceCertificatePdf(
  cert: TaxClearanceCertificateModel,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const certificateNumber = cert.certificateNumber || "PFT5-0000";
  const pin = cert.pin || "68000000";
  const issueDate = cert.issueDate || "2026-07-01";
  const expiryDate = cert.expiryDate || "2027-06-30";
  const identifierType = cert.identifierType || "CNIC";
  const identifierValue = cert.identifierValue || "N/A";
  const demandNo = cert.demandNo || "N/A";
  const assesseeLegalName = cert.assesseeLegalName || "Assessee";
  const assesseeTradeName = cert.assesseeTradeName || "";
  const address = cert.address || "Vehari";
  const categoryName = cert.categoryName || "General Professions";
  const scheduleEntry = cert.scheduleEntry || "Class 3";
  const annualTaxAssessed = cert.annualTaxAssessed ?? 4000;
  const totalTaxPaid = cert.totalTaxPaid ?? annualTaxAssessed;
  const isEligible = cert.isEligible ?? true;
  const issuingOfficerName = cert.issuingOfficerName || "Tariq Mahmood";
  const issuingOfficerTitle =
    cert.issuingOfficerTitle || "Excise & Taxation Officer / Assessing Authority";
  const officialSha256 = cert.officialSha256 || "sha256-clearance-cert";
  const qrPayload =
    cert.qrPayload || JSON.stringify({ certificateNumber, pin, demandNo, issueDate });

  const doc = createBasePdf({
    orientation: "portrait",
    title: `Clearance Certificate Form P.F.T-5 - ${certificateNumber}`,
    subject: "Official Professional Tax Clearance Certificate under Rule 11",
    isProvisional: options?.isProvisional || !isEligible
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const left = 14;
  const contentWidth = pageWidth - 28;

  // Double Ornamental Security Border
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setDrawColor(...PDF_COLORS.accentGold);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  let curY = renderDocumentHeader(doc, {
    docTitle: "FORM P.F.T - 5 : TAX CLEARANCE CERTIFICATE",
    docSubtitle: "OFFICIAL CERTIFICATE OF FULL SATISFACTION OF PROFESSIONAL TAX",
    statutoryRuleReference:
      "(Issued under Rule 11 of the Punjab Professions and Trades Tax Rules, 1977)",
    district: cert.district || "Vehari",
    circle: cert.circle || "Circle-Vehari",
    financialYear: cert.financialYear || "2026-2027",
    isProvisional: options?.isProvisional || !isEligible
  });

  // Certificate Validity Banner
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.3);
  doc.rect(left, curY, contentWidth, 14, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("CERTIFICATE NUMBER:", left + 4, curY + 5.5);
  doc.text(String(certificateNumber), left + 46, curY + 5.5);

  doc.text("SECURITY PIN:", left + 105, curY + 5.5);
  doc.text(`🔒 ${pin}`, left + 135, curY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`Issue Date: ${issueDate}`, left + 4, curY + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 83, 9);
  doc.text(`VALID THROUGH: ${expiryDate} (Close of FY)`, left + 105, curY + 11);

  // Certificate Preamble & Declaration Box
  curY += 20;
  doc.setFillColor(...PDF_COLORS.white);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.rect(left, curY, contentWidth, 68);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TO WHOM IT MAY CONCERN — STATUTORY ATTESTATION", pageWidth / 2, curY + 6.5, {
    align: "center"
  });

  curY += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);

  const declarationText = [
    `This is to certify that the person/business entity named herein, holding ${identifierType} No. ${identifierValue}, has duly filed required returns and FULLY PAID all assessed Professional Tax dues under Section 3 of the Punjab Finance Act, 1977 for the Financial Year ${cert.financialYear || "2026-2027"}.`,
    "",
    "There are NO outstanding arrears, surcharges, or default penalties against Permanent Demand Unit " +
      demandNo +
      " as of the date of issuance of this certificate."
  ];

  for (const para of declarationText) {
    if (para === "") {
      curY += 2;
    } else {
      const lines = doc.splitTextToSize(para, contentWidth - 10);
      doc.text(lines, left + 5, curY);
      curY += lines.length * 4.5;
    }
  }

  // Certified Particulars Grid
  curY += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Certified Assessee:", left + 5, curY);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${assesseeLegalName} ${assesseeTradeName ? `(${assesseeTradeName})` : ""}`,
    left + 42,
    curY
  );

  curY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Business Address:", left + 5, curY);
  doc.setFont("helvetica", "normal");
  doc.text(String(address), left + 42, curY);

  curY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Statutory Category:", left + 5, curY);
  doc.setFont("helvetica", "normal");
  doc.text(`${categoryName} (${scheduleEntry})`, left + 42, curY);

  // Financial Ledger Confirmation Table
  curY += 12;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("ANNUAL TAX ASSESSED", left + 4, curY + 4.8);
  doc.text("TOTAL TREASURY DEPOSITS", left + 75, curY + 4.8);
  doc.text("OUTSTANDING ARREARS", left + contentWidth - 4, curY + 4.8, { align: "right" });

  curY += 7;
  doc.setFillColor(240, 253, 244);
  doc.rect(left, curY, contentWidth, 8, "F");
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.line(left, curY + 8, left + contentWidth, curY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`PKR ${Number(annualTaxAssessed).toLocaleString()}`, left + 4, curY + 5.2);
  doc.text(`PKR ${Number(totalTaxPaid).toLocaleString()}`, left + 75, curY + 5.2);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PKR 0 (NIL — CLEARED)", left + contentWidth - 4, curY + 5.2, { align: "right" });

  // Statutory Uses Notice
  curY += 14;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.rect(left, curY, contentWidth, 12, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("MANDATORY USES & REGULATORY ACCEPTANCE:", left + 4, curY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(
    "This certificate is an official statutory clearance required for: (a) Government & Public Procurement Tenders; (b) Municipal & Departmental Trade License Renewals; (c) Annual Corporate Filings with SECP & Revenue Authorities.",
    left + 4,
    curY + 8.5,
    { maxWidth: contentWidth - 8 }
  );

  // QR Code & Issuing Officer Seal
  curY += 18;
  const qrDataUrl = await generateQrDataUrl(qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY, 24, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${pin}`, left + 16, curY + 28, { align: "center" });

  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 16, sigX + 60, curY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(issuingOfficerName, sigX + 30, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(issuingOfficerTitle, sigX + 30, curY + 24, { align: "center" });
  doc.text(cert.circle || "Circle / District Vehari", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256,
    pin,
    docNumber: certificateNumber,
    isProvisional: options?.isProvisional || !isEligible
  });

  return doc;
}

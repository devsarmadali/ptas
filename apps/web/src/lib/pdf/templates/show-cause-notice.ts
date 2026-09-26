/**
 * Show Cause Penalty Notice (Section 3(5) & Rule 12)
 * Renders an authoritative judicial Show Cause Notice for default in tax payment.
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters
} from "../base-document";
import type { ShowCausePenaltyNoticeModel } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

export async function generateShowCauseNoticePdf(
  notice: ShowCausePenaltyNoticeModel,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "portrait",
    title: `Show Cause Penalty Notice - ${notice.noticeNumber}`,
    subject: "Statutory Show Cause Notice under Section 3(5) of Punjab Finance Act, 1977",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "SHOW CAUSE NOTICE (PENALTY INQUIRY)",
    docSubtitle: "NOTICE TO SHOW CAUSE AGAINST IMPOSITION OF DEFAULT PENALTY",
    statutoryRuleReference:
      "(Issued under Section 3(5) of the Punjab Finance Act, 1977 read with Rule 12)",
    district: "Vehari",
    circle: "Circle-Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // Reference Grid
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 14, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Notice Number:", left + 4, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(notice.noticeNumber, left + 30, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Permanent Demand No:", left + 95, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(notice.demandNumber, left + 138, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 4, curY + 10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${notice.pin}`, left + 30, curY + 10);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Notice Date:", left + 95, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(notice.noticeDate || "2026-08-01", left + 138, curY + 10);

  // Hearing Schedule Banner (Highlighted)
  curY += 18;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(...PDF_COLORS.danger);
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.danger);
  doc.text(
    `DATE OF STATUTORY HEARING: ${notice.hearingDate || "2026-08-10"} AT 10:00 AM`,
    pageWidth / 2,
    curY + 5.5,
    { align: "center" }
  );

  // Assessee Box
  curY += 12;
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("TO (DEFAULTING TAXPAYER PARTICULARS):", left + 4, curY + 4);

  curY += 6.5;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.setFont("helvetica", "bold");
  doc.text("Assessee Name:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  const nameStr = notice.assesseeTradeName
    ? `${notice.assesseeLegalName} (${notice.assesseeTradeName})`
    : notice.assesseeLegalName;
  doc.text(nameStr, left + 32, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Identifier (CNIC/NTN):", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(notice.identifier, left + 38, curY + 4);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.text("Business Address:", left + 4, curY + 4);
  doc.setFont("helvetica", "normal");
  doc.text(notice.address, left + 32, curY + 4);

  // Legal Recital
  curY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);

  const recitalText = [
    `WHEREAS an official Notice of Demand (Form P.F.T-1) was duly served upon you requiring payment of assessed Professional Tax of PKR ${notice.originalTaxAmount.toLocaleString()} for the Financial Year 2026-2027;`,
    "",
    `AND WHEREAS the prescribed due date has expired and you have failed, neglected, or refused to deposit the assessed tax, resulting in default of ${notice.daysOverdue || 10} days;`,
    "",
    `NOW THEREFORE, under Section 3(5) of the Punjab Finance Act, 1977, YOU ARE HEREBY CALLED UPON TO SHOW CAUSE in person or through an authorized representative before the undersigned Assessing Authority on ${notice.hearingDate || "2026-08-10"} at 10:00 AM as to why a default penalty up to PKR ${notice.maximumPenaltyExposable.toLocaleString()} (100% statutory ceiling) should not be imposed upon you and recovered as arrears of land revenue.`
  ];

  for (const paragraph of recitalText) {
    if (paragraph === "") {
      curY += 2.5;
    } else {
      const lines = doc.splitTextToSize(paragraph, contentWidth);
      doc.text(lines, left, curY);
      curY += lines.length * 4.2;
    }
  }

  // Summary Table of Default
  curY += 4;
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(left, curY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.white);

  doc.text("ORIGINAL DEMAND", left + 6, curY + 4.8);
  doc.text("DAYS OVERDUE", left + 65, curY + 4.8);
  doc.text("MAX PENALTY EXPOSURE", left + contentWidth - 6, curY + 4.8, { align: "right" });

  curY += 7;
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(left, curY, contentWidth, 8, "F");
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.line(left, curY + 8, left + contentWidth, curY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(`PKR ${notice.originalTaxAmount.toLocaleString()}`, left + 6, curY + 5.2);

  doc.setFont("helvetica", "normal");
  doc.text(`${notice.daysOverdue || 10} Days`, left + 65, curY + 5.2);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.danger);
  doc.text(
    `PKR ${notice.maximumPenaltyExposable.toLocaleString()}`,
    left + contentWidth - 6,
    curY + 5.2,
    { align: "right" }
  );

  // Warning Note
  curY += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.danger);
  doc.text("NOTICE:", left, curY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(
    "If you fail to appear or produce evidence of payment on the stipulated date, ex-parte penalty proceedings will be finalized and recovery warrant under Section 11 issued without further notice.",
    left + 15,
    curY,
    { maxWidth: contentWidth - 15 }
  );

  // QR Code & Assessing Authority Signature
  curY += 16;
  const qrDataUrl = await generateQrDataUrl(notice.qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${notice.pin}`, left + 15, curY + 26, { align: "center" });

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
  doc.text("Circle / District Vehari", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256: notice.officialSha256,
    pin: notice.pin,
    docNumber: notice.noticeNumber,
    isProvisional: options?.isProvisional
  });

  return doc;
}

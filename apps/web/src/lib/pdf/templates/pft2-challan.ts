/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 * Renders an authentic 3-copy side-by-side challan on a single A4 Landscape sheet:
 * 1. Taxpayer Copy (برائے ٹیکس گزار)
 * 2. Bank / Treasury Copy (برائے بینک / خزانہ)
 * 3. Excise & Taxation Copy (برائے دفتر ایکسائز)
 *
 * Implements Section 6 of the Consolidated Implementation Specification:
 * - A4 Landscape (297mm x 210mm)
 * - Complete challan fitted onto 1 page without viewport clipping
 * - Vector sharp typography, clean boxes, embedded QR code
 * - Zero reliance on DOM / screen / html2canvas
 */

import { jsPDF } from "jspdf";
import { createBasePdf, generateQrDataUrl, PDF_COLORS } from "../base-document";
import type { FormPFT2Model } from "../../statutory-forms";
import { numberToWordsPkr } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

const COPY_TITLES = [
  { en: "TAXPAYER'S COPY", ur: "برائے ٹیکس گزار" },
  { en: "BANK / TREASURY COPY", ur: "برائے بینک / خزانہ" },
  { en: "EXCISE OFFICE COPY", ur: "برائے دفتر ایکسائز" }
];

export async function generatePft2ChallanPdf(
  challan: FormPFT2Model,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const doc = createBasePdf({
    orientation: "landscape",
    title: `Challan Form P.F.T-2 - ${challan.challanNumber}`,
    subject: "Statutory Professional Tax Payment Instrument (Rule 9)",
    isProvisional: options?.isProvisional
  });

  const pageHeight = 210;
  const leftMargin = 6;
  const topMargin = 6;
  const copyWidth = 91; // 3 copies = 3 * 91 = 273mm. Gaps = 2 * 5.5 = 11mm. 6 + 273 + 11 + 7 = 297mm.
  const gap = 5.5;
  const copyHeight = pageHeight - 12; // 198mm

  // Pre-generate QR Code as high-res PNG data URL
  const qrDataUrl = await generateQrDataUrl(challan.qrPayload);

  // Render 3 Counterfoil Columns Side-by-Side
  for (let copyIdx = 0; copyIdx < 3; copyIdx++) {
    const colX = leftMargin + copyIdx * (copyWidth + gap);
    const copyMeta = COPY_TITLES[copyIdx]!;
    const copyData = challan.copies[copyIdx] ?? challan.copies[0];

    // Column Outer Border
    doc.setDrawColor(...PDF_COLORS.borderDark);
    doc.setLineWidth(0.35);
    doc.rect(colX, topMargin, copyWidth, copyHeight);

    // 1. Column Top Banner (Dark Green)
    doc.setFillColor(...PDF_COLORS.primary);
    doc.rect(colX, topMargin, copyWidth, 14, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.white);
    doc.text("GOVERNMENT OF THE PUNJAB", colX + copyWidth / 2, topMargin + 4.5, {
      align: "center"
    });

    doc.setFontSize(7);
    doc.text("EXCISE & TAXATION DEPARTMENT", colX + copyWidth / 2, topMargin + 8.5, {
      align: "center"
    });

    doc.setFontSize(6.5);
    doc.text("CHALLAN FORM P.F.T - 2 (RULE 9)", colX + copyWidth / 2, topMargin + 12, {
      align: "center"
    });

    // 2. Copy Title Strip
    doc.setFillColor(...PDF_COLORS.bgHeader);
    doc.rect(colX, topMargin + 14, copyWidth, 5.5, "F");
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.2);
    doc.line(colX, topMargin + 19.5, colX + copyWidth, topMargin + 19.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`${copyMeta.en} • ${copyMeta.ur}`, colX + copyWidth / 2, topMargin + 18, {
      align: "center"
    });

    // 3. Head of Account & Jurisdiction Subheader
    let curY = topMargin + 20;
    doc.setFillColor(...PDF_COLORS.bgLight);
    doc.rect(colX, curY, copyWidth, 7, "F");
    doc.line(colX, curY + 7, colX + copyWidth, curY + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...PDF_COLORS.textDark);
    doc.text(
      "Head of Account: 0113-Taxes on Professions, Trades & Callings",
      colX + copyWidth / 2,
      curY + 3.2,
      { align: "center" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(...PDF_COLORS.textMuted);
    const distCircle = `District: ${copyData?.district || "Vehari"} | Circle: Circle-Vehari | FY: ${copyData?.taxYear || "2026-2027"}`;
    doc.text(distCircle, colX + copyWidth / 2, curY + 5.8, { align: "center" });

    // 4. Metadata Grid: Challan No, Demand No, Security PIN, Issue & Due Dates
    curY += 8;
    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.2);
    doc.rect(colX + 2, curY, copyWidth - 4, 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...PDF_COLORS.textDark);

    doc.text("Challan No:", colX + 3.5, curY + 3.5);
    doc.setFont("helvetica", "normal");
    doc.text(challan.challanNumber, colX + 22, curY + 3.5);

    doc.setFont("helvetica", "bold");
    doc.text("Demand No:", colX + 48, curY + 3.5);
    doc.setFont("helvetica", "normal");
    doc.text(copyData?.assessmentInfo.demandNo || "0001", colX + 66, curY + 3.5);

    doc.setFont("helvetica", "bold");
    doc.text("Security PIN:", colX + 3.5, curY + 7.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`🔒 ${challan.pin || "68000000"}`, colX + 22, curY + 7.2);

    doc.setTextColor(...PDF_COLORS.textDark);
    doc.setFont("helvetica", "bold");
    doc.text("Issued On:", colX + 48, curY + 7.2);
    doc.setFont("helvetica", "normal");
    doc.text("2026-08-01", colX + 66, curY + 7.2);

    // Due Date Box (Highlighted)
    doc.setFillColor(254, 243, 199); // Soft amber
    doc.setDrawColor(217, 119, 6);
    doc.rect(colX + 3.5, curY + 8.5, copyWidth - 7, 3.8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(180, 83, 9);
    doc.text(
      `PAYABLE ON OR BEFORE: ${copyData?.dueDate || "31/08/2026"}`,
      colX + copyWidth / 2,
      curY + 11.2,
      { align: "center" }
    );

    // 5. Assessee Particulars Box
    curY += 15;
    doc.setFillColor(...PDF_COLORS.bgHeader);
    doc.rect(colX + 2, curY, copyWidth - 4, 3.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text("PARTICULARS OF ASSESSEE / TAXPAYER", colX + 4, curY + 2.8);

    curY += 4.5;
    doc.setFontSize(5.4);
    doc.setTextColor(...PDF_COLORS.textDark);

    doc.setFont("helvetica", "bold");
    doc.text("Legal Name:", colX + 3.5, curY + 2.5);
    doc.setFont("helvetica", "normal");
    const nameLine =
      doc.splitTextToSize(copyData?.taxpayerInfo.legalName || "", copyWidth - 28)[0] || "";
    doc.text(nameLine, colX + 24, curY + 2.5);

    if (copyData?.taxpayerInfo.tradeName) {
      curY += 3.5;
      doc.setFont("helvetica", "bold");
      doc.text("Trade Name:", colX + 3.5, curY + 2.5);
      doc.setFont("helvetica", "normal");
      const tradeLine =
        doc.splitTextToSize(copyData.taxpayerInfo.tradeName, copyWidth - 28)[0] || "";
      doc.text(tradeLine, colX + 24, curY + 2.5);
    }

    curY += 3.5;
    doc.setFont("helvetica", "bold");
    doc.text("CNIC / NTN:", colX + 3.5, curY + 2.5);
    doc.setFont("helvetica", "normal");
    doc.text(copyData?.taxpayerInfo.taxNo || "N/A", colX + 24, curY + 2.5);

    curY += 3.5;
    doc.setFont("helvetica", "bold");
    doc.text("Category:", colX + 3.5, curY + 2.5);
    doc.setFont("helvetica", "normal");
    const catText = `${copyData?.taxpayerInfo.classification || ""} (${copyData?.taxpayerInfo.subclassificationCode || ""})`;
    const catLine = doc.splitTextToSize(catText, copyWidth - 28)[0] || "";
    doc.text(catLine, colX + 24, curY + 2.5);

    curY += 3.5;
    doc.setFont("helvetica", "bold");
    doc.text("Address:", colX + 3.5, curY + 2.5);
    doc.setFont("helvetica", "normal");
    const addrLine =
      doc.splitTextToSize(copyData?.taxpayerInfo.address || "", copyWidth - 28)[0] || "";
    doc.text(addrLine, colX + 24, curY + 2.5);

    // 6. Financial Breakdown Table
    curY += 5.5;
    doc.setDrawColor(...PDF_COLORS.primary);
    doc.setLineWidth(0.25);
    doc.line(colX + 2, curY, colX + copyWidth - 2, curY);

    const rowH = 4.2;
    const tableY = curY + 1;

    // Table Header
    doc.setFillColor(...PDF_COLORS.primary);
    doc.rect(colX + 2, tableY, copyWidth - 4, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...PDF_COLORS.white);
    doc.text("HEAD / DESCRIPTION", colX + 4, tableY + 3);
    doc.text("AMOUNT (PKR)", colX + copyWidth - 4, tableY + 3, { align: "right" });

    // Rows
    const currentTax = copyData?.taxPayable.currentTax ?? 0;
    const arrears = copyData?.taxPayable.arrears ?? 0;
    const penalty = copyData?.taxPayable.penalty ?? 0;
    const totalPayable = copyData?.taxPayable.totalPayable ?? challan.displayAmount;

    let rowY = tableY + rowH;
    const financialRows = [
      { label: "Annual Professional Tax (Current FY)", val: currentTax },
      { label: "Arrears of Previous Financial Years", val: arrears },
      { label: "Surcharge / Default Penalty", val: penalty }
    ];

    financialRows.forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(...PDF_COLORS.bgLight);
        doc.rect(colX + 2, rowY, copyWidth - 4, rowH, "F");
      }
      doc.setDrawColor(...PDF_COLORS.borderLight);
      doc.setLineWidth(0.15);
      doc.line(colX + 2, rowY + rowH, colX + copyWidth - 2, rowY + rowH);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      doc.setTextColor(...PDF_COLORS.textDark);
      doc.text(r.label, colX + 4, rowY + 3);
      doc.text(r.val.toLocaleString(), colX + copyWidth - 4, rowY + 3, { align: "right" });
      rowY += rowH;
    });

    // Net Payable Box (Highlighted)
    doc.setFillColor(240, 253, 244); // light mint green
    doc.setDrawColor(...PDF_COLORS.primary);
    doc.setLineWidth(0.3);
    doc.rect(colX + 2, rowY, copyWidth - 4, 5.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text("NET AMOUNT PAYABLE:", colX + 4, rowY + 3.8);
    doc.setFontSize(7);
    doc.text(`PKR ${totalPayable.toLocaleString()}`, colX + copyWidth - 4, rowY + 3.8, {
      align: "right"
    });

    // Amount in Words
    rowY += 6.5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5);
    doc.setTextColor(...PDF_COLORS.textDark);
    const words = numberToWordsPkr(totalPayable);
    const wordsLine = doc.splitTextToSize(`Amount in words: ${words}`, copyWidth - 4)[0] || "";
    doc.text(wordsLine, colX + 3, rowY + 2);

    // Partial note if partial scope
    if (challan.isPartial && challan.remainingBalance && challan.remainingBalance > 0) {
      rowY += 3.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.8);
      doc.setTextColor(180, 83, 9);
      doc.text(
        `* PARTIAL DEPOSIT. Remaining ledger balance: PKR ${challan.remainingBalance.toLocaleString()}`,
        colX + 3,
        rowY + 2
      );
    }

    // 7. QR Code and Bank Signature Blocks
    const bottomY = topMargin + copyHeight - 34;

    // QR Code Image
    doc.addImage(qrDataUrl, "PNG", colX + 3, bottomY, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.5);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`🔒 ${challan.pin || ""}`, colX + 13, bottomY + 22.5, { align: "center" });

    // Bank Cashier & Officer Blocks
    const bankX = colX + 26;
    const bankW = copyWidth - 29;

    doc.setDrawColor(...PDF_COLORS.borderLight);
    doc.setLineWidth(0.2);
    doc.rect(bankX, bottomY, bankW, 20);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text("FOR USE OF RECEIVING BANK / TREASURY ONLY", bankX + bankW / 2, bottomY + 3, {
      align: "center"
    });

    doc.line(bankX, bottomY + 4, bankX + bankW, bottomY + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.6);
    doc.text("Bank Scroll Ref: _______________________", bankX + 2, bottomY + 7.5);
    doc.text("Deposit Date:   ____ / ____ / 2026", bankX + 2, bottomY + 11);

    // Signature lines
    doc.line(bankX + 3, bottomY + 17, bankX + 23, bottomY + 17);
    doc.text("Cashier", bankX + 10, bottomY + 19, { align: "center" });

    doc.line(bankX + 32, bottomY + 17, bankX + bankW - 3, bottomY + 17);
    doc.text("Manager / Stamp", bankX + bankW - 14, bottomY + 19, { align: "center" });

    // 8. Copy Footer Disclaimer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(
      "Payable at any authorized NBP / SBP branch or via 1Link ePay.",
      colX + copyWidth / 2,
      topMargin + copyHeight - 6,
      { align: "center" }
    );

    const hashSlice = challan.officialSha256 ? challan.officialSha256.slice(0, 16) : "AUTHENTIC";
    doc.text(
      `Official SHA-256: ${hashSlice} • PTAS Punjab`,
      colX + copyWidth / 2,
      topMargin + copyHeight - 2.5,
      { align: "center" }
    );

    // Perforated Cut Line between copies
    if (copyIdx < 2) {
      const cutX = colX + copyWidth + gap / 2;
      doc.setDrawColor(...PDF_COLORS.borderDark);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cutX, topMargin, cutX, topMargin + copyHeight);
      doc.setLineDashPattern([], 0); // reset line dash

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(...PDF_COLORS.textMuted);
      doc.text("✂ CUT", cutX, topMargin + copyHeight / 2, { angle: 90 });
    }
  }

  return doc;
}

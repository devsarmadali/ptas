/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 *
 * Professional Tax Administration System (PTAS) - Government of the Punjab
 *
 * High-readability, balanced, authoritative 3-copy counterfoil layout (A4 Landscape).
 * Completely eliminates bottom white space waste while dramatically improving
 * font sizes, contrast, visual hierarchy, and teller counterfoil usability.
 *
 * Section order per copy card:
 *   1. Header Row & QR  — Crisp vector QR (left, no extraneous labels) +
 *                         Government & Department authority headers (right)
 *   2. Metadata Grid    — Notice No | PIN badge | Demand No | Provincial UIN |
 *                         Circle / District | Tax Year / Due Date
 *   3. Taxpayer Info    — Class (with PKR slab rate) | Legal Name | Trade | Address
 *   4. Tax Detail Table — Current Tax | Arrears | Penalty | Total Payable |
 *                         [Remaining Balance] + Dedicated Amount-in-Words callout
 *   5. Bank Counterfoil — Official "For Bank's Use Only" receipting section with
 *                         branch details, scroll no, amount confirmed, and a
 *                         generous 26mm stamp & teller signature box.
 *   6. Perforated Cuts  — Scissor cut guides between counterfoil copies.
 */

import { jsPDF } from "jspdf";
import { createBasePdf, generateQrDataUrl } from "../base-document";
import type { FormPFT2Model } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  primary: [13, 56, 34] as [number, number, number], // #0d3822
  primaryLight: [22, 101, 52] as [number, number, number], // #166534
  primaryBg: [220, 252, 231] as [number, number, number], // #dcfce7
  primaryMint: [240, 253, 244] as [number, number, number], // #f0fdf4

  bgMeta: [248, 250, 252] as [number, number, number], // #f8fafc
  bgBank: [250, 250, 249] as [number, number, number], // #fafaf9
  borderLight: [226, 232, 240] as [number, number, number], // #e2e8f0
  borderMed: [203, 213, 225] as [number, number, number], // #cbd5e1
  borderDark: [148, 163, 184] as [number, number, number], // #94a3b8
  textDark: [15, 23, 42] as [number, number, number], // #0f172a
  textMid: [71, 85, 105] as [number, number, number], // #475569
  textMuted: [100, 116, 139] as [number, number, number], // #64748b
  white: [255, 255, 255] as [number, number, number],

  blueDeep: [30, 58, 138] as [number, number, number], // #1e3a8a
  blueBadgeBg: [224, 242, 254] as [number, number, number], // #e0f2fe
  blueBadgeBorder: [186, 230, 253] as [number, number, number], // #bae6fd
  blueBadgeText: [3, 105, 161] as [number, number, number], // #0369a1
  blueRef: [29, 78, 216] as [number, number, number], // #1d4ed8

  amber: [180, 83, 9] as [number, number, number], // #b45309
  amberDark: [120, 53, 15] as [number, number, number], // #78350f
  amberBg: [254, 243, 199] as [number, number, number], // #fef3c7
  amberText: [146, 64, 14] as [number, number, number], // #92400e

  red: [185, 28, 28] as [number, number, number] // #b91c1c
} as const;

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_H = 210;
const MARGIN_TOP = 4;
const MARGIN_LEFT = 5.5;
const COPY_W = 92;
const GAP = 5.0; // 3 * 92 + 2 * 5.0 = 286mm; 297 - 286 = 11mm (5.5mm margins each side)
const COPY_H = PAGE_H - 8; // 202 mm usable height (from Y=4 to Y=206)

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

  const qrDataUrl = await generateQrDataUrl(challan.qrPayload);

  for (let copyIdx = 0; copyIdx < 3; copyIdx++) {
    const colX = MARGIN_LEFT + copyIdx * (COPY_W + GAP);
    const copy = challan.copies[copyIdx] ?? challan.copies[0];

    // Outer card border
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.roundedRect(colX, MARGIN_TOP, COPY_W, COPY_H, 1.2, 1.2, "S");

    let curY = MARGIN_TOP;
    const innerX = colX + 2.0;
    const innerW = COPY_W - 4.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — TOP HEADER ROW & QR CODE
    // ══════════════════════════════════════════════════════════════════════════
    const HEADER_H = 27;
    const QR_SIZE = 22;
    const qrX = innerX + 0.5;
    const qrY = curY + 2.0;

    // Render clean QR image without redundant labels
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR_SIZE, QR_SIZE);

    // Right region: Centered authority header
    const deptX = innerX + QR_SIZE + 2.5;
    const deptW = innerW - QR_SIZE - 3.5;
    const deptCX = deptX + deptW / 2;

    // 1. Copy title badge (pill)
    const badgeText = copy.copyTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const badgeW = Math.min(deptW - 1, doc.getTextWidth(badgeText) + 7);
    const badgeX = deptCX - badgeW / 2;
    doc.setFillColor(...C.primaryBg);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, curY + 1.2, badgeW, 4.6, 0.8, 0.8, "FD");
    doc.setTextColor(...C.primaryLight);
    doc.text(badgeText, deptCX, curY + 4.5, { align: "center" });

    // 2. GOVERNMENT OF THE PUNJAB
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.primary);
    doc.text("GOVERNMENT OF THE PUNJAB", deptCX, curY + 9.5, { align: "center" });

    // 3. EXCISE & TAXATION DEPARTMENT
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDark);
    doc.text("EXCISE & TAXATION DEPARTMENT", deptCX, curY + 13.0, { align: "center" });

    // 4. PUNJAB PROFESSIONS & TRADES TAX
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...C.textDark);
    doc.text("PUNJAB PROFESSIONS & TRADES TAX", deptCX, curY + 16.2, { align: "center" });

    // 5. PAYMENT CHALLAN • Rule 9
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textMuted);
    doc.text("PAYMENT CHALLAN \u2022 Rule 9", deptCX, curY + 19.0, { align: "center" });

    // 6. Head of Account (Amber)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...C.amber);
    const headText = `Head: ${copy.headOfAccount}`;
    const headLines = doc.splitTextToSize(headText, deptW - 1);
    doc.text(headLines[0] ?? headText, deptCX, curY + 22.2, { align: "center" });

    // 7. Urdu copy title
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...C.textMuted);
    doc.text(copy.copyTitleUrdu, deptCX, curY + 25.4, { align: "center" });

    curY += HEADER_H;

    // Header divider line (green)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.45);
    doc.line(innerX, curY, innerX + innerW, curY);
    curY += 1.8;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — METADATA GRID
    // ══════════════════════════════════════════════════════════════════════════
    const hasUin = Boolean(copy.taxpayerInfo.provincialUin);
    const META_ROW_H = 5.0;
    const metaRows = hasUin ? 5 : 4;
    const metaGridH = metaRows * META_ROW_H + 2.0;

    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX, curY, innerW, metaGridH, 0.8, 0.8, "FD");

    let mY = curY + 1.2;
    const metaL = innerX + 2.0;
    const metaMid = innerX + innerW / 2;
    const metaR = innerX + innerW - 2.0;
    const LABEL_FS = 6.2;
    const VALUE_FS = 6.5;

    // Row A — Notice No (full width)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("Notice No:", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.blueDeep);
    const noticeText = copy.noticeNumber ?? challan.noticeNumber;
    const maxNoticeW = innerW - 22;
    const noticeDisplay = doc.splitTextToSize(noticeText, maxNoticeW)[0] ?? noticeText;
    doc.text(noticeDisplay, metaL + 20, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Divider
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    // Row B — PIN badge (left) | Demand No (right)
    const pinText = `PIN: ${copy.pin ?? challan.pin}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.0);
    const pinBadgeW = doc.getTextWidth(pinText) + 5;
    doc.setFillColor(...C.blueBadgeBg);
    doc.setDrawColor(...C.blueBadgeBorder);
    doc.setLineWidth(0.18);
    doc.roundedRect(metaL, mY + 0.6, pinBadgeW, 4.0, 0.5, 0.5, "FD");
    doc.setTextColor(...C.blueBadgeText);
    doc.text(pinText, metaL + pinBadgeW / 2, mY + 3.4, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("Demand No:", metaMid + 1, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.primary);
    doc.text(copy.assessmentInfo.demandNo, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row C — Provincial UIN (if present)
    if (hasUin) {
      doc.setDrawColor(...C.borderLight);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(metaL, mY, metaR, mY);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(LABEL_FS);
      doc.setTextColor(...C.textDark);
      doc.text("PIN (Provincial UIN):", metaL, mY + META_ROW_H * 0.72);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(VALUE_FS);
      doc.setTextColor(...C.blueRef);
      doc.text(copy.taxpayerInfo.provincialUin!, metaR, mY + META_ROW_H * 0.72, { align: "right" });
      mY += META_ROW_H;
    }

    // Row D — Circle | District
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("Circle:", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.assessmentInfo.circleName, metaL + 13, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.text("District:", metaMid + 1, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.district, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row E — Tax Year | Due Date
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("Tax Year:", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.taxYear, metaL + 17, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.red);
    doc.text("Due Date:", metaMid + 1, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.dueDate, metaR, mY + META_ROW_H * 0.72, { align: "right" });

    curY += metaGridH + 2.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAXPAYER DETAILS
    // ══════════════════════════════════════════════════════════════════════════
    const TP_FS = 6.6;
    const TP_LINE_H = 4.8;
    const labelColW = 16.0;

    doc.setFontSize(TP_FS);
    doc.setTextColor(...C.textDark);

    // Class: classification (PKR slab)
    doc.setFont("helvetica", "bold");
    doc.text("Class:", innerX + 1.5, curY + TP_LINE_H * 0.72);
    doc.setFont("helvetica", "normal");
    const classDisplay =
      doc.splitTextToSize(copy.taxpayerInfo.classification, innerW - labelColW - 22)[0] ?? "";
    doc.text(classDisplay, innerX + 1.5 + labelColW, curY + TP_LINE_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.primaryLight);
    doc.text(
      `(PKR ${copy.taxpayerInfo.slabRatePkr.toLocaleString()})`,
      innerX + innerW - 1.5,
      curY + TP_LINE_H * 0.72,
      { align: "right" }
    );
    doc.setTextColor(...C.textDark);
    curY += TP_LINE_H;

    // Name:
    doc.setFont("helvetica", "bold");
    doc.text("Name:", innerX + 1.5, curY + TP_LINE_H * 0.72);
    doc.setFont("helvetica", "bold");
    const nameDisplay =
      doc.splitTextToSize(copy.taxpayerInfo.legalName, innerW - labelColW - 2)[0] ?? "";
    doc.text(nameDisplay, innerX + 1.5 + labelColW, curY + TP_LINE_H * 0.72);
    curY += TP_LINE_H;

    // Trade: (optional)
    if (copy.taxpayerInfo.tradeName) {
      doc.setFont("helvetica", "bold");
      doc.text("Trade:", innerX + 1.5, curY + TP_LINE_H * 0.72);
      doc.setFont("helvetica", "normal");
      const tradeDisplay =
        doc.splitTextToSize(copy.taxpayerInfo.tradeName, innerW - labelColW - 2)[0] ?? "";
      doc.text(tradeDisplay, innerX + 1.5 + labelColW, curY + TP_LINE_H * 0.72);
      curY += TP_LINE_H;
    }

    // Address:
    doc.setFont("helvetica", "bold");
    doc.text("Address:", innerX + 1.5, curY + TP_LINE_H * 0.72);
    doc.setFont("helvetica", "normal");
    const addrDisplay =
      doc.splitTextToSize(copy.taxpayerInfo.address, innerW - labelColW - 2)[0] ?? "";
    doc.text(addrDisplay, innerX + 1.5 + labelColW, curY + TP_LINE_H * 0.72);
    curY += TP_LINE_H + 2.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — DETAIL OF TAX PAYABLE TABLE
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.primary);
    doc.text("Detail of Tax Payable:", innerX + 1.5, curY + 2.0);
    curY += 3.8;

    const tblL = innerX + 0.5;
    const tblR = innerX + innerW - 0.5;
    const tblW = innerW - 1.0;
    const ROW_H = 5.2;
    const TBL_FS = 6.8;

    const tableData: {
      label: string;
      value: string;
      bold?: boolean;
      green?: boolean;
      amber?: boolean;
    }[] = [
      { label: "Current Tax", value: `Rs. ${copy.taxPayable.currentTax.toLocaleString()}` },
      { label: "Arrears", value: `Rs. ${copy.taxPayable.arrears.toLocaleString()}` },
      { label: "Penalty", value: `Rs. ${copy.taxPayable.penalty.toLocaleString()}` },
      {
        label: "Total Payable",
        value: `Rs. ${copy.taxPayable.totalPayable.toLocaleString()}`,
        bold: true,
        green: true
      }
    ];

    if (copy.isPartial && (copy.remainingBalance ?? 0) > 0) {
      tableData.push({
        label: "Remaining Balance",
        value: `Rs. ${(copy.remainingBalance ?? 0).toLocaleString()}`,
        bold: true,
        amber: true
      });
    }

    const tableH = tableData.length * ROW_H;
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.rect(tblL, curY, tblW, tableH);

    tableData.forEach((row, idx) => {
      const rowY = curY + idx * ROW_H;
      if (row.green) {
        doc.setFillColor(...C.primaryMint);
        doc.rect(tblL, rowY, tblW, ROW_H, "F");
      } else if (row.amber) {
        doc.setFillColor(...C.amberBg);
        doc.rect(tblL, rowY, tblW, ROW_H, "F");
      } else if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(tblL, rowY, tblW, ROW_H, "F");
      }
      if (idx < tableData.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.15);
        doc.line(tblL, rowY + ROW_H, tblR, rowY + ROW_H);
      }
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.green ? 7.4 : TBL_FS);
      doc.setTextColor(...(row.green ? C.primaryLight : row.amber ? C.amberText : C.textDark));
      doc.text(row.label, tblL + 2.0, rowY + ROW_H * 0.72);
      doc.text(row.value, tblR - 2.0, rowY + ROW_H * 0.72, { align: "right" });
    });

    curY += tableH + 1.5;

    // Amount in words callout box
    const WORDS_H = 7.5;
    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.18);
    doc.roundedRect(tblL, curY, tblW, WORDS_H, 0.6, 0.6, "FD");

    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textMid);
    const wordsText = `(in words) ${copy.taxPayable.totalPayableWords}`;
    const wordsLines = doc.splitTextToSize(wordsText, tblW - 3);
    const lineCount = Math.min(wordsLines.length, 2);
    doc.text(wordsLines.slice(0, lineCount), tblL + 2.0, curY + (lineCount > 1 ? 2.8 : 4.8));
    curY += WORDS_H + 2.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — FOR BANK'S USE ONLY (EXPANDED OFFICIAL COUNTERFOIL)
    // Seamlessly utilizes remaining height down to bottom of card
    // ══════════════════════════════════════════════════════════════════════════
    const bankY = curY;
    const bankH = MARGIN_TOP + COPY_H - bankY - 1.0; // Fill precisely to card bottom

    doc.setFillColor(...C.bgBank);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.25);
    doc.roundedRect(innerX, bankY, innerW, bankH, 1.0, 1.0, "FD");

    // Top primary accent bar
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.6);
    doc.line(innerX, bankY, innerX + innerW, bankY);

    // Header bar (amber-tinted)
    const headerBarH = 5.2;
    doc.setFillColor(...C.amberBg);
    doc.rect(innerX, bankY + 0.3, innerW, headerBarH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.0);
    doc.setTextColor(...C.amberDark);
    doc.text("FOR BANK'S USE ONLY \u2022 Rule 9 Statutory Counterfoil", innerX + 2.5, bankY + 3.8);

    // Bank operational fields
    let bY = bankY + headerBarH + 2.5;
    const bankFS = 6.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bankFS);
    doc.setTextColor(...C.textDark);

    // Row 1: Bank & Branch
    doc.text("Bank & Branch: __________________________________________", innerX + 2.5, bY + 2.5);
    bY += 5.2;

    // Row 2: Scroll / Challan No & Date
    doc.text("Scroll / Challan No: __________________", innerX + 2.5, bY + 2.5);
    doc.text("Deposit Date: ________________________", innerX + innerW / 2 + 1.0, bY + 2.5);
    bY += 5.6;

    // Row 3: Prominent Amount Received Callout
    const amtPillH = 5.8;
    doc.setFillColor(...C.primaryMint);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX + 2.0, bY, innerW - 4.0, amtPillH, 0.6, 0.6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.primary);
    doc.text(
      `Amount Received: Rs. ${copy.taxPayable.totalPayable.toLocaleString()} /-`,
      innerX + innerW / 2,
      bY + 4.1,
      { align: "center" }
    );
    bY += amtPillH + 2.2;

    // Row 4: Rupees in Words
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textMid);
    doc.text(
      "Rupees in Words: _______________________________________________",
      innerX + 2.5,
      bY + 2.5
    );
    bY += 4.8;

    // Row 5: Spacious Bank Officer Signature & Stamp Box
    const remainingForStamp = bankY + bankH - bY - 5.5;
    const stampBoxH = Math.max(18, Math.min(28, remainingForStamp));
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.borderDark);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.roundedRect(innerX + 2.0, bY, innerW - 4.0, stampBoxH, 0.8, 0.8, "FD");
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(120, 113, 108);
    doc.text(
      "Authorized Cashier / Officer Signature & Bank Branch Stamp",
      innerX + innerW / 2,
      bY + stampBoxH - 2.5,
      { align: "center" }
    );

    // Row 6: SHA-256 integrity footer
    doc.setFontSize(4.4);
    doc.setTextColor(...C.textMuted);
    const hashSlice = challan.officialSha256 ? challan.officialSha256.slice(0, 16) : "AUTHENTIC";
    doc.text(
      `SHA-256: ${hashSlice}\u2026 \u2022 PTAS Punjab Official Payment Instrument \u2022 Rule 9`,
      innerX + innerW / 2,
      bankY + bankH - 1.5,
      { align: "center" }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // Perforated cut line between counterfoils
    // ══════════════════════════════════════════════════════════════════════════
    if (copyIdx < 2) {
      const cutX = colX + COPY_W + GAP / 2;
      doc.setDrawColor(...C.textMuted);
      doc.setLineWidth(0.18);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cutX, MARGIN_TOP, cutX, MARGIN_TOP + COPY_H);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.setTextColor(...C.textMuted);
      doc.text("\u2702 CUT", cutX, MARGIN_TOP + COPY_H / 2, {
        angle: 90,
        align: "center"
      });
    }
  }

  return doc;
}

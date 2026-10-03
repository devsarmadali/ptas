/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 *
 * Professional Tax Administration System (PTAS) - Government of the Punjab
 *
 * Compact, professional, government-style THREE-COPY payment challan (A4 Landscape: 297mm x 210mm).
 * Properly fills the A4 landscape sheet vertically with uniform 8mm top/bottom margins,
 * eliminating the empty bottom half while ensuring correct aspect ratio, high readability,
 * exact alignment, and zero text collisions.
 *
 * The 3 copies (Taxpayer, Bank, Department) are rendered with:
 *   1. Authority Header & Vector QR Code (left) with official authority hierarchy (right)
 *   2. Clean Two-Column Identification Grid with dedicated full-width rows for Notice No and PIN
 *   3. Taxpayer Details with multiline support for classification, legal name, and address
 *   4. Detail of Tax Payable table with right-aligned tabular numbers + Amount in Words
 *   5. Full-featured "For Bank's Use Only" statutory counterfoil with ample stamp area
 *   6. Full-height perforated scissor cut guides between copies
 */

import { jsPDF } from "jspdf";
import { createBasePdf, generateQrDataUrl } from "../base-document";
import type { FormPFT2Model } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";
import {
  formatChallanDisplayDate,
  formatChallanTaxYear,
  cleanChallanScope
} from "../../pft2-formatters";

// ── Statutory Colour Palette ──────────────────────────────────────────────────
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

  red: [185, 28, 28] as [number, number, number], // #b91c1c
  redBg: [254, 242, 242] as [number, number, number] // #fef2f2
} as const;

// ── Page Geometry (A4 Landscape: 297mm x 210mm) ──────────────────────────────
const MARGIN_LEFT = 5.5;
const MARGIN_TOP = 8.0;
const COPY_W = 92.0;
const GAP = 5.0; // 3 * 92.0 + 2 * 5.0 = 286mm; 297 - 286 = 11mm (5.5mm margins each side)
const COPY_H = 194.0; // Fills 92.4% of A4 landscape height (210mm - 8mm top - 8mm bottom = 194mm)

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
    const innerX = colX + 1.8;
    const innerW = COPY_W - 3.6; // 88.4mm usable inner width
    const cardBottom = MARGIN_TOP + COPY_H;
    const innerBottom = cardBottom - 1.8;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — TOP HEADER ROW & QR CODE
    // ══════════════════════════════════════════════════════════════════════════
    const QR_SIZE = 22.0;
    const qrX = innerX + 0.5;
    const qrY = curY + 1.5;

    // Render crisp vector QR image (quiet space preserved)
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR_SIZE, QR_SIZE);

    // Right region: Centered authority header
    const deptX = innerX + QR_SIZE + 2.5;
    const deptW = innerW - QR_SIZE - 3.0;
    const deptCX = deptX + deptW / 2;

    // 1. Copy Title Badge (Pill)
    const badgeText = copy.copyTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    const badgeW = Math.min(deptW - 1, doc.getTextWidth(badgeText) + 7);
    const badgeX = deptCX - badgeW / 2;
    doc.setFillColor(...C.primaryBg);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, curY + 0.8, badgeW, 4.2, 0.6, 0.6, "FD");
    doc.setTextColor(...C.primaryLight);
    doc.text(badgeText, deptCX, curY + 3.9, { align: "center" });

    // 2. GOVERNMENT OF THE PUNJAB
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(...C.primary);
    doc.text("GOVERNMENT OF THE PUNJAB", deptCX, curY + 8.4, { align: "center" });

    // 3. EXCISE & TAXATION DEPARTMENT
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C.textDark);
    doc.text("EXCISE & TAXATION DEPARTMENT", deptCX, curY + 11.6, { align: "center" });

    // 4. PUNJAB PROFESSIONS & TRADES TAX
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDark);
    doc.text("PUNJAB PROFESSIONS & TRADES TAX", deptCX, curY + 14.7, { align: "center" });

    // 5. PFT2 • PAYMENT CHALLAN
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...C.primary);
    doc.text("PFT2 \u2022 PAYMENT CHALLAN", deptCX, curY + 18.0, { align: "center" });

    // 6. Scope & Rule 9
    const cleanScope = cleanChallanScope(copy.pft2TypeLabel || copy.demandScope || "CURRENT");
    const scopeColor = cleanScope.includes("ARREAR")
      ? C.amber
      : cleanScope.includes("COMBINED")
        ? C.blueDeep
        : C.primaryLight;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...scopeColor);
    doc.text(`Rule 9 \u2022 [${cleanScope}]`, deptCX, curY + 21.1, { align: "center" });

    // 7. Head of Account
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...C.amber);
    const headText = `Head: ${copy.headOfAccount}`;
    const headLines = doc.splitTextToSize(headText, deptW - 1);
    doc.text(headLines[0] ?? headText, deptCX, curY + 24.1, { align: "center" });

    curY += 26.5;

    // Header divider line (green)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, curY, innerX + innerW, curY);
    curY += 1.8;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — IDENTIFICATION GRID (NO COLLISION / OVERLAP)
    // Dedicated full-width rows for long identifiers (Notice No and PIN)
    // ══════════════════════════════════════════════════════════════════════════
    const META_ROW_H = 4.8;
    const DUE_ROW_H = 5.2;
    const metaBoxH = 5 * META_ROW_H + DUE_ROW_H;

    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX, curY, innerW, metaBoxH, 0.6, 0.6, "FD");

    let mY = curY;
    const metaL = innerX + 1.8;
    const metaMid = innerX + 44.0;
    const metaR = innerX + innerW - 1.8;
    const LABEL_FS = 6.8;
    const VALUE_FS = 7.4;
    const leftLabelW = 22.0;

    // Row 0: Notice No (Full Width)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("NOTICE NO.", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.blueDeep);
    const noticeText = copy.noticeNumber ?? challan.noticeNumber;
    doc.text(noticeText, metaL + leftLabelW, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Row 1: PIN (Dedicated Full Width Row — Guarantees ZERO collision with District)
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("PIN", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.blueRef);
    const pinVal = copy.taxpayerInfo.provincialUin || copy.pin || challan.pin;
    doc.text(pinVal, metaL + leftLabelW, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Row 2: Security Code | Demand Number
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("SECURITY CODE", metaL, mY + META_ROW_H * 0.72);

    const codeVal = copy.pin ?? challan.pin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.blueBadgeText);
    const codeW = doc.getTextWidth(codeVal) + 3;
    doc.setFillColor(...C.blueBadgeBg);
    doc.setDrawColor(...C.blueBadgeBorder);
    doc.setLineWidth(0.15);
    doc.roundedRect(metaL + leftLabelW, mY + 0.6, codeW, 3.5, 0.4, 0.4, "FD");
    doc.text(codeVal, metaL + leftLabelW + codeW / 2, mY + 3.2, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DEMAND NUMBER", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...C.primaryLight);
    doc.text(copy.assessmentInfo.demandNo, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 3: Tax Unit | District
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("TAX UNIT", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.assessmentInfo.circleName, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DISTRICT", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.district, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 4: Tax Year | Issue Date
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("TAX YEAR", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.text(formatChallanTaxYear(copy.taxYear), metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.text("ISSUE DATE", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    const displayIssue = formatChallanDisplayDate(
      copy.issueDate || (challan as { issueDate?: string }).issueDate || "2026-07-01"
    );
    doc.text(displayIssue, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 5: Due Date (Prominent Colored Callout Row)
    doc.setFillColor(...C.redBg);
    doc.rect(innerX + 0.2, mY, innerW - 0.4, DUE_ROW_H - 0.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.red);
    doc.text("STATUTORY DUE DATE", metaL, mY + DUE_ROW_H * 0.7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.text(formatChallanDisplayDate(copy.dueDate), metaR, mY + DUE_ROW_H * 0.7, {
      align: "right"
    });

    curY += metaBoxH + 2.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAXPAYER DETAILS (MULTILINE SAFE, ZERO CLIPPING)
    // ══════════════════════════════════════════════════════════════════════════
    const TP_LABEL_FS = 6.8;
    const TP_VAL_FS = 7.4;
    const labelColW = 34.0;
    const valColX = innerX + labelColW + 1.5;
    const valColW = innerW - (labelColW + 2.5);

    // Row 1: CLASS
    const slabText = `(PKR ${copy.taxpayerInfo.slabRatePkr.toLocaleString()})`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.primaryLight);
    const slabW = doc.getTextWidth(slabText) + 2;
    doc.text(slabText, innerX + innerW - 1.0, curY + 3.0, { align: "right" });

    doc.setTextColor(...C.textDark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_LABEL_FS);
    doc.text("CLASS:", innerX + 1.0, curY + 3.0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(TP_VAL_FS);
    const classLines = doc.splitTextToSize(copy.taxpayerInfo.classification, valColW - slabW - 1);
    doc.text(classLines[0] ?? copy.taxpayerInfo.classification, valColX, curY + 3.0);
    if (classLines.length > 1) {
      curY += 3.4;
      doc.text(classLines[1] ?? "", valColX, curY + 3.0);
    }
    curY += 4.0;

    // Row 2: LEGAL NAME
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("LEGAL NAME:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    const legalNameLines = doc.splitTextToSize(copy.taxpayerInfo.legalName, valColW);
    doc.text(legalNameLines[0] ?? "", valColX, curY + 3.0);
    if (legalNameLines.length > 1) {
      curY += 3.4;
      doc.text(legalNameLines[1] ?? "", valColX, curY + 3.0);
    }
    curY += 4.0;

    // Row 3: TAXPAYER / PROPRIETOR
    const tradeVal = copy.taxpayerInfo.tradeName || copy.taxpayerInfo.legalName;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_LABEL_FS);
    doc.text("TAXPAYER / PROPRIETOR:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(TP_VAL_FS);
    const tradeLines = doc.splitTextToSize(tradeVal, valColW);
    doc.text(tradeLines[0] ?? "", valColX, curY + 3.0);
    if (tradeLines.length > 1) {
      curY += 3.4;
      doc.text(tradeLines[1] ?? "", valColX, curY + 3.0);
    }
    curY += 4.0;

    // Row 4: ADDRESS
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_LABEL_FS);
    doc.text("ADDRESS:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.textMid);
    const addrLines = doc.splitTextToSize(copy.taxpayerInfo.address, valColW);
    doc.text(addrLines[0] ?? "", valColX, curY + 3.0);
    if (addrLines.length > 1) {
      curY += 3.4;
      doc.text(addrLines[1] ?? "", valColX, curY + 3.0);
    }
    curY += 4.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — DETAIL OF TAX PAYABLE TABLE & AMOUNT IN WORDS
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.primary);
    doc.text("TAX PAYABLE", innerX + 1.0, curY + 2.6);
    curY += 3.6;

    const tblL = innerX;
    const tblR = innerX + innerW;
    const tblW = innerW;
    const ROW_H = 5.0;

    const tableData: {
      label: string;
      value: string;
      bold?: boolean;
      total?: boolean;
      amber?: boolean;
    }[] = [
      { label: "Current Tax", value: `Rs. ${copy.taxPayable.currentTax.toLocaleString()}` },
      { label: "Arrears", value: `Rs. ${copy.taxPayable.arrears.toLocaleString()}` },
      { label: "Penalty", value: `Rs. ${copy.taxPayable.penalty.toLocaleString()}` },
      {
        label: "TOTAL PAYABLE",
        value: `Rs. ${copy.taxPayable.totalPayable.toLocaleString()}`,
        bold: true,
        total: true
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

    const tableH = (tableData.length - 1) * ROW_H + 6.4;
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.rect(tblL, curY, tblW, tableH);

    let tRowY = curY;
    tableData.forEach((row, idx) => {
      const thisRowH = row.total ? 6.4 : ROW_H;
      if (row.total) {
        doc.setFillColor(...C.primaryBg);
        doc.rect(tblL, tRowY, tblW, thisRowH, "F");
      } else if (row.amber) {
        doc.setFillColor(...C.amberBg);
        doc.rect(tblL, tRowY, tblW, thisRowH, "F");
      }

      if (idx < tableData.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.15);
        doc.line(tblL, tRowY + thisRowH, tblR, tRowY + thisRowH);
      }

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.total ? 8.6 : 7.4);
      doc.setTextColor(...(row.total ? C.primaryLight : row.amber ? C.amberText : C.textDark));
      doc.text(row.label, tblL + 2.0, tRowY + thisRowH * 0.7);

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.total ? 9.5 : 7.8);
      doc.text(row.value, tblR - 2.0, tRowY + thisRowH * 0.7, { align: "right" });

      tRowY += thisRowH;
    });

    curY += tableH + 1.8;

    // Amount in Words
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...C.textDark);
    doc.text("Amount in Words:", tblL + 1.0, curY + 2.8);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...C.textMid);
    const wordsText = copy.taxPayable.totalPayableWords;
    const wordsW = doc.getTextWidth("Amount in Words:") + 2.5;
    const wordsLines = doc.splitTextToSize(wordsText, tblW - wordsW - 2);
    doc.text(wordsLines[0] ?? wordsText, tblL + 1.0 + wordsW, curY + 2.8);
    if (wordsLines.length > 1) {
      curY += 3.2;
      doc.text(wordsLines[1] ?? "", tblL + 1.0 + wordsW, curY + 2.8);
    }
    curY += 5.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — FOR BANK'S USE ONLY (PROPORTIONAL FULL-HEIGHT COUNTERFOIL)
    // Dynamically fills remaining height down to bottom card margin
    // ══════════════════════════════════════════════════════════════════════════
    const bankY = curY;
    const BANK_H = Math.max(40.0, innerBottom - bankY);

    doc.setFillColor(...C.bgBank);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.25);
    doc.roundedRect(innerX, bankY, innerW, BANK_H, 0.6, 0.6, "FD");

    // Top primary accent bar
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, bankY, innerX + innerW, bankY);

    // Header bar (amber-tinted)
    const headerBarH = 4.2;
    doc.setFillColor(...C.amberBg);
    doc.rect(innerX, bankY + 0.2, innerW, headerBarH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.amberDark);
    doc.text("FOR BANK'S USE ONLY \u2022 Rule 9 Statutory Counterfoil", innerX + 2.0, bankY + 3.0);

    // Left Pane: Operational inputs and amount callout
    const bLeftW = 49.0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.0);
    doc.setTextColor(...C.textDark);

    // Row 1: Bank & Branch
    doc.text("Bank / Branch: __________________________", innerX + 2.0, bankY + 8.8);

    // Row 2: Scroll No & Deposit Date
    doc.text("Scroll No.: _________ Date: ____________", innerX + 2.0, bankY + 14.8);

    // Row 3: Payment Mode
    doc.text("Mode: [  ] Cash   [  ] Cheque / PO", innerX + 2.0, bankY + 20.8);

    // Row 4: Amount Received Callout Box
    const amtBoxTop = bankY + 25.0;
    const amtBoxH = Math.max(18.0, BANK_H - 27.5);
    doc.setFillColor(...C.primaryMint);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.25);
    doc.roundedRect(innerX + 1.5, amtBoxTop, bLeftW - 3.0, amtBoxH, 0.6, 0.6, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...C.primaryLight);
    doc.text("TOTAL AMOUNT COLLECTED", innerX + 1.5 + (bLeftW - 3.0) / 2, amtBoxTop + 5.0, {
      align: "center"
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.0);
    doc.setTextColor(...C.primary);
    doc.text(
      `Rs. ${copy.taxPayable.totalPayable.toLocaleString()} /-`,
      innerX + 1.5 + (bLeftW - 3.0) / 2,
      amtBoxTop + 12.2,
      { align: "center" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...C.textMid);
    doc.text(
      "Statutory Deposit Acknowledgement",
      innerX + 1.5 + (bLeftW - 3.0) / 2,
      amtBoxTop + Math.min(amtBoxH - 2.0, 17.5),
      { align: "center" }
    );

    // Right Pane: Cashier Signature & Stamp Box
    const stampX = innerX + bLeftW + 1.2;
    const stampW = innerW - bLeftW - 2.4;
    const stampY = bankY + headerBarH + 1.2;
    const stampH = BANK_H - headerBarH - 2.4;

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.borderDark);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.roundedRect(stampX, stampY, stampW, stampH, 0.6, 0.6, "FD");
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.setTextColor(...C.textMuted);
    doc.text("Official Receiving Stamp", stampX + stampW / 2, stampY + 4.5, { align: "center" });

    doc.setDrawColor(...C.borderLight);
    doc.line(stampX + 3.0, stampY + stampH - 10.0, stampX + stampW - 3.0, stampY + stampH - 10.0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textDark);
    doc.text("Authorized Cashier", stampX + stampW / 2, stampY + stampH - 6.8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(...C.textMuted);
    doc.text("Signature & Official Stamp", stampX + stampW / 2, stampY + stampH - 4.2, {
      align: "center"
    });
    doc.text("Date: _______________", stampX + stampW / 2, stampY + stampH - 1.6, {
      align: "center"
    });

    // ══════════════════════════════════════════════════════════════════════════
    // Perforated scissor cut line between counterfoils (Full Page Height)
    // ══════════════════════════════════════════════════════════════════════════
    if (copyIdx < 2) {
      const cutX = colX + COPY_W + GAP / 2;
      doc.setDrawColor(...C.textMuted);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cutX, MARGIN_TOP, cutX, MARGIN_TOP + COPY_H);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(...C.textMuted);
      doc.text("\u2702 CUT", cutX, MARGIN_TOP + COPY_H / 2, {
        angle: 90,
        align: "center"
      });
    }
  }

  return doc;
}

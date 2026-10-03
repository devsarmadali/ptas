/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 *
 * Professional Tax Administration System (PTAS) - Government of the Punjab
 *
 * Compact, professional, government-style THREE-COPY payment challan (A4 Landscape).
 * Completely eliminates bottom white space waste while maintaining high readability,
 * exact alignment, and rock-solid single-page compliance.
 *
 * The 3 copies (Taxpayer, Bank, Department) are rendered with:
 *   1. Compact Header & Vector QR Code (left) with official authority hierarchy (right)
 *   2. Compact Two-Column Identification Grid (Notice No, Code, Demand No, Taxpayer PIN, District, Circle, Tax Year, Issue Date, Due Date)
 *   3. Compact Taxpayer Details with fixed label columns guaranteeing label/value separation
 *   4. Detail of Tax Payable table with right-aligned tabular numbers + single-line Amount in Words
 *   5. For Bank's Use Only statutory counterfoil positioned immediately below tax information with no dead space
 *   6. Perforated scissor cut guides between copies
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

  red: [185, 28, 28] as [number, number, number] // #b91c1c
} as const;

// ── Page Geometry (A4 Landscape: 297mm x 210mm) ──────────────────────────────
const MARGIN_LEFT = 5.5;
const MARGIN_TOP = 8.0;
const COPY_W = 92.0;
const GAP = 5.0; // 3 * 92.0 + 2 * 5.0 = 286mm; 297 - 286 = 11mm (5.5mm margins each side)
const COPY_H = 126.0; // Compact uniform card height with zero dead space

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
    doc.roundedRect(colX, MARGIN_TOP, COPY_W, COPY_H, 1.0, 1.0, "S");

    let curY = MARGIN_TOP;
    const innerX = colX + 1.8;
    const innerW = COPY_W - 3.6; // 88.4mm usable inner width

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — TOP HEADER ROW & QR CODE
    // ══════════════════════════════════════════════════════════════════════════
    const QR_SIZE = 20.5;
    const qrX = innerX + 0.5;
    const qrY = curY + 1.2;

    // Render crisp vector QR image (quiet space preserved)
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR_SIZE, QR_SIZE);

    // Right region: Centered authority header
    const deptX = innerX + QR_SIZE + 2.0;
    const deptW = innerW - QR_SIZE - 2.5;
    const deptCX = deptX + deptW / 2;

    // 1. Copy Title Badge (Pill)
    const badgeText = copy.copyTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    const badgeW = Math.min(deptW - 1, doc.getTextWidth(badgeText) + 6);
    const badgeX = deptCX - badgeW / 2;
    doc.setFillColor(...C.primaryBg);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, curY + 0.8, badgeW, 4.0, 0.6, 0.6, "FD");
    doc.setTextColor(...C.primaryLight);
    doc.text(badgeText, deptCX, curY + 3.8, { align: "center" });

    // 2. GOVERNMENT OF THE PUNJAB
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(...C.primary);
    doc.text("GOVERNMENT OF THE PUNJAB", deptCX, curY + 8.0, { align: "center" });

    // 3. EXCISE & TAXATION DEPARTMENT
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C.textDark);
    doc.text("EXCISE & TAXATION DEPARTMENT", deptCX, curY + 11.2, { align: "center" });

    // 4. PUNJAB PROFESSIONS & TRADES TAX
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.textDark);
    doc.text("PUNJAB PROFESSIONS & TRADES TAX", deptCX, curY + 14.2, { align: "center" });

    // 5. PFT-2 • PAYMENT CHALLAN
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...C.primary);
    doc.text("PFT-2 \u2022 PAYMENT CHALLAN", deptCX, curY + 17.4, { align: "center" });

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
    doc.text(`Rule 9 \u2022 [${cleanScope}]`, deptCX, curY + 20.4, { align: "center" });

    // 7. Head of Account
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...C.amber);
    const headText = `Head: ${copy.headOfAccount}`;
    const headLines = doc.splitTextToSize(headText, deptW - 1);
    doc.text(headLines[0] ?? headText, deptCX, curY + 23.2, { align: "center" });

    curY += 24.6;

    // Header divider line (green)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, curY, innerX + innerW, curY);
    curY += 1.2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — IDENTIFICATION GRID (COMPACT TWO-COLUMN GRID)
    // ══════════════════════════════════════════════════════════════════════════
    const META_ROW_H = 4.3;
    const metaBoxH = 5 * META_ROW_H + 1.0;

    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX, curY, innerW, metaBoxH, 0.6, 0.6, "FD");

    let mY = curY + 0.6;
    const metaL = innerX + 1.5;
    const metaMid = innerX + 44.0;
    const metaR = innerX + innerW - 1.5;
    const LABEL_FS = 6.8;
    const VALUE_FS = 7.4;
    const leftLabelW = 21.0;

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

    // Row 1: Code | Demand No
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("CODE", metaL, mY + META_ROW_H * 0.72);

    const codeVal = copy.pin ?? challan.pin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.blueBadgeText);
    const codeW = doc.getTextWidth(codeVal) + 3;
    doc.setFillColor(...C.blueBadgeBg);
    doc.setDrawColor(...C.blueBadgeBorder);
    doc.setLineWidth(0.15);
    doc.roundedRect(metaL + leftLabelW, mY + 0.5, codeW, 3.4, 0.4, 0.4, "FD");
    doc.text(codeVal, metaL + leftLabelW + codeW / 2, mY + 3.1, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DEMAND NO.", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    doc.setTextColor(...C.primaryLight);
    doc.text(copy.assessmentInfo.demandNo, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 2: Taxpayer PIN | District
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("TAXPAYER PIN", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.setTextColor(...C.blueRef);
    const pinVal = copy.taxpayerInfo.provincialUin || copy.pin || challan.pin;
    doc.text(pinVal, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DISTRICT", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.district, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 3: Circle | Tax Year
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("CIRCLE", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    doc.text(copy.assessmentInfo.circleName, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.text("TAX YEAR", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(VALUE_FS);
    doc.text(formatChallanTaxYear(copy.taxYear), metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 4: Issue Date | Due Date
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("ISSUE DATE", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(VALUE_FS);
    const displayIssue = formatChallanDisplayDate(
      copy.issueDate || (challan as { issueDate?: string }).issueDate || "2026-07-01"
    );
    doc.text(displayIssue, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.red);
    doc.text("DUE DATE", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    doc.text(formatChallanDisplayDate(copy.dueDate), metaR, mY + META_ROW_H * 0.72, {
      align: "right"
    });

    curY += metaBoxH + 1.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAXPAYER DETAILS (COMPACT ROWS, NEVER TOUCH LABELS)
    // ══════════════════════════════════════════════════════════════════════════
    const TP_FS = 6.8;
    const TP_VAL_FS = 7.6;
    const labelColW = 31.0;
    const valColX = innerX + 1.0 + labelColW + 1.5;
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
    doc.setFontSize(TP_FS);
    doc.text("CLASS:", innerX + 1.0, curY + 3.0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(TP_VAL_FS);
    const classLines = doc.splitTextToSize(copy.taxpayerInfo.classification, valColW - slabW - 1);
    doc.text(classLines[0] ?? copy.taxpayerInfo.classification, valColX, curY + 3.0);
    curY += 3.8;

    // Row 2: LEGAL NAME
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_FS);
    doc.text("LEGAL NAME:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    const legalNameLines = doc.splitTextToSize(copy.taxpayerInfo.legalName, valColW);
    doc.text(legalNameLines[0] ?? "", valColX, curY + 3.0);
    curY += 3.8;

    // Row 3: TAXPAYER / PROPRIETOR
    const tradeVal = copy.taxpayerInfo.tradeName || copy.taxpayerInfo.legalName;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_FS);
    doc.text("TAXPAYER / PROPRIETOR:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(TP_VAL_FS);
    const tradeLines = doc.splitTextToSize(tradeVal, valColW);
    doc.text(tradeLines[0] ?? "", valColX, curY + 3.0);
    curY += 3.8;

    // Row 4: ADDRESS
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TP_FS);
    doc.text("ADDRESS:", innerX + 1.0, curY + 3.0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const addrLines = doc.splitTextToSize(copy.taxpayerInfo.address, valColW);
    doc.text(addrLines[0] ?? "", valColX, curY + 3.0);
    curY += 4.2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — DETAIL OF TAX PAYABLE TABLE & AMOUNT IN WORDS
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.primary);
    doc.text("TAX PAYABLE", innerX + 1.0, curY + 2.4);
    curY += 3.2;

    const tblL = innerX;
    const tblR = innerX + innerW;
    const tblW = innerW;
    const ROW_H = 4.2;

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

    const tableH = (tableData.length - 1) * ROW_H + 5.0;
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.rect(tblL, curY, tblW, tableH);

    let tRowY = curY;
    tableData.forEach((row, idx) => {
      const thisRowH = row.total ? 5.0 : ROW_H;
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
      doc.setFontSize(row.total ? 8.6 : 7.2);
      doc.setTextColor(...(row.total ? C.primaryLight : row.amber ? C.amberText : C.textDark));
      doc.text(row.label, tblL + 2.0, tRowY + thisRowH * 0.72);

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.total ? 9.2 : 7.8);
      doc.text(row.value, tblR - 2.0, tRowY + thisRowH * 0.72, { align: "right" });

      tRowY += thisRowH;
    });

    curY += tableH + 1.2;

    // Amount in Words (Compact Single Line)
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
    curY += 4.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — FOR BANK'S USE ONLY (COMPACT STATUTORY COUNTERFOIL)
    // Positioned immediately below tax information with no dead space
    // ══════════════════════════════════════════════════════════════════════════
    const BANK_H = 19.5;
    const bankY = curY;

    doc.setFillColor(...C.bgBank);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.25);
    doc.roundedRect(innerX, bankY, innerW, BANK_H, 0.6, 0.6, "FD");

    // Top primary accent bar
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, bankY, innerX + innerW, bankY);

    // Header bar (amber-tinted, ultra-compact)
    const headerBarH = 3.2;
    doc.setFillColor(...C.amberBg);
    doc.rect(innerX, bankY + 0.2, innerW, headerBarH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.0);
    doc.setTextColor(...C.amberDark);
    doc.text("FOR BANK'S USE ONLY \u2022 Rule 9 Statutory Counterfoil", innerX + 1.5, bankY + 2.4);

    // Left Pane: Operational inputs and amount callout
    const bLeftW = 48.0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textDark);

    // Row 1: Bank & Branch
    doc.text("Bank / Branch: __________________________", innerX + 1.5, bankY + 6.2);

    // Row 2: Scroll No & Deposit Date
    doc.text("Scroll No.: _________ Payment Date: _______", innerX + 1.5, bankY + 9.8);

    // Row 3: Amount Received Callout Pill
    const amtPillH = 4.4;
    doc.setFillColor(...C.primaryMint);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX + 1.2, bankY + 12.0, bLeftW - 2.4, amtPillH, 0.5, 0.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...C.primary);
    doc.text(
      `Amount: Rs. ${copy.taxPayable.totalPayable.toLocaleString()} /-`,
      innerX + (bLeftW - 2.4) / 2 + 1.2,
      bankY + 15.2,
      { align: "center" }
    );

    // Right Pane: Cashier Signature & Stamp Box
    const stampX = innerX + bLeftW + 1.0;
    const stampW = innerW - bLeftW - 2.0;
    const stampY = bankY + headerBarH + 0.8;
    const stampH = BANK_H - headerBarH - 1.6;

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.borderDark);
    doc.setLineWidth(0.18);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.roundedRect(stampX, stampY, stampW, stampH, 0.5, 0.5, "FD");
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.0);
    doc.setTextColor(100, 116, 139);
    doc.text("Authorized Cashier", stampX + stampW / 2, stampY + stampH - 3.6, { align: "center" });
    doc.text("Signature & Stamp", stampX + stampW / 2, stampY + stampH - 1.4, { align: "center" });

    // ══════════════════════════════════════════════════════════════════════════
    // Perforated scissor cut line between counterfoils
    // ══════════════════════════════════════════════════════════════════════════
    if (copyIdx < 2) {
      const cutX = colX + COPY_W + GAP / 2;
      doc.setDrawColor(...C.textMuted);
      doc.setLineWidth(0.18);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cutX, MARGIN_TOP, cutX, MARGIN_TOP + COPY_H);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.0);
      doc.setTextColor(...C.textMuted);
      doc.text("\u2702 CUT", cutX, MARGIN_TOP + COPY_H / 2, {
        angle: 90,
        align: "center"
      });
    }
  }

  return doc;
}

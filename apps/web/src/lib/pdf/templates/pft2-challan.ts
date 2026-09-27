/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 *
 * PDF VISUAL SPECIFICATION: This template faithfully reproduces the approved web
 * layout from apps/web/src/app/documents/pf2/new/page.tsx.
 *
 * The same document structure, field order, labels, values, spacing, typography,
 * and visual hierarchy are used in both the web and PDF renderings.
 * The web rendering is the authoritative design specification.
 *
 * Section order per copy card (matches web exactly):
 *   1. Top header row — QR code (left) + dept header (right, centred)
 *   2. Metadata grid  — Notice No | PIN / Demand No | Provincial UIN | Circle / District | Tax Year / Due Date
 *   3. Taxpayer info  — Class (slab) | Name | Trade (if set) | Address
 *   4. Tax table      — Current Tax | Arrears | Penalty | Total Payable | [Remaining Balance]
 *   5. Amount in words (italic footnote)
 *   6. For Bank's Use Only block
 *   7. Perforated cut line (between copies only)
 *
 * Layout: A4 Landscape (297 × 210 mm), 3 side-by-side copies, zero DOM/viewport dependency.
 */

import { jsPDF } from "jspdf";
import { createBasePdf, generateQrDataUrl, PDF_COLORS } from "../base-document";
import type { FormPFT2Model } from "../../statutory-forms";
import type { DocumentGenerationOptions } from "../types";

// ── Colour palette mirroring the web design tokens ──────────────────────────
const C = {
  // Greens
  primary: [13, 56, 34] as [number, number, number], // #0d3822
  primaryLight: [22, 101, 52] as [number, number, number], // #166534
  primaryBg: [220, 252, 231] as [number, number, number], // #dcfce7 (copy title badge bg)
  primaryMint: [240, 253, 244] as [number, number, number], // #f0fdf4 (total row bg)

  // Slate / neutral
  bgMeta: [248, 250, 252] as [number, number, number], // #f8fafc (metadata grid bg)
  bgBank: [250, 250, 249] as [number, number, number], // #fafaf9 (bank section bg)
  borderLight: [226, 232, 240] as [number, number, number], // #e2e8f0
  borderMed: [203, 213, 225] as [number, number, number], // #cbd5e1
  borderDark: [148, 163, 184] as [number, number, number], // #94a3b8 (dashed bank box)
  textDark: [15, 23, 42] as [number, number, number], // #0f172a
  textMid: [71, 85, 105] as [number, number, number], // #475569
  textMuted: [100, 116, 139] as [number, number, number], // #64748b
  white: [255, 255, 255] as [number, number, number],

  // Blue (monospace references)
  blueDeep: [30, 58, 138] as [number, number, number], // #1e3a8a  (Notice No)
  blueBadgeBg: [224, 242, 254] as [number, number, number], // #e0f2fe (PIN badge bg)
  blueBadgeBorder: [186, 230, 253] as [number, number, number], // #bae6fd
  blueBadgeText: [3, 105, 161] as [number, number, number], // #0369a1
  blueRef: [29, 78, 216] as [number, number, number], // #1d4ed8 (Provincial UIN)

  // Amber (head of account + due date highlight)
  amber: [180, 83, 9] as [number, number, number], // #b45309
  amberDark: [120, 53, 15] as [number, number, number], // #78350f (bank header)
  amberBg: [254, 243, 199] as [number, number, number], // #fef3c7 (partial balance)
  amberText: [146, 64, 14] as [number, number, number], // #92400e

  // Red (due date text)
  red: [185, 28, 28] as [number, number, number] // #b91c1c
} as const;

// ── Page geometry ────────────────────────────────────────────────────────────
const PAGE_H = 210;
const PAGE_W = 297;
const MARGIN_TOP = 5;
const MARGIN_LEFT = 5;
const COPY_W = 91; // 3 × 91 = 273 + 2 × 6.5 gap + 2 × 5 margin ≈ 297
const GAP = 6;
const COPY_H = PAGE_H - 10; // 200 mm

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

  // Pre-render QR code as high-res PNG (shared payload, same across all 3 copies)
  const qrDataUrl = await generateQrDataUrl(challan.qrPayload);

  // ── Render 3 counterfoil columns side-by-side ─────────────────────────────
  for (let copyIdx = 0; copyIdx < 3; copyIdx++) {
    const colX = MARGIN_LEFT + copyIdx * (COPY_W + GAP);
    const copy = challan.copies[copyIdx] ?? challan.copies[0];

    // Outer card border
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.3);
    doc.rect(colX, MARGIN_TOP, COPY_W, COPY_H);

    let curY = MARGIN_TOP;
    const innerX = colX + 1.5; // 1.5 mm inner padding
    const innerW = COPY_W - 3;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — TOP HEADER ROW: QR Code (left) + Dept header (right)
    // Web: flex row, gap 0.5rem, alignItems center, borderBottom 2px #0d3822
    // ══════════════════════════════════════════════════════════════════════════
    const headerH = 26; // matches ~66px QR + label in web
    const qrSize = 20;
    const qrX = innerX + 1;
    const qrY = curY + 2;

    // QR image
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // "Scan to Verify" label under QR
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.2);
    doc.setTextColor(...C.textMuted);
    doc.text("Scan to Verify", qrX + qrSize / 2, qrY + qrSize + 1.5, { align: "center" });

    // Challan serial subtitle under "Scan to Verify"
    doc.setFontSize(3.8);
    doc.text(copy.bankUse.challanSerial, qrX + qrSize / 2, qrY + qrSize + 3.5, {
      align: "center"
    });

    // Right side: copy title badge + dept header (centre-aligned in remaining width)
    const deptX = innerX + qrSize + 3; // start of right region
    const deptW = innerW - qrSize - 4; // remaining width
    const deptCX = deptX + deptW / 2; // centre of right region

    // Copy title badge (green pill: #dcfce7 bg, #166534 text)
    const badgeText = copy.copyTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    const badgeW = Math.min(deptW - 2, doc.getTextWidth(badgeText) + 4);
    const badgeX = deptCX - badgeW / 2;
    doc.setFillColor(...C.primaryBg);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.15);
    doc.roundedRect(badgeX, curY + 1.5, badgeW, 4, 0.8, 0.8, "FD");
    doc.setTextColor(...C.primaryLight);
    doc.text(badgeText, deptCX, curY + 4.5, { align: "center" });

    // GOVERNMENT OF THE PUNJAB (bold, #0d3822, 7pt equiv)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.primary);
    doc.text("GOVERNMENT OF THE PUNJAB", deptCX, curY + 8.2, { align: "center" });

    // EXCISE & TAXATION DEPARTMENT (bold, slightly smaller)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textDark);
    doc.text("EXCISE & TAXATION DEPARTMENT", deptCX, curY + 11.5, { align: "center" });

    // PUNJAB PROFESSIONS & TRADES TAX
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.setTextColor(...C.textDark);
    doc.text("PUNJAB PROFESSIONS & TRADES TAX", deptCX, curY + 14.2, { align: "center" });

    // PAYMENT CHALLAN • Rule 9 (muted)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textMuted);
    doc.text("PAYMENT CHALLAN \u2022 Rule 9", deptCX, curY + 16.8, { align: "center" });

    // Head of Account (amber, bold — #b45309)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.amber);
    const headText = `Head: ${copy.headOfAccount}`;
    const headLines = doc.splitTextToSize(headText, deptW);
    doc.text(headLines[0] ?? headText, deptCX, curY + 19.5, { align: "center" });

    // Copy title Urdu (small, muted, below head)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.2);
    doc.setTextColor(...C.textMuted);
    doc.text(copy.copyTitleUrdu, deptCX, curY + 22.5, { align: "center" });

    curY += headerH;

    // Bottom border of header section (2px solid #0d3822)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.5);
    doc.line(innerX, curY, innerX + innerW, curY);

    curY += 1.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — METADATA GRID
    // Web: 2-col grid, bg #f8fafc, border #e2e8f0, borderRadius 4px, 0.72rem
    // Fields: Notice No (full) | PIN (left) / Demand No (right) |
    //         Provincial UIN (full, if set) | Circle / District | Tax Year / Due Date
    // ══════════════════════════════════════════════════════════════════════════
    const metaGridH = copy.taxpayerInfo.provincialUin ? 26 : 22;
    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX, curY, innerW, metaGridH, 0.8, 0.8, "FD");

    let mY = curY + 3;
    const metaL = innerX + 1.5;
    const metaMid = innerX + innerW / 2;
    const metaR = innerX + innerW - 1.5;

    // Row A — Notice No (full width, monospace blue)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textDark);
    doc.text("Notice No:", metaL, mY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.blueDeep);
    const noticeText = copy.noticeNumber ?? challan.noticeNumber;
    const noticeLines = doc.splitTextToSize(noticeText, innerW - 20);
    doc.text(noticeLines[0] ?? noticeText, metaL + 15, mY);
    if (noticeLines[1] as string | undefined) {
      doc.text(noticeLines[1]!, metaL, mY + 3);
      mY += 3;
    }
    mY += 4;

    // Divider
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY - 0.5, metaR, mY - 0.5);
    doc.setLineDashPattern([], 0);

    // Row B — PIN badge (left) | Demand No (right)
    // PIN badge — #e0f2fe bg, #0369a1 text, #bae6fd border
    const pinText = `\uD83D\uDD10 PIN: ${copy.pin ?? challan.pin}`;
    const pinBadgeW = Math.min(innerW / 2 - 3, doc.getTextWidth(pinText) + 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setFillColor(...C.blueBadgeBg);
    doc.setDrawColor(...C.blueBadgeBorder);
    doc.setLineWidth(0.15);
    doc.roundedRect(metaL, mY, pinBadgeW, 4, 0.6, 0.6, "FD");
    doc.setTextColor(...C.blueBadgeText);
    doc.text(pinText, metaL + pinBadgeW / 2, mY + 2.8, { align: "center" });

    // Demand No (right, dark green monospace)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textDark);
    doc.text("Demand No:", metaMid + 1, mY + 2.8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.primary);
    doc.text(copy.assessmentInfo.demandNo, metaR, mY + 2.8, { align: "right" });
    mY += 5.5;

    // Row C — Provincial UIN (full width, if present)
    if (copy.taxpayerInfo.provincialUin) {
      doc.setDrawColor(...C.borderLight);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(metaL, mY - 0.5, metaR, mY - 0.5);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.5);
      doc.setTextColor(...C.textDark);
      doc.text("PIN (Professional Identification No):", metaL, mY + 3);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.blueRef);
      doc.text(copy.taxpayerInfo.provincialUin, metaR, mY + 3, { align: "right" });
      mY += 5;
    }

    // Row D — Circle (left) | District (right)
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY - 0.5, metaR, mY - 0.5);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textDark);
    doc.text("Circle:", metaL, mY + 3);
    doc.setFont("helvetica", "normal");
    doc.text(copy.assessmentInfo.circleName, metaL + 10, mY + 3);

    doc.setFont("helvetica", "bold");
    doc.text("District:", metaMid + 1, mY + 3);
    doc.setFont("helvetica", "normal");
    doc.text(copy.district, metaR, mY + 3, { align: "right" });
    mY += 4.5;

    // Row E — Tax Year (left) | Due Date (right, red)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textDark);
    doc.text("Tax Year:", metaL, mY + 3);
    doc.setFont("helvetica", "normal");
    doc.text(copy.taxYear, metaL + 13, mY + 3);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.red);
    doc.text("Due Date:", metaMid + 1, mY + 3);
    doc.setFont("helvetica", "normal");
    doc.text(copy.dueDate, metaR, mY + 3, { align: "right" });

    curY += metaGridH + 2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAXPAYER DETAILS
    // Web: Class (slab) | Name | Trade (if set) | Address
    // ══════════════════════════════════════════════════════════════════════════
    const lineH = 4;
    doc.setFontSize(5);
    doc.setTextColor(...C.textDark);

    // Class: classification (PKR slabRatePkr)
    doc.setFont("helvetica", "bold");
    doc.text("Class:", innerX + 1.5, curY);
    doc.setFont("helvetica", "normal");
    const classLine =
      doc.splitTextToSize(`${copy.taxpayerInfo.classification}`, innerW - 18)[0] ?? "";
    doc.text(classLine, innerX + 11, curY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.primaryLight);
    doc.text(
      `(PKR ${copy.taxpayerInfo.slabRatePkr.toLocaleString()})`,
      innerX + innerW - 1.5,
      curY,
      { align: "right" }
    );
    doc.setTextColor(...C.textDark);
    curY += lineH;

    // Name: legalName
    doc.setFont("helvetica", "bold");
    doc.text("Name:", innerX + 1.5, curY);
    doc.setFont("helvetica", "normal");
    const nameLine = doc.splitTextToSize(copy.taxpayerInfo.legalName, innerW - 15)[0] ?? "";
    doc.text(nameLine, innerX + 11, curY);
    curY += lineH;

    // Trade: tradeName (only if set)
    if (copy.taxpayerInfo.tradeName) {
      doc.setFont("helvetica", "bold");
      doc.text("Trade:", innerX + 1.5, curY);
      doc.setFont("helvetica", "normal");
      const tradeLine = doc.splitTextToSize(copy.taxpayerInfo.tradeName, innerW - 15)[0] ?? "";
      doc.text(tradeLine, innerX + 11, curY);
      curY += lineH;
    }

    // Address: address
    doc.setFont("helvetica", "bold");
    doc.text("Address:", innerX + 1.5, curY);
    doc.setFont("helvetica", "normal");
    const addrLine = doc.splitTextToSize(copy.taxpayerInfo.address, innerW - 18)[0] ?? "";
    doc.text(addrLine, innerX + 13, curY);
    curY += lineH + 1;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — DETAIL OF TAX PAYABLE TABLE
    // Web: label → table rows: Current Tax / Arrears / Penalty / Total Payable /
    //      [Remaining Balance] → italic amount-in-words footnote
    // ══════════════════════════════════════════════════════════════════════════

    // Section label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(...C.primary);
    doc.text("Detail of Tax Payable:", innerX + 1.5, curY);
    curY += 2;

    const tblL = innerX + 1;
    const tblR = innerX + innerW - 1;
    const tblW = innerW - 2;
    const rowH = 4.5;

    // Table outer border
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);

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

    const tableH = tableData.length * rowH;
    doc.rect(tblL, curY, tblW, tableH);

    tableData.forEach((row, idx) => {
      const rowY = curY + idx * rowH;
      // Row background
      if (row.green) {
        doc.setFillColor(...C.primaryMint);
        doc.rect(tblL, rowY, tblW, rowH, "F");
      } else if (row.amber) {
        doc.setFillColor(...C.amberBg);
        doc.rect(tblL, rowY, tblW, rowH, "F");
      } else if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(tblL, rowY, tblW, rowH, "F");
      }
      // Row bottom divider
      if (idx < tableData.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.15);
        doc.line(tblL, rowY + rowH, tblR, rowY + rowH);
      }
      // Label
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(4.8);
      doc.setTextColor(...(row.green ? C.primaryLight : row.amber ? C.amberText : C.textDark));
      doc.text(row.label, tblL + 1.5, rowY + rowH - 1.5);
      // Value (right-aligned)
      doc.text(row.value, tblR - 1, rowY + rowH - 1.5, { align: "right" });
    });

    curY += tableH + 1;

    // Amount in words (italic footnote — muted, #475569)
    doc.setFont("helvetica", "italic");
    doc.setFontSize(4.2);
    doc.setTextColor(...C.textMid);
    const wordsText = `(in words) ${copy.taxPayable.totalPayableWords}`;
    const wordsLines = doc.splitTextToSize(wordsText, innerW - 2);
    doc.text(wordsLines.slice(0, 2), innerX + 1.5, curY + 2);
    curY += Math.min(wordsLines.length, 2) * 3.5 + 1.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — FOR BANK'S USE ONLY (pinned to bottom)
    // Web: borderTop 2px #0d3822, bg #fafaf9, amber header, lines, dashed stamp box
    // ══════════════════════════════════════════════════════════════════════════
    const bankH = 24;
    const bankY = MARGIN_TOP + COPY_H - bankH - 1;

    // Fill bg
    doc.setFillColor(...C.bgBank);
    doc.rect(innerX, bankY, innerW, bankH, "F");

    // Top border (2px #0d3822)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.5);
    doc.line(innerX, bankY, innerX + innerW, bankY);

    // "For Bank's Use Only:" label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(...C.amberDark);
    doc.text("For Bank's Use Only:", innerX + 1.5, bankY + 4);

    // Fields
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.setTextColor(...C.textDark);
    doc.text("Challan No: ______________________", innerX + 1.5, bankY + 8);
    doc.text("Date: _____________________________", innerX + 1.5, bankY + 11.5);
    doc.text(
      `Amount: Rs. ${copy.taxPayable.totalPayable.toLocaleString()}`,
      innerX + 1.5,
      bankY + 15
    );

    // Dashed stamp / signature box
    doc.setDrawColor(...C.borderDark);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(innerX + 1, bankY + 16.5, innerW - 2, 6);
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4);
    doc.setTextColor(120, 113, 108); // #78716c
    doc.text("Bank Officer's Signature & Bank Stamp", innerX + innerW / 2, bankY + 20.2, {
      align: "center"
    });

    // SHA-256 integrity footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(3.5);
    doc.setTextColor(...C.textMuted);
    const hashSlice = challan.officialSha256 ? challan.officialSha256.slice(0, 16) : "AUTHENTIC";
    doc.text(
      `SHA-256: ${hashSlice}\u2026 \u2022 PTAS Punjab \u2022 Rule 9`,
      innerX + innerW / 2,
      MARGIN_TOP + COPY_H - 0.5,
      { align: "center" }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // Perforated cut line between copies (not after last copy)
    // ══════════════════════════════════════════════════════════════════════════
    if (copyIdx < 2) {
      const cutX = colX + COPY_W + GAP / 2;
      doc.setDrawColor(...C.textMuted);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(cutX, MARGIN_TOP, cutX, MARGIN_TOP + COPY_H);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.setTextColor(...C.textMuted);
      doc.text("\u2702 CUT", cutX, MARGIN_TOP + COPY_H / 2, { angle: 90, align: "center" });
    }
  }

  return doc;
}

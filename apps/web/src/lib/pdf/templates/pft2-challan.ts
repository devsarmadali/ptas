/**
 * Form P.F.T - 2: Official Statutory Payment Instrument (Rule 9)
 *
 * Professional Tax Administration System (PTAS) - Government of the Punjab
 *
 * Professional, government-style THREE-COPY payment challan (A4 Landscape: 297mm x 210mm).
 * Properly fills the A4 landscape sheet vertically with uniform 8mm top/bottom margins,
 * allocating major space to prominent upper content (large legal name, class, address,
 * taxes) while keeping the bank counterfoil compact and practical.
 *
 * Features:
 *   1. Authority Header & Vector QR Code (left) with Security Code elegantly placed below QR
 *   2. Clean Identification Grid (Notice No, PIN, Demand No, District, Tax Year, Issue Date, Due Date)
 *      with no mock tax unit circles and no text collisions
 *   3. Prominent Taxpayer Details with large bold typography and multiline support
 *   4. Prominent Detail of Tax Payable table with large bold totals (12pt) + Amount in Words
 *   5. Compact, practical "For Bank's Use Only" statutory counterfoil
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
import { cleanCircleName } from "../../statutory-forms";
import { generateDocumentPin } from "@ptas/domain";

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
    // SECTION 1 — TOP HEADER ROW, QR CODE & SECURITY CODE (BELOW QR)
    // ══════════════════════════════════════════════════════════════════════════
    const QR_SIZE = 22.0;
    const qrX = innerX + 0.5;
    const qrY = curY + 1.2;

    // Render crisp vector QR image (quiet space preserved)
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR_SIZE, QR_SIZE);

    // Security PIN Box Elegantly Positioned Below QR Code (Number Only)
    const secBoxY = qrY + QR_SIZE + 1.0;
    const secBoxW = QR_SIZE;
    const secBoxH = 6.2;
    doc.setFillColor(...C.blueBadgeBg);
    doc.setDrawColor(...C.blueBadgeBorder);
    doc.setLineWidth(0.2);
    doc.roundedRect(qrX, secBoxY, secBoxW, secBoxH, 0.6, 0.6, "FD");

    const secCode =
      copy.securityCode && /^\d{6}$/.test(copy.securityCode)
        ? copy.securityCode
        : copy.pin && /^\d{6}$/.test(copy.pin)
          ? copy.pin
          : generateDocumentPin(
              copy.noticeNumber ||
                copy.assessmentInfo?.demandNo ||
                copy.pin ||
                challan.pin ||
                copy.qrPayload
            );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.0);
    doc.setTextColor(...C.blueDeep);
    doc.text(secCode, qrX + secBoxW / 2, secBoxY + 4.3, { align: "center" });

    // Right region: Centered authority header
    const deptX = innerX + QR_SIZE + 2.5;
    const deptW = innerW - QR_SIZE - 3.0;
    const deptCX = deptX + deptW / 2;

    // 1. Copy Title Badge (Pill)
    const badgeText = copy.copyTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    const badgeW = Math.min(deptW - 1, doc.getTextWidth(badgeText) + 8);
    const badgeX = deptCX - badgeW / 2;
    doc.setFillColor(...C.primaryBg);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, curY + 0.8, badgeW, 4.4, 0.6, 0.6, "FD");
    doc.setTextColor(...C.primaryLight);
    doc.text(badgeText, deptCX, curY + 4.1, { align: "center" });

    // 2. GOVERNMENT OF THE PUNJAB
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.0);
    doc.setTextColor(...C.primary);
    doc.text("GOVERNMENT OF THE PUNJAB", deptCX, curY + 9.0, { align: "center" });

    // 3. EXCISE & TAXATION DEPARTMENT
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...C.textDark);
    doc.text("EXCISE & TAXATION DEPARTMENT", deptCX, curY + 12.6, { align: "center" });

    // 4. PUNJAB PROFESSIONS & TRADES TAX
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C.textDark);
    doc.text("PUNJAB PROFESSIONS & TRADES TAX", deptCX, curY + 16.0, { align: "center" });

    // 5. PFT2 • PAYMENT CHALLAN
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.0);
    doc.setTextColor(...C.primary);
    doc.text("PFT2 \u2022 PAYMENT CHALLAN", deptCX, curY + 19.8, { align: "center" });

    const isProvisional = Boolean(
      copy.isProvisional ||
      challan.isProvisional ||
      copy.pft2TypeLabel === "PROVISIONAL" ||
      challan.pft2TypeLabel === "PROVISIONAL" ||
      copy.assessmentInfo?.demandNo?.startsWith("POT-") ||
      challan.copies?.[0]?.assessmentInfo?.demandNo?.startsWith("POT-") ||
      copy.pin?.startsWith("Potential-") ||
      challan.pin?.startsWith("Potential-") ||
      copy.taxpayerInfo?.provincialUin?.startsWith("Potential-")
    );
    const rawScope = cleanChallanScope(copy.pft2TypeLabel || copy.demandScope || "CURRENT");
    const cleanScope = rawScope.includes("PROVISIONAL")
      ? rawScope
      : isProvisional
        ? `PROVISIONAL \u2014 ${rawScope}`
        : rawScope;
    const scopeColor = cleanScope.includes("ARREAR")
      ? C.amber
      : cleanScope.includes("COMBINED")
        ? C.blueDeep
        : C.primaryLight;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...scopeColor);
    doc.text(`Rule 9 \u2022 [${cleanScope}]`, deptCX, curY + 23.4, { align: "center" });

    // 7. Head of Account
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...C.amber);
    const rawHead = copy.headOfAccount || "B01601 (Punjab Professional Tax)";
    const cleanHead = rawHead.replace(/\s*-\s*Provincial|\s*\(Provincial\)/gi, "").trim();
    const headText = `Head: ${cleanHead}`;
    const headLines = doc.splitTextToSize(headText, deptW - 1);
    doc.text(headLines[0] ?? headText, deptCX, curY + 26.8, { align: "center" });

    curY += 32.0;

    // Header divider line (green)
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, curY, innerX + innerW, curY);
    curY += 2.0;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — IDENTIFICATION & ADMINISTRATIVE GRID (SPACIOUS, ZERO COLLISION)
    // Notice No, PIN, Demand No + Tax Year, District + Tehsil, Circle, Locality + Issue Date, Due Date
    // ══════════════════════════════════════════════════════════════════════════
    const META_ROW_H = 4.8;
    const DUE_ROW_H = 5.6;
    const metaBoxH = 6 * META_ROW_H + DUE_ROW_H;

    doc.setFillColor(...C.bgMeta);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX, curY, innerW, metaBoxH, 0.6, 0.6, "FD");

    let mY = curY;
    const metaL = innerX + 1.8;
    const metaMid = innerX + 44.0;
    const metaR = innerX + innerW - 1.8;
    const LABEL_FS = 6.8;
    const leftLabelW = 20.0;

    // Row 0: Notice No (Full Width)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("NOTICE NO.", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C.blueDeep);
    const noticeText = copy.noticeNumber ?? challan.noticeNumber;
    doc.text(noticeText, metaL + leftLabelW, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Row 1: PIN (Dedicated Full Width Row)
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("PIN", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...C.blueRef);
    const pinVal = copy.taxpayerInfo.provincialUin || copy.pin || challan.pin;
    doc.text(pinVal, metaL + leftLabelW, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Row 2: Demand Number | Tax Year
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DEMAND NO.", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...C.primaryLight);
    doc.text(copy.assessmentInfo.demandNo, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("TAX YEAR", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    doc.text(formatChallanTaxYear(copy.taxYear), metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 3: District | Tehsil Grid
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("DISTRICT", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text(copy.district || "Vehari", metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.text("TEHSIL", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    const displayTehsil = copy.tehsil || copy.assessmentInfo.tehsil || "Vehari";
    doc.text(displayTehsil, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 4: Circle Name (Spacious Row)
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("CIRCLE", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.primaryLight);
    const circleText = cleanCircleName(copy.assessmentInfo.circleName || copy.circleName);
    doc.text(circleText, metaL + leftLabelW, mY + META_ROW_H * 0.72);
    mY += META_ROW_H;

    // Row 5: Locality | Issue Date
    doc.setDrawColor(...C.borderLight);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(metaL, mY, metaR, mY);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("LOCALITY", metaL, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.textDark);
    const localityText =
      copy.locality ||
      copy.assessmentInfo.locality ||
      copy.taxpayerInfo.address.split(",")[0] ||
      "City Zone";
    const locLines = doc.splitTextToSize(localityText, metaMid - metaL - leftLabelW - 1.0);
    doc.text(locLines[0] ?? localityText, metaL + leftLabelW, mY + META_ROW_H * 0.72);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_FS);
    doc.setTextColor(...C.textDark);
    doc.text("ISSUE DATE", metaMid, mY + META_ROW_H * 0.72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    const displayIssue = formatChallanDisplayDate(
      copy.issueDate || (challan as { issueDate?: string }).issueDate || "2026-07-01"
    );
    doc.text(displayIssue, metaR, mY + META_ROW_H * 0.72, { align: "right" });
    mY += META_ROW_H;

    // Row 6: Due Date (Prominent Red Callout Row)
    doc.setFillColor(...C.redBg);
    doc.rect(innerX + 0.2, mY, innerW - 0.4, DUE_ROW_H - 0.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.red);
    doc.text("STATUTORY DUE DATE", metaL, mY + DUE_ROW_H * 0.7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.0);
    doc.text(formatChallanDisplayDate(copy.dueDate), metaR, mY + DUE_ROW_H * 0.7, {
      align: "right"
    });

    curY += metaBoxH + 2.5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — TAXPAYER DETAILS (PROMINENT, LARGE TYPOGRAPHY, ZERO CLIPPING)
    // ══════════════════════════════════════════════════════════════════════════
    const labelColW = 34.0;
    const valColX = innerX + labelColW + 1.5;
    const valColW = innerW - (labelColW + 2.5);

    // Row 1: LEGAL NAME (Large, Prominent 10pt)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...C.textDark);
    doc.text("LEGAL NAME:", innerX + 1.0, curY + 3.4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.0);
    doc.setTextColor(...C.textDark);
    const legalNameLines = doc.splitTextToSize(copy.taxpayerInfo.legalName, valColW);
    doc.text(legalNameLines[0] ?? "", valColX, curY + 3.4);
    if (legalNameLines.length > 1) {
      curY += 4.0;
      doc.text(legalNameLines[1] ?? "", valColX, curY + 3.4);
    }
    curY += 5.0;

    // Row 2: TAXPAYER / PROPRIETOR (Bold 8.8pt)
    const tradeVal = copy.taxpayerInfo.tradeName || copy.taxpayerInfo.legalName;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.textDark);
    doc.text("TAXPAYER / PROPRIETOR:", innerX + 1.0, curY + 3.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.8);
    doc.setTextColor(...C.blueDeep);
    const tradeLines = doc.splitTextToSize(tradeVal, valColW);
    doc.text(tradeLines[0] ?? "", valColX, curY + 3.2);
    if (tradeLines.length > 1) {
      curY += 3.8;
      doc.text(tradeLines[1] ?? "", valColX, curY + 3.2);
    }
    curY += 4.8;

    // Row 3: CLASS (Full Width Available, No Redundant Slab Amount Label)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.textDark);
    doc.text("CLASS:", innerX + 1.0, curY + 3.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const classVal =
      copy.taxpayerInfo.classification?.replace(/Class undefined/gi, "Class 1") ||
      "Class 1 - Companies";
    const classLines = doc.splitTextToSize(classVal, valColW);
    doc.text(classLines[0] ?? classVal, valColX, curY + 3.2);
    if (classLines.length > 1) {
      curY += 3.8;
      doc.text(classLines[1] ?? "", valColX, curY + 3.2);
      if (classLines.length > 2) {
        curY += 3.6;
        doc.text(classLines[2] ?? "", valColX, curY + 3.2);
      }
    }
    curY += 4.6;

    // Row 3b: SUB-CLASS (Sub-Classification Code & Description)
    const subCode = copy.taxpayerInfo.subclassificationCode;
    const subLabel = copy.taxpayerInfo.subclassificationLabel;
    const tertiary = copy.taxpayerInfo.tertiarySlab;
    const subClassText = (() => {
      const sCode = subCode?.trim();
      const sLabel = subLabel?.trim();
      const tert = tertiary?.trim();
      if (sCode && sCode !== "1" && sCode !== "undefined") {
        return `Code ${sCode}${sLabel ? ` \u2014 ${sLabel}` : ""}${tert ? ` (${tert})` : ""}`;
      }
      if (sLabel && sLabel !== "1") {
        return `${sLabel}${tert ? ` (${tert})` : ""}`;
      }
      return tert || "General / Standard Class";
    })();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.textDark);
    doc.text("SUB-CLASS:", innerX + 1.0, curY + 3.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C.primaryLight);
    const subLines = doc.splitTextToSize(subClassText, valColW);
    doc.text(subLines[0] ?? subClassText, valColX, curY + 3.2);
    if (subLines.length > 1) {
      curY += 3.6;
      doc.text(subLines[1] ?? "", valColX, curY + 3.2);
    }
    curY += 4.6;

    // Row 4: ADDRESS (Readable 8.0pt)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.textDark);
    doc.text("ADDRESS:", innerX + 1.0, curY + 3.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.0);
    doc.setTextColor(...C.textMid);
    const addrLines = doc.splitTextToSize(copy.taxpayerInfo.address, valColW);
    doc.text(addrLines[0] ?? "", valColX, curY + 3.2);
    if (addrLines.length > 1) {
      curY += 3.8;
      doc.text(addrLines[1] ?? "", valColX, curY + 3.2);
    }
    curY += 5.2;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — DETAIL OF TAX PAYABLE TABLE (LARGE FONTS, ACCOUNTING GRADE)
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...C.primary);
    doc.text("DETAIL OF TAX PAYABLE", innerX + 1.0, curY + 2.8);
    curY += 4.0;

    const tblL = innerX;
    const tblR = innerX + innerW;
    const tblW = innerW;
    const ROW_H = 5.8;

    const tableData: {
      label: string;
      value: string;
      bold?: boolean;
      total?: boolean;
      amber?: boolean;
    }[] = [
      { label: "Current Tax Demand", value: `Rs. ${copy.taxPayable.currentTax.toLocaleString()}` },
      { label: "Prior Year Arrears", value: `Rs. ${copy.taxPayable.arrears.toLocaleString()}` },
      {
        label: "Late Surcharge / Penalty",
        value: `Rs. ${copy.taxPayable.penalty.toLocaleString()}`
      },
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

    const tableH = (tableData.length - 1) * ROW_H + 8.2;
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.2);
    doc.rect(tblL, curY, tblW, tableH);

    let tRowY = curY;
    tableData.forEach((row, idx) => {
      const thisRowH = row.total ? 8.2 : ROW_H;
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
      doc.setFontSize(row.total ? 9.5 : 7.8);
      doc.setTextColor(...(row.total ? C.primaryLight : row.amber ? C.amberText : C.textDark));
      doc.text(row.label, tblL + 2.5, tRowY + thisRowH * 0.68);

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.total ? 12.0 : 8.5);
      doc.text(row.value, tblR - 2.5, tRowY + thisRowH * 0.68, { align: "right" });

      tRowY += thisRowH;
    });

    curY += tableH + 1.8;

    // Amount in Words (Prominent Mint Callout Box with Larger 8.4pt Bold Text)
    const wordsH = 7.2;
    doc.setFillColor(...C.primaryMint);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(tblL, curY, tblW, wordsH, 0.6, 0.6, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.0);
    doc.setTextColor(...C.primary);
    doc.text("Amount in Words:", tblL + 2.0, curY + 4.6);

    const prefixW = doc.getTextWidth("Amount in Words:") + 2.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(...C.blueDeep);
    const wordsText = copy.taxPayable.totalPayableWords;
    const wordsLines = doc.splitTextToSize(wordsText, tblW - prefixW - 3.5);
    doc.text(wordsLines[0] ?? wordsText, tblL + 2.0 + prefixW, curY + 4.6);
    if (wordsLines.length > 1) {
      curY += 3.8;
      doc.text(wordsLines[1] ?? "", tblL + 2.0 + prefixW, curY + 4.6);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — FOR BANK'S USE ONLY (COMPACT, PRACTICAL STATUTORY COUNTERFOIL)
    // Anchored at bottom of card with standard practical height
    // ══════════════════════════════════════════════════════════════════════════
    const BANK_H = 26.0;
    const bankY = innerBottom - BANK_H;

    doc.setFillColor(...C.bgBank);
    doc.setDrawColor(...C.borderMed);
    doc.setLineWidth(0.25);
    doc.roundedRect(innerX, bankY, innerW, BANK_H, 0.6, 0.6, "FD");

    // Top primary accent bar
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.35);
    doc.line(innerX, bankY, innerX + innerW, bankY);

    // Header bar (amber-tinted)
    const headerBarH = 3.6;
    doc.setFillColor(...C.amberBg);
    doc.rect(innerX, bankY + 0.2, innerW, headerBarH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...C.amberDark);
    doc.text("FOR BANK'S USE ONLY \u2022 Rule 9 Statutory Counterfoil", innerX + 2.0, bankY + 2.6);

    // Left Pane: Operational inputs and amount callout
    const bLeftW = 49.0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textDark);

    // Row 1: Bank & Branch
    doc.text("Bank / Branch: __________________________", innerX + 2.0, bankY + 7.5);

    // Row 2: Scroll No & Deposit Date
    doc.text("Scroll No.: _________ Payment Date: _______", innerX + 2.0, bankY + 11.5);

    // Row 3: Amount Received Callout Pill
    const amtPillH = 4.8;
    doc.setFillColor(...C.primaryMint);
    doc.setDrawColor(...C.primaryLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(innerX + 1.5, bankY + 14.0, bLeftW - 3.0, amtPillH, 0.5, 0.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.primary);
    doc.text(
      `Amount: Rs. ${copy.taxPayable.totalPayable.toLocaleString()} /-`,
      innerX + (bLeftW - 3.0) / 2 + 1.5,
      bankY + 17.4,
      { align: "center" }
    );

    // Row 4: Mode of Payment
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(...C.textMid);
    doc.text("Mode: [  ] Cash   [  ] Cheque / Pay Order", innerX + 2.0, bankY + 22.8);

    // Right Pane: Cashier Signature & Stamp Box
    const stampX = innerX + bLeftW + 1.2;
    const stampW = innerW - bLeftW - 2.4;
    const stampY = bankY + headerBarH + 1.0;
    const stampH = BANK_H - headerBarH - 2.0;

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.borderDark);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.roundedRect(stampX, stampY, stampW, stampH, 0.5, 0.5, "FD");
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.6);
    doc.setTextColor(...C.textDark);
    doc.text("Authorized Cashier", stampX + stampW / 2, stampY + stampH - 4.2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.0);
    doc.setTextColor(...C.textMuted);
    doc.text("Signature & Stamp", stampX + stampW / 2, stampY + stampH - 1.6, { align: "center" });

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

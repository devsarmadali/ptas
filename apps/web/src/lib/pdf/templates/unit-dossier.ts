/**
 * Taxpayer Unit Official Dossier
 * Comprehensive dossier containing unit registration particulars, statutory classification,
 * prescribed rates, financial standing, append-only ledger history, and compliance status.
 *
 * Implements authoritative Punjab Government layout with:
 * - Master registration & business entity particulars
 * - Detailed statutory classification, sub-classes, schedule entry & tariff rates
 * - Current financial standing & compliance status banner
 * - Append-only demand and payment ledger (Rule 11)
 * - Vector QR verification code with Security Code badge
 * - Assessing authority signature and jurisdiction seal
 */

import { jsPDF } from "jspdf";
import {
  createBasePdf,
  generateQrDataUrl,
  PDF_COLORS,
  renderDocumentHeader,
  renderDocumentFooters,
  renderPaginatedTable
} from "../base-document";
import type { DocumentGenerationOptions, UnitDossierData } from "../types";
import { computeUnitFinancialSummary, getScheduleEntryLabel } from "../../statutory-forms";
import type { DemandLedgerEntry } from "@ptas/domain";

export async function generateUnitDossierPdf(
  data: UnitDossierData,
  options?: DocumentGenerationOptions | undefined
): Promise<jsPDF> {
  const { unit } = data;
  const doc = createBasePdf({
    orientation: "portrait",
    title: `Taxpayer Unit Dossier - ${unit.demandUnit?.permanentDemandNo || unit.id}`,
    subject: "Official Taxpayer Unit Dossier and Statutory Assessment History",
    isProvisional: options?.isProvisional
  });

  const pageWidth = 210;
  const left = 14;
  const contentWidth = pageWidth - 28; // 182mm

  const district = unit.districtName || "Vehari";
  const circle = unit.circleName || "Circle-I";

  let curY = renderDocumentHeader(doc, {
    docTitle: "TAXPAYER DOSSIER & ASSESSMENT HISTORY",
    docSubtitle: "OFFICIAL REGISTRATION, STATUTORY CLASSIFICATION & DEMAND LEDGER DOSSIER",
    statutoryRuleReference:
      "(Excise, Taxation & Narcotics Control Department, Government of the Punjab)",
    district,
    circle,
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — MASTER REGISTRATION PARTICULARS
  // ══════════════════════════════════════════════════════════════════════════
  const regBoxH = 34.0;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.roundedRect(left, curY, contentWidth, regBoxH, 1, 1, "FD");

  // Section Banner Header
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("1. MASTER REGISTRATION & JURISDICTION PARTICULARS", left + 4, curY + 4.2);

  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.textDark);

  // Row 1: Legal Name & Demand Number (PDN)
  let rY = curY + 10.2;
  doc.setFont("helvetica", "bold");
  doc.text("Legal Name:", left + 4, rY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(unit.legalName, left + 28, rY);

  doc.setFontSize(7.6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text("Demand No (PDN):", left + 105, rY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.setTextColor(...PDF_COLORS.primary);
  const pdnText = unit.demandUnit?.permanentDemandNo || unit.demandNumber || "Unallocated";
  doc.text(pdnText, left + 138, rY);

  // Row 2: Trade Name / Proprietor & Provincial PIN
  rY += 5.4;
  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Taxpayer / Trade:", left + 4, rY);
  doc.setFont("helvetica", "normal");
  doc.text(unit.tradeName || unit.legalName, left + 28, rY);

  doc.setFont("helvetica", "bold");
  doc.text("Provincial PIN:", left + 105, rY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 138); // blue
  doc.text(unit.provincialUin || unit.pinNumber || "Pending", left + 138, rY);

  // Row 3: Identifier & Security Code
  rY += 5.4;
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Identifier (CNIC/NTN):", left + 4, rY);
  doc.setFont("helvetica", "normal");
  doc.text(`${unit.identifierType}: ${unit.identifierValue}`, left + 36, rY);

  doc.setFont("helvetica", "bold");
  doc.text("Security Code:", left + 105, rY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 105, 161);
  doc.text(unit.pinNumber || "—", left + 138, rY);

  // Row 4: Commercial Address & Locality / Jurisdiction
  rY += 5.4;
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Address:", left + 4, rY);
  doc.setFont("helvetica", "normal");
  const fullAddress = `${unit.address || "Not Specified"}${unit.locality ? ` • Locality: ${unit.locality}` : ""}`;
  const addressLines = doc.splitTextToSize(fullAddress, 72);
  doc.text(addressLines[0] ?? "", left + 28, rY);

  doc.setFont("helvetica", "bold");
  doc.text("Jurisdiction:", left + 105, rY);
  doc.setFont("helvetica", "normal");
  doc.text(`${circle} • District ${district}`, left + 138, rY);

  curY += regBoxH + 3.5;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — STATUTORY CLASSIFICATION & APPLICABLE TARIFF (RULE PACK V3)
  // Dedicated structured rows with generous horizontal clearance
  // ══════════════════════════════════════════════════════════════════════════
  const classBoxH = 36.0;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.roundedRect(left, curY, contentWidth, classBoxH, 1, 1, "FD");

  // Section Banner Header
  doc.setFillColor(...PDF_COLORS.bgHeader);
  doc.rect(left, curY, contentWidth, 5.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(
    "2. STATUTORY CLASSIFICATION & PRESCRIBED TARIFF (PUNJAB FINANCE ACT 1977)",
    left + 4,
    curY + 4.2
  );

  let cY = curY + 10.0;
  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.textDark);

  // Row 1: Schedule Entry (Left) | Prescribed Rate (Right)
  doc.setFont("helvetica", "bold");
  doc.text("Schedule Entry:", left + 4, cY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  const schedEntry = getScheduleEntryLabel(unit.statutoryRule);
  doc.text(schedEntry, left + 28, cY);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Prescribed Rate:", left + 105, cY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PKR ${unit.statutoryRule.annual_rate_pkr.toLocaleString()} /-`, left + 135, cY);

  // Row 2: Category (Full Width)
  cY += 5.0;
  doc.setFontSize(7.6);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Category:", left + 4, cY);
  doc.setFont("helvetica", "normal");
  const catText = unit.statutoryRule.category || "Commercial Establishment";
  const catLines = doc.splitTextToSize(catText, contentWidth - 32);
  doc.text(catLines[0] ?? catText, left + 28, cY);

  // Row 3: Sub-Classification (Full Width)
  cY += 5.0;
  doc.setFont("helvetica", "bold");
  doc.text("Sub-Class:", left + 4, cY);
  doc.setFont("helvetica", "normal");
  const subCode = unit.statutoryRule.subclassification_code;
  const subLabel = unit.statutoryRule.subclassification_label;
  const subText = subCode
    ? `${subCode}${subLabel ? ` — ${subLabel}` : ""}`
    : "Standard / Non-subdivided Class";
  const subLines = doc.splitTextToSize(subText, contentWidth - 32);
  doc.text(subLines[0] ?? subText, left + 28, cY);

  // Row 4: Tertiary Slab (Left) | Rate Basis (Right)
  cY += 5.0;
  doc.setFont("helvetica", "bold");
  doc.text("Tertiary Slab:", left + 4, cY);
  doc.setFont("helvetica", "normal");
  const tertSlab =
    unit.statutoryRule.statutory_tertiary_classification ||
    unit.statutoryTertiaryCode ||
    "Standard Basis";
  doc.text(tertSlab, left + 28, cY);

  doc.setFont("helvetica", "bold");
  doc.text("Rate Basis:", left + 105, cY);
  doc.setFont("helvetica", "normal");
  doc.text(unit.statutoryRule.rate_basis || "Per Establishment / Per Annum", left + 125, cY);

  // Row 5: Full Statutory Description (Full Width)
  cY += 5.0;
  doc.setFont("helvetica", "bold");
  doc.text("Description:", left + 4, cY);
  doc.setFont("helvetica", "normal");
  const fullDesc = unit.statutoryRule.official_text || unit.statutoryRule.category;
  const descLines = doc.splitTextToSize(fullDesc, contentWidth - 32);
  doc.text(descLines[0] ?? "", left + 28, cY);

  curY += classBoxH + 3.5;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — CURRENT FINANCIAL STANDING & COMPLIANCE STATUS
  // ══════════════════════════════════════════════════════════════════════════
  const finSummary = computeUnitFinancialSummary(unit);
  const balance = finSummary.outstandingBalance;

  // 4-Column KPI Metrics Table
  const kpiH = 13.0;
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.rect(left, curY, contentWidth, kpiH, "FD");

  const colW = contentWidth / 4;
  const kpiCols = [
    {
      label: "Assessed Current Tax",
      value: `PKR ${finSummary.assessedCurrentTax.toLocaleString()}`,
      color: PDF_COLORS.primary
    },
    {
      label: "Prior Year Arrears",
      value: `PKR ${finSummary.arrears.toLocaleString()}`,
      color: finSummary.arrears > 0 ? PDF_COLORS.accentGold : PDF_COLORS.textDark
    },
    {
      label: "Total Realized Payments",
      value: `PKR ${finSummary.totalPaid.toLocaleString()}`,
      color: [22, 101, 52] as [number, number, number]
    },
    {
      label: "Net Outstanding Balance",
      value: `PKR ${balance.toLocaleString()}`,
      color: balance > 0 ? PDF_COLORS.danger : PDF_COLORS.primary
    }
  ];

  kpiCols.forEach((col, idx) => {
    const cX = left + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(...PDF_COLORS.borderLight);
      doc.line(cX, curY, cX, curY + kpiH);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(col.label, cX + colW / 2, curY + 4.2, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.setTextColor(...col.color);
    doc.text(col.value, cX + colW / 2, curY + 9.8, { align: "center" });
  });

  curY += kpiH + 1.8;

  // Compliance Status Banner
  const isClear = balance <= 0;
  const statusBg = isClear
    ? ([220, 252, 231] as [number, number, number])
    : ([254, 242, 242] as [number, number, number]);
  const statusBorder = isClear
    ? ([134, 239, 172] as [number, number, number])
    : ([254, 202, 202] as [number, number, number]);
  const statusColor = isClear ? PDF_COLORS.primary : PDF_COLORS.danger;

  doc.setFillColor(...statusBg);
  doc.setDrawColor(...statusBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(left, curY, contentWidth, 6.5, 0.8, 0.8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...statusColor);
  const statusMsg = isClear
    ? "COMPLIANCE STATUS: ZERO OUTSTANDING DUES — TAXPAYER FULLY COMPLIANT"
    : `COMPLIANCE STATUS: DEFAULT / OUTSTANDING STATUTORY DEMAND OF PKR ${balance.toLocaleString()} DUE`;
  doc.text(statusMsg, pageWidth / 2, curY + 4.4, { align: "center" });

  curY += 9.5;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — APPEND-ONLY DEMAND & PAYMENT LEDGER TRANSACTIONS (RULE 11)
  // ══════════════════════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("3. APPEND-ONLY DEMAND & PAYMENT LEDGER TRANSACTIONS (RULE 11)", left, curY);

  curY += 2.5;
  const ledgerColumns = [
    { header: "Effective Date", width: 26, align: "left" as const },
    { header: "Entry Type", width: 34, align: "left" as const },
    { header: "Transaction Ref / Description", width: 72, align: "left" as const },
    { header: "Debit (PKR)", width: 25, align: "right" as const },
    { header: "Credit (PKR)", width: 25, align: "right" as const }
  ];

  const ledgerRows = (unit.ledgerEntries || []).map((entry: DemandLedgerEntry) => {
    const raw = entry as unknown as Record<string, unknown>;
    const effDate =
      (raw.effectiveDate as string) ||
      (raw.postingDate as string) ||
      entry.postedAt?.split("T")[0] ||
      "—";
    const ref =
      (raw.referenceNumber as string) || (raw.reference as string) || entry.id.slice(0, 16);
    const debit = (raw.debitPkr as number | undefined) ?? entry.amount;
    const credit = (raw.creditPkr as number | undefined) ?? Math.abs(entry.amount);
    return [
      effDate,
      entry.entryType,
      ref,
      entry.entryType.includes("DEMAND") || entry.entryType.includes("PENALTY")
        ? debit.toLocaleString()
        : "—",
      entry.entryType.includes("PAYMENT") || entry.entryType.includes("CREDIT")
        ? credit.toLocaleString()
        : "—"
    ];
  });

  curY = renderPaginatedTable(doc, {
    columns: ledgerColumns,
    rows:
      ledgerRows.length > 0
        ? ledgerRows
        : [
            [
              "—",
              "RECORD",
              "No transactional ledger entries posted for this taxpayer unit",
              "—",
              "—"
            ]
          ],
    startY: curY,
    rowHeight: 5.5,
    headerHeight: 6.2
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — VERIFICATION & ASSESSING AUTHORITY CERTIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  curY = Math.max(curY + 6.0, 245.0);

  // Left: Scannable Vector QR Code with Security Code Box
  const qrPayload = `https://ptas.punjab.gov.pk/verify?type=DOSSIER&id=${unit.id}&pdn=${unit.demandUnit?.permanentDemandNo || ""}&pin=${unit.pinNumber || ""}`;
  const qrDataUrl = await generateQrDataUrl(qrPayload);
  const QR_SIZE = 20.0;
  doc.addImage(qrDataUrl, "PNG", left + 2, curY, QR_SIZE, QR_SIZE);

  // Security Code Box below QR
  const secBoxY = curY + QR_SIZE + 1.0;
  const secBoxW = QR_SIZE;
  const secBoxH = 7.5;
  doc.setFillColor(224, 242, 254);
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.2);
  doc.roundedRect(left + 2, secBoxY, secBoxW, secBoxH, 0.6, 0.6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.0);
  doc.setTextColor(3, 105, 161);
  doc.text("SECURITY CODE", left + 2 + secBoxW / 2, secBoxY + 2.5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(30, 58, 138);
  doc.text(unit.pinNumber || "—", left + 2 + secBoxW / 2, secBoxY + 6.2, { align: "center" });

  // Right: Assessing Authority Certification
  const sigX = left + contentWidth - 75;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.setLineWidth(0.3);
  doc.line(sigX, curY + 16, sigX + 70, curY + 16);

  const officerName =
    data.officerName || unit.assessmentVersions[0]?.approvedBy || "Assessing Authority";
  const officerTitle = data.officerTitle || "Excise & Taxation Officer / Assessing Authority";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(officerName, sigX + 35, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(officerTitle, sigX + 35, curY + 24, { align: "center" });
  doc.text(`District ${district}, Government of the Punjab`, sigX + 35, curY + 27.5, {
    align: "center"
  });

  renderDocumentFooters(doc, {
    officialSha256: data.officialSha256,
    pin: unit.pinNumber,
    docNumber: unit.demandUnit?.permanentDemandNo || unit.id,
    isProvisional: options?.isProvisional
  });

  return doc;
}

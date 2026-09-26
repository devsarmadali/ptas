/**
 * Taxpayer Unit Official Dossier
 * Comprehensive dossier containing unit registration particulars, statutory assessments,
 * append-only ledger history, and compliance status.
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
import { computeLedgerBalance } from "../../statutory-forms";
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
  const contentWidth = pageWidth - 28;

  let curY = renderDocumentHeader(doc, {
    docTitle: "TAXPAYER DOSSIER & ASSESSMENT HISTORY",
    docSubtitle: "OFFICIAL REGISTRATION, ASSESSMENT & DEMAND LEDGER DOSSIER",
    statutoryRuleReference: "(Excise & Taxation Department, Government of the Punjab)",
    district: "Vehari",
    circle: "Circle-Vehari",
    financialYear: "2026-2027",
    isProvisional: options?.isProvisional
  });

  // Master Record Box
  doc.setFillColor(...PDF_COLORS.bgLight);
  doc.setDrawColor(...PDF_COLORS.borderLight);
  doc.setLineWidth(0.25);
  doc.rect(left, curY, contentWidth, 32, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("MASTER REGISTRATION PARTICULARS", left + 4, curY + 5.5);

  doc.setFontSize(7.8);
  doc.setTextColor(...PDF_COLORS.textDark);

  doc.text("Legal Name:", left + 4, curY + 11);
  doc.setFont("helvetica", "normal");
  doc.text(unit.legalName, left + 28, curY + 11);

  if (unit.tradeName) {
    doc.setFont("helvetica", "bold");
    doc.text("Trade Name:", left + 100, curY + 11);
    doc.setFont("helvetica", "normal");
    doc.text(unit.tradeName, left + 122, curY + 11);
  }

  doc.setFont("helvetica", "bold");
  doc.text("CNIC / NTN:", left + 4, curY + 16.5);
  doc.setFont("helvetica", "normal");
  doc.text(`${unit.identifierType}: ${unit.identifierValue}`, left + 28, curY + 16.5);

  doc.setFont("helvetica", "bold");
  doc.text("Permanent Demand No:", left + 100, curY + 16.5);
  doc.setFont("helvetica", "normal");
  doc.text(unit.demandUnit?.permanentDemandNo || "Unallocated", left + 140, curY + 16.5);

  doc.setFont("helvetica", "bold");
  doc.text("Provincial UIN:", left + 4, curY + 22);
  doc.setFont("helvetica", "normal");
  doc.text(unit.provincialUin || "Pending", left + 28, curY + 22);

  doc.setFont("helvetica", "bold");
  doc.text("Security PIN:", left + 100, curY + 22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`🔒 ${unit.pinNumber || "68000000"}`, left + 140, curY + 22);

  doc.setTextColor(...PDF_COLORS.textDark);
  doc.setFont("helvetica", "bold");
  doc.text("Address:", left + 4, curY + 27.5);
  doc.setFont("helvetica", "normal");
  doc.text(unit.address || "Not Specified", left + 28, curY + 27.5, {
    maxWidth: contentWidth - 32
  });

  // Ledger Summary Banner
  curY += 36;
  const balance = computeLedgerBalance(unit.ledgerEntries || []);
  const balanceStatusColor = balance <= 0 ? PDF_COLORS.primary : PDF_COLORS.danger;
  const balanceStatusBg =
    balance <= 0
      ? ([240, 253, 244] as [number, number, number])
      : ([254, 242, 242] as [number, number, number]);

  doc.setFillColor(...balanceStatusBg);
  doc.setDrawColor(...balanceStatusColor);
  doc.setLineWidth(0.35);
  doc.rect(left, curY, contentWidth, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...balanceStatusColor);
  const statusMsg =
    balance <= 0
      ? "LEDGER STATUS: CLEAR / NO OUTSTANDING ARREARS"
      : `LEDGER STATUS: OUTSTANDING BALANCE OF PKR ${balance.toLocaleString()}`;
  doc.text(statusMsg, pageWidth / 2, curY + 5.5, { align: "center" });

  // Append-only Ledger History Table
  curY += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("APPEND-ONLY DEMAND & PAYMENT LEDGER TRANSACTIONS:", left, curY);

  curY += 3;
  const ledgerColumns = [
    { header: "Date", width: 28, align: "left" as const },
    { header: "Type", width: 34, align: "left" as const },
    { header: "Description / Ref", width: 70, align: "left" as const },
    { header: "Debit", width: 25, align: "right" as const },
    { header: "Credit", width: 25, align: "right" as const }
  ];

  const ledgerRows = (unit.ledgerEntries || []).map((entry: DemandLedgerEntry) => {
    const raw = entry as unknown as Record<string, unknown>;
    const effDate =
      (raw.effectiveDate as string) ||
      (raw.postingDate as string) ||
      entry.postedAt?.split("T")[0] ||
      "2026-08-01";
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
        : "-",
      entry.entryType.includes("PAYMENT") || entry.entryType.includes("CREDIT")
        ? credit.toLocaleString()
        : "-"
    ];
  });

  curY = renderPaginatedTable(doc, {
    columns: ledgerColumns,
    rows:
      ledgerRows.length > 0
        ? ledgerRows
        : [["2026-08-01", "INITIAL_DEMAND", "Annual Assessment", "10,000", "-"]],
    startY: curY,
    rowHeight: 6,
    headerHeight: 6.5
  });

  // QR Code & Verification Signature Block
  curY += 10;
  const qrPayload = `https://ptas.punjab.gov.pk/verify?type=DOSSIER&id=${unit.id}&pdn=${unit.demandUnit?.permanentDemandNo || ""}&pin=${unit.pinNumber || ""}`;
  const qrDataUrl = await generateQrDataUrl(qrPayload);
  doc.addImage(qrDataUrl, "PNG", left + 4, curY, 22, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(`PIN: ${unit.pinNumber || "68000000"}`, left + 15, curY + 26, { align: "center" });

  const sigX = left + contentWidth - 65;
  doc.setDrawColor(...PDF_COLORS.borderDark);
  doc.line(sigX, curY + 16, sigX + 60, curY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textDark);
  doc.text(data.officerName || "Tariq Mahmood", sigX + 30, curY + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    data.officerTitle || "Excise & Taxation Officer / Assessing Authority",
    sigX + 30,
    curY + 24,
    { align: "center" }
  );
  doc.text("District Vehari", sigX + 30, curY + 27.5, { align: "center" });

  renderDocumentFooters(doc, {
    officialSha256: data.officialSha256,
    pin: unit.pinNumber,
    docNumber: unit.demandUnit?.permanentDemandNo || unit.id,
    isProvisional: options?.isProvisional
  });

  return doc;
}

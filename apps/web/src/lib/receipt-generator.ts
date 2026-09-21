/**
 * Statutory Receipt Generator & PFT-2 Challan Lifecycle Utilities for PTAS
 * Implements official Punjab Professions & Trades Tax Rules, 1977
 * Rule 9 (Challan Form P.F.T-2), Rule 10 (Receipt of Payment), and Treasury Scroll Verification.
 */

import { computeContentSha256, generateDocumentPin } from "@ptas/domain";
import type { Pft2ChallanRecord, StatutoryReceiptRecord } from "./pilot-store";
import { numberToWordsPkr, formatStandardDocNumber, formatDemandNumber } from "./statutory-forms";

export function generateStandardReceiptNumber(sequence: number | string): string {
  return formatStandardDocNumber({ docCode: "RCPT", sequence });
}

export function generateStandardPft2Number(sequence: number | string): string {
  return formatStandardDocNumber({ docCode: "PFT2", sequence });
}

export interface StatutoryReceiptDocument {
  readonly receiptNumber: string;
  readonly pin: string;
  readonly provincialUin?: string | undefined;
  readonly challanNumber: string;
  readonly demandNumber: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly identifier: string;
  readonly address: string;
  readonly statutoryCategory: string;
  readonly subclassificationCode: string | null;
  readonly tertiarySlab: string | null;
  readonly amountPaid: number;
  readonly amountPaidWords: string;
  readonly dateOfReceipt: string;
  readonly timeOfReceipt: string;
  readonly paymentChannel: string;
  readonly bankBranch: string;
  readonly bankScrollRef: string;
  readonly receivingOfficerName: string;
  readonly receivingOfficerTitle: string;
  readonly canonicalReceiptText: string;
  readonly officialSha256: string;
  readonly qrPayload: string;
}

/**
 * Builds the canonical statutory document model for an official Government of Punjab Payment Receipt.
 */
export function buildStatutoryReceiptDocument(
  record: StatutoryReceiptRecord
): StatutoryReceiptDocument {
  const pin = record.pin || generateDocumentPin(record.receiptNumber);
  const amountWords = record.amountPaidWords || numberToWordsPkr(record.amountPaidPkr);
  const identifier = `${record.identifierType}: ${record.identifierValue}`;
  const branch = record.bankBranch ?? "Main Treasury Branch, Vehari";
  const demandClean = formatDemandNumber(record.demandNumber);

  const entryLabel = record.subclassificationCode
    ? `Class ${record.subclassificationCode}`
    : `Class ${record.statutoryCategory}`;
  const tertiaryLabel = record.tertiarySlab ? ` (Slab: ${record.tertiarySlab})` : "";

  const canonicalReceiptText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE, TAXATION & NARCOTICS CONTROL DEPARTMENT",
    "OFFICE OF THE EXCISE & TAXATION OFFICER (ASSESSING AUTHORITY), CIRCLE-VEHARI",
    "STATUTORY PAYMENT RECEIPT / ACKNOWLEDGEMENT OF PROFESSIONAL TAX",
    `(Issued under Rule 10 of the Punjab Professions & Trades Tax Rules, 1977)`,
    `Receipt Number: ${record.receiptNumber} | Security PIN: ${pin} | Date: ${record.dateOfReceipt} ${record.timeOfReceipt}`,
    `Associated Challan Form P.F.T-2: ${record.challanNumber} | Permanent Demand No: ${demandClean}`,
    `Assessee Legal Name: ${record.assesseeLegalName}`,
    `Trade / Business Name: ${record.assesseeTradeName ?? record.assesseeLegalName}`,
    `Registration / Tax Identifier: ${identifier}`,
    `Commercial Address: ${record.address}`,
    `Statutory Classification: ${entryLabel} - ${record.statutoryCategory}${tertiaryLabel}`,
    `Head of Account: B01601 - Punjab Professional Tax (Provincial)`,
    `Amount Discharged: PKR ${record.amountPaidPkr.toLocaleString()} (${amountWords})`,
    `Payment Channel: ${record.paymentChannel} | Branch: ${branch}`,
    `Bank Scroll / CPR Reference: ${record.bankScrollRef}`,
    `Receiving Officer: ${record.receivingOfficerName} (${record.receivingOfficerTitle})`,
    "Statutory Certification: Received and credited to Government of the Punjab Professional Tax Account. Demand ledger updated."
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalReceiptText);
  const qrPayload = `https://ptas.punjab.gov.pk/verify?type=PFT-REC&ref=${record.receiptNumber}&pdn=${demandClean}&amt=${record.amountPaidPkr}&pin=${pin}&sha=${officialSha256.slice(0, 16)}`;

  return {
    receiptNumber: record.receiptNumber,
    pin,
    provincialUin: record.provincialUin,
    challanNumber: record.challanNumber,
    demandNumber: demandClean,
    assesseeLegalName: record.assesseeLegalName,
    assesseeTradeName: record.assesseeTradeName,
    identifier,
    address: record.address,
    statutoryCategory: record.statutoryCategory,
    subclassificationCode: record.subclassificationCode,
    tertiarySlab: record.tertiarySlab,
    amountPaid: record.amountPaidPkr,
    amountPaidWords: amountWords,
    dateOfReceipt: record.dateOfReceipt,
    timeOfReceipt: record.timeOfReceipt,
    paymentChannel: record.paymentChannel,
    bankBranch: branch,
    bankScrollRef: record.bankScrollRef,
    receivingOfficerName: record.receivingOfficerName,
    receivingOfficerTitle: record.receivingOfficerTitle,
    canonicalReceiptText,
    officialSha256,
    qrPayload
  };
}

/**
 * RFC-4180 CSV Escaper
 */
function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports all Form P.F.T-2 Challans as RFC-4180 compliant CSV.
 */
export function exportPft2ChallansCsv(challans: readonly Pft2ChallanRecord[]): string {
  const headers = [
    "Challan Number",
    "Demand Number",
    "Status",
    "Assessee Legal Name",
    "Trade Name",
    "Identifier Type",
    "Identifier Value",
    "Address",
    "Subclassification Code",
    "Category",
    "Tertiary Slab",
    "Amount Payable (PKR)",
    "Issue Date",
    "Due Date",
    "Received Date",
    "Receipt Number",
    "Cancellation Reason",
    "Official SHA-256"
  ];

  const rows = challans.map((c) => [
    escapeCsv(c.challanNumber),
    escapeCsv(c.demandNumber),
    escapeCsv(c.status),
    escapeCsv(c.legalName),
    escapeCsv(c.tradeName ?? ""),
    escapeCsv(c.identifierType),
    escapeCsv(c.identifierValue),
    escapeCsv(c.address),
    escapeCsv(c.subclassificationCode),
    escapeCsv(c.category),
    escapeCsv(c.tertiarySlab),
    escapeCsv(c.amountPayable),
    escapeCsv(c.issueDate),
    escapeCsv(c.dueDate),
    escapeCsv(c.receivedAt ?? ""),
    escapeCsv(c.receiptNumber ?? ""),
    escapeCsv(c.cancelledReason ?? ""),
    escapeCsv(c.officialSha256)
  ]);

  return [headers.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

/**
 * Exports all Statutory Payment Receipts as RFC-4180 compliant CSV.
 */
export function exportStatutoryReceiptsCsv(receipts: readonly StatutoryReceiptRecord[]): string {
  const headers = [
    "Receipt Number",
    "Date of Receipt",
    "Time of Receipt",
    "Challan Number",
    "Permanent Demand Number",
    "Assessee Legal Name",
    "Trade Name",
    "Identifier Type",
    "Identifier Value",
    "Commercial Address",
    "Category",
    "Subclass Code",
    "Tertiary Slab",
    "Amount Paid (PKR)",
    "Amount Paid in Words",
    "Payment Channel",
    "Bank Branch",
    "Bank Scroll / CPR Ref",
    "Receiving Officer",
    "Officer Title",
    "Official SHA-256"
  ];

  const rows = receipts.map((r) => [
    escapeCsv(r.receiptNumber),
    escapeCsv(r.dateOfReceipt),
    escapeCsv(r.timeOfReceipt),
    escapeCsv(r.challanNumber),
    escapeCsv(r.demandNumber),
    escapeCsv(r.assesseeLegalName),
    escapeCsv(r.assesseeTradeName ?? ""),
    escapeCsv(r.identifierType),
    escapeCsv(r.identifierValue),
    escapeCsv(r.address),
    escapeCsv(r.statutoryCategory),
    escapeCsv(r.subclassificationCode),
    escapeCsv(r.tertiarySlab),
    escapeCsv(r.amountPaidPkr),
    escapeCsv(r.amountPaidWords),
    escapeCsv(r.paymentChannel),
    escapeCsv(r.bankBranch ?? "Main Branch"),
    escapeCsv(r.bankScrollRef),
    escapeCsv(r.receivingOfficerName),
    escapeCsv(r.receivingOfficerTitle),
    escapeCsv(r.officialSha256)
  ]);

  return [headers.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

/**
 * Executive Summary Statistics for Form P.F.T-2 Challans
 */
export function calculatePft2ExecutiveSummary(challans: readonly Pft2ChallanRecord[]) {
  const total = challans.length;
  const issued = challans.filter((c) => c.status === "ISSUED");
  const received = challans.filter((c) => c.status === "RECEIVED");
  const cancelled = challans.filter((c) => c.status === "CANCELLED");

  const totalDemandPkr = challans.reduce((sum, c) => sum + c.amountPayable, 0);
  const receivedAmountPkr = received.reduce((sum, c) => sum + c.amountPayable, 0);
  const pendingAmountPkr = issued.reduce((sum, c) => sum + c.amountPayable, 0);
  const cancelledAmountPkr = cancelled.reduce((sum, c) => sum + c.amountPayable, 0);

  const realizationRate = totalDemandPkr > 0 ? (receivedAmountPkr / totalDemandPkr) * 100 : 0;

  return {
    total,
    issuedCount: issued.length,
    receivedCount: received.length,
    cancelledCount: cancelled.length,
    totalDemandPkr,
    receivedAmountPkr,
    pendingAmountPkr,
    cancelledAmountPkr,
    realizationRate: Math.round(realizationRate * 10) / 10
  };
}

/**
 * Executive Summary Statistics for Statutory Receipts
 */
export function calculateReceiptsExecutiveSummary(receipts: readonly StatutoryReceiptRecord[]) {
  const totalReceipts = receipts.length;
  const totalRevenuePkr = receipts.reduce((sum, r) => sum + r.amountPaidPkr, 0);
  const averageReceiptPkr = totalReceipts > 0 ? Math.round(totalRevenuePkr / totalReceipts) : 0;

  // Channel breakdown
  const channelBreakdown: Record<string, { count: number; totalPkr: number }> = {};
  for (const r of receipts) {
    const ch = r.paymentChannel || "Other";
    if (!channelBreakdown[ch]) {
      channelBreakdown[ch] = { count: 0, totalPkr: 0 };
    }
    channelBreakdown[ch]!.count += 1;
    channelBreakdown[ch]!.totalPkr += r.amountPaidPkr;
  }

  // Category breakdown
  const categoryBreakdown: Record<string, { count: number; totalPkr: number }> = {};
  for (const r of receipts) {
    const cat = r.statutoryCategory || "General";
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = { count: 0, totalPkr: 0 };
    }
    categoryBreakdown[cat]!.count += 1;
    categoryBreakdown[cat]!.totalPkr += r.amountPaidPkr;
  }

  return {
    totalReceipts,
    totalRevenuePkr,
    averageReceiptPkr,
    channelBreakdown,
    categoryBreakdown
  };
}

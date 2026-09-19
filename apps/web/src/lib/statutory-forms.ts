/**
 * Statutory Forms Generator for Punjab Professional Tax Administration System (PTAS)
 * Implements official gazetted formats:
 * - Form P.F.T-1: Notice of Tax Demand (Rule 6, Punjab Weekly Gazette Jan 21, 2009)
 * - Form P.F.T-2: 3-Copy Side-by-Side Payment Challan (Rule 9, Punjab Weekly Gazette Jan 21, 2009)
 * - Form P.F.T-3: Assessment & Demand Register (Rule 11, Punjab Professions & Trades Tax Rules 1977)
 */

import { computeContentSha256, computeLedgerBalance } from "@ptas/domain";
import type { StoredUnit } from "./pilot-store";

export interface FormPFT1Model {
  readonly isApproved: boolean;
  readonly noticeNumber: string;
  readonly demandNumber: string;
  readonly taxNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly circleName: string;
  readonly districtName: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly taxAmount: number;
  readonly taxAmountWords: string;
  readonly statutoryCategoryText: string;
  readonly scheduleEntry: string;
  readonly financialYear: string;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalNoticeText: string;
  readonly officialSha256: string;
  readonly serviceReceipt: {
    readonly demandNumber: string;
    readonly taxPayable: number;
    readonly dueDate: string;
    readonly assesseeName: string;
    readonly assesseeClass: string;
    readonly taxNumber: string;
    readonly serverName: string;
    readonly serverRole: string;
  };
}

export interface FormPFT2CopyModel {
  readonly copyTitle: string;
  readonly copyTitleUrdu: string;
  readonly headOfAccount: string;
  readonly district: string;
  readonly taxYear: string;
  readonly dueDate: string;
  readonly taxpayerInfo: {
    readonly taxNo: string;
    readonly classification: string;
    readonly legalName: string;
    readonly tradeName?: string | undefined;
    readonly address: string;
    readonly phone: string;
    readonly email: string;
  };
  readonly taxPayable: {
    readonly currentTax: number;
    readonly arrears: number;
    readonly penalty: number;
    readonly totalPayable: number;
    readonly totalPayableWords: string;
  };
  readonly assessmentInfo: {
    readonly demandNo: string;
    readonly circleNo: string;
    readonly circleName: string;
    readonly etoName: string;
    readonly etoTitle: string;
  };
  readonly bankUse: {
    readonly challanSerial: string;
    readonly bankName: string;
    readonly branchName: string;
  };
}

export interface FormPFT2Model {
  readonly isApproved: boolean;
  readonly displayAmount: number;
  readonly challanNumber: string;
  readonly canonicalChallanText: string;
  readonly officialSha256: string;
  readonly copies: readonly [FormPFT2CopyModel, FormPFT2CopyModel, FormPFT2CopyModel];
}

export interface FormPFT3RowModel {
  readonly serialNumber: number;
  readonly permanentDemandNo: string;
  readonly assessmentNo: string;
  readonly legalName: string;
  readonly tradeName?: string | undefined;
  readonly identifier: string;
  readonly scheduleEntry: string;
  readonly categoryName: string;
  readonly assessedCurrentTax: number;
  readonly arrears: number;
  readonly totalDemand: number;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
  readonly assessmentStatus: string;
  readonly lastPaymentDate?: string | undefined;
}

export interface ShowCausePenaltyNoticeModel {
  readonly noticeNumber: string;
  readonly noticeDate: string;
  readonly demandNumber: string;
  readonly hearingDate: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly identifier: string;
  readonly scheduleEntry: string;
  readonly originalTaxAmount: number;
  readonly daysOverdue: number;
  readonly maximumPenaltyExposable: number;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalNoticeText: string;
  readonly officialSha256: string;
}

export interface LandRevenueRecoveryCertificateModel {
  readonly certificateNumber: string;
  readonly issueDate: string;
  readonly collectorDesignation: string;
  readonly collectorDistrict: string;
  readonly demandNumber: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly address: string;
  readonly identifier: string;
  readonly originalTaxAmount: number;
  readonly penaltyAmount: number;
  readonly totalArrearsRecoverable: number;
  readonly totalArrearsWords: string;
  readonly recoverySection: string;
  readonly assessingAuthorityName: string;
  readonly assessingAuthorityTitle: string;
  readonly canonicalCertificateText: string;
  readonly officialSha256: string;
}

export interface CircleDispatchRowModel {
  readonly serialNumber: number;
  readonly noticeNumber: string;
  readonly demandNumber: string;
  readonly dispatchDate: string;
  readonly assesseeLegalName: string;
  readonly assesseeTradeName?: string | undefined;
  readonly identifier: string;
  readonly address: string;
  readonly scheduleEntry: string;
  readonly categoryName: string;
  readonly assessedAmount: number;
  readonly dueDate: string;
  readonly serverName: string;
  readonly serviceStatus: "PENDING" | "SERVED" | "REFUSED" | "UNTRACEABLE";
  readonly servedAt?: string | undefined;
  readonly recipientName?: string | undefined;
}

export interface CircleDispatchRegisterModel {
  readonly registerTitle: string;
  readonly registerTitleUrdu: string;
  readonly circleName: string;
  readonly district: string;
  readonly financialYear: string;
  readonly dispatchDate: string;
  readonly totalNotices: number;
  readonly totalAssessedSum: number;
  readonly totalServed: number;
  readonly totalPending: number;
  readonly rows: readonly CircleDispatchRowModel[];
  readonly officialSha256: string;
}

/**
 * Converts integer currency amount to official English words (Pakistani Rupees).
 */
export function numberToWordsPkr(amount: number): string {
  if (amount <= 0) return "Zero Rupees Only";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety"
  ];

  function convertChunk(num: number): string {
    let chunkStr = "";
    if (num >= 100) {
      chunkStr += ones[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num >= 20) {
      chunkStr += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      chunkStr += ones[num] + " ";
    }
    return chunkStr.trim();
  }

  let result = "";
  let remainder = Math.floor(amount);

  if (remainder >= 10000000) {
    const crore = Math.floor(remainder / 10000000);
    result += convertChunk(crore) + " Crore ";
    remainder %= 10000000;
  }

  if (remainder >= 100000) {
    const lakh = Math.floor(remainder / 100000);
    result += convertChunk(lakh) + " Lakh ";
    remainder %= 100000;
  }

  if (remainder >= 1000) {
    const thousand = Math.floor(remainder / 1000);
    result += convertChunk(thousand) + " Thousand ";
    remainder %= 1000;
  }

  if (remainder > 0) {
    result += convertChunk(remainder);
  }

  return `${result.trim()} Rupees Only`;
}

/**
 * Generates Form P.F.T-1 (Notice of Tax Demand under Section 3 read with Rule 6).
 */
export function generateFormPFT1(
  unit: StoredUnit,
  isTampered = false,
  tamperedAmount = 100
): FormPFT1Model {
  const latestAssessment = unit.assessments[0];
  const latestVersion = unit.assessmentVersions[0];
  const isApproved = latestAssessment?.status === "APPROVED";

  const taxAmount = isTampered ? tamperedAmount : (latestVersion?.snapshot.taxAmount ?? 0);
  const taxAmountWords = numberToWordsPkr(taxAmount);
  const noticeNumber = `PFT-1/VEH/2026/${unit.id.slice(-4)}`;
  const demandNumber = unit.demandUnit.permanentDemandNo;
  const taxNumber = `${unit.identifierType}: ${unit.identifierValue}`;
  const issueDate = "01/07/2026";
  const dueDate = "31/08/2026";

  const canonicalNoticeText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    "EXCISE & TAXATION OFFICER (PUNJAB PROFESSIONS & TRADES TAX)",
    "DISTRICT VEHARI - OFFICE OF THE ASSESSING AUTHORITY",
    "FORM P.F.T-1: NOTICE OF TAX DEMAND",
    "(Section 03 of Punjab Finance Act 1977 read with rule 6 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Demand No: ${demandNumber} | Date: ${issueDate} | Circle: Circle-Vehari`,
    `Tax No: ${taxNumber}`,
    `To: ${unit.legalName}`,
    `Address: ${unit.address}`,
    `Statutory Notice Text: According to Section 03 of Punjab Finance Act, 1977 you are liable to pay Tax on Professions, Trades, Employment or Callings amounting to Rs. ${taxAmount} (in words) ${taxAmountWords} as Entry ${unit.statutoryRule.subclassification_code} (${unit.statutoryRule.category}) for the year 2026-2027.`,
    "Directive: You are directed to make the payment in the National Bank of Pakistan or State Bank of Pakistan within one month of the service of this Notice through Payment Challan Form P.F.T-2 attached herewith and furnish a copy of paid Challan to the undersigned.",
    "Statutory Default Warning: In case of default, a penalty, not exceeding the amount of tax, shall be imposed and unpaid dues shall be recovered as arrears of Land Revenue.",
    "Assessing Authority: Tariq Mahmood, Excise & Taxation Officer, Professional Tax, Tehsil Vehari",
    `Service Receipt Counterfoil: Demand No: ${demandNumber} | Tax Payable: Rs. ${taxAmount} | Due Date: ${dueDate} | Class: Entry ${unit.statutoryRule.subclassification_code}`
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalNoticeText);

  return {
    isApproved,
    noticeNumber,
    demandNumber,
    taxNumber,
    issueDate,
    dueDate,
    circleName: "Circle-Vehari",
    districtName: "Vehari",
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    taxAmount,
    taxAmountWords,
    statutoryCategoryText: unit.statutoryRule.category,
    scheduleEntry: `Entry ${unit.statutoryRule.subclassification_code}`,
    financialYear: "2026-2027",
    assessingAuthorityName: "Tariq Mahmood",
    assessingAuthorityTitle: "Excise & Taxation Officer / Assessing Authority, Tehsil Vehari",
    canonicalNoticeText,
    officialSha256,
    serviceReceipt: {
      demandNumber,
      taxPayable: taxAmount,
      dueDate,
      assesseeName: unit.legalName,
      assesseeClass: `Entry ${unit.statutoryRule.subclassification_code} - ${unit.statutoryRule.category}`,
      taxNumber,
      serverName: "Muhammad Aslam",
      serverRole: "Tax Inspector / Service Officer, Circle-Vehari"
    }
  };
}

/**
 * Generates the authentic 3-copy Form P.F.T-2 (Payment Challan under Section 3 read with Rule 9).
 */
export function generateFormPFT2(
  unit: StoredUnit,
  isTampered = false,
  tamperedAmount = 100
): FormPFT2Model {
  const latestAssessment = unit.assessments[0];
  const latestVersion = unit.assessmentVersions[0];
  const isApproved = latestAssessment?.status === "APPROVED";

  const taxAmount = isTampered ? tamperedAmount : (latestVersion?.snapshot.taxAmount ?? 0);
  let penalty = 0;
  for (const entry of unit.ledgerEntries) {
    if (entry.entryType === "PENALTY_DEMAND") {
      penalty += entry.amount;
    }
  }
  const totalPayable = taxAmount + penalty;
  const totalPayableWords = numberToWordsPkr(totalPayable);
  const challanNumber = `PFT-2/VEH/2026/${unit.id.slice(-4)}`;
  const demandNo = unit.demandUnit.permanentDemandNo;
  const dueDate = "31/08/2026";
  const taxYear = "2026-2027";
  const district = "Vehari";
  const headOfAccount = "B01601 (Punjab Professional Tax - Provincial)";

  const canonicalChallanText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    "FORM P.F.T-2: PUNJAB PROFESSIONS & TRADES TAX PAYMENT CHALLAN",
    "(Section 3 of Punjab Finance Act 1977 read with rule 9 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Head of Account: ${headOfAccount}`,
    `Challan No: ${challanNumber} | District: ${district} | Tax Year: ${taxYear} | Due Date: ${dueDate}`,
    `Taxpayer: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Address: ${unit.address}`,
    `Classification: Entry ${unit.statutoryRule.subclassification_code} - ${unit.statutoryRule.category}`,
    `Detail of Tax: Current Tax: Rs. ${taxAmount} | Arrears: Rs. 0 | Penalty: Rs. ${penalty} | Total Payable: Rs. ${totalPayable}`,
    `Amount in Words: ${totalPayableWords}`,
    `Assessment Information: Demand No: ${demandNo} | Circle: Circle-Vehari`,
    "Assessing Authority: Tariq Mahmood, ETO Tehsil Vehari",
    "Authorized Treasury: National Bank of Pakistan (Main Branch Vehari) / State Bank of Pakistan / ePay Punjab"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalChallanText);

  const sharedData = {
    headOfAccount,
    district,
    taxYear,
    dueDate,
    taxpayerInfo: {
      taxNo: `${unit.identifierType}: ${unit.identifierValue}`,
      classification: `Entry ${unit.statutoryRule.subclassification_code} - ${unit.statutoryRule.category}`,
      legalName: unit.legalName,
      tradeName: unit.tradeName,
      address: unit.address,
      phone: "067-3360000",
      email: "info@punjab-taxpayer.gov.pk"
    },
    taxPayable: {
      currentTax: taxAmount,
      arrears: 0,
      penalty,
      totalPayable,
      totalPayableWords
    },
    assessmentInfo: {
      demandNo,
      circleNo: "Circle-01",
      circleName: "Circle-Vehari",
      etoName: "Tariq Mahmood",
      etoTitle: "Excise & Taxation Officer, Vehari"
    },
    bankUse: {
      challanSerial: challanNumber,
      bankName: "National Bank of Pakistan",
      branchName: "Main Branch, Club Road, Vehari"
    }
  };

  const copy1: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "PART 1: TAXPAYER'S COPY",
    copyTitleUrdu: "کاپ برائے ٹیکس دہندہ"
  };

  const copy2: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "PART 2: BANK'S COPY",
    copyTitleUrdu: "کاپ برائے بینک"
  };

  const copy3: FormPFT2CopyModel = {
    ...sharedData,
    copyTitle: "PART 3: DEPARTMENT'S COPY",
    copyTitleUrdu: "کاپ برائے محکمہ ایکسائز"
  };

  return {
    isApproved,
    displayAmount: totalPayable,
    challanNumber,
    canonicalChallanText,
    officialSha256,
    copies: [copy1, copy2, copy3]
  };
}

/**
 * Generates the official Notice to Show Cause for Imposition of Penalty
 * under Section 3(4) of the Punjab Finance Act, 1977 read with Rule 10 of
 * the Punjab Professions and Trades Tax Rules, 1977.
 */
export function generateShowCausePenaltyNotice(
  unit: StoredUnit,
  customDaysOverdue?: number
): ShowCausePenaltyNoticeModel {
  const latestVersion = unit.assessmentVersions[0];
  const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
  const demandNo = unit.demandUnit.permanentDemandNo;
  const noticeNumber = `SCN-PEN-VEH/2026/${unit.id.slice(-4)}`;
  const noticeDate = new Date().toISOString().split("T")[0]!;

  const hearingDateObj = new Date();
  hearingDateObj.setDate(hearingDateObj.getDate() + 7);
  const hearingDate = hearingDateObj.toISOString().split("T")[0]!;

  const daysOverdue = customDaysOverdue ?? 35;
  const maximumPenaltyExposable = taxAmount; // Section 3(4) statutory ceiling: not exceeding amount of tax

  const canonicalNoticeText = [
    "OFFICE OF THE EXCISE & TAXATION OFFICER / ASSESSING AUTHORITY, VEHARI",
    "NOTICE TO SHOW CAUSE FOR IMPOSITION OF PENALTY",
    "(Under Section 3(4) of the Punjab Finance Act, 1977 read with Rule 10 of the Punjab Professions & Trades Tax Rules, 1977)",
    `Notice No: ${noticeNumber} | Date of Issue: ${noticeDate} | Demand Notice No: ${demandNo}`,
    `Assessee Legal Name: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Business Address: ${unit.address}`,
    `Classification: Entry ${unit.statutoryRule.subclassification_code} - ${unit.statutoryRule.category}`,
    `Assessed Tax Demand: PKR ${taxAmount} | Days Overdue: ${daysOverdue} days`,
    `Maximum Statutory Penalty Imposable: PKR ${maximumPenaltyExposable} (100% of assessed tax)`,
    `Hearing / Explanation Due Date: ${hearingDate} at 10:00 AM`,
    "Authority: Tariq Mahmood, Excise & Taxation Officer / Assessing Authority, Tehsil Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalNoticeText);

  return {
    noticeNumber,
    noticeDate,
    demandNumber: demandNo,
    hearingDate,
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    scheduleEntry: `Entry ${unit.statutoryRule.subclassification_code} - ${unit.statutoryRule.category}`,
    originalTaxAmount: taxAmount,
    daysOverdue,
    maximumPenaltyExposable,
    assessingAuthorityName: "Tariq Mahmood",
    assessingAuthorityTitle: "Excise & Taxation Officer / Assessing Authority, Tehsil Vehari",
    canonicalNoticeText,
    officialSha256
  };
}

/**
 * Generates the official Certificate of Recovery as Arrears of Land Revenue
 * under Section 3(4) of the Punjab Finance Act 1977 read with Rule 12 of
 * the Punjab Professions and Trades Tax Rules, 1977 and Sections 80/81 of
 * the Punjab Land Revenue Act, 1967.
 */
export function generateLandRevenueRecoveryCertificate(
  unit: StoredUnit,
  customCollectorDesignation?: string
): LandRevenueRecoveryCertificateModel {
  const latestVersion = unit.assessmentVersions[0];
  const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
  let penalty = 0;
  for (const entry of unit.ledgerEntries) {
    if (entry.entryType === "PENALTY_DEMAND") {
      penalty += entry.amount;
    }
  }
  const totalArrearsRecoverable = taxAmount + penalty;
  const totalArrearsWords = numberToWordsPkr(totalArrearsRecoverable);
  const demandNo = unit.demandUnit.permanentDemandNo;
  const certificateNumber = `CERT-LRA-VEH/2026/${unit.id.slice(-4)}`;
  const issueDate = new Date().toISOString().split("T")[0]!;
  const collectorDesignation =
    customCollectorDesignation ?? "The Collector / Tehsildar (Recovery), District Vehari";

  const canonicalCertificateText = [
    "OFFICE OF THE EXCISE & TAXATION OFFICER / ASSESSING AUTHORITY, VEHARI",
    "CERTIFICATE OF RECOVERY AS ARREARS OF LAND REVENUE",
    "(Under Rule 12 of Punjab Professions & Trades Tax Rules, 1977 read with Sections 80 & 81 of the Punjab Land Revenue Act, 1967)",
    `Certificate No: ${certificateNumber} | Issue Date: ${issueDate}`,
    `To: ${collectorDesignation}`,
    `Defaulter Assessee: ${unit.legalName} | Trade Name: ${unit.tradeName ?? unit.legalName}`,
    `Identifier: ${unit.identifierType}: ${unit.identifierValue}`,
    `Business Address: ${unit.address}`,
    `Permanent Demand No: ${demandNo}`,
    `Breakdown of Arrears: Principal Tax: PKR ${taxAmount} | Statutory Penalty: PKR ${penalty} | Total: PKR ${totalArrearsRecoverable}`,
    `Total in Words: ${totalArrearsWords}`,
    "Statutory Mandate: Recover the certified sum as Arrears of Land Revenue by distress, attachment and sale of property or warrant.",
    "Certified By: Tariq Mahmood, Excise & Taxation Officer / Assessing Authority, Tehsil Vehari"
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalCertificateText);

  return {
    certificateNumber,
    issueDate,
    collectorDesignation,
    collectorDistrict: "District Vehari",
    demandNumber: demandNo,
    assesseeLegalName: unit.legalName,
    assesseeTradeName: unit.tradeName,
    address: unit.address,
    identifier: `${unit.identifierType}: ${unit.identifierValue}`,
    originalTaxAmount: taxAmount,
    penaltyAmount: penalty,
    totalArrearsRecoverable,
    totalArrearsWords,
    recoverySection: "Rule 12 (1977 Rules) & Sec 80/81 (Punjab Land Revenue Act 1967)",
    assessingAuthorityName: "Tariq Mahmood",
    assessingAuthorityTitle: "Excise & Taxation Officer / Assessing Authority, Tehsil Vehari",
    canonicalCertificateText,
    officialSha256
  };
}

/**
 * Generates the statutory Form P.F.T-3 Assessment & Demand Register rows (Rule 11).
 */
export function generateFormPFT3Rows(units: readonly StoredUnit[]): readonly FormPFT3RowModel[] {
  return units.map((u, idx) => {
    const latestVersion = u.assessmentVersions[0];
    const latestAssessment = u.assessments[0];
    const currentTax = latestVersion?.snapshot.taxAmount ?? 0;
    const balance = computeLedgerBalance(u.ledgerEntries);
    let totalPaid = 0;
    let lastPaymentDate: string | undefined = undefined;

    for (const e of u.ledgerEntries) {
      if (e.amount < 0) {
        totalPaid += Math.abs(e.amount);
        lastPaymentDate = e.postedAt.split("T")[0];
      }
    }

    return {
      serialNumber: idx + 1,
      permanentDemandNo: u.demandUnit.permanentDemandNo,
      assessmentNo: `ASM-VEH-2026-${u.id.slice(-4)}`,
      legalName: u.legalName,
      tradeName: u.tradeName,
      identifier: `${u.identifierType}: ${u.identifierValue}`,
      scheduleEntry: `Entry ${u.statutoryRule.subclassification_code}`,
      categoryName: u.statutoryRule.category,
      assessedCurrentTax: currentTax,
      arrears: 0,
      totalDemand: currentTax,
      totalPaid,
      outstandingBalance: balance,
      assessmentStatus: latestAssessment?.status ?? "DRAFT",
      lastPaymentDate
    };
  });
}

/**
 * Generates the official Circle Notice Dispatch & Service Register
 * (فہرست ترسیل و تعمیل نوٹس جات زیر رول 6) for field tracking by Circle Inspector.
 */
export function generateCircleDispatchRegister(
  units: readonly StoredUnit[],
  customDispatchDate: string = "2026-07-02"
): CircleDispatchRegisterModel {
  let totalAssessedSum = 0;
  let totalServed = 0;
  let totalPending = 0;

  const rows: CircleDispatchRowModel[] = units.map((u, idx) => {
    const latestVersion = u.assessmentVersions[0];
    const taxAmount = latestVersion?.snapshot.taxAmount ?? 0;
    totalAssessedSum += taxAmount;

    const status = u.serviceStatus ?? "PENDING";
    if (status === "SERVED") {
      totalServed++;
    } else {
      totalPending++;
    }

    return {
      serialNumber: idx + 1,
      noticeNumber: `PFT-1/VEH/2026/${u.id.slice(-4)}`,
      demandNumber: u.demandUnit.permanentDemandNo,
      dispatchDate: customDispatchDate,
      assesseeLegalName: u.legalName,
      assesseeTradeName: u.tradeName,
      identifier: `${u.identifierType}: ${u.identifierValue}`,
      address: u.address,
      scheduleEntry: `Entry ${u.statutoryRule.subclassification_code}`,
      categoryName: u.statutoryRule.category,
      assessedAmount: taxAmount,
      dueDate: "31/08/2026",
      serverName: u.servedBy ?? "Muhammad Aslam, Tax Inspector",
      serviceStatus: status,
      servedAt: u.servedAt,
      recipientName: u.recipientName ?? (status === "SERVED" ? u.legalName : undefined)
    };
  });

  const canonicalRegisterText = [
    "GOVERNMENT OF THE PUNJAB - EXCISE & TAXATION DEPARTMENT",
    "CIRCLE DISPATCH & NOTICE SERVICE REGISTER (فہرست ترسیل و تعمیل نوٹس جات)",
    "(Maintained under Rule 6 of Punjab Professions and Trades Tax Rules, 1977)",
    `District: Vehari | Circle: Circle-Vehari | Financial Year: 2026-2027 | Dispatch Date: ${customDispatchDate}`,
    `Total Dispatched Notices: ${rows.length} | Gross Assessed Sum: PKR ${totalAssessedSum} | Total Served: ${totalServed} | Pending: ${totalPending}`,
    ...rows.map(
      (r) =>
        `#${r.serialNumber} | ${r.noticeNumber} | ${r.demandNumber} | ${r.assesseeLegalName} | PKR ${r.assessedAmount} | Status: ${r.serviceStatus}`
    )
  ].join("\n");

  const officialSha256 = computeContentSha256(canonicalRegisterText);

  return {
    registerTitle: "Circle Notice Dispatch & Service Register (Rule 6)",
    registerTitleUrdu: "فہرست ترسیل و تعمیل نوٹس جات زیر رول 6",
    circleName: "Circle-Vehari",
    district: "Vehari",
    financialYear: "2026-2027",
    dispatchDate: customDispatchDate,
    totalNotices: rows.length,
    totalAssessedSum,
    totalServed,
    totalPending,
    rows,
    officialSha256
  };
}

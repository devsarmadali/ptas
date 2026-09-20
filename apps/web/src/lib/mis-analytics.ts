/**
 * PTAS Vehari Pilot: Executive Management Information System (MIS) Analytics & Statutory Reporting Hub
 * Governed by:
 * - Section 15 of Punjab Professional Tax Digitization Plan v0.5
 * - Second Schedule to Punjab Finance Act, 1977 (Categories 1 through 11)
 * - Punjab Professions and Trades Tax Rules, 1977 (Rules 4, 5, 6, 10, 11, 12)
 *
 * Implements:
 * - Revenue KPIs (Demand, Recovery, Arrears, Budget Realization)
 * - Statutory Category Yield Distribution (11 Second Schedule Entries)
 * - Defaulter Recovery Funnel (Aging & Section 3(4) / Rule 12 Enforcement)
 * - Operational Pendency Velocity (Assessments, Notices, Inspections, Appeals, Refunds)
 * - 5 RFC-4180 Compliant Statutory CSV Registers
 */

import {
  computeDefaulterAging,
  computeLedgerBalance,
  getAllStatutoryRules,
  getStatutoryCategories,
  type StatutoryCategorySummary
} from "@ptas/domain";
import type {
  AppealRecord,
  ClearanceCertificateRecord,
  DiscontinuanceRecord,
  RefundAdjustmentRecord,
  StoredUnit
} from "./pilot-store";

export interface CategoryYieldSummary {
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly ruleCount: number;
  readonly unitCount: number;
  readonly assessedDemand: number;
  readonly penaltyDemand: number;
  readonly totalDemand: number;
  readonly realizedRecovery: number;
  readonly outstandingArrears: number;
  readonly compliancePct: number;
}

export interface SlabYieldSummary {
  readonly ruleId: string;
  readonly ruleCode: string;
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly subclassificationCode: string | null;
  readonly subclassificationLabel?: string | null | undefined;
  readonly statutoryTertiaryCode?: string | null | undefined;
  readonly statutoryTertiaryClassification?: string | null | undefined;
  readonly tertiarySlab: string | null;
  readonly slabRatePkr: number;
  readonly rateBasis: string;
  readonly unitCount: number;
  readonly assessedUnitsCount: number;
  readonly assessedDemand: number;
  readonly assessedDemandPkr: number;
  readonly penaltyDemand: number;
  readonly totalDemand: number;
  readonly realizedRecovery: number;
  readonly realizedRecoveryPkr: number;
  readonly outstandingArrears: number;
  readonly outstandingArrearsPkr: number;
  readonly compliancePct: number;
  readonly recoveryRatePct: number;
}

export interface DefaulterFunnelStage {
  readonly count: number;
  readonly amount: number;
}

export interface DefaulterAgingFunnel {
  readonly current: DefaulterFunnelStage;
  readonly overdue30Days: DefaulterFunnelStage;
  readonly penaltyEligible: DefaulterFunnelStage;
  readonly penalized: DefaulterFunnelStage;
  readonly recoveryCertified: DefaulterFunnelStage;
  readonly paid: DefaulterFunnelStage;
  readonly totalDefaulterExposure: number;
}

export interface OperationalPendency {
  readonly pendingDraftAssessments: number;
  readonly unservedNotices: number;
  readonly pendingFieldInspections: number;
  readonly pendingAppeals: number;
  readonly pendingRefunds: number;
  readonly clearanceCertificatesIssued: number;
  readonly totalPendencyActions: number;
}

export interface RevenueKpis {
  readonly totalUnitsCount: number;
  readonly assessedDemand: number;
  readonly penaltyDemand: number;
  readonly totalAssessedGross: number;
  readonly totalRealizedRecovery: number;
  readonly outstandingArrears: number;
  readonly recoveryRatePct: number;
  readonly baselineBudgetTargetPkr: number;
  readonly targetRealizationPct: number;
  readonly paidUnitsCount: number;
  readonly defaulterUnitsCount: number;
}

export interface InspectorSummaryStats {
  readonly totalAssignedUnits: number;
  readonly servedNoticesCount: number;
  readonly unservedNoticesCount: number;
  readonly serviceCoveragePct: number;
  readonly pendingInspectionsCount: number;
  readonly fieldComplianceRatePct: number;
}

export interface EtoSummaryStats {
  readonly pendingAssessmentsCount: number;
  readonly approvedAssessmentsCount: number;
  readonly penaltyEligibleCount: number;
  readonly recoveryCertificatesCount: number;
  readonly totalAdjudicatedReliefPkr: number;
}

export interface DirectorSummaryStats {
  readonly circleTargetRealizationPct: number;
  readonly divisionalCollectionTotalPkr: number;
  readonly totalDefaulterExposurePkr: number;
  readonly pendingAppealsCount: number;
  readonly circleIntegrityStatus: "OPTIMAL" | "ATTENTION_REQUIRED";
}

export interface RolePerspectiveMetrics {
  readonly inspector: InspectorSummaryStats;
  readonly eto: EtoSummaryStats;
  readonly director: DirectorSummaryStats;
}

export interface ExecutiveMetrics {
  readonly kpis: RevenueKpis;
  readonly categoryYields: readonly CategoryYieldSummary[];
  readonly slabYields: readonly SlabYieldSummary[];
  readonly defaulterFunnel: DefaulterAgingFunnel;
  readonly pendency: OperationalPendency;
  readonly roleMetrics: RolePerspectiveMetrics;
  readonly generatedAt: string;
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Computes comprehensive Executive MIS Analytics across revenue, category yield,
 * defaulter aging funnel, and operational pendency velocity.
 * Strictly derives from immutable unit ledger entries and statutory records.
 */
export function computeExecutiveMetrics(
  units: readonly StoredUnit[],
  appeals: readonly AppealRecord[] = [],
  discontinuances: readonly DiscontinuanceRecord[] = [],
  refundAdjustments: readonly RefundAdjustmentRecord[] = [],
  clearanceCertificates: readonly ClearanceCertificateRecord[] = []
): ExecutiveMetrics {
  const categories: readonly StatutoryCategorySummary[] = getStatutoryCategories();

  // Revenue KPI accumulators
  let totalAssessed = 0;
  let totalPenalty = 0;
  let totalRealized = 0;
  let totalArrears = 0;
  let paidCount = 0;
  let defaulterCount = 0;

  // Defaulter Funnel accumulators
  let currentCount = 0;
  let currentAmt = 0;
  let overdueCount = 0;
  let overdueAmt = 0;
  let penaltyEligibleCount = 0;
  let penaltyEligibleAmt = 0;
  let penalizedCount = 0;
  let penalizedAmt = 0;
  let certifiedCount = 0;
  let certifiedAmt = 0;
  let paidFunnelCount = 0;
  let paidFunnelAmt = 0;

  // Category yield maps
  const catUnitCount = new Map<string, number>();
  const catAssessed = new Map<string, number>();
  const catPenalty = new Map<string, number>();
  const catRealized = new Map<string, number>();
  const catArrears = new Map<string, number>();

  for (const cat of categories) {
    catUnitCount.set(cat.category_code, 0);
    catAssessed.set(cat.category_code, 0);
    catPenalty.set(cat.category_code, 0);
    catRealized.set(cat.category_code, 0);
    catArrears.set(cat.category_code, 0);
  }

  // Statutory Sub-Class & Tertiary Slab maps (47 Second Schedule entries)
  const slabUnitCount = new Map<string, number>();
  const slabAssessed = new Map<string, number>();
  const slabPenalty = new Map<string, number>();
  const slabRealized = new Map<string, number>();
  const slabArrears = new Map<string, number>();

  for (const r of getAllStatutoryRules()) {
    slabUnitCount.set(r.rule_id, 0);
    slabAssessed.set(r.rule_id, 0);
    slabPenalty.set(r.rule_id, 0);
    slabRealized.set(r.rule_id, 0);
    slabArrears.set(r.rule_id, 0);
  }

  // Iterate over all registered units
  for (const u of units) {
    const catCode = u.statutoryRule?.category_code ?? u.categoryCode ?? "1";
    const ruleId = u.statutoryRuleId ?? u.statutoryRule?.rule_id ?? "PFT-1.i";
    let uAssessed = 0;
    let uPenalty = 0;
    let uRealized = 0;

    for (const entry of u.ledgerEntries) {
      if (entry.entryType === "ASSESSMENT_DEMAND") {
        uAssessed += entry.amount;
      } else if (entry.entryType === "PENALTY_DEMAND") {
        uPenalty += entry.amount;
      } else if (entry.entryType === "REVISION_ADJUSTMENT") {
        if (entry.metadata?.decisionType === "PENALTY_REMISSION") {
          uPenalty += entry.amount;
        } else {
          uAssessed += entry.amount;
        }
      } else if (entry.amount < 0) {
        // Payment credit or authorized credit adjustment
        uRealized += Math.abs(entry.amount);
      }
    }

    // Fallback if initial demand entry hasn't been posted yet but assessment version exists
    if (uAssessed === 0 && u.assessmentVersions && u.assessmentVersions.length > 0) {
      const latestVer = u.assessmentVersions[0];
      if (latestVer?.snapshot?.taxAmount) {
        uAssessed = latestVer.snapshot.taxAmount;
      }
    }

    uAssessed = round2(uAssessed);
    uPenalty = round2(uPenalty);
    uRealized = round2(uRealized);
    const uBalance = computeLedgerBalance(u.ledgerEntries);

    totalAssessed += uAssessed;
    totalPenalty += uPenalty;
    totalRealized += uRealized;
    if (uBalance > 0) {
      totalArrears += uBalance;
      defaulterCount++;
    } else if (uRealized > 0) {
      paidCount++;
    }

    // Update category map
    catUnitCount.set(catCode, (catUnitCount.get(catCode) ?? 0) + 1);
    catAssessed.set(catCode, round2((catAssessed.get(catCode) ?? 0) + uAssessed));
    catPenalty.set(catCode, round2((catPenalty.get(catCode) ?? 0) + uPenalty));
    catRealized.set(catCode, round2((catRealized.get(catCode) ?? 0) + uRealized));
    catArrears.set(catCode, round2((catArrears.get(catCode) ?? 0) + (uBalance > 0 ? uBalance : 0)));

    // Update slab map
    slabUnitCount.set(ruleId, (slabUnitCount.get(ruleId) ?? 0) + 1);
    slabAssessed.set(ruleId, round2((slabAssessed.get(ruleId) ?? 0) + uAssessed));
    slabPenalty.set(ruleId, round2((slabPenalty.get(ruleId) ?? 0) + uPenalty));
    slabRealized.set(ruleId, round2((slabRealized.get(ruleId) ?? 0) + uRealized));
    slabArrears.set(ruleId, round2((slabArrears.get(ruleId) ?? 0) + (uBalance > 0 ? uBalance : 0)));

    // Defaulter aging distribution
    const aging = computeDefaulterAging(
      u.ledgerEntries,
      "2026-08-31",
      undefined,
      Boolean(u.isRecoveryCertified)
    );

    switch (aging.status) {
      case "CURRENT":
        currentCount++;
        currentAmt += aging.remainingBalance;
        break;
      case "OVERDUE_30_DAYS":
        overdueCount++;
        overdueAmt += aging.remainingBalance;
        break;
      case "PENALTY_ELIGIBLE":
        penaltyEligibleCount++;
        penaltyEligibleAmt += aging.remainingBalance;
        break;
      case "PENALIZED":
        penalizedCount++;
        penalizedAmt += aging.remainingBalance;
        break;
      case "RECOVERY_CERTIFIED":
        certifiedCount++;
        certifiedAmt += aging.remainingBalance;
        break;
      case "PAID":
        paidFunnelCount++;
        paidFunnelAmt += aging.totalPaid;
        break;
    }
  }

  totalAssessed = round2(totalAssessed);
  totalPenalty = round2(totalPenalty);
  const totalGross = round2(totalAssessed + totalPenalty);
  totalRealized = round2(totalRealized);
  totalArrears = round2(totalArrears);

  const recoveryRatePct = totalGross > 0 ? round2((totalRealized / totalGross) * 100) : 0;
  const baselineBudgetTargetPkr = 50000;
  const targetRealizationPct = round2((totalRealized / baselineBudgetTargetPkr) * 100);

  // Category yield summaries
  const categoryYields: CategoryYieldSummary[] = categories.map((cat) => {
    const code = cat.category_code;
    const assessed = catAssessed.get(code) ?? 0;
    const penalty = catPenalty.get(code) ?? 0;
    const totalDem = round2(assessed + penalty);
    const realized = catRealized.get(code) ?? 0;
    const arrears = catArrears.get(code) ?? 0;
    const compliance =
      totalDem > 0 ? Math.min(100, Math.round((realized / totalDem) * 1000) / 10) : 100;

    return {
      categoryCode: code,
      categoryName: cat.category_name,
      ruleCount: cat.rule_count,
      unitCount: catUnitCount.get(code) ?? 0,
      assessedDemand: assessed,
      penaltyDemand: penalty,
      totalDemand: totalDem,
      realizedRecovery: realized,
      outstandingArrears: arrears,
      compliancePct: compliance
    };
  });

  // Statutory Sub-Class & Tertiary Slab yield summaries (47 Second Schedule Entries)
  const slabYields: SlabYieldSummary[] = getAllStatutoryRules().map((r) => {
    const assessed = slabAssessed.get(r.rule_id) ?? 0;
    const penalty = slabPenalty.get(r.rule_id) ?? 0;
    const totalDem = round2(assessed + penalty);
    const realized = slabRealized.get(r.rule_id) ?? 0;
    const arrears = slabArrears.get(r.rule_id) ?? 0;
    const count = slabUnitCount.get(r.rule_id) ?? 0;
    const compliance =
      totalDem > 0 ? Math.min(100, Math.round((realized / totalDem) * 1000) / 10) : 100;

    let tertiaryLabel: string;
    if (r.subclassification_label && r.statutory_tertiary_classification) {
      tertiaryLabel = `${r.subclassification_label} — ${r.statutory_tertiary_classification}`;
    } else if (r.statutory_tertiary_classification) {
      tertiaryLabel = r.statutory_tertiary_classification;
    } else if (r.subclassification_label) {
      tertiaryLabel = r.subclassification_label;
    } else if (r.subcategory) {
      tertiaryLabel = r.subcategory;
    } else {
      tertiaryLabel = "Direct Category Rate";
    }

    return {
      ruleId: r.rule_id,
      ruleCode: r.rule_code,
      categoryCode: r.category_code,
      categoryName: r.category,
      subclassificationCode: r.subclassification_code,
      subclassificationLabel: r.subclassification_label ?? null,
      statutoryTertiaryCode: r.statutory_tertiary_code ?? null,
      statutoryTertiaryClassification: r.statutory_tertiary_classification ?? null,
      tertiarySlab: tertiaryLabel,
      slabRatePkr: r.annual_rate_pkr,
      rateBasis: r.rate_basis,
      unitCount: count,
      assessedUnitsCount: count,
      assessedDemand: assessed,
      assessedDemandPkr: assessed,
      penaltyDemand: penalty,
      totalDemand: totalDem,
      realizedRecovery: realized,
      realizedRecoveryPkr: realized,
      outstandingArrears: arrears,
      outstandingArrearsPkr: arrears,
      compliancePct: compliance,
      recoveryRatePct: compliance
    };
  });

  // Operational Pendency Velocity
  let pendingDraftAssessments = 0;
  let unservedNotices = 0;

  for (const u of units) {
    const latestAsm = u.assessments[0];
    if (!latestAsm || latestAsm.status === "DRAFT" || latestAsm.status === "SUBMITTED") {
      pendingDraftAssessments++;
    }
    const status = u.serviceStatus ?? "PENDING";
    if (status === "PENDING") {
      unservedNotices++;
    }
  }

  const pendingFieldInspections = discontinuances.filter(
    (d) => d.status === "PENDING_INSPECTION"
  ).length;

  const pendingAppeals = appeals.filter(
    (a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED"
  ).length;

  const pendingRefunds = refundAdjustments.filter((r) => r.status === "PENDING_REVIEW").length;

  const clearanceCertificatesIssued = clearanceCertificates.length;

  const totalPendencyActions =
    pendingDraftAssessments +
    unservedNotices +
    pendingFieldInspections +
    pendingAppeals +
    pendingRefunds;

  const totalDefaulterExposure = round2(
    overdueAmt + penaltyEligibleAmt + penalizedAmt + certifiedAmt
  );

  return {
    kpis: {
      totalUnitsCount: units.length,
      assessedDemand: totalAssessed,
      penaltyDemand: totalPenalty,
      totalAssessedGross: totalGross,
      totalRealizedRecovery: totalRealized,
      outstandingArrears: totalArrears,
      recoveryRatePct,
      baselineBudgetTargetPkr,
      targetRealizationPct,
      paidUnitsCount: paidCount,
      defaulterUnitsCount: defaulterCount
    },
    categoryYields,
    slabYields,
    defaulterFunnel: {
      current: { count: currentCount, amount: round2(currentAmt) },
      overdue30Days: { count: overdueCount, amount: round2(overdueAmt) },
      penaltyEligible: { count: penaltyEligibleCount, amount: round2(penaltyEligibleAmt) },
      penalized: { count: penalizedCount, amount: round2(penalizedAmt) },
      recoveryCertified: { count: certifiedCount, amount: round2(certifiedAmt) },
      paid: { count: paidFunnelCount, amount: round2(paidFunnelAmt) },
      totalDefaulterExposure
    },
    pendency: {
      pendingDraftAssessments,
      unservedNotices,
      pendingFieldInspections,
      pendingAppeals,
      pendingRefunds,
      clearanceCertificatesIssued,
      totalPendencyActions
    },
    roleMetrics: {
      inspector: {
        totalAssignedUnits: units.length,
        servedNoticesCount: units.length - unservedNotices,
        unservedNoticesCount: unservedNotices,
        serviceCoveragePct:
          units.length > 0 ? round2(((units.length - unservedNotices) / units.length) * 100) : 0,
        pendingInspectionsCount: pendingFieldInspections,
        fieldComplianceRatePct: units.length > 0 ? round2((paidCount / units.length) * 100) : 0
      },
      eto: {
        pendingAssessmentsCount: pendingDraftAssessments,
        approvedAssessmentsCount: Math.max(0, units.length - pendingDraftAssessments),
        penaltyEligibleCount,
        recoveryCertificatesCount: certifiedCount,
        totalAdjudicatedReliefPkr: round2(
          refundAdjustments
            .filter((r) => r.status === "APPROVED")
            .reduce((sum, r) => sum + r.amount, 0)
        )
      },
      director: {
        circleTargetRealizationPct: targetRealizationPct,
        divisionalCollectionTotalPkr: totalRealized,
        totalDefaulterExposurePkr: totalDefaulterExposure,
        pendingAppealsCount: pendingAppeals,
        circleIntegrityStatus: targetRealizationPct >= 60 ? "OPTIMAL" : "ATTENTION_REQUIRED"
      }
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Escapes a cell value according to RFC-4180 standard.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export 1: Form P.F.T-3 Assessment & Demand Register (Rule 11)
 */
export function exportPft3RegisterCsv(units: readonly StoredUnit[]): string {
  const headers = [
    "S.No",
    "Provincial UIN",
    "Permanent Demand No",
    "Assessment No",
    "Assessee Legal Name",
    "Trade Name",
    "CNIC / NTN",
    "Business Address",
    "Schedule Category",
    "Schedule Sub-Class Code",
    "Tertiary Class / Slab",
    "Rate Basis",
    "Statutory Slab Rate (PKR)",
    "Assessed Current Tax (PKR)",
    "Penalties (PKR)",
    "Total Demand (PKR)",
    "Total Paid (PKR)",
    "Outstanding Balance (PKR)",
    "Assessment Status",
    "Notice Status",
    "Recovery Status"
  ];

  const rows = units.map((u, idx) => {
    const latestVersion = u.assessmentVersions[0];
    const baseDemand = latestVersion?.snapshot?.taxAmount ?? 0;
    let penalties = 0;
    let totalPaid = 0;

    for (const entry of u.ledgerEntries) {
      if (entry.entryType === "PENALTY_DEMAND") {
        penalties += entry.amount;
      } else if (entry.amount < 0) {
        totalPaid += Math.abs(entry.amount);
      }
    }

    const totalDemand = round2(baseDemand + penalties);
    const balance = computeLedgerBalance(u.ledgerEntries);
    const aging = computeDefaulterAging(
      u.ledgerEntries,
      "2026-08-31",
      undefined,
      Boolean(u.isRecoveryCertified)
    );

    return [
      idx + 1,
      u.provincialUin ?? "",
      u.demandUnit.permanentDemandNo,
      `ASM-VEH-2026-${u.id.slice(-4)}`,
      u.legalName,
      u.tradeName ?? "",
      `${u.identifierType}: ${u.identifierValue}`,
      u.address,
      u.statutoryRule.category,
      u.statutoryRule.subclassification_code
        ? `Class ${u.statutoryRule.subclassification_code}`
        : `Class ${u.statutoryRule.category_code}`,
      u.statutoryRule.subcategory,
      u.statutoryRule.rate_basis,
      u.statutoryRule.annual_rate_pkr,
      baseDemand,
      penalties,
      totalDemand,
      round2(totalPaid),
      balance,
      u.assessments[0]?.status ?? "DRAFT",
      u.serviceStatus ?? "PENDING",
      aging.status
    ];
  });

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Export 2: Defaulter Recovery Roll (Section 3(4) / Rule 12)
 */
export function exportDefaulterRecoveryCsv(units: readonly StoredUnit[]): string {
  const headers = [
    "S.No",
    "Provincial UIN",
    "Permanent Demand No",
    "Assessee Legal Name",
    "Trade Name",
    "CNIC / NTN",
    "Commercial Address",
    "Category",
    "Schedule Sub-Class Code",
    "Tertiary Class / Slab",
    "Statutory Slab Rate (PKR)",
    "Due Date",
    "Days Overdue",
    "Original Demand (PKR)",
    "Section 3(4) Penalty (PKR)",
    "Realized Payments (PKR)",
    "Arrears Balance (PKR)",
    "Recovery Stage",
    "Land Revenue Certified"
  ];

  const defaulterUnits = units.filter((u) => {
    const aging = computeDefaulterAging(
      u.ledgerEntries,
      "2026-08-31",
      undefined,
      Boolean(u.isRecoveryCertified)
    );
    return aging.status !== "PAID" && aging.status !== "CURRENT";
  });

  const rows = defaulterUnits.map((u, idx) => {
    const aging = computeDefaulterAging(
      u.ledgerEntries,
      "2026-08-31",
      undefined,
      Boolean(u.isRecoveryCertified)
    );

    return [
      idx + 1,
      u.provincialUin ?? "",
      u.demandUnit.permanentDemandNo,
      u.legalName,
      u.tradeName ?? "",
      `${u.identifierType}: ${u.identifierValue}`,
      u.address,
      u.statutoryRule.category,
      u.statutoryRule.subclassification_code
        ? `Class ${u.statutoryRule.subclassification_code}`
        : `Class ${u.statutoryRule.category_code}`,
      u.statutoryRule.subcategory,
      u.statutoryRule.annual_rate_pkr,
      aging.dueDate,
      aging.daysOverdue,
      aging.originalDemand,
      aging.penaltyDemand,
      aging.totalPaid,
      aging.remainingBalance,
      aging.status,
      u.isRecoveryCertified ? "YES" : "NO"
    ];
  });

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Export 3: Circle Notice Dispatch & Service Register (Rule 6(2))
 */
export function exportNoticeDispatchCsv(units: readonly StoredUnit[]): string {
  const headers = [
    "S.No",
    "Provincial UIN",
    "Notice No",
    "Permanent Demand No",
    "Assessee Legal Name",
    "Trade Name",
    "CNIC / NTN",
    "Commercial Address",
    "Category",
    "Schedule Sub-Class Code",
    "Tertiary Class / Slab",
    "Statutory Slab Rate (PKR)",
    "Assessed Amount (PKR)",
    "Notice Channel",
    "Service Status",
    "Served Date",
    "Served By Officer",
    "Recipient Name",
    "Witness Details"
  ];

  const rows = units.map((u, idx) => {
    const latestVersion = u.assessmentVersions[0];
    const taxAmount = latestVersion?.snapshot?.taxAmount ?? 0;

    return [
      idx + 1,
      u.provincialUin ?? "",
      `PFT-1/VEH/2026/${u.id.slice(-4)}`,
      u.demandUnit.permanentDemandNo,
      u.legalName,
      u.tradeName ?? "",
      `${u.identifierType}: ${u.identifierValue}`,
      u.address,
      u.statutoryRule.category,
      u.statutoryRule.subclassification_code
        ? `Class ${u.statutoryRule.subclassification_code}`
        : `Class ${u.statutoryRule.category_code}`,
      u.statutoryRule.subcategory,
      u.statutoryRule.annual_rate_pkr,
      taxAmount,
      "Personal Service (Rule 6)",
      u.serviceStatus ?? "PENDING",
      u.servedAt ?? "N/A",
      u.servedBy ?? "Muhammad Aslam, Tax Inspector",
      u.recipientName ?? "N/A",
      u.witnessDetails ?? "N/A"
    ];
  });

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

export function exportStatutorySlabDistributionCsv(
  input: readonly SlabYieldSummary[] | readonly StoredUnit[],
  financialYear = "2026-2027"
): string {
  void financialYear;
  let slabs: readonly SlabYieldSummary[];
  if (input.length > 0 && "subclassificationCode" in input[0]!) {
    slabs = input as readonly SlabYieldSummary[];
  } else if (input.length > 0 && "demandUnit" in input[0]!) {
    slabs = computeExecutiveMetrics(input as readonly StoredUnit[]).slabYields;
  } else {
    slabs = computeExecutiveMetrics([]).slabYields;
  }

  const headers = [
    "Schedule Sub-Class Code",
    "Primary Category Code",
    "Primary Category Name",
    "Tertiary Slab / Criteria",
    "Statutory Slab Rate (PKR)",
    "Rate Basis",
    "Assessed Units Count",
    "Assessed Demand (PKR)",
    "Realized Recovery (PKR)",
    "Outstanding Arrears (PKR)",
    "Recovery Compliance (%)"
  ];

  const rows = slabs.map((slab) => [
    slab.ruleCode ?? slab.statutoryTertiaryCode ?? slab.subclassificationCode ?? slab.categoryCode,
    slab.categoryCode,
    slab.categoryName,
    slab.tertiarySlab ?? "—",
    String(slab.slabRatePkr),
    slab.rateBasis,
    String(slab.assessedUnitsCount),
    String(slab.assessedDemandPkr),
    String(slab.realizedRecoveryPkr),
    String(slab.outstandingArrearsPkr),
    `${slab.recoveryRatePct}%`
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Export 4: Form P.F.T-5 Tax Clearance Issuance Log
 */
export function exportClearanceCertificatesCsv(
  clearanceCerts: readonly ClearanceCertificateRecord[]
): string {
  const headers = [
    "S.No",
    "Certificate No",
    "Issue Date",
    "Valid Until",
    "Assessee Legal Name",
    "Trade Name",
    "CNIC / NTN",
    "Statutory Category",
    "Schedule Class",
    "Financial Year",
    "Cleared Amount (PKR)",
    "Issued By Officer",
    "Officer Designation",
    "Official SHA-256 Digest"
  ];

  const rows = clearanceCerts.map((cert, idx) => [
    idx + 1,
    cert.certificateNumber,
    cert.issueDate,
    cert.validUntil,
    cert.assesseeLegalName,
    cert.assesseeTradeName ?? "",
    cert.cnicOrNtn,
    cert.categoryName,
    cert.scheduleEntry,
    cert.financialYear,
    cert.clearedAmountPkr,
    cert.issuedByOfficerName,
    cert.issuedByOfficerTitle,
    cert.officialSha256
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Export 5: Statutory Relief & Adjustment Register (Rules 5 & 10)
 */
export function exportReliefAdjustmentsCsv(
  discontinuances: readonly DiscontinuanceRecord[],
  refunds: readonly RefundAdjustmentRecord[]
): string {
  const headers = [
    "S.No",
    "Reference No",
    "Relief Type",
    "Assessee Legal Name",
    "Trade Name",
    "CNIC / NTN",
    "Filing Date",
    "Statutory Status",
    "Relief Amount (PKR)",
    "Grounds / Reason",
    "Adjudicating Authority",
    "Order Number",
    "Order Date"
  ];

  type MixedReliefRow = (string | number)[];
  const allRows: MixedReliefRow[] = [];

  let rowIdx = 1;
  for (const d of discontinuances) {
    allRows.push([
      rowIdx++,
      d.noticeNumber,
      "Rule 10 Trade Discontinuance",
      d.assesseeLegalName,
      d.assesseeTradeName ?? "",
      d.cnicOrNtn,
      d.discontinuanceDate,
      d.status,
      0,
      d.reason,
      d.adjudicatedBy ?? "Pending Adjudication",
      d.etoOrderNumber ?? "N/A",
      d.etoOrderDate ?? "N/A"
    ]);
  }

  for (const r of refunds) {
    allRows.push([
      rowIdx++,
      r.applicationNumber,
      `Rule 5 ${r.type === "CREDIT_ADJUSTMENT" ? "Credit Adjustment" : "Refund"}`,
      r.assesseeLegalName,
      r.assesseeTradeName ?? "",
      r.cnicOrNtn,
      r.filedAt.split("T")[0] ?? r.filedAt,
      r.status,
      r.amount,
      r.grounds,
      r.adjudicatedBy ?? "Pending Review",
      r.orderNumber ?? "N/A",
      r.orderDate ?? "N/A"
    ]);
  }

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...allRows.map((row) => row.map(escapeCsvCell).join(","))
  ];

  return lines.join("\r\n");
}

/**
 * Triggers browser download of generated CSV content.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

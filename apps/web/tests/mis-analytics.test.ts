import { describe, expect, it } from "vitest";
import {
  createInitialAppeals,
  createInitialClearanceCertificates,
  createInitialDiscontinuances,
  createInitialPilotUnits,
  createInitialRefundAdjustments
} from "../src/lib/pilot-store.js";
import {
  computeExecutiveMetrics,
  escapeCsvCell,
  exportClearanceCertificatesCsv,
  exportDefaulterRecoveryCsv,
  exportNoticeDispatchCsv,
  exportPft3RegisterCsv,
  exportReliefAdjustmentsCsv,
  exportStatutorySlabDistributionCsv
} from "../src/lib/mis-analytics.js";

describe("Phase 7: Executive MIS Analytics & Statutory Revenue Reporting Hub", () => {
  const units = createInitialPilotUnits();
  const appeals = createInitialAppeals();
  const discontinuances = createInitialDiscontinuances();
  const refundAdjustments = createInitialRefundAdjustments();
  const clearanceCertificates = createInitialClearanceCertificates();

  it("computes accurate revenue KPIs and budget pacing metrics from immutable ledger entries", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    expect(metrics.kpis.totalUnitsCount).toBe(units.length);
    expect(metrics.kpis.assessedDemand).toBeGreaterThan(0);
    expect(metrics.kpis.totalAssessedGross).toBeGreaterThanOrEqual(metrics.kpis.assessedDemand);
    expect(metrics.kpis.totalRealizedRecovery).toBeGreaterThanOrEqual(10000); // Unit 1 paid 10,000
    expect(metrics.kpis.outstandingArrears).toBeGreaterThan(0);
    expect(metrics.kpis.recoveryRatePct).toBeGreaterThan(0);
    expect(metrics.kpis.recoveryRatePct).toBeLessThanOrEqual(100);
    expect(metrics.kpis.baselineBudgetTargetPkr).toBe(50000);
    expect(metrics.kpis.targetRealizationPct).toBeGreaterThan(0);
    expect(metrics.kpis.paidUnitsCount).toBeGreaterThanOrEqual(1);
    expect(metrics.kpis.defaulterUnitsCount).toBeGreaterThanOrEqual(1);
  });

  it("computes category yield breakdown across all 11 Second Schedule statutory categories", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    expect(metrics.categoryYields).toHaveLength(11);

    // Verify all 11 category codes exist from "1" to "11"
    const codes = metrics.categoryYields.map((c) => c.categoryCode);
    for (let i = 1; i <= 11; i++) {
      expect(codes).toContain(String(i));
    }

    // Category 1 (Companies) should have Unit 1 (Vehari Cotton Ginners)
    const cat1 = metrics.categoryYields.find((c) => c.categoryCode === "1");
    expect(cat1).toBeDefined();
    expect(cat1!.unitCount).toBeGreaterThanOrEqual(1);
    expect(cat1!.assessedDemand).toBeGreaterThanOrEqual(10000);
    expect(cat1!.realizedRecovery).toBeGreaterThanOrEqual(10000);
    expect(cat1!.compliancePct).toBeGreaterThan(0);

    // Empty categories should have 0 units and 100% compliance
    const emptyCat = metrics.categoryYields.find((c) => c.unitCount === 0);
    if (emptyCat) {
      expect(emptyCat.assessedDemand).toBe(0);
      expect(emptyCat.realizedRecovery).toBe(0);
      expect(emptyCat.compliancePct).toBe(100);
    }
  });

  it("evaluates statutory defaulter aging funnel and arrears exposure", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    const funnel = metrics.defaulterFunnel;
    expect(funnel.paid.count).toBeGreaterThanOrEqual(1);
    expect(funnel.paid.amount).toBeGreaterThanOrEqual(10000);

    const totalFunnelUnits =
      funnel.current.count +
      funnel.overdue30Days.count +
      funnel.penaltyEligible.count +
      funnel.penalized.count +
      funnel.recoveryCertified.count +
      funnel.paid.count;

    expect(totalFunnelUnits).toBe(units.length);
    expect(funnel.totalDefaulterExposure).toBeGreaterThanOrEqual(0);
  });

  it("tracks operational pendency velocity across all five statutory desks", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    const p = metrics.pendency;
    expect(p.pendingDraftAssessments).toBeGreaterThanOrEqual(0);
    expect(p.unservedNotices).toBeGreaterThanOrEqual(0);
    expect(p.pendingFieldInspections).toBe(
      discontinuances.filter((d) => d.status === "PENDING_INSPECTION").length
    );
    expect(p.pendingAppeals).toBe(
      appeals.filter((a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED").length
    );
    expect(p.pendingRefunds).toBe(
      refundAdjustments.filter((r) => r.status === "PENDING_REVIEW").length
    );
    expect(p.clearanceCertificatesIssued).toBe(clearanceCertificates.length);
    expect(p.totalPendencyActions).toBe(
      p.pendingDraftAssessments +
        p.unservedNotices +
        p.pendingFieldInspections +
        p.pendingAppeals +
        p.pendingRefunds
    );
  });

  it("generates RFC-4180 compliant CSV for Form P.F.T-3 Assessment Register", () => {
    const csv = exportPft3RegisterCsv(units);
    expect(csv).toContain("Permanent Demand No,Assessment No,Assessee Legal Name");
    expect(csv).toContain("0001");
    expect(csv).toContain("Vehari Cotton Ginners");
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(units.length + 1);
  });

  it("generates RFC-4180 compliant CSV for Defaulter Recovery Roll", () => {
    const csv = exportDefaulterRecoveryCsv(units);
    expect(csv).toContain("Permanent Demand No,Assessee Legal Name,Trade Name");
    expect(csv).toContain("Land Revenue Certified");
    const lines = csv.split("\r\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("generates RFC-4180 compliant CSV for Notice Dispatch Register", () => {
    const csv = exportNoticeDispatchCsv(units);
    expect(csv).toContain("Notice No,Permanent Demand No,Assessee Legal Name");
    expect(csv).toContain("PFT-1/VEH/2026/");
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(units.length + 1);
  });

  it("generates RFC-4180 compliant CSV for Tax Clearance Log", () => {
    const csv = exportClearanceCertificatesCsv(clearanceCertificates);
    expect(csv).toContain("Certificate No,Issue Date,Valid Until,Assessee Legal Name");
    if (clearanceCertificates.length > 0) {
      expect(csv).toContain(clearanceCertificates[0]!.certificateNumber);
    }
  });

  it("generates RFC-4180 compliant CSV for Statutory Relief & Adjustment Register", () => {
    const csv = exportReliefAdjustmentsCsv(discontinuances, refundAdjustments);
    expect(csv).toContain("Reference No,Relief Type,Assessee Legal Name");
    expect(csv).toContain("Rule 10 Trade Discontinuance");
    expect(csv).toContain("Rule 5");
  });

  it("escapes CSV cells with quotes, commas, and newlines properly", () => {
    expect(escapeCsvCell("Standard Text")).toBe("Standard Text");
    expect(escapeCsvCell("Text, with comma")).toBe('"Text, with comma"');
    expect(escapeCsvCell('Text with "quotes"')).toBe('"Text with ""quotes"""');
    expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("computes tailored visual indicators and summary stats for Inspector, ETO, and Director roles", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    // Inspector summary stats
    expect(metrics.roleMetrics.inspector.totalAssignedUnits).toBe(units.length);
    expect(metrics.roleMetrics.inspector.servedNoticesCount).toBeGreaterThanOrEqual(1);
    expect(metrics.roleMetrics.inspector.serviceCoveragePct).toBeGreaterThan(0);
    expect(metrics.roleMetrics.inspector.serviceCoveragePct).toBeLessThanOrEqual(100);
    expect(metrics.roleMetrics.inspector.fieldComplianceRatePct).toBeGreaterThanOrEqual(0);

    // ETO summary stats
    expect(metrics.roleMetrics.eto.pendingAssessmentsCount).toBeGreaterThanOrEqual(0);
    expect(metrics.roleMetrics.eto.approvedAssessmentsCount).toBeGreaterThanOrEqual(1);
    expect(metrics.roleMetrics.eto.recoveryCertificatesCount).toBeGreaterThanOrEqual(0);

    // Director summary stats
    expect(metrics.roleMetrics.director.circleTargetRealizationPct).toBe(
      metrics.kpis.targetRealizationPct
    );
    expect(metrics.roleMetrics.director.divisionalCollectionTotalPkr).toBe(
      metrics.kpis.totalRealizedRecovery
    );
    expect(metrics.roleMetrics.director.totalDefaulterExposurePkr).toBe(
      metrics.defaulterFunnel.totalDefaulterExposure
    );
    expect(["OPTIMAL", "ATTENTION_REQUIRED"]).toContain(
      metrics.roleMetrics.director.circleIntegrityStatus
    );
  });

  it("computes statutory slab yields across all 47 Second Schedule sub-classes and tertiary tiers", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    expect(metrics.slabYields).toHaveLength(47);

    // Verify properties of each slab
    for (const slab of metrics.slabYields) {
      if (Number(slab.categoryCode) <= 6) {
        expect(slab.subclassificationCode).toBeTruthy();
      } else {
        expect(slab.subclassificationCode).toBeNull();
      }
      expect(slab.categoryCode).toBeTruthy();
      expect(slab.categoryName).toBeTruthy();
      expect(slab.tertiarySlab).toBeTruthy();
      expect(slab.slabRatePkr).toBeGreaterThan(0);
      expect(slab.rateBasis).toBeTruthy();
      expect(slab.assessedUnitsCount).toBeGreaterThanOrEqual(0);
      expect(slab.assessedDemandPkr).toBeGreaterThanOrEqual(0);
      expect(slab.realizedRecoveryPkr).toBeGreaterThanOrEqual(0);
      expect(slab.outstandingArrearsPkr).toBeGreaterThanOrEqual(0);
      expect(slab.recoveryRatePct).toBeGreaterThanOrEqual(0);
      expect(slab.recoveryRatePct).toBeLessThanOrEqual(100);
    }

    // Category 1(i): Companies <= 5M (Vehari Cotton Ginners)
    const slab1i = metrics.slabYields.find((s) => s.subclassificationCode === "1(i)");
    expect(slab1i).toBeDefined();
    expect(slab1i!.slabRatePkr).toBe(10000);
    expect(slab1i!.assessedUnitsCount).toBeGreaterThanOrEqual(1);
    expect(slab1i!.assessedDemandPkr).toBeGreaterThanOrEqual(10000);

    // Category 3(i)(b): Commercial Establishments - Other (Al-Madina)
    const slab3ib = metrics.slabYields.find((s) => s.ruleId === "PFT-3.i.b");
    expect(slab3ib).toBeDefined();
    expect(slab3ib!.slabRatePkr).toBe(4000);
    expect(slab3ib!.assessedUnitsCount).toBeGreaterThanOrEqual(1);
    expect(slab3ib!.assessedDemandPkr).toBeGreaterThanOrEqual(4000);
  });

  it("generates RFC-4180 compliant CSV for Statutory Slab Distribution", () => {
    const metrics = computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );

    const csv = exportStatutorySlabDistributionCsv(metrics.slabYields, "2026-2027");
    expect(csv).toContain(
      "Schedule Sub-Class Code,Primary Category Code,Primary Category Name,Tertiary Slab / Criteria,Statutory Slab Rate (PKR),Rate Basis,Assessed Units Count,Assessed Demand (PKR),Realized Recovery (PKR),Outstanding Arrears (PKR),Recovery Compliance (%)"
    );
    expect(csv).toContain("1(i)");
    expect(csv).toContain("3(i)");
    expect(csv).toContain("Companies");
    expect(csv).toContain("commercial establishments");

    const lines = csv.split("\r\n");
    expect(lines.length).toBe(48); // 47 slabs + 1 header
  });
});

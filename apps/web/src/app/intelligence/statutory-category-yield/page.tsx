"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadOperationalSurveyUnits } from "../../../lib/operational-survey";
import {
  fetchPotentialAssessmentUnitsFromDatabase,
  loadPersistedPotentialUnits,
  convertPotentialUnitToStoredUnit,
  type PotentialUnitRecord
} from "../../../lib/potential-units-storage";
import {
  computeExecutiveMetrics,
  type ExecutiveMetrics,
  type CategoryYieldSummary,
  type SlabYieldSummary,
  exportStatutorySlabDistributionCsv
} from "../../../lib/mis-analytics";
import type { StoredUnit } from "../../../lib/pilot-store";

export type RegisterSource = "PFT3" | "SURVEY" | "POTENTIAL";

export default function StatutoryCategoryYieldPage() {
  const [operationalUnits, setOperationalUnits] = useState<StoredUnit[]>([]);
  const [potentialUnits, setPotentialUnits] = useState<PotentialUnitRecord[]>([]);
  const [registerSource, setRegisterSource] = useState<RegisterSource>("PFT3");
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>("ALL");
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadOperationalSurveyUnits(),
      fetchPotentialAssessmentUnitsFromDatabase().catch(() => null)
    ])
      .then(([units, dbPotential]) => {
        if (!cancelled) {
          setOperationalUnits(units);
          const resolvedPotential = dbPotential ?? loadPersistedPotentialUnits();
          setPotentialUnits(resolvedPotential);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter 1: Form P.F.T-3 Statutory Enrolled Units (Rule 11) - strictly approved
  const pft3Units = useMemo(() => {
    return operationalUnits.filter(
      (u) =>
        u.assessments[0]?.status === "APPROVED" &&
        u.pft3Registered !== false &&
        !u.id.startsWith("pot-") &&
        !u.id.startsWith("pot_unit_") &&
        !u.demandUnit?.permanentDemandNo?.startsWith("V-") &&
        !u.demandNumber?.startsWith("V-")
    );
  }, [operationalUnits]);

  // Filter 2: Field Survey Discovery Pipeline Units (Rule 4) - unassessed / pending
  const surveyUnits = useMemo(() => {
    return operationalUnits.filter(
      (u) =>
        u.assessments[0]?.status !== "APPROVED" ||
        u.pft3Registered === false ||
        u.demandUnit?.permanentDemandNo?.startsWith("V-") ||
        u.demandNumber?.startsWith("V-")
    );
  }, [operationalUnits]);

  // Filter 3: Potential Register Units - converted to stored unit representation
  const convertedPotentialUnits = useMemo(() => {
    return potentialUnits.map(convertPotentialUnitToStoredUnit);
  }, [potentialUnits]);

  // Determine active units pool based on user-selected register source
  const activeUnits = useMemo(() => {
    switch (registerSource) {
      case "PFT3":
        return pft3Units;
      case "SURVEY":
        return surveyUnits;
      case "POTENTIAL":
        return convertedPotentialUnits;
      default:
        return pft3Units;
    }
  }, [registerSource, pft3Units, surveyUnits, convertedPotentialUnits]);

  // Derive metrics strictly for active units pool
  const metrics: ExecutiveMetrics = useMemo(() => {
    return computeExecutiveMetrics(activeUnits);
  }, [activeUnits]);

  if (loadError) {
    return <div style={{ padding: "3rem", color: "#991b1b" }}>{loadError}</div>;
  }

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading Statutory Category Yield Distribution...
      </div>
    );
  }

  const categoryYields = metrics.categoryYields;
  const slabYields = metrics.slabYields;

  const filteredSlabs = slabYields.filter((s: SlabYieldSummary) => {
    if (selectedCategoryCode !== "ALL" && s.categoryCode !== selectedCategoryCode) {
      return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const filenamePrefix =
      registerSource === "PFT3"
        ? "Statutory_PFT3_Category_Yield"
        : registerSource === "SURVEY"
          ? "Survey_Pipeline_Category_Yield"
          : "Potential_Register_Category_Yield";
    exportStatutorySlabDistributionCsv(filteredSlabs, `2026-2027_${filenamePrefix}`);
  };

  return (
    <div style={{ maxWidth: "76rem", margin: "1.5rem auto", padding: "1rem" }}>
      {/* Top Decoupled Navigation Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          background: "#ffffff",
          padding: "0.75rem 1.25rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>📊</span>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0d3822" }}>
            PTAS Punjab &bull; Statutory Intelligence &amp; Slabs Desk
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <a
            href="/"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#0d3822",
              color: "#ffffff",
              textDecoration: "none"
            }}
          >
            ← Main Dashboard
          </a>
          <a
            href="/intelligence/reports"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            📑 Statutory Reports Studio
          </a>
          <a
            href="/verify"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            🔍 Citizen Verify ↗
          </a>
        </div>
      </div>

      {/* Main Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#bbf7d0"
            }}
          >
            Intelligence &amp; Governance &bull; Statutory Analytics Studio
          </div>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.4rem", fontWeight: 700 }}>
            Statutory Category Yield Distribution (Second Schedule, Section 3)
          </h1>
          <span style={{ fontSize: "0.85rem", color: "#f0fdf4" }}>
            Comprehensive revenue yield and recovery analysis across all 11 Second Schedule
            statutory classes.
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
            onClick={handleExportCsv}
          >
            📥 Export Yield Register (CSV)
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ color: "#ffffff", borderColor: "#4ade80" }}
            onClick={() => (window.location.href = "/intelligence")}
          >
            ← Back to Intelligence Hub
          </button>
        </div>
      </div>

      {/* Register Source Segmented Control */}
      <div
        style={{
          background: "#ffffff",
          padding: "0.6rem 0.75rem",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          marginBottom: "1rem",
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginRight: "0.5rem"
          }}
        >
          Data Origin Scope:
        </span>

        <button
          type="button"
          onClick={() => {
            setRegisterSource("PFT3");
            setSelectedCategoryCode("ALL");
          }}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid",
            borderColor: registerSource === "PFT3" ? "#0d3822" : "#cbd5e1",
            background: registerSource === "PFT3" ? "#0d3822" : "#f8fafc",
            color: registerSource === "PFT3" ? "#ffffff" : "#1e293b",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "all 0.15s ease"
          }}
        >
          <span>🏛️</span>
          <span>Statutory Form P.F.T-3 Yield (Official Demand — {pft3Units.length} Units)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRegisterSource("SURVEY");
            setSelectedCategoryCode("ALL");
          }}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid",
            borderColor: registerSource === "SURVEY" ? "#0369a1" : "#cbd5e1",
            background: registerSource === "SURVEY" ? "#0369a1" : "#f8fafc",
            color: registerSource === "SURVEY" ? "#ffffff" : "#1e293b",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "all 0.15s ease"
          }}
        >
          <span>🔍</span>
          <span>Survey Discovery Pipeline Yield (Prospective — {surveyUnits.length} Units)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRegisterSource("POTENTIAL");
            setSelectedCategoryCode("ALL");
          }}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid",
            borderColor: registerSource === "POTENTIAL" ? "#b45309" : "#cbd5e1",
            background: registerSource === "POTENTIAL" ? "#b45309" : "#f8fafc",
            color: registerSource === "POTENTIAL" ? "#ffffff" : "#1e293b",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "all 0.15s ease"
          }}
        >
          <span>⚡</span>
          <span>
            Potential Register Projected Yield (Provisional — {potentialUnits.length} Units)
          </span>
        </button>
      </div>

      {/* Contextual Statutory Information Banner */}
      <div
        style={{
          background:
            registerSource === "PFT3"
              ? "#f0fdf4"
              : registerSource === "SURVEY"
                ? "#f0f9ff"
                : "#fffbeb",
          border:
            registerSource === "PFT3"
              ? "1px solid #bbf7d0"
              : registerSource === "SURVEY"
                ? "1px solid #bae6fd"
                : "1px solid #fde68a",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem"
        }}
      >
        <span style={{ fontSize: "1.25rem" }}>
          {registerSource === "PFT3" ? "🏛️" : registerSource === "SURVEY" ? "🔍" : "⚡"}
        </span>
        <div style={{ fontSize: "0.8rem", color: "#1e293b" }}>
          {registerSource === "PFT3" && (
            <span>
              <strong>Official Statutory Demand (Second Schedule &bull; Rule 11):</strong> This view
              isolates legally approved Form P.F.T-3 assessees representing enforceable demand,
              binding tax liability, and realized treasury recoveries under Section 3 of the 1977
              Act.
            </span>
          )}
          {registerSource === "SURVEY" && (
            <span>
              <strong>Secondary Operational Discovery Pipeline (Rule 4):</strong> Unassessed
              commercial establishments discovered during circle surveys. Figures depict prospective
              demand pending formal statutory assessment and ETO approval.
            </span>
          )}
          {registerSource === "POTENTIAL" && (
            <span>
              <strong>Secondary Third-Party Potential Register:</strong> Prospective commercial
              entities imported from external registers for field verification and taxpayer
              onboarding.
            </span>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem"
        }}
      >
        <div className="metric-card highlight">
          <p className="metric-label">
            {registerSource === "PFT3"
              ? "Statutory Classes"
              : registerSource === "SURVEY"
                ? "Survey Classes"
                : "Provisional Classes"}
          </p>
          <p className="metric-value">11 Categories</p>
          <p className="metric-subtext">Second Schedule, 1977 Act</p>
        </div>

        <div className="metric-card success">
          <p className="metric-label">
            {registerSource === "PFT3"
              ? "Total Assessed Demand"
              : registerSource === "SURVEY"
                ? "Prospective Pipeline Demand"
                : "Projected Potential Demand"}
          </p>
          <p className="metric-value">PKR {metrics.kpis.assessedDemand.toLocaleString()}</p>
          <p className="metric-subtext">
            {registerSource === "PFT3"
              ? `Across ${pft3Units.length} Approved Units`
              : registerSource === "SURVEY"
                ? `Across ${surveyUnits.length} Survey Units`
                : `Across ${potentialUnits.length} Potential Units`}
          </p>
        </div>

        <div className="metric-card info">
          <p className="metric-label">
            {registerSource === "PFT3"
              ? "Total Realized Revenue"
              : registerSource === "SURVEY"
                ? "Settled Pipeline Recoveries"
                : "Realized Direct Collections"}
          </p>
          <p className="metric-value">PKR {metrics.kpis.totalRealizedRecovery.toLocaleString()}</p>
          <p className="metric-subtext">Treasury Head B01601</p>
        </div>

        <div className="metric-card warning">
          <p className="metric-label">
            {registerSource === "PFT3"
              ? "Recovery Yield Rate"
              : registerSource === "SURVEY"
                ? "Pipeline Conversion Rate"
                : "Onboarding Realization"}
          </p>
          <p className="metric-value">{metrics.kpis.recoveryRatePct.toFixed(1)}%</p>
          <p className="metric-subtext">
            {registerSource === "PFT3" ? "Current Year Realization" : "Assessed vs Realized Yield"}
          </p>
        </div>
      </div>

      {/* Comparative Yield Bars */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "1.25rem",
          marginBottom: "1.5rem"
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 1rem", color: "#0d3822" }}>
          Statutory Category Yield Breakdown (11 Second Schedule Classes) &bull;{" "}
          {registerSource === "PFT3"
            ? "Approved Form PFT-3"
            : registerSource === "SURVEY"
              ? "Field Survey Pipeline"
              : "Potential Register"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {categoryYields.map((cat: CategoryYieldSummary) => {
            const pctOfTotal =
              metrics.kpis.assessedDemand > 0
                ? (cat.assessedDemand / metrics.kpis.assessedDemand) * 100
                : 0;
            const recoveryPct =
              cat.assessedDemand > 0 ? (cat.realizedRecovery / cat.assessedDemand) * 100 : 0;

            return (
              <div
                key={cat.categoryCode}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0.85rem 1rem",
                  background: selectedCategoryCode === cat.categoryCode ? "#f0fdf4" : "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onClick={() =>
                  setSelectedCategoryCode((prev) =>
                    prev === cat.categoryCode ? "ALL" : cat.categoryCode
                  )
                }
                title="Click to filter detailed slabs table below"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.35rem"
                  }}
                >
                  <div>
                    <span className="badge badge-draft" style={{ marginRight: "0.5rem" }}>
                      Class {cat.categoryCode}
                    </span>
                    <strong style={{ fontSize: "0.9rem" }}>{cat.categoryName}</strong>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "0.5rem" }}>
                      ({cat.unitCount} Units &bull; {cat.ruleCount} Slabs)
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "#0d3822" }}>
                      PKR {cat.assessedDemand.toLocaleString()}
                    </strong>
                    <span style={{ fontSize: "0.75rem", color: "#166534", marginLeft: "0.5rem" }}>
                      (Realized: PKR {cat.realizedRecovery.toLocaleString()} &bull;{" "}
                      {recoveryPct.toFixed(0)}%)
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#f1f5f9",
                    borderRadius: "4px",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(2, pctOfTotal))}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #0d3822 0%, #166534 100%)",
                      borderRadius: "4px"
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slabs and Tertiary Yield Register Table */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "1.25rem"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem"
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#0d3822" }}>
              Second Schedule Slabs &amp; Tertiary Yield Register
            </h2>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              {selectedCategoryCode === "ALL"
                ? `Showing all ${filteredSlabs.length} statutory slabs.`
                : `Filtered by Class ${selectedCategoryCode} (${filteredSlabs.length} slabs).`}
            </span>
          </div>
          {selectedCategoryCode !== "ALL" && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setSelectedCategoryCode("ALL")}
            >
              Reset Filter
            </button>
          )}
        </div>

        <table className="gov-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Class / Code</th>
              <th>Statutory Classification</th>
              <th>Statutory Slab</th>
              <th>Statutory Rate</th>
              <th>Assessed Units</th>
              <th style={{ textAlign: "right" }}>Total Assessed Demand</th>
              <th style={{ textAlign: "right" }}>Realized Revenue</th>
              <th style={{ textAlign: "right" }}>Yield %</th>
            </tr>
          </thead>
          <tbody>
            {filteredSlabs.map((s: SlabYieldSummary) => {
              const yieldPct =
                s.assessedDemandPkr > 0 ? (s.realizedRecoveryPkr / s.assessedDemandPkr) * 100 : 0;

              return (
                <tr key={s.ruleId}>
                  <td>
                    <span className="badge badge-draft">Class {s.ruleCode}</span>
                  </td>
                  <td>
                    <strong>{s.categoryName}</strong>
                    {s.subclassificationCode && (
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                        Sub-class: {s.subclassificationCode}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>{s.tertiarySlab || "Standard"}</td>
                  <td>
                    <strong>PKR {s.slabRatePkr.toLocaleString()}</strong>
                    <span style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}>
                      per {s.rateBasis}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: s.assessedUnitsCount > 0 ? "#0d3822" : "#94a3b8"
                      }}
                    >
                      {s.assessedUnitsCount}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong>PKR {s.assessedDemandPkr.toLocaleString()}</strong>
                  </td>
                  <td style={{ textAlign: "right", color: "#166534", fontWeight: 700 }}>
                    PKR {s.realizedRecoveryPkr.toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span
                      className={`badge ${yieldPct >= 80 ? "badge-approved" : yieldPct > 0 ? "badge-pending" : "badge-draft"}`}
                    >
                      {yieldPct.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { loadPilotState } from "../../../lib/pilot-store";
import {
  computeExecutiveMetrics,
  type ExecutiveMetrics,
  type CategoryYieldSummary,
  type SlabYieldSummary,
  exportStatutorySlabDistributionCsv
} from "../../../lib/mis-analytics";

export default function StatutoryCategoryYieldPage() {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>("ALL");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const state = loadPilotState();
    const m = computeExecutiveMetrics(state.units);
    setMetrics(m);
    setIsLoaded(true);
  }, []);

  if (!isLoaded || !metrics) {
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
    exportStatutorySlabDistributionCsv(filteredSlabs, "2026-2027");
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
          <a
            href="/admin/user-management"
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
            👥 User Management ↗
          </a>
        </div>
      </div>

      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
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
        <div style={{ display: "flex", gap: "0.75rem" }}>
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
            onClick={() => (window.location.href = "/?route=intelligence&tab=ANALYTICS")}
          >
            ← Back to Intelligence Hub
          </button>
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
          <p className="metric-label">Statutory Classes</p>
          <p className="metric-value">11 Categories</p>
          <p className="metric-subtext">Second Schedule, 1977 Act</p>
        </div>
        <div className="metric-card success">
          <p className="metric-label">Total Assessed Demand</p>
          <p className="metric-value">PKR {metrics.kpis.assessedDemand.toLocaleString()}</p>
          <p className="metric-subtext">Across All Assessed Slabs</p>
        </div>
        <div className="metric-card info">
          <p className="metric-label">Total Realized Revenue</p>
          <p className="metric-value">PKR {metrics.kpis.totalRealizedRecovery.toLocaleString()}</p>
          <p className="metric-subtext">Treasury Head B01601</p>
        </div>
        <div className="metric-card warning">
          <p className="metric-label">Recovery Yield Rate</p>
          <p className="metric-value">{metrics.kpis.recoveryRatePct.toFixed(1)}%</p>
          <p className="metric-subtext">Current Year Realization</p>
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
          Statutory Category Yield Breakdown (11 Second Schedule Classes)
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
                      ({cat.unitCount} Assessed Units &bull; {cat.ruleCount} Slabs)
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

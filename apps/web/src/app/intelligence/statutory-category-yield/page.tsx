"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadOperationalSurveyUnits } from "../../../lib/operational-survey";
import {
  fetchPotentialAssessmentUnitsFromDatabase,
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
import { StandalonePageHeader } from "../../../components/ui/StandalonePageHeader";

export type RegisterSource = "PFT3" | "SURVEY" | "POTENTIAL";

export default function StatutoryCategoryYieldPage() {
  const [operationalUnits, setOperationalUnits] = useState<StoredUnit[]>([]);
  const [potentialUnits, setPotentialUnits] = useState<PotentialUnitRecord[]>([]);
  const [potentialLoaded, setPotentialLoaded] = useState(false);
  const [isLoadingPotential, setIsLoadingPotential] = useState(false);
  const potentialLoadRequestedRef = useRef(false);
  const [registerSource, setRegisterSource] = useState<RegisterSource>("PFT3");
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>("ALL");
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOperationalSurveyUnits()
      .then((units) => {
        if (!cancelled) {
          setOperationalUnits(units);
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

  useEffect(() => {
    if (registerSource !== "POTENTIAL" || potentialLoadRequestedRef.current) {
      return;
    }
    let cancelled = false;
    potentialLoadRequestedRef.current = true;
    setIsLoadingPotential(true);

    void fetchPotentialAssessmentUnitsFromDatabase()
      .then((dbPotential) => {
        if (cancelled) return;
        if (dbPotential === null) {
          setLoadError("Unable to load potential assessment register from database.");
          return;
        }
        setPotentialUnits(dbPotential);
        setPotentialLoaded(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (cancelled) {
          potentialLoadRequestedRef.current = false;
        }
        if (!cancelled) {
          setIsLoadingPotential(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [registerSource]);

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

  // Filter 3: Potential Register Units - converted on demand only when active
  const convertedPotentialUnits = useMemo(() => {
    if (registerSource !== "POTENTIAL") return [];
    return potentialUnits.map(convertPotentialUnitToStoredUnit);
  }, [registerSource, potentialUnits]);

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
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page standalone-page--narrow"
        style={{ paddingTop: "3rem" }}
      >
        <section
          className="surface-card"
          style={{
            textAlign: "center",
            borderColor: "var(--color-danger-border)"
          }}
        >
          <h1
            style={{
              margin: "0 0 0.75rem",
              fontSize: "1.35rem",
              fontWeight: 800,
              color: "var(--color-danger-text)"
            }}
          >
            Unable to Load Category Yield Analytics
          </h1>
          <p
            role="alert"
            style={{
              margin: "0 auto 1.25rem",
              maxWidth: "34rem",
              fontSize: "0.9rem",
              color: "var(--color-text-muted)",
              lineHeight: 1.5
            }}
          >
            {loadError}
          </p>
          <div
            style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}
          >
            <Link href="/sign-in" className="btn-primary" style={{ textDecoration: "none" }}>
              Sign In to Department Desk
            </Link>
            <Link href="/" className="btn-secondary" style={{ textDecoration: "none" }}>
              Return to Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!isLoaded) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page"
        style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}
      >
        Loading Statutory Category Yield Distribution...
      </main>
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
    <div className="standalone-page" style={{ maxWidth: "76rem" }}>
      <StandalonePageHeader
        eyebrow="Intelligence & Governance • Statutory Analytics Studio"
        title="Statutory Category Yield Distribution (Second Schedule, Section 3)"
        subtitle="Comprehensive revenue yield and recovery analysis across all 11 Second Schedule statutory classes."
        backHref="/intelligence"
        backLabel="Back to Intelligence Hub"
        topLinks={[
          { label: "Main Dashboard", href: "/" },
          { label: "Statutory Reports Studio", href: "/intelligence/reports" },
          { label: "Citizen Verify ↗", href: "/verify", external: true }
        ]}
        bannerActions={
          <button type="button" className="btn-on-dark" onClick={handleExportCsv}>
            Export Yield Register (CSV)
          </button>
        }
      />

      <main id="main-content" tabIndex={-1}>
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
              Potential Register Projected Yield (Provisional —{" "}
              {isLoadingPotential
                ? "Loading…"
                : potentialLoaded
                  ? `${potentialUnits.length} Units`
                  : "Load on demand"}
              )
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
                <strong>Official Statutory Demand (Second Schedule &bull; Rule 11):</strong> This
                view isolates legally approved Form P.F.T-3 assessees representing enforceable
                demand, binding tax liability, and realized treasury recoveries under Section 3 of
                the 1977 Act.
              </span>
            )}
            {registerSource === "SURVEY" && (
              <span>
                <strong>Secondary Operational Discovery Pipeline (Rule 4):</strong> Unassessed
                commercial establishments discovered during circle surveys. Figures depict
                prospective demand pending formal statutory assessment and ETO approval.
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
                  : isLoadingPotential
                    ? "Loading Potential Units..."
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
            <p className="metric-value">
              PKR {metrics.kpis.totalRealizedRecovery.toLocaleString()}
            </p>
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
              {registerSource === "PFT3"
                ? "Current Year Realization"
                : "Assessed vs Realized Yield"}
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
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-muted)",
                          marginLeft: "0.5rem"
                        }}
                      >
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
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
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
                <th scope="col">Class / Code</th>
                <th scope="col">Statutory Classification</th>
                <th scope="col">Statutory Slab</th>
                <th scope="col">Statutory Rate</th>
                <th scope="col">Assessed Units</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Total Assessed Demand
                </th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Realized Revenue
                </th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Yield %
                </th>
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
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.75rem",
                            color: "var(--color-text-muted)"
                          }}
                        >
                          Sub-class: {s.subclassificationCode}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>{s.tertiarySlab || "Standard"}</td>
                    <td>
                      <strong>PKR {s.slabRatePkr.toLocaleString()}</strong>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        per {s.rateBasis}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            s.assessedUnitsCount > 0
                              ? "var(--color-brand-900)"
                              : "var(--color-text-muted)"
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
      </main>
    </div>
  );
}

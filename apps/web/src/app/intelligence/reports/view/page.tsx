"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadPilotState, type PilotState } from "../../../../lib/pilot-store";
import { computeLedgerBalance, computeDefaulterAging } from "@ptas/domain";
import {
  computeExecutiveMetrics,
  type CategoryYieldSummary,
  type SlabYieldSummary
} from "../../../../lib/mis-analytics";
import { downloadDocumentPdf } from "../../../../lib/pdf-export";

function ReportViewContent() {
  const searchParams = useSearchParams();
  const rawReportType = (searchParams.get("report") || "pft3-gazette")
    .toUpperCase()
    .replace(/-/g, "_");

  // Normalize report key
  let reportKey = rawReportType;
  if (rawReportType === "PFT3_GAZETTE" || rawReportType === "PFT3") reportKey = "PFT3_REGISTER";
  if (rawReportType === "DEFAULTERS_ROLL" || rawReportType === "DEFAULTERS")
    reportKey = "DEFAULTER_ROLL";
  if (rawReportType === "CLEARANCE" || rawReportType === "CLEARANCE_CERTIFICATES")
    reportKey = "CLEARANCE_LOG";
  if (rawReportType === "RELIEF" || rawReportType === "RELIEF_ADJUSTMENTS")
    reportKey = "RELIEF_REGISTER";
  if (rawReportType === "SCHEDULE_2" || rawReportType === "SLABS") reportKey = "SLAB_DISTRIBUTION";
  if (rawReportType === "SUMMARY" || rawReportType === "MIS") reportKey = "EXECUTIVE_MIS_SUMMARY";

  const [pilotState, setPilotState] = useState<PilotState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const state = loadPilotState();
    setPilotState(state);
    setIsLoaded(true);
  }, []);

  if (!isLoaded || !pilotState) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified statutory report context...
      </div>
    );
  }

  const units = pilotState.units || [];
  const clearanceCertificates = pilotState.clearanceCertificates || [];
  const discontinuances = pilotState.discontinuances || [];
  const refundAdjustments = pilotState.refundAdjustments || [];
  const appeals = pilotState.appeals || [];
  const currentOfficer = pilotState.currentOfficer;
  const misMetrics = computeExecutiveMetrics(
    units,
    appeals,
    discontinuances,
    refundAdjustments,
    clearanceCertificates
  );

  const getReportTitle = () => {
    switch (reportKey) {
      case "PFT3_REGISTER":
        return "FORM P.F.T-3: ASSESSMENT & DEMAND REGISTER (RULE 11)";
      case "DEFAULTER_ROLL":
        return "DEFAULTER ARREARS RECOVERY & REFERRAL ROLL (SECTION 3(4) & RULE 12)";
      case "NOTICE_DISPATCH":
        return "CIRCLE NOTICE DISPATCH & SERVICE REGISTER (RULE 6(2))";
      case "CLEARANCE_LOG":
        return "FORM P.F.T-5 TAX CLEARANCE CERTIFICATE ISSUANCE REGISTER";
      case "RELIEF_REGISTER":
        return "STATUTORY RELIEF & ADJUSTMENT REGISTER (RULES 5 & 10)";
      case "SLAB_DISTRIBUTION":
        return "STATUTORY SCHEDULE SUB-CLASS & TERTIARY SLABS DISTRIBUTION REGISTER";
      default:
        return "EXECUTIVE MIS COMPREHENSIVE REVENUE & COMPLIANCE BRIEF";
    }
  };

  const getReportFilename = () => {
    switch (reportKey) {
      case "PFT3_REGISTER":
        return "Form_PFT3_Gazette_Register.pdf";
      case "DEFAULTER_ROLL":
        return "Defaulter_Arrears_Recovery_Roll.pdf";
      case "NOTICE_DISPATCH":
        return "Notice_Service_Dispatch_Log.pdf";
      case "CLEARANCE_LOG":
        return "Tax_Clearance_Certificates_Log.pdf";
      case "RELIEF_REGISTER":
        return "Statutory_Relief_Adjustments_Log.pdf";
      case "SLAB_DISTRIBUTION":
        return "Schedule2_Rate_Card_Yields.pdf";
      default:
        return "Executive_MIS_Revenue_Brief.pdf";
    }
  };

  return (
    <div style={{ maxWidth: "75rem", margin: "1.5rem auto", padding: "1rem" }}>
      {/* Decoupled Top Navigation Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          background: "#ffffff",
          padding: "0.85rem 1.25rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          flexWrap: "wrap",
          gap: "0.75rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>📑</span>
          <div>
            <span
              style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0d3822", display: "block" }}
            >
              Statutory Reports Studio &bull; Official Gazetted Document
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Circle-Vehari &bull; Financial Year 2026-2027
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              downloadDocumentPdf("official-statutory-report-target", getReportFilename(), {
                orientation: "landscape"
              })
            }
            title="Download this authoritative gazetted report as a PDF"
          >
            📥 Download PDF (Landscape)
          </button>
          <a
            href="/intelligence/reports"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              background: "#0d3822",
              color: "#ffffff",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center"
            }}
          >
            ← Reports Studio
          </a>
        </div>
      </div>

      {/* Printable Report Target */}
      <div
        id="official-statutory-report-target"
        style={{
          background: "#ffffff",
          border: "2px solid #0d3822",
          borderRadius: "8px",
          padding: "2rem",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          fontFamily: "Georgia, serif"
        }}
      >
        {/* Official Letterhead Header */}
        <div
          style={{
            textAlign: "center",
            borderBottom: "2px solid #0d3822",
            paddingBottom: "1.25rem",
            marginBottom: "1.25rem"
          }}
        >
          <div style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>🏛️</div>
          <h3
            style={{
              margin: "0.15rem 0",
              color: "#0d3822",
              fontSize: "1.25rem",
              letterSpacing: "0.05em"
            }}
          >
            GOVERNMENT OF THE PUNJAB
          </h3>
          <p
            style={{
              margin: "0.15rem 0",
              fontSize: "0.9rem",
              color: "#334155",
              fontWeight: 600
            }}
          >
            DIRECTORATE GENERAL OF EXCISE, TAXATION &amp; NARCOTICS CONTROL
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
            MULTAN DIVISION &bull; DISTRICT VEHARI &bull; CIRCLE-VEHARI
          </p>

          <div
            style={{
              background: "#0d3822",
              color: "#ffffff",
              display: "inline-block",
              padding: "0.35rem 1.25rem",
              borderRadius: "4px",
              marginTop: "0.75rem",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.03em"
            }}
          >
            {getReportTitle()}
          </div>
        </div>

        {/* Meta Details Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "0.5rem 1.5rem",
            fontSize: "0.8rem",
            borderBottom: "1px solid #cbd5e1",
            paddingBottom: "0.75rem",
            marginBottom: "1.25rem",
            color: "#334155"
          }}
        >
          <div>
            <strong>Financial Year:</strong> 2026–2027
            <br />
            <strong>Jurisdiction:</strong> Circle-Vehari (Tehsil Vehari)
          </div>
          <div>
            <strong>Statutory Baseline:</strong> Section 3, Second Schedule
            <br />
            <strong>Accounting Head:</strong> B01601 - Tax on Professions
          </div>
          <div>
            <strong>Date of Run:</strong> {new Date().toLocaleDateString("en-GB")}
            <br />
            <strong>Generated By:</strong> {currentOfficer.name} ({currentOfficer.role})
          </div>
        </div>

        {/* Dynamic Report Content */}
        {reportKey === "EXECUTIVE_MIS_SUMMARY" && (
          <div>
            {/* Executive Synopsis */}
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                padding: "1rem",
                borderRadius: "6px",
                marginBottom: "1.25rem"
              }}
            >
              <h4 style={{ margin: "0 0 0.5rem", color: "#166534", fontSize: "0.95rem" }}>
                1. EXECUTIVE REVENUE REALIZATION SYNOPSIS:
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                  gap: "0.75rem",
                  fontSize: "0.85rem"
                }}
              >
                <div>
                  <span style={{ color: "#64748b" }}>Registered Assessees:</span>
                  <br />
                  <strong>{misMetrics.kpis.totalUnitsCount} Commercial Units</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Gross Assessed Demand:</span>
                  <br />
                  <strong>PKR {misMetrics.kpis.totalAssessedGross.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Realized Collections:</span>
                  <br />
                  <strong style={{ color: "#166534" }}>
                    PKR {misMetrics.kpis.totalRealizedRecovery.toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Recovery Yield Rate:</span>
                  <br />
                  <strong>{misMetrics.kpis.recoveryRatePct}% Realized</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Remaining Arrears:</span>
                  <br />
                  <strong style={{ color: "#b91c1c" }}>
                    PKR {misMetrics.kpis.outstandingArrears.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>

            {/* Category Yield Breakdown */}
            <h4 style={{ margin: "1rem 0 0.5rem", color: "#0d3822", fontSize: "0.95rem" }}>
              2. SECOND SCHEDULE STATUTORY CATEGORY REVENUE YIELD:
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                marginBottom: "1.25rem"
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                  <th style={{ padding: "0.4rem", textAlign: "left" }}>Entry</th>
                  <th style={{ padding: "0.4rem", textAlign: "left" }}>Category Name</th>
                  <th style={{ padding: "0.4rem", textAlign: "center" }}>Units</th>
                  <th style={{ padding: "0.4rem", textAlign: "right" }}>Demand (PKR)</th>
                  <th style={{ padding: "0.4rem", textAlign: "right" }}>Realized (PKR)</th>
                  <th style={{ padding: "0.4rem", textAlign: "right" }}>Compliance</th>
                </tr>
              </thead>
              <tbody>
                {misMetrics.categoryYields.map((cat: CategoryYieldSummary) => (
                  <tr key={cat.categoryCode} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.35rem" }}>{cat.categoryCode}</td>
                    <td style={{ padding: "0.35rem" }}>{cat.categoryName}</td>
                    <td style={{ padding: "0.35rem", textAlign: "center" }}>{cat.unitCount}</td>
                    <td style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}>
                      {cat.totalDemand.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "0.35rem",
                        textAlign: "right",
                        fontFamily: "monospace",
                        color: "#166534"
                      }}
                    >
                      {cat.realizedRecovery.toLocaleString()}
                    </td>
                    <td style={{ padding: "0.35rem", textAlign: "right", fontWeight: 700 }}>
                      {cat.compliancePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportKey === "PFT3_REGISTER" && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.75rem",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>PDN</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Legal Name</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>CNIC / NTN</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Category / Entry</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Demand (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Penalty (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Paid (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Balance (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const baseTax = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                let penalty = 0;
                let paid = 0;
                for (const e of u.ledgerEntries) {
                  if (e.entryType === "PENALTY_DEMAND") penalty += e.amount;
                  if (e.amount < 0) paid += Math.abs(e.amount);
                }
                const bal = computeLedgerBalance(u.ledgerEntries);
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                      {u.demandUnit.permanentDemandNo}
                      {u.provincialUin ? (
                        <span style={{ display: "block", fontSize: "0.7rem", color: "#0369a1" }}>
                          {u.provincialUin}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.35rem" }}>
                      <strong>{u.legalName}</strong>
                    </td>
                    <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                      {u.identifierValue}
                    </td>
                    <td style={{ padding: "0.35rem" }}>
                      Class {u.statutoryRule.subclassification_code}
                    </td>
                    <td style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}>
                      {baseTax.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "0.35rem",
                        textAlign: "right",
                        fontFamily: "monospace",
                        color: penalty > 0 ? "#b91c1c" : undefined
                      }}
                    >
                      {penalty > 0 ? penalty.toLocaleString() : "0"}
                    </td>
                    <td
                      style={{
                        padding: "0.35rem",
                        textAlign: "right",
                        fontFamily: "monospace",
                        color: "#166534"
                      }}
                    >
                      {paid.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "0.35rem",
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: bal > 0 ? "#b91c1c" : "#166534"
                      }}
                    >
                      {bal.toLocaleString()}
                    </td>
                    <td style={{ padding: "0.35rem", textAlign: "center" }}>
                      {bal <= 0 ? "PAID" : "ARREARS"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {reportKey === "DEFAULTER_ROLL" && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.75rem",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>PDN</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Address</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Schedule Entry</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Days Overdue</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Original Tax</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Penalty</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Total Arrears</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Recovery Stage</th>
              </tr>
            </thead>
            <tbody>
              {units
                .filter((u) => computeLedgerBalance(u.ledgerEntries) > 0)
                .map((u) => {
                  const aging = computeDefaulterAging(
                    u.ledgerEntries,
                    "2026-08-31",
                    undefined,
                    Boolean(u.isRecoveryCertified)
                  );
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                        {u.demandUnit.permanentDemandNo}
                        {u.provincialUin ? (
                          <span style={{ display: "block", fontSize: "0.7rem", color: "#0369a1" }}>
                            {u.provincialUin}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: "0.35rem" }}>
                        <strong>{u.legalName}</strong>
                      </td>
                      <td style={{ padding: "0.35rem" }}>{u.address}</td>
                      <td style={{ padding: "0.35rem" }}>
                        Class {u.statutoryRule.subclassification_code}
                      </td>
                      <td style={{ padding: "0.35rem", textAlign: "right" }}>
                        {aging.daysOverdue} days
                      </td>
                      <td
                        style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}
                      >
                        {aging.originalDemand.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "0.35rem",
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: "#b91c1c"
                        }}
                      >
                        {aging.penaltyDemand.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "0.35rem",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: "#b91c1c"
                        }}
                      >
                        {aging.remainingBalance.toLocaleString()}
                      </td>
                      <td style={{ padding: "0.35rem", textAlign: "center", fontWeight: 700 }}>
                        {aging.status}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}

        {reportKey === "NOTICE_DISPATCH" && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.75rem",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Notice No</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Demand No</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Address</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Amount (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Served Date</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Serving Officer</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                    PFT-1/VEH/2026/{u.id.slice(-4)}
                  </td>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                    {u.demandUnit.permanentDemandNo}
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <strong>{u.legalName}</strong>
                  </td>
                  <td style={{ padding: "0.35rem" }}>{u.address}</td>
                  <td style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}>
                    {(u.assessmentVersions[0]?.snapshot.taxAmount ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "center" }}>
                    <span
                      className={
                        u.serviceStatus === "SERVED" ? "badge badge-approved" : "badge badge-draft"
                      }
                    >
                      {u.serviceStatus ?? "PENDING"}
                    </span>
                  </td>
                  <td style={{ padding: "0.35rem" }}>{u.servedAt ?? "—"}</td>
                  <td style={{ padding: "0.35rem" }}>
                    {u.servedBy ?? "Muhammad Aslam, Inspector"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {reportKey === "CLEARANCE_LOG" && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.75rem",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Certificate No</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Issue Date</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Valid Until</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>CNIC / NTN</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Cleared (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {clearanceCertificates.map((cert) => (
                <tr key={cert.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace", fontWeight: 700 }}>
                    {cert.certificateNumber}
                  </td>
                  <td style={{ padding: "0.35rem" }}>{cert.issueDate}</td>
                  <td style={{ padding: "0.35rem" }}>{cert.validUntil}</td>
                  <td style={{ padding: "0.35rem" }}>
                    <strong>{cert.assesseeLegalName}</strong>
                  </td>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>{cert.cnicOrNtn}</td>
                  <td
                    style={{
                      padding: "0.35rem",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: "#166534",
                      fontWeight: 700
                    }}
                  >
                    {cert.clearedAmountPkr.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "center" }}>
                    <span className="badge badge-approved">VERIFIED CLEAR</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {reportKey === "RELIEF_REGISTER" && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.75rem",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Reference No</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Relief Type</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Filing Date</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Relief (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Order Number &amp; Date</th>
              </tr>
            </thead>
            <tbody>
              {discontinuances.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>{d.noticeNumber}</td>
                  <td style={{ padding: "0.35rem" }}>Rule 10 Discontinuance</td>
                  <td style={{ padding: "0.35rem" }}>
                    <strong>{d.assesseeLegalName}</strong>
                  </td>
                  <td style={{ padding: "0.35rem" }}>{d.discontinuanceDate}</td>
                  <td style={{ padding: "0.35rem", textAlign: "center" }}>
                    <span className="badge badge-approved">{d.status}</span>
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "right" }}>Closure</td>
                  <td style={{ padding: "0.35rem" }}>
                    {d.etoOrderNumber ?? "Pending"} ({d.etoOrderDate ?? "—"})
                  </td>
                </tr>
              ))}
              {refundAdjustments.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                    {r.applicationNumber}
                  </td>
                  <td style={{ padding: "0.35rem" }}>Rule 5 {r.type}</td>
                  <td style={{ padding: "0.35rem" }}>
                    <strong>{r.assesseeLegalName}</strong>
                  </td>
                  <td style={{ padding: "0.35rem" }}>{r.filedAt.split("T")[0]}</td>
                  <td style={{ padding: "0.35rem", textAlign: "center" }}>
                    <span className="badge badge-approved">{r.status}</span>
                  </td>
                  <td
                    style={{
                      padding: "0.35rem",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: "#166534"
                    }}
                  >
                    {r.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    {r.orderNumber ?? "Pending"} ({r.orderDate ?? "—"})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {reportKey === "SLAB_DISTRIBUTION" && (
          <table
            style={{
              width: "100%",
              fontSize: "0.75rem",
              borderCollapse: "collapse",
              marginBottom: "1.25rem"
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Sub-Class</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Category</th>
                <th style={{ padding: "0.35rem", textAlign: "left" }}>Tertiary Slab / Criteria</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Statutory Rate</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Units</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Demand (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Recovery (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "right" }}>Arrears (PKR)</th>
                <th style={{ padding: "0.35rem", textAlign: "center" }}>Rate %</th>
              </tr>
            </thead>
            <tbody>
              {misMetrics.slabYields.map((s: SlabYieldSummary) => (
                <tr key={s.ruleId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.35rem", fontWeight: 700 }}>
                    {s.ruleCode ??
                      s.statutoryTertiaryCode ??
                      s.subclassificationCode ??
                      s.categoryCode}
                  </td>
                  <td style={{ padding: "0.35rem" }}>{s.categoryName}</td>
                  <td style={{ padding: "0.35rem", color: "#475569" }}>
                    {s.statutoryTertiaryClassification ??
                      s.subclassificationLabel ??
                      s.tertiarySlab}
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}>
                    {s.slabRatePkr.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "center" }}>{s.unitCount}</td>
                  <td style={{ padding: "0.35rem", textAlign: "right", fontFamily: "monospace" }}>
                    {s.totalDemand.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "0.35rem",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: "#166534"
                    }}
                  >
                    {s.realizedRecovery.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "0.35rem",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: s.outstandingArrears > 0 ? "#b91c1c" : undefined
                    }}
                  >
                    {s.outstandingArrears.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.35rem", textAlign: "center", fontWeight: 700 }}>
                    {s.compliancePct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Official Authentication Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid #0d3822",
            paddingTop: "1.25rem",
            marginTop: "1.5rem"
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            <div>
              <strong>Official Gazetted Record:</strong> Punjab Professional Tax Administration
              System
            </div>
            <div>
              <strong>Provincial Accounting Head:</strong> B01601 &bull; Permanent Statutory Gazette
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{currentOfficer.name}</div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>{currentOfficer.title}</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Assessing Authority &bull; {currentOfficer.jurisdictionName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StatutoryReportViewPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Loading Official Gazetted Report...
        </div>
      }
    >
      <ReportViewContent />
    </Suspense>
  );
}

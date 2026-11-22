"use client";

import React, { use, useEffect, useState } from "react";
import {
  type StoredUnit,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord
} from "../../../../lib/pilot-store";
import { loadOperationalSurveyUnits } from "../../../../lib/operational-survey";
import {
  loadPersistedPotentialUnits,
  convertPotentialUnitToStoredUnit
} from "../../../../lib/potential-units-storage";
import {
  computeUnitFinancialSummary,
  getScheduleEntryLabel
} from "../../../../lib/statutory-forms";
import { downloadOfficialPdf } from "../../../../lib/pdf";
import { generateDocumentPin } from "@ptas/domain";
import { StandalonePageHeader } from "../../../../components/ui/StandalonePageHeader";
import { LockIcon } from "../../../../components/ui/Icons";

interface UnitDetailsPageProps {
  params: Promise<{ unitId: string }>;
}

export default function UnitDetailsPage({ params }: UnitDetailsPageProps) {
  const resolvedParams = use(params);
  const unitId = resolvedParams.unitId;

  const [unit, setUnit] = useState<StoredUnit | null>(null);
  const [challans, setChallans] = useState<Pft2ChallanRecord[]>([]);
  const [receipts, setReceipts] = useState<StatutoryReceiptRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadOperationalSurveyUnits()
      .catch((err) => {
        console.warn("Could not load operational survey units in details page:", err);
        return [] as StoredUnit[];
      })
      .then((available) => {
        if (cancelled) return;

        let found =
          available.find(
            (u) =>
              u.provincialUin === unitId ||
              u.pinNumber === unitId ||
              u.demandUnit?.permanentDemandNo === unitId ||
              u.id === unitId
          ) ?? null;

        if (!found) {
          const potentialUnits = loadPersistedPotentialUnits();
          const decodedId = decodeURIComponent(unitId);
          const pot = potentialUnits.find(
            (p) =>
              p.id === unitId ||
              p.potentialNumber === unitId ||
              p.pinNumber === unitId ||
              p.pinNumber === decodedId ||
              p.provincialUin === unitId ||
              p.provincialUin === decodedId ||
              p.identifierValue === unitId
          );
          if (pot) {
            found = convertPotentialUnitToStoredUnit(pot);
          }
        }

        if (found) {
          setUnit(found);
          setChallans([]);
          setReceipts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  if (!isLoaded) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page"
        style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}
      >
        Loading verified unit dossier...
      </main>
    );
  }

  if (!unit) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page standalone-page--narrow"
        style={{ paddingTop: "3rem" }}
      >
        <div
          className="surface-card"
          style={{ textAlign: "center", borderColor: "var(--color-danger-border)" }}
        >
          <h1
            style={{ color: "var(--color-danger-text)", margin: "0 0 0.5rem", fontSize: "1.35rem" }}
          >
            Taxpayer Unit Not Found
          </h1>
          <p style={{ color: "var(--color-text-muted)" }}>
            Unable to locate a registered taxpayer unit matching the requested identification in
            this jurisdiction.
          </p>
          <a href="/" className="btn-primary" style={{ marginTop: "1rem" }}>
            Return to Dashboard
          </a>
        </div>
      </main>
    );
  }

  const summary = computeUnitFinancialSummary(unit);
  const balance = summary.outstandingBalance;
  const assessedTax = summary.assessedCurrentTax;
  const arrears = summary.arrears;
  const totalDemand = summary.totalDemand;
  const totalPaid = summary.totalPaid;
  const schedEntry = getScheduleEntryLabel(unit.statutoryRule);
  const isCompliant = balance <= 0;
  const district = unit.districtName || "Vehari";
  const circle = unit.circleName || "Vehari Circle I (City / Commercial)";
  const tehsil =
    unit.locality?.toLowerCase().includes("burewala") || circle.toLowerCase().includes("burewala")
      ? "Burewala"
      : unit.locality?.toLowerCase().includes("mailsi") || circle.toLowerCase().includes("mailsi")
        ? "Mailsi"
        : "Vehari";
  const pdn = unit.demandUnit?.permanentDemandNo || unit.demandNumber || "Unallocated";
  const provincialUin = unit.provincialUin;
  const cleanAddress = unit.address.replace(/\s*•\s*Locality:\s*.*$/i, "").trim();

  return (
    <div className="standalone-page" style={{ maxWidth: "1600px" }}>
      <StandalonePageHeader
        title={unit.legalName}
        subtitle={
          <>
            Demand Number (PDN): <strong style={{ fontFamily: "var(--font-mono)" }}>{pdn}</strong>{" "}
            &bull; Provincial UIN:{" "}
            <strong style={{ fontFamily: "var(--font-mono)" }}>{provincialUin}</strong> &bull;{" "}
            {circle} &bull; Tehsil {tehsil} &bull; District {district}
          </>
        }
        backHref="/assessment/pft3"
        backLabel="Return to P.F.T-3 Register"
        topLinks={[{ label: "Main Dashboard", href: "/" }]}
        bannerActions={
          <>
            <a
              href={`/documents/pft1?pin=${unit.provincialUin || unit.pinNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-on-dark"
            >
              Form P.F.T-1 Notice ↗
            </a>
            <a
              href={`/documents/pf2/new?pin=${unit.provincialUin || unit.pinNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-on-dark"
            >
              PFT2 Challan ↗
            </a>
            <button
              type="button"
              className="btn-on-dark"
              onClick={() =>
                downloadOfficialPdf({
                  type: "UNIT_DOSSIER",
                  documentIdOrData: unit,
                  defaultFilename: `Unit_${unit.demandUnit?.permanentDemandNo || unit.id}_Dossier.pdf`
                })
              }
            >
              Download Dossier (PDF)
            </button>
          </>
        }
      />

      <main id="main-content" tabIndex={-1}>
        {/* Locked Taxpayer Establishment Dossier Context Banner */}
        <div
          className="alert alert-success no-print"
          style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <LockIcon size={16} />
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--color-success-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                Originating Assessee Dossier (Locked)
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "0.2rem"
                }}
              >
                <span style={{ fontWeight: 800, color: "var(--color-text)", fontSize: "1rem" }}>
                  {unit.legalName}
                </span>
                {unit.tradeName && unit.tradeName !== unit.legalName && (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    ({unit.tradeName})
                  </span>
                )}
                <span style={{ color: "var(--color-text-muted)" }}>&bull;</span>
                <span className="badge badge-draft">UIN: {provincialUin}</span>
                <span style={{ color: "var(--color-text-muted)" }}>&bull;</span>
                <span className="badge badge-approved">PDN: {pdn}</span>
                <span style={{ color: "var(--color-text-muted)" }}>&bull;</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    background: "var(--color-surface-muted)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    fontSize: "0.82rem"
                  }}
                >
                  {unit.identifierType}: {unit.identifierValue}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>&bull;</span>
                <span
                  style={{
                    color: "var(--color-success-text)",
                    fontWeight: 700,
                    fontSize: "0.82rem"
                  }}
                >
                  {schedEntry} &bull; PKR {unit.statutoryRule.annual_rate_pkr.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div id="unit-dossier-document">
          {/* Core Profile & Master Registration */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.85rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#0d3822",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <span>🏢</span> Master Registration Particulars
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
                gap: "1rem",
                fontSize: "0.85rem"
              }}
            >
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Legal Entity Name:
                </span>
                <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{unit.legalName}</strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Trade / Taxpayer Name:
                </span>
                <strong>{unit.tradeName || unit.legalName}</strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Identifier ({unit.identifierType}):
                </span>
                <strong style={{ fontFamily: "monospace" }}>{unit.identifierValue}</strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  {pdn.startsWith("POT-") ? "Potential No:" : "Permanent Demand No (PDN):"}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 800,
                    color: pdn.startsWith("POT-") ? "#b45309" : "#166534",
                    fontSize: "0.95rem"
                  }}
                >
                  {unit.demandUnit?.permanentDemandNo || unit.demandNumber || "Unallocated"}
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  {provincialUin?.startsWith("Potential-")
                    ? "Provisional PIN:"
                    : "Provincial PIN / UIN:"}
                </span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e3a8a" }}>
                  {provincialUin || unit.pinNumber || "Unassigned"}
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Assessment Survey No:
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "#334155",
                    background: "#f1f5f9",
                    padding: "0.1rem 0.35rem",
                    borderRadius: "3px"
                  }}
                >
                  {unit.assessmentNumber || "—"}
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Commercial Address:
                </span>
                <span style={{ color: "#0f172a", fontWeight: 500 }}>{cleanAddress}</span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Locality / Area:
                </span>
                <span style={{ color: "#0f172a", fontWeight: 600 }}>{unit.locality || "—"}</span>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Administrative Jurisdiction:
                </span>
                <span style={{ fontWeight: 600, color: "#1e293b" }}>
                  {circle} &bull; Tehsil {tehsil} &bull; District {district}
                </span>
              </div>
            </div>
          </div>

          {/* Statutory Classification & Prescribed Tariff (Rule Pack V3) */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.85rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#0d3822",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <span>📜</span> Statutory Classification &amp; Prescribed Tariff (Punjab Finance Act
              1977)
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
                gap: "1rem",
                fontSize: "0.85rem"
              }}
            >
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Second Schedule Entry:
                </span>
                <strong style={{ color: "#166534" }}>{schedEntry}</strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Statutory Category:
                </span>
                <strong>{unit.statutoryRule.category}</strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Sub-Classification:
                </span>
                <span>
                  {unit.statutoryRule.subclassification_code
                    ? `${unit.statutoryRule.subclassification_code} — ${unit.statutoryRule.subclassification_label || ""}`
                    : "General / Standard Class"}
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Tertiary Slab / Basis:
                </span>
                <span>
                  {unit.statutoryRule.statutory_tertiary_classification ||
                    unit.statutoryTertiaryCode ||
                    "Standard Basis"}
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Prescribed Statutory Rate:
                </span>
                <strong style={{ fontSize: "1.05rem", color: "#0d3822" }}>
                  PKR {unit.statutoryRule.annual_rate_pkr.toLocaleString()} /-
                </strong>
              </div>
              <div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Rate Basis &amp; Periodicity:
                </span>
                <span>{unit.statutoryRule.rate_basis || "Per Establishment / Per Annum"}</span>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Full Statutory Description:
                </span>
                <span style={{ color: "#475569" }}>
                  {unit.statutoryRule.official_text || unit.statutoryRule.category}
                </span>
              </div>
            </div>
          </div>

          {/* Current Financial Standing & Compliance Status */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.85rem",
                flexWrap: "wrap",
                gap: "0.5rem"
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "#0d3822",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                <span>📊</span> Financial Standing (FY 2026-2027)
              </h3>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  padding: "0.2rem 0.65rem",
                  borderRadius: "4px",
                  background: isCompliant ? "#dcfce7" : "#fee2e2",
                  color: isCompliant ? "#166534" : "#991b1b",
                  border: `1px solid ${isCompliant ? "#86efac" : "#fca5a5"}`
                }}
              >
                {isCompliant
                  ? "✓ FULLY COMPLIANT (ZERO BALANCE)"
                  : `⚠ DEFAULT: PKR ${balance.toLocaleString()} OUTSTANDING`}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                gap: "0.75rem"
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Assessed Current Tax:
                </span>
                <strong style={{ fontSize: "1.05rem", color: "#0d3822" }}>
                  PKR {assessedTax.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Prior Year Arrears:
                </span>
                <strong
                  style={{
                    fontSize: "1.05rem",
                    color: arrears > 0 ? "#b45309" : "#64748b"
                  }}
                >
                  PKR {arrears.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Total Net Demand:
                </span>
                <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
                  PKR {totalDemand.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.72rem",
                    display: "block"
                  }}
                >
                  Realized Payments:
                </span>
                <strong style={{ fontSize: "1.05rem", color: "#166534" }}>
                  PKR {totalPaid.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: isCompliant ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${isCompliant ? "#86efac" : "#fecaca"}`,
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <span
                  style={{
                    color: isCompliant ? "#166534" : "#991b1b",
                    fontSize: "0.72rem",
                    display: "block",
                    fontWeight: 700
                  }}
                >
                  Outstanding Balance:
                </span>
                <strong
                  style={{
                    fontSize: "1.15rem",
                    color: isCompliant ? "#166534" : "#b91c1c"
                  }}
                >
                  PKR {balance.toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          {/* Append-Only Demand Ledger */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.95rem",
                color: "#0d3822",
                fontWeight: 700
              }}
            >
              Demand &amp; Payment Ledger Transactions (Rule 11)
            </h3>
            <div className="table-container">
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th scope="col">Entry ID</th>
                    <th scope="col">Type</th>
                    <th scope="col">Financial Year</th>
                    <th scope="col">Effective Date</th>
                    <th scope="col">Amount (PKR)</th>
                    <th scope="col">Balance After</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let runningBalance = 0;
                    const entries = unit.ledgerEntries || [];
                    if (entries.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: "center",
                              color: "var(--color-text-muted)",
                              padding: "1rem"
                            }}
                          >
                            No transactional ledger entries recorded for this unit.
                          </td>
                        </tr>
                      );
                    }
                    return entries.map((entry) => {
                      runningBalance += entry.amount;
                      return (
                        <tr key={entry.id}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                            {entry.id}
                          </td>
                          <td>
                            <span className="badge badge-draft" style={{ fontSize: "0.7rem" }}>
                              {entry.entryType}
                            </span>
                          </td>
                          <td>{entry.financialYearId}</td>
                          <td>{entry.postedAt ? entry.postedAt.split("T")[0] : "-"}</td>
                          <td>
                            <strong>PKR {Math.abs(entry.amount).toLocaleString()}</strong>
                            {(entry.amount < 0 || entry.entryType === "PAYMENT_CREDIT") && (
                              <span
                                style={{ color: "#166534", fontSize: "0.75rem", marginLeft: "4px" }}
                              >
                                (CR)
                              </span>
                            )}
                          </td>
                          <td>
                            <strong style={{ color: runningBalance > 0 ? "#b91c1c" : "#166534" }}>
                              PKR {runningBalance.toLocaleString()}
                            </strong>
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "#475569" }}>
                            {String(entry.metadata?.description || entry.sourceType || "-")}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Issued Form PFT-2 Challans */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.95rem",
                color: "#0d3822",
                fontWeight: 700
              }}
            >
              Issued PFT2 Challans ({challans.length})
            </h3>
            {challans.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.85rem" }}>
                No PFT2 payment challans have been issued for this unit yet.
              </p>
            ) : (
              <div className="table-container">
                <table className="gov-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th scope="col">Challan / Notice #</th>
                      <th scope="col">Security Code</th>
                      <th scope="col">Scope</th>
                      <th scope="col">Amount (PKR)</th>
                      <th scope="col">Issue Date</th>
                      <th scope="col">Due Date</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {challans.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.challanNumber}</strong>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.7rem",
                              color: "#1e3a8a",
                              fontFamily: "monospace"
                            }}
                          >
                            {c.noticeNumber}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, color: "#0369a1" }}>
                          🔐{" "}
                          {c.pin && /^\d{6}$/.test(c.pin)
                            ? c.pin
                            : generateDocumentPin(c.noticeNumber || c.challanNumber || "PTAS-PFT2")}
                        </td>
                        <td>{c.demandScope ?? "CURRENT"}</td>
                        <td>
                          <strong>PKR {c.amountPayable.toLocaleString()}</strong>
                        </td>
                        <td>{c.issueDate}</td>
                        <td>{c.dueDate}</td>
                        <td>
                          <span
                            className={`badge ${c.status === "RECEIVED" ? "badge-approved" : c.status === "CANCELLED" ? "badge-returned" : "badge-pending"}`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Statutory Payment Receipts */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1.25rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)"
            }}
          >
            <h3
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.95rem",
                color: "#0d3822",
                fontWeight: 700
              }}
            >
              Statutory Payment Receipts ({receipts.length})
            </h3>
            {receipts.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.85rem" }}>
                No payments have been acknowledged or recorded for this unit yet.
              </p>
            ) : (
              <div className="table-container">
                <table className="gov-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th scope="col">Receipt #</th>
                      <th scope="col">Payment Source</th>
                      <th scope="col">Amount (PKR)</th>
                      <th scope="col">Receipt Date</th>
                      <th scope="col">Channel &amp; Scroll Ref</th>
                      <th scope="col">Receiving Officer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong style={{ color: "#166534" }}>{r.receiptNumber}</strong>
                        </td>
                        <td>
                          <span className="badge badge-approved" style={{ fontSize: "0.7rem" }}>
                            {r.paymentSource ?? "ISSUED_PFT2"}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#166534" }}>
                            PKR {r.amountPaidPkr.toLocaleString()}
                          </strong>
                        </td>
                        <td>
                          <span style={{ display: "block", fontWeight: 600, color: "#065f46" }}>
                            💳 {r.dateOfReceipt}
                          </span>
                          {r.entryTimestamp && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.7rem",
                                color: "var(--color-text-muted)"
                              }}
                            >
                              🕒 Entry: {new Date(r.entryTimestamp).toLocaleDateString("en-PK")}
                            </span>
                          )}
                        </td>
                        <td>
                          <span>{r.paymentChannel}</span>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.7rem",
                              fontFamily: "monospace",
                              color: "#1e3a8a"
                            }}
                          >
                            {r.bankScrollRef}
                          </span>
                        </td>
                        <td>{r.receivingOfficerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

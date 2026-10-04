"use client";

import React, { use, useEffect, useState } from "react";
import {
  type StoredUnit,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord
} from "../../../../lib/pilot-store";
import { loadOperationalSurveyUnits } from "../../../../lib/operational-survey";
import { loadPersistedPotentialUnits } from "../../../../lib/potential-units-storage";
import {
  computeUnitFinancialSummary,
  getScheduleEntryLabel
} from "../../../../lib/statutory-forms";
import { downloadOfficialPdf } from "../../../../lib/pdf";

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
    void loadOperationalSurveyUnits()
      .then((available) => {
        if (cancelled) return;

        let found =
          available.find(
            (u) =>
              u.provincialUin === unitId ||
              u.pinNumber === unitId ||
              u.demandUnit?.permanentDemandNo === unitId ||
              u.id === unitId ||
              (unitId && u.legalName.toLowerCase().includes(unitId.toLowerCase()))
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
              p.identifierValue === unitId ||
              (unitId && p.legalName.toLowerCase().includes(unitId.toLowerCase()))
          );
          if (pot) {
            found = {
              id: pot.id,
              provincialUin: pot.pinNumber,
              pinNumber: pot.pinNumber,
              legalName: pot.legalName,
              tradeName: pot.tradeName,
              address: pot.address,
              locality: pot.locality,
              circleName: pot.circleName ?? "Circle-Vehari",
              districtName: pot.districtName ?? "Vehari",
              category: pot.categoryName,
              subclass: pot.subclassificationName || pot.categoryCode,
              identifiers: [{ type: pot.identifierType, value: pot.identifierValue }],
              demandUnit: {
                id: pot.id,
                permanentDemandNo: pot.potentialNumber,
                taxpayerUnitId: pot.id,
                circleId: pot.circleId,
                status: "ACTIVE"
              },
              assessments: [],
              assessmentVersions: [],
              ledgerEntries: [],
              surveys: []
            } as unknown as StoredUnit;
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
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified unit dossier...
      </div>
    );
  }

  if (!unit) {
    return (
      <div
        style={{
          maxWidth: "48rem",
          margin: "3rem auto",
          padding: "2rem",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          textAlign: "center"
        }}
      >
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem" }}>Taxpayer Unit Not Found</h2>
        <p style={{ color: "#475569" }}>
          Unable to locate a registered taxpayer unit matching the requested identification in this
          jurisdiction.
        </p>
        <a
          href="/"
          className="btn-primary"
          style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
        >
          Return to Dashboard
        </a>
      </div>
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
    <div
      style={{
        maxWidth: "1600px",
        width: "100%",
        margin: "1.25rem auto",
        padding: "1rem 1.5rem",
        boxSizing: "border-box"
      }}
    >
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
          <span style={{ fontSize: "1.2rem" }}>🏛️</span>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0d3822" }}>
            PTAS Punjab &bull; Taxpayer Unit Official Dossier
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <a
            href="/assessment/pft3"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#334155",
              textDecoration: "none"
            }}
          >
            ← PFT-3 Register
          </a>
          <a
            href="/"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#0d3822",
              color: "#ffffff",
              textDecoration: "none"
            }}
          >
            Main Dashboard
          </a>
        </div>
      </div>

      {/* Locked Taxpayer Establishment Dossier Context Banner */}
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "8px",
          padding: "0.75rem 1.25rem",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.1rem" }}>🔒</span>
          <div>
            <span
              style={{
                display: "block",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "#166534",
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
              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "1.0rem" }}>
                {unit.legalName}
              </span>
              {unit.tradeName && unit.tradeName !== unit.legalName && (
                <span style={{ color: "#475569", fontSize: "0.85rem" }}>({unit.tradeName})</span>
              )}
              <span style={{ color: "#94a3b8" }}>•</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#1e3a8a",
                  background: "#e0f2fe",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  fontSize: "0.82rem"
                }}
              >
                UIN: {provincialUin}
              </span>
              <span style={{ color: "#94a3b8" }}>•</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#166534",
                  background: "#dcfce7",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  fontSize: "0.82rem"
                }}
              >
                PDN: {pdn}
              </span>
              <span style={{ color: "#94a3b8" }}>•</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "#334155",
                  background: "#f1f5f9",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  fontSize: "0.82rem"
                }}
              >
                {unit.identifierType}: {unit.identifierValue}
              </span>
              <span style={{ color: "#94a3b8" }}>•</span>
              <span style={{ color: "#166534", fontWeight: 700, fontSize: "0.82rem" }}>
                {schedEntry} &bull; PKR {unit.statutoryRule.annual_rate_pkr.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Action Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.25rem 1.5rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
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
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#bbf7d0"
            }}
          >
            Government of the Punjab &bull; Excise, Taxation &amp; Narcotics Control Department
          </div>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.35rem", fontWeight: 700 }}>
            {unit.legalName}
          </h1>
          <span style={{ fontSize: "0.85rem", color: "#f0fdf4" }}>
            Demand Number (PDN): <strong style={{ fontFamily: "monospace" }}>{pdn}</strong> &bull;
            Provincial UIN: <strong style={{ fontFamily: "monospace" }}>{provincialUin}</strong>{" "}
            &bull; {circle} &bull; Tehsil {tehsil} &bull; District {district}
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={`/documents/pft1?pin=${unit.provincialUin || unit.pinNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              backgroundColor: "#ffffff",
              color: "#0d3822",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            📄 Form P.F.T-1 Notice ↗
          </a>
          <a
            href={`/documents/pf2/new?pin=${unit.provincialUin || unit.pinNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              backgroundColor: "#ffffff",
              color: "#0d3822",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            🏛️ PFT2 Challan ↗
          </a>
          <button
            type="button"
            className="btn-secondary"
            style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
            onClick={() =>
              downloadOfficialPdf({
                type: "UNIT_DOSSIER",
                documentIdOrData: unit,
                defaultFilename: `Unit_${unit.demandUnit?.permanentDemandNo || unit.id}_Dossier.pdf`
              })
            }
          >
            📥 Download Dossier (PDF)
          </button>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Legal Entity Name:
              </span>
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{unit.legalName}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Trade / Taxpayer Name:
              </span>
              <strong>{unit.tradeName || unit.legalName}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Identifier ({unit.identifierType}):
              </span>
              <strong style={{ fontFamily: "monospace" }}>{unit.identifierValue}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                {provincialUin?.startsWith("Potential-")
                  ? "Provisional PIN:"
                  : "Provincial PIN / UIN:"}
              </span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e3a8a" }}>
                {provincialUin || unit.pinNumber || "Unassigned"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Commercial Address:
              </span>
              <span style={{ color: "#0f172a", fontWeight: 500 }}>{cleanAddress}</span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Locality / Area:
              </span>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{unit.locality || "—"}</span>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Second Schedule Entry:
              </span>
              <strong style={{ color: "#166534" }}>{schedEntry}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Statutory Category:
              </span>
              <strong>{unit.statutoryRule.category}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Sub-Classification:
              </span>
              <span>
                {unit.statutoryRule.subclassification_code
                  ? `${unit.statutoryRule.subclassification_code} — ${unit.statutoryRule.subclassification_label || ""}`
                  : "General / Standard Class"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Tertiary Slab / Basis:
              </span>
              <span>
                {unit.statutoryRule.statutory_tertiary_classification ||
                  unit.statutoryTertiaryCode ||
                  "Standard Basis"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Prescribed Statutory Rate:
              </span>
              <strong style={{ fontSize: "1.05rem", color: "#0d3822" }}>
                PKR {unit.statutoryRule.annual_rate_pkr.toLocaleString()} /-
              </strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
                Rate Basis &amp; Periodicity:
              </span>
              <span>{unit.statutoryRule.rate_basis || "Per Establishment / Per Annum"}</span>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
              <span style={{ color: "#64748b", fontSize: "0.72rem", display: "block" }}>
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
                  <th>Entry ID</th>
                  <th>Type</th>
                  <th>Financial Year</th>
                  <th>Effective Date</th>
                  <th>Amount (PKR)</th>
                  <th>Balance After</th>
                  <th>Description</th>
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
                          style={{ textAlign: "center", color: "#64748b", padding: "1rem" }}
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
                        <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{entry.id}</td>
                        <td>
                          <span className="badge badge-draft" style={{ fontSize: "0.7rem" }}>
                            {entry.entryType}
                          </span>
                        </td>
                        <td>{entry.financialYearId}</td>
                        <td>{entry.postedAt ? entry.postedAt.split("T")[0] : "-"}</td>
                        <td>
                          <strong>PKR {Math.abs(entry.amount).toLocaleString()}</strong>
                          {entry.amount < 0 && (
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
            <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>
              No PFT2 payment challans have been issued for this unit yet.
            </p>
          ) : (
            <div className="table-container">
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Challan / Notice #</th>
                    <th>Verification PIN</th>
                    <th>Scope</th>
                    <th>Amount (PKR)</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Status</th>
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
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.pin}</td>
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
            <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>
              No payments have been acknowledged or recorded for this unit yet.
            </p>
          ) : (
            <div className="table-container">
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Payment Source</th>
                    <th>Amount (PKR)</th>
                    <th>Receipt Date</th>
                    <th>Channel &amp; Scroll Ref</th>
                    <th>Receiving Officer</th>
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
                      <td>{r.dateOfReceipt}</td>
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
    </div>
  );
}

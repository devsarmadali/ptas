"use client";

import React, { use, useEffect, useState } from "react";
import {
  type StoredUnit,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord
} from "../../../../lib/pilot-store";
import { loadOperationalSurveyUnits } from "../../../../lib/operational-survey";
import { computeUnitFinancialSummary } from "../../../../lib/statutory-forms";
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

        const found =
          available.find(
            (u) =>
              u.provincialUin === unitId ||
              u.pinNumber === unitId ||
              u.demandUnit?.permanentDemandNo === unitId ||
              u.id === unitId ||
              (unitId && u.legalName.toLowerCase().includes(unitId.toLowerCase()))
          ) ?? null;

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
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem" }}>
          No Registered Taxpayer Units Found
        </h2>
        <p style={{ color: "#475569" }}>
          Please initialize pilot data from the main PTAS dashboard to view unit dossiers.
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

  return (
    <div
      style={{
        maxWidth: "1720px",
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
            PTAS Punjab &bull; Unit Dossier Archive
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
        </div>
      </div>

      {/* Locked Taxpayer Establishment Dossier Context */}
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
                fontSize: "0.75rem",
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
              <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
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
                  color: "#047857",
                  background: "#dcfce7",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  fontSize: "0.85rem"
                }}
              >
                PIN: {unit.provincialUin || unit.pinNumber || "— Not assigned"}
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
                  fontSize: "0.85rem"
                }}
              >
                PDN: {unit.demandUnit?.permanentDemandNo || unit.demandNumber || "—"}
              </span>
              <span style={{ color: "#94a3b8" }}>•</span>
              <span style={{ color: "#475569", fontSize: "0.85rem" }}>
                Class {unit.statutoryRule.rule_code} ({unit.statutoryRule.category})
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <a
            href="/assessment/pft3"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.7rem",
              borderRadius: "6px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#334155",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            ← PFT-3 Register
          </a>
        </div>
      </div>

      {/* Top Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.25rem 1.5rem",
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
            Government of the Punjab &bull; Professional Tax Administration
          </div>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.4rem", fontWeight: 700 }}>
            {unit.legalName}
          </h1>
          <span style={{ fontSize: "0.85rem", color: "#f0fdf4" }}>
            Permanent Demand No: <strong>{unit.demandUnit.permanentDemandNo}</strong> &bull; PIN:{" "}
            <strong style={{ fontFamily: "monospace" }}>{unit.provincialUin}</strong>
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={`/documents/pft1?pin=${unit.provincialUin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              backgroundColor: "#ffffff",
              color: "#0d3822",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center"
            }}
          >
            📄 Form P.F.T-1 ↗
          </a>
          <a
            href={`/documents/pf2/new?pin=${unit.provincialUin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              backgroundColor: "#ffffff",
              color: "#0d3822",
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center"
            }}
          >
            🏛️ Form PFT-2 Challan ↗
          </a>
          <button
            type="button"
            className="btn-secondary"
            style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
            onClick={() =>
              downloadOfficialPdf({
                type: "UNIT_DOSSIER",
                documentIdOrData: unit,
                defaultFilename: `Unit_${unit.demandUnit.permanentDemandNo}_Dossier.pdf`
              })
            }
          >
            📥 Download Dossier (PDF)
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ color: "#ffffff", borderColor: "#4ade80" }}
            onClick={() => window.close()}
          >
            Close Tab
          </button>
        </div>
      </div>

      <div id="unit-dossier-document">
        {/* Core Profile Grid */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem"
          }}
        >
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Trade / Establishment:
            </span>
            <strong>{unit.tradeName || unit.legalName}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Identifier ({unit.identifierType}):
            </span>
            <strong>{unit.identifierValue}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Commercial Address:
            </span>
            <span>{unit.address}</span>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Statutory Classification:
            </span>
            <strong>
              Class {unit.statutoryRule.subclassification_code ?? unit.statutoryRule.category_code}
            </strong>
            <span style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}>
              {unit.statutoryRule.category}
            </span>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Assessed Current Tax:
            </span>
            <strong style={{ fontSize: "1.1rem", color: "#0d3822" }}>
              PKR {assessedTax.toLocaleString()}
            </strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Arrears (Prior Years):
            </span>
            <strong style={{ fontSize: "1.1rem", color: arrears > 0 ? "#b45309" : "#64748b" }}>
              PKR {arrears.toLocaleString()}
            </strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Total Demand:
            </span>
            <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>
              PKR {totalDemand.toLocaleString()}
            </strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Total Paid:
            </span>
            <strong style={{ fontSize: "1.1rem", color: "#166534" }}>
              PKR {totalPaid.toLocaleString()}
            </strong>
          </div>
          <div>
            <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>
              Outstanding Balance:
            </span>
            <strong style={{ fontSize: "1.1rem", color: balance > 0 ? "#b91c1c" : "#166534" }}>
              PKR {balance.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Append-Only Demand Ledger */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem",
            marginBottom: "1.5rem"
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#0d3822" }}>
            Demand &amp; Payment Ledger (Rule 11)
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
                  return unit.ledgerEntries.map((entry) => {
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
            marginBottom: "1.5rem"
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#0d3822" }}>
            Issued Form P.F.T-2 Challans ({challans.length})
          </h3>
          {challans.length === 0 ? (
            <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>
              No Form PFT-2 payment challans have been issued for this unit yet.
            </p>
          ) : (
            <div className="table-container">
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Challan / Notice #</th>
                    <th>Security PIN</th>
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
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>🔒 {c.pin}</td>
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
            padding: "1.25rem"
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#0d3822" }}>
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

"use client";

import React, { use, useEffect, useState } from "react";
import {
  type StoredUnit,
  loadPilotState,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord
} from "../../../../lib/pilot-store";
import { computeLedgerBalance } from "@ptas/domain";
import { downloadDocumentPdf } from "../../../../lib/pdf-export";

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
    const state = loadPilotState();
    const found = state.units.find((u) => u.id === unitId);
    if (found) {
      setUnit(found);
      const unitChallans = (state.pft2Challans ?? []).filter((c) => c.unitId === found.id);
      const unitReceipts = (state.statutoryReceipts ?? []).filter((r) => r.unitId === found.id);
      setChallans(unitChallans);
      setReceipts(unitReceipts);
    }
    setIsLoaded(true);
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
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem" }}>Unit Not Found or Unauthorized</h2>
        <p style={{ color: "#475569" }}>
          Unit identifier <code>{unitId}</code> does not exist or you do not have authorized
          jurisdiction to view this taxpayer record.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.close()}
          style={{ marginTop: "1rem" }}
        >
          Close Tab
        </button>
      </div>
    );
  }

  const balance = computeLedgerBalance(unit.ledgerEntries);
  const assessedTax = unit.assessmentVersions[0]?.snapshot.taxAmount ?? 0;

  return (
    <div style={{ maxWidth: "68rem", margin: "2rem auto", padding: "1.5rem" }}>
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
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
            onClick={() =>
              downloadDocumentPdf(
                "unit-dossier-document",
                `Unit_${unit.demandUnit.permanentDemandNo}_Dossier.pdf`
              )
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
              Assessed Annual Demand:
            </span>
            <strong style={{ fontSize: "1.1rem", color: "#0d3822" }}>
              PKR {assessedTax.toLocaleString()}
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
          )}
        </div>
      </div>
    </div>
  );
}

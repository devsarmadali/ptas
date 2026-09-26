"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type StoredUnit, loadPilotState } from "../../../lib/pilot-store";
import { generateFormPFT1 } from "../../../lib/statutory-forms";
import { StatutoryQrCode } from "../../../components/StatutoryQrCode";
import { downloadOfficialPdf } from "../../../lib/pdf";

function FormPft1NoticeContent() {
  const searchParams = useSearchParams();
  const unitParam =
    searchParams.get("pin") || searchParams.get("pdn") || searchParams.get("unit") || "";

  const [unit, setUnit] = useState<StoredUnit | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const state = loadPilotState();
    const available = state.units || [];

    const found =
      available.find(
        (u) =>
          u.provincialUin === unitParam ||
          u.demandUnit?.permanentDemandNo === unitParam ||
          u.id === unitParam ||
          (unitParam && u.legalName.toLowerCase().includes(unitParam.toLowerCase()))
      ) ??
      available.find((u) => u.assessments[0]?.status === "APPROVED") ??
      available[0] ??
      null;

    if (found) {
      setUnit(found);
    }
    setIsLoaded(true);
  }, [unitParam]);

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified Form P.F.T-1 notice context...
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
          Unable to locate the specified unit for Form P.F.T-1 Notice generation.
        </p>
        <a
          href="/assessment/pft3"
          className="btn-primary"
          style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
        >
          Return to Form P.F.T-3 Register
        </a>
      </div>
    );
  }

  const pft1Data = generateFormPFT1(unit);

  return (
    <div style={{ maxWidth: "56rem", margin: "1.5rem auto", padding: "1rem" }}>
      {/* Header Actions Bar */}
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
          <span style={{ fontSize: "1.25rem" }}>📜</span>
          <div>
            <span
              style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0d3822", display: "block" }}
            >
              Form P.F.T-1 Statutory Notice &bull; Rule 6
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Notice of Demand &bull; Circle-Vehari &bull; FY 2026-2027
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              downloadOfficialPdf({
                type: "FORM_PFT1_NOTICE",
                documentIdOrData: unit,
                defaultFilename: `Form_PFT1_Notice_${pft1Data.demandNumber.replace(/\//g, "_")}.pdf`
              })
            }
            title="Download official Form P.F.T-1 Notice of Tax Demand as PDF"
          >
            📥 Download Official PDF (A4 Portrait)
          </button>
          <a
            href="/assessment/pft3"
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
            ← P.F.T-3 Register
          </a>
          <a
            href={`/units/${unit.provincialUin}/details`}
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center"
            }}
          >
            📋 Unit Dossier
          </a>
        </div>
      </div>

      {/* Originating Taxpayer Context Badge */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "0.75rem 1.25rem",
          marginBottom: "1.25rem",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)"
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#166534",
            marginBottom: "0.25rem"
          }}
        >
          Originating Taxpayer Establishment (Locked):
        </span>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.65rem",
            borderRadius: "6px",
            border: "1px solid #86efac",
            backgroundColor: "#f0fdf4",
            color: "#0f172a",
            fontSize: "0.85rem",
            fontWeight: 600,
            flexWrap: "wrap"
          }}
        >
          <span>🔒 {unit.legalName}</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span>PIN: {unit.provincialUin}</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span>PDN: {unit.demandUnit.permanentDemandNo}</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span>
            Class {unit.statutoryRule.rule_code} ({unit.statutoryRule.category})
          </span>
        </div>
      </div>

      {/* Notice Document Target */}
      <div
        id="pft1-notice-document-target"
        style={{
          background: "#ffffff",
          border: "2px solid #0d3822",
          borderRadius: "8px",
          padding: "2rem",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          fontFamily: "serif"
        }}
      >
        {/* Header Row */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            borderBottom: "2px solid #0d3822",
            paddingBottom: "1rem",
            marginBottom: "1.25rem"
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <StatutoryQrCode
              payload={pft1Data.qrPayload}
              size={80}
              label="SCAN TO VERIFY"
              subtitle={pft1Data.demandNumber}
            />
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                display: "inline-block",
                border: "1px solid #0d3822",
                background: "#fef3c7",
                padding: "0.2rem 0.6rem",
                fontWeight: 700,
                fontSize: "0.75rem",
                color: "#92400e",
                marginBottom: "0.25rem"
              }}
            >
              FORM P.F.T-1 &bull; NOTICE OF TAX DEMAND
            </div>
            <h3
              style={{
                margin: "0 0 0.2rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontSize: "1.1rem",
                color: "#0d3822"
              }}
            >
              GOVERNMENT OF THE PUNJAB
            </h3>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>
              Excise, Taxation &amp; Narcotics Control Department
            </p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#475569" }}>
              Professional Tax &bull; Circle Vehari &bull; {pft1Data.financialYear}
            </p>
          </div>
        </div>

        {/* Demand Details Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
            gap: "0.5rem 1.5rem",
            fontSize: "0.85rem",
            marginBottom: "1.25rem",
            background: "#f8fafc",
            padding: "1rem",
            borderRadius: "6px",
            border: "1px solid #e2e8f0"
          }}
        >
          <div>
            <strong>Demand No.:</strong> {pft1Data.demandNumber}
          </div>
          <div>
            <strong>Notice Date:</strong> {pft1Data.issueDate}
          </div>
          <div>
            <strong>Assessee:</strong> {pft1Data.assesseeLegalName}
          </div>
          <div>
            <strong>Business:</strong> {pft1Data.assesseeTradeName ?? pft1Data.assesseeLegalName}
          </div>
          <div>
            <strong>Address:</strong> {pft1Data.address}
          </div>
          <div>
            <strong>PIN:</strong> {pft1Data.provincialUin ?? pft1Data.taxNumber}
          </div>
          <div>
            <strong>Classification:</strong> {pft1Data.statutoryClassificationFull}
          </div>
          <div>
            <strong>Annual Tax Demand:</strong> PKR {pft1Data.taxAmount?.toLocaleString()}
          </div>
          <div>
            <strong>Financial Year:</strong> {pft1Data.financialYear}
          </div>
          <div>
            <strong>Due Date:</strong> {pft1Data.dueDate}
          </div>
        </div>

        {/* Body Text */}
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            padding: "1rem 1.25rem",
            fontSize: "0.85rem",
            lineHeight: 1.7,
            color: "#1e293b",
            marginBottom: "1.5rem"
          }}
        >
          <p style={{ margin: "0 0 0.75rem" }}>
            <strong>To:</strong> {pft1Data.assesseeLegalName}, {pft1Data.address}
          </p>
          <p style={{ margin: "0 0 0.75rem" }}>
            It is hereby notified under Rule 6 of the Punjab Professions &amp; Trades Tax Rules,
            1977 that a demand of <strong>PKR {pft1Data.taxAmount?.toLocaleString()}</strong> has
            been assessed and raised against your establishment{" "}
            <strong>{pft1Data.assesseeTradeName ?? pft1Data.assesseeLegalName}</strong> for the
            financial year <strong>{pft1Data.financialYear}</strong> on account of Professional Tax
            under the Punjab Finance Act, 1977.
          </p>
          <p style={{ margin: 0 }}>
            You are hereby directed to deposit the above amount into the designated government
            treasury account within <strong>30 days</strong> of the receipt of this notice. Failure
            to comply shall render you liable to penal action under the applicable provisions of
            law.
          </p>
        </div>

        {/* Signatures */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
            fontSize: "0.8rem",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "1rem",
            marginTop: "1.5rem"
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#64748b" }}>Issued by:</p>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700 }}>
              {pft1Data.assessingAuthorityName}
            </p>
            <p style={{ margin: 0, color: "#64748b" }}>{pft1Data.assessingAuthorityTitle}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, color: "#64748b" }}>Seal of Assessing Authority:</p>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700 }}>Circle-Vehari, Punjab</p>
            <p style={{ margin: 0, color: "#64748b" }}>Tax Year {pft1Data.financialYear}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FormPft1NoticePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Loading Form P.F.T-1 Statutory Notice...
        </div>
      }
    >
      <FormPft1NoticeContent />
    </Suspense>
  );
}

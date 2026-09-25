"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type StoredUnit, loadPilotState } from "../../../lib/pilot-store";
import { generateLandRevenueRecoveryCertificate } from "../../../lib/statutory-forms";
import { downloadDocumentPdf } from "../../../lib/pdf-export";

function LandRevenueRecoveryContent() {
  const searchParams = useSearchParams();
  const unitParam =
    searchParams.get("pin") ||
    searchParams.get("unitId") ||
    searchParams.get("pdn") ||
    searchParams.get("unit") ||
    "";

  const [unit, setUnit] = useState<StoredUnit | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const collectorDesignation = "The Collector / Tehsildar (Recovery), District Vehari";

  useEffect(() => {
    const state = loadPilotState();
    const available = state.units || [];

    const found =
      available.find(
        (u) =>
          u.provincialUin === unitParam ||
          u.id === unitParam ||
          u.demandUnit?.permanentDemandNo === unitParam ||
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
        Loading verified Land Revenue Recovery Certificate context...
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
          Unable to locate the specified unit for Land Revenue Recovery Certificate issuance.
        </p>
        <a
          href="/enforcement"
          className="btn-primary"
          style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
        >
          Return to Defaulter Roll
        </a>
      </div>
    );
  }

  const certData = generateLandRevenueRecoveryCertificate(unit, collectorDesignation);

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
          <span style={{ fontSize: "1.25rem" }}>🏛️</span>
          <div>
            <span
              style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0d3822", display: "block" }}
            >
              Certificate of Recovery as Arrears of Land Revenue
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Rule 12 &bull; Sections 80 &amp; 81 Punjab Land Revenue Act 1967 &bull; Circle-Vehari
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              downloadDocumentPdf(
                "land-revenue-recovery-document-target",
                `Recovery_Certificate_${certData.certificateNumber.replace(/\//g, "_")}.pdf`,
                { orientation: "portrait" }
              )
            }
            title="Download authoritative Land Revenue Recovery Certificate as PDF"
          >
            📥 Download PDF
          </button>
          <a
            href="/enforcement"
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
            ← Defaulter Roll
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

      {/* Certificate Document Target */}
      <div
        id="land-revenue-recovery-document-target"
        style={{
          background: "#ffffff",
          border: "2px solid #0f172a",
          borderRadius: "8px",
          padding: "2rem",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          fontFamily: "serif"
        }}
      >
        {/* Certificate Header */}
        <div
          style={{
            textAlign: "center",
            borderBottom: "2px solid #0f172a",
            paddingBottom: "1rem",
            marginBottom: "1.25rem"
          }}
        >
          <h3
            style={{
              margin: "0 0 0.25rem",
              textTransform: "uppercase",
              fontSize: "1.1rem",
              color: "#0f172a"
            }}
          >
            Office of the Excise &amp; Taxation Officer / Assessing Authority, Vehari
          </h3>
          <div
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              color: "#1e40af",
              marginTop: "0.25rem"
            }}
          >
            CERTIFICATE OF RECOVERY AS ARREARS OF LAND REVENUE
          </div>
          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
            (Under Rule 12 of Punjab Professions &amp; Trades Tax Rules, 1977 read with Sections 80
            &amp; 81 of the Punjab Land Revenue Act, 1967)
          </div>
        </div>

        {/* Certificate Metadata */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            fontSize: "0.85rem",
            marginBottom: "1rem"
          }}
        >
          <div>
            <strong>Certificate No:</strong> {certData.certificateNumber}
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                display: "inline-block",
                padding: "0.15rem 0.5rem",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: "0.85rem",
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                letterSpacing: "1.5px"
              }}
            >
              🔐 PIN: {certData.pin}
            </span>
          </div>
          <div style={{ gridColumn: "span 2", textAlign: "right" }}>
            <strong>Date of Certification:</strong> {certData.issueDate}
          </div>
        </div>

        {/* Assessee & Collector Details */}
        <div
          style={{
            background: "#ffffff",
            padding: "1rem",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            marginBottom: "1.25rem",
            fontSize: "0.85rem"
          }}
        >
          <div>
            <strong>To:</strong> {certData.collectorDesignation}
          </div>
          <div>
            <strong>District:</strong> {certData.collectorDistrict}
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Defaulter Assessee:</strong> {certData.assesseeLegalName}
          </div>
          {certData.assesseeTradeName && (
            <div>
              <strong>Trade Name:</strong> {certData.assesseeTradeName}
            </div>
          )}
          <div>
            <strong>CNIC / NTN:</strong> {certData.identifier}
          </div>
          <div>
            <strong>Location:</strong> {certData.address}
          </div>
          <div>
            <strong>Permanent Demand No:</strong> {certData.demandNumber}
          </div>
        </div>

        {/* Arrears Breakdown Table */}
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            padding: "1.25rem",
            borderRadius: "6px",
            marginBottom: "1.25rem"
          }}
        >
          <div style={{ fontWeight: 700, color: "#1e3a8a", marginBottom: "0.5rem" }}>
            CERTIFIED BREAKDOWN OF OUTSTANDING GOVERNMENT ARREARS:
          </div>
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #bfdbfe" }}>
                <td style={{ padding: "0.4rem 0" }}>1. Principal Professional Tax Demand:</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  PKR {certData.originalTaxAmount.toLocaleString()}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #bfdbfe" }}>
                <td style={{ padding: "0.4rem 0" }}>
                  2. Statutory Default Penalty (Section 3(4)):
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                  PKR {certData.penaltyAmount.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "0.6rem 0", fontWeight: 700, color: "#1e40af" }}>
                  TOTAL SUM RECOVERABLE AS ARREARS OF LAND REVENUE:
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    color: "#1e40af"
                  }}
                >
                  PKR {certData.totalArrearsRecoverable.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#1e3a8a" }}>
            <strong>Amount in Words:</strong> {certData.totalArrearsWords}
          </div>
        </div>

        {/* Certification Text */}
        <div
          style={{
            fontSize: "0.85rem",
            lineHeight: 1.7,
            color: "#1e293b",
            marginBottom: "1.5rem"
          }}
        >
          <p style={{ margin: "0 0 0.75rem" }}>
            I, <strong>{certData.assessingAuthorityName}</strong>, Excise &amp; Taxation Officer /
            Assessing Authority, Tehsil Vehari, do hereby certify that the sum of{" "}
            <strong>PKR {certData.totalArrearsRecoverable.toLocaleString()}</strong> specified above
            is legally due from the defaulter on account of Punjab Professional Tax and statutory
            penalty.
          </p>
          <p style={{ margin: 0 }}>
            You are hereby requested and authorized under{" "}
            <strong>Sections 80 and 81 of the Punjab Land Revenue Act, 1967</strong> to recover the
            said certified sum as Arrears of Land Revenue by distraint, attachment and sale of
            movable or immovable property, or warrant of arrest, and deposit the proceeds into
            Provincial Account Head <strong>B01601</strong>.
          </p>
        </div>

        {/* Signatures (Clean official seal without internal hashes per Issue 08) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px dashed #94a3b8",
            paddingTop: "1.25rem"
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            <div>
              <strong>Designated Account Head:</strong> B01601 &bull; Direct Provincial Revenue
            </div>
            <div>
              <strong>Recovery Jurisdiction:</strong> Circle-Vehari, Multan Division
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              {certData.assessingAuthorityName}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>
              {certData.assessingAuthorityTitle}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Assessing Authority &bull; Circle-Vehari
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandRevenueRecoveryPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Loading Certificate of Recovery as Arrears of Land Revenue...
        </div>
      }
    >
      <LandRevenueRecoveryContent />
    </Suspense>
  );
}

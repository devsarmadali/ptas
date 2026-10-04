"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type StoredUnit } from "../../../lib/pilot-store";
import { loadOperationalSurveyUnits } from "../../../lib/operational-survey";
import { generateFormPFT1 } from "../../../lib/statutory-forms";
import { StatutoryQrCode } from "../../../components/StatutoryQrCode";
import { downloadOfficialPdf } from "../../../lib/pdf";

function FormPft1NoticeContent() {
  const searchParams = useSearchParams();
  const unitParam =
    searchParams.get("pin") || searchParams.get("pdn") || searchParams.get("unit") || "";

  const [unit, setUnit] = useState<StoredUnit | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOperationalSurveyUnits()
      .then((available) => {
        if (cancelled) return;

        const found =
          available.find(
            (u) =>
              u.pinNumber === unitParam ||
              u.provincialUin === unitParam ||
              u.demandUnit?.permanentDemandNo === unitParam ||
              u.id === unitParam
          ) ??
          available.find((u) => u.assessments[0]?.status === "APPROVED") ??
          null;

        setUnit(found);
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
          {loadError ?? "Unable to locate an approved taxpayer unit in your jurisdiction."}
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
  const district = pft1Data.districtName || unit.districtName || "Vehari";
  const circle = pft1Data.circleName || unit.circleName || "Circle-I";

  return (
    <div style={{ maxWidth: "58rem", margin: "1.25rem auto", padding: "1rem" }}>
      {/* Top Action Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
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
          <span style={{ fontSize: "1.3rem" }}>📜</span>
          <div>
            <span
              style={{ fontSize: "0.92rem", fontWeight: 700, color: "#0d3822", display: "block" }}
            >
              Form P.F.T-1 Statutory Notice &bull; Rule 6
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Notice of Demand &bull; {circle}, District {district} &bull; FY{" "}
              {pft1Data.financialYear}
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
            href={`/units/${unit.id}/details`}
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              background: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            📋 Unit Dossier
          </a>
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
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "#166534",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
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
          <span>UIN: {unit.provincialUin || "Not assigned"}</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span>Demand Number: {unit.demandUnit?.permanentDemandNo || unit.demandNumber}</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span style={{ color: "#166534", fontWeight: 700 }}>
            {pft1Data.scheduleEntry} ({unit.statutoryRule.category})
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
          padding: "1.75rem 2rem",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          color: "#0f172a"
        }}
      >
        {/* Header Row */}
        <div
          style={{
            display: "flex",
            gap: "1.25rem",
            alignItems: "center",
            borderBottom: "2px solid #0d3822",
            paddingBottom: "1rem",
            marginBottom: "1.25rem"
          }}
        >
          {/* Left: Scannable QR Code with Security Code below */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <StatutoryQrCode payload={pft1Data.qrPayload} size={72} label="SCAN TO VERIFY" />
            <div
              style={{
                marginTop: "0.3rem",
                width: "72px",
                background: "#e0f2fe",
                border: "1px solid #bae6fd",
                borderRadius: "3px",
                padding: "0.1rem 0.2rem",
                textAlign: "center"
              }}
            >
              <div
                style={{
                  fontSize: "0.5rem",
                  fontWeight: 800,
                  color: "#0369a1",
                  letterSpacing: "0.2px",
                  lineHeight: 1
                }}
              >
                SECURITY CODE
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  color: "#1e3a8a",
                  lineHeight: 1.15,
                  marginTop: "0.08rem"
                }}
              >
                {pft1Data.pin}
              </div>
            </div>
          </div>

          {/* Right: Authority Header */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                display: "inline-block",
                border: "1px solid #166534",
                background: "#dcfce7",
                padding: "0.15rem 0.65rem",
                fontWeight: 800,
                fontSize: "0.72rem",
                color: "#166534",
                borderRadius: "3px",
                marginBottom: "0.35rem",
                letterSpacing: "0.5px"
              }}
            >
              FORM P.F.T - 1 &bull; NOTICE OF TAX DEMAND
            </div>
            <h3
              style={{
                margin: "0 0 0.15rem",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#0d3822"
              }}
            >
              GOVERNMENT OF THE PUNJAB
            </h3>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem", color: "#1e293b" }}>
              Excise, Taxation &amp; Narcotics Control Department
            </p>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
              Punjab Professions &amp; Trades Tax &bull; Rule 6 &bull; {circle}, District {district}{" "}
              &bull; {pft1Data.financialYear}
            </p>
          </div>
        </div>

        {/* Demand Details Identification Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.4rem 1.5rem",
            fontSize: "0.82rem",
            marginBottom: "1.25rem",
            background: "#f8fafc",
            padding: "0.85rem 1rem",
            borderRadius: "6px",
            border: "1px solid #e2e8f0"
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>Notice Ref: </span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e3a8a" }}>
              {pft1Data.noticeNumber}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>Demand Number: </span>
            <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#166534" }}>
              {pft1Data.demandNumber}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>Notice Date: </span>
            <span>{pft1Data.issueDate}</span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>Statutory Due Date: </span>
            <span
              style={{
                fontWeight: 800,
                color: "#b91c1c",
                background: "#fef2f2",
                padding: "0.1rem 0.4rem",
                borderRadius: "3px",
                border: "1px solid #fecaca"
              }}
            >
              {pft1Data.dueDate}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>PIN: </span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1d4ed8" }}>
              {pft1Data.provincialUin ?? pft1Data.taxNumber}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#334155" }}>Security PIN: </span>
            <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#0369a1" }}>
              {pft1Data.pin}
            </span>
          </div>
        </div>

        {/* Taxpayer / Assessee Particulars Box */}
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            padding: "0.85rem 1.1rem",
            fontSize: "0.82rem",
            lineHeight: 1.5,
            background: "#ffffff",
            marginBottom: "1.25rem"
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: "#0d3822",
              marginBottom: "0.4rem",
              fontSize: "0.85rem"
            }}
          >
            TO (ASSESSEE PARTICULARS):
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem 1.5rem" }}>
            <div>
              <span style={{ fontWeight: 700, color: "#475569" }}>Legal Name: </span>
              <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>
                {pft1Data.assesseeLegalName}
              </strong>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: "#475569" }}>Taxpayer / Proprietor: </span>
              <span>{pft1Data.assesseeTradeName ?? pft1Data.assesseeLegalName}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: "#475569" }}>CNIC / NTN: </span>
              <span>{pft1Data.taxNumber}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: "#475569" }}>Jurisdiction: </span>
              <span>
                {circle} &bull; District {district}
              </span>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span style={{ fontWeight: 700, color: "#475569" }}>Business Address: </span>
              <span>{pft1Data.address}</span>
            </div>
          </div>
        </div>

        {/* Formal Statutory Notice Body */}
        <div
          style={{
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: "#1e293b",
            marginBottom: "1rem"
          }}
        >
          <p style={{ margin: "0 0 0.5rem" }}>
            Please take notice that for the financial year <strong>{pft1Data.financialYear}</strong>
            , an assessment of Professional Tax under Section 3 of the Punjab Finance Act, 1977 has
            been formally determined against you by the undersigned Assessing Authority under Rule 4
            of the Punjab Professions and Trades Tax Rules, 1977 as itemized below:
          </p>
        </div>

        {/* Assessment Schedule Table (Accounting Grade) */}
        <div style={{ marginBottom: "1rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #cbd5e1",
              fontSize: "0.8rem"
            }}
          >
            <thead>
              <tr style={{ background: "#0d3822", color: "#ffffff" }}>
                <th style={{ padding: "0.45rem 0.65rem", textAlign: "left" }}>
                  Schedule Entry &amp; Class
                </th>
                <th style={{ padding: "0.45rem 0.65rem", textAlign: "left" }}>
                  Statutory Classification &amp; Slab
                </th>
                <th style={{ padding: "0.45rem 0.65rem", textAlign: "left" }}>Rate Basis</th>
                <th style={{ padding: "0.45rem 0.65rem", textAlign: "right" }}>
                  Assessed Tax (PKR)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "0.55rem 0.65rem", fontWeight: 700, color: "#0f172a" }}>
                  {pft1Data.scheduleEntry}
                </td>
                <td style={{ padding: "0.55rem 0.65rem", color: "#334155" }}>
                  {pft1Data.tertiarySlab || pft1Data.statutoryCategoryText}
                </td>
                <td style={{ padding: "0.55rem 0.65rem", color: "#475569" }}>
                  {pft1Data.rateBasis || "Per Annum"}
                </td>
                <td
                  style={{
                    padding: "0.55rem 0.65rem",
                    textAlign: "right",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  PKR {pft1Data.taxAmount.toLocaleString()}
                </td>
              </tr>
              <tr style={{ background: "#dcfce7", borderTop: "1.5px solid #166534" }}>
                <td
                  colSpan={3}
                  style={{
                    padding: "0.6rem 0.65rem",
                    fontWeight: 800,
                    color: "#166534",
                    fontSize: "0.88rem"
                  }}
                >
                  TOTAL STATUTORY DEMAND PAYABLE
                </td>
                <td
                  style={{
                    padding: "0.6rem 0.65rem",
                    textAlign: "right",
                    fontWeight: 800,
                    color: "#166534",
                    fontSize: "1.05rem",
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  PKR {pft1Data.taxAmount.toLocaleString()} /-
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "0.35rem", fontSize: "0.78rem", color: "#334155" }}>
            <span style={{ fontWeight: 700 }}>Amount in Words: </span>
            <span style={{ fontStyle: "italic", color: "#1e3a8a", fontWeight: 600 }}>
              {pft1Data.taxAmountWords}
            </span>
          </div>
        </div>

        {/* Legal Warnings & Directives */}
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            fontSize: "0.78rem",
            lineHeight: 1.5,
            color: "#334155",
            background: "#fafaf9",
            marginBottom: "1.25rem"
          }}
        >
          <div style={{ fontWeight: 700, color: "#0d3822", marginBottom: "0.25rem" }}>
            STATUTORY COMPLIANCE, PENALTY &amp; APPEAL DIRECTIVES:
          </div>
          <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>
              <strong>Mode of Payment:</strong> Deposit the assessed demand of{" "}
              <strong>PKR {pft1Data.taxAmount.toLocaleString()}</strong> on or before{" "}
              <strong>{pft1Data.dueDate}</strong> into the National Bank of Pakistan (NBP), State
              Bank of Pakistan (SBP), or via Punjab ePay using official Challan Form P.F.T-2.
            </li>
            <li>
              <strong>Right of Appeal:</strong> If you contest this assessment, an appeal under
              Section 7 of the Punjab Finance Act, 1977 read with Rule 13 may be preferred before
              the Director Excise &amp; Taxation (Appellate Authority) within thirty (30) days of
              service of this notice, provided all undisputed tax has been deposited.
            </li>
            <li>
              <strong>Consequence of Default:</strong> Failure to pay by the statutory due date
              shall render you liable to default surcharge/penalty up to the full assessed amount
              under Section 3(5) of the Act, and coercive recovery as arrears of land revenue under
              Section 11.
            </li>
          </ol>
        </div>

        {/* Signatures & Seal */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
            fontSize: "0.82rem",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "1rem",
            marginBottom: "1.5rem"
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.75rem" }}>
              Issued by Assessing Authority:
            </p>
            <p
              style={{
                margin: "0.2rem 0 0",
                fontWeight: 800,
                fontSize: "0.95rem",
                color: "#0d3822"
              }}
            >
              {pft1Data.assessingAuthorityName}
            </p>
            <p style={{ margin: 0, color: "#475569", fontSize: "0.78rem" }}>
              {pft1Data.assessingAuthorityTitle}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.75rem" }}>
              Official Jurisdiction Seal:
            </p>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 800, color: "#0d3822" }}>
              {circle}, District {district}
            </p>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.78rem" }}>
              Government of the Punjab
            </p>
          </div>
        </div>

        {/* Perforated Rule 6 Service Receipt Counterfoil */}
        <div
          style={{
            borderTop: "2px dashed #94a3b8",
            paddingTop: "0.85rem",
            position: "relative"
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: "0.7rem",
              fontWeight: 800,
              color: "#64748b",
              letterSpacing: "1px",
              marginBottom: "0.6rem"
            }}
          >
            ✂ TEAR-OFF SERVICE COUNTERFOIL (RULE 6 RECEIPT) ✂
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "4px",
              padding: "0.65rem 0.85rem",
              fontSize: "0.78rem"
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.4rem",
                marginBottom: "0.5rem"
              }}
            >
              <div>
                <strong>Demand Number:</strong> {pft1Data.demandNumber}
              </div>
              <div>
                <strong>Tax Payable:</strong> PKR {pft1Data.taxAmount.toLocaleString()}
              </div>
              <div>
                <strong>Due Date:</strong> {pft1Data.dueDate}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.4rem",
                marginBottom: "0.6rem"
              }}
            >
              <div>
                <strong>Assessee:</strong> {pft1Data.assesseeLegalName}
              </div>
              <div>
                <strong>CNIC / NTN:</strong> {pft1Data.taxNumber}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginTop: "1rem"
              }}
            >
              <div>
                <div
                  style={{
                    borderBottom: "1px solid #94a3b8",
                    height: "1.5rem",
                    marginBottom: "0.2rem"
                  }}
                />
                <div style={{ fontSize: "0.72rem", color: "#64748b", textAlign: "center" }}>
                  Signature of Serving Officer &bull; Date: ____/____/2026
                </div>
              </div>
              <div>
                <div
                  style={{
                    borderBottom: "1px solid #94a3b8",
                    height: "1.5rem",
                    marginBottom: "0.2rem"
                  }}
                />
                <div style={{ fontSize: "0.72rem", color: "#64748b", textAlign: "center" }}>
                  Signature / Thumbprint of Assessee &bull; Date: ____/____/2026
                </div>
              </div>
            </div>
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

"use client";

import React from "react";
import { StatutoryQrCode } from "./StatutoryQrCode";
import type { FormPFT2CopyModel } from "../lib/statutory-forms";
import {
  formatChallanDisplayDate,
  formatChallanTaxYear,
  cleanChallanScope
} from "../lib/pft2-formatters";

export interface Pft2ChallanCopyProps {
  readonly copy: FormPFT2CopyModel;
  readonly copyIndex?: number | undefined;
  readonly onScanOrClick?: ((payload: string) => void) | undefined;
}

/**
 * Reusable Single-Copy Component for Form P.F.T-2 Payment Challan.
 *
 * Implements the official Rule 9 statutory payment instrument specifications:
 * - Compact government typography and strict visual hierarchy.
 * - Two-column identification grid with fixed label widths.
 * - Taxpayer details with guaranteed label/value separation.
 * - Clear Tax Payable table with right-aligned digits.
 * - Single-line Amount in Words callout.
 * - Compact Bank Counterfoil positioned immediately below tax information with no dead space.
 */
export function Pft2ChallanCopy({ copy, onScanOrClick }: Pft2ChallanCopyProps) {
  const cleanScope = cleanChallanScope(
    copy.pft2TypeLabel ||
      (copy.demandScope === "ARREAR"
        ? "ARREARS"
        : copy.demandScope === "COMBINED"
          ? "COMBINED (CURRENT + ARREARS)"
          : "CURRENT")
  );

  const scopeColor = cleanScope.includes("ARREAR")
    ? "#b45309"
    : cleanScope.includes("COMBINED")
      ? "#1e3a8a"
      : "#166534";

  const displayIssueDate = formatChallanDisplayDate(copy.issueDate || "2026-07-01");
  const displayDueDate = formatChallanDisplayDate(copy.dueDate || "31/08/2026");
  const displayTaxYear = formatChallanTaxYear(copy.taxYear);
  const taxpayerPin = copy.taxpayerInfo.provincialUin || copy.pin;

  return (
    <div
      className="challan-card"
      style={{
        border: "1.5px solid #0d3822",
        borderRadius: "4px",
        padding: "0.5rem",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        fontSize: "0.72rem",
        lineHeight: 1.3,
        color: "#0f172a",
        position: "relative"
      }}
    >
      {/* ── SECTION 1: HEADER & QR CODE ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          alignItems: "center",
          borderBottom: "1.5px solid #0d3822",
          paddingBottom: "0.35rem"
        }}
      >
        {/* Left: Scannable Statutory QR Code */}
        <div style={{ flexShrink: 0 }}>
          <StatutoryQrCode payload={copy.qrPayload} size={58} onScanOrClick={onScanOrClick} />
        </div>

        {/* Right: Authority Header & Copy Pill */}
        <div style={{ flex: 1, textAlign: "center" }}>
          {/* Copy Designation Pill */}
          <div style={{ marginBottom: "0.15rem" }}>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                color: "#166534",
                background: "#dcfce7",
                border: "1px solid #86efac",
                padding: "0.1rem 0.45rem",
                borderRadius: "3px",
                display: "inline-block",
                letterSpacing: "0.5px"
              }}
            >
              {copy.copyTitle}
            </span>
          </div>

          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 800,
              color: "#0d3822",
              letterSpacing: "0.2px",
              lineHeight: 1.15
            }}
          >
            GOVERNMENT OF THE PUNJAB
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#1e293b",
              lineHeight: 1.15
            }}
          >
            EXCISE &amp; TAXATION DEPARTMENT
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.15,
              marginTop: "0.05rem"
            }}
          >
            PUNJAB PROFESSIONS &amp; TRADES TAX
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              color: "#0d3822",
              lineHeight: 1.2,
              marginTop: "0.05rem"
            }}
          >
            PFT-2 &bull; PAYMENT CHALLAN
          </div>
          <div
            style={{
              fontSize: "0.62rem",
              fontWeight: 700,
              color: scopeColor,
              marginTop: "0.05rem"
            }}
          >
            Rule 9 &bull; [{cleanScope}]
          </div>
          <div
            style={{
              fontSize: "0.58rem",
              fontWeight: 700,
              color: "#b45309",
              marginTop: "0.05rem"
            }}
          >
            Head: {copy.headOfAccount}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: IDENTIFICATION GRID (2-COLUMN) ────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          padding: "0.3rem 0.4rem",
          gap: "0.2rem 0.5rem",
          fontSize: "0.68rem"
        }}
      >
        {/* Row 0: Notice No (Full Width) */}
        <div
          style={{
            gridColumn: "span 2",
            display: "flex",
            alignItems: "baseline",
            borderBottom: "1px dashed #e2e8f0",
            paddingBottom: "0.18rem"
          }}
        >
          <span style={{ width: "5.5rem", flexShrink: 0, fontWeight: 700, color: "#334155" }}>
            NOTICE NO.
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#1e3a8a",
              wordBreak: "break-all"
            }}
          >
            {copy.noticeNumber}
          </span>
        </div>

        {/* Row 1: Code | Demand No */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ width: "5.5rem", flexShrink: 0, fontWeight: 700, color: "#334155" }}>
            CODE
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 800,
              background: "#e0f2fe",
              color: "#0369a1",
              border: "1px solid #bae6fd",
              padding: "0.02rem 0.3rem",
              borderRadius: "3px",
              fontSize: "0.66rem"
            }}
          >
            {copy.pin}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end" }}>
          <span style={{ fontWeight: 700, color: "#334155", marginRight: "0.4rem" }}>
            DEMAND NO.
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 800,
              color: "#166534",
              fontSize: "0.72rem"
            }}
          >
            {copy.assessmentInfo.demandNo}
          </span>
        </div>

        {/* Row 2: Taxpayer PIN | District */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ width: "5.5rem", flexShrink: 0, fontWeight: 700, color: "#334155" }}>
            TAXPAYER PIN
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#1d4ed8"
            }}
          >
            {taxpayerPin}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "flex-end",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ fontWeight: 700, color: "#334155", marginRight: "0.4rem" }}>DISTRICT</span>
          <span>{copy.district}</span>
        </div>

        {/* Row 3: Circle | Tax Year */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ width: "5.5rem", flexShrink: 0, fontWeight: 700, color: "#334155" }}>
            CIRCLE
          </span>
          <span>{copy.assessmentInfo.circleName}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "flex-end",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ fontWeight: 700, color: "#334155", marginRight: "0.4rem" }}>TAX YEAR</span>
          <span style={{ fontWeight: 600 }}>{displayTaxYear}</span>
        </div>

        {/* Row 4: Issue Date | Due Date */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ width: "5.5rem", flexShrink: 0, fontWeight: 700, color: "#334155" }}>
            ISSUE DATE
          </span>
          <span>{displayIssueDate}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "flex-end",
            borderTop: "1px dashed #e2e8f0",
            paddingTop: "0.18rem"
          }}
        >
          <span style={{ fontWeight: 700, color: "#b91c1c", marginRight: "0.4rem" }}>DUE DATE</span>
          <span style={{ fontWeight: 800, color: "#b91c1c" }}>{displayDueDate}</span>
        </div>
      </div>

      {/* ── SECTION 3: TAXPAYER DETAILS ──────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.22rem",
          fontSize: "0.68rem"
        }}
      >
        {/* Class Row */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              width: "8.2rem",
              flexShrink: 0,
              fontWeight: 700,
              color: "#334155"
            }}
          >
            CLASS:
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span>{copy.taxpayerInfo.classification}</span>{" "}
            <span style={{ fontWeight: 700, color: "#166534" }}>
              (PKR {copy.taxpayerInfo.slabRatePkr.toLocaleString()})
            </span>
          </div>
        </div>

        {/* Legal Name Row */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              width: "8.2rem",
              flexShrink: 0,
              fontWeight: 700,
              color: "#334155"
            }}
          >
            LEGAL NAME:
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 700,
              color: "#0f172a"
            }}
          >
            {copy.taxpayerInfo.legalName}
          </span>
        </div>

        {/* Taxpayer / Proprietor Row */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              width: "8.2rem",
              flexShrink: 0,
              fontWeight: 700,
              color: "#334155"
            }}
          >
            TAXPAYER / PROPRIETOR:
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {copy.taxpayerInfo.tradeName || copy.taxpayerInfo.legalName}
          </span>
        </div>

        {/* Address Row */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              width: "8.2rem",
              flexShrink: 0,
              fontWeight: 700,
              color: "#334155"
            }}
          >
            ADDRESS:
          </span>
          <span style={{ flex: 1, minWidth: 0, color: "#475569" }}>
            {copy.taxpayerInfo.address}
          </span>
        </div>
      </div>

      {/* ── SECTION 4: DETAIL OF TAX PAYABLE TABLE ─────────────────────── */}
      <div>
        <div
          style={{
            fontSize: "0.7rem",
            fontWeight: 800,
            color: "#0d3822",
            marginBottom: "0.15rem",
            letterSpacing: "0.2px"
          }}
        >
          TAX PAYABLE
        </div>

        <table
          style={{
            width: "100%",
            fontSize: "0.68rem",
            borderCollapse: "collapse",
            border: "1px solid #cbd5e1"
          }}
        >
          <tbody>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "0.18rem 0.35rem", color: "#334155" }}>Current Tax</td>
              <td
                style={{
                  padding: "0.18rem 0.35rem",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600
                }}
              >
                Rs. {copy.taxPayable.currentTax.toLocaleString()}
              </td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "0.18rem 0.35rem", color: "#334155" }}>Arrears</td>
              <td
                style={{
                  padding: "0.18rem 0.35rem",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600
                }}
              >
                Rs. {copy.taxPayable.arrears.toLocaleString()}
              </td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "0.18rem 0.35rem", color: "#334155" }}>Penalty</td>
              <td
                style={{
                  padding: "0.18rem 0.35rem",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600
                }}
              >
                Rs. {copy.taxPayable.penalty.toLocaleString()}
              </td>
            </tr>
            <tr style={{ fontWeight: 800, background: "#dcfce7" }}>
              <td style={{ padding: "0.22rem 0.35rem", color: "#166534" }}>TOTAL PAYABLE</td>
              <td
                style={{
                  padding: "0.22rem 0.35rem",
                  textAlign: "right",
                  color: "#166534",
                  fontSize: "0.74rem",
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                Rs. {copy.taxPayable.totalPayable.toLocaleString()}
              </td>
            </tr>
            {copy.isPartial && (copy.remainingBalance ?? 0) > 0 && (
              <tr style={{ background: "#fef3c7" }}>
                <td style={{ padding: "0.18rem 0.35rem", color: "#92400e", fontWeight: 700 }}>
                  Remaining Balance
                </td>
                <td
                  style={{
                    padding: "0.18rem 0.35rem",
                    textAlign: "right",
                    color: "#92400e",
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  Rs. {(copy.remainingBalance ?? 0).toLocaleString()}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Amount in Words (Compact Single Line) */}
        <div
          style={{
            marginTop: "0.18rem",
            fontSize: "0.64rem",
            color: "#334155",
            lineHeight: 1.2
          }}
        >
          <span style={{ fontWeight: 700 }}>Amount in Words:</span>{" "}
          <span style={{ fontStyle: "italic" }}>{copy.taxPayable.totalPayableWords}</span>
        </div>
      </div>

      {/* ── SECTION 5: FOR BANK'S USE ONLY (COMPACT COUNTERFOIL) ───────── */}
      <div
        style={{
          border: "1px solid #cbd5e1",
          borderTop: "1.5px solid #0d3822",
          background: "#fafaf9",
          borderRadius: "3px",
          overflow: "hidden"
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            background: "#fef3c7",
            padding: "0.12rem 0.35rem",
            fontSize: "0.62rem",
            fontWeight: 800,
            color: "#78350f",
            borderBottom: "1px solid #fde68a",
            display: "flex",
            justifyContent: "space-between"
          }}
        >
          <span>FOR BANK&apos;S USE ONLY &bull; Rule 9 Statutory Counterfoil</span>
        </div>

        {/* Dual-Pane Counterfoil Details */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            padding: "0.25rem 0.35rem",
            gap: "0.35rem",
            alignItems: "stretch"
          }}
        >
          {/* Left Pane: Bank Lines & Amount Callout */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.18rem",
              fontSize: "0.6rem"
            }}
          >
            <div>Bank / Branch: __________________________</div>
            <div>Scroll No.: _________ Payment Date: _______</div>
            <div
              style={{
                marginTop: "0.1rem",
                padding: "0.12rem 0.3rem",
                background: "#dcfce7",
                border: "1px solid #86efac",
                borderRadius: "3px",
                textAlign: "center",
                fontWeight: 800,
                color: "#166534",
                fontSize: "0.66rem",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              Amount Received: Rs. {copy.taxPayable.totalPayable.toLocaleString()} /-
            </div>
          </div>

          {/* Right Pane: Cashier Stamp Box */}
          <div
            style={{
              border: "1px dashed #94a3b8",
              borderRadius: "3px",
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0.15rem",
              color: "#64748b",
              fontSize: "0.52rem",
              textAlign: "center",
              minHeight: "2.6rem"
            }}
          >
            <span>Authorized Cashier</span>
            <span>Signature &amp; Stamp</span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  type StoredUnit,
  type Pft2ChallanRecord,
  loadPilotState,
  savePilotState,
  getPakistanCurrentDate,
  getPakistanMonthBounds,
  validatePft2IssuanceAmount
} from "../../../../lib/pilot-store";
import { generateFormPFT2, generatePft2NoticeNumber } from "../../../../lib/statutory-forms";
import { generateDocumentPin } from "@ptas/domain";
import { StatutoryQrCode } from "../../../../components/StatutoryQrCode";
import { downloadDocumentPdf } from "../../../../lib/pdf-export";

function DocumentIssuanceContent() {
  const searchParams = useSearchParams();
  const unitParam =
    searchParams.get("pin") || searchParams.get("pdn") || searchParams.get("unit") || "";

  const [allUnits, setAllUnits] = useState<StoredUnit[]>([]);
  const [unit, setUnit] = useState<StoredUnit | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Form Controls
  const [demandScope, setDemandScope] = useState<"CURRENT" | "ARREAR" | "COMBINED">("CURRENT");
  const formType = "STANDARD";
  const [paymentScope, setPaymentScope] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialAmount, setPartialAmount] = useState<number>(0);

  // Date Controls (Section 8: Issue Date is system-assigned; Due Date is strictly current calendar month)
  const systemIssueDate = getPakistanCurrentDate();
  const { minDueDate, maxDueDate } = getPakistanMonthBounds(systemIssueDate);
  const [dueDate, setDueDate] = useState<string>(maxDueDate);

  // Post-issuance state
  const [issuedChallan, setIssuedChallan] = useState<Pft2ChallanRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isIssuing, setIsIssuing] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(true);

  useEffect(() => {
    const state = loadPilotState();
    const available = (state.units && state.units.length > 0 ? state.units : []).filter(
      (u) => u.assessments[0]?.status === "APPROVED"
    );
    setAllUnits(available);

    const found =
      available.find(
        (u) =>
          u.provincialUin === unitParam ||
          u.demandUnit?.permanentDemandNo === unitParam ||
          u.id === unitParam ||
          (unitParam && u.legalName.toLowerCase().includes(unitParam.toLowerCase()))
      ) ??
      // Default to a unit with pending demand or first available unit
      available.find((u) => {
        const assessed = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
        let paid = 0;
        for (const e of u.ledgerEntries) {
          if (e.entryType === "PAYMENT_CREDIT") paid += Math.abs(e.amount);
        }
        return assessed - paid > 0;
      }) ??
      available[0] ??
      null;

    if (found) {
      setUnit(found);
      const assessed = found.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
      setPartialAmount(Math.round(assessed / 2));
      // Standardize the URL on the statutory PIN (never entity names)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("unit");
        url.searchParams.set("pin", found.provincialUin);
        window.history.replaceState(null, "", url.toString());
      }
    }
    setIsLoaded(true);
  }, [unitParam]);

  const handleSelectUnit = (newPin: string) => {
    const selected = allUnits.find(
      (u) =>
        u.provincialUin === newPin || u.id === newPin || u.demandUnit?.permanentDemandNo === newPin
    );
    if (selected) {
      setUnit(selected);
      const assessed = selected.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
      setPartialAmount(Math.round(assessed / 2));
      setIssuedChallan(null);
      setErrorMessage("");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("unit");
        url.searchParams.set("pin", selected.provincialUin);
        window.history.replaceState(null, "", url.toString());
      }
    }
  };

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified unit issuance context...
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
          Please initialize pilot data from the main PTAS dashboard to issue Form PFT-2 documents.
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

  // Authoritative financial validation
  const validation = validatePft2IssuanceAmount({
    unit,
    demandScope,
    requestedDueDate: dueDate
  });

  const effectivePayableAmount =
    paymentScope === "PARTIAL" && partialAmount > 0
      ? Math.min(partialAmount, validation.calculatedAmount)
      : validation.calculatedAmount;

  const handleConfirmIssuance = () => {
    if (!validation.canIssue) {
      setErrorMessage(validation.error || "Cannot issue challan with invalid financial balance.");
      return;
    }

    setIsIssuing(true);
    try {
      const state = loadPilotState();
      const freshUnit = state.units.find((u) => u.id === unit.id) ?? unit;

      // Re-validate transactionally
      const recheck = validatePft2IssuanceAmount({
        unit: freshUnit,
        demandScope,
        requestedDueDate: dueDate
      });

      if (!recheck.canIssue) {
        setErrorMessage(recheck.error || "Financial balance changed prior to issuance.");
        setIsIssuing(false);
        return;
      }

      const seq = (state.pft2Challans?.length ?? 0) + 1;
      const challanNumber = `PFT2-VHR-2026-${String(seq).padStart(5, "0")}`;
      const noticeNumber = generatePft2NoticeNumber({
        demandNumber: freshUnit.demandUnit.permanentDemandNo,
        issueDate: systemIssueDate,
        formTypeCode: formType,
        demandScope,
        paymentScope,
        amount: effectivePayableAmount
      });
      const pin = generateDocumentPin(noticeNumber);

      const newChallan: Pft2ChallanRecord = {
        id: `pft2-gen-${Date.now()}`,
        challanNumber,
        demandNumber: freshUnit.demandUnit.permanentDemandNo,
        unitId: freshUnit.id,
        legalName: freshUnit.legalName,
        tradeName: freshUnit.tradeName,
        identifierType: freshUnit.identifierType,
        identifierValue: freshUnit.identifierValue,
        address: freshUnit.address,
        subclassificationCode: freshUnit.statutoryRule.subclassification_code ?? null,
        statutoryTertiaryCode: freshUnit.statutoryRule.statutory_tertiary_code ?? null,
        category: freshUnit.statutoryRule.category,
        tertiarySlab: freshUnit.statutoryRule.statutory_tertiary_classification ?? null,
        amountPayable: effectivePayableAmount,
        noticeNumber,
        pin,
        formType,
        demandScope,
        paymentScope,
        fullAssessedAmount: validation.calculatedAmount,
        partialAmount: paymentScope === "PARTIAL" ? effectivePayableAmount : undefined,
        remainingBalance:
          paymentScope === "PARTIAL"
            ? Math.max(0, validation.calculatedAmount - effectivePayableAmount)
            : 0,
        provincialUin: freshUnit.provincialUin,
        issueDate: systemIssueDate,
        dueDate,
        status: "ISSUED",
        officialSha256: `sha256-gen-${pin}-${Date.now()}`,
        qrPayload: `https://ptas.punjab.gov.pk/verify?type=PFT-2&ref=${noticeNumber}&pdn=${freshUnit.demandUnit.permanentDemandNo}&amt=${effectivePayableAmount}&pin=${pin}`
      };

      const updatedChallans = [newChallan, ...(state.pft2Challans ?? [])];
      state.pft2Challans = updatedChallans;
      savePilotState(state);

      setIssuedChallan(newChallan);
      setErrorMessage("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Issuance failed: ${msg}`);
    } finally {
      setIsIssuing(false);
    }
  };

  // Derive active challan notice metadata (issued or live preview)
  const activeNoticeNumber =
    issuedChallan?.noticeNumber ??
    generatePft2NoticeNumber({
      demandNumber: unit.demandUnit.permanentDemandNo,
      issueDate: systemIssueDate,
      formTypeCode: formType,
      demandScope,
      paymentScope,
      amount: effectivePayableAmount
    });

  const activePin = issuedChallan?.pin ?? generateDocumentPin(activeNoticeNumber);

  // Generate authoritative 3-copy model matching statutory Rule 9 layout
  const challanModel = generateFormPFT2(unit, {
    dueDate: issuedChallan?.dueDate ?? dueDate,
    issueDate: issuedChallan?.issueDate ?? systemIssueDate,
    formType: issuedChallan?.formType ?? formType,
    demandScope: issuedChallan?.demandScope ?? demandScope,
    paymentScope: issuedChallan?.paymentScope ?? paymentScope,
    customAmount: issuedChallan?.amountPayable ?? effectivePayableAmount,
    isPartial: (issuedChallan?.paymentScope ?? paymentScope) === "PARTIAL",
    remainingBalance:
      issuedChallan?.remainingBalance ??
      (paymentScope === "PARTIAL"
        ? Math.max(0, validation.calculatedAmount - effectivePayableAmount)
        : 0),
    noticeNumber: activeNoticeNumber,
    pin: activePin
  });

  return (
    <div style={{ maxWidth: "80rem", margin: "1.25rem auto", padding: "1rem" }}>
      {/* Top Decoupled Navigation Header (Isolated to Contextual Actions Only) */}
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
          gap: "0.75rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>🏛️</span>
          <div>
            <span
              style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0d3822", display: "block" }}
            >
              PTAS Punjab &bull; Circle-Vehari
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Form P.F.T-2 Statutory Payment Instrument &bull; Rule 9
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              downloadDocumentPdf(
                "issued-pft2-document-target",
                `Form_PFT2_${activeNoticeNumber.replace(/\//g, "_")}.pdf`,
                { orientation: "landscape" }
              )
            }
            title="Download authoritative 3-copy Form PFT-2 payment instrument as PDF"
          >
            📥 Download PDF (Landscape)
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.print()}
            title="Print 3-copy Form PFT-2 document"
          >
            🖨️ Print Document
          </button>
          <a
            href="/"
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
            ← Main Dashboard
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
            📋 View Assessee Dossier
          </a>
        </div>
      </div>

      {/* Establishment Switcher & Issuance Configuration Bar */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          marginBottom: "1.25rem",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
            gap: "0.5rem"
          }}
        >
          <div>
            <label
              htmlFor="establishment-selector"
              style={{
                display: "block",
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#166534",
                marginBottom: "0.25rem"
              }}
            >
              Select Taxpayer Establishment:
            </label>
            <select
              id="establishment-selector"
              value={unit.provincialUin}
              onChange={(e) => handleSelectUnit(e.target.value)}
              style={{
                minWidth: "22rem",
                maxWidth: "38rem",
                padding: "0.45rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid #86efac",
                fontSize: "0.85rem",
                fontWeight: 600,
                backgroundColor: "#f0fdf4",
                color: "#0f172a"
              }}
            >
              {allUnits.map((u) => {
                const assessed = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                return (
                  <option key={u.id} value={u.provincialUin}>
                    PIN: {u.provincialUin} &bull; PDN: {u.demandUnit.permanentDemandNo} &bull;{" "}
                    {u.statutoryRule.category} (Assessed: PKR {assessed.toLocaleString()})
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              style={{ fontSize: "0.8rem" }}
            >
              {showConfigPanel ? "🔼 Hide Issuance Controls" : "⚙️ Issuance Controls"}
            </button>
            {!issuedChallan ? (
              <button
                type="button"
                className="btn-success btn-sm"
                onClick={handleConfirmIssuance}
                disabled={!validation.canIssue || isIssuing}
                style={{ fontWeight: 700 }}
              >
                {isIssuing ? "Issuing..." : "⚡ Issue & Register Challan"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setIssuedChallan(null)}
              >
                ➕ Issue Another
              </button>
            )}
          </div>
        </div>

        {/* Streamlined Issuance Controls (Form Type removed, Radio check buttons for Scope) */}
        {showConfigPanel && !issuedChallan && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              paddingTop: "0.85rem",
              borderTop: "1px solid #e2e8f0",
              fontSize: "0.85rem"
            }}
          >
            {/* Challan Scope Radio Group */}
            <div>
              <span
                style={{
                  display: "block",
                  fontWeight: 700,
                  color: "#1e293b",
                  marginBottom: "0.35rem"
                }}
              >
                Challan Scope:
              </span>
              <div
                style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    color: demandScope === "CURRENT" ? "#065f46" : "#475569"
                  }}
                >
                  <input
                    type="radio"
                    name="pf2DemandScopeRadio"
                    value="CURRENT"
                    checked={demandScope === "CURRENT"}
                    onChange={() => {
                      setDemandScope("CURRENT");
                      setErrorMessage("");
                    }}
                  />
                  <span>01 - Current Year Demand</span>
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    color: demandScope === "ARREAR" ? "#065f46" : "#475569"
                  }}
                >
                  <input
                    type="radio"
                    name="pf2DemandScopeRadio"
                    value="ARREAR"
                    checked={demandScope === "ARREAR"}
                    onChange={() => {
                      setDemandScope("ARREAR");
                      setErrorMessage("");
                    }}
                  />
                  <span>02 - Arrears Demand</span>
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    color: demandScope === "COMBINED" ? "#065f46" : "#475569"
                  }}
                >
                  <input
                    type="radio"
                    name="pf2DemandScopeRadio"
                    value="COMBINED"
                    checked={demandScope === "COMBINED"}
                    onChange={() => {
                      setDemandScope("COMBINED");
                      setErrorMessage("");
                    }}
                  />
                  <span>03 - Combined (Current + Arrear)</span>
                </label>
              </div>
            </div>

            {/* Payment Scope Radio Group & Due Date Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
                gap: "1rem",
                alignItems: "flex-start"
              }}
            >
              <div>
                <span
                  style={{
                    display: "block",
                    fontWeight: 700,
                    color: "#1e293b",
                    marginBottom: "0.35rem"
                  }}
                >
                  Payment Scope:
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "1.25rem",
                    flexWrap: "wrap",
                    alignItems: "center"
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      cursor: "pointer",
                      fontWeight: 600,
                      color: paymentScope === "FULL" ? "#065f46" : "#475569"
                    }}
                  >
                    <input
                      type="radio"
                      name="pf2PaymentScopeRadio"
                      value="FULL"
                      checked={paymentScope === "FULL"}
                      onChange={() => setPaymentScope("FULL")}
                    />
                    <span>Full Assessed (PKR {validation.calculatedAmount.toLocaleString()})</span>
                  </label>

                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      cursor: "pointer",
                      fontWeight: 600,
                      color: paymentScope === "PARTIAL" ? "#065f46" : "#475569"
                    }}
                  >
                    <input
                      type="radio"
                      name="pf2PaymentScopeRadio"
                      value="PARTIAL"
                      checked={paymentScope === "PARTIAL"}
                      onChange={() => setPaymentScope("PARTIAL")}
                    />
                    <span>Partial / Installment</span>
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="pf2-due-date-input"
                  style={{
                    display: "block",
                    fontWeight: 700,
                    color: "#1e293b",
                    marginBottom: "0.35rem"
                  }}
                >
                  Statutory Due Date (Calendar Month):
                </label>
                <input
                  id="pf2-due-date-input"
                  type="date"
                  className="form-control"
                  style={{ fontSize: "0.85rem", padding: "0.35rem 0.6rem", maxWidth: "16rem" }}
                  value={dueDate}
                  min={minDueDate}
                  max={maxDueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {paymentScope === "PARTIAL" && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "6px",
                  padding: "0.6rem 0.85rem",
                  maxWidth: "24rem"
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: "0.25rem",
                    fontSize: "0.8rem"
                  }}
                >
                  Enter Partial Amount to Demand (PKR):
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{ fontSize: "0.85rem", padding: "0.35rem 0.6rem" }}
                  value={partialAmount}
                  min={100}
                  max={validation.calculatedAmount}
                  onChange={(e) => setPartialAmount(Number(e.target.value))}
                />
              </div>
            )}
          </div>
        )}

        {/* Issued Status Notification Banner */}
        {issuedChallan && (
          <div
            style={{
              marginTop: "0.75rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              padding: "0.6rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "0.825rem"
            }}
          >
            <div style={{ color: "#166534" }}>
              <strong>✓ Form P.F.T-2 Successfully Issued &amp; Sealed:</strong> Challan No:{" "}
              <strong>{issuedChallan.challanNumber}</strong> &bull; Notice No:{" "}
              <strong>{issuedChallan.noticeNumber}</strong> &bull; PIN:{" "}
              <strong>{issuedChallan.pin}</strong>
            </div>
            <div style={{ color: "#15803d", fontWeight: 700 }}>
              Amount: PKR {issuedChallan.amountPayable.toLocaleString()} &bull; Due:{" "}
              {issuedChallan.dueDate}
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginTop: "0.75rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "0.6rem 1rem",
              color: "#991b1b",
              fontSize: "0.85rem"
            }}
          >
            <strong>Error:</strong> {errorMessage}
          </div>
        )}
      </div>

      {/* THE AUTHENTIC STATUTORY 3-COPY FORM P.F.T-2 PAYMENT INSTRUMENT (EXACT STATUTORY RULE 9 LAYOUT) */}
      <div
        className="challan-grid printable-document"
        id="issued-pft2-document-target"
        style={{
          maxWidth: "80rem",
          margin: "0 auto",
          background: "#ffffff",
          padding: "1rem",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.08)"
        }}
      >
        {challanModel.copies.map((copy, cIdx) => (
          <div key={cIdx} className="challan-card">
            {/* Top Section with Left QR Code & Copy Info */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                borderBottom: "2px solid #0d3822",
                paddingBottom: "0.4rem"
              }}
            >
              {/* Left: QR Code */}
              <div style={{ flexShrink: 0 }}>
                <StatutoryQrCode
                  payload={copy.qrPayload}
                  size={66}
                  label="Scan to Verify"
                  subtitle={copy.bankUse.challanSerial}
                />
              </div>

              {/* Right: Copy Title & Department Header */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#166534",
                    background: "#dcfce7",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    display: "inline-block",
                    marginBottom: "0.2rem"
                  }}
                >
                  {copy.copyTitle}
                </span>
                <h4
                  style={{
                    margin: "0.1rem 0 0.05rem",
                    fontSize: "0.8rem",
                    color: "#0d3822",
                    fontWeight: 700
                  }}
                >
                  GOVERNMENT OF THE PUNJAB
                </h4>
                <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700 }}>
                  EXCISE &amp; TAXATION DEPARTMENT
                </p>
                <p style={{ margin: "0.1rem 0", fontSize: "0.68rem", fontWeight: 600 }}>
                  PUNJAB PROFESSIONS &amp; TRADES TAX
                </p>
                <p style={{ margin: 0, fontSize: "0.62rem", color: "#64748b" }}>
                  PAYMENT CHALLAN &bull; Rule 9
                </p>
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "#b45309",
                    marginTop: "0.15rem"
                  }}
                >
                  Head: {copy.headOfAccount}
                </div>
              </div>
            </div>

            {/* Unified Metadata & Assessment Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.35rem 0.5rem",
                fontSize: "0.72rem",
                background: "#f8fafc",
                padding: "0.4rem",
                borderRadius: "4px",
                border: "1px solid #e2e8f0"
              }}
            >
              <div
                style={{
                  gridColumn: "span 2",
                  fontSize: "0.7rem",
                  fontFamily: "monospace",
                  color: "#1e3a8a",
                  wordBreak: "break-all"
                }}
              >
                <strong>Notice No:</strong> {copy.noticeNumber}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: "0.72rem",
                    background: "#e0f2fe",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                    letterSpacing: "1px"
                  }}
                >
                  🔐 PIN: {copy.pin}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>Demand No:</strong>{" "}
                <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#0d3822" }}>
                  {copy.assessmentInfo.demandNo}
                </span>
              </div>
              {copy.taxpayerInfo.provincialUin && (
                <div
                  style={{
                    gridColumn: "span 2",
                    fontSize: "0.72rem",
                    borderTop: "1px dashed #e2e8f0",
                    paddingTop: "0.25rem"
                  }}
                >
                  <strong>PIN (Professional Identification Number):</strong>{" "}
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "#1d4ed8",
                      fontWeight: 700
                    }}
                  >
                    {copy.taxpayerInfo.provincialUin}
                  </span>
                </div>
              )}
              <div>
                <strong>Circle:</strong> {copy.assessmentInfo.circleName}
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>District:</strong> {copy.district}
              </div>
              <div>
                <strong>Tax Year:</strong> {copy.taxYear}
              </div>
              <div style={{ textAlign: "right", color: "#b91c1c" }}>
                <strong>Due Date:</strong> {copy.dueDate}
              </div>
            </div>

            {/* Taxpayer Details */}
            <div style={{ fontSize: "0.75rem", lineHeight: 1.4 }}>
              <p style={{ margin: "0.15rem 0" }}>
                <strong>Class:</strong> {copy.taxpayerInfo.classification}{" "}
                <span style={{ fontWeight: 700, color: "#166534" }}>
                  (PKR {copy.taxpayerInfo.slabRatePkr.toLocaleString()})
                </span>
              </p>
              <p style={{ margin: "0.15rem 0" }}>
                <strong>Name:</strong> {copy.taxpayerInfo.legalName}
              </p>
              {copy.taxpayerInfo.tradeName && (
                <p style={{ margin: "0.15rem 0" }}>
                  <strong>Trade:</strong> {copy.taxpayerInfo.tradeName}
                </p>
              )}
              <p style={{ margin: "0.15rem 0" }}>
                <strong>Address:</strong> {copy.taxpayerInfo.address}
              </p>
            </div>

            {/* Detail of Tax Payable Table */}
            <div>
              <strong
                style={{
                  fontSize: "0.75rem",
                  color: "#0d3822",
                  display: "block",
                  marginBottom: "0.2rem"
                }}
              >
                Detail of Tax Payable:
              </strong>
              <table
                style={{
                  width: "100%",
                  fontSize: "0.75rem",
                  borderCollapse: "collapse",
                  border: "1px solid #cbd5e1"
                }}
              >
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.25rem 0.4rem" }}>Current Tax</td>
                    <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>
                      Rs. {copy.taxPayable.currentTax.toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.25rem 0.4rem" }}>Arrears</td>
                    <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>Rs. 0</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.25rem 0.4rem" }}>Penalty</td>
                    <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>Rs. 0</td>
                  </tr>
                  <tr style={{ fontWeight: 800, background: "#f0fdf4" }}>
                    <td style={{ padding: "0.3rem 0.4rem", color: "#166534" }}>Total Payable</td>
                    <td
                      style={{
                        padding: "0.3rem 0.4rem",
                        textAlign: "right",
                        color: "#166534"
                      }}
                    >
                      Rs. {copy.taxPayable.totalPayable.toLocaleString()}
                    </td>
                  </tr>
                  {copy.isPartial && (
                    <tr style={{ background: "#fef3c7" }}>
                      <td
                        style={{
                          padding: "0.25rem 0.4rem",
                          color: "#92400e",
                          fontSize: "0.7rem"
                        }}
                      >
                        Remaining Balance
                      </td>
                      <td
                        style={{
                          padding: "0.25rem 0.4rem",
                          textAlign: "right",
                          color: "#92400e",
                          fontSize: "0.7rem",
                          fontWeight: 700
                        }}
                      >
                        Rs. {(copy.remainingBalance ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p
                style={{
                  margin: "0.3rem 0 0",
                  fontSize: "0.7rem",
                  color: "#475569",
                  fontStyle: "italic"
                }}
              >
                (in words) {copy.taxPayable.totalPayableWords}
              </p>
            </div>

            {/* For Bank's Use Only */}
            <div
              style={{
                marginTop: "auto",
                borderTop: "2px solid #0d3822",
                paddingTop: "0.5rem",
                fontSize: "0.7rem",
                background: "#fafaf9",
                padding: "0.5rem",
                borderRadius: "4px"
              }}
            >
              <strong style={{ display: "block", color: "#78350f" }}>
                For Bank&apos;s Use Only:
              </strong>
              <p style={{ margin: "0.1rem 0" }}>Challan No: ______________________</p>
              <p style={{ margin: "0.1rem 0" }}>Date: _____________________________</p>
              <p style={{ margin: "0.1rem 0" }}>
                Amount: Rs. {copy.taxPayable.totalPayable.toLocaleString()}
              </p>
              <div
                style={{
                  marginTop: "0.4rem",
                  border: "1px dashed #a8a29e",
                  height: "2.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#78716c",
                  fontSize: "0.65rem"
                }}
              >
                Bank Officer&apos;s Signature &amp; Bank Stamp
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DocumentIssuancePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center" }}>Loading issuance context...</div>
      }
    >
      <DocumentIssuanceContent />
    </Suspense>
  );
}

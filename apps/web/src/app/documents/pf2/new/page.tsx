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
  const [formType, setFormType] = useState<
    "STANDARD" | "NOTICE_CUM_CHALLAN" | "ARREARS_DEMAND" | "REVISED_ASSESSMENT"
  >("STANDARD");
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

  useEffect(() => {
    const state = loadPilotState();
    const available = state.units && state.units.length > 0 ? state.units : [];
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

  // If already issued in this session, render the issued document view with Download PDF
  if (issuedChallan) {
    const pft2Doc = generateFormPFT2(unit, {
      dueDate: issuedChallan.dueDate,
      issueDate: issuedChallan.issueDate,
      formType: issuedChallan.formType,
      demandScope: issuedChallan.demandScope,
      paymentScope: issuedChallan.paymentScope,
      customAmount: issuedChallan.amountPayable,
      isPartial: issuedChallan.paymentScope === "PARTIAL",
      remainingBalance: issuedChallan.remainingBalance,
      noticeNumber: issuedChallan.noticeNumber,
      pin: issuedChallan.pin
    });

    return (
      <div style={{ maxWidth: "76rem", margin: "2rem auto", padding: "1.5rem" }}>
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            padding: "1rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div>
            <h2 style={{ color: "#166534", margin: "0 0 0.25rem", fontSize: "1.25rem" }}>
              ✓ Form P.F.T-2 Successfully Issued
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#15803d" }}>
              Challan No: <strong>{issuedChallan.challanNumber}</strong> &bull; Notice No:{" "}
              <strong>{issuedChallan.noticeNumber}</strong> &bull; PIN:{" "}
              <strong>{issuedChallan.pin}</strong> &bull; Due:{" "}
              <strong>{issuedChallan.dueDate}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                downloadDocumentPdf(
                  "issued-pft2-document-target",
                  `Form_PFT2_${issuedChallan.noticeNumber?.replace(/\//g, "_") || "challan"}.pdf`,
                  { orientation: "landscape" }
                )
              }
            >
              📥 Download PDF
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIssuedChallan(null);
              }}
            >
              ➕ Issue Another
            </button>
            <a
              href="/"
              className="btn-secondary"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              ← Main Dashboard
            </a>
            <button type="button" className="btn-secondary" onClick={() => window.close()}>
              Done &amp; Close Tab
            </button>
          </div>
        </div>

        {/* 3-Copy Side-by-Side Document View for PDF Capture */}
        <div
          id="issued-pft2-document-target"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "1rem",
            background: "#ffffff",
            padding: "1rem",
            border: "1px solid #cbd5e1",
            borderRadius: "8px"
          }}
        >
          {pft2Doc.copies.map((copy, idx) => (
            <div
              key={idx}
              style={{
                border: "1px solid #0d3822",
                borderRadius: "4px",
                padding: "0.75rem",
                fontSize: "0.75rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "1px solid #0d3822",
                    paddingBottom: "0.4rem",
                    marginBottom: "0.5rem"
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "#0d3822" }}>
                    GOVERNMENT OF THE PUNJAB
                  </div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                    Excise, Taxation &amp; Narcotics Control Department
                  </div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      marginTop: "0.2rem",
                      background: "#f8fafc",
                      padding: "0.15rem"
                    }}
                  >
                    FORM P.F.T-2 &bull; {copy.copyTitle}
                  </div>
                </div>

                <div style={{ marginBottom: "0.5rem", lineHeight: 1.4 }}>
                  <div>
                    <strong>Demand No:</strong> {issuedChallan.demandNumber}
                  </div>
                  <div>
                    <strong>Notice No:</strong> {issuedChallan.noticeNumber}
                  </div>
                  <div>
                    <strong>Assessee:</strong> {copy.taxpayerInfo.legalName}
                  </div>
                  <div>
                    <strong>PIN:</strong>{" "}
                    {copy.taxpayerInfo.provincialUin || copy.taxpayerInfo.taxNo}
                  </div>
                  <div>
                    <strong>Head of Account:</strong> B01601 (Professional Tax)
                  </div>
                  <div>
                    <strong>Due Date:</strong> {copy.dueDate}
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    padding: "0.5rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: "4px",
                    marginBottom: "0.75rem"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Amount Payable:</span>
                    <strong>PKR {copy.taxPayable.totalPayable.toLocaleString()}</strong>
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "0.25rem" }}>
                    {copy.taxPayable.totalPayableWords}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  borderTop: "1px dashed #cbd5e1",
                  paddingTop: "0.5rem"
                }}
              >
                <StatutoryQrCode
                  payload={issuedChallan.qrPayload}
                  size={75}
                  securityCode={issuedChallan.pin}
                />
                <div style={{ textAlign: "right", fontSize: "0.65rem", color: "#64748b" }}>
                  <div>Authorized Officer</div>
                  <div style={{ fontWeight: 600, color: "#0d3822" }}>Circle-Vehari</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "52rem", margin: "1.5rem auto", padding: "1rem" }}>
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
            PTAS Punjab &bull; Circle-Vehari
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
          <a
            href="/verify"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            🔍 Citizen Verify ↗
          </a>
          <a
            href="/admin/user-management"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            👥 User Management ↗
          </a>
          <a
            href="/intelligence/statutory-category-yield"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            📊 Category Yield ↗
          </a>
        </div>
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.25rem 1.5rem",
          borderRadius: "8px 8px 0 0"
        }}
      >
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.3rem", fontWeight: 700 }}>
          Issue Form P.F.T-2 Payment Challan
        </h1>
        <p style={{ margin: 0, fontSize: "0.825rem", color: "#bbf7d0" }}>
          Statutory 3-Copy Payment Instrument under Rule 9 &bull; Immutable Unit Context
        </p>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          padding: "1.5rem"
        }}
      >
        {/* Establishment Switcher for Issuance Desk */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "6px",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem"
          }}
        >
          <label
            htmlFor="establishment-selector"
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#166534",
              marginBottom: "0.35rem"
            }}
          >
            Select Taxpayer Establishment for Issuance:
          </label>
          <select
            id="establishment-selector"
            value={unit.provincialUin}
            onChange={(e) => handleSelectUnit(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #86efac",
              fontSize: "0.88rem",
              fontWeight: 600,
              backgroundColor: "#ffffff",
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

        {/* Fixed Read-Only Entity Information (Section 1.6: no dropdowns allowed) */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "1rem",
            marginBottom: "1.5rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            fontSize: "0.85rem"
          }}
        >
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              Assessee Legal Name:
            </span>
            <strong>{unit.legalName}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              Trade / Business:
            </span>
            <strong>{unit.tradeName || unit.legalName}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              PIN (Professional Identification Number):
            </span>
            <span style={{ fontFamily: "monospace", color: "#1d4ed8", fontWeight: 700 }}>
              {unit.provincialUin}
            </span>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              Permanent Demand No:
            </span>
            <strong>{unit.demandUnit.permanentDemandNo}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              Classification:
            </span>
            <span>
              Class {unit.statutoryRule.subclassification_code ?? unit.statutoryRule.category_code}{" "}
              &bull; {unit.statutoryRule.category}
            </span>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
              Annual Assessed Liability:
            </span>
            <strong>
              PKR {unit.assessmentVersions[0]?.snapshot.taxAmount?.toLocaleString() ?? 0}
            </strong>
          </div>
        </div>

        {errorMessage && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "0.85rem 1rem",
              color: "#991b1b",
              fontSize: "0.85rem",
              marginBottom: "1.25rem"
            }}
          >
            <strong>Error:</strong> {errorMessage}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmIssuance();
          }}
        >
          {/* Challan Controls */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1rem"
            }}
          >
            <div className="form-group">
              <label
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "0.35rem"
                }}
              >
                Challan Scope / Type:
              </label>
              <select
                className="form-control"
                value={demandScope}
                onChange={(e) => {
                  setDemandScope(e.target.value as "CURRENT" | "ARREAR" | "COMBINED");
                  setErrorMessage("");
                }}
              >
                <option value="CURRENT">Current-Year Demand Challan</option>
                <option value="ARREAR">Arrear Challan</option>
                <option value="COMBINED">Combined Challan (Current + Adjusted Arrears)</option>
              </select>
            </div>

            <div className="form-group">
              <label
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "0.35rem"
                }}
              >
                Form Type:
              </label>
              <select
                className="form-control"
                value={formType}
                onChange={(e) =>
                  setFormType(
                    e.target.value as
                      "STANDARD" | "NOTICE_CUM_CHALLAN" | "ARREARS_DEMAND" | "REVISED_ASSESSMENT"
                  )
                }
              >
                <option value="STANDARD">01 - Standard Payment Challan</option>
                <option value="NOTICE_CUM_CHALLAN">02 - Notice-cum-Challan</option>
                <option value="ARREARS_DEMAND">03 - Arrears Demand Challan</option>
                <option value="REVISED_ASSESSMENT">04 - Revised Assessment Challan</option>
              </select>
            </div>
          </div>

          {/* Date Controls: Section 8: Issue Date is system-assigned, Due Date is strictly within current month */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1.25rem"
            }}
          >
            <div className="form-group">
              <label
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "0.35rem",
                  color: "#64748b"
                }}
              >
                Issue Date (System Generated &bull; PKT):
              </label>
              <input
                type="text"
                className="form-control"
                value={systemIssueDate}
                readOnly
                disabled
                style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
              />
            </div>

            <div className="form-group">
              <label
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "0.35rem"
                }}
              >
                Due Date (Restricted to Current Month):
              </label>
              <input
                type="date"
                className="form-control"
                value={dueDate}
                min={minDueDate}
                max={maxDueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#64748b",
                  marginTop: "0.2rem",
                  display: "block"
                }}
              >
                Allowed range: {minDueDate} to {maxDueDate}
              </span>
            </div>
          </div>

          {/* Payment Scope */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1.25rem"
            }}
          >
            <div className="form-group">
              <label
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "block",
                  marginBottom: "0.35rem"
                }}
              >
                Payment Scope:
              </label>
              <select
                className="form-control"
                value={paymentScope}
                onChange={(e) => setPaymentScope(e.target.value as "FULL" | "PARTIAL")}
              >
                <option value="FULL">Full Assessed Amount</option>
                <option value="PARTIAL">Partial / Installment Payment</option>
              </select>
            </div>

            {paymentScope === "PARTIAL" && (
              <div className="form-group">
                <label
                  style={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    display: "block",
                    marginBottom: "0.35rem"
                  }}
                >
                  Partial Amount (PKR):
                </label>
                <input
                  type="number"
                  className="form-control"
                  value={partialAmount}
                  min={100}
                  max={validation.calculatedAmount}
                  onChange={(e) => setPartialAmount(Number(e.target.value))}
                  required
                />
              </div>
            )}
          </div>

          {/* Dynamic Financial Feedback (Section 9) */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "6px",
              marginBottom: "1.5rem",
              background: validation.canIssue ? "#f0fdf4" : "#fffbeb",
              border: `1px solid ${validation.canIssue ? "#bbf7d0" : "#fde68a"}`
            }}
          >
            {validation.canIssue ? (
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#166534",
                      fontWeight: 700,
                      textTransform: "uppercase"
                    }}
                  >
                    Verified Net Payable Amount:
                  </span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#14532d" }}>
                    PKR {effectivePayableAmount.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                  Scope: <strong>{demandScope}</strong> &bull; Due: <strong>{dueDate}</strong>
                </div>
              </div>
            ) : (
              <div>
                <strong style={{ color: "#92400e", display: "block", marginBottom: "0.25rem" }}>
                  {validation.error}
                </strong>
                <span style={{ fontSize: "0.8rem", color: "#78350f" }}>
                  Challans cannot be issued for zero or non-payable balances.
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button type="button" className="btn-secondary" onClick={() => window.close()}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!validation.canIssue || isIssuing}
            >
              {isIssuing ? "Issuing..." : "Confirm & Issue Form PFT-2"}
            </button>
          </div>
        </form>
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

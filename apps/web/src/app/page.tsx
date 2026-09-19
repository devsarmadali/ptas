"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  type AuditActor,
  type DuplicateMatch,
  type Taxpayer,
  approveAssessmentVersion,
  computeContentSha256,
  computeLedgerBalance,
  createAssessment,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  createTaxpayer,
  findDuplicateCandidates,
  getRulesByCategory,
  getStatutoryCategories,
  getStatutoryRuleById,
  returnAssessmentVersion,
  submitAssessmentVersion
} from "@ptas/domain";
import {
  CIRCLE_VEHARI_ID,
  FINANCIAL_YEAR_2026_27,
  MOCK_OFFICERS,
  type MockOfficer,
  type PilotAuditItem,
  type StoredUnit,
  type StoredUnitSnapshot,
  loadPilotState,
  resetPilotState,
  savePilotState
} from "../lib/pilot-store";

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [officer, setOfficer] = useState<MockOfficer>(MOCK_OFFICERS[0]);
  const [units, setUnits] = useState<StoredUnit[]>([]);
  const [auditLogs, setAuditLogs] = useState<PilotAuditItem[]>([]);
  const [activeTab, setActiveTab] = useState<
    "UNITS" | "ASSESSMENTS" | "LEDGER" | "FORM_PFT2" | "EPAY" | "AUDIT"
  >("UNITS");

  // Selected Unit for Ledger & Form PFT-2 inspection
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  // Modal States
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetUnitId, setReturnTargetUnitId] = useState("");
  const [returnReason, setReturnReason] = useState("");

  // New Unit Form State
  const [newLegalName, setNewLegalName] = useState("");
  const [newTradeName, setNewTradeName] = useState("");
  const [newIdentifierType, setNewIdentifierType] = useState<"CNIC" | "NTN">("CNIC");
  const [newIdentifierValue, setNewIdentifierValue] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("3");
  const [newRuleId, setNewRuleId] = useState("PFT-3.i.b"); // Default: Commercial Establishment (Others - Vehari) -> PKR 4,000

  // Payment Form State
  const [paymentUnitId, setPaymentUnitId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState<number>(4000);
  const [paymentChannel, setPaymentChannel] = useState<"CHALLAN_32A" | "EPAY_PUNJAB">(
    "CHALLAN_32A"
  );
  const [paymentReceiptNo, setPaymentReceiptNo] = useState("CHALLAN-32A-2026-");
  const [paymentDate, setPaymentDate] = useState("2026-09-19");

  // Document Studio Tamper State
  const [isTampered, setIsTampered] = useState(false);
  const [tamperedAmount, setTamperedAmount] = useState(100);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load from local storage / seed on mount
  useEffect(() => {
    const state = loadPilotState();
    setOfficer(state.currentOfficer);
    setUnits(state.units);
    setAuditLogs(state.auditLogs);
    if (state.units.length > 0) {
      const firstId = state.units[0]?.id ?? "";
      setSelectedUnitId(firstId);
      setPaymentUnitId(firstId);
    }
    setIsLoaded(true);
  }, []);

  // Synchronize state changes to localStorage
  const syncState = (
    updatedUnits: StoredUnit[],
    updatedAudits: PilotAuditItem[],
    updatedOfficer?: MockOfficer
  ) => {
    setUnits(updatedUnits);
    setAuditLogs(updatedAudits);
    if (updatedOfficer) setOfficer(updatedOfficer);
    savePilotState({
      currentOfficer: updatedOfficer ?? officer,
      units: updatedUnits,
      auditLogs: updatedAudits,
      reconciliations: []
    });
  };

  // Reset demo
  const handleResetDemo = () => {
    if (confirm("Reset pilot dataset to clean factory seed state?")) {
      const clean = resetPilotState();
      setOfficer(clean.currentOfficer);
      setUnits(clean.units);
      setAuditLogs(clean.auditLogs);
      if (clean.units.length > 0) {
        const firstId = clean.units[0]?.id ?? "";
        setSelectedUnitId(firstId);
        setPaymentUnitId(firstId);
      }
      showToast("info", "Vehari pilot dataset reset to statutory factory baseline.");
    }
  };

  // Switch Active Officer
  const handleSwitchOfficer = (targetOfficer: MockOfficer) => {
    setOfficer(targetOfficer);
    syncState(units, auditLogs, targetOfficer);
    showToast("info", `Switched session to ${targetOfficer.name} (${targetOfficer.badgeText})`);
  };

  // All categories and rules
  const allCategories = useMemo(() => getStatutoryCategories(), []);
  const availableRulesForCategory = useMemo(() => {
    return getRulesByCategory(newCategoryCode);
  }, [newCategoryCode]);

  // When category changes, auto-select first rule of that category
  useEffect(() => {
    if (availableRulesForCategory.length > 0 && availableRulesForCategory[0]) {
      setNewRuleId(availableRulesForCategory[0].rule_id);
    }
  }, [newCategoryCode, availableRulesForCategory]);

  const selectedStatutoryRule = useMemo(() => {
    return getStatutoryRuleById(newRuleId) ?? availableRulesForCategory[0];
  }, [newRuleId, availableRulesForCategory]);

  // Real-time Duplicate Detection using domain's findDuplicateCandidates
  const duplicateWarning = useMemo((): DuplicateMatch | null => {
    if (!newIdentifierValue.trim() && !newLegalName.trim()) return null;

    const actor: AuditActor = {
      userId: "system-audit",
      roleCode: "INSPECTOR",
      jurisdictionId: CIRCLE_VEHARI_ID
    };

    const existingAsTaxpayers: Taxpayer[] = units
      .map((u) => {
        try {
          return createTaxpayer(
            {
              id: u.id,
              displayName: u.legalName,
              currentCircleId: u.circleId,
              identifiers: [
                {
                  identifierType: u.identifierType,
                  value: u.identifierValue
                }
              ]
            },
            actor
          );
        } catch {
          return null;
        }
      })
      .filter((t): t is Taxpayer => t !== null);

    const matches = findDuplicateCandidates(
      {
        displayName: newLegalName.trim() || "New Candidate",
        currentCircleId: CIRCLE_VEHARI_ID,
        identifiers: newIdentifierValue.trim()
          ? [
              {
                identifierType: newIdentifierType,
                value: newIdentifierValue.trim()
              }
            ]
          : []
      },
      existingAsTaxpayers
    );

    return matches.length > 0 ? (matches[0] ?? null) : null;
  }, [newIdentifierValue, newLegalName, newIdentifierType, units]);

  // Metrics Calculations
  const metrics = useMemo(() => {
    const totalUnits = units.length;
    let totalDemand = 0;
    let totalPayments = 0;
    let pendingApprovals = 0;

    for (const u of units) {
      for (const entry of u.ledgerEntries) {
        if (entry.amount > 0) {
          totalDemand += entry.amount;
        } else {
          totalPayments += Math.abs(entry.amount);
        }
      }
      const pending = u.assessments.some((a) => a.status === "SUBMITTED");
      if (pending) pendingApprovals++;
    }

    const outstandingBalance = totalDemand - totalPayments;
    return {
      totalUnits,
      totalDemand,
      totalPayments,
      outstandingBalance,
      pendingApprovals
    };
  }, [units]);

  // Handler: Add New Unit
  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLegalName.trim()) {
      showToast("error", "Legal name is mandatory");
      return;
    }
    if (!newIdentifierValue.trim()) {
      showToast("error", "CNIC or NTN identifier is mandatory");
      return;
    }

    const rule = getStatutoryRuleById(newRuleId);
    if (!rule) {
      showToast("error", "Invalid statutory rule selected");
      return;
    }

    const unitId = `unit-${Date.now()}`;
    const demandUnitId = `du-${Date.now()}`;
    const correlationId = `corr-unit-${Date.now()}`;

    const actor: AuditActor = {
      userId: officer.id,
      roleCode: officer.role,
      jurisdictionId: officer.jurisdictionId
    };

    // Create Draft Assessment under selected rule
    const { assessment, version } = createAssessment<StoredUnitSnapshot>(
      {
        id: `asm-${Date.now()}`,
        taxpayerId: unitId,
        financialYearId: FINANCIAL_YEAR_2026_27,
        snapshot: {
          taxAmount: rule.annual_rate_pkr,
          statutoryCategory: rule.category,
          legalBasis: rule.official_text,
          ruleId: rule.rule_id,
          subclassificationCode: rule.subclassification_code
        }
      },
      actor
    );

    const newUnit: StoredUnit = {
      id: unitId,
      legalName: newLegalName.trim(),
      tradeName: newTradeName.trim() || undefined,
      identifierType: newIdentifierType,
      identifierValue: newIdentifierValue.trim(),
      address: newAddress.trim() || "Tehsil Vehari, Punjab",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: rule.category_code,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      demandUnit: {
        id: demandUnitId,
        taxpayerId: unitId,
        permanentDemandNo: `PDN-VEH-2026-${String(units.length + 1).padStart(4, "0")}`,
        createdAt: new Date().toISOString()
      },
      assessments: [assessment],
      assessmentVersions: [version],
      ledgerEntries: [],
      createdAt: new Date().toISOString()
    };

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "TAX_UNIT_REGISTERED",
      actorName: officer.name,
      actorRole: officer.role,
      target: newUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId,
      details: `Registered unit under Entry ${rule.subclassification_code} (${rule.category}) at official statutory rate PKR ${rule.annual_rate_pkr.toLocaleString()}`
    };

    const updated = [newUnit, ...units];
    const updatedAudits = [auditItem, ...auditLogs];
    syncState(updated, updatedAudits);

    // Reset Form
    setNewLegalName("");
    setNewTradeName("");
    setNewIdentifierValue("");
    setNewAddress("");
    setShowAddUnitModal(false);
    setSelectedUnitId(unitId);
    showToast(
      "success",
      `Unit '${newUnit.legalName}' successfully registered under Rule ${rule.subclassification_code} (PKR ${rule.annual_rate_pkr})`
    );
  };

  // Handler: Inspector Submits Assessment
  const handleSubmitAssessment = (unitId: string) => {
    const targetUnit = units.find((u) => u.id === unitId);
    if (!targetUnit) return;

    const currentAssessment = targetUnit.assessments[0];
    const currentVersion = targetUnit.assessmentVersions[0];
    if (!currentAssessment || !currentVersion) return;

    try {
      const { assessment: submittedAsm, version: submittedVer } = submitAssessmentVersion(
        currentAssessment,
        currentVersion
      );

      const updatedUnit: StoredUnit = {
        ...targetUnit,
        assessments: [submittedAsm, ...targetUnit.assessments.slice(1)],
        assessmentVersions: [submittedVer, ...targetUnit.assessmentVersions.slice(1)]
      };

      const auditItem: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "ASSESSMENT_SUBMITTED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId: `corr-sub-${Date.now()}`,
        details: `Inspector submitted draft assessment to ETO Tariq Mahmood for statutory review (FY-2026-2027)`
      };

      const updatedUnits = units.map((u) => (u.id === unitId ? updatedUnit : u));
      syncState(updatedUnits, [auditItem, ...auditLogs]);
      showToast("success", `Assessment submitted to ETO Review Queue.`);
    } catch (err: unknown) {
      showToast("error", (err as Error).message);
    }
  };

  // Handler: ETO Grants Statutory Approval
  const handleApproveAssessment = (unitId: string) => {
    if (officer.role !== "ETO" && officer.role !== "DIRECTOR") {
      showToast(
        "error",
        "Authority violation: Statutory approval strictly requires an ETO or Director."
      );
      return;
    }

    const targetUnit = units.find((u) => u.id === unitId);
    if (!targetUnit) return;

    const currentAssessment = targetUnit.assessments[0];
    const currentVersion = targetUnit.assessmentVersions[0];
    if (!currentAssessment || !currentVersion) return;

    try {
      const etoActor: AuditActor = {
        userId: officer.id,
        roleCode: officer.role,
        jurisdictionId: officer.jurisdictionId
      };

      const { assessment: approvedAsm, version: approvedVer } = approveAssessmentVersion(
        currentAssessment,
        currentVersion,
        etoActor,
        `EVD-APP-${Date.now()}`
      );

      // Post Initial Demand to Append-Only Demand Ledger
      const demandEntry = createInitialDemandEntry({
        demandUnitId: targetUnit.demandUnit.id,
        financialYearId: FINANCIAL_YEAR_2026_27,
        assessmentVersionId: approvedVer.id,
        amount: approvedVer.snapshot.taxAmount,
        actorId: officer.id,
        correlationId: `corr-appr-${Date.now()}`,
        idempotencyKey: `idem-dem-${Date.now()}`
      });

      const updatedUnit: StoredUnit = {
        ...targetUnit,
        assessments: [approvedAsm, ...targetUnit.assessments.slice(1)],
        assessmentVersions: [approvedVer, ...targetUnit.assessmentVersions.slice(1)],
        ledgerEntries: [...targetUnit.ledgerEntries, demandEntry]
      };

      const auditItem: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "ASSESSMENT_APPROVED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId: `corr-appr-${Date.now()}`,
        details: `Statutory Approval granted by ETO. Posted initial demand of PKR ${approvedVer.snapshot.taxAmount.toLocaleString()} to demand ledger.`
      };

      const updatedUnits = units.map((u) => (u.id === unitId ? updatedUnit : u));
      syncState(updatedUnits, [auditItem, ...auditLogs]);
      showToast(
        "success",
        `Statutory Approval granted! Form PFT-2 generated and Demand Ledger debited.`
      );
    } catch (err: unknown) {
      showToast("error", (err as Error).message);
    }
  };

  // Handler: ETO Returns Assessment
  const handleOpenReturnModal = (unitId: string) => {
    if (officer.role !== "ETO" && officer.role !== "DIRECTOR") {
      showToast("error", "Authority violation: Returning assessments requires an ETO or Director.");
      return;
    }
    setReturnTargetUnitId(unitId);
    setReturnReason(
      "Second Schedule subclassification requires reassessment of employee count / location limits."
    );
    setShowReturnModal(true);
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUnit = units.find((u) => u.id === returnTargetUnitId);
    if (!targetUnit) return;

    const currentAssessment = targetUnit.assessments[0];
    const currentVersion = targetUnit.assessmentVersions[0];
    if (!currentAssessment || !currentVersion) return;

    try {
      const etoActor: AuditActor = {
        userId: officer.id,
        roleCode: officer.role,
        jurisdictionId: officer.jurisdictionId
      };

      const { assessment: returnedAsm, version: returnedVer } = returnAssessmentVersion(
        currentAssessment,
        currentVersion,
        returnReason.trim(),
        etoActor
      );

      const updatedUnit: StoredUnit = {
        ...targetUnit,
        assessments: [returnedAsm, ...targetUnit.assessments.slice(1)],
        assessmentVersions: [returnedVer, ...targetUnit.assessmentVersions.slice(1)]
      };

      const auditItem: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "ASSESSMENT_RETURNED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId: `corr-ret-${Date.now()}`,
        details: `Returned with statutory reason: ${returnReason.trim()}`
      };

      const updatedUnits = units.map((u) => (u.id === returnTargetUnitId ? updatedUnit : u));
      syncState(updatedUnits, [auditItem, ...auditLogs]);
      setShowReturnModal(false);
      showToast("info", `Assessment returned to Inspector Muhammad Aslam with legal remarks.`);
    } catch (err: unknown) {
      showToast("error", (err as Error).message);
    }
  };

  // Handler: Add Payment Receipt (Challan 32-A / ePay)
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUnit = units.find((u) => u.id === paymentUnitId);
    if (!targetUnit) {
      showToast("error", "Please select a tax unit");
      return;
    }

    if (paymentAmount <= 0) {
      showToast("error", "Deposit amount must be greater than zero");
      return;
    }

    if (!paymentReceiptNo.trim()) {
      showToast("error", "Challan / Receipt number is mandatory");
      return;
    }

    try {
      const correlationId = `corr-pay-${Date.now()}`;
      // Creates an append-only PAYMENT_CREDIT entry (-amount)
      const paymentEntry = createPaymentReceiptEntry({
        demandUnitId: targetUnit.demandUnit.id,
        financialYearId: FINANCIAL_YEAR_2026_27,
        amount: paymentAmount,
        receiptNumber: paymentReceiptNo.trim(),
        paymentChannel: paymentChannel,
        actorId: officer.id,
        correlationId,
        idempotencyKey: `idem-pay-${Date.now()}`,
        depositDate: paymentDate
      });

      const updatedUnit: StoredUnit = {
        ...targetUnit,
        ledgerEntries: [...targetUnit.ledgerEntries, paymentEntry]
      };

      const auditItem: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "PAYMENT_RECEIPT_POSTED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId,
        details: `Recorded ${paymentChannel} deposit of PKR ${paymentAmount.toLocaleString()} (Ref: ${paymentReceiptNo.trim()}). Demand ledger credited.`
      };

      const updatedUnits = units.map((u) => (u.id === paymentUnitId ? updatedUnit : u));
      syncState(updatedUnits, [auditItem, ...auditLogs]);
      setShowPaymentModal(false);
      showToast(
        "success",
        `Payment receipt credited! New derived balance for ${targetUnit.legalName}: PKR ${computeLedgerBalance(
          updatedUnit.ledgerEntries
        ).toLocaleString()}`
      );
    } catch (err: unknown) {
      showToast("error", (err as Error).message);
    }
  };

  // Currently Selected Unit object
  const activeUnit = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId) ?? units[0];
  }, [units, selectedUnitId]);

  // Form PFT-2 Preview Hash and Notice Content
  const formPFT2Data = useMemo(() => {
    if (!activeUnit) return null;
    const latestAssessment = activeUnit.assessments[0];
    const latestVersion = activeUnit.assessmentVersions[0];
    const isApproved = latestAssessment?.status === "APPROVED";

    const displayAmount = isTampered ? tamperedAmount : (latestVersion?.snapshot.taxAmount ?? 0);
    const noticeNo = `PFT-2/VEH/2026/${activeUnit.id.slice(-4)}`;
    const asmNo = `ASM-VEH-2026-${latestAssessment?.id.slice(-4) ?? "0000"}`;

    const canonicalNoticeText = [
      "GOVERNMENT OF THE PUNJAB - EXCISE, TAXATION & NARCOTICS CONTROL",
      "FORM PFT-2: NOTICE OF ASSESSMENT AND DEMAND",
      "(See Rule 5(1) of the Punjab Professions and Trades Tax Rules, 1977)",
      `Notice Number: ${noticeNo}`,
      `Permanent Demand Number: ${activeUnit.demandUnit.permanentDemandNo}`,
      `Assessment Number: ${asmNo} (Version: ${latestVersion?.versionNo ?? 1})`,
      `Financial Year: 2026-2027 | Issue Date: 2026-07-01 | Due Date: 2026-08-31`,
      `Taxpayer Legal Name: ${activeUnit.legalName}`,
      `Trade / Business Name: ${activeUnit.tradeName ?? activeUnit.legalName}`,
      `Identifier: ${activeUnit.identifierType}: ${activeUnit.identifierValue}`,
      `Registered Address: ${activeUnit.address}`,
      `Assessing Authority: Tariq Mahmood, ETO / Assessing Authority, Tehsil Vehari`,
      `Assessed Tax Amount: PKR ${displayAmount.toLocaleString()}`,
      `Statutory Schedule Classification: Entry ${activeUnit.statutoryRule.subclassification_code} - ${activeUnit.statutoryRule.category}`,
      `Legal Basis: ${activeUnit.statutoryRule.official_text}`,
      `Payment Account Head: B-01601 - Professional Tax Punjab`,
      `Treasury Payment Form: Challan Form 32-A (National Bank of Pakistan) or ePay Punjab`
    ].join("\n");

    const officialHash = computeContentSha256(canonicalNoticeText);

    return {
      isApproved,
      displayAmount,
      canonicalNoticeText,
      officialHash
    };
  }, [activeUnit, isTampered, tamperedAmount]);

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <h2>Loading Punjab Professional Tax Administration System (Vehari Pilot)...</h2>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: "fixed",
            top: "1.5rem",
            right: "1.5rem",
            zIndex: 100,
            background:
              notification.type === "success"
                ? "#14532d"
                : notification.type === "error"
                  ? "#991b1b"
                  : "#0369a1",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
            fontWeight: 600,
            fontSize: "0.875rem",
            maxWidth: "28rem"
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Official Gov Header */}
      <header className="gov-header">
        <div className="gov-header-inner">
          <div className="gov-title-group">
            <div className="gov-crest">🏛️</div>
            <div className="gov-titles">
              <h1>Government of the Punjab — Professional Tax Administration (PTAS)</h1>
              <p className="gov-subtitle">
                Pilot Deployment: Multan Region &bull; Vehari District &bull; Tehsil Vehari &bull;
                Circle-Vehari
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.05em"
              }}
            >
              PILOT READY &bull; VERCEL
            </span>
            <button
              onClick={handleResetDemo}
              className="btn-reset"
              title="Reset all data to baseline seed state"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </header>

      {/* Officer Session Switcher Bar */}
      <nav className="officer-bar" aria-label="Officer Session Switcher">
        <div className="officer-bar-inner">
          <div className="officer-current">
            <div className="officer-avatar">{officer.name.charAt(0)}</div>
            <div className="officer-details">
              <strong>
                {officer.name} ({officer.role})
              </strong>
              <span>
                {officer.title} &bull; Jurisdiction: {officer.jurisdictionName}
              </span>
            </div>
          </div>

          <div className="role-switcher-group">
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#64748b",
                marginRight: "0.25rem"
              }}
            >
              Switch Mock Officer:
            </span>
            {MOCK_OFFICERS.map((o) => (
              <button
                key={o.id}
                onClick={() => handleSwitchOfficer(o)}
                className={`role-switch-btn ${officer.id === o.id ? "active" : ""}`}
                title={`Log in as ${o.name} (${o.role})`}
              >
                {o.role === "INSPECTOR"
                  ? "👤 Inspector Aslam"
                  : o.role === "ETO"
                    ? "⚖️ ETO Tariq"
                    : "📊 Director Nawaz"}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Page Body */}
      <main className="page-shell">
        {/* Metric Cards Row */}
        <section className="metric-grid" aria-label="District Vehari Summary Metrics">
          <div className="metric-card highlight">
            <p className="metric-label">Registered Units</p>
            <p className="metric-value">{metrics.totalUnits}</p>
            <p className="metric-subtext">Circle-Vehari Registry</p>
          </div>
          <div className="metric-card info">
            <p className="metric-label">Assessed Demand</p>
            <p className="metric-value">PKR {metrics.totalDemand.toLocaleString()}</p>
            <p className="metric-subtext">Statutory Second Schedule</p>
          </div>
          <div className="metric-card success">
            <p className="metric-label">Total Recoveries</p>
            <p className="metric-value">PKR {metrics.totalPayments.toLocaleString()}</p>
            <p className="metric-subtext">Challan 32-A &amp; ePay Credits</p>
          </div>
          <div className="metric-card warning">
            <p className="metric-label">Outstanding Balance</p>
            <p className="metric-value">PKR {metrics.outstandingBalance.toLocaleString()}</p>
            <p className="metric-subtext">Live Derived Balance</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Pending ETO Review</p>
            <p className="metric-value">{metrics.pendingApprovals}</p>
            <p className="metric-subtext">Statutory Queue</p>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="tabs-nav" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "UNITS"}
            onClick={() => setActiveTab("UNITS")}
            className={`tab-btn ${activeTab === "UNITS" ? "active" : ""}`}
          >
            🏢 Tax Units &amp; Registration
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "ASSESSMENTS"}
            onClick={() => setActiveTab("ASSESSMENTS")}
            className={`tab-btn ${activeTab === "ASSESSMENTS" ? "active" : ""}`}
          >
            ⚖️ Statutory Assessment Queue{" "}
            {metrics.pendingApprovals > 0 && `(${metrics.pendingApprovals})`}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "LEDGER"}
            onClick={() => setActiveTab("LEDGER")}
            className={`tab-btn ${activeTab === "LEDGER" ? "active" : ""}`}
          >
            💳 Demand &amp; Payment Ledger
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "FORM_PFT2"}
            onClick={() => setActiveTab("FORM_PFT2")}
            className={`tab-btn ${activeTab === "FORM_PFT2" ? "active" : ""}`}
          >
            📄 Form PFT-2 Studio &amp; Tamper Lab
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "EPAY"}
            onClick={() => setActiveTab("EPAY")}
            className={`tab-btn ${activeTab === "EPAY" ? "active" : ""}`}
          >
            🔄 ePay Punjab Reconciliation
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "AUDIT"}
            onClick={() => setActiveTab("AUDIT")}
            className={`tab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
          >
            🛡️ Immutable Audit Log
          </button>
        </div>

        {/* TAB 1: TAX UNITS & REGISTRATION */}
        {activeTab === "UNITS" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Circle-Vehari Taxpayer Units</h2>
                <p>
                  Official registry of commercial establishments, companies, and professions
                  governed by Section 3 of the Punjab Finance Act 1977.
                </p>
              </div>
              <div className="panel-actions">
                <button
                  onClick={() => setShowAddUnitModal(true)}
                  className="btn-primary"
                  title="Capture and register a new tax unit in Circle-Vehari"
                >
                  + Add a New Unit
                </button>
              </div>
            </div>

            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Demand No.</th>
                    <th>Legal &amp; Trade Name</th>
                    <th>CNIC / NTN</th>
                    <th>Second Schedule Classification</th>
                    <th>Statutory Rate</th>
                    <th>Assessment Status</th>
                    <th>Ledger Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const latestAsm = u.assessments[0];
                    const balance = computeLedgerBalance(u.ledgerEntries);
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.demandUnit.permanentDemandNo}</strong>
                        </td>
                        <td>
                          <strong>{u.legalName}</strong>
                          {u.tradeName && u.tradeName !== u.legalName && (
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              {u.tradeName}
                            </span>
                          )}
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8" }}>
                            {u.address}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {u.identifierType}: {u.identifierValue}
                          </span>
                        </td>
                        <td>
                          <strong>
                            Entry {u.statutoryRule.subclassification_code} &bull;{" "}
                            {u.statutoryRule.category}
                          </strong>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              color: "#64748b",
                              maxWidth: "20rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis"
                            }}
                          >
                            {u.statutoryRule.subcategory}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#0d3822" }}>
                            PKR {u.statutoryRule.annual_rate_pkr.toLocaleString()}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              latestAsm?.status === "APPROVED"
                                ? "approved"
                                : latestAsm?.status === "SUBMITTED"
                                  ? "submitted"
                                  : latestAsm?.status === "RETURNED"
                                    ? "returned"
                                    : "draft"
                            }`}
                          >
                            {latestAsm?.status ?? "DRAFT"}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: balance > 0 ? "#b91c1c" : "#15803d" }}>
                            PKR {balance.toLocaleString()}
                          </strong>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            <button
                              onClick={() => {
                                setSelectedUnitId(u.id);
                                setActiveTab("FORM_PFT2");
                              }}
                              className="btn-secondary btn-sm"
                              title="Inspect official Form PFT-2 Notice"
                            >
                              Notice
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUnitId(u.id);
                                setPaymentUnitId(u.id);
                                setActiveTab("LEDGER");
                              }}
                              className="btn-secondary btn-sm"
                              title="Inspect Demand &amp; Payment Ledger"
                            >
                              Ledger
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: STATUTORY ASSESSMENT QUEUE */}
        {activeTab === "ASSESSMENTS" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Statutory Assessment &amp; Approval Queue</h2>
                <p>
                  Maker-Checker workflow: Tax Inspectors survey and submit draft assessments;
                  Assessing Authorities (ETO Tariq Mahmood) grant statutory approval under Rule
                  5(1).
                </p>
              </div>
            </div>

            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Taxpayer Unit</th>
                    <th>Financial Year</th>
                    <th>Statutory Rule</th>
                    <th>Tax Amount</th>
                    <th>Workflow Status</th>
                    <th>Statutory Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const currentAsm = u.assessments[0];
                    const currentVer = u.assessmentVersions[0];
                    const status = currentAsm?.status ?? "DRAFT";
                    const displayAmount =
                      currentVer?.snapshot.taxAmount ?? u.statutoryRule.annual_rate_pkr;

                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.legalName}</strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            {u.demandUnit.permanentDemandNo} &bull; {u.address}
                          </span>
                        </td>
                        <td>{FINANCIAL_YEAR_2026_27}</td>
                        <td>
                          <strong>
                            Rule {u.statutoryRule.subclassification_code} (
                            {u.statutoryRule.category})
                          </strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            {u.statutoryRule.subcategory}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: "1rem", color: "#0d3822" }}>
                            PKR {displayAmount.toLocaleString()}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              status === "APPROVED"
                                ? "approved"
                                : status === "SUBMITTED"
                                  ? "submitted"
                                  : status === "RETURNED"
                                    ? "returned"
                                    : "draft"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          {status === "DRAFT" && (
                            <button
                              onClick={() => handleSubmitAssessment(u.id)}
                              className="btn-primary btn-sm"
                              title="Submit draft assessment to ETO for legal review"
                            >
                              Submit to ETO
                            </button>
                          )}

                          {status === "SUBMITTED" && (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {officer.role === "ETO" || officer.role === "DIRECTOR" ? (
                                <>
                                  <button
                                    onClick={() => handleApproveAssessment(u.id)}
                                    className="btn-success btn-sm"
                                    title="Grant legally authorized approval as ETO Tariq Mahmood"
                                  >
                                    ✓ Statutory Approval
                                  </button>
                                  <button
                                    onClick={() => handleOpenReturnModal(u.id)}
                                    className="btn-danger btn-sm"
                                    title="Return assessment with legal remarks"
                                  >
                                    Return
                                  </button>
                                </>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#64748b",
                                    fontStyle: "italic"
                                  }}
                                >
                                  Pending ETO Tariq Mahmood review
                                </span>
                              )}
                            </div>
                          )}

                          {status === "APPROVED" && (
                            <span style={{ fontSize: "0.8rem", color: "#166534", fontWeight: 700 }}>
                              ✓ Approved by ETO &bull; Ledger Debited
                            </span>
                          )}

                          {status === "RETURNED" && (
                            <span style={{ fontSize: "0.8rem", color: "#991b1b", fontWeight: 700 }}>
                              Returned: {currentVer?.reason || "Reclassification requested"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: DEMAND & PAYMENT LEDGER */}
        {activeTab === "LEDGER" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Append-Only Demand &amp; Payment Ledger</h2>
                <p>
                  Statutory accounting ledger. Debits post positive amounts (+PKR); payments post
                  negative credits (-PKR) as PAYMENT_CREDIT. Live balance is strictly derived;
                  entries are immutable.
                </p>
              </div>
              <div className="panel-actions">
                <button
                  onClick={() => {
                    const fallbackId = selectedUnitId || units[0]?.id || "";
                    setPaymentUnitId(fallbackId);
                    setShowPaymentModal(true);
                  }}
                  className="btn-primary"
                  title="Record a payment receipt (Challan 32-A or ePay)"
                >
                  + Add a Payment Receipt
                </button>
              </div>
            </div>

            {/* Select Unit for Detailed Ledger */}
            <div
              style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}
            >
              <label htmlFor="ledger-unit-select" style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                Select Unit Ledger:
              </label>
              <select
                id="ledger-unit-select"
                className="form-control"
                style={{ maxWidth: "25rem" }}
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.demandUnit.permanentDemandNo} &bull; {u.legalName}
                  </option>
                ))}
              </select>

              {activeUnit && (
                <div
                  style={{
                    marginLeft: "auto",
                    background: "#f8fafc",
                    padding: "0.5rem 1rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px"
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block" }}>
                    Derived Balance:
                  </span>
                  <strong
                    style={{
                      fontSize: "1.2rem",
                      color:
                        computeLedgerBalance(activeUnit.ledgerEntries) > 0 ? "#b91c1c" : "#166534"
                    }}
                  >
                    PKR {computeLedgerBalance(activeUnit.ledgerEntries).toLocaleString()}
                  </strong>
                </div>
              )}
            </div>

            {activeUnit && (
              <div className="table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Posted At</th>
                      <th>Entry Type</th>
                      <th>Reference / Source</th>
                      <th>Posted By</th>
                      <th>Debit (+) / Credit (-)</th>
                      <th>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUnit.ledgerEntries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
                        >
                          No financial ledger entries recorded yet. (Requires ETO Statutory Approval
                          to post initial demand).
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let running = 0;
                        return activeUnit.ledgerEntries.map((entry) => {
                          running += entry.amount;
                          return (
                            <tr key={entry.id}>
                              <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                {new Date(entry.postedAt).toLocaleString()}
                              </td>
                              <td>
                                <span
                                  className={`badge badge-${
                                    entry.entryType === "PAYMENT_CREDIT"
                                      ? "approved"
                                      : entry.entryType === "ASSESSMENT_DEMAND"
                                        ? "pending"
                                        : "draft"
                                  }`}
                                >
                                  {entry.entryType}
                                </span>
                              </td>
                              <td>
                                <strong>
                                  {entry.sourceType}: {entry.sourceId}
                                </strong>
                                {Boolean(entry.metadata.paymentChannel) && (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "0.75rem",
                                      color: "#64748b"
                                    }}
                                  >
                                    Channel: {String(entry.metadata.paymentChannel)}
                                  </span>
                                )}
                              </td>
                              <td style={{ fontSize: "0.85rem" }}>{entry.postedBy}</td>
                              <td>
                                <strong
                                  style={{
                                    color: entry.amount < 0 ? "#166534" : "#b91c1c",
                                    fontSize: "0.95rem"
                                  }}
                                >
                                  {entry.amount < 0 ? "-" : "+"}PKR{" "}
                                  {Math.abs(entry.amount).toLocaleString()}
                                </strong>
                              </td>
                              <td>
                                <strong style={{ color: running > 0 ? "#b91c1c" : "#166534" }}>
                                  PKR {running.toLocaleString()}
                                </strong>
                              </td>
                            </tr>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 4: FORM PFT-2 STUDIO & TAMPER LAB */}
        {activeTab === "FORM_PFT2" && formPFT2Data && activeUnit && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Form PFT-2 Notice Studio &amp; Tamper Lab</h2>
                <p>
                  Official Notice of Assessment &amp; Demand under Rule 5(1), Punjab Professions and
                  Trades Tax Rules. Includes 64-character SHA-256 tamper-proof verification hash.
                </p>
              </div>

              <div className="panel-actions">
                <select
                  aria-label="Select Unit for Notice"
                  className="form-control"
                  style={{ maxWidth: "20rem" }}
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.demandUnit.permanentDemandNo} &bull; {u.legalName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tamper Simulation Lab Box */}
            <div className="tamper-box">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem"
                }}
              >
                <div>
                  <strong>
                    🔬 Document Integrity &amp; SHA-256 Cryptographic Verification Lab
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Test cryptographic non-repudiation. Altering even 1 Rupee will invalidate the
                    SHA-256 signature!
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    onClick={() => {
                      setIsTampered(!isTampered);
                      if (!isTampered) {
                        setTamperedAmount(100);
                        showToast(
                          "error",
                          "Simulated unauthorized tampering: Demand altered to PKR 100!"
                        );
                      } else {
                        showToast("success", "Restored official authentic document content.");
                      }
                    }}
                    className={`btn-secondary btn-sm ${isTampered ? "btn-danger" : ""}`}
                  >
                    {isTampered ? "⚠️ Revert Tampering" : "⚡ Simulate Document Tampering"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>
                  Computed SHA-256 Document Verification Hash:
                </span>
                <div className="doc-hash-badge" style={{ marginTop: "0.25rem" }}>
                  {formPFT2Data.officialHash}
                </div>
                {isTampered && (
                  <div
                    style={{
                      background: "#fee2e2",
                      border: "1px solid #ef4444",
                      color: "#991b1b",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      marginTop: "0.5rem",
                      fontWeight: 700,
                      fontSize: "0.85rem"
                    }}
                  >
                    ❌ CRITICAL WARNING: HASH MISMATCH! Document content has been tampered or
                    altered in transit!
                  </div>
                )}
              </div>
            </div>

            {/* Document Render Canvas */}
            <div className="doc-box" style={{ marginTop: "1.5rem" }}>
              {!formPFT2Data.isApproved && (
                <div className="doc-watermark">
                  ⚠️ NON-OPERATIVE PROVISIONAL DRAFT &bull; PENDING STATUTORY APPROVAL BY ETO
                </div>
              )}

              <div
                style={{
                  border: "1px solid #0d3822",
                  padding: "1.5rem",
                  borderRadius: "6px",
                  background: "#ffffff",
                  fontFamily: "Georgia, serif"
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "2px solid #0d3822",
                    paddingBottom: "1rem",
                    marginBottom: "1.25rem"
                  }}
                >
                  <h3
                    style={{ margin: "0 0 0.25rem", color: "#0d3822", textTransform: "uppercase" }}
                  >
                    Government of the Punjab
                  </h3>
                  <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem", fontWeight: 700 }}>
                    Excise, Taxation and Narcotics Control Department
                  </p>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                    Office of the Assessing Authority / ETO, Tehsil Vehari
                  </p>
                  <h4 style={{ margin: "0.75rem 0 0", color: "#b45309", letterSpacing: "0.05em" }}>
                    FORM PFT-2: NOTICE OF ASSESSMENT AND DEMAND
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", fontStyle: "italic" }}>
                    [See Rule 5(1) of the Punjab Professions and Trades Tax Rules, 1977]
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginBottom: "1rem",
                    fontSize: "0.85rem"
                  }}
                >
                  <div>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Permanent Demand No:</strong>{" "}
                      {activeUnit.demandUnit.permanentDemandNo}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Taxpayer Legal Name:</strong> {activeUnit.legalName}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Trade Name:</strong> {activeUnit.tradeName ?? activeUnit.legalName}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>{activeUnit.identifierType}:</strong> {activeUnit.identifierValue}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Financial Year:</strong> 2026-2027
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Jurisdiction:</strong> Circle-Vehari, Tehsil Vehari
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Issue Date:</strong> 2026-07-01
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Due Date:</strong> 2026-08-31
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "1rem",
                    marginBottom: "1.25rem"
                  }}
                >
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                    <strong>Statutory Classification:</strong> Entry{" "}
                    {activeUnit.statutoryRule.subclassification_code} &bull;{" "}
                    {activeUnit.statutoryRule.category}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#475569" }}>
                    <strong>Statutory Basis:</strong> {activeUnit.statutoryRule.official_text}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: "1px solid #cbd5e1",
                      paddingTop: "0.75rem",
                      marginTop: "0.75rem"
                    }}
                  >
                    <span style={{ fontSize: "1rem", fontWeight: 700 }}>
                      Total Assessed Demand:
                    </span>
                    <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0d3822" }}>
                      PKR {formPFT2Data.displayAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.5 }}>
                  <p style={{ margin: "0 0 0.4rem" }}>
                    <strong>Directions for Payment:</strong> Take notice that the tax assessed above
                    is payable under Account Head{" "}
                    <em>&apos;B-01601 - Professional Tax Punjab&apos;</em> into the National Bank of
                    Pakistan / Government Treasury on Challan Form 32-A or digitally via ePay Punjab
                    on or before the due date.
                  </p>
                </div>

                <div
                  style={{
                    marginTop: "1.5rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    borderTop: "1px dashed #cbd5e1",
                    paddingTop: "1rem"
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Cryptographic Verification Digest (SHA-256):
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#0f172a" }}>
                      {formPFT2Data.officialHash.slice(0, 32)}...
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem" }}>Tariq Mahmood</p>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                      Excise &amp; Taxation Officer / Assessing Authority
                    </p>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                      Tehsil Vehari
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: EPAY PUNJAB RECONCILIATION */}
        {activeTab === "EPAY" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>ePay Punjab Real-Time Reconciliation Hub</h2>
                <p>
                  Automated settlement and exception desk. Simulates 1Link / ePay Punjab webhooks,
                  enforces replay window idempotency, and logs mismatched amounts.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
                gap: "1.5rem",
                marginBottom: "1.5rem"
              }}
            >
              {/* Simulation Card */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem"
                }}
              >
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                  Simulate ePay Webhook Dispatch
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 1rem" }}>
                  Trigger simulated digital payment callbacks from the ePay Punjab gateway into the
                  PTAS engine.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <button
                    onClick={() => {
                      const target =
                        units.find((u) => computeLedgerBalance(u.ledgerEntries) > 0) || units[1];
                      if (!target) return;
                      const balance = computeLedgerBalance(target.ledgerEntries) || 2000;
                      const correlationId = `corr-epay-${Date.now()}`;
                      const paymentEntry = createPaymentReceiptEntry({
                        demandUnitId: target.demandUnit.id,
                        financialYearId: FINANCIAL_YEAR_2026_27,
                        amount: balance,
                        receiptNumber: `EPAY-${Date.now().toString().slice(-6)}`,
                        paymentChannel: "EPAY_PUNJAB",
                        actorId: "system-epay-gateway",
                        correlationId,
                        idempotencyKey: `idem-epay-${Date.now()}`,
                        depositDate: new Date().toISOString().split("T")[0]
                      });

                      const updatedUnit: StoredUnit = {
                        ...target,
                        ledgerEntries: [...target.ledgerEntries, paymentEntry]
                      };

                      const auditItem: PilotAuditItem = {
                        id: `audit-${Date.now()}`,
                        eventType: "EPAY_RECONCILIATION_MATCH",
                        actorName: "ePay Punjab Gateway",
                        actorRole: "SYSTEM",
                        target: target.legalName,
                        timestamp: new Date().toISOString(),
                        correlationId,
                        details: `ePay callback matched! Credited PKR ${balance.toLocaleString()} to demand ledger.`
                      };

                      const updatedUnits = units.map((u) => (u.id === target.id ? updatedUnit : u));
                      syncState(updatedUnits, [auditItem, ...auditLogs]);
                      showToast(
                        "success",
                        `ePay callback processed: PKR ${balance.toLocaleString()} credited to ${target.legalName}`
                      );
                    }}
                    className="btn-primary btn-sm"
                  >
                    ▶ Send Valid Callback (Match &amp; Auto-Credit)
                  </button>

                  <button
                    onClick={() => {
                      const auditItem: PilotAuditItem = {
                        id: `audit-${Date.now()}`,
                        eventType: "EPAY_DUPLICATE_REJECTED",
                        actorName: "ePay Punjab Gateway",
                        actorRole: "SYSTEM",
                        target: "Vehari Cotton Ginners (Pvt.) Ltd.",
                        timestamp: new Date().toISOString(),
                        correlationId: `corr-replay-${Date.now()}`,
                        details: `Replay attack detected: PSID EPAY-PUNJAB-992144 already settled. Rejected duplicate callback.`
                      };
                      syncState(units, [auditItem, ...auditLogs]);
                      showToast(
                        "error",
                        "Duplicate Callback Replay Rejected: Idempotency Key already settled."
                      );
                    }}
                    className="btn-secondary btn-sm"
                  >
                    ⚡ Simulate Duplicate Replay (Replay Guard Test)
                  </button>

                  <button
                    onClick={() => {
                      const auditItem: PilotAuditItem = {
                        id: `audit-${Date.now()}`,
                        eventType: "EPAY_AMOUNT_MISMATCH",
                        actorName: "ePay Punjab Gateway",
                        actorRole: "SYSTEM",
                        target: "Al-Madina Commercial Center",
                        timestamp: new Date().toISOString(),
                        correlationId: `corr-mismatch-${Date.now()}`,
                        details: `Amount mismatch: Expected PKR 4,000, received callback for PKR 3,500. Routed to dead-letter desk.`
                      };
                      syncState(units, [auditItem, ...auditLogs]);
                      showToast(
                        "error",
                        "Amount Mismatch Flagged: Expected PKR 4,000, Received PKR 3,500!"
                      );
                    }}
                    className="btn-danger btn-sm"
                  >
                    ⚠️ Simulate Amount Mismatch Anomaly
                  </button>
                </div>
              </div>

              {/* Settlement Protocol Guidelines */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem"
                }}
              >
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                  Statutory Settlement Protocol
                </h3>
                <ul
                  style={{
                    fontSize: "0.85rem",
                    color: "#475569",
                    paddingLeft: "1.25rem",
                    margin: 0,
                    lineHeight: 1.6
                  }}
                >
                  <li>HMAC-SHA256 signature verified on all inbound webhooks.</li>
                  <li>Five-minute replay window strictly enforced.</li>
                  <li>Exact PSID matching against pending assessment demands.</li>
                  <li>
                    Overpayments or underpayments route to Exception Desk without ledger distortion.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* TAB 6: AUDIT TRAIL */}
        {activeTab === "AUDIT" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Real-Time Immutable Audit Log</h2>
                <p>
                  Complete tamper-evident stream of all financial, workflow, configuration, and
                  security events in Vehari District.
                </p>
              </div>
            </div>

            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event Type</th>
                    <th>Actor &amp; Role</th>
                    <th>Target Unit</th>
                    <th>Correlation ID</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: "0.75rem", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            log.eventType.includes("APPROVED") || log.eventType.includes("MATCH")
                              ? "badge-approved"
                              : log.eventType.includes("REJECTED") ||
                                  log.eventType.includes("MISMATCH")
                                ? "badge-returned"
                                : "badge-draft"
                          }`}
                        >
                          {log.eventType}
                        </span>
                      </td>
                      <td>
                        <strong>{log.actorName}</strong>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                          {log.actorRole}
                        </span>
                      </td>
                      <td>
                        <strong>{log.target}</strong>
                      </td>
                      <td>
                        <span
                          style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#64748b" }}
                        >
                          {log.correlationId}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#334155" }}>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* MODAL 1: ADD A NEW UNIT */}
      {showAddUnitModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-unit-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="add-unit-title">Register New Tax Unit — Circle-Vehari</h3>
              <button
                onClick={() => setShowAddUnitModal(false)}
                className="modal-close-btn"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddUnit}>
              <div className="modal-body">
                {duplicateWarning && (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #f59e0b",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      color: "#92400e",
                      fontSize: "0.85rem"
                    }}
                  >
                    ⚠️ <strong>Duplicate Candidate Warning:</strong> Matches existing unit &apos;
                    {duplicateWarning.existingDisplayName}&apos; with confidence{" "}
                    {duplicateWarning.confidence} ({duplicateWarning.matchReason}).
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="new-legal-name">Legal Taxpayer Name *</label>
                  <input
                    id="new-legal-name"
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Al-Madina Medical & Surgical Store"
                    value={newLegalName}
                    onChange={(e) => setNewLegalName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="new-trade-name">Trade / Business Name (if different)</label>
                  <input
                    id="new-trade-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Al-Madina Pharmacy"
                    value={newTradeName}
                    onChange={(e) => setNewTradeName(e.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label htmlFor="new-id-type">Identifier</label>
                    <select
                      id="new-id-type"
                      className="form-control"
                      value={newIdentifierType}
                      onChange={(e) => setNewIdentifierType(e.target.value as "CNIC" | "NTN")}
                    >
                      <option value="CNIC">CNIC</option>
                      <option value="NTN">NTN</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-id-val">Number *</label>
                    <input
                      id="new-id-val"
                      type="text"
                      required
                      className="form-control"
                      placeholder={
                        newIdentifierType === "CNIC" ? "36601-1234567-1" : "NTN-1234567-8"
                      }
                      value={newIdentifierValue}
                      onChange={(e) => setNewIdentifierValue(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="new-category">Second Schedule Category *</label>
                  <select
                    id="new-category"
                    className="form-control"
                    value={newCategoryCode}
                    onChange={(e) => setNewCategoryCode(e.target.value)}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat.category_code} value={cat.category_code}>
                        Entry {cat.category_code}: {cat.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="new-rule-id">
                    Second Schedule Subclassification &amp; Statutory Rate *
                  </label>
                  <select
                    id="new-rule-id"
                    className="form-control"
                    value={newRuleId}
                    onChange={(e) => setNewRuleId(e.target.value)}
                  >
                    {availableRulesForCategory.map((rule) => (
                      <option key={rule.rule_id} value={rule.rule_id}>
                        Code {rule.subclassification_code} &bull; PKR{" "}
                        {rule.annual_rate_pkr.toLocaleString()} &bull; {rule.subcategory}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedStatutoryRule && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      fontSize: "0.85rem"
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#166534", display: "block" }}>
                      Statutory Assessment Rate: PKR{" "}
                      {selectedStatutoryRule.annual_rate_pkr.toLocaleString()} per annum
                    </span>
                    <span
                      style={{
                        color: "#4b5563",
                        fontSize: "0.775rem",
                        display: "block",
                        marginTop: "0.25rem"
                      }}
                    >
                      Statutory Basis: {selectedStatutoryRule.official_text}
                    </span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="new-address">Physical Business Address in Vehari *</label>
                  <input
                    id="new-address"
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Club Road, Tehsil Vehari"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save &amp; Create Draft Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD A PAYMENT RECEIPT */}
      {showPaymentModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-modal-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="pay-modal-title">Record Statutory Payment Receipt</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="modal-close-btn"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="pay-unit">Tax Unit *</label>
                  <select
                    id="pay-unit"
                    className="form-control"
                    value={paymentUnitId}
                    onChange={(e) => setPaymentUnitId(e.target.value)}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.demandUnit.permanentDemandNo} &bull; {u.legalName} (Bal: PKR{" "}
                        {computeLedgerBalance(u.ledgerEntries).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="pay-amount">Deposit Amount (PKR) *</label>
                  <input
                    id="pay-amount"
                    type="number"
                    min="1"
                    required
                    className="form-control"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  />
                  <p className="form-help">
                    Will be posted as append-only PAYMENT_CREDIT (-PKR{" "}
                    {paymentAmount.toLocaleString()}) to reduce the demand ledger balance.
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="pay-channel">Payment Channel *</label>
                  <select
                    id="pay-channel"
                    className="form-control"
                    value={paymentChannel}
                    onChange={(e) =>
                      setPaymentChannel(e.target.value as "CHALLAN_32A" | "EPAY_PUNJAB")
                    }
                  >
                    <option value="CHALLAN_32A">
                      Challan 32-A (National Bank of Pakistan / Treasury)
                    </option>
                    <option value="EPAY_PUNJAB">ePay Punjab (Mobile Banking / 1Link / ATM)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="pay-receipt-no">Challan / PSID / Transaction No. *</label>
                  <input
                    id="pay-receipt-no"
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. 32A-VEH-2026-0091"
                    value={paymentReceiptNo}
                    onChange={(e) => setPaymentReceiptNo(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="pay-date">Deposit Date *</label>
                  <input
                    id="pay-date"
                    type="date"
                    required
                    className="form-control"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Post Payment Credit to Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ETO RETURN ASSESSMENT */}
      {showReturnModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ret-modal-title"
        >
          <div className="modal-card">
            <div className="modal-header" style={{ background: "#991b1b" }}>
              <h3 id="ret-modal-title">Return Assessment to Inspector</h3>
              <button
                onClick={() => setShowReturnModal(false)}
                className="modal-close-btn"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmReturn}>
              <div className="modal-body">
                <p style={{ fontSize: "0.875rem", color: "#64748b", margin: 0 }}>
                  As Assessing Authority (ETO Tariq Mahmood), specify the statutory or evidentiary
                  reason for returning this assessment for re-investigation.
                </p>

                <div className="form-group">
                  <label htmlFor="ret-reason">Statutory Return Reason *</label>
                  <textarea
                    id="ret-reason"
                    rows={4}
                    required
                    className="form-control"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-danger">
                  Confirm Return to Maker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

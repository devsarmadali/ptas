"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  type AuditActor,
  type DuplicateMatch,
  type Taxpayer,
  approveAssessmentVersion,
  computeDefaulterAging,
  computeLedgerBalance,
  createAppellateAdjustmentEntry,
  createAssessment,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  createPenaltyDemandEntry,
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
  type AppealRecord,
  type MockOfficer,
  type PilotAuditItem,
  type StoredUnit,
  type StoredUnitSnapshot,
  loadPilotState,
  resetPilotState,
  savePilotState
} from "../lib/pilot-store";
import { computeFileSha256, uploadReceiptScan } from "../lib/storage";
import { pushPilotStateToSupabase } from "../lib/supabase-sync";
import {
  type AppellateOrderModel,
  generateAppellateOrderDocument,
  generateCircleDispatchRegister,
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateLandRevenueRecoveryCertificate,
  generateShowCausePenaltyNotice
} from "../lib/statutory-forms";
import {
  type BulkSurveyParseResult,
  convertValidSurveyUnitsToStoredUnits,
  generateSurveyCsvTemplate,
  parseBulkSurveyCsv
} from "../lib/bulk-survey";

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [officer, setOfficer] = useState<MockOfficer>(MOCK_OFFICERS[0]);
  const [units, setUnits] = useState<StoredUnit[]>([]);
  const [auditLogs, setAuditLogs] = useState<PilotAuditItem[]>([]);
  const [activeTab, setActiveTab] = useState<
    | "UNITS"
    | "ASSESSMENTS"
    | "FORM_PFT1"
    | "FORM_PFT2"
    | "REGISTER_PFT3"
    | "DEFAULTERS"
    | "APPEALS"
    | "LEDGER"
    | "EPAY"
    | "AUDIT"
  >("UNITS");

  // Selected Unit for Ledger & Form PFT-2 inspection
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  // Appeals & Revisions (Section 7) State
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [showFileAppealModal, setShowFileAppealModal] = useState(false);
  const [showScheduleHearingModal, setShowScheduleHearingModal] = useState(false);
  const [showAdjudicateAppealModal, setShowAdjudicateAppealModal] = useState(false);
  const [showAppellateOrderModal, setShowAppellateOrderModal] = useState(false);
  const [activeAppellateOrder, setActiveAppellateOrder] = useState<AppellateOrderModel | null>(
    null
  );

  // File Appeal Form State
  const [appealUnitId, setAppealUnitId] = useState("");
  const [appealGroundCategory, setAppealGroundCategory] = useState(
    "Dispute on employee threshold (fewer than 10 workers)"
  );
  const [appealGroundDetails, setAppealGroundDetails] = useState("");
  const [appealUndisputedPaid, setAppealUndisputedPaid] = useState<number>(2000);
  const [appealCondonation, setAppealCondonation] = useState(false);
  const [appealCondonationReason, setAppealCondonationReason] = useState("");

  // Hearing Schedule State
  const [hearingTargetAppealId, setHearingTargetAppealId] = useState("");
  const [hearingDateInput, setHearingDateInput] = useState("2026-08-10");
  const [hearingNotesInput, setHearingNotesInput] = useState(
    "Hearing fixed before Director Multan Division. Notice issued to appellant and ETO Vehari."
  );

  // Adjudication Form State
  const [adjudicateTargetAppealId, setAdjudicateTargetAppealId] = useState("");
  const [decisionType, setDecisionType] = useState<
    "CONFIRM" | "REDUCE" | "ENHANCE" | "ANNUL" | "REMAND" | "PENALTY_REMISSION"
  >("REDUCE");
  const [revisedAmountInput, setRevisedAmountInput] = useState<number>(2000);
  const [judicialFindingsInput, setJudicialFindingsInput] = useState(
    "On examination of the survey record and field verification report, the establishment is confirmed to employ fewer than 10 workers. The assessment is appropriately revised from Entry 3(i)(b) to Entry 3(ii) at PKR 2,000. Authorized adjustment credited to demand ledger."
  );

  // Modal States
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetUnitId, setReturnTargetUnitId] = useState("");
  const [returnReason, setReturnReason] = useState("");

  // Defaulter & Statutory Recovery Modal States
  const [defaulterFilter, setDefaulterFilter] = useState<
    "ALL" | "OVERDUE_30_DAYS" | "PENALTY_ELIGIBLE" | "PENALIZED" | "RECOVERY_CERTIFIED"
  >("ALL");
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyTargetUnitId, setPenaltyTargetUnitId] = useState("");
  const [penaltyPercentage, setPenaltyPercentage] = useState<number>(50); // Default 50%
  const [penaltyReason, setPenaltyReason] = useState(
    "Failure to deposit assessed professional tax within thirty days of Form PFT-1 service"
  );
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeTargetUnitId, setNoticeTargetUnitId] = useState("");
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryTargetUnitId, setRecoveryTargetUnitId] = useState("");
  const [collectorDesignation, setCollectorDesignation] = useState(
    "The Collector / Tehsildar (Recovery), District Vehari"
  );

  // Batch Notice Generation & Circle Dispatch Register State
  const [showBatchPft1Modal, setShowBatchPft1Modal] = useState(false);
  const [showBatchPft2Modal, setShowBatchPft2Modal] = useState(false);
  const [showDispatchRegisterModal, setShowDispatchRegisterModal] = useState(false);
  const [selectedDispatchUnitIds, setSelectedDispatchUnitIds] = useState<string[]>([]);
  const [showRecordBatchServiceModal, setShowRecordBatchServiceModal] = useState(false);
  const [batchServedDate, setBatchServedDate] = useState("2026-07-15");
  const [batchServerName, setBatchServerName] = useState("Muhammad Aslam, Tax Inspector");
  const [batchServiceStatus, setBatchServiceStatus] = useState<
    "SERVED" | "REFUSED" | "UNTRACEABLE"
  >("SERVED");
  const [batchRecipientNote, setBatchRecipientNote] = useState("");

  // Bulk Survey Ingestion State (Phase 4)
  const [showBulkSurveyModal, setShowBulkSurveyModal] = useState(false);
  const [bulkSurveyRawCsv, setBulkSurveyRawCsv] = useState("");
  const [bulkSurveyFileName, setBulkSurveyFileName] = useState("");
  const [bulkSurveyParseResult, setBulkSurveyParseResult] = useState<BulkSurveyParseResult | null>(
    null
  );
  const [bulkSurveyFilter, setBulkSurveyFilter] = useState<"ALL" | "VALID" | "ERROR">("ALL");
  const [bulkInputMode, setBulkInputMode] = useState<"FILE" | "PASTE">("FILE");
  const [isImportingSurvey, setIsImportingSurvey] = useState(false);

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
  const [paymentReceiptNo, setPaymentReceiptNo] = useState("PFT2-VEH-2026-");
  const [paymentDate, setPaymentDate] = useState("2026-09-19");

  // Receipt Upload & Evidence Preview State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptSha256, setReceiptSha256] = useState<string>("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [previewScanModalUrl, setPreviewScanModalUrl] = useState<string | null>(null);
  const [previewScanHash, setPreviewScanHash] = useState<string>("");
  const [previewScanTitle, setPreviewScanTitle] = useState<string>("");
  const [previewScanFileName, setPreviewScanFileName] = useState<string>("");

  // Supabase Cloud Sync State
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

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
    setAppeals(state.appeals ?? []);
    if (state.units.length > 0) {
      const firstId = state.units[0]?.id ?? "";
      setSelectedUnitId(firstId);
      setPaymentUnitId(firstId);
      setAppealUnitId(firstId);
    }
    setIsLoaded(true);
  }, []);

  // Synchronize state changes to localStorage
  const syncState = (
    updatedUnits: StoredUnit[],
    updatedAudits: PilotAuditItem[],
    updatedOfficer?: MockOfficer,
    updatedAppeals?: AppealRecord[]
  ) => {
    setUnits(updatedUnits);
    setAuditLogs(updatedAudits);
    if (updatedOfficer) setOfficer(updatedOfficer);
    const nextAppeals = updatedAppeals ?? appeals;
    if (updatedAppeals) setAppeals(updatedAppeals);
    savePilotState({
      currentOfficer: updatedOfficer ?? officer,
      units: updatedUnits,
      auditLogs: updatedAudits,
      reconciliations: [],
      appeals: nextAppeals
    });
  };

  // Reset demo
  const handleResetDemo = () => {
    if (confirm("Reset pilot dataset to clean factory seed state?")) {
      const clean = resetPilotState();
      setOfficer(clean.currentOfficer);
      setUnits(clean.units);
      setAuditLogs(clean.auditLogs);
      setAppeals(clean.appeals ?? []);
      if (clean.units.length > 0) {
        const firstId = clean.units[0]?.id ?? "";
        setSelectedUnitId(firstId);
        setPaymentUnitId(firstId);
        setAppealUnitId(firstId);
      }
      showToast("info", "Vehari pilot dataset reset to statutory factory baseline.");
    }
  };

  // Sync to Supabase Cloud
  const handleSyncCloud = async () => {
    try {
      setIsSyncingCloud(true);
      const result = await pushPilotStateToSupabase(units, auditLogs);
      setIsSyncingCloud(false);
      if (result.success) {
        const time = new Date().toLocaleTimeString();
        setLastSyncTime(time);
        showToast("success", `☁️ ${result.message}`);
      } else {
        showToast("error", result.message);
      }
    } catch (err: unknown) {
      setIsSyncingCloud(false);
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Cloud synchronization failed: ${msg}`);
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

    let defaultersOverdue = 0;
    let defaultersPenaltyEligible = 0;
    let defaultersPenalized = 0;
    let defaultersRecoveryCertified = 0;
    let totalPenaltiesImposed = 0;

    for (const u of units) {
      const aging = computeDefaulterAging(
        u.ledgerEntries,
        "2026-08-31",
        undefined,
        u.isRecoveryCertified
      );
      if (aging.status === "OVERDUE_30_DAYS") defaultersOverdue++;
      if (aging.status === "PENALTY_ELIGIBLE") defaultersPenaltyEligible++;
      if (aging.status === "PENALIZED") defaultersPenalized++;
      if (aging.status === "RECOVERY_CERTIFIED") defaultersRecoveryCertified++;
      totalPenaltiesImposed += aging.penaltyDemand;
    }

    const outstandingBalance = totalDemand - totalPayments;
    return {
      totalUnits,
      totalDemand,
      totalPayments,
      outstandingBalance,
      pendingApprovals,
      defaultersOverdue,
      defaultersPenaltyEligible,
      defaultersPenalized,
      defaultersRecoveryCertified,
      totalPenaltiesImposed
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

  // Handler: Handle Receipt File Selection & Real-Time SHA-256 Digest
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      setReceiptSha256("");
      return;
    }
    setReceiptFile(file);
    try {
      const hash = await computeFileSha256(file);
      setReceiptSha256(hash);
    } catch (err) {
      console.error("Failed to compute SHA-256 for receipt scan:", err);
    }
  };

  // Handler: Add Payment Receipt (Challan 32-A / ePay)
  const handleRecordPayment = async (e: React.FormEvent) => {
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
      setIsUploadingReceipt(true);
      let scanMetadata: Record<string, unknown> = {};

      if (receiptFile) {
        try {
          const uploadRes = await uploadReceiptScan(
            receiptFile,
            targetUnit.id,
            paymentReceiptNo.trim()
          );
          scanMetadata = {
            receiptScanUrl: uploadRes.url,
            receiptScanSha256: uploadRes.sha256,
            receiptScanFileName: uploadRes.fileName,
            receiptScanFileSize: uploadRes.fileSize
          };
        } catch (uploadErr) {
          console.warn("Receipt upload notice:", uploadErr);
        }
      }

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
        depositDate: paymentDate,
        metadata: scanMetadata
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
        details: `Recorded ${paymentChannel} deposit of PKR ${paymentAmount.toLocaleString()} (Ref: ${paymentReceiptNo.trim()}). Demand ledger credited.${
          scanMetadata.receiptScanSha256
            ? ` [Challan 32-A Evidence Attached: SHA-256 ${String(scanMetadata.receiptScanSha256).slice(0, 16)}...]`
            : ""
        }`
      };

      const updatedUnits = units.map((u) => (u.id === paymentUnitId ? updatedUnit : u));
      syncState(updatedUnits, [auditItem, ...auditLogs]);
      setReceiptFile(null);
      setReceiptSha256("");
      setIsUploadingReceipt(false);
      setShowPaymentModal(false);
      showToast(
        "success",
        `Payment receipt credited! New derived balance for ${targetUnit.legalName}: PKR ${computeLedgerBalance(
          updatedUnit.ledgerEntries
        ).toLocaleString()}`
      );
    } catch (err: unknown) {
      setIsUploadingReceipt(false);
      showToast("error", (err as Error).message);
    }
  };

  // Currently Selected Unit object
  const activeUnit = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId) ?? units[0];
  }, [units, selectedUnitId]);

  // Statutory Form P.F.T-1 (Notice of Tax Demand under Rule 6)
  const formPFT1Data = useMemo(() => {
    if (!activeUnit) return null;
    return generateFormPFT1(activeUnit, isTampered, tamperedAmount);
  }, [activeUnit, isTampered, tamperedAmount]);

  // Statutory Form P.F.T-2 (3-Copy Payment Challan under Rule 9)
  const formPFT2Data = useMemo(() => {
    if (!activeUnit) return null;
    return generateFormPFT2(activeUnit, isTampered, tamperedAmount);
  }, [activeUnit, isTampered, tamperedAmount]);

  // Statutory Form P.F.T-3 (Assessment & Demand Register under Rule 11)
  const formPFT3Rows = useMemo(() => {
    return generateFormPFT3Rows(units);
  }, [units]);

  // Defaulter Units Filter
  const defaulterUnits = useMemo(() => {
    return units.filter((u) => {
      const aging = computeDefaulterAging(
        u.ledgerEntries,
        "2026-08-31",
        undefined,
        u.isRecoveryCertified
      );
      if (defaulterFilter === "ALL") return aging.remainingBalance > 0;
      return aging.status === defaulterFilter;
    });
  }, [units, defaulterFilter]);

  const noticeTargetUnit = useMemo(() => {
    return units.find((u) => u.id === noticeTargetUnitId) ?? null;
  }, [units, noticeTargetUnitId]);

  const showCauseNoticeData = useMemo(() => {
    if (!noticeTargetUnit) return null;
    return generateShowCausePenaltyNotice(noticeTargetUnit);
  }, [noticeTargetUnit]);

  const recoveryTargetUnit = useMemo(() => {
    return units.find((u) => u.id === recoveryTargetUnitId) ?? null;
  }, [units, recoveryTargetUnitId]);

  const recoveryCertData = useMemo(() => {
    if (!recoveryTargetUnit) return null;
    return generateLandRevenueRecoveryCertificate(recoveryTargetUnit, collectorDesignation);
  }, [recoveryTargetUnit, collectorDesignation]);

  // Approved units eligible for Form PFT-1 Notice and Form PFT-2 Challan
  const approvedUnits = useMemo(() => {
    return units.filter((u) => u.assessments[0]?.status === "APPROVED");
  }, [units]);

  // Statutory Circle Notice Dispatch & Service Register (Rule 6)
  const circleDispatchRegisterData = useMemo(() => {
    return generateCircleDispatchRegister(units, "2026-07-02");
  }, [units]);

  // Handler: Record Batch Service
  const handleRecordBatchService = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDispatchUnitIds.length === 0) {
      showToast("error", "Please select at least one unit to record service.");
      return;
    }

    const updatedUnits = units.map((u) => {
      if (selectedDispatchUnitIds.includes(u.id)) {
        return {
          ...u,
          serviceStatus: batchServiceStatus,
          servedAt: batchServedDate,
          servedBy: batchServerName,
          recipientName:
            batchRecipientNote.trim() || (batchServiceStatus === "SERVED" ? u.legalName : undefined)
        };
      }
      return u;
    });

    const newAudit: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "BATCH_NOTICES_SERVED",
      actorName: officer.name,
      actorRole: officer.role,
      target: `Batch of ${selectedDispatchUnitIds.length} notices`,
      timestamp: new Date().toISOString(),
      correlationId: `corr-batch-svc-${Date.now()}`,
      details: `Process service recorded as '${batchServiceStatus}' on ${batchServedDate} by ${batchServerName} for ${selectedDispatchUnitIds.length} units in Circle-Vehari.`
    };

    syncState(updatedUnits, [newAudit, ...auditLogs]);
    setShowRecordBatchServiceModal(false);
    setSelectedDispatchUnitIds([]);
    showToast(
      "success",
      `Process service recorded for ${selectedDispatchUnitIds.length} units (${batchServiceStatus}).`
    );
  };

  // Handler: File New Appeal under Section 7 & Rule 13
  const handleFileAppeal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUnit = units.find((u) => u.id === appealUnitId);
    if (!targetUnit) {
      showToast("error", "Please select an assessed tax unit.");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0] ?? "2026-07-20";
    const newAppealNo = `ETD/MLN/APP/2026/${String(appeals.length + 1).padStart(3, "0")}`;
    const newAppealId = `appeal-${Date.now()}`;

    const groundFull = appealGroundDetails.trim()
      ? `${appealGroundCategory}: ${appealGroundDetails.trim()}`
      : appealGroundCategory;

    const newAppeal: AppealRecord = {
      id: newAppealId,
      appealNumber: newAppealNo,
      unitId: targetUnit.id,
      appellantName: targetUnit.legalName,
      appellantTradeName: targetUnit.tradeName,
      appellantCnic: targetUnit.identifierValue,
      businessName: targetUnit.tradeName ?? targetUnit.legalName,
      businessAddress: targetUnit.address,
      filingDate: todayStr,
      limitationDays: 14,
      isWithinLimitation: !appealCondonation,
      condonationRequested: appealCondonation,
      condonationReason: appealCondonationReason.trim() || undefined,
      groundOfAppeal: groundFull,
      undisputedPaid: appealUndisputedPaid,
      status: "FILED"
    };

    const newAudit: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "APPEAL_FILED",
      actorName: officer.name,
      actorRole: officer.role,
      target: `${targetUnit.legalName} (${newAppealNo})`,
      timestamp: new Date().toISOString(),
      correlationId: `corr-app-${Date.now()}`,
      details: `Statutory appeal filed under Section 7 of Punjab Finance Act 1977 against notice PFT-1/VEH/2026/${targetUnit.id.slice(-4)}. Ground: ${groundFull}. Undisputed tax deposited: PKR ${appealUndisputedPaid}.`
    };

    const updatedAppeals = [newAppeal, ...appeals];
    syncState(units, [newAudit, ...auditLogs], undefined, updatedAppeals);
    setShowFileAppealModal(false);
    setAppealGroundDetails("");
    setAppealCondonation(false);
    setAppealCondonationReason("");
    showToast("success", `Appeal ${newAppealNo} successfully filed and lodged in court register.`);
  };

  // Handler: Schedule Appellate Court Hearing (Director Shahid Nawaz)
  const handleScheduleHearing = (e: React.FormEvent) => {
    e.preventDefault();
    if (officer.role !== "DIRECTOR") {
      showToast(
        "error",
        "Only the Appellate Authority (Director Shahid Nawaz) can fix court hearings."
      );
      return;
    }

    const targetAppeal = appeals.find((a) => a.id === hearingTargetAppealId);
    if (!targetAppeal) return;

    const updatedAppeals = appeals.map((a) => {
      if (a.id === hearingTargetAppealId) {
        return {
          ...a,
          status: "HEARING_SCHEDULED" as const,
          hearingDate: hearingDateInput,
          hearingNotes: hearingNotesInput.trim() || undefined
        };
      }
      return a;
    });

    const newAudit: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "APPEAL_HEARING_SCHEDULED",
      actorName: officer.name,
      actorRole: officer.role,
      target: `${targetAppeal.appellantName} (${targetAppeal.appealNumber})`,
      timestamp: new Date().toISOString(),
      correlationId: `corr-app-hrg-${Date.now()}`,
      details: `Appellate hearing scheduled for ${hearingDateInput} before Director Excise & Taxation, Multan Division. Summons issued to appellant and ETO Vehari.`
    };

    syncState(units, [newAudit, ...auditLogs], undefined, updatedAppeals);
    setShowScheduleHearingModal(false);
    showToast(
      "success",
      `Hearing for ${targetAppeal.appealNumber} scheduled on ${hearingDateInput}.`
    );
  };

  // Handler: Adjudicate Appeal & Issue Order (Director Shahid Nawaz)
  const handleAdjudicateAppeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (officer.role !== "DIRECTOR") {
      showToast(
        "error",
        "Only the Appellate Authority (Director Shahid Nawaz) can adjudicate appeals."
      );
      return;
    }

    const targetAppeal = appeals.find((a) => a.id === adjudicateTargetAppealId);
    if (!targetAppeal) return;
    const targetUnit = units.find((u) => u.id === targetAppeal.unitId);
    if (!targetUnit) return;

    const originalTax = targetUnit.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
    let relief = 0;
    let revisedDemand = originalTax;

    let penaltyInLedger = 0;
    for (const entry of targetUnit.ledgerEntries) {
      if (entry.entryType === "PENALTY_DEMAND") penaltyInLedger += entry.amount;
    }

    if (decisionType === "REDUCE") {
      revisedDemand = revisedAmountInput;
      relief = Math.max(0, originalTax - revisedAmountInput);
    } else if (decisionType === "ANNUL") {
      revisedDemand = 0;
      relief = originalTax;
    } else if (decisionType === "PENALTY_REMISSION") {
      relief = penaltyInLedger;
      revisedDemand = originalTax;
    } else if (decisionType === "ENHANCE") {
      revisedDemand = revisedAmountInput;
      relief = -(revisedAmountInput - originalTax);
    }

    const orderNo = `ETD/MLN/APP-ORD/2026/${targetAppeal.id.slice(-4)}`;
    const todayStr = new Date().toISOString().split("T")[0] ?? "2026-07-20";

    // Generate judicial document
    const orderDoc = generateAppellateOrderDocument({
      appealNumber: targetAppeal.appealNumber,
      orderNumber: orderNo,
      filingDate: targetAppeal.filingDate,
      hearingDate: targetAppeal.hearingDate ?? todayStr,
      orderDate: todayStr,
      unit: targetUnit,
      groundOfAppeal: targetAppeal.groundOfAppeal,
      undisputedTaxDeposited: targetAppeal.undisputedPaid,
      decisionType,
      reliefAmount: relief,
      revisedTaxAmount: revisedDemand,
      findingsAndReasoning: judicialFindingsInput.trim()
    });

    // Update Unit Ledger if decision alters financial balance
    let updatedUnits = units;
    if (
      decisionType === "REDUCE" ||
      decisionType === "ANNUL" ||
      decisionType === "PENALTY_REMISSION" ||
      decisionType === "ENHANCE"
    ) {
      const adjustmentAmount =
        decisionType === "PENALTY_REMISSION"
          ? -penaltyInLedger
          : decisionType === "ENHANCE"
            ? revisedAmountInput - originalTax
            : -relief;

      if (adjustmentAmount !== 0) {
        const adjustmentEntry = createAppellateAdjustmentEntry({
          demandUnitId: targetUnit.demandUnit.id,
          financialYearId: FINANCIAL_YEAR_2026_27,
          appealOrderNumber: orderNo,
          appealId: targetAppeal.id,
          decisionType,
          adjustmentAmount,
          reason: judicialFindingsInput.trim(),
          actorId: officer.id,
          correlationId: `corr-app-adj-${Date.now()}`,
          idempotencyKey: `idem-app-adj-${targetAppeal.id}-${Date.now()}`
        });

        // If assessment amount changed, also update latest version snapshot
        let updatedVersions = targetUnit.assessmentVersions;
        if (decisionType === "REDUCE" || decisionType === "ANNUL" || decisionType === "ENHANCE") {
          const currentVer = targetUnit.assessmentVersions[0];
          if (currentVer) {
            const revisedSnapshot: StoredUnitSnapshot = {
              ...currentVer.snapshot,
              taxAmount: revisedDemand,
              legalBasis: `${currentVer.snapshot.legalBasis} (Judicially revised under Section 7 order ${orderNo})`
            };
            updatedVersions = [
              { ...currentVer, snapshot: revisedSnapshot },
              ...targetUnit.assessmentVersions.slice(1)
            ];
          }
        }

        updatedUnits = units.map((u) => {
          if (u.id === targetUnit.id) {
            return {
              ...u,
              assessmentVersions: updatedVersions,
              ledgerEntries: [...u.ledgerEntries, adjustmentEntry]
            };
          }
          return u;
        });
      }
    }

    const nextStatus =
      decisionType === "CONFIRM"
        ? "DECIDED_CONFIRMED"
        : decisionType === "REDUCE"
          ? "DECIDED_REDUCED"
          : decisionType === "ANNUL"
            ? "DECIDED_ANNULLED"
            : decisionType === "REMAND"
              ? "DECIDED_REMANDED"
              : decisionType === "PENALTY_REMISSION"
                ? "DECIDED_PENALTY_REMITTED"
                : "DECIDED_CONFIRMED";

    const updatedAppeals = appeals.map((a) => {
      if (a.id === targetAppeal.id) {
        return {
          ...a,
          status: nextStatus as AppealRecord["status"],
          decisionType,
          orderNumber: orderNo,
          orderDate: todayStr,
          orderSummary: judicialFindingsInput.trim(),
          reliefAmount: relief,
          revisedDemandAmount: revisedDemand,
          sha256Hash: orderDoc.officialSha256
        };
      }
      return a;
    });

    const newAudit: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "APPEAL_ADJUDICATED",
      actorName: officer.name,
      actorRole: officer.role,
      target: `${targetAppeal.appellantName} (${targetAppeal.appealNumber})`,
      timestamp: new Date().toISOString(),
      correlationId: `corr-app-adj-${Date.now()}`,
      details: `Appellate order ${orderNo} pronounced by Director Shahid Nawaz: Decision=${decisionType}, Relief=PKR ${relief}, Revised Demand=PKR ${revisedDemand}. SHA-256=${orderDoc.officialSha256.slice(0, 16)}...`
    };

    syncState(updatedUnits, [newAudit, ...auditLogs], undefined, updatedAppeals);
    setShowAdjudicateAppealModal(false);
    setActiveAppellateOrder(orderDoc);
    setShowAppellateOrderModal(true);
    showToast("success", `Appellate Order ${orderNo} signed and issued (${decisionType}).`);
  };

  // Handler: View Appellate Order Document
  const handleViewAppellateOrder = (appeal: AppealRecord) => {
    const unit = units.find((u) => u.id === appeal.unitId);
    if (!unit) return;

    const orderDoc = generateAppellateOrderDocument({
      appealNumber: appeal.appealNumber,
      orderNumber: appeal.orderNumber ?? `ETD/MLN/APP-ORD/2026/${appeal.id.slice(-4)}`,
      filingDate: appeal.filingDate,
      hearingDate: appeal.hearingDate ?? appeal.filingDate,
      orderDate: appeal.orderDate ?? new Date().toISOString().split("T")[0] ?? "2026-07-20",
      unit,
      groundOfAppeal: appeal.groundOfAppeal,
      undisputedTaxDeposited: appeal.undisputedPaid,
      decisionType: (appeal.decisionType as AppellateOrderModel["decisionType"]) ?? "REDUCE",
      reliefAmount: appeal.reliefAmount ?? 0,
      revisedTaxAmount:
        appeal.revisedDemandAmount ?? unit.assessmentVersions[0]?.snapshot.taxAmount ?? 0,
      findingsAndReasoning: appeal.orderSummary ?? "Judicial Order on file."
    });

    setActiveAppellateOrder(orderDoc);
    setShowAppellateOrderModal(true);
  };

  // Handler: Open Show Cause Notice Modal
  const handleOpenNoticeModal = (unitId: string) => {
    setNoticeTargetUnitId(unitId);
    setShowNoticeModal(true);
  };

  // Handler: Open Impose Penalty Modal
  const handleOpenPenaltyModal = (unitId: string) => {
    const target = units.find((u) => u.id === unitId);
    if (!target) return;
    setPenaltyTargetUnitId(unitId);
    setPenaltyPercentage(50);
    setPenaltyReason(
      "Failure to pay assessed professional tax within 30 days of Form P.F.T-1 notice service"
    );
    setShowPenaltyModal(true);
  };

  // Handler: Open Land Revenue Recovery Modal
  const handleOpenRecoveryModal = (unitId: string) => {
    setRecoveryTargetUnitId(unitId);
    setCollectorDesignation("The Collector / Tehsildar (Recovery), District Vehari");
    setShowRecoveryModal(true);
  };

  // Handler: Submit Statutory Penalty
  const handleImposePenalty = (e: React.FormEvent) => {
    e.preventDefault();
    if (officer.role !== "ETO") {
      showToast(
        "error",
        "Statutory violation: Only Assessing Authority (ETO) can impose penalties under Section 3(4)."
      );
      return;
    }
    const targetUnit = units.find((u) => u.id === penaltyTargetUnitId);
    if (!targetUnit) return;

    const aging = computeDefaulterAging(targetUnit.ledgerEntries);
    const calculatedPenalty = Math.round((aging.originalDemand * penaltyPercentage) / 100);

    if (calculatedPenalty <= 0) {
      showToast("error", "Penalty amount must be greater than zero.");
      return;
    }
    if (calculatedPenalty > aging.originalDemand) {
      showToast(
        "error",
        `Statutory cap violation: Penalty (PKR ${calculatedPenalty}) cannot exceed assessed tax (PKR ${aging.originalDemand}) under Section 3(4).`
      );
      return;
    }

    const orderNumber = `ETO/VHR/PFT/PEN/2026/${targetUnit.id.slice(-4)}`;
    try {
      const penaltyEntry = createPenaltyDemandEntry({
        demandUnitId: targetUnit.demandUnit.id,
        financialYearId: FINANCIAL_YEAR_2026_27,
        originalDemandAmount: aging.originalDemand,
        penaltyAmount: calculatedPenalty,
        reason: penaltyReason,
        orderNumber,
        actorId: officer.id,
        correlationId: `corr-pen-${Date.now()}`,
        idempotencyKey: `idem-pen-${targetUnit.id}-${Date.now()}`
      });

      const updatedUnits = units.map((u) => {
        if (u.id === targetUnit.id) {
          return {
            ...u,
            ledgerEntries: [...u.ledgerEntries, penaltyEntry]
          };
        }
        return u;
      });

      const newAudit: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "PENALTY_IMPOSED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId: penaltyEntry.correlationId,
        details: `Statutory Penalty of PKR ${calculatedPenalty.toLocaleString()} (${penaltyPercentage}%) imposed under Sec 3(4) of Punjab Finance Act 1977 & Rule 10 (Order: ${orderNumber}). Reason: ${penaltyReason}`
      };

      syncState(updatedUnits, [newAudit, ...auditLogs]);
      setShowPenaltyModal(false);
      showToast(
        "success",
        `Statutory penalty of PKR ${calculatedPenalty.toLocaleString()} posted to demand ledger (Order: ${orderNumber}).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Penalty imposition failed: ${msg}`);
    }
  };

  // Handler: Confirm Land Revenue Certification
  const handleConfirmRecoveryCertification = () => {
    if (officer.role !== "ETO") {
      showToast(
        "error",
        "Statutory violation: Only Assessing Authority (ETO) can certify recovery under Rule 12."
      );
      return;
    }
    const targetUnit = units.find((u) => u.id === recoveryTargetUnitId);
    if (!targetUnit) return;

    const certNo = `CERT-LRA-VEH/2026/${targetUnit.id.slice(-4)}`;
    const updatedUnits = units.map((u) => {
      if (u.id === targetUnit.id) {
        return {
          ...u,
          isRecoveryCertified: true,
          recoveryCertifiedAt: new Date().toISOString()
        };
      }
      return u;
    });

    const newAudit: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "LAND_REVENUE_RECOVERY_CERTIFIED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-lra-${Date.now()}`,
      details: `Arrears certified for recovery as Arrears of Land Revenue under Rule 12 & Punjab Land Revenue Act 1967 (Certificate: ${certNo}). Forwarded to ${collectorDesignation}.`
    };

    syncState(updatedUnits, [newAudit, ...auditLogs]);
    setShowRecoveryModal(false);
    showToast(
      "success",
      `Recovery Certificate ${certNo} issued under Rule 12 & forwarded to ${collectorDesignation}.`
    );
  };

  // Handler: Download Survey CSV Template
  const handleDownloadSurveyTemplate = () => {
    const csv = generateSurveyCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Punjab_PTAS_Vehari_Field_Survey_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("info", "Official Punjab Field Survey CSV template downloaded.");
  };

  // Handler: Upload and Parse Survey CSV
  const handleSurveyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkSurveyFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result ?? "");
      setBulkSurveyRawCsv(content);
      const result = parseBulkSurveyCsv(content, units);
      setBulkSurveyParseResult(result);
      if (result.validRowsCount > 0 && result.errorRowsCount === 0) {
        showToast(
          "success",
          `Validated ${result.totalRows} survey rows: All ${result.validRowsCount} rows are valid and ready for Form PFT-3 ingestion!`
        );
      } else if (result.validRowsCount > 0) {
        showToast(
          "info",
          `Validated ${result.totalRows} survey rows: ${result.validRowsCount} valid, ${result.errorRowsCount} error(s).`
        );
      } else {
        showToast(
          "error",
          `CSV validation failed: 0 valid rows found, ${result.errorRowsCount} error(s).`
        );
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  // Handler: Direct Paste Survey Text
  const handleSurveyTextChange = (text: string) => {
    setBulkSurveyRawCsv(text);
    if (!text.trim()) {
      setBulkSurveyParseResult(null);
      return;
    }
    const result = parseBulkSurveyCsv(text, units);
    setBulkSurveyParseResult(result);
  };

  // Handler: Execute Bulk Survey Import into Form P.F.T-3 Register
  const handleExecuteBulkSurveyImport = () => {
    if (!bulkSurveyParseResult || bulkSurveyParseResult.validUnits.length === 0) {
      showToast("error", "No valid survey records available for ingestion.");
      return;
    }

    setIsImportingSurvey(true);
    try {
      const { newUnits, auditItems } = convertValidSurveyUnitsToStoredUnits(
        bulkSurveyParseResult.validUnits,
        officer,
        units.length
      );

      const updatedUnits = [...newUnits, ...units];
      const updatedAudits = [...auditItems, ...auditLogs];
      syncState(updatedUnits, updatedAudits);

      showToast(
        "success",
        `Successfully imported ${newUnits.length} field survey units into Circle-Vehari Form P.F.T-3 Assessment Register!`
      );
      setShowBulkSurveyModal(false);
      setBulkSurveyParseResult(null);
      setBulkSurveyRawCsv("");
      setBulkSurveyFileName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Bulk survey import failed: ${msg}`);
    } finally {
      setIsImportingSurvey(false);
    }
  };

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
              onClick={handleSyncCloud}
              disabled={isSyncingCloud}
              className="btn-reset"
              style={{
                background: "#047857",
                borderColor: "#10b981",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem"
              }}
              title="Synchronize pilot units, assessments, and ledgers to live Supabase PostgreSQL"
            >
              <span>{isSyncingCloud ? "⏳" : "☁️"}</span>
              <span>{isSyncingCloud ? "Syncing..." : "Sync Supabase"}</span>
            </button>
            {lastSyncTime && (
              <span
                style={{
                  fontSize: "0.7rem",
                  background: "rgba(16, 185, 129, 0.25)",
                  color: "#d1fae5",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px"
                }}
              >
                ✓ Synced {lastSyncTime}
              </span>
            )}
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
            ⚖️ Assessment Queue {metrics.pendingApprovals > 0 && `(${metrics.pendingApprovals})`}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "FORM_PFT1"}
            onClick={() => setActiveTab("FORM_PFT1")}
            className={`tab-btn ${activeTab === "FORM_PFT1" ? "active" : ""}`}
          >
            📜 Form PFT-1 (Notice of Demand)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "FORM_PFT2"}
            onClick={() => setActiveTab("FORM_PFT2")}
            className={`tab-btn ${activeTab === "FORM_PFT2" ? "active" : ""}`}
          >
            💳 Form PFT-2 (3-Copy Challan)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "REGISTER_PFT3"}
            onClick={() => setActiveTab("REGISTER_PFT3")}
            className={`tab-btn ${activeTab === "REGISTER_PFT3" ? "active" : ""}`}
          >
            📋 Form PFT-3 (Assessment Register)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "DEFAULTERS"}
            onClick={() => setActiveTab("DEFAULTERS")}
            className={`tab-btn ${activeTab === "DEFAULTERS" ? "active" : ""}`}
          >
            ⚠️ Defaulters &amp; Recovery (Sec 3(4))
            {metrics.defaultersPenaltyEligible + metrics.defaultersOverdue > 0 &&
              ` (${metrics.defaultersPenaltyEligible + metrics.defaultersOverdue})`}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "APPEALS"}
            onClick={() => setActiveTab("APPEALS")}
            className={`tab-btn ${activeTab === "APPEALS" ? "active" : ""}`}
          >
            ⚖️ Appeals &amp; Revisions (Sec 7)
            {appeals.filter((a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED")
              .length > 0 &&
              ` (${appeals.filter((a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED").length})`}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "LEDGER"}
            onClick={() => setActiveTab("LEDGER")}
            className={`tab-btn ${activeTab === "LEDGER" ? "active" : ""}`}
          >
            📒 Demand &amp; Payment Ledger
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
              <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowBulkSurveyModal(true)}
                  className="btn-secondary"
                  style={{
                    backgroundColor: "#065f46",
                    color: "#ffffff",
                    borderColor: "#047857"
                  }}
                  title="Batch upload field survey records via CSV into Form P.F.T-3 Register"
                >
                  📥 Bulk Import Survey (CSV)
                </button>
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
                                {Boolean(entry.metadata.receiptScanUrl) && (
                                  <div style={{ marginTop: "0.4rem" }}>
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      style={{
                                        fontSize: "0.725rem",
                                        padding: "0.25rem 0.5rem",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.3rem",
                                        borderColor: "#10b981",
                                        color: "#065f46",
                                        background: "#ecfdf5",
                                        fontWeight: 600
                                      }}
                                      title={`SHA-256: ${String(entry.metadata.receiptScanSha256 || "")}`}
                                      onClick={() => {
                                        setPreviewScanModalUrl(
                                          String(entry.metadata.receiptScanUrl)
                                        );
                                        setPreviewScanHash(
                                          String(entry.metadata.receiptScanSha256 || "")
                                        );
                                        setPreviewScanTitle(entry.sourceId);
                                        setPreviewScanFileName(
                                          String(
                                            entry.metadata.receiptScanFileName ||
                                              "Challan_32A_Scan.png"
                                          )
                                        );
                                      }}
                                    >
                                      📎 View Form PFT-2 / Challan Scan
                                    </button>
                                  </div>
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

        {/* TAB 3: FORM P.F.T-1 (NOTICE OF TAX DEMAND UNDER RULE 6) */}
        {activeTab === "FORM_PFT1" && formPFT1Data && activeUnit && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Form P.F.T-1: Notice of Tax Demand (نوٹس ڈیمانڈ)</h2>
                <p>
                  Statutory Notice of Demand issued under Section 03 of the Punjab Finance Act 1977
                  read with Rule 6 of the Punjab Professions &amp; Trades Tax Rules, 1977.
                </p>
              </div>

              <div
                className="panel-actions"
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDispatchRegisterModal(true)}
                  title="View Circle Dispatch & Service Register"
                >
                  📋 Dispatch Register
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowBatchPft1Modal(true)}
                  title="Batch print all approved Form PFT-1 notices"
                >
                  📚 Batch Print Notices ({approvedUnits.length})
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.print()}
                  title="Print active Form PFT-1 notice"
                >
                  🖨️ Print Single Notice
                </button>
                <select
                  aria-label="Select Unit for Notice"
                  className="form-control"
                  style={{ maxWidth: "16rem" }}
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
                    🔬 Form P.F.T-1 Document Integrity &amp; SHA-256 Cryptographic Verification Lab
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Cryptographic non-repudiation standard. Any alteration in demand or assessee
                    details invalidates this SHA-256 digest.
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
                  {formPFT1Data.officialSha256}
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

            {/* Official Gazetted Notice Canvas */}
            <div className="doc-box" style={{ marginTop: "1.5rem" }}>
              {!formPFT1Data.isApproved && (
                <div className="doc-watermark">
                  ⚠️ PROVISIONAL NOTICE &bull; NOT A LEGALLY OPERATIVE ORDER &bull; PENDING
                  STATUTORY APPROVAL BY ETO
                </div>
              )}

              <div
                style={{
                  border: "2px solid #0d3822",
                  padding: "2rem",
                  borderRadius: "6px",
                  background: "#ffffff",
                  fontFamily: "Georgia, serif"
                }}
              >
                {/* Government Header */}
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "2px solid #0d3822",
                    paddingBottom: "1.25rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Schedule</p>
                  <h3
                    style={{
                      margin: "0.25rem 0",
                      color: "#0d3822",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em"
                    }}
                  >
                    Excise &amp; Taxation Officer
                  </h3>
                  <h4 style={{ margin: "0.2rem 0", color: "#1e293b", fontWeight: 700 }}>
                    (PUNJAB PROFESSIONS &amp; TRADES TAX) &bull; DISTRICT VEHARI
                  </h4>
                  <div
                    style={{
                      display: "inline-block",
                      background: "#fef3c7",
                      border: "1px solid #f59e0b",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "4px",
                      marginTop: "0.5rem",
                      fontWeight: 800,
                      color: "#92400e"
                    }}
                  >
                    Form P.F.T-1
                  </div>
                  <h3
                    style={{
                      margin: "0.75rem 0 0.25rem",
                      color: "#b45309",
                      letterSpacing: "0.05em"
                    }}
                  >
                    NOTICE OF TAX DEMAND
                  </h3>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>
                    (PUNJAB PROFESSIONS &amp; TRADE TAX)
                  </p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", fontStyle: "italic" }}>
                    (Section 03 of Punjab Finance Act 1977 read with rule 6 of the Punjab
                    Professions &amp; Trades Tax Rules, 1977)
                  </p>
                </div>

                {/* Metadata Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginBottom: "1.25rem",
                    fontSize: "0.9rem"
                  }}
                >
                  <div>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Demand No:</strong> {formPFT1Data.demandNumber}
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Tax No:</strong> {formPFT1Data.taxNumber}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Date:</strong> {formPFT1Data.issueDate}
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Circle:</strong> {formPFT1Data.circleName}
                    </p>
                  </div>
                </div>

                {/* Addressee */}
                <div style={{ marginBottom: "1.25rem", fontSize: "0.95rem" }}>
                  <p style={{ margin: 0 }}>To,</p>
                  <p style={{ margin: "0.25rem 0 0.1rem", fontWeight: 700 }}>
                    Name of assessee: {formPFT1Data.assesseeLegalName}
                    {formPFT1Data.assesseeTradeName && ` (${formPFT1Data.assesseeTradeName})`}
                  </p>
                  <p style={{ margin: 0 }}>Address: {formPFT1Data.address}</p>
                </div>

                {/* Gazetted Notice Body */}
                <div style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "1.75rem" }}>
                  <p style={{ margin: "0 0 0.75rem" }}>Dear Sir (s),</p>
                  <p style={{ margin: "0 0 0.75rem", textIndent: "1.5rem" }}>
                    According to Section 03 of Punjab Finance Act, 1977 you are liable to pay Tax on
                    Professions, Trades, Employment or Callings amounting to{" "}
                    <strong>Rs. {formPFT1Data.taxAmount.toLocaleString()}</strong> (in words){" "}
                    <strong>{formPFT1Data.taxAmountWords}</strong> as{" "}
                    <strong>
                      {formPFT1Data.scheduleEntry} ({formPFT1Data.statutoryCategoryText})
                    </strong>{" "}
                    for the year <strong>{formPFT1Data.financialYear}</strong>. You are directed to
                    make the payment in the National Bank of Pakistan or State Bank of Pakistan
                    within one month of the service of this Notice through Payment Challan Form
                    P.F.T-2 attached herewith and furnish a copy of paid Challan to the undersigned.
                  </p>
                  <p
                    style={{
                      margin: "0 0 0.75rem",
                      textIndent: "1.5rem",
                      color: "#991b1b",
                      fontWeight: 600
                    }}
                  >
                    In case of default, a penalty, not exceeding the amount of tax, shall be imposed
                    and unpaid dues shall be recovered as arrears of Land Revenue.
                  </p>
                </div>

                {/* Signature Block */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginBottom: "2rem"
                  }}
                >
                  <div
                    style={{
                      border: "2px dashed #0d3822",
                      padding: "0.75rem 1.25rem",
                      borderRadius: "6px",
                      textAlign: "center"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>
                      Official Seal
                    </span>
                    <strong style={{ fontSize: "0.85rem", color: "#0d3822" }}>
                      ASSESSING AUTHORITY
                      <br />
                      TEHSIL VEHARI
                    </strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>
                      {formPFT1Data.assessingAuthorityName}
                    </p>
                    <p style={{ margin: "0.15rem 0", fontWeight: 600, fontSize: "0.85rem" }}>
                      EXCISE &amp; TAXATION OFFICER
                    </p>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                      PROFESSIONAL TAX &bull; TEHSIL VEHARI
                    </p>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                      Club Road, Vehari &bull; Tel: 067-9201122
                    </p>
                  </div>
                </div>

                {/* Lower Section: Gazetted Service Counterfoil Receipt */}
                <div className="counterfoil-box">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "1rem"
                    }}
                  >
                    <h4 style={{ margin: 0, color: "#0d3822", letterSpacing: "0.05em" }}>
                      RECEIPT (Counterfoil for service of notice / رسید وصولی نوٹس)
                    </h4>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Rule 6 Counterfoil
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
                      gap: "0.75rem",
                      fontSize: "0.85rem",
                      background: "#f8fafc",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      <strong>Demand No.:</strong> {formPFT1Data.serviceReceipt.demandNumber}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Tax Payable:</strong> Rs.{" "}
                      {formPFT1Data.serviceReceipt.taxPayable.toLocaleString()}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Due Date:</strong> {formPFT1Data.serviceReceipt.dueDate}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Name of Assessee:</strong> {formPFT1Data.serviceReceipt.assesseeName}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Class of Assessee:</strong>{" "}
                      {formPFT1Data.serviceReceipt.assesseeClass}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Tax No.:</strong> {formPFT1Data.serviceReceipt.taxNumber}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "2rem",
                      marginTop: "1.25rem",
                      fontSize: "0.85rem"
                    }}
                  >
                    <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "0.5rem" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        Received by (Assessee Signature):
                      </p>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        Signature / Thumb Impression &amp; Date
                      </p>
                    </div>
                    <div
                      style={{
                        borderTop: "1px solid #cbd5e1",
                        paddingTop: "0.5rem",
                        textAlign: "right"
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        Delivered by: {formPFT1Data.serviceReceipt.serverName}
                      </p>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        {formPFT1Data.serviceReceipt.serverRole}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: FORM P.F.T-2 (3-COPY PAYMENT CHALLAN UNDER RULE 9) */}
        {activeTab === "FORM_PFT2" && formPFT2Data && activeUnit && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Form P.F.T-2: Punjab Professions &amp; Trades Tax Payment Challan</h2>
                <p>
                  Official 3-Copy Payment Instrument under Section 3 read with Rule 9 (Punjab Weekly
                  Gazette Jan 21, 2009). Comprises Taxpayer Copy, Bank Copy, and Department Copy.
                </p>
              </div>

              <div
                className="panel-actions"
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowBatchPft2Modal(true)}
                  title="Batch print all approved Form PFT-2 challans"
                >
                  📚 Batch Print Challans ({approvedUnits.length})
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.print()}
                  title="Print active Form PFT-2 challan"
                >
                  🖨️ Print Single Challan
                </button>
                <select
                  aria-label="Select Unit for Challan"
                  className="form-control"
                  style={{ maxWidth: "16rem" }}
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
                    🔬 Form P.F.T-2 Challan Cryptographic Verification &amp; Non-Repudiation Lab
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    SHA-256 seal binds all 3 copies. Modifying amounts or classifications triggers
                    instant hash invalidation.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    onClick={() => {
                      setIsTampered(!isTampered);
                      if (!isTampered) {
                        setTamperedAmount(100);
                        showToast("error", "Simulated unauthorized tampering: Demand changed!");
                      } else {
                        showToast("success", "Restored official authentic document content.");
                      }
                    }}
                    className={`btn-secondary btn-sm ${isTampered ? "btn-danger" : ""}`}
                  >
                    {isTampered ? "⚠️ Revert Tampering" : "⚡ Simulate Challan Tampering"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>
                  Computed SHA-256 Challan Verification Hash:
                </span>
                <div className="doc-hash-badge" style={{ marginTop: "0.25rem" }}>
                  {formPFT2Data.officialSha256}
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
                    ❌ CRITICAL WARNING: HASH MISMATCH! Challan details have been tampered in
                    transit!
                  </div>
                )}
              </div>
            </div>

            {/* 3-COPY SIDE-BY-SIDE CHALLAN RENDER CANVAS */}
            <div style={{ marginTop: "1.5rem" }}>
              {!formPFT2Data.isApproved && (
                <div className="doc-watermark" style={{ marginBottom: "1rem" }}>
                  ⚠️ PROVISIONAL PAYMENT INSTRUMENT &bull; REQUIRES ETO STATUTORY APPROVAL BEFORE
                  BANK DEPOSIT
                </div>
              )}

              <div className="challan-grid">
                {formPFT2Data.copies.map((copy, cIdx) => (
                  <div key={cIdx} className="challan-card">
                    {/* Top Section */}
                    <div
                      style={{
                        textAlign: "center",
                        borderBottom: "2px solid #0d3822",
                        paddingBottom: "0.5rem"
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          color: "#166534",
                          background: "#dcfce7",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          display: "inline-block",
                          marginBottom: "0.35rem"
                        }}
                      >
                        {copy.copyTitle}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "#64748b",
                          fontFamily: "sans-serif"
                        }}
                      >
                        {copy.copyTitleUrdu}
                      </span>
                      <h4
                        style={{ margin: "0.3rem 0 0.1rem", fontSize: "0.85rem", color: "#0d3822" }}
                      >
                        GOVERNMENT OF THE PUNJAB
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700 }}>
                        EXCISE &amp; TAXATION DEPARTMENT
                      </p>
                      <p style={{ margin: "0.15rem 0", fontSize: "0.7rem", fontWeight: 600 }}>
                        PUNJAB PROFESSIONS &amp; TRADES TAX
                      </p>
                      <p style={{ margin: 0, fontSize: "0.65rem", color: "#64748b" }}>
                        PAYMENT CHALLAN &bull; Rule 9
                      </p>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: "#b45309",
                          marginTop: "0.25rem"
                        }}
                      >
                        Head: {copy.headOfAccount}
                      </div>
                    </div>

                    {/* Metadata Header */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.4rem",
                        fontSize: "0.75rem",
                        background: "#f8fafc",
                        padding: "0.4rem",
                        borderRadius: "4px",
                        border: "1px solid #e2e8f0"
                      }}
                    >
                      <div>
                        <strong>District:</strong> {copy.district}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong>Tax Year:</strong> {copy.taxYear}
                      </div>
                      <div style={{ gridColumn: "span 2", color: "#b91c1c" }}>
                        <strong>Due Date:</strong> {copy.dueDate}
                      </div>
                    </div>

                    {/* Taxpayer Information */}
                    <div style={{ fontSize: "0.75rem", lineHeight: 1.4 }}>
                      <strong
                        style={{ color: "#0d3822", display: "block", marginBottom: "0.2rem" }}
                      >
                        Taxpayer&apos;s Information:
                      </strong>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>Tax No:</strong> {copy.taxpayerInfo.taxNo}
                      </p>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>Class:</strong> {copy.taxpayerInfo.classification}
                      </p>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>Name:</strong> {copy.taxpayerInfo.legalName}
                      </p>
                      {copy.taxpayerInfo.tradeName && (
                        <p style={{ margin: "0.1rem 0" }}>
                          <strong>Trade:</strong> {copy.taxpayerInfo.tradeName}
                        </p>
                      )}
                      <p style={{ margin: "0.1rem 0" }}>
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
                            <td style={{ padding: "0.3rem 0.4rem", color: "#166534" }}>Total</td>
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

                    {/* Tax Assessment Information */}
                    <div
                      style={{
                        fontSize: "0.725rem",
                        borderTop: "1px dashed #cbd5e1",
                        paddingTop: "0.4rem"
                      }}
                    >
                      <strong style={{ color: "#0d3822", display: "block" }}>
                        Tax Assessment Information:
                      </strong>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>Demand No:</strong> {copy.assessmentInfo.demandNo}
                      </p>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>Circle:</strong> {copy.assessmentInfo.circleName}
                      </p>
                      <p style={{ margin: "0.1rem 0" }}>
                        <strong>ETO:</strong> {copy.assessmentInfo.etoName} (
                        {copy.assessmentInfo.etoTitle})
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
                        Amount (in figures): Rs. {copy.taxPayable.totalPayable.toLocaleString()}
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
          </section>
        )}

        {/* TAB 5: FORM P.F.T-3 (ASSESSMENT & DEMAND REGISTER UNDER RULE 11) */}
        {activeTab === "REGISTER_PFT3" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Form P.F.T-3: Assessment &amp; Demand Register (رجسٹر تشخیص)</h2>
                <p>
                  Official statutory register of assessed persons maintained under Rule 11 of the
                  Punjab Professions and Trades Tax Rules, 1977 for Circle-Vehari.
                </p>
              </div>

              <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    backgroundColor: "#065f46",
                    color: "#ffffff",
                    borderColor: "#047857"
                  }}
                  onClick={() => setShowBulkSurveyModal(true)}
                  title="Batch upload field survey records via CSV into Form P.F.T-3 Register"
                >
                  📥 Bulk Import Survey (CSV)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.print()}
                  title="Print official Rule 11 register"
                >
                  🖨️ Print Register
                </button>
              </div>
            </div>

            {/* Summary KPI banner */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 700 }}>
                  TOTAL UNITS ASSESSED
                </span>
                <strong
                  style={{
                    fontSize: "1.4rem",
                    display: "block",
                    color: "#14532d",
                    marginTop: "0.2rem"
                  }}
                >
                  {formPFT3Rows.length} Units
                </strong>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#1e40af", fontWeight: 700 }}>
                  TOTAL ASSESSED DEMAND
                </span>
                <strong
                  style={{
                    fontSize: "1.4rem",
                    display: "block",
                    color: "#1e3a8a",
                    marginTop: "0.2rem"
                  }}
                >
                  PKR {metrics.totalDemand.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#065f46", fontWeight: 700 }}>
                  TOTAL REALIZED / RECOVERED
                </span>
                <strong
                  style={{
                    fontSize: "1.4rem",
                    display: "block",
                    color: "#064e3b",
                    marginTop: "0.2rem"
                  }}
                >
                  PKR {metrics.totalPayments.toLocaleString()}
                </strong>
              </div>

              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 700 }}>
                  OUTSTANDING BALANCE
                </span>
                <strong
                  style={{
                    fontSize: "1.4rem",
                    display: "block",
                    color: "#78350f",
                    marginTop: "0.2rem"
                  }}
                >
                  PKR {metrics.outstandingBalance.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Statutory Register Table */}
            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Permanent Demand No.</th>
                    <th>Assessment No.</th>
                    <th>Taxpayer Legal Name</th>
                    <th>CNIC / NTN</th>
                    <th>Statutory Entry</th>
                    <th>Assessed Tax (PKR)</th>
                    <th>Paid (PKR)</th>
                    <th>Balance (PKR)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {formPFT3Rows.map((row) => (
                    <tr key={row.permanentDemandNo}>
                      <td>{row.serialNumber}</td>
                      <td>
                        <strong>{row.permanentDemandNo}</strong>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#64748b" }}>
                        {row.assessmentNo}
                      </td>
                      <td>
                        <strong>{row.legalName}</strong>
                        {row.tradeName && (
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            Trade: {row.tradeName}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{row.identifier}</td>
                      <td>
                        <span className="badge badge-draft" style={{ fontSize: "0.7rem" }}>
                          {row.scheduleEntry}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.725rem",
                            color: "#64748b",
                            marginTop: "0.15rem"
                          }}
                        >
                          {row.categoryName}
                        </span>
                      </td>
                      <td>
                        <strong>PKR {row.assessedCurrentTax.toLocaleString()}</strong>
                      </td>
                      <td>
                        <strong style={{ color: "#166534" }}>
                          PKR {row.totalPaid.toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <strong
                          style={{
                            color: row.outstandingBalance > 0 ? "#b91c1c" : "#166534"
                          }}
                        >
                          PKR {row.outstandingBalance.toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            row.assessmentStatus === "APPROVED"
                              ? "badge-approved"
                              : row.assessmentStatus === "SUBMITTED"
                                ? "badge-pending"
                                : "badge-draft"
                          }`}
                        >
                          {row.assessmentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB: DEFAULTERS & STATUTORY RECOVERY UNDER SEC 3(4) / RULES 10 & 12 */}
        {activeTab === "DEFAULTERS" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>
                  ⚠️ Defaulter Tracking, Statutory Penalties &amp; Recovery (بقایا جات و ریکوری زیر
                  دفعہ 3(4))
                </h2>
                <p>
                  Statutory arrears enforcement under Section 3(4) of Punjab Finance Act, 1977 and
                  Rules 10 &amp; 12 of Punjab Professions &amp; Trades Tax Rules, 1977. Tracks
                  30-day notice expiry, adjudicates penalties (up to 100%), and certifies recovery
                  under the Punjab Land Revenue Act, 1967.
                </p>
              </div>

              <div className="panel-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.print()}
                  title="Print Defaulters Roster"
                >
                  🖨️ Print Defaulter Roster
                </button>
              </div>
            </div>

            {/* Statutory Legal Authority Banner */}
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "0.85rem 1.25rem",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                color: "#991b1b",
                display: "flex",
                alignItems: "center",
                gap: "1rem"
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>⚖️</span>
              <div>
                <strong>Section 3(4) Punjab Finance Act 1977 Statutory Mandate:</strong> Any person
                who fails to pay tax by August 31st or within 30 days of Form P.F.T-1 service is
                liable to a penalty <em>not exceeding the amount of assessed tax</em> as determined
                by the Assessing Authority (ETO Tariq Mahmood), recoverable as Arrears of Land
                Revenue under Rule 12.
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#92400e", textTransform: "uppercase" }}>
                  Overdue (1-30 Days)
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#b45309" }}>
                  {metrics.defaultersOverdue}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#78350f" }}>Notice Grace Period</div>
              </div>

              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#991b1b", textTransform: "uppercase" }}>
                  Penalty Eligible (&gt;30 Days)
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#dc2626" }}>
                  {metrics.defaultersPenaltyEligible}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#7f1d1d" }}>Rule 10 SCN Required</div>
              </div>

              <div
                style={{
                  background: "#fdf4ff",
                  border: "1px solid #f5d0fe",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#86198f", textTransform: "uppercase" }}>
                  Penalties Imposed
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#a21caf" }}>
                  {metrics.defaultersPenalized}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#701a75" }}>
                  Total: PKR {metrics.totalPenaltiesImposed.toLocaleString()}
                </div>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "0.85rem",
                  borderRadius: "6px"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#1e40af", textTransform: "uppercase" }}>
                  Land Revenue Certified
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#2563eb" }}>
                  {metrics.defaultersRecoveryCertified}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#1e3a8a" }}>
                  Warrant / Tehsildar Execution
                </div>
              </div>
            </div>

            {/* Filter Buttons */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem"
              }}
            >
              {(
                [
                  { id: "ALL", label: `All Defaulters (${defaulterUnits.length})` },
                  {
                    id: "OVERDUE_30_DAYS",
                    label: `Overdue (1-30d) (${metrics.defaultersOverdue})`
                  },
                  {
                    id: "PENALTY_ELIGIBLE",
                    label: `Penalty Eligible (>30d) (${metrics.defaultersPenaltyEligible})`
                  },
                  { id: "PENALIZED", label: `Penalized (${metrics.defaultersPenalized})` },
                  {
                    id: "RECOVERY_CERTIFIED",
                    label: `Land Revenue Certified (${metrics.defaultersRecoveryCertified})`
                  }
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDefaulterFilter(f.id)}
                  className={`btn-secondary ${defaulterFilter === f.id ? "active" : ""}`}
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.4rem 0.75rem",
                    background: defaulterFilter === f.id ? "#1e293b" : "#f8fafc",
                    color: defaulterFilter === f.id ? "#ffffff" : "#334155",
                    borderColor: defaulterFilter === f.id ? "#1e293b" : "#cbd5e1"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Defaulters Table */}
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Demand No &amp; Assessee</th>
                    <th>Category &amp; Rule</th>
                    <th>Assessed Tax</th>
                    <th>Penalty</th>
                    <th>Total Outstanding</th>
                    <th>Days Overdue</th>
                    <th>Statutory Status</th>
                    <th style={{ textAlign: "right" }}>Statutory Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defaulterUnits.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
                      >
                        ✓ No defaulting units found for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    defaulterUnits.map((u) => {
                      const aging = computeDefaulterAging(
                        u.ledgerEntries,
                        "2026-08-31",
                        undefined,
                        u.isRecoveryCertified
                      );
                      const latestVersion = u.assessmentVersions[0];
                      const assessedTax = latestVersion?.snapshot.taxAmount ?? 0;

                      return (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.legalName}</strong>
                            {u.tradeName && (
                              <span
                                style={{ display: "block", fontSize: "0.8rem", color: "#64748b" }}
                              >
                                {u.tradeName}
                              </span>
                            )}
                            <span
                              style={{
                                display: "block",
                                fontFamily: "monospace",
                                fontSize: "0.75rem",
                                color: "#0369a1"
                              }}
                            >
                              {u.demandUnit.permanentDemandNo} | {u.identifierType}:{" "}
                              {u.identifierValue}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                              Entry {u.statutoryRule.subclassification_code}
                            </span>
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              {u.statutoryRule.category}
                            </span>
                          </td>
                          <td>
                            <strong>PKR {assessedTax.toLocaleString()}</strong>
                          </td>
                          <td>
                            {aging.penaltyDemand > 0 ? (
                              <strong style={{ color: "#dc2626" }}>
                                PKR {aging.penaltyDemand.toLocaleString()}
                              </strong>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td>
                            <strong
                              style={{
                                color: "#b91c1c",
                                fontSize: "1rem"
                              }}
                            >
                              PKR {aging.remainingBalance.toLocaleString()}
                            </strong>
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  aging.daysOverdue > 30
                                    ? "#dc2626"
                                    : aging.daysOverdue > 0
                                      ? "#d97706"
                                      : "#16a34a"
                              }}
                            >
                              {aging.daysOverdue} days
                            </span>
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}
                            >
                              Due: 31/08/2026
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                aging.status === "RECOVERY_CERTIFIED"
                                  ? "badge-rejected"
                                  : aging.status === "PENALIZED"
                                    ? "badge-pending"
                                    : aging.status === "PENALTY_ELIGIBLE"
                                      ? "badge-draft"
                                      : "badge-approved"
                              }`}
                              style={{
                                background:
                                  aging.status === "RECOVERY_CERTIFIED"
                                    ? "#fee2e2"
                                    : aging.status === "PENALIZED"
                                      ? "#fdf4ff"
                                      : aging.status === "PENALTY_ELIGIBLE"
                                        ? "#fef2f2"
                                        : "#fffbeb",
                                color:
                                  aging.status === "RECOVERY_CERTIFIED"
                                    ? "#991b1b"
                                    : aging.status === "PENALIZED"
                                      ? "#86198f"
                                      : aging.status === "PENALTY_ELIGIBLE"
                                        ? "#dc2626"
                                        : "#b45309",
                                borderColor: "transparent"
                              }}
                            >
                              {aging.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                                justifyContent: "flex-end"
                              }}
                            >
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                onClick={() => handleOpenNoticeModal(u.id)}
                                title="Generate Rule 10 Notice to Show Cause"
                              >
                                📜 Show Cause
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.5rem",
                                  borderColor: "#dc2626",
                                  color: "#dc2626",
                                  opacity: officer.role === "ETO" ? 1 : 0.5
                                }}
                                disabled={officer.role !== "ETO"}
                                onClick={() => handleOpenPenaltyModal(u.id)}
                                title={
                                  officer.role === "ETO"
                                    ? "Impose Statutory Penalty (Section 3(4))"
                                    : "ETO Role Required to Impose Penalty"
                                }
                              >
                                ⚠️ Impose Penalty
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.5rem",
                                  borderColor: "#2563eb",
                                  color: "#2563eb",
                                  opacity: officer.role === "ETO" ? 1 : 0.5
                                }}
                                disabled={officer.role !== "ETO"}
                                onClick={() => handleOpenRecoveryModal(u.id)}
                                title={
                                  officer.role === "ETO"
                                    ? "Certify Arrears under Punjab Land Revenue Act (Rule 12)"
                                    : "ETO Role Required to Certify Recovery"
                                }
                              >
                                🏛️ Land Revenue
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                onClick={() => {
                                  setSelectedUnitId(u.id);
                                  setActiveTab("FORM_PFT2");
                                }}
                                title="View updated 3-copy payment challan with penalty"
                              >
                                💳 Challan PFT-2
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB: APPEALS & REVISIONS (SECTION 7 & RULE 13) */}
        {activeTab === "APPEALS" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>⚖️ Statutory Appeals &amp; Revisions (اپیل و نگرانی زیر سیکشن 7 و رول 13)</h2>
                <p>
                  Appellate proceedings under Section 7 of Punjab Finance Act, 1977 read with Rule
                  13 of Punjab Professions &amp; Trades Tax Rules, 1977. Appellate Authority:{" "}
                  <strong>Shahid Nawaz, Director Excise &amp; Taxation, Multan Division</strong>.
                </p>
              </div>

              <div className="panel-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowFileAppealModal(true)}
                  title="Lodge New Statutory Appeal under Section 7"
                >
                  ⚖️ File New Appeal (Sec 7)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.print()}
                  title="Print Appeals Cause List"
                >
                  🖨️ Print Cause List
                </button>
              </div>
            </div>

            {/* Statutory Authority Callout Banner */}
            <div
              style={{
                background: "#faf5ff",
                border: "1px solid #e9d5ff",
                borderRadius: "8px",
                padding: "0.85rem 1.25rem",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                color: "#581c87",
                display: "flex",
                alignItems: "center",
                gap: "1rem"
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>🏛️</span>
              <div>
                <strong>Section 7 &amp; Rule 13 Appellate Mandate:</strong> Any person aggrieved by
                an order of the Assessing Authority (ETO Tariq Mahmood) may within 30 days prefer an
                appeal to the Appellate Authority (Director Shahid Nawaz). Under Rule 13(2), no
                appeal shall be entertained unless the undisputed amount of tax has been deposited.
                Appellate decisions immediately adjust the demand ledger without altering historical
                audit trails.
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Total Appeals Filed
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "#1e293b"
                  }}
                >
                  {appeals.length}
                </p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                  Cause-List Vehicles &amp; Trades
                </p>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#1e40af" }}>
                  Pending Adjudication
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "#1d4ed8"
                  }}
                >
                  {
                    appeals.filter((a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED")
                      .length
                  }
                </p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#1e40af" }}>
                  Active In Judicial Court
                </p>
              </div>

              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#166534" }}>
                  Decided &amp; Settled
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "#15803d"
                  }}
                >
                  {appeals.filter((a) => a.status.startsWith("DECIDED")).length}
                </p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#166534" }}>
                  Judicial Decrees Issued
                </p>
              </div>

              <div
                style={{
                  background: "#faf5ff",
                  border: "1px solid #e9d5ff",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b21a8" }}>
                  Total Relief Granted
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "#7e22ce"
                  }}
                >
                  PKR {appeals.reduce((sum, a) => sum + (a.reliefAmount ?? 0), 0).toLocaleString()}
                </p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b21a8" }}>
                  Credited via Adjustments
                </p>
              </div>
            </div>

            {/* Appeals Register & Cause-List Table */}
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Appeal No &amp; Filing Date</th>
                    <th>Appellant &amp; Trade Name</th>
                    <th>Impugned Demand &amp; Notice</th>
                    <th>Ground of Appeal</th>
                    <th>Undisputed Paid</th>
                    <th>Hearing Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appeals.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>
                        No appeals currently registered on the court cause-list.
                      </td>
                    </tr>
                  ) : (
                    appeals.map((appeal) => {
                      const matchingUnit = units.find((u) => u.id === appeal.unitId);
                      const originalTax =
                        matchingUnit?.assessmentVersions[0]?.snapshot.taxAmount ?? 0;

                      let statusBadgeBg = "#e2e8f0";
                      let statusBadgeColor = "#334155";
                      let statusText: string = appeal.status;

                      if (appeal.status === "FILED") {
                        statusBadgeBg = "#fef3c7";
                        statusBadgeColor = "#92400e";
                        statusText = "FILED (دائر شدہ)";
                      } else if (appeal.status === "HEARING_SCHEDULED") {
                        statusBadgeBg = "#dbeafe";
                        statusBadgeColor = "#1e40af";
                        statusText = "HEARING FIXED (تاریخ سماعت مقرر)";
                      } else if (appeal.status === "DECIDED_REDUCED") {
                        statusBadgeBg = "#dcfce7";
                        statusBadgeColor = "#166534";
                        statusText = `REDUCED (-PKR ${appeal.reliefAmount})`;
                      } else if (appeal.status === "DECIDED_ANNULLED") {
                        statusBadgeBg = "#fae8ff";
                        statusBadgeColor = "#86198f";
                        statusText = "ANNULLED (کالعدم)";
                      } else if (appeal.status === "DECIDED_CONFIRMED") {
                        statusBadgeBg = "#f1f5f9";
                        statusBadgeColor = "#475569";
                        statusText = "CONFIRMED (برقرار)";
                      } else if (appeal.status === "DECIDED_REMANDED") {
                        statusBadgeBg = "#ffedd5";
                        statusBadgeColor = "#9a3412";
                        statusText = "REMANDED (ریمانڈ شدہ)";
                      } else if (appeal.status === "DECIDED_PENALTY_REMITTED") {
                        statusBadgeBg = "#ccfbf1";
                        statusBadgeColor = "#115e59";
                        statusText = "PENALTY REMITTED (معاف)";
                      }

                      return (
                        <tr key={appeal.id}>
                          <td>
                            <strong>{appeal.appealNumber}</strong>
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              Filed: {appeal.filingDate}
                            </span>
                          </td>
                          <td>
                            <strong>{appeal.appellantName}</strong>
                            {appeal.appellantTradeName && (
                              <span
                                style={{ display: "block", fontSize: "0.8rem", color: "#64748b" }}
                              >
                                {appeal.appellantTradeName}
                              </span>
                            )}
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#94a3b8" }}
                            >
                              {appeal.appellantCnic}
                            </span>
                          </td>
                          <td>
                            <span>PFT-1/VEH/2026/{appeal.unitId.slice(-4)}</span>
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              Demand: PKR {originalTax.toLocaleString()}
                            </span>
                          </td>
                          <td style={{ maxWidth: "240px", fontSize: "0.82rem" }}>
                            {appeal.groundOfAppeal}
                          </td>
                          <td>
                            <span style={{ fontWeight: "bold", color: "#166534" }}>
                              PKR {appeal.undisputedPaid.toLocaleString()}
                            </span>
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}
                            >
                              Rule 13(2) Compliant
                            </span>
                          </td>
                          <td>
                            {appeal.hearingDate ? (
                              <span style={{ fontWeight: "500", color: "#1e40af" }}>
                                {appeal.hearingDate}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                                Not scheduled
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                background: statusBadgeBg,
                                color: statusBadgeColor
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                              {appeal.status === "FILED" && officer.role === "DIRECTOR" && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => {
                                    setHearingTargetAppealId(appeal.id);
                                    setShowScheduleHearingModal(true);
                                  }}
                                >
                                  📅 Fix Hearing
                                </button>
                              )}

                              {(appeal.status === "FILED" ||
                                appeal.status === "HEARING_SCHEDULED") &&
                                officer.role === "DIRECTOR" && (
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => {
                                      setAdjudicateTargetAppealId(appeal.id);
                                      setRevisedAmountInput(
                                        Math.max(1000, Math.floor(originalTax / 2))
                                      );
                                      setShowAdjudicateAppealModal(true);
                                    }}
                                  >
                                    👨‍⚖️ Adjudicate
                                  </button>
                                )}

                              {appeal.status.startsWith("DECIDED") && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => handleViewAppellateOrder(appeal)}
                                >
                                  📄 View Order
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
                      Form PFT-2 Challan (National Bank of Pakistan / Treasury Form 32-A)
                    </option>
                    <option value="EPAY_PUNJAB">ePay Punjab (Mobile Banking / 1Link / ATM)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="pay-receipt-no">Form PFT-2 Serial / Challan / PSID No. *</label>
                  <input
                    id="pay-receipt-no"
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. PFT-2/VEH/2026/0001 or PSID-992144"
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

                <div className="form-group">
                  <label htmlFor="pay-receipt-file">
                    Stamped Form PFT-2 Bank Copy / Challan Scan (Supabase Storage)
                  </label>
                  <input
                    id="pay-receipt-file"
                    type="file"
                    accept="image/*,.pdf"
                    className="form-control"
                    onChange={handleFileChange}
                  />
                  <p className="form-help">
                    Scanned image or PDF of National Bank stamped Form PFT-2 (or Challan 32-A)
                    deposit receipt. Cryptographic SHA-256 digest is computed in-browser before
                    upload.
                  </p>
                </div>

                {receiptSha256 && receiptFile && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #10b981",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      fontSize: "0.8rem",
                      color: "#065f46"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        marginBottom: "0.25rem"
                      }}
                    >
                      <span>🛡️</span>
                      <strong>Cryptographic SHA-256 Digest Computed:</strong>
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        background: "#ffffff",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "4px",
                        border: "1px solid #6ee7b7",
                        wordBreak: "break-all",
                        fontSize: "0.75rem",
                        color: "#0f172a"
                      }}
                    >
                      {receiptSha256}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#047857",
                        marginTop: "0.25rem",
                        display: "block"
                      }}
                    >
                      File: {receiptFile.name} ({(receiptFile.size / 1024).toFixed(1)} KB) &bull;
                      Ready for Supabase Storage
                    </span>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setReceiptFile(null);
                    setReceiptSha256("");
                    setShowPaymentModal(false);
                  }}
                  className="btn-secondary"
                  disabled={isUploadingReceipt}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isUploadingReceipt}>
                  {isUploadingReceipt ? "Uploading & Posting..." : "Post Payment Credit to Ledger"}
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

      {/* MODAL 4: CHALLAN 32-A RECEIPT & CRYPTOGRAPHIC VERIFICATION VIEWER */}
      {previewScanModalUrl && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <div className="modal-card modal-card-lg">
            <div className="modal-header" style={{ background: "#065f46" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>📜</span>
                <h3 id="preview-modal-title">
                  Form PFT-2 Stamped Treasury Receipt Evidence &bull; {previewScanTitle}
                </h3>
              </div>
              <button
                onClick={() => setPreviewScanModalUrl(null)}
                className="modal-close-btn"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  padding: "0.85rem 1rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem"
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#166534" }}>
                    🛡️ Cryptographic Non-Repudiation Verified (SHA-256)
                  </span>
                  <span className="badge badge-approved" style={{ fontSize: "0.7rem" }}>
                    Valid Treasury Evidence
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    background: "#ffffff",
                    border: "1px solid #bbf7d0",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                    fontSize: "0.775rem",
                    color: "#0f172a"
                  }}
                >
                  {previewScanHash || "Verified Treasury Electronic Deposit"}
                </div>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#475569",
                    marginTop: "0.35rem"
                  }}
                >
                  File: {previewScanFileName} &bull; Stored securely in Supabase Storage bucket{" "}
                  <code>receipts-challan32a</code>
                </span>
              </div>

              {/* Document/Image Render Box */}
              <div
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: "18rem",
                  maxHeight: "32rem",
                  overflow: "hidden"
                }}
              >
                {previewScanFileName.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={previewScanModalUrl}
                    title="Challan 32-A PDF Viewer"
                    style={{ width: "100%", height: "28rem", border: "none" }}
                  />
                ) : (
                  <img
                    src={previewScanModalUrl}
                    alt={`Challan 32-A Slip for ${previewScanTitle}`}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "28rem",
                      objectFit: "contain",
                      borderRadius: "4px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }}
                  />
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <a
                href={previewScanModalUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.85rem"
                }}
              >
                Open in Full Window ↗
              </a>
              <button
                type="button"
                onClick={() => setPreviewScanModalUrl(null)}
                className="btn-primary"
                style={{ background: "#065f46", borderColor: "#065f46" }}
              >
                Close Receipt Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: NOTICE TO SHOW CAUSE FOR IMPOSITION OF PENALTY (RULE 10) */}
      {showNoticeModal && showCauseNoticeData && noticeTargetUnit && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "48rem" }}>
            <div className="modal-header">
              <h3>📜 Notice to Show Cause for Imposition of Penalty (زیر رول 10)</h3>
              <button type="button" className="close-btn" onClick={() => setShowNoticeModal(false)}>
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "1.5rem",
                fontFamily: "serif"
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  borderBottom: "2px solid #0f172a",
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem"
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    textTransform: "uppercase",
                    fontSize: "1.1rem",
                    color: "#0f172a"
                  }}
                >
                  Office of the Excise &amp; Taxation Officer / Assessing Authority, Vehari
                </h4>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "#b91c1c",
                    marginTop: "0.25rem"
                  }}
                >
                  NOTICE TO SHOW CAUSE FOR IMPOSITION OF PENALTY
                </div>
                <div style={{ fontSize: "0.8rem", color: "#475569" }}>
                  (Under Section 3(4) of the Punjab Finance Act, 1977 read with Rule 10 of the
                  Punjab Professions &amp; Trades Tax Rules, 1977)
                </div>
              </div>

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
                  <strong>Notice No:</strong> {showCauseNoticeData.noticeNumber}
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Date of Issue:</strong> {showCauseNoticeData.noticeDate}
                </div>
                <div>
                  <strong>Permanent Demand No:</strong> {showCauseNoticeData.demandNumber}
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Assessed Financial Year:</strong> 2026-2027
                </div>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  padding: "1rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem"
                }}
              >
                <div>
                  <strong>To (Assessee):</strong> {showCauseNoticeData.assesseeLegalName}
                </div>
                {showCauseNoticeData.assesseeTradeName && (
                  <div>
                    <strong>Trade Name:</strong> {showCauseNoticeData.assesseeTradeName}
                  </div>
                )}
                <div>
                  <strong>Identifier:</strong> {showCauseNoticeData.identifier}
                </div>
                <div>
                  <strong>Business Address:</strong> {showCauseNoticeData.address}
                </div>
                <div>
                  <strong>Statutory Entry:</strong> {showCauseNoticeData.scheduleEntry}
                </div>
              </div>

              <div
                style={{
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  color: "#1e293b",
                  marginBottom: "1rem"
                }}
              >
                <p>
                  WHEREAS you were assessed to Punjab Professional Tax amounting to{" "}
                  <strong>PKR {showCauseNoticeData.originalTaxAmount.toLocaleString()}</strong> for
                  the financial year 2026-2027, and Form P.F.T-1 (Notice of Demand) was duly served
                  upon you;
                </p>
                <p>
                  AND WHEREAS you have failed to pay the said assessed tax within thirty days of the
                  service of notice or by the statutory due date of 31st August 2026, and a period
                  of{" "}
                  <strong style={{ color: "#b91c1c" }}>
                    {showCauseNoticeData.daysOverdue} days
                  </strong>{" "}
                  has elapsed in default thereof;
                </p>
                <p>
                  NOW, THEREFORE, under the provisions of{" "}
                  <strong>Section 3(4) of the Punjab Finance Act, 1977</strong> read with{" "}
                  <strong>Rule 10 of the Punjab Professions and Trades Tax Rules, 1977</strong>, you
                  are hereby directed to SHOW CAUSE on or before:
                </p>
                <div
                  style={{
                    textAlign: "center",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    fontWeight: 700,
                    color: "#991b1b",
                    margin: "0.75rem 0"
                  }}
                >
                  HEARING DATE: {showCauseNoticeData.hearingDate} AT 10:00 AM
                </div>
                <p>
                  as to why a penalty not exceeding the amount of tax (up to{" "}
                  <strong>
                    PKR {showCauseNoticeData.maximumPenaltyExposable.toLocaleString()}
                  </strong>
                  ) should not be imposed upon you, and why recovery proceedings under the Punjab
                  Land Revenue Act, 1967 should not be initiated against you.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  borderTop: "1px dashed #94a3b8",
                  paddingTop: "1rem"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  <div>
                    <strong>SHA-256 Non-Repudiation Digest:</strong>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#047857" }}>
                    {showCauseNoticeData.officialSha256}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    {showCauseNoticeData.assessingAuthorityName}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#475569" }}>
                    {showCauseNoticeData.assessingAuthorityTitle}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    [Official Seal &amp; Signature]
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-secondary" onClick={() => window.print()}>
                🖨️ Print Notice
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const newAudit: PilotAuditItem = {
                    id: `audit-${Date.now()}`,
                    eventType: "SHOW_CAUSE_NOTICE_SERVED",
                    actorName: officer.name,
                    actorRole: officer.role,
                    target: noticeTargetUnit.legalName,
                    timestamp: new Date().toISOString(),
                    correlationId: `corr-scn-${Date.now()}`,
                    details: `Rule 10 Show Cause Notice issued (Notice No: ${showCauseNoticeData.noticeNumber}). Hearing scheduled for ${showCauseNoticeData.hearingDate}.`
                  };
                  syncState(units, [newAudit, ...auditLogs]);
                  setShowNoticeModal(false);
                  showToast(
                    "success",
                    `Rule 10 Show Cause Notice issued for ${noticeTargetUnit.legalName}.`
                  );
                }}
              >
                ✓ Record Service &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: IMPOSE STATUTORY PENALTY (SECTION 3(4) / RULE 10) */}
      {showPenaltyModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3>⚠️ Adjudicate Statutory Penalty (Section 3(4))</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowPenaltyModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleImposePenalty}>
              <div className="modal-body">
                {(() => {
                  const target = units.find((u) => u.id === penaltyTargetUnitId);
                  if (!target) return null;
                  const aging = computeDefaulterAging(target.ledgerEntries);
                  const calculatedPenalty = Math.round(
                    (aging.originalDemand * penaltyPercentage) / 100
                  );
                  const newTotalBalance = aging.remainingBalance + calculatedPenalty;

                  return (
                    <>
                      <div
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          padding: "0.85rem",
                          borderRadius: "6px",
                          marginBottom: "1rem"
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#991b1b" }}>{target.legalName}</div>
                        <div style={{ fontSize: "0.8rem", color: "#7f1d1d" }}>
                          {target.demandUnit.permanentDemandNo} &bull; Entry{" "}
                          {target.statutoryRule.subclassification_code}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "0.5rem",
                            marginTop: "0.5rem",
                            fontSize: "0.85rem"
                          }}
                        >
                          <div>
                            Original Assessed Tax:{" "}
                            <strong>PKR {aging.originalDemand.toLocaleString()}</strong>
                          </div>
                          <div>
                            Days Overdue:{" "}
                            <strong style={{ color: "#dc2626" }}>{aging.daysOverdue} days</strong>
                          </div>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Statutory Penalty Percentage (Max 100% per Section 3(4)):</label>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                          {[25, 50, 75, 100].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setPenaltyPercentage(pct)}
                              className={`btn-secondary ${penaltyPercentage === pct ? "active" : ""}`}
                              style={{
                                flex: 1,
                                fontSize: "0.85rem",
                                padding: "0.4rem",
                                background: penaltyPercentage === pct ? "#dc2626" : "#f8fafc",
                                color: penaltyPercentage === pct ? "#ffffff" : "#334155",
                                borderColor: penaltyPercentage === pct ? "#dc2626" : "#cbd5e1"
                              }}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={penaltyPercentage}
                          onChange={(e) => setPenaltyPercentage(Number(e.target.value))}
                          style={{ width: "100%", accentColor: "#dc2626" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.75rem",
                            color: "#64748b"
                          }}
                        >
                          <span>Min: 1%</span>
                          <span>Selected: {penaltyPercentage}%</span>
                          <span>
                            Legal Ceiling: 100% (PKR {aging.originalDemand.toLocaleString()})
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#fffbeb",
                          border: "1px solid #fde68a",
                          padding: "0.85rem",
                          borderRadius: "6px",
                          marginBottom: "1rem"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.9rem"
                          }}
                        >
                          <span>Penalty Amount to Post:</span>
                          <strong style={{ color: "#dc2626", fontSize: "1.1rem" }}>
                            PKR {calculatedPenalty.toLocaleString()}
                          </strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.85rem",
                            marginTop: "0.25rem",
                            color: "#78350f"
                          }}
                        >
                          <span>New Total Outstanding Balance:</span>
                          <strong>PKR {newTotalBalance.toLocaleString()}</strong>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Statutory Adjudication Rationale &amp; Legal Grounds:</label>
                        <textarea
                          rows={3}
                          value={penaltyReason}
                          onChange={(e) => setPenaltyReason(e.target.value)}
                          required
                          className="form-control"
                          style={{ width: "100%", padding: "0.5rem" }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowPenaltyModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                >
                  Confirm Penalty Order (Sec 3(4))
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: LAND REVENUE RECOVERY CERTIFICATE (RULE 12) */}
      {showRecoveryModal && recoveryCertData && recoveryTargetUnit && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "48rem" }}>
            <div className="modal-header">
              <h3>🏛️ Certificate of Recovery as Arrears of Land Revenue (Rule 12)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowRecoveryModal(false)}
              >
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "1.5rem",
                fontFamily: "serif"
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  borderBottom: "2px solid #0f172a",
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem"
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    textTransform: "uppercase",
                    fontSize: "1.1rem",
                    color: "#0f172a"
                  }}
                >
                  Office of the Excise &amp; Taxation Officer / Assessing Authority, Vehari
                </h4>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "#1e40af",
                    marginTop: "0.25rem"
                  }}
                >
                  CERTIFICATE OF RECOVERY AS ARREARS OF LAND REVENUE
                </div>
                <div style={{ fontSize: "0.8rem", color: "#475569" }}>
                  (Under Rule 12 of Punjab Professions &amp; Trades Tax Rules, 1977 read with
                  Sections 80 &amp; 81 of the Punjab Land Revenue Act, 1967)
                </div>
              </div>

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
                  <strong>Certificate No:</strong> {recoveryCertData.certificateNumber}
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Date of Certification:</strong> {recoveryCertData.issueDate}
                </div>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  padding: "1rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem"
                }}
              >
                <div>
                  <strong>To:</strong> {recoveryCertData.collectorDesignation}
                </div>
                <div>
                  <strong>District:</strong> {recoveryCertData.collectorDistrict}
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <strong>Defaulter Assessee:</strong> {recoveryCertData.assesseeLegalName}
                </div>
                {recoveryCertData.assesseeTradeName && (
                  <div>
                    <strong>Trade Name:</strong> {recoveryCertData.assesseeTradeName}
                  </div>
                )}
                <div>
                  <strong>CNIC / NTN:</strong> {recoveryCertData.identifier}
                </div>
                <div>
                  <strong>Location:</strong> {recoveryCertData.address}
                </div>
                <div>
                  <strong>Permanent Demand No:</strong> {recoveryCertData.demandNumber}
                </div>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "1rem",
                  borderRadius: "6px",
                  marginBottom: "1rem"
                }}
              >
                <div style={{ fontWeight: 700, color: "#1e3a8a", marginBottom: "0.5rem" }}>
                  CERTIFIED BREAKDOWN OF OUTSTANDING GOVERNMENT ARREARS:
                </div>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #bfdbfe" }}>
                      <td style={{ padding: "0.35rem 0" }}>
                        1. Principal Professional Tax Demand:
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        PKR {recoveryCertData.originalTaxAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #bfdbfe" }}>
                      <td style={{ padding: "0.35rem 0" }}>
                        2. Statutory Default Penalty (Section 3(4)):
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                        PKR {recoveryCertData.penaltyAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "0.5rem 0", fontWeight: 700, color: "#1e40af" }}>
                        TOTAL SUM RECOVERABLE AS ARREARS OF LAND REVENUE:
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          fontSize: "1.05rem",
                          color: "#1e40af"
                        }}
                      >
                        PKR {recoveryCertData.totalArrearsRecoverable.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#1e3a8a" }}>
                  <strong>Amount in Words:</strong> {recoveryCertData.totalArrearsWords}
                </div>
              </div>

              <div
                style={{
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  color: "#1e293b",
                  marginBottom: "1rem"
                }}
              >
                <p>
                  I, <strong>{recoveryCertData.assessingAuthorityName}</strong>, Excise &amp;
                  Taxation Officer / Assessing Authority, Tehsil Vehari, do hereby certify that the
                  sum of{" "}
                  <strong>PKR {recoveryCertData.totalArrearsRecoverable.toLocaleString()}</strong>{" "}
                  specified above is legally due from the defaulter on account of Punjab
                  Professional Tax and statutory penalty.
                </p>
                <p>
                  You are hereby requested and authorized under{" "}
                  <strong>Sections 80 and 81 of the Punjab Land Revenue Act, 1967</strong> to
                  recover the said certified sum as Arrears of Land Revenue by distraint, attachment
                  and sale of movable or immovable property, or warrant of arrest, and deposit the
                  proceeds into Provincial Account Head <strong>B01601</strong>.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  borderTop: "1px dashed #94a3b8",
                  paddingTop: "1rem"
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  <div>
                    <strong>SHA-256 Non-Repudiation Digest:</strong>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#047857" }}>
                    {recoveryCertData.officialSha256}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    {recoveryCertData.assessingAuthorityName}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#475569" }}>
                    {recoveryCertData.assessingAuthorityTitle}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    [Official Seal of Assessing Authority]
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-secondary" onClick={() => window.print()}>
                🖨️ Print Recovery Certificate
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: "#1e40af", borderColor: "#1e40af" }}
                onClick={handleConfirmRecoveryCertification}
              >
                ✓ Issue &amp; Forward Certificate (Rule 12)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: BATCH PRINT FORM P.F.T-1 NOTICES BOOK (RULE 6) */}
      {showBatchPft1Modal && (
        <div className="modal-overlay">
          <div
            className="modal-card"
            style={{ maxWidth: "56rem", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  📚 Batch Print Form P.F.T-1 Demand Notices (Circle-Vehari)
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Official batch notice book containing {approvedUnits.length} approved notices with
                  individual service receipt counterfoils and page breaks for physical printing.
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowBatchPft1Modal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {approvedUnits.map((u, idx) => {
                const noticeData = generateFormPFT1(u);

                return (
                  <div key={u.id} className="batch-sheet">
                    <div className="doc-box">
                      <div
                        style={{
                          textAlign: "center",
                          borderBottom: "2px solid #0d3822",
                          paddingBottom: "1rem",
                          marginBottom: "1.5rem"
                        }}
                      >
                        <h3
                          style={{
                            margin: "0 0 0.25rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em"
                          }}
                        >
                          GOVERNMENT OF THE PUNJAB
                        </h3>
                        <h4 style={{ margin: "0 0 0.25rem", color: "#0d3822" }}>
                          EXCISE &amp; TAXATION DEPARTMENT
                        </h4>
                        <div
                          style={{
                            display: "inline-block",
                            border: "1px solid #0d3822",
                            padding: "0.25rem 0.75rem",
                            fontWeight: 700,
                            marginTop: "0.5rem"
                          }}
                        >
                          FORM P.F.T-1 &bull; NOTICE OF TAX DEMAND (نوٹس ڈیمانڈ)
                        </div>
                        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                          [See Rule 6 of the Punjab Professions and Trades Tax Rules, 1977]
                        </p>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1rem",
                          marginBottom: "1rem",
                          fontSize: "0.9rem"
                        }}
                      >
                        <div>
                          <strong>Demand Notice No:</strong> {noticeData.noticeNumber}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>Date of Issue:</strong> {noticeData.issueDate}
                        </div>
                        <div>
                          <strong>Permanent Demand No:</strong> {noticeData.demandNumber}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>Tax Year:</strong> {noticeData.financialYear}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "1rem",
                          marginBottom: "1rem",
                          fontSize: "0.9rem"
                        }}
                      >
                        <div>
                          <strong>To (Assessee):</strong> {noticeData.assesseeLegalName}
                        </div>
                        {noticeData.assesseeTradeName && (
                          <div>
                            <strong>Trade Name:</strong> {noticeData.assesseeTradeName}
                          </div>
                        )}
                        <div>
                          <strong>CNIC / NTN:</strong> {noticeData.taxNumber}
                        </div>
                        <div>
                          <strong>Premises Address:</strong> {noticeData.address}
                        </div>
                        <div>
                          <strong>Statutory Entry:</strong> {noticeData.scheduleEntry} -{" "}
                          {noticeData.statutoryCategoryText}
                        </div>
                      </div>

                      <div style={{ fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}>
                        <p>
                          Please take notice that for the financial year{" "}
                          <strong>{noticeData.financialYear}</strong>, a sum of{" "}
                          <strong style={{ color: "#0d3822" }}>
                            PKR {noticeData.taxAmount.toLocaleString()} ({noticeData.taxAmountWords}
                            )
                          </strong>{" "}
                          has been determined to be payable by you as Punjab Professional Tax under
                          Section 3 of the Punjab Finance Act, 1977.
                        </p>
                        <p>
                          You are required to pay the above sum within <strong>30 days</strong> of
                          the service of this notice or by <strong>{noticeData.dueDate}</strong>,
                          whichever is later, through the enclosed{" "}
                          <strong>Form P.F.T-2 Challan</strong> into the Treasury / National Bank of
                          Pakistan (Account Head B01601).
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-end",
                          marginBottom: "1.5rem"
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          <div>SHA-256 Digest:</div>
                          <div style={{ fontFamily: "monospace" }}>
                            {noticeData.officialSha256.slice(0, 32)}...
                          </div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontWeight: 700 }}>{noticeData.assessingAuthorityName}</div>
                          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
                            {noticeData.assessingAuthorityTitle}
                          </div>
                        </div>
                      </div>

                      {/* Service Receipt Counterfoil */}
                      <div className="counterfoil-box">
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            marginBottom: "0.5rem"
                          }}
                        >
                          رسید نوٹس تعمیل (SERVICE RECEIPT COUNTERFOIL - TO BE RETURNED BY PROCESS
                          SERVER)
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "0.5rem",
                            fontSize: "0.8rem"
                          }}
                        >
                          <div>
                            Demand No: <strong>{noticeData.serviceReceipt.demandNumber}</strong>
                          </div>
                          <div>
                            Assessed Tax:{" "}
                            <strong>
                              PKR {noticeData.serviceReceipt.taxPayable.toLocaleString()}
                            </strong>
                          </div>
                          <div>
                            Assessee: <strong>{noticeData.serviceReceipt.assesseeName}</strong>
                          </div>
                          <div>
                            Process Server: <strong>{noticeData.serviceReceipt.serverName}</strong>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "1rem",
                            fontSize: "0.8rem",
                            borderTop: "1px dotted #94a3b8",
                            paddingTop: "0.5rem"
                          }}
                        >
                          <div>Date of Delivery: _______________</div>
                          <div>Signature / Thumb Impression of Assessee: ___________________</div>
                        </div>
                      </div>
                    </div>

                    {idx < approvedUnits.length - 1 && (
                      <div
                        className="page-break"
                        style={{
                          pageBreakAfter: "always",
                          breakAfter: "page",
                          height: "1px",
                          margin: "2rem 0",
                          borderBottom: "2px dashed #94a3b8"
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨️ Print Batch Book ({approvedUnits.length} Notices)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowBatchPft1Modal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: BATCH PRINT FORM P.F.T-2 CHALLANS BOOK (RULE 9) */}
      {showBatchPft2Modal && (
        <div className="modal-overlay">
          <div
            className="modal-card"
            style={{ maxWidth: "68rem", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>📚 Batch Print Form P.F.T-2 Challans (Circle-Vehari)</h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Official 3-copy side-by-side challan book containing {approvedUnits.length}{" "}
                  approved challans formatted 1 unit per sheet with cutting lines for bank &amp;
                  department.
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowBatchPft2Modal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {approvedUnits.map((u, idx) => {
                const challanData = generateFormPFT2(u);

                return (
                  <div key={u.id} className="batch-sheet">
                    <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "#475569" }}>
                      Sheet #{idx + 1}: <strong>{u.legalName}</strong> (
                      {u.demandUnit.permanentDemandNo}) &bull; Challan No:{" "}
                      {challanData.challanNumber}
                    </div>

                    <div className="challan-grid">
                      {challanData.copies.map((copy) => (
                        <div key={copy.copyTitle} className="challan-card">
                          <div
                            style={{
                              textAlign: "center",
                              borderBottom: "1px solid #0d3822",
                              paddingBottom: "0.4rem"
                            }}
                          >
                            <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                              GOVT. OF THE PUNJAB
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "#0d3822" }}>
                              EXCISE &amp; TAXATION
                            </div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0d3822" }}>
                              FORM P.F.T-2
                            </div>
                            <div
                              style={{
                                fontSize: "0.7rem",
                                background: "#f0fdf4",
                                padding: "0.15rem",
                                fontWeight: 700
                              }}
                            >
                              {copy.copyTitle}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>
                              {copy.copyTitleUrdu}
                            </div>
                          </div>

                          <div style={{ fontSize: "0.75rem", lineHeight: 1.4 }}>
                            <div>
                              <strong>Head:</strong> {copy.headOfAccount}
                            </div>
                            <div>
                              <strong>District:</strong> {copy.district} &bull; FY: {copy.taxYear}
                            </div>
                            <div>
                              <strong>Due:</strong> {copy.dueDate}
                            </div>
                          </div>

                          <div
                            style={{
                              background: "#f8fafc",
                              padding: "0.4rem",
                              borderRadius: "4px",
                              fontSize: "0.72rem"
                            }}
                          >
                            <div>
                              <strong>Assessee:</strong> {copy.taxpayerInfo.legalName}
                            </div>
                            <div>
                              <strong>CNIC/NTN:</strong> {copy.taxpayerInfo.taxNo}
                            </div>
                            <div>
                              <strong>Address:</strong> {copy.taxpayerInfo.address}
                            </div>
                            <div>
                              <strong>Entry:</strong> {copy.taxpayerInfo.classification}
                            </div>
                          </div>

                          <div
                            style={{
                              borderTop: "1px dashed #cbd5e1",
                              borderBottom: "1px dashed #cbd5e1",
                              padding: "0.4rem 0",
                              fontSize: "0.75rem"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>Current Tax:</span>
                              <strong>PKR {copy.taxPayable.currentTax.toLocaleString()}</strong>
                            </div>
                            {copy.taxPayable.penalty > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  color: "#dc2626"
                                }}
                              >
                                <span>Penalty Demand:</span>
                                <strong>PKR {copy.taxPayable.penalty.toLocaleString()}</strong>
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontWeight: 700,
                                marginTop: "0.25rem",
                                color: "#0d3822"
                              }}
                            >
                              <span>Total Payable:</span>
                              <span>PKR {copy.taxPayable.totalPayable.toLocaleString()}</span>
                            </div>
                          </div>

                          <div style={{ fontSize: "0.68rem", color: "#334155" }}>
                            <div>Demand No: {copy.assessmentInfo.demandNo}</div>
                            <div>Circle: {copy.assessmentInfo.circleName}</div>
                          </div>

                          <div
                            style={{
                              borderTop: "1px solid #cbd5e1",
                              paddingTop: "0.3rem",
                              fontSize: "0.68rem",
                              background: "#f8fafc",
                              padding: "0.35rem"
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                textAlign: "center",
                                marginBottom: "0.2rem"
                              }}
                            >
                              FOR BANK USE ONLY
                            </div>
                            <div>Scroll No: ________ Branch: {copy.bankUse.branchName}</div>
                            <div style={{ marginTop: "0.2rem" }}>
                              Received Date: _________ Signature: ________
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {idx < approvedUnits.length - 1 && (
                      <div
                        className="page-break"
                        style={{
                          pageBreakAfter: "always",
                          breakAfter: "page",
                          height: "1px",
                          margin: "2rem 0",
                          borderBottom: "2px dashed #94a3b8"
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨️ Print Batch Challans ({approvedUnits.length} Sheets)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowBatchPft2Modal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 10: CIRCLE NOTICE DISPATCH & SERVICE REGISTER (RULE 6) */}
      {showDispatchRegisterModal && (
        <div className="modal-overlay">
          <div
            className="modal-card"
            style={{ maxWidth: "64rem", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  📋 Circle Notice Dispatch &amp; Service Register (فہرست ترسیل و تعمیل نوٹس جات)
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Official statutory register maintained under Rule 6 of the Punjab Professions and
                  Trades Tax Rules, 1977 for Circle-Vehari.
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowDispatchRegisterModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Summary KPIs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem"
                }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1"
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Total Dispatched</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                    {circleDispatchRegisterData.totalNotices}
                  </div>
                </div>
                <div
                  style={{
                    background: "#f0fdf4",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #bbf7d0"
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "#166534" }}>
                    Total Served (تعمیل شدہ)
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#166534" }}>
                    {circleDispatchRegisterData.totalServed}
                  </div>
                </div>
                <div
                  style={{
                    background: "#fffbeb",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #fde68a"
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "#92400e" }}>
                    Pending Service (زیر تعمیل)
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#b45309" }}>
                    {circleDispatchRegisterData.totalPending}
                  </div>
                </div>
                <div
                  style={{
                    background: "#eff6ff",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #bfdbfe"
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "#1e40af" }}>Gross Demand</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e40af" }}>
                    PKR {circleDispatchRegisterData.totalAssessedSum.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem"
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
                    onClick={() => {
                      if (selectedDispatchUnitIds.length === units.length) {
                        setSelectedDispatchUnitIds([]);
                      } else {
                        setSelectedDispatchUnitIds(units.map((u) => u.id));
                      }
                    }}
                  >
                    {selectedDispatchUnitIds.length === units.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                  <span style={{ fontSize: "0.8rem", color: "#475569" }}>
                    {selectedDispatchUnitIds.length} notices selected
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                    disabled={selectedDispatchUnitIds.length === 0}
                    onClick={() => setShowRecordBatchServiceModal(true)}
                  >
                    ✍️ Record Batch Service ({selectedDispatchUnitIds.length})
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                    onClick={() => window.print()}
                  >
                    🖨️ Print Dispatch Register
                  </button>
                </div>
              </div>

              {/* Dispatch Register Table */}
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "2.5rem" }}>Select</th>
                      <th>Notice &amp; Demand No</th>
                      <th>Assessee Name &amp; Address</th>
                      <th>Entry</th>
                      <th>Assessed Tax</th>
                      <th>Process Server</th>
                      <th>Service Status</th>
                      <th>Delivered On / Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {circleDispatchRegisterData.rows.map((r) => {
                      const matchingUnit = units.find(
                        (u) => u.demandUnit.permanentDemandNo === r.demandNumber
                      );
                      const isSelected = matchingUnit
                        ? selectedDispatchUnitIds.includes(matchingUnit.id)
                        : false;

                      return (
                        <tr key={r.noticeNumber}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (!matchingUnit) return;
                                if (e.target.checked) {
                                  setSelectedDispatchUnitIds([
                                    ...selectedDispatchUnitIds,
                                    matchingUnit.id
                                  ]);
                                } else {
                                  setSelectedDispatchUnitIds(
                                    selectedDispatchUnitIds.filter((id) => id !== matchingUnit.id)
                                  );
                                }
                              }}
                            />
                          </td>
                          <td>
                            <strong>{r.noticeNumber}</strong>
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}
                            >
                              {r.demandNumber} &bull; Dispatched: {r.dispatchDate}
                            </span>
                          </td>
                          <td>
                            <strong>{r.assesseeLegalName}</strong>
                            {r.assesseeTradeName && (
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                {r.assesseeTradeName}
                              </span>
                            )}
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#475569" }}
                            >
                              {r.identifier} &bull; {r.address}
                            </span>
                          </td>
                          <td>{r.scheduleEntry}</td>
                          <td>
                            <strong>PKR {r.assessedAmount.toLocaleString()}</strong>
                          </td>
                          <td>{r.serverName}</td>
                          <td>
                            <span
                              className={`badge ${
                                r.serviceStatus === "SERVED"
                                  ? "badge-approved"
                                  : r.serviceStatus === "REFUSED"
                                    ? "badge-rejected"
                                    : "badge-draft"
                              }`}
                            >
                              {r.serviceStatus === "SERVED"
                                ? "تعمیل شدہ"
                                : r.serviceStatus === "REFUSED"
                                  ? "انکاری"
                                  : "زیر تعمیل (PENDING)"}
                            </span>
                          </td>
                          <td>
                            {r.servedAt ? (
                              <>
                                <div>{r.servedAt}</div>
                                {r.recipientName && (
                                  <div style={{ fontSize: "0.7rem", color: "#166534" }}>
                                    Rec: {r.recipientName}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  fontSize: "0.75rem",
                  color: "#64748b",
                  display: "flex",
                  justifyContent: "space-between"
                }}
              >
                <span>
                  SHA-256 Non-Repudiation Digest:{" "}
                  <code>{circleDispatchRegisterData.officialSha256.slice(0, 32)}...</code>
                </span>
                <span>Assessing Authority: Tariq Mahmood, ETO Tehsil Vehari</span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDispatchRegisterModal(false)}
              >
                Close Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 11: RECORD BATCH SERVICE DETAILS */}
      {showRecordBatchServiceModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "32rem" }}>
            <div className="modal-header">
              <h3>✍️ Record Batch Notice Service (تعمیل نوٹس جات)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowRecordBatchServiceModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordBatchService}>
              <div className="modal-body">
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    fontSize: "0.85rem"
                  }}
                >
                  Recording field service for <strong>{selectedDispatchUnitIds.length}</strong>{" "}
                  selected notice(s) in Circle-Vehari.
                </div>

                <div className="form-group">
                  <label>Date of Delivery / Service in Field:</label>
                  <input
                    type="date"
                    required
                    value={batchServedDate}
                    onChange={(e) => setBatchServedDate(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-group">
                  <label>Process Server / Tax Inspector Name:</label>
                  <input
                    type="text"
                    required
                    value={batchServerName}
                    onChange={(e) => setBatchServerName(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-group">
                  <label>Service Outcome / Status:</label>
                  <select
                    value={batchServiceStatus}
                    onChange={(e) =>
                      setBatchServiceStatus(e.target.value as "SERVED" | "REFUSED" | "UNTRACEABLE")
                    }
                    className="form-control"
                    style={{ width: "100%" }}
                  >
                    <option value="SERVED">
                      SERVED (تعمیل شدہ - Delivered to Assessee or Adult Member)
                    </option>
                    <option value="REFUSED">
                      REFUSED (انکاری - Refused to Accept Service / Witnessed)
                    </option>
                    <option value="UNTRACEABLE">
                      UNTRACEABLE (پتہ نامعلوم / Untraceable at Premises)
                    </option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Recipient Name or Witness Note:</label>
                  <input
                    type="text"
                    placeholder="e.g. Received by Proprietor / Witnessed by Market Union"
                    value={batchRecipientNote}
                    onChange={(e) => setBatchRecipientNote(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRecordBatchServiceModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  ✓ Confirm &amp; Save Batch Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 12: File New Appeal (Section 7 & Rule 13) */}
      {showFileAppealModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "650px", width: "95%" }}>
            <div className="modal-header">
              <h3>⚖️ File Statutory Appeal (اپیل زیر سیکشن 7 و رول 13)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowFileAppealModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFileAppeal}>
              <div className="modal-body">
                <div
                  style={{
                    background: "#faf5ff",
                    border: "1px solid #e9d5ff",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    color: "#581c87"
                  }}
                >
                  Filing appeal before the{" "}
                  <strong>
                    Appellate Authority / Director Excise &amp; Taxation, Multan Division
                  </strong>{" "}
                  against an assessment order/notice of the Assessing Authority (ETO Vehari).
                </div>

                <div className="form-group">
                  <label>Select Impugned Tax Unit / Assessment:</label>
                  <select
                    value={appealUnitId}
                    onChange={(e) => {
                      setAppealUnitId(e.target.value);
                      const u = units.find((x) => x.id === e.target.value);
                      const tax = u?.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                      setAppealUndisputedPaid(Math.floor(tax / 2));
                    }}
                    className="form-control"
                    style={{ width: "100%" }}
                    required
                  >
                    {units.map((u) => {
                      const tax = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.legalName} ({u.tradeName ?? u.legalName}) - PFT-1/VEH/2026/
                          {u.id.slice(-4)} [PKR {tax.toLocaleString()}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label>Primary Ground of Appeal (بنیاد اپیل):</label>
                  <select
                    value={appealGroundCategory}
                    onChange={(e) => setAppealGroundCategory(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  >
                    <option value="Dispute on employee threshold (fewer than 10 workers in commercial establishment)">
                      Employee Count Dispute: Fewer than 10 workers (claims Entry 3(ii) at PKR 2,000
                      instead of 3(i)(b) at PKR 4,000)
                    </option>
                    <option value="Wrong statutory sub-classification code applied by assessing authority">
                      Misclassification: Erroneous category applied by assessing authority
                    </option>
                    <option value="Exemption claimed under Section 3 proviso (Not engaged in taxable trade)">
                      Statutory Exemption: Assessee claims full exemption under Section 3 proviso
                    </option>
                    <option value="Double assessment under multiple heads for same financial year">
                      Duplicate Assessment: Unit assessed under multiple classifications
                    </option>
                    <option value="Default penalty remission requested due to bona fide hardship">
                      Penalty Remission: Default penalty challenged due to lack of prior notice
                      service
                    </option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Ground Details &amp; Averments (تفصیلات و بیان مؤقف):</label>
                  <textarea
                    rows={3}
                    placeholder="State specific facts, employee payroll details, or reasons why the assessment is erroneous..."
                    value={appealGroundDetails}
                    onChange={(e) => setAppealGroundDetails(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-group">
                  <label>
                    Undisputed Tax Deposited into Treasury (PKR) (رقم غیر متنازعہ ٹیکس):
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={appealUndisputedPaid}
                    onChange={(e) => setAppealUndisputedPaid(Number(e.target.value))}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                  <small style={{ color: "#64748b", display: "block", marginTop: "0.25rem" }}>
                    Mandatory under Rule 13(2): No appeal shall be entertained without payment of
                    undisputed tax.
                  </small>
                </div>

                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginTop: "1rem"
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "0.85rem"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={appealCondonation}
                      onChange={(e) => setAppealCondonation(e.target.checked)}
                    />
                    Appeal filed after statutory 30-day limitation period (Request Condonation of
                    Delay)
                  </label>

                  {appealCondonation && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <input
                        type="text"
                        placeholder="State sufficient cause for delay (e.g. medical emergency, delayed notice delivery)..."
                        value={appealCondonationReason}
                        onChange={(e) => setAppealCondonationReason(e.target.value)}
                        className="form-control"
                        style={{ width: "100%", fontSize: "0.85rem" }}
                        required={appealCondonation}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFileAppealModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  ⚖️ Submit &amp; Lodge Appeal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 13: Fix Appellate Hearing Date (Schedule Court Session) */}
      {showScheduleHearingModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "550px", width: "95%" }}>
            <div className="modal-header">
              <h3>📅 Schedule Appellate Court Hearing (مقرر تاریخ سماعت)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowScheduleHearingModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleScheduleHearing}>
              <div className="modal-body">
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    color: "#1e40af"
                  }}
                >
                  Fixing judicial court appearance before <strong>Director Shahid Nawaz</strong>{" "}
                  (Court Room, Regional Excise Directorate, Multan).
                </div>

                <div className="form-group">
                  <label>Date of Appellate Hearing (تاریخ سماعت):</label>
                  <input
                    type="date"
                    required
                    value={hearingDateInput}
                    onChange={(e) => setHearingDateInput(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-group">
                  <label>Hearing Directions / Summons Note:</label>
                  <textarea
                    rows={3}
                    value={hearingNotesInput}
                    onChange={(e) => setHearingNotesInput(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowScheduleHearingModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  📅 Fix Date &amp; Issue Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 14: Appellate Adjudication & Order Pronouncement */}
      {showAdjudicateAppealModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "700px", width: "95%" }}>
            <div className="modal-header">
              <h3>👨‍⚖️ Appellate Court Adjudication (فیصلہ اپیل و عدالتی حکم)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowAdjudicateAppealModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAdjudicateAppeal}>
              <div className="modal-body">
                <div
                  style={{
                    background: "#faf5ff",
                    border: "1px solid #e9d5ff",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    color: "#581c87"
                  }}
                >
                  Adjudicating case as{" "}
                  <strong>
                    Shahid Nawaz, Director Excise &amp; Taxation / Appellate Authority
                  </strong>
                  . Any tax reduction or annulment will automatically append an immutable authorized
                  adjustment entry to the demand ledger.
                </div>

                {(() => {
                  const targetApp = appeals.find((a) => a.id === adjudicateTargetAppealId);
                  const targetUnit = units.find((u) => u.id === targetApp?.unitId);
                  const originalTax = targetUnit?.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                  let penalty = 0;
                  for (const entry of targetUnit?.ledgerEntries ?? []) {
                    if (entry.entryType === "PENALTY_DEMAND") penalty += entry.amount;
                  }

                  let relief = 0;
                  if (decisionType === "REDUCE")
                    relief = Math.max(0, originalTax - revisedAmountInput);
                  else if (decisionType === "ANNUL") relief = originalTax;
                  else if (decisionType === "PENALTY_REMISSION") relief = penalty;

                  return (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.75rem",
                          background: "#f8fafc",
                          padding: "0.75rem",
                          borderRadius: "6px",
                          marginBottom: "1rem",
                          fontSize: "0.85rem"
                        }}
                      >
                        <div>
                          <strong>Appellant:</strong> {targetApp?.appellantName}
                          <br />
                          <strong>Appeal No:</strong> {targetApp?.appealNumber}
                          <br />
                          <strong>Notice:</strong> PFT-1/VEH/2026/{targetUnit?.id.slice(-4)}
                        </div>
                        <div>
                          <strong>Assessed Tax:</strong> PKR {originalTax.toLocaleString()}
                          <br />
                          <strong>Penalties:</strong> PKR {penalty.toLocaleString()}
                          <br />
                          <strong>Undisputed Paid:</strong> PKR{" "}
                          {targetApp?.undisputedPaid.toLocaleString()}
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Appellate Decision (نوعیت فیصلہ):</label>
                        <select
                          value={decisionType}
                          onChange={(e) =>
                            setDecisionType(
                              e.target.value as
                                | "CONFIRM"
                                | "REDUCE"
                                | "ENHANCE"
                                | "ANNUL"
                                | "REMAND"
                                | "PENALTY_REMISSION"
                            )
                          }
                          className="form-control"
                          style={{ width: "100%", fontWeight: "600" }}
                        >
                          <option value="REDUCE">
                            REDUCE (جزوی منظوری - Reduce assessment to lower statutory rate)
                          </option>
                          <option value="CONFIRM">
                            CONFIRM (خارج - Dismiss appeal and uphold assessment in full)
                          </option>
                          <option value="ANNUL">
                            ANNUL (مکمل کالعدم - Set aside &amp; annul assessment in toto)
                          </option>
                          <option value="REMAND">
                            REMAND (ریمانڈ - Remand to ETO Vehari for re-survey &amp; inquiry)
                          </option>
                          <option value="PENALTY_REMISSION">
                            PENALTY REMISSION (معافی جرمانہ - Waive Section 3(4) default penalty)
                          </option>
                          <option value="ENHANCE">
                            ENHANCE (اضافہ - Increase assessment based on detected turnover)
                          </option>
                        </select>
                      </div>

                      {(decisionType === "REDUCE" || decisionType === "ENHANCE") && (
                        <div className="form-group">
                          <label>Revised Assessed Tax Amount (PKR) (نئی شرح ٹیکس):</label>
                          <input
                            type="number"
                            min={0}
                            required
                            value={revisedAmountInput}
                            onChange={(e) => setRevisedAmountInput(Number(e.target.value))}
                            className="form-control"
                            style={{ width: "100%", fontWeight: "bold" }}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          padding: "0.75rem",
                          borderRadius: "6px",
                          marginBottom: "1rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <span style={{ fontSize: "0.85rem", color: "#166534" }}>
                          Calculated Taxpayer Relief:
                        </span>
                        <strong style={{ fontSize: "1.2rem", color: "#15803d" }}>
                          PKR {relief.toLocaleString()}
                        </strong>
                      </div>

                      <div className="form-group">
                        <label>
                          Judicial Findings &amp; Operative Reasoning (فیصلہ کی وجوہات):
                        </label>
                        <textarea
                          rows={4}
                          required
                          value={judicialFindingsInput}
                          onChange={(e) => setJudicialFindingsInput(e.target.value)}
                          className="form-control"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAdjudicateAppealModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  ✍️ Sign &amp; Issue Appellate Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 15: Statutory Appellate Order Document Viewer */}
      {showAppellateOrderModal && activeAppellateOrder && (
        <div className="modal-overlay">
          <div
            className="modal-card"
            style={{ maxWidth: "800px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-header no-print">
              <h3>📜 Statutory Appellate Order (عدالتی حکم نامہ اپیل)</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowAppellateOrderModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ background: "#ffffff", padding: "1.5rem" }}>
              <div
                style={{
                  border: "2px solid #334155",
                  padding: "1.5rem",
                  fontFamily: "'Courier New', Courier, monospace",
                  background: "#fafafa"
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "2px solid #334155",
                    paddingBottom: "1rem",
                    marginBottom: "1rem"
                  }}
                >
                  <h4 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>
                    GOVERNMENT OF THE PUNJAB
                  </h4>
                  <p style={{ margin: "0.25rem 0", fontWeight: "bold" }}>
                    {activeAppellateOrder.courtTitle}
                  </p>
                  <p style={{ margin: "0.25rem 0", fontSize: "1rem", fontFamily: "serif" }}>
                    {activeAppellateOrder.courtTitleUrdu}
                  </p>
                  <p style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>
                    ORDER PASSED UNDER SECTION 7 OF PUNJAB FINANCE ACT, 1977 READ WITH RULE 13 OF
                    PUNJAB PROFESSIONS &amp; TRADES TAX RULES, 1977
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                    marginBottom: "1rem"
                  }}
                >
                  <div>
                    <strong>Appeal No:</strong> {activeAppellateOrder.appealNumber}
                    <br />
                    <strong>Order No:</strong> {activeAppellateOrder.orderNumber}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>Filing Date:</strong> {activeAppellateOrder.filingDate}
                    <br />
                    <strong>Date of Order:</strong> {activeAppellateOrder.orderDate}
                  </div>
                </div>

                <div
                  style={{
                    background: "#f1f5f9",
                    padding: "0.75rem",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    marginBottom: "1rem"
                  }}
                >
                  <strong>{activeAppellateOrder.appellantName}</strong> (
                  {activeAppellateOrder.appellantTradeName ?? activeAppellateOrder.appellantName})
                  <br />
                  Address: {activeAppellateOrder.appellantAddress} | CNIC/Identifier:{" "}
                  {activeAppellateOrder.appellantIdentifier}
                  <div style={{ textAlign: "center", fontWeight: "bold", margin: "0.4rem 0" }}>
                    ... VERSUS ...
                  </div>
                  <strong>{activeAppellateOrder.respondentTitle}</strong>
                </div>

                <div style={{ fontSize: "0.85rem", lineHeight: "1.5", marginBottom: "1rem" }}>
                  <p>
                    <strong>1. Impugned Order:</strong> Demand Notice No.{" "}
                    {activeAppellateOrder.impugnedNoticeNumber} (Demand No:{" "}
                    {activeAppellateOrder.demandNumber}) assessing tax of PKR{" "}
                    {activeAppellateOrder.originalTaxAmount.toLocaleString()} under{" "}
                    {activeAppellateOrder.scheduleEntry}.
                  </p>
                  <p>
                    <strong>2. Ground of Appeal:</strong> {activeAppellateOrder.groundOfAppeal}
                  </p>
                  <p>
                    <strong>3. Undisputed Tax Deposited:</strong> PKR{" "}
                    {activeAppellateOrder.undisputedTaxDeposited.toLocaleString()} (Compliance of
                    Rule 13(2)).
                  </p>
                  <p>
                    <strong>4. Findings &amp; Reasoning:</strong>{" "}
                    {activeAppellateOrder.findingsAndReasoning}
                  </p>
                  <p
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderLeft: "4px solid #3b82f6"
                    }}
                  >
                    <strong>5. OPERATIVE ORDER (حکم):</strong>
                    <br />
                    <span
                      style={{
                        fontSize: "0.95rem",
                        fontFamily: "serif",
                        display: "block",
                        marginTop: "0.25rem"
                      }}
                    >
                      {activeAppellateOrder.operativeOrderUrdu}
                    </span>
                    <span style={{ display: "block", marginTop: "0.25rem", color: "#334155" }}>
                      Decision: <strong>{activeAppellateOrder.decisionType}</strong> | Relief
                      Granted:{" "}
                      <strong>PKR {activeAppellateOrder.reliefAmount.toLocaleString()}</strong> |
                      Revised Demand:{" "}
                      <strong>PKR {activeAppellateOrder.revisedTaxAmount.toLocaleString()}</strong>.
                    </span>
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginTop: "2rem",
                    paddingTop: "1rem",
                    borderTop: "1px dashed #cbd5e1"
                  }}
                >
                  <div style={{ fontSize: "0.7rem", color: "#64748b", maxWidth: "300px" }}>
                    <strong>Cryptographic Non-Repudiation Digest:</strong>
                    <br />
                    <code style={{ fontSize: "0.65rem", wordBreak: "break-all" }}>
                      {activeAppellateOrder.officialSha256}
                    </code>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: "120px",
                        height: "60px",
                        border: "1px dashed #94a3b8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7rem",
                        color: "#64748b",
                        margin: "0 auto 0.25rem"
                      }}
                    >
                      [Official Seal]
                    </div>
                    <strong>{activeAppellateOrder.appellateAuthorityName}</strong>
                    <div style={{ fontSize: "0.75rem", color: "#475569" }}>
                      {activeAppellateOrder.appellateAuthorityDesignation}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer no-print">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAppellateOrderModal(false)}
              >
                Close
              </button>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨️ Print Appellate Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 16: BULK SURVEY IMPORT STUDIO (FORM P.F.T-3 INGESTION) */}
      {showBulkSurveyModal && (
        <div className="modal-overlay">
          <div
            className="modal-card modal-card-xl"
            style={{ display: "flex", flexDirection: "column", maxHeight: "90vh" }}
          >
            <div
              className="modal-header"
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
                borderBottom: "3px solid #b45309"
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.15rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}
                >
                  <span>📋</span>
                  <span>فیلڈ سروے و اندراج نوٹس جات برائے رجسٹر پی ایف ٹی-3</span>
                </h3>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#d1fae5" }}>
                  Bulk Field Survey Ingestion Studio &bull; Circle-Vehari (Rules 4, 5 &amp; 11)
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowBulkSurveyModal(false);
                  setBulkSurveyParseResult(null);
                  setBulkSurveyRawCsv("");
                  setBulkSurveyFileName("");
                }}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: "auto", padding: "1.25rem" }}>
              {/* Step 1 & 2 Toolbar Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  background: "#f8fafc",
                  padding: "1rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0"
                }}
              >
                {/* Step 1: Download Standard Template */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <h4 style={{ margin: "0 0 0.35rem 0", color: "#0f172a", fontSize: "0.95rem" }}>
                      1. ڈاؤن لوڈ آفیشل سروے فارمیٹ (Download Template)
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.4 }}>
                      Standard RFC-4180 CSV pre-configured with Punjab Finance Act Second Schedule
                      headers, CNIC/NTN formats, and authentic Circle-Vehari sample trades.
                    </p>
                  </div>
                  <div style={{ marginTop: "0.85rem" }}>
                    <button
                      type="button"
                      onClick={handleDownloadSurveyTemplate}
                      className="btn-secondary btn-sm"
                      style={{
                        backgroundColor: "#ffffff",
                        borderColor: "#0d3822",
                        color: "#0d3822",
                        fontWeight: 600
                      }}
                    >
                      ⬇️ Download Survey Template (.csv)
                    </button>
                  </div>
                </div>

                {/* Step 2: Upload File or Direct Paste */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.35rem"
                    }}
                  >
                    <h4 style={{ margin: 0, color: "#0f172a", fontSize: "0.95rem" }}>
                      2. سروے فائل اپ لوڈ کریں (Upload or Paste Data)
                    </h4>
                    <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => setBulkInputMode("FILE")}
                        style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: bulkInputMode === "FILE" ? "#0d3822" : "#ffffff",
                          color: bulkInputMode === "FILE" ? "#ffffff" : "#475569",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        File Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkInputMode("PASTE")}
                        style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: bulkInputMode === "PASTE" ? "#0d3822" : "#ffffff",
                          color: bulkInputMode === "PASTE" ? "#ffffff" : "#475569",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Direct Paste
                      </button>
                    </div>
                  </div>

                  {bulkInputMode === "FILE" ? (
                    <div>
                      <input
                        type="file"
                        id="bulkSurveyFileInput"
                        accept=".csv,text/csv"
                        onChange={handleSurveyFileUpload}
                        style={{ display: "none" }}
                      />
                      <label
                        htmlFor="bulkSurveyFileInput"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          padding: "0.75rem",
                          border: "2px dashed #94a3b8",
                          borderRadius: "6px",
                          background: "#ffffff",
                          cursor: "pointer",
                          color: "#334155",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          marginTop: "0.35rem"
                        }}
                      >
                        <span>📁</span>
                        <span>
                          {bulkSurveyFileName
                            ? `File: ${bulkSurveyFileName}`
                            : "Click to browse & upload field survey (.csv)"}
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        rows={3}
                        className="form-control"
                        placeholder="Paste CSV text here (including headers)..."
                        value={bulkSurveyRawCsv}
                        onChange={(e) => handleSurveyTextChange(e.target.value)}
                        style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Interactive Staging & Validation Results */}
              {bulkSurveyParseResult ? (
                <div style={{ marginTop: "0.75rem" }}>
                  {/* Summary Metric Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: "0.75rem",
                      marginBottom: "0.75rem"
                    }}
                  >
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "6px"
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>
                        TOTAL SURVEY ROWS
                      </span>
                      <strong style={{ display: "block", fontSize: "1.25rem", color: "#0f172a" }}>
                        {bulkSurveyParseResult.totalRows}
                      </strong>
                    </div>
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "6px"
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#166534", fontWeight: 700 }}>
                        VALID FOR INGESTION
                      </span>
                      <strong style={{ display: "block", fontSize: "1.25rem", color: "#15803d" }}>
                        {bulkSurveyParseResult.validRowsCount}
                      </strong>
                    </div>
                    <div
                      style={{
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "6px"
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#991b1b", fontWeight: 700 }}>
                        VALIDATION ERRORS
                      </span>
                      <strong style={{ display: "block", fontSize: "1.25rem", color: "#b91c1c" }}>
                        {bulkSurveyParseResult.errorRowsCount}
                      </strong>
                    </div>
                    <div
                      style={{
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "6px"
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#92400e", fontWeight: 700 }}>
                        DUPLICATES DETECTED
                      </span>
                      <strong style={{ display: "block", fontSize: "1.25rem", color: "#b45309" }}>
                        {bulkSurveyParseResult.duplicateCount}
                      </strong>
                    </div>
                  </div>

                  {/* Filter Toolbar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem"
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => setBulkSurveyFilter("ALL")}
                        className="btn-secondary btn-sm"
                        style={{
                          background: bulkSurveyFilter === "ALL" ? "#0f172a" : "#ffffff",
                          color: bulkSurveyFilter === "ALL" ? "#ffffff" : "#475569"
                        }}
                      >
                        All Rows ({bulkSurveyParseResult.totalRows})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkSurveyFilter("VALID")}
                        className="btn-secondary btn-sm"
                        style={{
                          background: bulkSurveyFilter === "VALID" ? "#15803d" : "#ffffff",
                          color: bulkSurveyFilter === "VALID" ? "#ffffff" : "#15803d",
                          borderColor: "#15803d"
                        }}
                      >
                        Valid Only ({bulkSurveyParseResult.validRowsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkSurveyFilter("ERROR")}
                        className="btn-secondary btn-sm"
                        style={{
                          background: bulkSurveyFilter === "ERROR" ? "#b91c1c" : "#ffffff",
                          color: bulkSurveyFilter === "ERROR" ? "#ffffff" : "#b91c1c",
                          borderColor: "#b91c1c"
                        }}
                      >
                        Errors &amp; Duplicates ({bulkSurveyParseResult.errorRowsCount})
                      </button>
                    </div>

                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Circle: <strong>Circle-Vehari</strong> &bull; Assessing Authority:{" "}
                      <strong>Tariq Mahmood (ETO)</strong>
                    </span>
                  </div>

                  {/* Staging Table */}
                  <div
                    className="table-container"
                    style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid #cbd5e1" }}
                  >
                    <table className="gov-table" style={{ fontSize: "0.8rem" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "2.5rem" }}>#</th>
                          <th style={{ width: "5.5rem" }}>Status</th>
                          <th>Legal &amp; Trade Name</th>
                          <th>Identifier (CNIC/NTN)</th>
                          <th>Commercial Address</th>
                          <th>Statutory Rule</th>
                          <th>Rate (PKR)</th>
                          <th>Validation Findings / Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSurveyParseResult.rows
                          .filter((r) => {
                            if (bulkSurveyFilter === "VALID") return r.status === "VALID";
                            if (bulkSurveyFilter === "ERROR") return r.status === "ERROR";
                            return true;
                          })
                          .map((row) => (
                            <tr
                              key={row.rowNumber}
                              style={{
                                background: row.status === "ERROR" ? "#fff5f5" : "#ffffff"
                              }}
                            >
                              <td>{row.rowNumber}</td>
                              <td>
                                {row.status === "VALID" ? (
                                  <span
                                    className="badge badge-approved"
                                    style={{ fontSize: "0.65rem" }}
                                  >
                                    ✓ VALID
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-returned"
                                    style={{ fontSize: "0.65rem" }}
                                  >
                                    ✕ ERROR
                                  </span>
                                )}
                              </td>
                              <td>
                                <strong>{row.rawData["legalName"] || "(Blank Legal Name)"}</strong>
                                {row.rawData["tradeName"] && (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "0.7rem",
                                      color: "#64748b"
                                    }}
                                  >
                                    {row.rawData["tradeName"]}
                                  </span>
                                )}
                              </td>
                              <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                                {row.parsedUnit
                                  ? `${row.parsedUnit.identifierType}: ${row.parsedUnit.maskedIdentifier}`
                                  : row.rawData["identifierValue"] || "(Empty)"}
                              </td>
                              <td style={{ maxWidth: "12rem", fontSize: "0.75rem" }}>
                                {row.rawData["address"] || "(Blank Address)"}
                              </td>
                              <td>
                                {row.parsedUnit ? (
                                  <div>
                                    <span
                                      className="badge badge-draft"
                                      style={{ fontSize: "0.65rem" }}
                                    >
                                      Entry {row.parsedUnit.statutoryRule.subclassification_code}
                                    </span>
                                    <span
                                      style={{
                                        display: "block",
                                        fontSize: "0.68rem",
                                        color: "#475569"
                                      }}
                                    >
                                      {row.parsedUnit.statutoryRule.rule_id}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                                    {row.rawData["statutoryRuleId"] || "(None)"}
                                  </span>
                                )}
                              </td>
                              <td>
                                <strong>
                                  {row.parsedUnit
                                    ? `PKR ${row.parsedUnit.taxAmount.toLocaleString()}`
                                    : "—"}
                                </strong>
                              </td>
                              <td>
                                {row.errors.length > 0 && (
                                  <div
                                    style={{
                                      color: "#b91c1c",
                                      fontSize: "0.725rem",
                                      lineHeight: 1.3
                                    }}
                                  >
                                    {row.errors.map((e, i) => (
                                      <div key={i}>&bull; {e}</div>
                                    ))}
                                  </div>
                                )}
                                {row.warnings.length > 0 && (
                                  <div
                                    style={{
                                      color: "#d97706",
                                      fontSize: "0.725rem",
                                      lineHeight: 1.3,
                                      marginTop: "0.2rem"
                                    }}
                                  >
                                    {row.warnings.map((w, i) => (
                                      <div key={i}>⚠️ {w}</div>
                                    ))}
                                  </div>
                                )}
                                {row.errors.length === 0 && row.warnings.length === 0 && (
                                  <span style={{ color: "#166534", fontSize: "0.725rem" }}>
                                    ✓ Verified under Second Schedule
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "2.5rem 1rem",
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px dashed #cbd5e1",
                    marginTop: "0.75rem"
                  }}
                >
                  <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>
                    📥
                  </span>
                  <strong style={{ fontSize: "1rem", color: "#334155" }}>
                    No field survey data loaded yet
                  </strong>
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0.35rem 0 0" }}>
                    Download the official template above or select a completed CSV survey
                    spreadsheet to validate records.
                  </p>
                </div>
              )}
            </div>

            <div
              className="modal-footer"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {bulkSurveyParseResult && bulkSurveyParseResult.validRowsCount > 0 ? (
                  <span>
                    Ready to import <strong>{bulkSurveyParseResult.validRowsCount}</strong> valid
                    unit(s) into Form PFT-3 Register.
                  </span>
                ) : (
                  <span>Select and validate survey spreadsheet to continue.</span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowBulkSurveyModal(false);
                    setBulkSurveyParseResult(null);
                    setBulkSurveyRawCsv("");
                    setBulkSurveyFileName("");
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    backgroundColor: "#065f46",
                    borderColor: "#047857"
                  }}
                  disabled={
                    !bulkSurveyParseResult ||
                    bulkSurveyParseResult.validRowsCount === 0 ||
                    isImportingSurvey
                  }
                  onClick={handleExecuteBulkSurveyImport}
                >
                  {isImportingSurvey
                    ? "Importing Units..."
                    : `📥 Ingest Valid Units (${bulkSurveyParseResult ? bulkSurveyParseResult.validRowsCount : 0})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

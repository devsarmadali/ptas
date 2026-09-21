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
  createDemandLedgerEntry,
  createInitialDemandEntry,
  createPaymentReceiptEntry,
  createPenaltyDemandEntry,
  createTaxpayer,
  findDuplicateCandidates,
  getRulesByCategory,
  getStatutoryCategories,
  getStatutoryRuleById,
  getAllStatutoryRules,
  generateUinForUnit,
  generateDocumentPin,
  computeContentSha256,
  VEHARI_PILOT_JURISDICTION,
  returnAssessmentVersion,
  submitAssessmentVersion
} from "@ptas/domain";
import {
  CIRCLE_VEHARI_ID,
  FINANCIAL_YEAR_2026_27,
  MOCK_OFFICERS,
  type AppealRecord,
  type ClearanceCertificateRecord,
  type DiscontinuanceRecord,
  type MockOfficer,
  type PilotAuditItem,
  type RefundAdjustmentRecord,
  type StoredUnit,
  type StoredUnitSnapshot,
  type Pft2ChallanRecord,
  type StatutoryReceiptRecord,
  type Pft2Status,
  createInitialClearanceCertificates,
  createInitialDiscontinuances,
  createInitialRefundAdjustments,
  createInitialPft2Challans,
  createInitialStatutoryReceipts,
  loadPilotState,
  resetPilotState,
  savePilotState
} from "../lib/pilot-store";
import { computeFileSha256, uploadReceiptScan } from "../lib/storage";
import { pushPilotStateToSupabase } from "../lib/supabase-sync";
import {
  type AppellateOrderModel,
  type DiscontinuanceOrderModel,
  type RefundAdjustmentOrderModel,
  type TaxClearanceCertificateModel,
  generateAppellateOrderDocument,
  generateCircleDispatchRegister,
  generateDiscontinuanceOrder,
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateLandRevenueRecoveryCertificate,
  generateRefundAdjustmentOrder,
  generateShowCausePenaltyNotice,
  generateTaxClearanceCertificate,
  generatePft2NoticeNumber,
  formatStandardDocNumber,
  numberToWordsPkr
} from "../lib/statutory-forms";
import {
  type BulkSurveyParseResult,
  convertValidSurveyUnitsToStoredUnits,
  generateSurveyCsvTemplate,
  parseBulkSurveyCsv
} from "../lib/bulk-survey";
import {
  OFFICIAL_OFFICERS_REGISTRY,
  getOfficerProfileByEmail,
  signInOfficer,
  signOutOfficer,
  subscribeToAuthChanges,
  verifyOfficerAuthority
} from "../lib/supabase-auth";
import {
  type ExecutiveMetrics,
  computeExecutiveMetrics,
  downloadCsvFile,
  exportClearanceCertificatesCsv,
  exportDefaulterRecoveryCsv,
  exportNoticeDispatchCsv,
  exportPft3RegisterCsv,
  exportReliefAdjustmentsCsv,
  exportStatutorySlabDistributionCsv
} from "../lib/mis-analytics";
import { StatutoryQrCode } from "../components/StatutoryQrCode";
import { QrScannerModal } from "../components/QrScannerModal";
import { downloadDocumentPdf, printIsolatedElement } from "../lib/pdf-export";
import {
  exportPft2ChallansCsv,
  exportStatutoryReceiptsCsv,
  calculatePft2ExecutiveSummary,
  calculateReceiptsExecutiveSummary
} from "../lib/receipt-generator";
import {
  type CitizenPaymentSimulationResult,
  type DocumentVerificationResult,
  type SelfAssessmentCriteriaInput,
  type SelfAssessmentResult,
  type TaxpayerLiabilityLookupResult,
  calculateRule4SelfAssessment,
  generate17DigitEPayPsid,
  lookupTaxpayerLiability,
  simulateCitizenPayment,
  verifyStatutoryDocument
} from "../lib/public-portal";

export type RouteHubId = "assessment" | "enforcement" | "revenue" | "intelligence";

export type TabId =
  | "UNITS"
  | "ANALYTICS"
  | "REPORTS"
  | "MIS_HUB"
  | "PUBLIC_PORTAL"
  | "ASSESSMENTS"
  | "FORM_PFT1"
  | "FORM_PFT2"
  | "PFT2"
  | "RECEIPTS"
  | "REGISTER_PFT3"
  | "DEFAULTERS"
  | "APPEALS"
  | "CLEARANCE"
  | "RELIEF_DESK"
  | "LEDGER"
  | "EPAY"
  | "AUDIT";

export const TAB_TO_HUB: Record<TabId, RouteHubId> = {
  UNITS: "assessment",
  ASSESSMENTS: "assessment",
  FORM_PFT1: "assessment",
  FORM_PFT2: "assessment",
  DEFAULTERS: "enforcement",
  APPEALS: "enforcement",
  RELIEF_DESK: "enforcement",
  CLEARANCE: "enforcement",
  PFT2: "revenue",
  RECEIPTS: "revenue",
  LEDGER: "revenue",
  EPAY: "revenue",
  PUBLIC_PORTAL: "revenue",
  ANALYTICS: "intelligence",
  MIS_HUB: "intelligence",
  REPORTS: "intelligence",
  REGISTER_PFT3: "intelligence",
  AUDIT: "intelligence"
};

export const HUB_DEFAULT_TABS: Record<RouteHubId, TabId> = {
  assessment: "UNITS",
  enforcement: "DEFAULTERS",
  revenue: "PFT2",
  intelligence: "ANALYTICS"
};

export default function HomePage({
  initialRouteHub,
  initialTab
}: {
  initialRouteHub?: RouteHubId;
  initialTab?: TabId;
} = {}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [officer, setOfficer] = useState<MockOfficer>(MOCK_OFFICERS[0]);
  const [units, setUnits] = useState<StoredUnit[]>([]);
  const [auditLogs, setAuditLogs] = useState<PilotAuditItem[]>([]);
  const [activeRouteHub, setActiveRouteHub] = useState<RouteHubId>(initialRouteHub ?? "assessment");
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab ?? "UNITS");

  // Synchronized Tab and Route Switcher
  const switchTab = (tab: TabId) => {
    setActiveTabState(tab);
    const hub = TAB_TO_HUB[tab] ?? "assessment";
    setActiveRouteHub(hub);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("route", hub);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const switchRouteHub = (hub: RouteHubId) => {
    setActiveRouteHub(hub);
    const targetTab = TAB_TO_HUB[activeTab] === hub ? activeTab : HUB_DEFAULT_TABS[hub];
    setActiveTabState(targetTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("route", hub);
      url.searchParams.set("tab", targetTab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Compatible setter for all child handlers
  const setActiveTab = (tab: TabId) => {
    switchTab(tab);
  };

  // Selected Unit for Ledger & Form PFT-2 inspection
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  // Phase 6 State: Clearance Certificates, Discontinuance (Rule 10), and Statutory Refunds (Rule 5)
  const [discontinuances, setDiscontinuances] = useState<DiscontinuanceRecord[]>([]);
  const [refundAdjustments, setRefundAdjustments] = useState<RefundAdjustmentRecord[]>([]);
  const [clearanceCertificates, setClearanceCertificates] = useState<ClearanceCertificateRecord[]>(
    []
  );

  // Clearance Certificate Modal State
  const [showClearanceModal, setShowClearanceModal] = useState(false);
  const [activeClearanceCert, setActiveClearanceCert] =
    useState<TaxClearanceCertificateModel | null>(null);

  // Discontinuance Modal States (Rule 10)
  const [showFileDiscontinuanceModal, setShowFileDiscontinuanceModal] = useState(false);
  const [discUnitId, setDiscUnitId] = useState("");
  const [discDate, setDiscDate] = useState("2026-08-01");
  const [discReason, setDiscReason] = useState(
    "Surrendered commercial shop lease deed / closed operations"
  );
  const [discEvidence, setDiscEvidence] = useState(
    "Notarized lease termination deed & municipal trade license surrender certificate"
  );

  const [showDiscontinuanceInspectionModal, setShowDiscontinuanceInspectionModal] = useState(false);
  const [targetDiscId, setTargetDiscId] = useState("");
  const [discInspectorFindings, setDiscInspectorFindings] = useState(
    "Physical on-site inspection conducted in Circle-Vehari. Shop premises confirmed vacated, shutter locked, and business activity completely discontinued."
  );

  const [showDiscontinuanceOrderModal, setShowDiscontinuanceOrderModal] = useState(false);
  const [discEtoDecision, setDiscEtoDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [discEtoReason, setDiscEtoReason] = useState(
    "Verified on-site closure under Rule 10 of 1977 Rules. Assessment frozen; historical demand preserved."
  );
  const [activeDiscontinuanceOrder, setActiveDiscontinuanceOrder] =
    useState<DiscontinuanceOrderModel | null>(null);

  // Refund / Adjustment Modal States (Rule 5)
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refUnitId, setRefUnitId] = useState("");
  const [refType, setRefType] = useState<"CREDIT_ADJUSTMENT" | "REFUND">("CREDIT_ADJUSTMENT");
  const [refAmount, setRefAmount] = useState<number>(2000);
  const [refGrounds, setRefGrounds] = useState(
    "Taxpayer deposited excess amount under Challan 32-A"
  );
  const [refEvidence, setRefEvidence] = useState(
    "National Bank of Pakistan Challan 32-A Deposit Scroll Reference verified"
  );
  const [showRefundOrderModal, setShowRefundOrderModal] = useState(false);
  const [activeRefundOrder, setActiveRefundOrder] = useState<RefundAdjustmentOrderModel | null>(
    null
  );

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
    "On examination of the survey record and field verification report, the establishment is confirmed to employ fewer than 10 workers. The assessment is appropriately revised from Class 3(i)(b) to Class 3(ii) at PKR 2,000. Authorized adjustment credited to demand ledger."
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

  // Per-unit statutory actions dropdown state
  const [activeActionDropdownUnitId, setActiveActionDropdownUnitId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveActionDropdownUnitId(null);
    };
    if (activeActionDropdownUnitId) {
      window.addEventListener("click", handleGlobalClick);
    }
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [activeActionDropdownUnitId]);

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

  // Supabase Real Auth & Session State (Phase 5)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmailInput, setAuthEmailInput] = useState("inspector.vehari@punjab.gov.pk");
  const [authPasswordInput, setAuthPasswordInput] = useState("VehariInspector2026!");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authModeTab, setAuthModeTab] = useState<"QUICK" | "CREDENTIALS">("QUICK");
  const [authenticatedSessionType, setAuthenticatedSessionType] = useState<"CLOUD" | "OFFLINE">(
    "CLOUD"
  );

  // Phase 7: Executive MIS Hub & Report Studio
  const [showExecutivePrintModal, setShowExecutivePrintModal] = useState(false);
  const [executiveReportType, setExecutiveReportType] = useState<
    | "EXECUTIVE_MIS_SUMMARY"
    | "PFT3_REGISTER"
    | "DEFAULTER_ROLL"
    | "NOTICE_DISPATCH"
    | "CLEARANCE_LOG"
    | "RELIEF_REGISTER"
    | "SLAB_DISTRIBUTION"
  >("EXECUTIVE_MIS_SUMMARY");

  // Phase 9: Analytics Dashboard & Statutory Reports Separation
  const [activeReportTab, setActiveReportTab] = useState<
    | "PFT3_REGISTER"
    | "DEFAULTER_ROLL"
    | "NOTICE_DISPATCH"
    | "CLEARANCE_LOG"
    | "RELIEF_REGISTER"
    | "SLAB_DISTRIBUTION"
  >("PFT3_REGISTER");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [dashboardPerspective, setDashboardPerspective] = useState<
    "AUTO" | "INSPECTOR" | "ETO" | "DIRECTOR"
  >("AUTO");
  const [slabSearchQuery, setSlabSearchQuery] = useState("");
  const [slabCategoryFilter, setSlabCategoryFilter] = useState("ALL");

  // New Unit Form State
  const [newLegalName, setNewLegalName] = useState("");
  const [newTradeName, setNewTradeName] = useState("");
  const [newIdentifierType, setNewIdentifierType] = useState<"CNIC" | "NTN">("CNIC");
  const [newIdentifierValue, setNewIdentifierValue] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("3");
  const [newSubclassCode, setNewSubclassCode] = useState("3(i)");
  const [newTertiaryCode, setNewTertiaryCode] = useState("3(i)(b)");
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

  // Phase 8 State: Public Assessee Portal & Real-Time QR Verification Desk
  const [portalVerificationInput, setPortalVerificationInput] = useState("");
  const [portalVerificationResult, setPortalVerificationResult] =
    useState<DocumentVerificationResult | null>(null);
  const [portalSearchQuery, setPortalSearchQuery] = useState("");
  const [portalSearchResult, setPortalSearchResult] =
    useState<TaxpayerLiabilityLookupResult | null>(null);
  const [portalCalcCriteria, setPortalCalcCriteria] = useState<SelfAssessmentCriteriaInput>({
    categoryCode: "3",
    employeeCount: 12,
    isMetropolitan: false
  });
  const [portalCalcResult, setPortalCalcResult] = useState<SelfAssessmentResult>(() =>
    calculateRule4SelfAssessment({
      categoryCode: "3",
      employeeCount: 12,
      isMetropolitan: false
    })
  );

  // Citizen Digital Payment Simulation Modal
  const [showCitizenPaymentModal, setShowCitizenPaymentModal] = useState(false);
  const [citizenPayUnitId, setCitizenPayUnitId] = useState("");
  const [citizenPayAmount, setCitizenPayAmount] = useState<number>(4000);
  const [citizenPayChannel, setCitizenPayChannel] = useState<"EPAY_PUNJAB" | "CHALLAN_32A">(
    "EPAY_PUNJAB"
  );
  const [citizenPaymentSuccess, setCitizenPaymentSuccess] =
    useState<CitizenPaymentSimulationResult | null>(null);

  // Phase 10 State: PFT-2 Challan Management & Statutory Receipts Desk
  const [pft2Challans, setPft2Challans] = useState<Pft2ChallanRecord[]>([]);
  const [statutoryReceipts, setStatutoryReceipts] = useState<StatutoryReceiptRecord[]>([]);

  // PFT-2 Filters & Modals
  const [pft2StatusFilter, setPft2StatusFilter] = useState<
    "ALL" | "ISSUED" | "RECEIVED" | "CANCELLED"
  >("ALL");
  const [pft2SearchQuery, setPft2SearchQuery] = useState("");
  const [pft2CategoryFilter, setPft2CategoryFilter] = useState("ALL");
  const [showReceivePft2Modal, setShowReceivePft2Modal] = useState(false);
  const [receivingChallan, setReceivingChallan] = useState<Pft2ChallanRecord | null>(null);
  const [receivePaymentChannel, setReceivePaymentChannel] = useState("National Bank of Pakistan");
  const [receiveBankBranch, setReceiveBankBranch] = useState(
    "Main Treasury Branch, Vehari (Treasury 0142)"
  );
  const [receiveBankScrollRef, setReceiveBankScrollRef] = useState("");
  const [receiveDate, setReceiveDate] = useState("2026-09-19");
  const [receiveRemarks, setReceiveRemarks] = useState("");

  const [showCancelPft2Modal, setShowCancelPft2Modal] = useState(false);
  const [cancellingChallan, setCancellingChallan] = useState<Pft2ChallanRecord | null>(null);
  const [cancelPft2Reason, setCancelPft2Reason] = useState(
    "Superseded by revised assessment under Rule 12"
  );
  const [showPft2ExecutiveModal, setShowPft2ExecutiveModal] = useState(false);

  // Issue Form PFT-2 Challan Modal State
  const [showIssuePft2Modal, setShowIssuePft2Modal] = useState(false);
  const [issuePft2UnitId, setIssuePft2UnitId] = useState("");
  const [issuePft2DueDate, setIssuePft2DueDate] = useState("2026-08-31");
  const [issuePft2IssueDate, setIssuePft2IssueDate] = useState("2026-09-20");
  const [issuePft2FormType, setIssuePft2FormType] = useState<
    "STANDARD" | "NOTICE_CUM_CHALLAN" | "ARREARS_DEMAND" | "REVISED_ASSESSMENT"
  >("STANDARD");
  const [issuePft2DemandScope, setIssuePft2DemandScope] = useState<
    "CURRENT" | "ARREAR" | "COMBINED"
  >("CURRENT");
  const [issuePft2PaymentScope, setIssuePft2PaymentScope] = useState<"FULL" | "PARTIAL">("FULL");
  const [issuePft2PartialAmount, setIssuePft2PartialAmount] = useState<number>(0);

  // Single Challan Print/Download Modal State
  const [activePrintChallan, setActivePrintChallan] = useState<Pft2ChallanRecord | null>(null);
  const [showPrintChallanModal, setShowPrintChallanModal] = useState(false);

  // Receipts Filters & Modals
  const [receiptSearchQuery, setReceiptSearchQuery] = useState("");
  const [receiptDateFrom, setReceiptDateFrom] = useState("");
  const [receiptDateTo, setReceiptDateTo] = useState("");
  const [receiptCategoryFilter, setReceiptCategoryFilter] = useState("ALL");
  const [receiptChannelFilter, setReceiptChannelFilter] = useState("ALL");
  const [showReceiptDocumentModal, setShowReceiptDocumentModal] = useState(false);
  const [activeReceiptRecord, setActiveReceiptRecord] = useState<StatutoryReceiptRecord | null>(
    null
  );
  const [showReceiptsExecutiveModal, setShowReceiptsExecutiveModal] = useState(false);

  // Universal QR Code Scanner Modal
  const [showQrScannerModal, setShowQrScannerModal] = useState(false);

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
    setDiscontinuances(state.discontinuances ?? createInitialDiscontinuances());
    setRefundAdjustments(state.refundAdjustments ?? createInitialRefundAdjustments());
    setClearanceCertificates(state.clearanceCertificates ?? createInitialClearanceCertificates());
    setPft2Challans(state.pft2Challans ?? createInitialPft2Challans(state.units));
    setStatutoryReceipts(state.statutoryReceipts ?? createInitialStatutoryReceipts(state.units));
    if (state.units.length > 0) {
      const firstId = state.units[0]?.id ?? "";
      setSelectedUnitId(firstId);
      setPaymentUnitId(firstId);
      setAppealUnitId(firstId);
      setDiscUnitId(firstId);
      setRefUnitId(firstId);
    }
    setIsLoaded(true);

    // Subscribe to real Supabase Auth session updates
    const sub = subscribeToAuthChanges((event, session) => {
      if (session?.user?.email) {
        const matching = getOfficerProfileByEmail(session.user.email);
        setOfficer(matching);
        setAuthenticatedSessionType("CLOUD");
      }
    });

    return () => {
      sub?.unsubscribe();
    };
  }, []);

  // Synchronize state changes to localStorage
  const syncState = (
    updatedUnits: StoredUnit[],
    updatedAudits: PilotAuditItem[],
    updatedOfficer?: MockOfficer,
    updatedAppeals?: AppealRecord[],
    updatedDiscontinuances?: DiscontinuanceRecord[],
    updatedRefunds?: RefundAdjustmentRecord[],
    updatedClearanceCerts?: ClearanceCertificateRecord[],
    updatedPft2Challans?: Pft2ChallanRecord[],
    updatedReceipts?: StatutoryReceiptRecord[]
  ) => {
    setUnits(updatedUnits);
    setAuditLogs(updatedAudits);
    if (updatedOfficer) setOfficer(updatedOfficer);
    const nextAppeals = updatedAppeals ?? appeals;
    if (updatedAppeals) setAppeals(nextAppeals);
    const nextDiscontinuances = updatedDiscontinuances ?? discontinuances;
    if (updatedDiscontinuances) setDiscontinuances(nextDiscontinuances);
    const nextRefunds = updatedRefunds ?? refundAdjustments;
    if (updatedRefunds) setRefundAdjustments(nextRefunds);
    const nextClearanceCerts = updatedClearanceCerts ?? clearanceCertificates;
    if (updatedClearanceCerts) setClearanceCertificates(nextClearanceCerts);
    const nextPft2 = updatedPft2Challans ?? pft2Challans;
    if (updatedPft2Challans) setPft2Challans(nextPft2);
    const nextRecs = updatedReceipts ?? statutoryReceipts;
    if (updatedReceipts) setStatutoryReceipts(nextRecs);

    savePilotState({
      currentOfficer: updatedOfficer ?? officer,
      units: updatedUnits,
      auditLogs: updatedAudits,
      reconciliations: [],
      appeals: nextAppeals,
      discontinuances: nextDiscontinuances,
      refundAdjustments: nextRefunds,
      clearanceCertificates: nextClearanceCerts,
      pft2Challans: nextPft2,
      statutoryReceipts: nextRecs
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
      setDiscontinuances(clean.discontinuances ?? createInitialDiscontinuances());
      setRefundAdjustments(clean.refundAdjustments ?? createInitialRefundAdjustments());
      setClearanceCertificates(clean.clearanceCertificates ?? createInitialClearanceCertificates());
      setPft2Challans(clean.pft2Challans ?? []);
      setStatutoryReceipts(clean.statutoryReceipts ?? []);
      if (clean.units.length > 0) {
        const firstId = clean.units[0]?.id ?? "";
        setSelectedUnitId(firstId);
        setPaymentUnitId(firstId);
        setAppealUnitId(firstId);
        setDiscUnitId(firstId);
        setRefUnitId(firstId);
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

  // Handler: Authenticate Officer via Supabase Auth (Phase 5)
  const handleAuthenticateOfficer = async (email: string, password?: string) => {
    setIsAuthenticating(true);
    try {
      const result = await signInOfficer(email, password);
      if (result.success) {
        setOfficer(result.officer);
        setAuthenticatedSessionType(result.isCloudAuth ? "CLOUD" : "OFFLINE");
        const auditItem: PilotAuditItem = {
          id: `audit-auth-${Date.now()}`,
          eventType: "OFFICER_SESSION_AUTHENTICATED",
          actorName: result.officer.name,
          actorRole: result.officer.role,
          target: `${result.officer.name} (${result.officer.email})`,
          timestamp: new Date().toISOString(),
          correlationId: `corr-auth-${Date.now()}`,
          details: `Authenticated session via ${result.isCloudAuth ? "Supabase Real Auth (JWT)" : "Offline Officer Keystore"} for ${result.officer.title} (${result.officer.jurisdictionName}). Enforced tier: ${result.officer.jurisdictionTier}.`
        };
        syncState(units, [auditItem, ...auditLogs], result.officer);
        showToast("success", `🔑 ${result.message}`);
        setShowAuthModal(false);
      } else {
        showToast("error", result.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Authentication failed: ${msg}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleOfficerSignOut = async () => {
    await signOutOfficer();
    const auditItem: PilotAuditItem = {
      id: `audit-auth-${Date.now()}`,
      eventType: "OFFICER_SESSION_TERMINATED",
      actorName: officer.name,
      actorRole: officer.role,
      target: `${officer.name} (${officer.email})`,
      timestamp: new Date().toISOString(),
      correlationId: `corr-auth-${Date.now()}`,
      details: `Official session terminated for ${officer.name} (${officer.title}).`
    };
    syncState(units, [auditItem, ...auditLogs]);
    showToast("info", `Signed out of ${officer.name}'s session.`);
  };

  // Switch Active Officer
  const handleSwitchOfficer = (targetOfficer: MockOfficer) => {
    handleAuthenticateOfficer(targetOfficer.email);
  };

  // All categories and rules
  const allCategories = useMemo(() => getStatutoryCategories(), []);
  const allRules = useMemo(() => getAllStatutoryRules(), []);
  const availableRulesForCategory = useMemo(() => {
    return getRulesByCategory(newCategoryCode);
  }, [newCategoryCode]);

  // Subclasses available within current category
  const availableSubclasses = useMemo(() => {
    const map = new Map<string, { code: string; label: string }>();
    for (const r of availableRulesForCategory) {
      if (r.subclassification_code) {
        if (!map.has(r.subclassification_code)) {
          map.set(r.subclassification_code, {
            code: r.subclassification_code,
            label: r.subclassification_label ?? r.subcategory
          });
        }
      }
    }
    return Array.from(map.values());
  }, [availableRulesForCategory]);

  // Tertiary classification rules available within selected sub-classification
  const availableTertiaryRules = useMemo(() => {
    if (!newSubclassCode) return [];
    return availableRulesForCategory.filter(
      (r) => r.subclassification_code === newSubclassCode && r.statutory_tertiary_code
    );
  }, [availableRulesForCategory, newSubclassCode]);

  const handleCategoryChange = (catCode: string) => {
    setNewCategoryCode(catCode);
    const catRules = getRulesByCategory(catCode);
    const subMap = new Map<string, string>();
    for (const r of catRules) {
      if (r.subclassification_code) {
        subMap.set(r.subclassification_code, r.subclassification_label ?? r.subcategory);
      }
    }
    const subList = Array.from(subMap.keys());
    if (subList.length === 0) {
      // Direct category rate (Categories 7-11)
      setNewSubclassCode("");
      setNewTertiaryCode("");
      if (catRules[0]) setNewRuleId(catRules[0].rule_id);
    } else {
      const firstSub = subList[0]!;
      setNewSubclassCode(firstSub);
      const tertRules = catRules.filter(
        (r) => r.subclassification_code === firstSub && r.statutory_tertiary_code
      );
      if (tertRules.length > 0) {
        setNewTertiaryCode(tertRules[0]!.statutory_tertiary_code!);
        setNewRuleId(tertRules[0]!.rule_id);
      } else {
        setNewTertiaryCode("");
        const matched = catRules.find((r) => r.subclassification_code === firstSub);
        if (matched) setNewRuleId(matched.rule_id);
      }
    }
  };

  const handleSubclassChange = (subCode: string) => {
    setNewSubclassCode(subCode);
    const tertRules = availableRulesForCategory.filter(
      (r) => r.subclassification_code === subCode && r.statutory_tertiary_code
    );
    if (tertRules.length > 0) {
      setNewTertiaryCode(tertRules[0]!.statutory_tertiary_code!);
      setNewRuleId(tertRules[0]!.rule_id);
    } else {
      setNewTertiaryCode("");
      const matched = availableRulesForCategory.find((r) => r.subclassification_code === subCode);
      if (matched) setNewRuleId(matched.rule_id);
    }
  };

  const handleTertiaryChange = (tertCode: string) => {
    setNewTertiaryCode(tertCode);
    const matched = availableTertiaryRules.find((r) => r.statutory_tertiary_code === tertCode);
    if (matched) setNewRuleId(matched.rule_id);
  };

  const selectedStatutoryRule = useMemo(() => {
    return getStatutoryRuleById(newRuleId) ?? availableRulesForCategory[0];
  }, [newRuleId, availableRulesForCategory]);

  const previewUin = useMemo(() => {
    if (!selectedStatutoryRule) return "";
    try {
      return generateUinForUnit({
        jurisdiction: VEHARI_PILOT_JURISDICTION,
        rule: selectedStatutoryRule,
        allRules,
        sequenceNumber: units.length + 1
      });
    } catch {
      return "";
    }
  }, [selectedStatutoryRule, allRules, units.length]);

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
          ruleCode: rule.rule_code,
          subclassificationCode: rule.subclassification_code,
          statutoryTertiaryCode: rule.statutory_tertiary_code,
          rateSourceLevel: rule.rate_source_level
        }
      },
      actor
    );

    const provincialUin = generateUinForUnit({
      jurisdiction: VEHARI_PILOT_JURISDICTION,
      rule,
      allRules,
      sequenceNumber: units.length + 1
    });

    const newUnit: StoredUnit = {
      id: unitId,
      legalName: newLegalName.trim(),
      tradeName: newTradeName.trim() || undefined,
      identifierType: newIdentifierType,
      identifierValue: newIdentifierValue.trim(),
      address: newAddress.trim() || "Tehsil Vehari, Punjab",
      circleId: CIRCLE_VEHARI_ID,
      categoryCode: rule.category_code,
      subclassificationCode: rule.subclassification_code,
      statutoryTertiaryCode: rule.statutory_tertiary_code,
      statutoryRuleId: rule.rule_id,
      statutoryRule: rule,
      provincialUin,
      demandUnit: {
        id: demandUnitId,
        taxpayerId: unitId,
        permanentDemandNo: String(units.length + 1).padStart(4, "0"),
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
      details: `Registered unit under Class ${rule.rule_code} (${rule.category}) with PIN ${provincialUin} at official statutory rate PKR ${rule.annual_rate_pkr.toLocaleString()}`
    };

    const updated = [newUnit, ...units];
    const updatedAudits = [auditItem, ...auditLogs];
    syncState(updated, updatedAudits);

    // Reset Form
    setNewLegalName("");
    setNewTradeName("");
    setNewIdentifierValue("");
    setNewAddress("");
    setNewCategoryCode("3");
    setNewSubclassCode("3(i)");
    setNewTertiaryCode("3(i)(b)");
    setNewRuleId("PFT-3.i.b");
    setShowAddUnitModal(false);
    setSelectedUnitId(unitId);
    showToast(
      "success",
      `Unit '${newUnit.legalName}' successfully registered under Class ${rule.rule_code} (UIN: ${provincialUin}, PKR ${rule.annual_rate_pkr})`
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
    const authCheck = verifyOfficerAuthority(officer, "APPROVE_ASSESSMENT");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason!);
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
    const authCheck = verifyOfficerAuthority(officer, "RETURN_ASSESSMENT");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason!);
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
    const existing = pft2Challans.find((c) => c.unitId === activeUnit.id);
    if (existing) {
      return generateFormPFT2(activeUnit, {
        isTampered,
        tamperedAmount,
        noticeNumber: existing.noticeNumber,
        pin: existing.pin,
        dueDate: existing.dueDate,
        issueDate: existing.issueDate,
        formType: existing.formType,
        demandScope: existing.demandScope,
        paymentScope: existing.paymentScope,
        customAmount: existing.amountPayable
      });
    }
    return generateFormPFT2(activeUnit, isTampered, tamperedAmount);
  }, [activeUnit, isTampered, tamperedAmount, pft2Challans]);

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

  // Phase 7: Executive MIS Analytics Metrics
  const misMetrics: ExecutiveMetrics = useMemo(() => {
    return computeExecutiveMetrics(
      units,
      appeals,
      discontinuances,
      refundAdjustments,
      clearanceCertificates
    );
  }, [units, appeals, discontinuances, refundAdjustments, clearanceCertificates]);

  // Phase 9: Effective Perspective for Analytics Dashboard
  const effectivePerspective: "INSPECTOR" | "ETO" | "DIRECTOR" =
    dashboardPerspective === "AUTO" ? officer.role : dashboardPerspective;

  // Phase 9: Normalized search and filtered lists for Statutory Reports
  const normalizedReportSearch = reportSearchQuery.trim().toLowerCase();

  const filteredPft3Units = useMemo(() => {
    if (!normalizedReportSearch) return units;
    return units.filter(
      (u) =>
        u.legalName.toLowerCase().includes(normalizedReportSearch) ||
        (u.tradeName ?? "").toLowerCase().includes(normalizedReportSearch) ||
        u.demandUnit.permanentDemandNo.toLowerCase().includes(normalizedReportSearch) ||
        (u.provincialUin?.toLowerCase().includes(normalizedReportSearch) ?? false) ||
        u.identifierValue.toLowerCase().includes(normalizedReportSearch) ||
        u.statutoryRule.category.toLowerCase().includes(normalizedReportSearch) ||
        (u.statutoryRule.subclassification_code?.toLowerCase().includes(normalizedReportSearch) ??
          false) ||
        u.statutoryRule.rule_code.toLowerCase().includes(normalizedReportSearch)
    );
  }, [units, normalizedReportSearch]);

  const filteredDefaulterUnits = useMemo(() => {
    const defaulters = units.filter((u) => computeLedgerBalance(u.ledgerEntries) > 0);
    if (!normalizedReportSearch) return defaulters;
    return defaulters.filter(
      (u) =>
        u.legalName.toLowerCase().includes(normalizedReportSearch) ||
        (u.tradeName ?? "").toLowerCase().includes(normalizedReportSearch) ||
        u.demandUnit.permanentDemandNo.toLowerCase().includes(normalizedReportSearch) ||
        (u.provincialUin?.toLowerCase().includes(normalizedReportSearch) ?? false) ||
        u.identifierValue.toLowerCase().includes(normalizedReportSearch)
    );
  }, [units, normalizedReportSearch]);

  const filteredDispatchRows = useMemo(() => {
    const rows = circleDispatchRegisterData.rows;
    if (!normalizedReportSearch) return rows;
    return rows.filter(
      (r) =>
        r.assesseeLegalName.toLowerCase().includes(normalizedReportSearch) ||
        (r.assesseeTradeName ?? "").toLowerCase().includes(normalizedReportSearch) ||
        r.noticeNumber.toLowerCase().includes(normalizedReportSearch) ||
        r.demandNumber.toLowerCase().includes(normalizedReportSearch) ||
        r.serviceStatus.toLowerCase().includes(normalizedReportSearch)
    );
  }, [circleDispatchRegisterData.rows, normalizedReportSearch]);

  const filteredClearanceCerts = useMemo(() => {
    if (!normalizedReportSearch) return clearanceCertificates;
    return clearanceCertificates.filter(
      (c) =>
        c.assesseeLegalName.toLowerCase().includes(normalizedReportSearch) ||
        (c.assesseeTradeName ?? "").toLowerCase().includes(normalizedReportSearch) ||
        c.certificateNumber.toLowerCase().includes(normalizedReportSearch) ||
        c.cnicOrNtn.toLowerCase().includes(normalizedReportSearch)
    );
  }, [clearanceCertificates, normalizedReportSearch]);

  const filteredReliefRecords = useMemo(() => {
    type ReliefRow = {
      id: string;
      reliefType: "RULE_10_DISCONTINUANCE" | "RULE_5_REFUND_CREDIT";
      unitId: string;
      legalName: string;
      effectiveDate: string;
      statutoryReason: string;
      amountAdjustedPkr: number;
      approvedByEto: string;
      status: string;
    };
    const rows: ReliefRow[] = [];
    for (const d of discontinuances) {
      const u = units.find((x) => x.id === d.unitId);
      rows.push({
        id: d.id,
        reliefType: "RULE_10_DISCONTINUANCE",
        unitId: d.unitId,
        legalName: u?.legalName ?? d.assesseeLegalName,
        effectiveDate: d.discontinuanceDate,
        statutoryReason: d.reason,
        amountAdjustedPkr: 0,
        approvedByEto: d.adjudicatedBy ?? "ETO Vehari",
        status: d.status
      });
    }
    for (const r of refundAdjustments) {
      const u = units.find((x) => x.id === r.unitId);
      rows.push({
        id: r.id,
        reliefType: "RULE_5_REFUND_CREDIT",
        unitId: r.unitId,
        legalName: u?.legalName ?? r.assesseeLegalName,
        effectiveDate: r.orderDate ?? r.filedAt,
        statutoryReason: r.grounds,
        amountAdjustedPkr: r.amount,
        approvedByEto: r.adjudicatedBy ?? "ETO Vehari",
        status: r.status
      });
    }
    if (!normalizedReportSearch) return rows;
    return rows.filter(
      (r) =>
        r.legalName.toLowerCase().includes(normalizedReportSearch) ||
        r.statutoryReason.toLowerCase().includes(normalizedReportSearch) ||
        r.reliefType.toLowerCase().includes(normalizedReportSearch) ||
        r.status.toLowerCase().includes(normalizedReportSearch)
    );
  }, [discontinuances, refundAdjustments, units, normalizedReportSearch]);

  // Phase 9: Helpers for Statutory Reports Export & Print
  const handleExportActiveReportCsv = () => {
    switch (activeReportTab) {
      case "PFT3_REGISTER":
        downloadCsvFile("PFT-3_Assessment_Register_Vehari_2026.csv", exportPft3RegisterCsv(units));
        showToast("success", "Form P.F.T-3 Register CSV downloaded.");
        break;
      case "DEFAULTER_ROLL":
        downloadCsvFile(
          "PTAS_Defaulter_Arrears_Roll_Vehari_2026.csv",
          exportDefaulterRecoveryCsv(units)
        );
        showToast("success", "Defaulter & Arrears Recovery Roll CSV downloaded.");
        break;
      case "NOTICE_DISPATCH":
        downloadCsvFile(
          "Notice_Dispatch_Service_Register_Vehari_2026.csv",
          exportNoticeDispatchCsv(units)
        );
        showToast("success", "Notice Dispatch & Service Register CSV downloaded.");
        break;
      case "CLEARANCE_LOG":
        downloadCsvFile(
          "Tax_Clearance_Certificates_Log_Vehari_2026.csv",
          exportClearanceCertificatesCsv(clearanceCertificates)
        );
        showToast("success", "Tax Clearance Certificates Log CSV downloaded.");
        break;
      case "RELIEF_REGISTER":
        downloadCsvFile(
          "Statutory_Relief_Adjustment_Register_Vehari_2026.csv",
          exportReliefAdjustmentsCsv(discontinuances, refundAdjustments)
        );
        showToast("success", "Statutory Relief & Adjustment Register CSV downloaded.");
        break;
      case "SLAB_DISTRIBUTION":
        downloadCsvFile(
          "PTAS_Statutory_Slab_Distribution_Vehari_2026.csv",
          exportStatutorySlabDistributionCsv(misMetrics.slabYields, "2024-2025")
        );
        showToast("success", "Statutory Slabs & Tertiary Distribution CSV downloaded.");
        break;
    }
  };

  const handlePrintActiveReport = () => {
    setExecutiveReportType(activeReportTab);
    setShowExecutivePrintModal(true);
  };

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
    const authCheck = verifyOfficerAuthority(officer, "SCHEDULE_APPEAL_HEARING");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason!);
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
    const authCheck = verifyOfficerAuthority(officer, "ADJUDICATE_APPEAL");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason!);
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

  // --- Phase 6: Clearance Certificates (Form P.F.T-5) Handlers ---
  const handleOpenClearanceCertificate = (targetUnit: StoredUnit) => {
    const cert = generateTaxClearanceCertificate(targetUnit, officer, FINANCIAL_YEAR_2026_27);
    if (!cert.isEligible) {
      showToast("error", cert.ineligibilityReason || "Tax clearance is not eligible.");
      return;
    }

    const authCheck = verifyOfficerAuthority(officer, "ISSUE_CLEARANCE_CERTIFICATE");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason || "Unauthorized to issue clearance certificate");
      return;
    }

    setActiveClearanceCert(cert);
    setShowClearanceModal(true);

    // Record certificate in store if not present
    if (!clearanceCertificates.some((c) => c.unitId === targetUnit.id)) {
      const newCertRecord: ClearanceCertificateRecord = {
        id: `cert-${Date.now()}`,
        certificateNumber: cert.certificateNumber,
        unitId: targetUnit.id,
        assesseeLegalName: cert.assesseeLegalName,
        assesseeTradeName: cert.assesseeTradeName,
        cnicOrNtn: cert.identifierValue,
        categoryName: cert.categoryName,
        scheduleEntry: cert.scheduleEntry,
        financialYear: cert.financialYear,
        issueDate: cert.issueDate,
        validUntil: cert.expiryDate,
        issuedByOfficerId: officer.id,
        issuedByOfficerName: officer.name,
        issuedByOfficerTitle: officer.title,
        officialSha256: cert.officialSha256,
        qrPayload: cert.qrPayload,
        clearedAmountPkr: cert.totalTaxPaid
      };
      const auditItem: PilotAuditItem = {
        id: `audit-${Date.now()}`,
        eventType: "CLEARANCE_CERTIFICATE_ISSUED",
        actorName: officer.name,
        actorRole: officer.role,
        target: targetUnit.legalName,
        timestamp: new Date().toISOString(),
        correlationId: `corr-cert-${Date.now()}`,
        details: `Issued Form P.F.T-5 Professional Tax Clearance Certificate (${cert.certificateNumber}) under seal of ${officer.name}. Verified zero arrears. SHA-256: ${cert.officialSha256.slice(0, 16)}...`
      };
      syncState(units, [auditItem, ...auditLogs], undefined, undefined, undefined, undefined, [
        newCertRecord,
        ...clearanceCertificates
      ]);
    }
  };

  // --- Phase 6: Rule 10 Discontinuance Handlers ---
  const handleFileDiscontinuance = () => {
    const targetUnit = units.find((u) => u.id === discUnitId);
    if (!targetUnit) {
      showToast("error", "Please select a tax unit.");
      return;
    }
    if (!discReason.trim()) {
      showToast("error", "Please provide reasons for discontinuance.");
      return;
    }

    const newDiscRecord: DiscontinuanceRecord = {
      id: `disc-${Date.now()}`,
      noticeNumber: `DISC-VEH-2026-${Math.floor(Math.random() * 900 + 100)}`,
      unitId: targetUnit.id,
      assesseeLegalName: targetUnit.legalName,
      assesseeTradeName: targetUnit.tradeName,
      cnicOrNtn: targetUnit.identifierValue,
      discontinuanceDate: discDate,
      reason: discReason.trim(),
      evidenceDetails: discEvidence.trim(),
      status: "PENDING_INSPECTION",
      filedAt: new Date().toISOString(),
      filedBy: officer.id
    };

    const updatedUnit: StoredUnit = {
      ...targetUnit,
      discontinuanceStatus: "PENDING_INSPECTION",
      discontinuanceDate: discDate,
      discontinuanceReason: discReason.trim()
    };

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "DISCONTINUANCE_NOTICE_FILED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-disc-${Date.now()}`,
      details: `Filed Rule 10 Notice of Discontinuance (${newDiscRecord.noticeNumber}) for ${targetUnit.legalName}. Assigned to Circle Inspector for on-site inspection.`
    };

    const updatedUnits = units.map((u) => (u.id === targetUnit.id ? updatedUnit : u));
    syncState(updatedUnits, [auditItem, ...auditLogs], undefined, undefined, [
      newDiscRecord,
      ...discontinuances
    ]);
    setShowFileDiscontinuanceModal(false);
    showToast("success", `Rule 10 Discontinuance Notice filed: ${newDiscRecord.noticeNumber}`);
  };

  const handleOpenDiscontinuanceInspection = (disc: DiscontinuanceRecord) => {
    const authCheck = verifyOfficerAuthority(officer, "SUBMIT_DISCONTINUANCE_INSPECTION");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason || "Unauthorized");
      return;
    }
    setTargetDiscId(disc.id);
    setShowDiscontinuanceInspectionModal(true);
  };

  const handleSaveDiscontinuanceInspection = () => {
    const disc = discontinuances.find((d) => d.id === targetDiscId);
    if (!disc) return;

    const updatedDisc: DiscontinuanceRecord = {
      ...disc,
      status: "INSPECTED",
      inspectorReport: discInspectorFindings.trim(),
      inspectedAt: new Date().toISOString(),
      inspectedBy: officer.id
    };

    const targetUnit = units.find((u) => u.id === disc.unitId);
    const updatedUnits = targetUnit
      ? units.map((u) =>
          u.id === targetUnit.id ? { ...u, discontinuanceStatus: "INSPECTED" as const } : u
        )
      : units;

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "DISCONTINUANCE_INSPECTION_RECORDED",
      actorName: officer.name,
      actorRole: officer.role,
      target: disc.assesseeLegalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-insp-${Date.now()}`,
      details: `Recorded Rule 10 field inspection findings for ${disc.noticeNumber}. Premises verified by Inspector Muhammad Aslam. Forwarded to ETO for final closure order.`
    };

    const updatedDiscs = discontinuances.map((d) => (d.id === targetDiscId ? updatedDisc : d));
    syncState(updatedUnits, [auditItem, ...auditLogs], undefined, undefined, updatedDiscs);
    setShowDiscontinuanceInspectionModal(false);
    showToast("success", "Field inspection findings submitted to Assessing Authority (ETO).");
  };

  const handleOpenDiscontinuanceOrder = (disc: DiscontinuanceRecord) => {
    const authCheck = verifyOfficerAuthority(officer, "ADJUDICATE_DISCONTINUANCE");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason || "Unauthorized");
      return;
    }
    setTargetDiscId(disc.id);
    setShowDiscontinuanceOrderModal(true);
  };

  const handleSaveDiscontinuanceOrder = (decision: "APPROVED" | "REJECTED") => {
    const disc = discontinuances.find((d) => d.id === targetDiscId);
    if (!disc) return;
    const targetUnit = units.find((u) => u.id === disc.unitId);
    if (!targetUnit) return;

    const orderNumber = `ETO/VEH/DISC/2026/${disc.id.slice(-4)}`;
    const orderDate = new Date().toISOString().split("T")[0]!;

    const orderDoc = generateDiscontinuanceOrder(targetUnit, {
      orderNumber,
      orderDate,
      noticeNumber: disc.noticeNumber,
      discontinuanceDate: disc.discontinuanceDate,
      reason: disc.reason,
      inspectorFindings: disc.inspectorReport || "Premises verified closed.",
      etoDecision: decision,
      etoReason: discEtoReason.trim()
    });

    const updatedDisc: DiscontinuanceRecord = {
      ...disc,
      status: decision,
      etoOrderNumber: orderNumber,
      etoOrderDate: orderDate,
      etoDecision: decision,
      etoReason: discEtoReason.trim(),
      adjudicatedBy: officer.id
    };

    const updatedUnits = units.map((u) =>
      u.id === targetUnit.id
        ? {
            ...u,
            isDiscontinued: decision === "APPROVED",
            discontinuanceStatus: (decision === "APPROVED"
              ? "DISCONTINUED"
              : "ACTIVE") as StoredUnit["discontinuanceStatus"]
          }
        : u
    );

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "DISCONTINUANCE_ADJUDICATED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-order-${Date.now()}`,
      details: `Issued Statutory Order under Rule 10 (${orderNumber}). Decision: ${decision}. Assessment status updated. SHA-256: ${orderDoc.officialSha256.slice(0, 16)}...`
    };

    const updatedDiscs = discontinuances.map((d) => (d.id === targetDiscId ? updatedDisc : d));
    syncState(updatedUnits, [auditItem, ...auditLogs], undefined, undefined, updatedDiscs);
    setActiveDiscontinuanceOrder(orderDoc);
    showToast("success", `Rule 10 Order ${orderNumber} passed (${decision}).`);
  };

  // --- Phase 6: Rule 5 Refund & Adjustment Handlers ---
  const handleFileRefundApplication = () => {
    const targetUnit = units.find((u) => u.id === refUnitId);
    if (!targetUnit) {
      showToast("error", "Please select a tax unit.");
      return;
    }
    if (refAmount <= 0) {
      showToast("error", "Adjustment/refund amount must be greater than zero.");
      return;
    }
    if (!refGrounds.trim()) {
      showToast("error", "Please state the legal grounds for refund/adjustment.");
      return;
    }

    const appNumber = `REF-VEH-2026-${Math.floor(Math.random() * 900 + 100)}`;
    const newRefundRecord: RefundAdjustmentRecord = {
      id: `ref-${Date.now()}`,
      applicationNumber: appNumber,
      unitId: targetUnit.id,
      assesseeLegalName: targetUnit.legalName,
      assesseeTradeName: targetUnit.tradeName,
      cnicOrNtn: targetUnit.identifierValue,
      type: refType,
      amount: refAmount,
      grounds: refGrounds.trim(),
      evidenceReference: refEvidence.trim(),
      status: "PENDING_REVIEW",
      filedAt: new Date().toISOString(),
      filedBy: officer.id
    };

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "REFUND_APPLICATION_FILED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-refapp-${Date.now()}`,
      details: `Filed Rule 5 application (${appNumber}) for ${refType} of PKR ${refAmount.toLocaleString()} for ${targetUnit.legalName}.`
    };

    syncState(units, [auditItem, ...auditLogs], undefined, undefined, undefined, [
      newRefundRecord,
      ...refundAdjustments
    ]);
    setShowRefundModal(false);
    showToast("success", `Rule 5 application ${appNumber} submitted for ETO scrutiny.`);
  };

  const handleAdjudicateRefund = (
    record: RefundAdjustmentRecord,
    decision: "APPROVED" | "REJECTED"
  ) => {
    const authCheck = verifyOfficerAuthority(officer, "ADJUDICATE_REFUND");
    if (!authCheck.authorized) {
      showToast("error", authCheck.reason || "Unauthorized");
      return;
    }

    const targetUnit = units.find((u) => u.id === record.unitId);
    if (!targetUnit) {
      showToast("error", "Unit not found.");
      return;
    }

    const orderNumber = `ETO/VEH/ADJ/2026/${record.id.slice(-4)}`;
    const orderDate = new Date().toISOString().split("T")[0]!;

    const updatedLedgerEntries = [...targetUnit.ledgerEntries];
    let adjEntryId: string | undefined;

    if (decision === "APPROVED") {
      // Append-only MANUAL_ADJUSTMENT entry (-amount credit)
      const adjEntry = createDemandLedgerEntry({
        demandUnitId: targetUnit.demandUnit.id,
        financialYearId: FINANCIAL_YEAR_2026_27,
        entryType: "MANUAL_ADJUSTMENT",
        amount: -record.amount,
        sourceType: "RULE_5_REFUND_ADJUSTMENT",
        sourceId: record.id,
        idempotencyKey: `idem-ref-${record.id}`,
        correlationId: `corr-ref-${Date.now()}`,
        postedBy: officer.id,
        metadata: {
          applicationNumber: record.applicationNumber,
          grounds: record.grounds,
          adjudicatedBy: officer.name
        }
      });
      updatedLedgerEntries.push(adjEntry);
      adjEntryId = adjEntry.id;
    }

    const orderDoc = generateRefundAdjustmentOrder(targetUnit, {
      orderNumber,
      orderDate,
      applicationNumber: record.applicationNumber,
      type: record.type,
      amount: record.amount,
      grounds: record.grounds,
      evidenceRef: record.evidenceReference
    });

    const updatedRecord: RefundAdjustmentRecord = {
      ...record,
      status: decision,
      orderNumber,
      orderDate,
      adjudicatedBy: officer.id,
      ledgerEntryId: adjEntryId
    };

    const updatedUnits = units.map((u) =>
      u.id === targetUnit.id
        ? {
            ...u,
            ledgerEntries: updatedLedgerEntries
          }
        : u
    );

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "REFUND_ADJUSTMENT_POSTED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-refadj-${Date.now()}`,
      details: `Rule 5 order ${orderNumber} adjudicated as ${decision}. ${
        decision === "APPROVED"
          ? `Balanced credit adjustment of PKR ${record.amount.toLocaleString()} posted to demand ledger.`
          : "Application rejected."
      } SHA-256: ${orderDoc.officialSha256.slice(0, 16)}...`
    };

    const updatedRefunds = refundAdjustments.map((r) => (r.id === record.id ? updatedRecord : r));
    syncState(
      updatedUnits,
      [auditItem, ...auditLogs],
      undefined,
      undefined,
      undefined,
      updatedRefunds
    );
    setActiveRefundOrder(orderDoc);
    setShowRefundOrderModal(true);
    showToast("success", `Rule 5 order ${orderNumber} recorded (${decision}).`);
  };

  // Phase 8: Public Assessee Portal & Real-Time QR Verification Handlers
  const handleVerifyDocument = (overrideInput?: string) => {
    const input = overrideInput ?? portalVerificationInput;
    if (!input.trim()) {
      showToast("error", "Please enter a document reference or scan a QR payload.");
      return;
    }
    const result = verifyStatutoryDocument(
      input,
      units,
      clearanceCertificates,
      statutoryReceipts,
      pft2Challans
    );
    setPortalVerificationResult(result);
    if (result.isValid) {
      showToast("success", `✓ Authentic: ${result.title}`);
    } else {
      showToast("error", `Notice: ${result.title}`);
    }
  };

  // Phase 10: PFT-2 Challan Management & Statutory Receipt Handlers
  const handleOpenReceivePft2 = (challan: Pft2ChallanRecord) => {
    setReceivingChallan(challan);
    setReceivePaymentChannel(challan.paymentChannel || "National Bank of Pakistan");
    setReceiveBankBranch("Main Treasury Branch, Vehari (Treasury 0142)");
    setReceiveBankScrollRef(`NBP-CPR-2026-${Math.floor(10000 + Math.random() * 90000)}`);

    // Constrain initial receipt date between challan issue date and due date
    const today = new Date().toISOString().split("T")[0]!;
    let initialDate = today;
    if (challan.issueDate && initialDate < challan.issueDate) {
      initialDate = challan.issueDate;
    } else if (challan.dueDate && initialDate > challan.dueDate) {
      initialDate = challan.dueDate;
    }
    setReceiveDate(initialDate);
    setReceiveRemarks("Discharged in full at authorized treasury counter under Rule 10.");
    setShowReceivePft2Modal(true);
  };

  const handleConfirmReceivePft2 = () => {
    if (!receivingChallan) return;

    // Statutory Rule: Challan payable amount cannot be altered during receipting
    const payableAmount = receivingChallan.amountPayable;
    if (payableAmount <= 0) {
      showToast("error", "Challan payable amount must be greater than zero.");
      return;
    }

    // Statutory Rule: Receipt date must strictly be between challan issue date and due date
    if (receivingChallan.issueDate && receiveDate < receivingChallan.issueDate) {
      showToast(
        "error",
        `Receipt date cannot be earlier than Challan Issue Date (${receivingChallan.issueDate}).`
      );
      return;
    }
    if (receivingChallan.dueDate && receiveDate > receivingChallan.dueDate) {
      showToast(
        "error",
        `Receipt date cannot be later than Challan Due Date (${receivingChallan.dueDate}). Payment on expired challans cannot be accepted directly.`
      );
      return;
    }

    if (!receiveBankScrollRef.trim()) {
      showToast("error", "Bank Scroll / CPR Reference is mandatory.");
      return;
    }

    const receiptSeq = String(statutoryReceipts.length + 1).padStart(5, "0");
    const receiptNumber = formatStandardDocNumber({ docCode: "RCPT", sequence: receiptSeq });
    const nowTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    // 1. Create Receipt Record with locked statutory amount and validated date
    const newReceipt: StatutoryReceiptRecord = {
      id: `rec-${Date.now()}`,
      receiptNumber,
      challanNumber: receivingChallan.challanNumber,
      demandNumber: receivingChallan.demandNumber,
      unitId: receivingChallan.unitId,
      assesseeLegalName: receivingChallan.legalName,
      assesseeTradeName: receivingChallan.tradeName,
      identifierType: receivingChallan.identifierType,
      identifierValue: receivingChallan.identifierValue,
      address: receivingChallan.address,
      statutoryCategory: receivingChallan.category,
      subclassificationCode: receivingChallan.subclassificationCode,
      tertiarySlab: receivingChallan.tertiarySlab,
      amountPaidPkr: payableAmount,
      amountPaidWords: numberToWordsPkr(payableAmount),
      dateOfReceipt: receiveDate,
      timeOfReceipt: nowTime,
      paymentChannel: receivePaymentChannel,
      bankBranch: receiveBankBranch,
      bankScrollRef: receiveBankScrollRef.trim(),
      receivingOfficerName: officer.name,
      receivingOfficerTitle: officer.title,
      pin: generateDocumentPin(receiptNumber),
      officialSha256: `sha256-receipt-${receiptNumber}-${Date.now()}`,
      qrPayload: `https://ptas.punjab.gov.pk/verify?type=PFT-REC&ref=${receiptNumber}&pdn=${receivingChallan.demandNumber}&amt=${payableAmount}`,
      remarks: receiveRemarks
    };

    // 2. Update Challan status
    const updatedChallans = pft2Challans.map((c) =>
      c.id === receivingChallan.id
        ? {
            ...c,
            status: "RECEIVED" as Pft2Status,
            receiptNumber,
            receivedAt: receiveDate,
            receivedBy: `${officer.name} (${officer.title})`,
            paymentChannel: receivePaymentChannel,
            bankScrollRef: receiveBankScrollRef.trim()
          }
        : c
    );

    // 3. Post PAYMENT_CREDIT to Unit's Demand Ledger
    const targetUnit = units.find((u) => u.id === receivingChallan.unitId);
    let updatedUnits = units;
    if (targetUnit) {
      const paymentEntry = createPaymentReceiptEntry({
        demandUnitId: targetUnit.demandUnit.id,
        amount: payableAmount,
        financialYearId: "2026-2027",
        receiptNumber,
        paymentChannel: receivePaymentChannel.includes("ePay") ? "EPAY_PUNJAB" : "CHALLAN_32A",
        actorId: officer.id,
        correlationId: `corr-${receiptNumber}`,
        idempotencyKey: `idem-${receiptNumber}`,
        depositDate: receiveDate
      });
      const updatedUnit: StoredUnit = {
        ...targetUnit,
        ledgerEntries: [...targetUnit.ledgerEntries, paymentEntry]
      };
      updatedUnits = units.map((u) => (u.id === targetUnit.id ? updatedUnit : u));
    }

    // 4. Record Audit Log
    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "CHALLAN_RECEIVED_CONVERTED_TO_RECEIPT",
      actorName: officer.name,
      actorRole: officer.role,
      target: receivingChallan.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-${receiptNumber}`,
      details: `Form P.F.T-2 ${receivingChallan.challanNumber} received and credited (PKR ${payableAmount.toLocaleString()}) via ${receivePaymentChannel} [CPR: ${receiveBankScrollRef}]. Generated Statutory Receipt ${receiptNumber}.`
    };

    const updatedReceipts = [newReceipt, ...statutoryReceipts];
    const updatedAudits = [auditItem, ...auditLogs];

    syncState(
      updatedUnits,
      updatedAudits,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      updatedChallans,
      updatedReceipts
    );

    setShowReceivePft2Modal(false);
    setReceivingChallan(null);
    showToast(
      "success",
      `✓ Challan ${receivingChallan.challanNumber} received! Statutory Receipt ${receiptNumber} generated.`
    );

    // Automatically display the new Receipt document
    setActiveReceiptRecord(newReceipt);
    setShowReceiptDocumentModal(true);
  };

  const handleOpenCancelPft2 = (challan: Pft2ChallanRecord) => {
    setCancellingChallan(challan);
    setCancelPft2Reason("Superseded by revised assessment under Rule 12");
    setShowCancelPft2Modal(true);
  };

  const handleConfirmCancelPft2 = () => {
    if (!cancellingChallan) return;
    if (!cancelPft2Reason.trim()) {
      showToast("error", "Cancellation justification is required by statutory audit rules.");
      return;
    }

    const updatedChallans = pft2Challans.map((c) =>
      c.id === cancellingChallan.id
        ? {
            ...c,
            status: "CANCELLED" as Pft2Status,
            cancelledReason: cancelPft2Reason.trim(),
            cancelledAt: new Date().toISOString().split("T")[0]!,
            cancelledBy: `${officer.name} (${officer.title})`
          }
        : c
    );

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "CHALLAN_CANCELLED",
      actorName: officer.name,
      actorRole: officer.role,
      target: cancellingChallan.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-cancel-${cancellingChallan.challanNumber}`,
      details: `Form P.F.T-2 ${cancellingChallan.challanNumber} marked CANCELLED. Reason: ${cancelPft2Reason}`
    };

    syncState(
      units,
      [auditItem, ...auditLogs],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      updatedChallans,
      statutoryReceipts
    );

    setShowCancelPft2Modal(false);
    setCancellingChallan(null);
    showToast("info", `Challan ${cancellingChallan.challanNumber} marked CANCELLED.`);
  };

  const handleExportPft2Csv = () => {
    const csv = exportPft2ChallansCsv(pft2Challans);
    downloadCsvFile(
      csv,
      `PTAS_PFT2_Challans_Register_${new Date().toISOString().split("T")[0]}.csv`
    );
    showToast("success", `✓ Exported ${pft2Challans.length} PFT-2 Challan records to CSV.`);
  };

  const handleExportReceiptsCsv = () => {
    const csv = exportStatutoryReceiptsCsv(statutoryReceipts);
    downloadCsvFile(
      csv,
      `PTAS_Statutory_Receipts_Ledger_${new Date().toISOString().split("T")[0]}.csv`
    );
    showToast(
      "success",
      `✓ Exported ${statutoryReceipts.length} Statutory Receipt records to CSV.`
    );
  };

  const handleOpenReceiptDocument = (receipt: StatutoryReceiptRecord) => {
    setActiveReceiptRecord(receipt);
    setShowReceiptDocumentModal(true);
  };

  const handleOpenIssuePft2Modal = (unitId?: string) => {
    const targetId = unitId || (units[0]?.id ?? "");
    setIssuePft2UnitId(targetId);
    setIssuePft2DueDate("2026-08-31");
    setIssuePft2IssueDate(new Date().toISOString().split("T")[0] || "2026-09-20");
    setIssuePft2FormType("STANDARD");
    setIssuePft2DemandScope("CURRENT");
    setIssuePft2PaymentScope("FULL");
    const u = units.find((x) => x.id === targetId);
    const assessed = u?.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
    setIssuePft2PartialAmount(Math.round(assessed / 2));
    setShowIssuePft2Modal(true);
  };

  const handleConfirmIssuePft2 = () => {
    const targetUnit = units.find((u) => u.id === issuePft2UnitId);
    if (!targetUnit) {
      showToast("error", "Please select a valid taxpayer establishment.");
      return;
    }

    const latestVersion = targetUnit.assessmentVersions[0];
    const baseTax = latestVersion?.snapshot.taxAmount ?? 0;
    let penalty = 0;
    for (const entry of targetUnit.ledgerEntries) {
      if (entry.entryType === "PENALTY_DEMAND") {
        penalty += entry.amount;
      }
    }
    const fullAssessed = baseTax + penalty;

    const isPartial = issuePft2PaymentScope === "PARTIAL";
    if (isPartial && (issuePft2PartialAmount <= 0 || issuePft2PartialAmount > fullAssessed)) {
      showToast(
        "error",
        `Partial amount must be greater than PKR 0 and cannot exceed the total assessed demand of PKR ${fullAssessed.toLocaleString()}.`
      );
      return;
    }

    const amountPayable = isPartial ? issuePft2PartialAmount : fullAssessed;
    const remainingBalance = isPartial ? Math.max(0, fullAssessed - amountPayable) : 0;

    const noticeNumber = generatePft2NoticeNumber({
      demandNumber: targetUnit.demandUnit.permanentDemandNo,
      issueDate: issuePft2IssueDate,
      formTypeCode: issuePft2FormType,
      demandScope: issuePft2DemandScope,
      paymentScope: issuePft2PaymentScope,
      amount: amountPayable
    });

    const pin = generateDocumentPin(noticeNumber);
    const nextSeq = pft2Challans.length + 1;
    const challanNumber = formatStandardDocNumber({ docCode: "PFT2", sequence: nextSeq });

    const newChallanRecord: Pft2ChallanRecord = {
      id: `pft2-${Date.now()}-${nextSeq}`,
      challanNumber,
      demandNumber: targetUnit.demandUnit.permanentDemandNo,
      unitId: targetUnit.id,
      legalName: targetUnit.legalName,
      tradeName: targetUnit.tradeName,
      identifierType: targetUnit.identifierType,
      identifierValue: targetUnit.identifierValue,
      address: targetUnit.address,
      subclassificationCode: targetUnit.statutoryRule.subclassification_code,
      statutoryTertiaryCode: targetUnit.statutoryRule.statutory_tertiary_code,
      category: targetUnit.statutoryRule.category,
      tertiarySlab: targetUnit.statutoryRule.statutory_tertiary_classification ?? null,
      amountPayable,
      noticeNumber,
      pin,
      formType: issuePft2FormType,
      demandScope: issuePft2DemandScope,
      paymentScope: issuePft2PaymentScope,
      fullAssessedAmount: fullAssessed,
      partialAmount: isPartial ? amountPayable : undefined,
      remainingBalance,
      provincialUin: targetUnit.provincialUin,
      issueDate: issuePft2IssueDate,
      dueDate: issuePft2DueDate,
      status: "ISSUED",
      officialSha256: computeContentSha256(
        `PTAS:PFT2:${challanNumber}:${noticeNumber}:${pin}:${amountPayable}:${issuePft2DueDate}`
      ),
      qrPayload: `PTAS-PUNJAB:PFT-2:${challanNumber}:DEMAND=${targetUnit.demandUnit.permanentDemandNo}:AMOUNT=${amountPayable}:DUE=${issuePft2DueDate}:PIN=${pin}`
    };

    const auditItem: PilotAuditItem = {
      id: `audit-${Date.now()}`,
      eventType: "PFT2_CHALLAN_ISSUED",
      actorName: officer.name,
      actorRole: officer.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: `corr-${challanNumber}`,
      details: `Form P.F.T-2 Challan issued: Notice No ${noticeNumber} | Security PIN ${pin} | Amount PKR ${amountPayable.toLocaleString()} [${issuePft2FormType} - ${issuePft2DemandScope} - ${issuePft2PaymentScope}]. Due: ${issuePft2DueDate}.`
    };

    const updatedChallans = [newChallanRecord, ...pft2Challans];
    const updatedAudits = [auditItem, ...auditLogs];

    syncState(
      units,
      updatedAudits,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      updatedChallans
    );

    setShowIssuePft2Modal(false);
    showToast("success", `✓ Form P.F.T-2 Challan issued! Notice: ${noticeNumber} (PIN: ${pin}).`);

    setActivePrintChallan(newChallanRecord);
    setShowPrintChallanModal(true);
  };

  const handlePrintPft2Challan = (challan: Pft2ChallanRecord) => {
    setActivePrintChallan(challan);
    setShowPrintChallanModal(true);
  };

  const handleSearchCitizenTaxpayer = (overrideQuery?: string) => {
    const query = overrideQuery ?? portalSearchQuery;
    if (!query.trim()) {
      showToast("error", "Please enter a CNIC, NTN, or Permanent Demand Number.");
      return;
    }
    const res = lookupTaxpayerLiability(query, units);
    setPortalSearchResult(res);
    if (res) {
      showToast("success", `Found taxpayer record for ${res.legalName}`);
    } else {
      showToast("error", `No taxpayer found matching "${query}" in Circle-Vehari.`);
    }
  };

  const handleUpdateSelfAssessment = (criteria: Partial<SelfAssessmentCriteriaInput>) => {
    const updated: SelfAssessmentCriteriaInput = {
      ...portalCalcCriteria,
      ...criteria
    };
    setPortalCalcCriteria(updated);
    const computed = calculateRule4SelfAssessment(updated);
    setPortalCalcResult(computed);
  };

  const handleOpenCitizenPaymentModal = (targetUnitId?: string, defaultAmount?: number) => {
    const unit = units.find((u) => u.id === targetUnitId) ?? units[0];
    if (!unit) return;
    const balance = computeLedgerBalance(unit.ledgerEntries);
    setCitizenPayUnitId(unit.id);
    setCitizenPayAmount(
      defaultAmount ?? (balance > 0 ? balance : unit.statutoryRule.annual_rate_pkr)
    );
    setCitizenPaymentSuccess(null);
    setShowCitizenPaymentModal(true);
  };

  const handleExecuteCitizenPayment = () => {
    if (!citizenPayUnitId) return;
    if (citizenPayAmount <= 0) {
      showToast("error", "Deposit amount must be greater than zero.");
      return;
    }

    try {
      const currentState = loadPilotState();
      currentState.currentOfficer = officer;
      currentState.units = units;
      currentState.auditLogs = auditLogs;
      currentState.clearanceCertificates = clearanceCertificates;
      currentState.discontinuances = discontinuances;
      currentState.refundAdjustments = refundAdjustments;

      const { result, updatedUnits, updatedAudits, updatedClearanceCerts } = simulateCitizenPayment(
        citizenPayUnitId,
        citizenPayAmount,
        citizenPayChannel,
        currentState
      );

      syncState(
        updatedUnits,
        updatedAudits,
        undefined,
        undefined,
        undefined,
        undefined,
        updatedClearanceCerts
      );
      setCitizenPaymentSuccess(result);

      if (portalSearchResult && portalSearchResult.unit.id === citizenPayUnitId) {
        const refreshed = lookupTaxpayerLiability(portalSearchResult.identifierValue, updatedUnits);
        setPortalSearchResult(refreshed);
      }

      showToast(
        "success",
        `Payment of PKR ${citizenPayAmount.toLocaleString()} settled under PSID ${result.psid}!`
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast("error", `Payment simulation failed: ${errMsg}`);
    }
  };

  const renderUnitActionsDropdown = (targetUnit: StoredUnit) => {
    const isOpen = activeActionDropdownUnitId === targetUnit.id;
    return (
      <div className="unit-actions-menu">
        <button
          type="button"
          className="unit-actions-btn"
          onClick={(e) => {
            e.stopPropagation();
            setActiveActionDropdownUnitId(isOpen ? null : targetUnit.id);
          }}
          title="Statutory Documents & Enforcement Actions"
        >
          <span>⚡ Actions</span>
          <span style={{ fontSize: "0.7rem" }}>▾</span>
        </button>

        {isOpen && (
          <div className="unit-actions-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="unit-actions-dropdown-header">
              {targetUnit.demandUnit.permanentDemandNo} &bull; Statutory Actions
            </div>

            {/* Assessment Hub */}
            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                switchTab("FORM_PFT1");
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">📄</span>
              <span>View Form P.F.T-1 (Assessment Notice)</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                switchTab("FORM_PFT2");
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">💳</span>
              <span>View Form P.F.T-2 (Payment Challan)</span>
            </button>

            <div className="unit-actions-dropdown-divider" />

            {/* Revenue Hub */}
            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                switchTab("PFT2");
                const ch = pft2Challans.find(
                  (c) => c.unitId === targetUnit.id && c.status === "ISSUED"
                );
                if (ch) {
                  handleOpenReceivePft2(ch);
                } else {
                  setPft2SearchQuery(targetUnit.demandUnit.permanentDemandNo);
                }
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">📥</span>
              <span>Receive Bank Payment &bull; Convert to Receipt</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                switchTab("RECEIPTS");
                setReceiptSearchQuery(targetUnit.demandUnit.permanentDemandNo);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">🧾</span>
              <span>View Statutory Receipts (Rule 10)</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setPaymentUnitId(targetUnit.id);
                switchTab("LEDGER");
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">📒</span>
              <span>Inspect Demand &amp; Payment Ledger</span>
            </button>

            <div className="unit-actions-dropdown-divider" />

            {/* Enforcement Hub */}
            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setNoticeTargetUnitId(targetUnit.id);
                switchTab("DEFAULTERS");
                setShowNoticeModal(true);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">📜</span>
              <span>Issue Show Cause Notice (Penalty)</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setRecoveryTargetUnitId(targetUnit.id);
                switchTab("DEFAULTERS");
                setShowRecoveryModal(true);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">🏛️</span>
              <span>Issue Land Revenue Arrears Certificate (Rule 12)</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                switchTab("CLEARANCE");
                handleOpenClearanceCertificate(targetUnit);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">🛡️</span>
              <span>Tax Clearance Certificate (Form P.F.T-5)</span>
            </button>

            <div className="unit-actions-dropdown-divider" />

            {/* Statutory Relief & Tribunal */}
            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setAppealUnitId(targetUnit.id);
                switchTab("APPEALS");
                setShowFileAppealModal(true);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">⚖️</span>
              <span>Lodge Appellate Memorandum (Rule 14)</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setDiscUnitId(targetUnit.id);
                switchTab("RELIEF_DESK");
                setShowFileDiscontinuanceModal(true);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">🛑</span>
              <span>File Rule 10 Discontinuance Notice</span>
            </button>

            <button
              type="button"
              className="unit-actions-dropdown-item"
              onClick={() => {
                setSelectedUnitId(targetUnit.id);
                setRefUnitId(targetUnit.id);
                switchTab("RELIEF_DESK");
                setShowRefundModal(true);
                setActiveActionDropdownUnitId(null);
              }}
            >
              <span className="action-icon">💸</span>
              <span>Lodge Refund / Credit Adjustment (Sec 3(5))</span>
            </button>
          </div>
        )}
      </div>
    );
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

      {/* Official Government Session Bar (Phase 5) */}
      <nav className="officer-bar" aria-label="Official Officer Session Switcher">
        <div className="officer-bar-inner">
          <div
            className="officer-current"
            style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}
          >
            <div className="officer-avatar" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              {officer.role === "INSPECTOR" ? "👤" : officer.role === "ETO" ? "⚖️" : "📊"}
            </div>
            <div className="officer-details">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <strong>{officer.name}</strong>
                <span
                  style={{
                    background:
                      officer.role === "INSPECTOR"
                        ? "#e0f2fe"
                        : officer.role === "ETO"
                          ? "#fef3c7"
                          : "#f3e8ff",
                    color:
                      officer.role === "INSPECTOR"
                        ? "#0369a1"
                        : officer.role === "ETO"
                          ? "#92400e"
                          : "#6b21a8",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    fontSize: "0.7rem",
                    fontWeight: 700
                  }}
                >
                  {officer.role}
                </span>
                <span
                  style={{
                    background: "#ecfdf5",
                    color: "#065f46",
                    border: "1px solid #a7f3d0",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    fontSize: "0.68rem",
                    fontWeight: 600
                  }}
                >
                  🟢{" "}
                  {authenticatedSessionType === "CLOUD" ? "Supabase Auth" : "Authenticated Session"}
                </span>
              </div>
              <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                {officer.title} &bull; Jurisdiction: <strong>{officer.jurisdictionName}</strong> (
                {officer.jurisdictionTier}) &bull; {officer.email}
              </span>
            </div>
          </div>

          <div
            className="role-switcher-group"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="btn-secondary btn-sm"
              style={{
                backgroundColor: "#0d3822",
                color: "#ffffff",
                borderColor: "#0d3822",
                fontWeight: 600
              }}
              title="Open Official Officer Authentication Studio"
            >
              🔑 Auth Studio / Switch Officer
            </button>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {OFFICIAL_OFFICERS_REGISTRY.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSwitchOfficer(o)}
                  className={`role-switch-btn ${officer.email === o.email ? "active" : ""}`}
                  title={`Quick switch to ${o.name} (${o.role})`}
                >
                  {o.role === "INSPECTOR"
                    ? "👤 Inspector"
                    : o.role === "ETO"
                      ? "⚖️ ETO"
                      : "📊 Director"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleOfficerSignOut}
              className="btn-secondary btn-sm"
              style={{ color: "#991b1b", borderColor: "#fecaca" }}
              title="Sign out of current officer session"
            >
              🚪 Sign Out
            </button>
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

        {/* Tier 1: Unified Route Hubs Navigation */}
        <nav className="route-hubs-bar" aria-label="Unified Operational Routes">
          <button
            type="button"
            onClick={() => switchRouteHub("assessment")}
            className={`route-hub-card ${activeRouteHub === "assessment" ? "active" : ""}`}
            title="Assessment & Field Desk Hub (/assessment)"
          >
            <span className="route-hub-icon">🏛️</span>
            <div className="route-hub-content">
              <div className="route-hub-title-row">
                <span className="route-hub-title">Assessment &amp; Field Desk</span>
                {metrics.pendingApprovals > 0 && (
                  <span className="route-hub-badge">{metrics.pendingApprovals} Pending</span>
                )}
              </div>
              <p className="route-hub-desc">Registration, Approvals &amp; Notices</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => switchRouteHub("enforcement")}
            className={`route-hub-card ${activeRouteHub === "enforcement" ? "active" : ""}`}
            title="Compliance & Recovery Hub (/enforcement)"
          >
            <span className="route-hub-icon">🚨</span>
            <div className="route-hub-content">
              <div className="route-hub-title-row">
                <span className="route-hub-title">Compliance &amp; Recovery</span>
                {metrics.defaultersPenaltyEligible + metrics.defaultersOverdue > 0 && (
                  <span className="route-hub-badge">
                    {metrics.defaultersPenaltyEligible + metrics.defaultersOverdue} At Risk
                  </span>
                )}
              </div>
              <p className="route-hub-desc">Arrears, Appeals &amp; Clearances</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => switchRouteHub("revenue")}
            className={`route-hub-card ${activeRouteHub === "revenue" ? "active" : ""}`}
            title="Revenue & Citizen Desk Hub (/revenue)"
          >
            <span className="route-hub-icon">💳</span>
            <div className="route-hub-content">
              <div className="route-hub-title-row">
                <span className="route-hub-title">Revenue &amp; Citizen Desk</span>
              </div>
              <p className="route-hub-desc">Ledger, ePay &amp; Self-Assessment</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => switchRouteHub("intelligence")}
            className={`route-hub-card ${activeRouteHub === "intelligence" ? "active" : ""}`}
            title="Intelligence & Governance Hub (/intelligence)"
          >
            <span className="route-hub-icon">📊</span>
            <div className="route-hub-content">
              <div className="route-hub-title-row">
                <span className="route-hub-title">Intelligence &amp; Governance</span>
              </div>
              <p className="route-hub-desc">Executive MIS, Slabs &amp; Audit Trail</p>
            </div>
          </button>
        </nav>

        {/* Tier 2: Contextual Sub-Tab Navigation Bar */}
        <div className="subtabs-nav" role="tablist" aria-label="Route Contextual Sub-Tabs">
          {activeRouteHub === "assessment" && (
            <>
              <button
                role="tab"
                aria-selected={activeTab === "UNITS"}
                onClick={() => switchTab("UNITS")}
                className={`subtab-btn ${activeTab === "UNITS" ? "active" : ""}`}
              >
                🏢 Tax Units &amp; Survey
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "ASSESSMENTS"}
                onClick={() => switchTab("ASSESSMENTS")}
                className={`subtab-btn ${activeTab === "ASSESSMENTS" ? "active" : ""}`}
              >
                ⚖️ Assessment Queue
                {metrics.pendingApprovals > 0 && (
                  <span className="subtab-badge">{metrics.pendingApprovals}</span>
                )}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "FORM_PFT1"}
                onClick={() => switchTab("FORM_PFT1")}
                className={`subtab-btn ${activeTab === "FORM_PFT1" ? "active" : ""}`}
              >
                📜 Form P.F.T-1 (Notice of Demand)
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "FORM_PFT2"}
                onClick={() => switchTab("FORM_PFT2")}
                className={`subtab-btn ${activeTab === "FORM_PFT2" ? "active" : ""}`}
              >
                💳 Form P.F.T-2 (Payment Challan)
              </button>
            </>
          )}

          {activeRouteHub === "enforcement" && (
            <>
              <button
                role="tab"
                aria-selected={activeTab === "DEFAULTERS"}
                onClick={() => switchTab("DEFAULTERS")}
                className={`subtab-btn ${activeTab === "DEFAULTERS" ? "active" : ""}`}
              >
                ⚠️ Defaulter &amp; Arrears Roll
                {metrics.defaultersPenaltyEligible + metrics.defaultersOverdue > 0 && (
                  <span className="subtab-badge">
                    {metrics.defaultersPenaltyEligible + metrics.defaultersOverdue}
                  </span>
                )}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "APPEALS"}
                onClick={() => switchTab("APPEALS")}
                className={`subtab-btn ${activeTab === "APPEALS" ? "active" : ""}`}
              >
                ⚖️ Appellate Tribunal Desk
                {appeals.filter((a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED")
                  .length > 0 && (
                  <span className="subtab-badge">
                    {
                      appeals.filter(
                        (a) => a.status === "FILED" || a.status === "HEARING_SCHEDULED"
                      ).length
                    }
                  </span>
                )}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "RELIEF_DESK"}
                onClick={() => switchTab("RELIEF_DESK")}
                className={`subtab-btn ${activeTab === "RELIEF_DESK" ? "active" : ""}`}
              >
                🛑 Discontinuance &amp; Refunds
                {discontinuances.filter(
                  (d) => d.status === "PENDING_INSPECTION" || d.status === "INSPECTED"
                ).length > 0 && (
                  <span className="subtab-badge">
                    {
                      discontinuances.filter(
                        (d) => d.status === "PENDING_INSPECTION" || d.status === "INSPECTED"
                      ).length
                    }
                  </span>
                )}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "CLEARANCE"}
                onClick={() => switchTab("CLEARANCE")}
                className={`subtab-btn ${activeTab === "CLEARANCE" ? "active" : ""}`}
              >
                📜 Clearance Certificates (PFT-5)
                {clearanceCertificates.length > 0 && (
                  <span
                    className="subtab-badge"
                    style={{ background: "#dcfce7", color: "#166534" }}
                  >
                    {clearanceCertificates.length}
                  </span>
                )}
              </button>
            </>
          )}

          {activeRouteHub === "revenue" && (
            <>
              <button
                role="tab"
                aria-selected={activeTab === "PFT2"}
                onClick={() => switchTab("PFT2")}
                className={`subtab-btn ${activeTab === "PFT2" ? "active" : ""}`}
              >
                📑 Form PFT-2 Challans ({pft2Challans.length})
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "RECEIPTS"}
                onClick={() => switchTab("RECEIPTS")}
                className={`subtab-btn ${activeTab === "RECEIPTS" ? "active" : ""}`}
              >
                🧾 Receipts &amp; Collections ({statutoryReceipts.length})
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "LEDGER"}
                onClick={() => switchTab("LEDGER")}
                className={`subtab-btn ${activeTab === "LEDGER" ? "active" : ""}`}
              >
                📒 Demand &amp; Payment Ledger
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "EPAY"}
                onClick={() => switchTab("EPAY")}
                className={`subtab-btn ${activeTab === "EPAY" ? "active" : ""}`}
              >
                🔄 ePay Punjab Reconciliation
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "PUBLIC_PORTAL"}
                onClick={() => switchTab("PUBLIC_PORTAL")}
                className={`subtab-btn ${activeTab === "PUBLIC_PORTAL" ? "active" : ""}`}
              >
                🌐 Public Portal &amp; QR Authenticator
              </button>
            </>
          )}

          {activeRouteHub === "intelligence" && (
            <>
              <button
                role="tab"
                aria-selected={activeTab === "ANALYTICS" || activeTab === "MIS_HUB"}
                onClick={() => switchTab("ANALYTICS")}
                className={`subtab-btn ${activeTab === "ANALYTICS" || activeTab === "MIS_HUB" ? "active" : ""}`}
              >
                📊 Analytics Dashboard
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "REPORTS"}
                onClick={() => switchTab("REPORTS")}
                className={`subtab-btn ${activeTab === "REPORTS" ? "active" : ""}`}
              >
                📑 Statutory Reports Studio
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "REGISTER_PFT3"}
                onClick={() => switchTab("REGISTER_PFT3")}
                className={`subtab-btn ${activeTab === "REGISTER_PFT3" ? "active" : ""}`}
              >
                📋 Form P.F.T-3 Assessment Register ({units.length})
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "AUDIT"}
                onClick={() => switchTab("AUDIT")}
                className={`subtab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
              >
                🛡️ Immutable Audit Log ({auditLogs.length})
              </button>
            </>
          )}
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
                          {u.provincialUin && (
                            <span
                              style={{
                                display: "block",
                                fontFamily: "monospace",
                                fontSize: "0.725rem",
                                color: "#1d4ed8",
                                fontWeight: 600,
                                marginTop: "2px"
                              }}
                              title="Provincial Unique Identification Number"
                            >
                              UIN: {u.provincialUin}
                            </span>
                          )}
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
                            Class {u.statutoryRule.rule_code} &bull; {u.statutoryRule.category}
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
                            {u.statutoryRule.statutory_tertiary_classification
                              ? `${u.statutoryRule.subclassification_label ?? u.statutoryRule.subcategory} (${u.statutoryRule.statutory_tertiary_classification})`
                              : (u.statutoryRule.subclassification_label ??
                                (u.statutoryRule.subclassification_code
                                  ? u.statutoryRule.subcategory
                                  : "Direct Category Rate"))}
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
                        <td>{renderUnitActionsDropdown(u)}</td>
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
                            {u.demandUnit.permanentDemandNo}
                            {u.provincialUin ? ` • UIN: ${u.provincialUin}` : ""} &bull; {u.address}
                          </span>
                        </td>
                        <td>{FINANCIAL_YEAR_2026_27}</td>
                        <td>
                          <strong>
                            Class {u.statutoryRule.rule_code} ({u.statutoryRule.category})
                          </strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            {u.statutoryRule.statutory_tertiary_classification
                              ? `${u.statutoryRule.subclassification_label ?? u.statutoryRule.subcategory} (${u.statutoryRule.statutory_tertiary_classification})`
                              : (u.statutoryRule.subclassification_label ??
                                (u.statutoryRule.subclassification_code
                                  ? u.statutoryRule.subcategory
                                  : "Direct Category Rate"))}
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
                    {u.demandUnit.permanentDemandNo}
                    {u.provincialUin ? ` [${u.provincialUin}]` : ""} &bull; {u.legalName}
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
                  onClick={() =>
                    downloadDocumentPdf(
                      "pft1-document-card",
                      `Form_PFT1_Notice_${activeUnit?.demandUnit.permanentDemandNo || "Notice"}.pdf`
                    )
                  }
                  title="Download standalone Form PFT-1 notice as PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("pft1-document-card")}
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
            <div
              className="doc-box printable-document"
              id="pft1-document-card"
              style={{ marginTop: "1.5rem" }}
            >
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
                {/* Top Section with Left QR Code & Department Header */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    borderBottom: "2px solid #0d3822",
                    paddingBottom: "0.75rem",
                    marginBottom: "1rem"
                  }}
                >
                  {/* Left: QR Code */}
                  <div style={{ flexShrink: 0 }}>
                    <StatutoryQrCode
                      payload={formPFT1Data.qrPayload}
                      size={76}
                      label="Scan to Verify"
                      subtitle={formPFT1Data.demandNumber}
                      onScanOrClick={(payload) => {
                        setPortalVerificationInput(payload);
                        handleVerifyDocument(payload);
                        setActiveTab("PUBLIC_PORTAL");
                      }}
                    />
                  </div>
                  {/* Right: Department Header */}
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div
                      style={{
                        display: "inline-block",
                        background: "#fef3c7",
                        border: "1px solid #f59e0b",
                        padding: "0.15rem 0.6rem",
                        borderRadius: "4px",
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        color: "#92400e",
                        marginBottom: "0.2rem"
                      }}
                    >
                      FORM P.F.T-1 &bull; NOTICE OF TAX DEMAND
                    </div>
                    <h4
                      style={{
                        margin: "0.1rem 0",
                        fontSize: "0.95rem",
                        color: "#0d3822",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}
                    >
                      GOVERNMENT OF THE PUNJAB
                    </h4>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.82rem" }}>
                      EXCISE &amp; TAXATION DEPARTMENT &bull; DISTRICT VEHARI
                    </p>
                    <p
                      style={{
                        margin: "0.15rem 0 0",
                        fontSize: "0.72rem",
                        fontStyle: "italic",
                        color: "#64748b"
                      }}
                    >
                      (Section 3 of Punjab Finance Act 1977 read with Rule 6 of the Punjab
                      Professions &amp; Trades Tax Rules, 1977)
                    </p>
                  </div>
                </div>

                {/* Unified Metadata & Assessment Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.35rem 0.6rem",
                    fontSize: "0.78rem",
                    background: "#f8fafc",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "1rem"
                  }}
                >
                  <div
                    style={{
                      gridColumn: "span 2",
                      fontSize: "0.76rem",
                      fontFamily: "monospace",
                      color: "#1e3a8a",
                      wordBreak: "break-all"
                    }}
                  >
                    <strong>Notice No:</strong> {formPFT1Data.noticeNumber}
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.1rem 0.45rem",
                        borderRadius: "4px",
                        fontFamily: "monospace",
                        fontWeight: 800,
                        fontSize: "0.76rem",
                        background: "#e0f2fe",
                        color: "#0369a1",
                        border: "1px solid #bae6fd",
                        letterSpacing: "1px"
                      }}
                    >
                      🔐 PIN: {formPFT1Data.pin}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>Demand No:</strong>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#0d3822" }}>
                      {formPFT1Data.demandNumber}
                    </span>
                  </div>
                  {formPFT1Data.provincialUin && (
                    <div
                      style={{
                        gridColumn: "span 2",
                        fontSize: "0.76rem",
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
                        {formPFT1Data.provincialUin}
                      </span>
                    </div>
                  )}
                  <div>
                    <strong>Circle:</strong> {formPFT1Data.circleName}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>District:</strong> {formPFT1Data.districtName}
                  </div>
                  <div>
                    <strong>Date of Issue:</strong> {formPFT1Data.issueDate}
                  </div>
                  <div style={{ textAlign: "right", color: "#b91c1c" }}>
                    <strong>Due Date:</strong> {formPFT1Data.dueDate}
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

                {/* 3-Tier Statutory Schedule Breakdown Banner */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    marginBottom: "1.25rem",
                    fontSize: "0.85rem"
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "#166534",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Schedule Category (Class)
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "#0f172a" }}>
                      {formPFT1Data.statutoryCategoryText}
                    </p>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "#166534",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Statutory Sub-Class
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "#0f172a" }}>
                      Class {formPFT1Data.subclassificationCode}
                    </p>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "#166534",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Tertiary Slab / Criteria
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontWeight: 600, color: "#0f172a" }}>
                      {formPFT1Data.tertiarySlab}
                    </p>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "#166534",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Prescribed Statutory Rate
                    </span>
                    <p style={{ margin: "0.2rem 0 0", fontWeight: 800, color: "#166534" }}>
                      PKR {formPFT1Data.slabRatePkr.toLocaleString()} ({formPFT1Data.rateBasis})
                    </p>
                  </div>
                </div>

                {/* Gazetted Notice Body */}
                <div style={{ fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "1.75rem" }}>
                  <p style={{ margin: "0 0 0.75rem" }}>Dear Sir (s),</p>
                  <p style={{ margin: "0 0 0.75rem", textIndent: "1.5rem" }}>
                    According to Section 03 of Punjab Finance Act, 1977 you are liable to pay Tax on
                    Professions, Trades, Employment or Callings amounting to{" "}
                    <strong>Rs. {formPFT1Data.taxAmount.toLocaleString()}</strong> (in words){" "}
                    <strong>{formPFT1Data.taxAmountWords}</strong> under{" "}
                    <strong>
                      {formPFT1Data.scheduleEntry} ({formPFT1Data.statutoryCategoryText}) &bull;
                      Slab: {formPFT1Data.tertiarySlab}
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
                  onClick={() =>
                    downloadDocumentPdf(
                      "pft2-challan-document",
                      `Form_PFT2_Challan_${activeUnit?.demandUnit.permanentDemandNo || "Challan"}.pdf`,
                      { orientation: "landscape" }
                    )
                  }
                  title="Download 3-copy Form PFT-2 challan as PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("pft2-challan-document")}
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

              <div className="challan-grid printable-document" id="pft2-challan-document">
                {formPFT2Data.copies.map((copy, cIdx) => (
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
                          onScanOrClick={(payload) => {
                            setPortalVerificationInput(payload);
                            handleVerifyDocument(payload);
                            setActiveTab("PUBLIC_PORTAL");
                          }}
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
                            color: "#0d3822"
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
                        <span
                          style={{ fontFamily: "monospace", fontWeight: 800, color: "#0d3822" }}
                        >
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
                  onClick={() =>
                    downloadDocumentPdf("pft3-register-document", "Form_PFT3_Register.pdf", {
                      orientation: "landscape"
                    })
                  }
                  title="Download official Rule 11 Register as PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("pft3-register-document")}
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
            <div className="table-container printable-document" id="pft3-register-document">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Permanent Demand No.</th>
                    <th>Assessment No.</th>
                    <th>Taxpayer Legal Name</th>
                    <th>CNIC / NTN</th>
                    <th>Statutory Class</th>
                    <th>Assessed Tax (PKR)</th>
                    <th>Paid (PKR)</th>
                    <th>Balance (PKR)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {formPFT3Rows.map((row) => (
                    <tr key={row.permanentDemandNo}>
                      <td>{row.serialNumber}</td>
                      <td>
                        <strong>{row.permanentDemandNo}</strong>
                        {row.provincialUin && (
                          <span
                            style={{
                              display: "block",
                              fontFamily: "monospace",
                              fontSize: "0.7rem",
                              color: "#1d4ed8",
                              fontWeight: 600,
                              marginTop: "2px"
                            }}
                            title="Provincial Unique Identification Number"
                          >
                            UIN: {row.provincialUin}
                          </span>
                        )}
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
                      <td>
                        {(() => {
                          const targetUnit = units.find(
                            (u) => u.demandUnit.permanentDemandNo === row.permanentDemandNo
                          );
                          return targetUnit ? renderUnitActionsDropdown(targetUnit) : null;
                        })()}
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

              <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "defaulters-roster-printable",
                      "PTAS_Defaulters_Roster_Vehari.pdf",
                      { orientation: "landscape" }
                    )
                  }
                  title="Download Defaulters Roster PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("defaulters-roster-printable")}
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
            <div id="defaulters-roster-printable" className="table-responsive">
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
                              {u.demandUnit.permanentDemandNo}
                              {u.provincialUin ? ` [${u.provincialUin}]` : ""} | {u.identifierType}:{" "}
                              {u.identifierValue}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                              {u.statutoryRule.subclassification_code
                                ? `Class ${u.statutoryRule.subclassification_code}`
                                : `Class ${u.statutoryRule.category_code}`}
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

              <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
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
                  onClick={() =>
                    downloadDocumentPdf(
                      "appeals-cause-list-printable",
                      "PTAS_Appeals_Cause_List.pdf",
                      { orientation: "landscape" }
                    )
                  }
                  title="Download Appeals Cause List PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("appeals-cause-list-printable")}
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
            <div id="appeals-cause-list-printable" className="table-responsive">
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

        {/* TAB 8: TAX CLEARANCE CERTIFICATES (FORM P.F.T-5) */}
        {activeTab === "CLEARANCE" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Form P.F.T-5: Certificate of Clearance (عدم بقایاجات سرٹیفکیٹ)</h2>
                <p>
                  Official statutory certificate issued under Rule 11 of the Punjab Professions and
                  Trades Tax Rules, 1977. Strictly conditioned upon zero outstanding balance across
                  all demand ledgers, penalties, and arrears.
                </p>
              </div>
            </div>

            {/* Clearance KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 700 }}>
                  ELIGIBLE UNITS (NIL ARREARS)
                </span>
                <strong
                  style={{
                    fontSize: "1.5rem",
                    display: "block",
                    color: "#14532d",
                    marginTop: "0.25rem"
                  }}
                >
                  {units.filter((u) => computeLedgerBalance(u.ledgerEntries) === 0).length} Units
                </strong>
                <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                  Zero balance verified in demand ledger
                </span>
              </div>

              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#9f1239", fontWeight: 700 }}>
                  INELIGIBLE UNITS (ARREARS PENDING)
                </span>
                <strong
                  style={{
                    fontSize: "1.5rem",
                    display: "block",
                    color: "#881337",
                    marginTop: "0.25rem"
                  }}
                >
                  {units.filter((u) => computeLedgerBalance(u.ledgerEntries) > 0).length} Units
                </strong>
                <span style={{ fontSize: "0.75rem", color: "#9f1239" }}>
                  Clearance certificate generation blocked
                </span>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "1rem",
                  borderRadius: "8px"
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "#1e40af", fontWeight: 700 }}>
                  FORM P.F.T-5 CERTIFICATES ISSUED
                </span>
                <strong
                  style={{
                    fontSize: "1.5rem",
                    display: "block",
                    color: "#1e3a8a",
                    marginTop: "0.25rem"
                  }}
                >
                  {clearanceCertificates.length} Issued
                </strong>
                <span style={{ fontSize: "0.75rem", color: "#1e40af" }}>
                  Sealed with SHA-256 non-repudiation digest
                </span>
              </div>
            </div>

            {/* Clearance Eligibility Table */}
            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Demand No.</th>
                    <th>Assessee Legal &amp; Trade Name</th>
                    <th>Category &amp; Rule</th>
                    <th>Ledger Outstanding Balance</th>
                    <th>Statutory Clearance Status</th>
                    <th>Certificate Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const balance = computeLedgerBalance(u.ledgerEntries);
                    const isZeroBalance = balance === 0;
                    const certRecord = clearanceCertificates.find((c) => c.unitId === u.id);

                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.demandUnit.permanentDemandNo}</strong>
                          {u.provincialUin && (
                            <span
                              style={{
                                display: "block",
                                fontFamily: "monospace",
                                fontSize: "0.725rem",
                                color: "#1d4ed8",
                                fontWeight: 600,
                                marginTop: "2px"
                              }}
                              title="Provincial Unique Identification Number"
                            >
                              UIN: {u.provincialUin}
                            </span>
                          )}
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            Circle-Vehari
                          </span>
                        </td>
                        <td>
                          <strong>{u.legalName}</strong>
                          {u.tradeName && u.tradeName !== u.legalName && (
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              Trading as: {u.tradeName}
                            </span>
                          )}
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8" }}>
                            {u.identifierType}: {u.identifierValue}
                          </span>
                        </td>
                        <td>
                          <strong>{u.statutoryRule.category}</strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            {u.statutoryRule.subclassification_code
                              ? `Class ${u.statutoryRule.subclassification_code}`
                              : `Class ${u.statutoryRule.category_code}`}{" "}
                            (PKR {u.statutoryRule.annual_rate_pkr.toLocaleString()})
                          </span>
                        </td>
                        <td>
                          <strong
                            style={{
                              fontSize: "0.95rem",
                              color: isZeroBalance ? "#166534" : "#dc2626"
                            }}
                          >
                            PKR {balance.toLocaleString()}
                          </strong>
                          {balance > 0 ? (
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#dc2626" }}
                            >
                              Arrears outstanding
                            </span>
                          ) : (
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#166534" }}
                            >
                              Nil balance
                            </span>
                          )}
                        </td>
                        <td>
                          {isZeroBalance ? (
                            <span
                              className="badge badge-approved"
                              style={{
                                background: "#ecfdf5",
                                color: "#065f46",
                                border: "1px solid #a7f3d0"
                              }}
                            >
                              ✓ ELIGIBLE (NIL ARREARS)
                            </span>
                          ) : (
                            <span
                              className="badge badge-returned"
                              style={{
                                background: "#fff1f2",
                                color: "#9f1239",
                                border: "1px solid #fecdd3"
                              }}
                            >
                              ✕ INELIGIBLE (ARREARS PENDING)
                            </span>
                          )}
                          {certRecord && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.7rem",
                                color: "#065f46",
                                marginTop: "0.25rem",
                                fontFamily: "monospace"
                              }}
                            >
                              Cert: {certRecord.certificateNumber}
                            </span>
                          )}
                        </td>
                        <td>
                          {isZeroBalance ? (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.3rem 0.6rem",
                                backgroundColor: "#065f46",
                                borderColor: "#047857"
                              }}
                              onClick={() => handleOpenClearanceCertificate(u)}
                            >
                              📜 {certRecord ? "View Certificate" : "Issue Form P.F.T-5"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.3rem 0.6rem",
                                opacity: 0.5,
                                cursor: "not-allowed"
                              }}
                              title="Cannot issue clearance certificate: Outstanding arrears must be fully cleared first."
                            >
                              🔒 Clearance Locked
                            </button>
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

        {/* TAB 9: STATUTORY RELIEF DESK (RULES 5 & 10) */}
        {activeTab === "RELIEF_DESK" && (
          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Statutory Relief &amp; Adjustment Desk (Rules 5 &amp; 10)</h2>
                <p>
                  Legal administration for trade cessation / business discontinuance under Rule 10,
                  and excess tax refunds or double-entry credit adjustments under Rule 5 of the
                  Punjab Professions and Trades Tax Rules, 1977.
                </p>
              </div>
              <div className="panel-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFileDiscontinuanceModal(true)}
                  title="File an application for trade closure or cessation under Rule 10"
                >
                  🛑 File Rule 10 Discontinuance Notice
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowRefundModal(true)}
                  title="Apply for statutory refund or double-entry credit adjustment under Rule 5"
                >
                  💰 File Rule 5 Refund / Adjustment
                </button>
              </div>
            </div>

            {/* SECTION A: RULE 10 DISCONTINUANCE WORKFLOW */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "2px solid #0d3822",
                  paddingBottom: "0.5rem",
                  marginBottom: "1rem"
                }}
              >
                <h3 style={{ margin: 0, color: "#0d3822", fontSize: "1.15rem" }}>
                  🛑 Rule 10: Trade Cessation &amp; Discontinuance (کاروبار کی بندش کا نوٹس)
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Statutory 30-Day Notice &bull; On-Site Physical Inspection &bull; ETO Closure
                  Order
                </span>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "0.85rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  color: "#334155"
                }}
              >
                <p style={{ margin: "0 0 0.4rem" }}>
                  <strong>Statutory Mandate (Rule 10):</strong> Any person liable to pay tax who
                  discontinues their profession or trade must give thirty days notice in writing to
                  the Assessing Authority.
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  <strong>Legal Consequence:</strong> Approval of discontinuance freezes future
                  annual tax liability while preserving all past uncollected arrears for recovery
                  under Section 3(4).
                </p>
              </div>

              <div className="table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Notice Reference</th>
                      <th>Taxpayer Unit</th>
                      <th>Discontinuance Date &amp; Reason</th>
                      <th>Inspector Field Inspection</th>
                      <th>Status</th>
                      <th>Statutory Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discontinuances.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
                        >
                          No discontinuance notices filed in Circle-Vehari.
                        </td>
                      </tr>
                    ) : (
                      discontinuances.map((disc) => {
                        const isPendingInsp = disc.status === "PENDING_INSPECTION";
                        const isInspected = disc.status === "INSPECTED";
                        const isClosed = disc.status === "APPROVED";
                        const isRejected = disc.status === "REJECTED";

                        return (
                          <tr key={disc.id}>
                            <td>
                              <strong>{disc.noticeNumber}</strong>
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                Filed: {new Date(disc.filedAt).toLocaleDateString()}
                              </span>
                            </td>
                            <td>
                              <strong>{disc.assesseeLegalName}</strong>
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                {disc.cnicOrNtn}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: "#b91c1c" }}>
                                Effective: {disc.discontinuanceDate}
                              </strong>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.75rem",
                                  color: "#475569",
                                  maxWidth: "18rem"
                                }}
                              >
                                {disc.reason}
                              </span>
                            </td>
                            <td>
                              {disc.inspectorReport ? (
                                <div>
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#166534",
                                      fontWeight: 600
                                    }}
                                  >
                                    ✓ Verified On-Site
                                  </span>
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "0.725rem",
                                      color: "#64748b",
                                      maxWidth: "18rem"
                                    }}
                                  >
                                    {disc.inspectorReport}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ fontSize: "0.75rem", color: "#d97706" }}>
                                  ⏳ Awaiting Field Inspection
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  isClosed
                                    ? "badge-approved"
                                    : isInspected
                                      ? "badge-submitted"
                                      : isPendingInsp
                                        ? "badge-pending"
                                        : "badge-returned"
                                }`}
                              >
                                {disc.status.replace(/_/g, " ")}
                              </span>
                              {disc.etoOrderNumber && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.7rem",
                                    color: "#64748b",
                                    fontFamily: "monospace",
                                    marginTop: "0.2rem"
                                  }}
                                >
                                  {disc.etoOrderNumber}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                {isPendingInsp && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => handleOpenDiscontinuanceInspection(disc)}
                                  >
                                    🔍 Field Inspection
                                  </button>
                                )}

                                {isInspected &&
                                  (officer.role === "ETO" || officer.role === "DIRECTOR") && (
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                      onClick={() => handleOpenDiscontinuanceOrder(disc)}
                                    >
                                      ⚖️ Issue Closure Order
                                    </button>
                                  )}

                                {(isClosed || isRejected) && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => {
                                      const u = units.find((unit) => unit.id === disc.unitId);
                                      if (u) {
                                        const doc = generateDiscontinuanceOrder(u, {
                                          orderNumber: disc.etoOrderNumber || "DISC-ORD-2026",
                                          orderDate:
                                            disc.etoOrderDate ||
                                            new Date().toISOString().split("T")[0]!,
                                          noticeNumber: disc.noticeNumber,
                                          discontinuanceDate: disc.discontinuanceDate,
                                          reason: disc.reason,
                                          inspectorFindings:
                                            disc.inspectorReport || "Premises verified closed.",
                                          etoDecision:
                                            (disc.etoDecision as "APPROVED" | "REJECTED") ||
                                            "APPROVED",
                                          etoReason: disc.etoReason || "Statutory closure verified."
                                        });
                                        setActiveDiscontinuanceOrder(doc);
                                        setShowDiscontinuanceOrderModal(true);
                                      }
                                    }}
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
            </div>

            {/* SECTION B: RULE 5 STATUTORY REFUNDS & CREDIT ADJUSTMENTS */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "2px solid #0d3822",
                  paddingBottom: "0.5rem",
                  marginBottom: "1rem"
                }}
              >
                <h3 style={{ margin: 0, color: "#0d3822", fontSize: "1.15rem" }}>
                  💰 Rule 5: Excess Tax Refunds &amp; Credit Adjustments (واپسی و ایڈجسٹمنٹ ٹیکس)
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Application Scrutiny &bull; ETO Statutory Decree &bull; Double-Entry Demand Ledger
                  Credit
                </span>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "0.85rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  color: "#334155"
                }}
              >
                <p style={{ margin: "0 0 0.4rem" }}>
                  <strong>Statutory Ledger Integrity:</strong> When excess tax is deposited or
                  assessed erroneously, relief is granted via an immutable double-entry credit
                  (MANUAL_ADJUSTMENT).
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  <strong>Compliance Rule:</strong> Existing demand entries are never deleted or
                  mutated. Adjustments credit the ledger with a negative amount (-PKR) linked to the
                  formal ETO decree.
                </p>
              </div>

              <div className="table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Application No.</th>
                      <th>Taxpayer Unit</th>
                      <th>Relief Type &amp; Amount</th>
                      <th>Legal Grounds &amp; Evidence</th>
                      <th>Status &amp; Ledger Posting</th>
                      <th>Statutory Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundAdjustments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
                        >
                          No refund or adjustment applications recorded.
                        </td>
                      </tr>
                    ) : (
                      refundAdjustments.map((ref) => {
                        const isPending = ref.status === "PENDING_REVIEW";
                        const isApproved = ref.status === "APPROVED";

                        return (
                          <tr key={ref.id}>
                            <td>
                              <strong>{ref.applicationNumber}</strong>
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                Filed: {new Date(ref.filedAt).toLocaleDateString()}
                              </span>
                            </td>
                            <td>
                              <strong>{ref.assesseeLegalName}</strong>
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                {ref.cnicOrNtn}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: "#1e3a8a" }}>
                                PKR {ref.amount.toLocaleString()}
                              </strong>
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                              >
                                Type: {ref.type.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.8rem",
                                  color: "#334155",
                                  maxWidth: "20rem"
                                }}
                              >
                                {ref.grounds}
                              </span>
                              {ref.evidenceReference && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.725rem",
                                    color: "#64748b",
                                    marginTop: "0.2rem"
                                  }}
                                >
                                  Ref: {ref.evidenceReference}
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  isApproved
                                    ? "badge-approved"
                                    : isPending
                                      ? "badge-pending"
                                      : "badge-returned"
                                }`}
                              >
                                {ref.status.replace(/_/g, " ")}
                              </span>
                              {ref.ledgerEntryId && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.7rem",
                                    color: "#166534",
                                    fontWeight: 600,
                                    marginTop: "0.25rem"
                                  }}
                                >
                                  ✓ Posted to Demand Ledger
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                {isPending &&
                                  (officer.role === "ETO" || officer.role === "DIRECTOR") && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                        onClick={() => handleAdjudicateRefund(ref, "APPROVED")}
                                      >
                                        ⚖️ Approve &amp; Post Credit
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{
                                          padding: "0.25rem 0.5rem",
                                          fontSize: "0.75rem",
                                          color: "#dc2626"
                                        }}
                                        onClick={() => handleAdjudicateRefund(ref, "REJECTED")}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}

                                {isPending && officer.role === "INSPECTOR" && (
                                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                    Awaiting ETO Scrutiny
                                  </span>
                                )}

                                {isApproved && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => {
                                      const u = units.find((unit) => unit.id === ref.unitId);
                                      if (u) {
                                        const doc = generateRefundAdjustmentOrder(u, {
                                          orderNumber: ref.orderNumber || "ADJ-ORD-2026",
                                          orderDate:
                                            ref.orderDate ||
                                            new Date().toISOString().split("T")[0]!,
                                          applicationNumber: ref.applicationNumber,
                                          type: ref.type,
                                          amount: ref.amount,
                                          grounds: ref.grounds,
                                          evidenceRef: ref.evidenceReference
                                        });
                                        setActiveRefundOrder(doc);
                                        setShowRefundOrderModal(true);
                                      }
                                    }}
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
            </div>
          </section>
        )}
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

        {/* TAB: FORM P.F.T-2 CHALLAN MANAGEMENT (RULE 9) */}
        {activeTab === "PFT2" && (
          <section className="content-panel" aria-label="Form PFT-2 Challan Management Desk">
            <div className="panel-header">
              <div>
                <h2>Form P.F.T-2 Challan Management Desk (Rule 9)</h2>
                <p>
                  Comprehensive lifecycle registry of all issued, cancelled, and received Form
                  P.F.T-2 payment challans. Inspectors can verify bank payment scrolls and
                  acknowledge deposits to convert challans into official Statutory Receipts.
                </p>
              </div>
              <div
                className="panel-actions"
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    backgroundColor: "#0d3822",
                    borderColor: "#062415",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontWeight: 700
                  }}
                  onClick={() => handleOpenIssuePft2Modal()}
                  title="Issue new Form P.F.T-2 Challan with custom scope, due date, or partial amount"
                >
                  ➕ Issue Form PFT-2 Challan
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPft2ExecutiveModal(true)}
                  title="View executive statistical brief of all PFT-2 challans"
                >
                  📊 Executive PFT-2 Brief
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleExportPft2Csv}
                  title="Export all Form PFT-2 Challans as RFC-4180 CSV"
                >
                  📥 Export PFT-2 Register (CSV)
                </button>
              </div>
            </div>

            {/* Lifecycle KPI Cards */}
            {(() => {
              const summary = calculatePft2ExecutiveSummary(pft2Challans);
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                    gap: "1rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <div className="metric-card highlight">
                    <p className="metric-label">Total Challans</p>
                    <p className="metric-value">{summary.total}</p>
                    <p className="metric-subtext">
                      PKR {summary.totalDemandPkr.toLocaleString()} Assessed Demand
                    </p>
                  </div>
                  <div className="metric-card success">
                    <p className="metric-label">Received / Discharged</p>
                    <p className="metric-value">{summary.receivedCount}</p>
                    <p className="metric-subtext">
                      PKR {summary.receivedAmountPkr.toLocaleString()} Discharged
                    </p>
                  </div>
                  <div className="metric-card warning">
                    <p className="metric-label">Pending / Active</p>
                    <p className="metric-value">{summary.issuedCount}</p>
                    <p className="metric-subtext">
                      PKR {summary.pendingAmountPkr.toLocaleString()} Outstanding
                    </p>
                  </div>
                  <div className="metric-card" style={{ borderLeft: "4px solid #94a3b8" }}>
                    <p className="metric-label">Cancelled Challans</p>
                    <p className="metric-value">{summary.cancelledCount}</p>
                    <p className="metric-subtext">
                      PKR {summary.cancelledAmountPkr.toLocaleString()} Superseded
                    </p>
                  </div>
                  <div className="metric-card info">
                    <p className="metric-label">Realization Rate</p>
                    <p className="metric-value">{summary.realizationRate}%</p>
                    <p className="metric-subtext">Collection vs Demand</p>
                  </div>
                </div>
              );
            })()}

            {/* Filter & Search Controls */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              {/* Lifecycle Status Pills */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {(["ALL", "ISSUED", "RECEIVED", "CANCELLED"] as const).map((st) => {
                  const count =
                    st === "ALL"
                      ? pft2Challans.length
                      : pft2Challans.filter((c) => c.status === st).length;
                  const isActive = pft2StatusFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPft2StatusFilter(st)}
                      style={{
                        padding: "0.4rem 0.85rem",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: isActive ? "#0d3822" : "#cbd5e1",
                        background: isActive ? "#0d3822" : "#ffffff",
                        color: isActive ? "#ffffff" : "#334155",
                        fontWeight: 600,
                        fontSize: "0.825rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {st === "ALL" && "All Types"}
                      {st === "ISSUED" && "⏳ Issued / Pending"}
                      {st === "RECEIVED" && "✓ Received / Discharged"}
                      {st === "CANCELLED" && "✕ Cancelled"} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Search & Category Filter */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  flex: 1,
                  minWidth: "18rem",
                  justifyContent: "flex-end"
                }}
              >
                <input
                  type="text"
                  placeholder="Search Challan #, Demand #, Taxpayer, CNIC..."
                  className="form-control"
                  style={{ maxWidth: "20rem", fontSize: "0.85rem" }}
                  value={pft2SearchQuery}
                  onChange={(e) => setPft2SearchQuery(e.target.value)}
                />
                <select
                  aria-label="Filter by Category"
                  className="form-control"
                  style={{ maxWidth: "16rem", fontSize: "0.85rem" }}
                  value={pft2CategoryFilter}
                  onChange={(e) => setPft2CategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {getStatutoryCategories().map((cat) => (
                    <option key={cat.category_code} value={cat.category_name}>
                      {cat.category_name}
                    </option>
                  ))}
                </select>
                {(pft2SearchQuery ||
                  pft2CategoryFilter !== "ALL" ||
                  pft2StatusFilter !== "ALL") && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setPft2SearchQuery("");
                      setPft2CategoryFilter("ALL");
                      setPft2StatusFilter("ALL");
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Challans Table */}
            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Challan &amp; Notice Ref</th>
                    <th>Security PIN</th>
                    <th>Taxpayer Details</th>
                    <th>Classification &amp; Type</th>
                    <th style={{ textAlign: "right" }}>Amount Payable</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = pft2Challans.filter((c) => {
                      if (pft2StatusFilter !== "ALL" && c.status !== pft2StatusFilter) return false;
                      if (
                        pft2CategoryFilter !== "ALL" &&
                        !c.category.toLowerCase().includes(pft2CategoryFilter.toLowerCase())
                      )
                        return false;
                      if (pft2SearchQuery.trim()) {
                        const q = pft2SearchQuery.toLowerCase();
                        const match =
                          c.challanNumber.toLowerCase().includes(q) ||
                          c.demandNumber.toLowerCase().includes(q) ||
                          (c.noticeNumber && c.noticeNumber.toLowerCase().includes(q)) ||
                          (c.pin && c.pin.includes(q)) ||
                          c.legalName.toLowerCase().includes(q) ||
                          (c.tradeName && c.tradeName.toLowerCase().includes(q)) ||
                          c.identifierValue.toLowerCase().includes(q);
                        if (!match) return false;
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={8}
                            style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}
                          >
                            No Form P.F.T-2 challans match the selected filter criteria.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((challan) => {
                      const isIssued = challan.status === "ISSUED";
                      const isReceived = challan.status === "RECEIVED";
                      const isCancelled = challan.status === "CANCELLED";

                      return (
                        <tr key={challan.id}>
                          <td>
                            <strong>{challan.challanNumber}</strong>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                color: "#1e3a8a",
                                fontWeight: 700,
                                marginTop: "0.15rem",
                                wordBreak: "break-all"
                              }}
                              title="Statutory Form P.F.T-2 Notice Number"
                            >
                              {challan.noticeNumber ??
                                generatePft2NoticeNumber({
                                  demandNumber: challan.demandNumber,
                                  issueDate: challan.issueDate,
                                  formTypeCode: challan.formType,
                                  demandScope: challan.demandScope,
                                  paymentScope: challan.paymentScope,
                                  amount: challan.amountPayable
                                })}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.7rem",
                                color: "#64748b",
                                marginTop: "0.15rem"
                              }}
                            >
                              Demand: {challan.demandNumber} &bull; Issued: {challan.issueDate}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.25rem 0.55rem",
                                borderRadius: "6px",
                                fontFamily: "monospace",
                                fontWeight: 800,
                                fontSize: "0.85rem",
                                background: "#e0f2fe",
                                color: "#0369a1",
                                border: "1px solid #bae6fd",
                                letterSpacing: "1.5px"
                              }}
                              title="Official 6-digit Document Security PIN (دستاویزی تصدیقی پن کوڈ)"
                            >
                              🔐{" "}
                              {challan.pin ??
                                (challan.noticeNumber
                                  ? generateDocumentPin(challan.noticeNumber)
                                  : "—")}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.65rem",
                                color: "#64748b",
                                marginTop: "0.15rem"
                              }}
                            >
                              تصدیقی پن کوڈ
                            </span>
                          </td>
                          <td>
                            <strong>{challan.legalName}</strong>
                            {challan.tradeName && (
                              <span
                                style={{ display: "block", fontSize: "0.75rem", color: "#065f46" }}
                              >
                                {challan.tradeName}
                              </span>
                            )}
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}
                            >
                              {challan.identifierType}: {challan.identifierValue}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a" }}>
                              Class {challan.subclassificationCode ?? challan.category}
                            </span>
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
                            >
                              {challan.category}
                            </span>
                            {challan.tertiarySlab && (
                              <span
                                style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}
                              >
                                Slab: {challan.tertiarySlab}
                              </span>
                            )}
                            <div
                              style={{
                                marginTop: "0.3rem",
                                display: "flex",
                                gap: "0.25rem",
                                flexWrap: "wrap"
                              }}
                            >
                              <span
                                className="badge"
                                style={{
                                  fontSize: "0.65rem",
                                  padding: "0.1rem 0.35rem",
                                  background: "#f1f5f9",
                                  color: "#334155"
                                }}
                              >
                                {challan.formType ?? "STD"}
                              </span>
                              <span
                                className="badge"
                                style={{
                                  fontSize: "0.65rem",
                                  padding: "0.1rem 0.35rem",
                                  background: "#f8fafc",
                                  color: "#475569"
                                }}
                              >
                                {challan.demandScope ?? "CUR"}
                              </span>
                              {challan.paymentScope === "PARTIAL" ? (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "0.1rem 0.35rem",
                                    background: "#fef3c7",
                                    color: "#92400e"
                                  }}
                                  title={`Assessed: PKR ${(challan.fullAssessedAmount ?? challan.amountPayable).toLocaleString()} | Remaining: PKR ${(challan.remainingBalance ?? 0).toLocaleString()}`}
                                >
                                  PARTIAL (Rem: PKR{" "}
                                  {(challan.remainingBalance ?? 0).toLocaleString()})
                                </span>
                              ) : (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "0.1rem 0.35rem",
                                    background: "#f0fdf4",
                                    color: "#166534"
                                  }}
                                >
                                  FULL
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong
                              style={{
                                fontSize: "0.95rem",
                                color: isReceived ? "#166534" : "#0d3822"
                              }}
                            >
                              PKR {challan.amountPayable.toLocaleString()}
                            </strong>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.85rem", color: "#334155" }}>
                              {challan.dueDate}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                isReceived
                                  ? "badge-approved"
                                  : isCancelled
                                    ? "badge-returned"
                                    : "badge-pending"
                              }`}
                            >
                              {isReceived && "✓ RECEIVED"}
                              {isIssued && "⏳ ISSUED"}
                              {isCancelled && "✕ CANCELLED"}
                            </span>
                            {isReceived && challan.receiptNumber && (
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.7rem",
                                  color: "#166534",
                                  fontWeight: 600,
                                  marginTop: "0.25rem"
                                }}
                              >
                                {challan.receiptNumber}
                              </span>
                            )}
                            {isCancelled && challan.cancelledReason && (
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.7rem",
                                  color: "#991b1b",
                                  maxWidth: "12rem",
                                  marginTop: "0.25rem"
                                }}
                              >
                                {challan.cancelledReason}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "0.4rem",
                                flexWrap: "wrap",
                                justifyContent: "flex-end"
                              }}
                            >
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                style={{
                                  backgroundColor: "#1e3a8a",
                                  borderColor: "#1e40af",
                                  color: "#ffffff",
                                  fontWeight: 700
                                }}
                                onClick={() => handlePrintPft2Challan(challan)}
                                title="Print or download authentic 3-copy Form P.F.T-2 Challan anytime"
                              >
                                🖨️ Print / Download
                              </button>

                              {isIssued && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    style={{ backgroundColor: "#047857", borderColor: "#065f46" }}
                                    onClick={() => handleOpenReceivePft2(challan)}
                                    title="Acknowledge bank scroll deposit and convert to official Statutory Receipt"
                                  >
                                    📥 Receive PFT-2 Form
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                                    onClick={() => handleOpenCancelPft2(challan)}
                                    title="Cancel this challan (e.g. for reassessment or error)"
                                  >
                                    ✕ Cancel
                                  </button>
                                </>
                              )}

                              {isReceived && challan.receiptNumber && (
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  style={{
                                    color: "#166534",
                                    borderColor: "#86efac",
                                    fontWeight: 700
                                  }}
                                  onClick={() => {
                                    const rec = statutoryReceipts.find(
                                      (r) => r.receiptNumber === challan.receiptNumber
                                    );
                                    if (rec) {
                                      handleOpenReceiptDocument(rec);
                                    } else {
                                      showToast(
                                        "info",
                                        `Receipt ${challan.receiptNumber} recorded in ledger.`
                                      );
                                    }
                                  }}
                                  title="View official statutory payment receipt"
                                >
                                  🧾 View Receipt
                                </button>
                              )}

                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedUnitId(challan.unitId);
                                  switchTab("FORM_PFT2");
                                }}
                                title="Inspect Form P.F.T-2 3-copy layout"
                              >
                                👁️ View Challan
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB: STATUTORY RECEIPTS & TREASURY COLLECTIONS (RULE 10) */}
        {activeTab === "RECEIPTS" && (
          <section
            className="content-panel"
            aria-label="Statutory Receipts and Treasury Collections"
          >
            <div className="panel-header">
              <div>
                <h2>Statutory Payment Receipts &amp; Treasury Collections (Rule 10)</h2>
                <p>
                  Official provincial repository of payment receipts issued under Rule 10 of the
                  Punjab Professions &amp; Trades Tax Rules, 1977. Features real-time ledger
                  verification, bank scroll reconciliation, search &amp; filter controls, and
                  instant PDF download.
                </p>
              </div>
              <div
                className="panel-actions"
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowReceiptsExecutiveModal(true)}
                  title="View executive statistical collection brief"
                >
                  📊 Executive Collections Brief
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleExportReceiptsCsv}
                  title="Export all Statutory Receipts as RFC-4180 CSV"
                >
                  📥 Export Receipts Ledger (CSV)
                </button>
              </div>
            </div>

            {/* Collection Summary KPIs */}
            {(() => {
              const summary = calculateReceiptsExecutiveSummary(statutoryReceipts);
              const topChannel = Object.entries(summary.channelBreakdown).sort(
                (a, b) => b[1].totalPkr - a[1].totalPkr
              )[0];
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                    gap: "1rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <div className="metric-card success">
                    <p className="metric-label">Total Realized Revenue</p>
                    <p className="metric-value">PKR {summary.totalRevenuePkr.toLocaleString()}</p>
                    <p className="metric-subtext">Provincial Head B01601</p>
                  </div>
                  <div className="metric-card highlight">
                    <p className="metric-label">Total Receipts Issued</p>
                    <p className="metric-value">{summary.totalReceipts}</p>
                    <p className="metric-subtext">Discharged Tax Liabilities</p>
                  </div>
                  <div className="metric-card info">
                    <p className="metric-label">Average Receipt Value</p>
                    <p className="metric-value">PKR {summary.averageReceiptPkr.toLocaleString()}</p>
                    <p className="metric-subtext">Per Discharged Challan</p>
                  </div>
                  <div className="metric-card warning">
                    <p className="metric-label">Primary Treasury Gateway</p>
                    <p
                      className="metric-value"
                      style={{
                        fontSize: "1.05rem",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {topChannel ? topChannel[0] : "National Bank of Pakistan"}
                    </p>
                    <p className="metric-subtext">
                      {topChannel
                        ? `PKR ${topChannel[1].totalPkr.toLocaleString()} (${topChannel[1].count} txns)`
                        : "Verified Treasury"}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Comprehensive Search & Filter Desk */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
                gap: "0.75rem",
                alignItems: "flex-end"
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: "0.25rem"
                  }}
                >
                  Search Keyword:
                </label>
                <input
                  type="text"
                  placeholder="Receipt #, Challan #, Assessee, CPR Ref..."
                  className="form-control"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                  value={receiptSearchQuery}
                  onChange={(e) => setReceiptSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: "0.25rem"
                  }}
                >
                  Date of Receipt (From):
                </label>
                <input
                  type="date"
                  className="form-control"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                  value={receiptDateFrom}
                  onChange={(e) => setReceiptDateFrom(e.target.value)}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: "0.25rem"
                  }}
                >
                  Date of Receipt (To):
                </label>
                <input
                  type="date"
                  className="form-control"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                  value={receiptDateTo}
                  onChange={(e) => setReceiptDateTo(e.target.value)}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: "0.25rem"
                  }}
                >
                  Payment Channel:
                </label>
                <select
                  aria-label="Filter by Payment Channel"
                  className="form-control"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                  value={receiptChannelFilter}
                  onChange={(e) => setReceiptChannelFilter(e.target.value)}
                >
                  <option value="ALL">All Payment Channels</option>
                  <option value="National Bank of Pakistan">National Bank of Pakistan</option>
                  <option value="State Bank of Pakistan">State Bank of Pakistan</option>
                  <option value="ePay Punjab">ePay Punjab (Digital)</option>
                  <option value="Bank of Punjab">Bank of Punjab</option>
                  <option value="Cash Counter">Cash Counter / OTC</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: "0.25rem"
                  }}
                >
                  Statutory Category:
                </label>
                <select
                  aria-label="Filter by Category"
                  className="form-control"
                  style={{ width: "100%", fontSize: "0.85rem" }}
                  value={receiptCategoryFilter}
                  onChange={(e) => setReceiptCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {getStatutoryCategories().map((cat) => (
                    <option key={cat.category_code} value={cat.category_name}>
                      {cat.category_name}
                    </option>
                  ))}
                </select>
              </div>

              {(receiptSearchQuery ||
                receiptDateFrom ||
                receiptDateTo ||
                receiptCategoryFilter !== "ALL" ||
                receiptChannelFilter !== "ALL") && (
                <div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: "100%", fontSize: "0.825rem" }}
                    onClick={() => {
                      setReceiptSearchQuery("");
                      setReceiptDateFrom("");
                      setReceiptDateTo("");
                      setReceiptCategoryFilter("ALL");
                      setReceiptChannelFilter("ALL");
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>

            {/* Receipts Table */}
            <div className="table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Receipt Number &amp; Date</th>
                    <th>Challan &amp; Demand Reference</th>
                    <th>Assessee Details</th>
                    <th>Classification &amp; Slab</th>
                    <th style={{ textAlign: "right" }}>Amount Discharged</th>
                    <th>Treasury Channel &amp; CPR</th>
                    <th>Receiving Officer</th>
                    <th style={{ textAlign: "right" }}>Statutory Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = statutoryReceipts.filter((r) => {
                      if (
                        receiptChannelFilter !== "ALL" &&
                        !r.paymentChannel.toLowerCase().includes(receiptChannelFilter.toLowerCase())
                      )
                        return false;
                      if (
                        receiptCategoryFilter !== "ALL" &&
                        !r.statutoryCategory
                          .toLowerCase()
                          .includes(receiptCategoryFilter.toLowerCase())
                      )
                        return false;
                      if (receiptDateFrom && r.dateOfReceipt < receiptDateFrom) return false;
                      if (receiptDateTo && r.dateOfReceipt > receiptDateTo) return false;
                      if (receiptSearchQuery.trim()) {
                        const q = receiptSearchQuery.toLowerCase();
                        const match =
                          r.receiptNumber.toLowerCase().includes(q) ||
                          r.challanNumber.toLowerCase().includes(q) ||
                          r.demandNumber.toLowerCase().includes(q) ||
                          r.assesseeLegalName.toLowerCase().includes(q) ||
                          (r.assesseeTradeName && r.assesseeTradeName.toLowerCase().includes(q)) ||
                          r.bankScrollRef.toLowerCase().includes(q) ||
                          r.identifierValue.toLowerCase().includes(q);
                        if (!match) return false;
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={8}
                            style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}
                          >
                            No statutory payment receipts match the active query.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          <strong style={{ color: "#065f46" }}>{rec.receiptNumber}</strong>
                          {rec.pin && (
                            <div style={{ marginTop: "0.15rem" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "0.7rem",
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  background: "#e0f2fe",
                                  color: "#0369a1",
                                  padding: "0.1rem 0.35rem",
                                  borderRadius: "3px"
                                }}
                              >
                                🔐 PIN: {rec.pin}
                              </span>
                            </div>
                          )}
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}>
                            {rec.dateOfReceipt} &bull; {rec.timeOfReceipt}
                          </span>
                        </td>
                        <td>
                          <strong>{rec.challanNumber}</strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                            PDN: {rec.demandNumber}
                          </span>
                        </td>
                        <td>
                          <strong>{rec.assesseeLegalName}</strong>
                          {rec.assesseeTradeName && (
                            <span
                              style={{ display: "block", fontSize: "0.75rem", color: "#0d3822" }}
                            >
                              {rec.assesseeTradeName}
                            </span>
                          )}
                          <span
                            style={{ display: "block", fontSize: "0.725rem", color: "#64748b" }}
                          >
                            {rec.identifierType}: {rec.identifierValue}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                            Class {rec.subclassificationCode}
                          </span>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}>
                            {rec.statutoryCategory}
                          </span>
                          <span style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}>
                            {rec.tertiarySlab}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong style={{ fontSize: "1rem", color: "#15803d" }}>
                            PKR {rec.amountPaidPkr.toLocaleString()}
                          </strong>
                          <span style={{ display: "block", fontSize: "0.7rem", color: "#166534" }}>
                            ✓ FULLY CREDITED
                          </span>
                        </td>
                        <td>
                          <strong>{rec.paymentChannel}</strong>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              fontFamily: "monospace",
                              color: "#1e3a8a"
                            }}
                          >
                            Ref: {rec.bankScrollRef}
                          </span>
                          {rec.bankBranch && (
                            <span
                              style={{ display: "block", fontSize: "0.7rem", color: "#64748b" }}
                            >
                              {rec.bankBranch}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: "0.825rem", fontWeight: 600 }}>
                            {rec.receivingOfficerName}
                          </span>
                          <span
                            style={{ display: "block", fontSize: "0.725rem", color: "#64748b" }}
                          >
                            {rec.receivingOfficerTitle}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => handleOpenReceiptDocument(rec)}
                              title="View official statutory receipt document"
                            >
                              👁️ View
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                handleOpenReceiptDocument(rec);
                                setTimeout(() => {
                                  downloadDocumentPdf(
                                    "receipt-document-card",
                                    `Statutory_Receipt_${rec.receiptNumber}.pdf`
                                  );
                                }, 300);
                              }}
                              title="Download statutory receipt as PDF"
                            >
                              📥 PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
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

        {/* TAB: VISUAL INTELLIGENCE & ANALYTICS DASHBOARD (SECTION 15) */}
        {(activeTab === "ANALYTICS" || activeTab === "MIS_HUB") && (
          <section className="tab-panel" aria-label="Visual Intelligence and Analytics Dashboard">
            {/* Analytics Perspective Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #064e3b 100%)",
                borderRadius: "10px",
                padding: "1.5rem",
                color: "#ffffff",
                marginBottom: "1.5rem",
                boxShadow: "0 4px 12px rgba(13, 56, 34, 0.15)",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem"
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.35rem"
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>📊</span>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#ffffff", fontWeight: 700 }}>
                    Visual Intelligence &amp; Executive Analytics Dashboard
                  </h3>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em"
                    }}
                  >
                    ALL-ROLES INCLUSIVE
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#d1fae5" }}>
                  Real-time derived statutory intelligence &amp; visual indicators &bull; Second
                  Schedule (Categories 1–11) &bull; Circle-Vehari
                </p>

                {/* Perspective Selector Bar */}
                <div
                  style={{
                    marginTop: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap"
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: "#a7f3d0", fontWeight: 600 }}>
                    🎯 Active Perspective:
                  </span>
                  <div
                    style={{
                      display: "inline-flex",
                      background: "rgba(0,0,0,0.25)",
                      borderRadius: "6px",
                      padding: "2px"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setDashboardPerspective("AUTO")}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: dashboardPerspective === "AUTO" ? "#ffffff" : "transparent",
                        color: dashboardPerspective === "AUTO" ? "#064e3b" : "#d1fae5",
                        transition: "all 0.15s ease"
                      }}
                    >
                      ⚡ Auto ({officer.role})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardPerspective("INSPECTOR")}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background:
                          dashboardPerspective === "INSPECTOR" ? "#ffffff" : "transparent",
                        color: dashboardPerspective === "INSPECTOR" ? "#064e3b" : "#d1fae5",
                        transition: "all 0.15s ease"
                      }}
                    >
                      👤 Inspector
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardPerspective("ETO")}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: dashboardPerspective === "ETO" ? "#ffffff" : "transparent",
                        color: dashboardPerspective === "ETO" ? "#064e3b" : "#d1fae5",
                        transition: "all 0.15s ease"
                      }}
                    >
                      ⚖️ ETO
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardPerspective("DIRECTOR")}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: dashboardPerspective === "DIRECTOR" ? "#ffffff" : "transparent",
                        color: dashboardPerspective === "DIRECTOR" ? "#064e3b" : "#d1fae5",
                        transition: "all 0.15s ease"
                      }}
                    >
                      🏛️ Director
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("REPORTS")}
                  className="btn-primary"
                  style={{
                    background: "#059669",
                    borderColor: "#047857",
                    color: "#ffffff",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <span>📑</span>
                  <span>Open Detailed Reports</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExecutiveReportType("EXECUTIVE_MIS_SUMMARY");
                    setShowExecutivePrintModal(true);
                  }}
                  className="btn-primary"
                  style={{
                    background: "#f59e0b",
                    borderColor: "#d97706",
                    color: "#78350f",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <span>🖨️</span>
                  <span>Print Executive Brief</span>
                </button>
              </div>
            </div>

            {/* TOP 4 VISUAL GAUGES & PROGRESS METERS */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              {/* Visual Indicator 1: Budget Target Realization */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem"
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase"
                    }}
                  >
                    Target Realization
                  </span>
                  <span
                    style={{
                      background:
                        misMetrics.kpis.targetRealizationPct >= 100 ? "#dcfce7" : "#fef3c7",
                      color: misMetrics.kpis.targetRealizationPct >= 100 ? "#166534" : "#92400e",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 700
                    }}
                  >
                    {misMetrics.kpis.targetRealizationPct >= 100 ? "On Target" : "Pacing Required"}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "1.85rem",
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: "0.5rem"
                  }}
                >
                  {misMetrics.kpis.targetRealizationPct}%
                </div>
                {/* Visual Progress Gauge */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "0.5rem"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(misMetrics.kpis.targetRealizationPct, 100)}%`,
                      height: "100%",
                      background:
                        misMetrics.kpis.targetRealizationPct >= 100
                          ? "#16a34a"
                          : misMetrics.kpis.targetRealizationPct >= 75
                            ? "#d97706"
                            : "#dc2626",
                      borderRadius: "4px",
                      transition: "width 0.4s ease"
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  PKR {misMetrics.kpis.totalRealizedRecovery.toLocaleString()} of PKR{" "}
                  {misMetrics.kpis.baselineBudgetTargetPkr.toLocaleString()} Target
                </p>
              </div>

              {/* Visual Indicator 2: Revenue Recovery Rate */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem"
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase"
                    }}
                  >
                    Recovery Realization
                  </span>
                  <span
                    style={{
                      background: "#dbeafe",
                      color: "#1e40af",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 700
                    }}
                  >
                    {misMetrics.kpis.paidUnitsCount} / {misMetrics.kpis.totalUnitsCount} Units
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "1.85rem",
                    fontWeight: 800,
                    color: "#166534",
                    marginBottom: "0.5rem"
                  }}
                >
                  {misMetrics.kpis.recoveryRatePct}%
                </div>
                {/* Visual Progress Gauge */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "0.5rem"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(misMetrics.kpis.recoveryRatePct, 100)}%`,
                      height: "100%",
                      background: "#16a34a",
                      borderRadius: "4px",
                      transition: "width 0.4s ease"
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  PKR {misMetrics.kpis.totalRealizedRecovery.toLocaleString()} of PKR{" "}
                  {misMetrics.kpis.totalAssessedGross.toLocaleString()} Gross Demand
                </p>
              </div>

              {/* Visual Indicator 3: Defaulter Exposure */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem"
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase"
                    }}
                  >
                    Defaulter Exposure
                  </span>
                  <span
                    style={{
                      background: misMetrics.kpis.defaulterUnitsCount > 0 ? "#fee2e2" : "#dcfce7",
                      color: misMetrics.kpis.defaulterUnitsCount > 0 ? "#991b1b" : "#166534",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 700
                    }}
                  >
                    {misMetrics.kpis.defaulterUnitsCount} Defaulters
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "1.85rem",
                    fontWeight: 800,
                    color: "#b91c1c",
                    marginBottom: "0.5rem"
                  }}
                >
                  {Math.round(
                    (misMetrics.kpis.outstandingArrears /
                      (misMetrics.kpis.totalAssessedGross || 1)) *
                      100
                  )}
                  %
                </div>
                {/* Visual Progress Gauge */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "0.5rem"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(
                        Math.round(
                          (misMetrics.kpis.outstandingArrears /
                            (misMetrics.kpis.totalAssessedGross || 1)) *
                            100
                        ),
                        100
                      )}%`,
                      height: "100%",
                      background: "#dc2626",
                      borderRadius: "4px",
                      transition: "width 0.4s ease"
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  PKR {misMetrics.kpis.outstandingArrears.toLocaleString()} Arrears at Risk
                </p>
              </div>

              {/* Visual Indicator 4: Rule 6 Service Coverage */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem"
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase"
                    }}
                  >
                    Notice Service Rate
                  </span>
                  <span
                    style={{
                      background: "#e0e7ff",
                      color: "#3730a3",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 700
                    }}
                  >
                    Rule 6 Compliance
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "1.85rem",
                    fontWeight: 800,
                    color: "#1e40af",
                    marginBottom: "0.5rem"
                  }}
                >
                  {misMetrics.roleMetrics.inspector.serviceCoveragePct}%
                </div>
                {/* Visual Progress Gauge */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "0.5rem"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(misMetrics.roleMetrics.inspector.serviceCoveragePct, 100)}%`,
                      height: "100%",
                      background: "#2563eb",
                      borderRadius: "4px",
                      transition: "width 0.4s ease"
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  {misMetrics.roleMetrics.inspector.servedNoticesCount} Served &bull;{" "}
                  {misMetrics.roleMetrics.inspector.unservedNoticesCount} Pending Service
                </p>
              </div>
            </div>

            {/* ROLE-TAILORED OPERATIONAL PERSPECTIVE METRICS */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "1.25rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem"
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: "1rem", color: "#0f172a", fontWeight: 700 }}>
                    {effectivePerspective === "INSPECTOR" &&
                      "👤 Inspector Field Operations Health & Service Metrics"}
                    {effectivePerspective === "ETO" &&
                      "⚖️ Assessing Authority (ETO) Adjudication & Order Pipeline"}
                    {effectivePerspective === "DIRECTOR" &&
                      "🏛️ Directorate Governance & Divisional Revenue Integrity"}
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Tailored operational intelligence for role:{" "}
                    <strong>{effectivePerspective}</strong>
                  </p>
                </div>
                <span
                  style={{
                    background: "#e2e8f0",
                    color: "#334155",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.6rem",
                    borderRadius: "4px"
                  }}
                >
                  ROLE PERSPECTIVE: {effectivePerspective}
                </span>
              </div>

              {/* Inspector Specific Stats */}
              {effectivePerspective === "INSPECTOR" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem"
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Total Assigned Units
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#0f172a",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.inspector.totalAssignedUnits}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Circle-Vehari Registry
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Rule 6 Notices Served
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#166534",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.inspector.servedNoticesCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                      {misMetrics.roleMetrics.inspector.serviceCoveragePct}% Coverage
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Unserved Notices
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#d97706",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.inspector.unservedNoticesCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b45309" }}>
                      Pending Field Service
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Pending Inspections
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#dc2626",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.inspector.pendingInspectionsCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b91c1c" }}>
                      Premises Verification Backlog
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Field Compliance Rate
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#2563eb",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.inspector.fieldComplianceRatePct}%
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#1d4ed8" }}>
                      Surveyed &amp; Verified
                    </span>
                  </div>
                </div>
              )}

              {/* ETO Specific Stats */}
              {effectivePerspective === "ETO" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem"
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Pending Determinations
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#d97706",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.eto.pendingAssessmentsCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b45309" }}>Awaiting Approval</span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Approved Assessments
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#166534",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.eto.approvedAssessmentsCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                      Form P.F.T-2 Orders
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      S.3(4) Penalty Eligible
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#dc2626",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.eto.penaltyEligibleCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b91c1c" }}>
                      Eligible for Notice
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Land Revenue Warrants
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#7c2d12",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.eto.recoveryCertificatesCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#9a3412" }}>
                      Section 67 Arrears Roll
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Total Adjudicated Relief
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#0284c7",
                        marginTop: "0.25rem"
                      }}
                    >
                      PKR {misMetrics.roleMetrics.eto.totalAdjudicatedReliefPkr.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#0369a1" }}>
                      Rule 10 &amp; Rule 5 Credits
                    </span>
                  </div>
                </div>
              )}

              {/* Director Specific Stats */}
              {effectivePerspective === "DIRECTOR" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem"
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Circle Target Pacing
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#166534",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.director.circleTargetRealizationPct}%
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                      Provincial Budget Benchmark
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Divisional Recovery Pool
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#0f172a",
                        marginTop: "0.25rem"
                      }}
                    >
                      PKR{" "}
                      {misMetrics.roleMetrics.director.divisionalCollectionTotalPkr.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Multan Division Baseline
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Total Defaulter Exposure
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#dc2626",
                        marginTop: "0.25rem"
                      }}
                    >
                      PKR{" "}
                      {misMetrics.roleMetrics.director.totalDefaulterExposurePkr.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b91c1c" }}>
                      Circle-Vehari Arrears
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Appellate Backlog
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#d97706",
                        marginTop: "0.25rem"
                      }}
                    >
                      {misMetrics.roleMetrics.director.pendingAppealsCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#b45309" }}>
                      Pending Statutory Disposal
                    </span>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                      Circle Integrity Status
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        color: "#166534",
                        marginTop: "0.25rem"
                      }}
                    >
                      OPTIMAL
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                      Immutable Double-Entry Intact
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* FINANCIAL SUMMARY STATISTICS CARDS */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  Assessed Demand (Gross)
                </span>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginTop: "0.25rem"
                  }}
                >
                  PKR {misMetrics.kpis.totalAssessedGross.toLocaleString()}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                  Base: PKR {misMetrics.kpis.assessedDemand.toLocaleString()} &bull; Penalties: PKR{" "}
                  {misMetrics.kpis.penaltyDemand.toLocaleString()}
                </span>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  Baseline Budget Target
                </span>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginTop: "0.25rem"
                  }}
                >
                  PKR {misMetrics.kpis.baselineBudgetTargetPkr.toLocaleString()}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                  Annual Provincial Finance Allocation
                </span>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  Realized Recovery
                </span>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#166534",
                    marginTop: "0.25rem"
                  }}
                >
                  PKR {misMetrics.kpis.totalRealizedRecovery.toLocaleString()}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#166534" }}>
                  Challan 32-A &amp; 1Link ePay Deposited
                </span>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  Outstanding Arrears
                </span>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#dc2626",
                    marginTop: "0.25rem"
                  }}
                >
                  PKR {misMetrics.kpis.outstandingArrears.toLocaleString()}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#b91c1c" }}>
                  {misMetrics.kpis.defaulterUnitsCount} Overdue Assessees
                </span>
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  Statutory Penalties
                </span>
                <div
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    color: "#d97706",
                    marginTop: "0.25rem"
                  }}
                >
                  PKR {misMetrics.kpis.penaltyDemand.toLocaleString()}
                </div>
                <span style={{ fontSize: "0.72rem", color: "#b45309" }}>
                  Imposed under Section 3(4)
                </span>
              </div>
            </div>

            {/* VISUAL CATEGORY YIELD COMPARATIVE BARS */}
            <div className="table-card" style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    🏢 Statutory Category Yield Distribution (Second Schedule, Section 3)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Comparative visual realization across all 11 schedule entries &bull; Realized vs
                    Assessed
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span
                    style={{
                      background: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600
                    }}
                  >
                    11 Categories Active
                  </span>
                </div>
              </div>

              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {misMetrics.categoryYields.map((cat) => {
                    const pct = cat.compliancePct;
                    return (
                      <div
                        key={cat.categoryCode}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "0.75rem 1rem"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.35rem",
                            flexWrap: "wrap",
                            gap: "0.5rem"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span
                              style={{
                                background: "#0d3822",
                                color: "#ffffff",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 700
                              }}
                            >
                              Cat {cat.categoryCode}
                            </span>
                            <span
                              style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" }}
                            >
                              {cat.categoryName}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "1rem",
                              fontSize: "0.8rem"
                            }}
                          >
                            <span style={{ color: "#64748b" }}>
                              Units: <strong>{cat.unitCount}</strong> registered
                            </span>
                            <span style={{ color: "#166534", fontWeight: 700 }}>
                              PKR {cat.realizedRecovery.toLocaleString()}
                            </span>
                            <span style={{ color: "#64748b" }}>
                              of PKR {cat.totalDemand.toLocaleString()}
                            </span>
                            <span
                              style={{
                                background:
                                  pct >= 80 ? "#dcfce7" : pct >= 50 ? "#fef3c7" : "#fee2e2",
                                color: pct >= 80 ? "#166534" : pct >= 50 ? "#92400e" : "#991b1b",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                fontWeight: 700,
                                fontSize: "0.75rem"
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>

                        {/* Comparative Visual Bar */}
                        <div
                          style={{
                            width: "100%",
                            height: "6px",
                            background: "#f1f5f9",
                            borderRadius: "3px",
                            overflow: "hidden"
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: "100%",
                              background:
                                pct >= 80
                                  ? "linear-gradient(90deg, #16a34a, #22c55e)"
                                  : pct >= 50
                                    ? "linear-gradient(90deg, #d97706, #f59e0b)"
                                    : "linear-gradient(90deg, #dc2626, #ef4444)",
                              borderRadius: "3px",
                              transition: "width 0.4s ease"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* STATUTORY SECOND SCHEDULE SUB-CLASS & TERTIARY SLABS DISTRIBUTION (47 ENTRIES) */}
            <div className="table-card" style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    📋 Statutory Second Schedule Sub-Class &amp; Tertiary Slab Distribution (47
                    Entries)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Exact statutory rate tiers, capital thresholds, employee counts, and geographic
                    classifications under Section 3 &amp; Second Schedule
                  </p>
                </div>
                <div
                  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
                >
                  <select
                    className="form-control"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem", minWidth: "13rem" }}
                    value={slabCategoryFilter}
                    onChange={(e) => setSlabCategoryFilter(e.target.value)}
                    aria-label="Filter Slabs by Primary Category"
                  >
                    <option value="ALL">All Categories (1–11)</option>
                    <option value="1">1: Companies (Paid Up Capital)</option>
                    <option value="2">2: Persons (Other than Companies)</option>
                    <option value="3">3: Factories, Shops &amp; Commercial</option>
                    <option value="4">4: Contractors, Suppliers, Consultants</option>
                    <option value="5">5: Doctors &amp; Medical Practitioners</option>
                    <option value="6">6: Legal Practitioners &amp; Lawyers</option>
                    <option value="7">7: Auditors &amp; Accountants</option>
                    <option value="8">8: Architects, Engineers, Town Planners</option>
                    <option value="9">9: Real Estate / Property Dealers</option>
                    <option value="10">10: Motor Vehicle Dealers</option>
                    <option value="11">11: Money Changers / Foreign Exchange</option>
                  </select>
                  <input
                    type="text"
                    className="form-control"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem", minWidth: "12rem" }}
                    placeholder="Search sub-class or slab..."
                    value={slabSearchQuery}
                    onChange={(e) => setSlabSearchQuery(e.target.value)}
                    aria-label="Search Statutory Slabs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      downloadCsvFile(
                        "PTAS_Statutory_Slab_Distribution_Vehari_2026.csv",
                        exportStatutorySlabDistributionCsv(misMetrics.slabYields, "2024-2025")
                      );
                      showToast("success", "Statutory Slab Distribution CSV downloaded.");
                    }}
                    className="btn-secondary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <span>📥</span>
                    <span>Export Slabs CSV</span>
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", width: "5.5rem" }}>Class Code</th>
                      <th style={{ textAlign: "left" }}>Schedule Category</th>
                      <th style={{ textAlign: "left" }}>Tertiary Slab / Criteria</th>
                      <th style={{ textAlign: "right" }}>Statutory Rate</th>
                      <th style={{ textAlign: "center" }}>Units</th>
                      <th style={{ textAlign: "right" }}>Assessed Demand</th>
                      <th style={{ textAlign: "right" }}>Realized Recovery</th>
                      <th style={{ textAlign: "right" }}>Outstanding Arrears</th>
                      <th style={{ textAlign: "center" }}>Recovery %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misMetrics.slabYields
                      .filter((slab) => {
                        const matchesCat =
                          slabCategoryFilter === "ALL" || slab.categoryCode === slabCategoryFilter;
                        const q = slabSearchQuery.trim().toLowerCase();
                        const matchesQuery =
                          !q ||
                          (slab.ruleCode?.toLowerCase().includes(q) ?? false) ||
                          (slab.statutoryTertiaryCode?.toLowerCase().includes(q) ?? false) ||
                          (slab.subclassificationCode?.toLowerCase().includes(q) ?? false) ||
                          (slab.tertiarySlab?.toLowerCase().includes(q) ?? false) ||
                          slab.categoryName.toLowerCase().includes(q);
                        return matchesCat && matchesQuery;
                      })
                      .map((slab) => {
                        const specificCode =
                          slab.ruleCode ??
                          slab.statutoryTertiaryCode ??
                          slab.subclassificationCode ??
                          `Class ${slab.categoryCode}`;
                        return (
                          <tr
                            key={slab.ruleId}
                            style={{
                              backgroundColor: slab.assessedUnitsCount > 0 ? "#f0fdf4" : undefined
                            }}
                          >
                            <td style={{ fontWeight: 700, color: "#0d3822" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  fontFamily: "monospace",
                                  fontSize: "0.82rem"
                                }}
                              >
                                {specificCode}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, display: "block" }}>
                                {slab.categoryName}
                              </span>
                              {slab.subclassificationCode &&
                                slab.subclassificationCode !== specificCode && (
                                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                    Entry Clause: {slab.subclassificationCode}
                                  </span>
                                )}
                            </td>
                            <td style={{ color: "#334155" }}>
                              {slab.subclassificationLabel &&
                              slab.statutoryTertiaryClassification ? (
                                <div>
                                  <strong
                                    style={{
                                      display: "block",
                                      color: "#0f172a",
                                      fontSize: "0.82rem"
                                    }}
                                  >
                                    {slab.subclassificationLabel}
                                  </strong>
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#166534",
                                      display: "inline-block",
                                      marginTop: "0.15rem"
                                    }}
                                  >
                                    📍 {slab.statutoryTertiaryClassification}
                                  </span>
                                </div>
                              ) : (
                                (slab.tertiarySlab ?? "—")
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#166534" }}>
                              PKR {slab.slabRatePkr.toLocaleString()}
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.7rem",
                                  color: "#64748b",
                                  fontWeight: 400
                                }}
                              >
                                {slab.rateBasis}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  fontWeight: 700,
                                  background: slab.assessedUnitsCount > 0 ? "#dcfce7" : "#f1f5f9",
                                  color: slab.assessedUnitsCount > 0 ? "#166534" : "#64748b"
                                }}
                              >
                                {slab.assessedUnitsCount}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              PKR {slab.assessedDemandPkr.toLocaleString()}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600, color: "#166534" }}>
                              PKR {slab.realizedRecoveryPkr.toLocaleString()}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontWeight: 600,
                                color: slab.outstandingArrearsPkr > 0 ? "#dc2626" : "#64748b"
                              }}
                            >
                              PKR {slab.outstandingArrearsPkr.toLocaleString()}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.15rem 0.4rem",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  background:
                                    slab.recoveryRatePct >= 80
                                      ? "#dcfce7"
                                      : slab.recoveryRatePct >= 50
                                        ? "#fef3c7"
                                        : "#fee2e2",
                                  color:
                                    slab.recoveryRatePct >= 80
                                      ? "#166534"
                                      : slab.recoveryRatePct >= 50
                                        ? "#92400e"
                                        : "#991b1b"
                                }}
                              >
                                {slab.recoveryRatePct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DEFAULTER RECOVERY & AGING FUNNEL (VISUAL PIPELINE) */}
            <div className="table-card" style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    ⚠️ Statutory Defaulter Recovery &amp; Aging Funnel (Section 3(4) &amp; Rule 12)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Visual progressive enforcement pipeline from notice service to Land Revenue
                    arrears certification
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("REPORTS");
                    setActiveReportTab("DEFAULTER_ROLL");
                  }}
                  className="btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <span>📑</span>
                  <span>Inspect Full Defaulter Roll &rarr;</span>
                </button>
              </div>

              <div style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem"
                  }}
                >
                  {/* Pipeline Stage 0 */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "1rem",
                      borderTop: "4px solid #3b82f6"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Current (1–30 Days)
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0.35rem 0"
                      }}
                    >
                      {misMetrics.defaulterFunnel.current.count} Units
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#2563eb",
                        marginBottom: "0.5rem"
                      }}
                    >
                      PKR {misMetrics.defaulterFunnel.current.amount.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Action: Standard Challan 32-A Active
                    </span>
                  </div>

                  {/* Pipeline Stage 1 */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "1rem",
                      borderTop: "4px solid #f59e0b"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Stage 1 (31–60 Days)
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0.35rem 0"
                      }}
                    >
                      {misMetrics.defaulterFunnel.overdue30Days.count} Units
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#d97706",
                        marginBottom: "0.5rem"
                      }}
                    >
                      PKR {misMetrics.defaulterFunnel.overdue30Days.amount.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Action: Form P.F.T-1 Final Reminder
                    </span>
                  </div>

                  {/* Pipeline Stage 2 */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "1rem",
                      borderTop: "4px solid #ea580c"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Stage 2 (61–90 Days)
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0.35rem 0"
                      }}
                    >
                      {misMetrics.defaulterFunnel.penaltyEligible.count} Units
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#ea580c",
                        marginBottom: "0.5rem"
                      }}
                    >
                      PKR {misMetrics.defaulterFunnel.penaltyEligible.amount.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Action: Section 3(4) Show Cause Notice
                    </span>
                  </div>

                  {/* Pipeline Stage 3 */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "1rem",
                      borderTop: "4px solid #dc2626"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Stage 3 (91–180 Days)
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0.35rem 0"
                      }}
                    >
                      {misMetrics.defaulterFunnel.penalized.count} Units
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#dc2626",
                        marginBottom: "0.5rem"
                      }}
                    >
                      PKR {misMetrics.defaulterFunnel.penalized.amount.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Action: 100% Penalty Compounded
                    </span>
                  </div>

                  {/* Pipeline Stage 4 */}
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "1rem",
                      borderTop: "4px solid #7f1d1d"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Stage 4 (181+ Days)
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0.35rem 0"
                      }}
                    >
                      {misMetrics.defaulterFunnel.recoveryCertified.count} Units
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#991b1b",
                        marginBottom: "0.5rem"
                      }}
                    >
                      PKR {misMetrics.defaulterFunnel.recoveryCertified.amount.toLocaleString()}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Action: Land Revenue S.67 Referral
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB: STATUTORY REGISTERS & DETAILED REVENUE REPORTING STUDIO */}
        {activeTab === "REPORTS" && (
          <section className="tab-panel" aria-label="Statutory Reports Studio">
            {/* Header Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #0f766e 0%, #0e7490 100%)",
                borderRadius: "10px",
                padding: "1.5rem",
                color: "#ffffff",
                marginBottom: "1.5rem",
                boxShadow: "0 4px 12px rgba(15, 118, 110, 0.15)",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem"
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.35rem"
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>📑</span>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#ffffff", fontWeight: 700 }}>
                    Statutory Registers &amp; Detailed Revenue Reporting Studio
                  </h3>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em"
                    }}
                  >
                    AUDIT-READY REGISTERS
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#ccfbf1" }}>
                  Official gazetted registers, audit-ready demand rolls, and compliance verification
                  sheets &bull; Second Schedule (Categories 1–11) &bull; Circle-Vehari
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("ANALYTICS")}
                  className="btn-secondary"
                  style={{
                    background: "rgba(255, 255, 255, 0.15)",
                    borderColor: "rgba(255, 255, 255, 0.4)",
                    color: "#ffffff",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <span>📊</span>
                  <span>View Visual Analytics</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportActiveReportCsv}
                  className="btn-primary"
                  style={{
                    background: "#ffffff",
                    borderColor: "#ffffff",
                    color: "#0f766e",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <span>⬇️</span>
                  <span>Export Active Register (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintActiveReport}
                  className="btn-primary"
                  style={{
                    background: "#f59e0b",
                    borderColor: "#d97706",
                    color: "#78350f",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <span>🖨️</span>
                  <span>Print Gazette Report</span>
                </button>
              </div>
            </div>

            {/* Sub-Tabs: 5 Statutory Registers */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
                borderBottom: "2px solid #e2e8f0",
                paddingBottom: "0.75rem"
              }}
              role="tablist"
              aria-label="Statutory Registers Selector"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "PFT3_REGISTER"}
                onClick={() => setActiveReportTab("PFT3_REGISTER")}
                className={`tab-btn ${activeReportTab === "PFT3_REGISTER" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                📋 Form P.F.T-3 Register ({units.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "DEFAULTER_ROLL"}
                onClick={() => setActiveReportTab("DEFAULTER_ROLL")}
                className={`tab-btn ${activeReportTab === "DEFAULTER_ROLL" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                🚨 Defaulter &amp; Arrears Roll (
                {units.filter((u) => computeLedgerBalance(u.ledgerEntries) > 0).length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "NOTICE_DISPATCH"}
                onClick={() => setActiveReportTab("NOTICE_DISPATCH")}
                className={`tab-btn ${activeReportTab === "NOTICE_DISPATCH" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                📬 Notice Dispatch Sheet ({circleDispatchRegisterData.rows.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "CLEARANCE_LOG"}
                onClick={() => setActiveReportTab("CLEARANCE_LOG")}
                className={`tab-btn ${activeReportTab === "CLEARANCE_LOG" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                📜 Clearance Certificate Log ({clearanceCertificates.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "RELIEF_REGISTER"}
                onClick={() => setActiveReportTab("RELIEF_REGISTER")}
                className={`tab-btn ${activeReportTab === "RELIEF_REGISTER" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                ⚖️ Statutory Relief Register ({discontinuances.length + refundAdjustments.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "SLAB_DISTRIBUTION"}
                onClick={() => setActiveReportTab("SLAB_DISTRIBUTION")}
                className={`tab-btn ${activeReportTab === "SLAB_DISTRIBUTION" ? "active" : ""}`}
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px"
                }}
              >
                📊 Statutory Slabs Distribution (47)
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "1rem",
                background: "#ffffff",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flex: 1,
                  minWidth: "280px"
                }}
              >
                <span style={{ fontSize: "1rem" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Filter records by legal name, CNIC, PDN, category, ref..."
                  value={reportSearchQuery}
                  onChange={(e) => setReportSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.65rem",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem"
                  }}
                />
                {reportSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setReportSearchQuery("")}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      color: "#64748b"
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {activeReportTab === "PFT3_REGISTER" &&
                  `Showing ${filteredPft3Units.length} of ${units.length} Assessees`}
                {activeReportTab === "DEFAULTER_ROLL" &&
                  `Showing ${filteredDefaulterUnits.length} Defaulters`}
                {activeReportTab === "NOTICE_DISPATCH" &&
                  `Showing ${filteredDispatchRows.length} Dispatch Entries`}
                {activeReportTab === "CLEARANCE_LOG" &&
                  `Showing ${filteredClearanceCerts.length} Issued Certificates`}
                {activeReportTab === "RELIEF_REGISTER" &&
                  `Showing ${filteredReliefRecords.length} Relief Actions`}
                {activeReportTab === "SLAB_DISTRIBUTION" &&
                  `Showing ${misMetrics.slabYields.length} Statutory Slabs`}
              </div>
            </div>

            {/* REGISTER TABLE 1: Form P.F.T-3 Assessment & Demand Register */}
            {activeReportTab === "PFT3_REGISTER" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    📋 Form P.F.T-3 Assessment &amp; Demand Register (Rule 11)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Official statutory register of assessed professions and trades &bull; Financial
                    Year 2026-27 &bull; Circle-Vehari
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>PDN</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Assessee Legal Name
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Trade Name</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>CNIC / NTN</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Category / Entry</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Base Demand</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>S.3(4) Penalty</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Realized</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Balance Arrears</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Status</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPft3Units.length === 0 ? (
                        <tr>
                          <td
                            colSpan={11}
                            style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}
                          >
                            No assessees match search query "{reportSearchQuery}".
                          </td>
                        </tr>
                      ) : (
                        filteredPft3Units.map((u) => {
                          const baseTax = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                          let penalty = 0;
                          let paid = 0;
                          for (const e of u.ledgerEntries) {
                            if (e.entryType === "PENALTY_DEMAND") penalty += e.amount;
                            if (e.amount < 0) paid += Math.abs(e.amount);
                          }
                          const bal = computeLedgerBalance(u.ledgerEntries);
                          return (
                            <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  fontFamily: "monospace",
                                  fontWeight: 600
                                }}
                              >
                                {u.demandUnit.permanentDemandNo}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                <strong>{u.legalName}</strong>
                              </td>
                              <td style={{ padding: "0.6rem", color: "#475569" }}>{u.tradeName}</td>
                              <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>
                                {u.identifierValue}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                <span
                                  style={{
                                    background: "#f1f5f9",
                                    padding: "0.15rem 0.4rem",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem"
                                  }}
                                >
                                  Cat {u.statutoryRule.category_code}{" "}
                                  {u.statutoryRule.subclassification_code
                                    ? `(${u.statutoryRule.subclassification_code})`
                                    : "(Direct Rate)"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace"
                                }}
                              >
                                PKR {baseTax.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: penalty > 0 ? "#b91c1c" : undefined
                                }}
                              >
                                {penalty > 0 ? `PKR ${penalty.toLocaleString()}` : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: "#166534"
                                }}
                              >
                                {paid > 0 ? `PKR ${paid.toLocaleString()}` : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  color: bal > 0 ? "#b91c1c" : "#166534"
                                }}
                              >
                                PKR {bal.toLocaleString()}
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                <span
                                  className={`badge ${bal <= 0 ? "badge-approved" : "badge-returned"}`}
                                >
                                  {bal <= 0 ? "PAID" : "ARREARS"}
                                </span>
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                {renderUnitActionsDropdown(u)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={5} style={{ padding: "0.6rem" }}>
                          Total ({filteredPft3Units.length} Assessees)
                        </td>
                        <td
                          style={{ padding: "0.6rem", textAlign: "right", fontFamily: "monospace" }}
                        >
                          PKR{" "}
                          {filteredPft3Units
                            .reduce(
                              (sum, u) => sum + (u.assessmentVersions[0]?.snapshot.taxAmount ?? 0),
                              0
                            )
                            .toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#b91c1c"
                          }}
                        >
                          PKR{" "}
                          {filteredPft3Units
                            .reduce((sum, u) => {
                              let p = 0;
                              for (const e of u.ledgerEntries)
                                if (e.entryType === "PENALTY_DEMAND") p += e.amount;
                              return sum + p;
                            }, 0)
                            .toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#166534"
                          }}
                        >
                          PKR{" "}
                          {filteredPft3Units
                            .reduce((sum, u) => {
                              let pd = 0;
                              for (const e of u.ledgerEntries)
                                if (e.amount < 0) pd += Math.abs(e.amount);
                              return sum + pd;
                            }, 0)
                            .toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#0f172a"
                          }}
                        >
                          PKR{" "}
                          {filteredPft3Units
                            .reduce((sum, u) => sum + computeLedgerBalance(u.ledgerEntries), 0)
                            .toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* REGISTER TABLE 2: Defaulter & Arrears Recovery Roll */}
            {activeReportTab === "DEFAULTER_ROLL" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#b91c1c", fontWeight: 700 }}>
                    🚨 Defaulter &amp; Arrears Recovery Roll (Section 3(4) &amp; Land Revenue S.67)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Statutory schedule of units with outstanding demand, progressive aging stages
                    &amp; coercive enforcement status
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>PDN</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Defaulter Name</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>CNIC / NTN</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Overdue Days</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Aging Status</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Base Demand</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>S.3(4) Penalty</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Total Arrears</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Statutory Enforcement Action
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDefaulterUnits.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            style={{ padding: "2rem", textAlign: "center", color: "#166534" }}
                          >
                            No outstanding defaulters matching search criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredDefaulterUnits.map((u) => {
                          const bal = computeLedgerBalance(u.ledgerEntries);
                          const baseTax = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                          let penalty = 0;
                          for (const e of u.ledgerEntries) {
                            if (e.entryType === "PENALTY_DEMAND") penalty += e.amount;
                          }
                          const aging = computeDefaulterAging(
                            u.ledgerEntries,
                            "2026-08-31",
                            undefined,
                            Boolean(u.isRecoveryCertified)
                          );
                          return (
                            <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  fontFamily: "monospace",
                                  fontWeight: 600
                                }}
                              >
                                {u.demandUnit.permanentDemandNo}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                <strong>{u.legalName}</strong>
                                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                  {u.tradeName}
                                </div>
                              </td>
                              <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>
                                {u.identifierValue}
                              </td>
                              <td
                                style={{ padding: "0.6rem", textAlign: "center", fontWeight: 700 }}
                              >
                                {aging.daysOverdue}d
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                <span
                                  style={{
                                    background:
                                      aging.status === "RECOVERY_CERTIFIED"
                                        ? "#7f1d1d"
                                        : aging.status === "PENALIZED"
                                          ? "#fee2e2"
                                          : aging.status === "PENALTY_ELIGIBLE"
                                            ? "#ffedd5"
                                            : "#fef3c7",
                                    color:
                                      aging.status === "RECOVERY_CERTIFIED"
                                        ? "#ffffff"
                                        : aging.status === "PENALIZED"
                                          ? "#991b1b"
                                          : aging.status === "PENALTY_ELIGIBLE"
                                            ? "#9a3412"
                                            : "#92400e",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px",
                                    fontSize: "0.72rem",
                                    fontWeight: 700
                                  }}
                                >
                                  {aging.status}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace"
                                }}
                              >
                                PKR {baseTax.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: penalty > 0 ? "#b91c1c" : undefined
                                }}
                              >
                                {penalty > 0 ? `PKR ${penalty.toLocaleString()}` : "0"}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  color: "#b91c1c"
                                }}
                              >
                                PKR {bal.toLocaleString()}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                {aging.status === "RECOVERY_CERTIFIED" ? (
                                  <span style={{ color: "#7f1d1d", fontWeight: 600 }}>
                                    🏛️ Land Revenue S.67 Arrears Referral Issued
                                  </span>
                                ) : aging.status === "PENALIZED" ? (
                                  <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                                    ⚖️ 100% S.3(4) Penalty Warrant Active
                                  </span>
                                ) : aging.status === "PENALTY_ELIGIBLE" ? (
                                  <span style={{ color: "#c2410c", fontWeight: 600 }}>
                                    ⚠️ Section 3(4) Show Cause Notice Due
                                  </span>
                                ) : (
                                  <span style={{ color: "#64748b" }}>
                                    📄 Form P.F.T-1 Reminder Dispatch
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUnitId(u.id);
                                    setActiveTab("LEDGER");
                                  }}
                                  className="btn-secondary btn-sm"
                                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                                >
                                  Action
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={7} style={{ padding: "0.6rem" }}>
                          Total Outstanding Defaulter Debt ({filteredDefaulterUnits.length}{" "}
                          Defaulters)
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#b91c1c",
                            fontSize: "0.9rem"
                          }}
                        >
                          PKR{" "}
                          {filteredDefaulterUnits
                            .reduce((sum, u) => sum + computeLedgerBalance(u.ledgerEntries), 0)
                            .toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* REGISTER TABLE 3: Notice Dispatch & Service Register */}
            {activeReportTab === "NOTICE_DISPATCH" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    📬 Circle Notice Dispatch &amp; Service Register (Rule 6)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Statutory record of Form P.F.T-1 notices dispatched, postal delivery tracking
                    &amp; field service affidavits
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Notice Ref</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Dispatch Date</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Assessee Name</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Demand No</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Premises Address</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Service Status</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Served Date</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Process Server / Inspector
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDispatchRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}
                          >
                            No dispatch entries match search query "{reportSearchQuery}".
                          </td>
                        </tr>
                      ) : (
                        filteredDispatchRows.map((r) => (
                          <tr key={r.noticeNumber} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td
                              style={{
                                padding: "0.6rem",
                                fontFamily: "monospace",
                                fontWeight: 600
                              }}
                            >
                              {r.noticeNumber}
                            </td>
                            <td style={{ padding: "0.6rem" }}>{r.dispatchDate}</td>
                            <td style={{ padding: "0.6rem" }}>
                              <strong>{r.assesseeLegalName}</strong>
                              {r.assesseeTradeName && (
                                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                  {r.assesseeTradeName}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>
                              {r.demandNumber}
                            </td>
                            <td style={{ padding: "0.6rem", color: "#475569", maxWidth: "250px" }}>
                              {r.address}
                            </td>
                            <td style={{ padding: "0.6rem", textAlign: "center" }}>
                              <span
                                className={`badge ${r.serviceStatus === "SERVED" ? "badge-approved" : r.serviceStatus === "PENDING" ? "badge-submitted" : "badge-returned"}`}
                              >
                                {r.serviceStatus}
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem" }}>{r.servedAt ?? "Pending"}</td>
                            <td style={{ padding: "0.6rem", color: "#334155" }}>{r.serverName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={5} style={{ padding: "0.6rem" }}>
                          Total Dispatches: {filteredDispatchRows.length}
                        </td>
                        <td colSpan={3} style={{ padding: "0.6rem", color: "#166534" }}>
                          Served:{" "}
                          {filteredDispatchRows.filter((x) => x.serviceStatus === "SERVED").length}{" "}
                          &bull; Pending:{" "}
                          {filteredDispatchRows.filter((x) => x.serviceStatus !== "SERVED").length}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* REGISTER TABLE 4: Tax Clearance & Good-Standing Certificate Log */}
            {activeReportTab === "CLEARANCE_LOG" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    📜 Tax Clearance &amp; Good-Standing Certificates Log (Form P.F.T-5)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Verified statutory clearance certificates issued to compliant assessees with
                    digital cryptographic verification
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Certificate Serial No
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Verification Hash</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Assessee Legal Name
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>CNIC / NTN</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Financial Year</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Issue Date</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Valid Until</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Approving Authority
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Cleared Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClearanceCerts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}
                          >
                            No clearance certificates match search query "{reportSearchQuery}".
                          </td>
                        </tr>
                      ) : (
                        filteredClearanceCerts.map((c) => (
                          <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td
                              style={{
                                padding: "0.6rem",
                                fontFamily: "monospace",
                                fontWeight: 700,
                                color: "#0d3822"
                              }}
                            >
                              {c.certificateNumber}
                            </td>
                            <td
                              style={{
                                padding: "0.6rem",
                                fontFamily: "monospace",
                                color: "#2563eb",
                                fontSize: "0.75rem"
                              }}
                            >
                              {c.officialSha256.slice(0, 12)}...
                            </td>
                            <td style={{ padding: "0.6rem" }}>
                              <strong>{c.assesseeLegalName}</strong>
                              {c.assesseeTradeName && (
                                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                  {c.assesseeTradeName}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>
                              {c.cnicOrNtn}
                            </td>
                            <td style={{ padding: "0.6rem", textAlign: "center" }}>
                              {c.financialYear}
                            </td>
                            <td style={{ padding: "0.6rem" }}>{c.issueDate}</td>
                            <td style={{ padding: "0.6rem" }}>{c.validUntil}</td>
                            <td style={{ padding: "0.6rem", color: "#334155" }}>
                              {c.issuedByOfficerName}
                            </td>
                            <td
                              style={{
                                padding: "0.6rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                color: "#166534",
                                fontWeight: 700
                              }}
                            >
                              PKR {c.clearedAmountPkr.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={8} style={{ padding: "0.6rem" }}>
                          Total Certificates Issued: {filteredClearanceCerts.length} &bull;
                          Validated under Section 3 &amp; Rule 11
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#166534"
                          }}
                        >
                          PKR{" "}
                          {filteredClearanceCerts
                            .reduce((sum, c) => sum + c.clearedAmountPkr, 0)
                            .toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* REGISTER TABLE 5: Statutory Relief & Adjustment Register */}
            {activeReportTab === "RELIEF_REGISTER" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    ⚖️ Statutory Relief &amp; Adjustment Register (Rules 5 &amp; 10)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Legal audit roll of Rule 10 business discontinuances, freeze orders &amp; Rule 5
                    statutory tax refund credits
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Statutory Relief Type
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Assessee Legal Name
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Effective Date</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Legal Basis / Grounds
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>
                          Credit / Adjusted Amount
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Adjudicating Authority
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Order Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReliefRecords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}
                          >
                            No relief records match search query "{reportSearchQuery}".
                          </td>
                        </tr>
                      ) : (
                        filteredReliefRecords.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "0.6rem" }}>
                              <span
                                style={{
                                  background:
                                    r.reliefType === "RULE_10_DISCONTINUANCE"
                                      ? "#fef3c7"
                                      : "#dbeafe",
                                  color:
                                    r.reliefType === "RULE_10_DISCONTINUANCE"
                                      ? "#92400e"
                                      : "#1e40af",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "4px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700
                                }}
                              >
                                {r.reliefType === "RULE_10_DISCONTINUANCE"
                                  ? "Rule 10 Discontinuance"
                                  : "Rule 5 Refund Credit"}
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem" }}>
                              <strong>{r.legalName}</strong>
                            </td>
                            <td style={{ padding: "0.6rem" }}>{r.effectiveDate}</td>
                            <td style={{ padding: "0.6rem", color: "#475569", maxWidth: "300px" }}>
                              {r.statutoryReason}
                            </td>
                            <td
                              style={{
                                padding: "0.6rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                fontWeight: 700
                              }}
                            >
                              {r.amountAdjustedPkr > 0
                                ? `PKR ${r.amountAdjustedPkr.toLocaleString()}`
                                : "Demand Frozen"}
                            </td>
                            <td style={{ padding: "0.6rem", color: "#334155" }}>
                              {r.approvedByEto}
                            </td>
                            <td style={{ padding: "0.6rem", textAlign: "center" }}>
                              <span className="badge badge-approved">{r.status}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={4} style={{ padding: "0.6rem" }}>
                          Total Adjudicated Relief Records: {filteredReliefRecords.length}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "#0284c7"
                          }}
                        >
                          PKR{" "}
                          {filteredReliefRecords
                            .reduce((sum, r) => sum + r.amountAdjustedPkr, 0)
                            .toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* REGISTER TABLE 6: Statutory Slabs & Tertiary Yield Distribution */}
            {activeReportTab === "SLAB_DISTRIBUTION" && (
              <div className="table-card">
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                    📊 Statutory Slabs &amp; Tertiary Yield Distribution Register (Section 3 &amp;
                    Second Schedule)
                  </h4>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Comprehensive 47-slab statutory baseline &bull; Capital thresholds, turnover
                    brackets, staff tiers &bull; FY 2026-27 &bull; Circle-Vehari
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Schedule Sub-Class</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>Primary Class</th>
                        <th style={{ padding: "0.6rem", textAlign: "left" }}>
                          Tertiary Slab / Criteria
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Statutory Rate</th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Units</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Assessed Demand</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>Realized Recovery</th>
                        <th style={{ padding: "0.6rem", textAlign: "right" }}>
                          Outstanding Arrears
                        </th>
                        <th style={{ padding: "0.6rem", textAlign: "center" }}>Recovery %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {misMetrics.slabYields
                        .filter((slab) => {
                          const q = reportSearchQuery.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (slab.ruleCode?.toLowerCase().includes(q) ?? false) ||
                            (slab.statutoryTertiaryCode?.toLowerCase().includes(q) ?? false) ||
                            (slab.subclassificationCode?.toLowerCase().includes(q) ?? false) ||
                            (slab.tertiarySlab?.toLowerCase().includes(q) ?? false) ||
                            slab.categoryName.toLowerCase().includes(q) ||
                            String(slab.slabRatePkr).includes(q)
                          );
                        })
                        .map((slab) => {
                          const specificCode =
                            slab.ruleCode ??
                            slab.statutoryTertiaryCode ??
                            slab.subclassificationCode ??
                            slab.categoryCode;
                          return (
                            <tr
                              key={slab.ruleId}
                              style={{
                                borderBottom: "1px solid #e2e8f0",
                                background: slab.assessedUnitsCount > 0 ? "#f0fdf4" : undefined
                              }}
                            >
                              <td style={{ padding: "0.6rem", fontWeight: 700, color: "#0d3822" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    background: "#f1f5f9",
                                    border: "1px solid #cbd5e1",
                                    fontFamily: "monospace",
                                    fontSize: "0.82rem"
                                  }}
                                >
                                  {specificCode}
                                </span>
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                <span style={{ fontWeight: 600, display: "block" }}>
                                  {slab.categoryName}
                                </span>
                                {slab.subclassificationCode &&
                                  slab.subclassificationCode !== specificCode && (
                                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                      Entry Clause: {slab.subclassificationCode}
                                    </span>
                                  )}
                              </td>
                              <td style={{ padding: "0.6rem", color: "#334155" }}>
                                {slab.subclassificationLabel &&
                                slab.statutoryTertiaryClassification ? (
                                  <div>
                                    <strong
                                      style={{
                                        display: "block",
                                        color: "#0f172a",
                                        fontSize: "0.82rem"
                                      }}
                                    >
                                      {slab.subclassificationLabel}
                                    </strong>
                                    <span
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#166534",
                                        display: "inline-block",
                                        marginTop: "0.15rem"
                                      }}
                                    >
                                      📍 {slab.statutoryTertiaryClassification}
                                    </span>
                                  </div>
                                ) : (
                                  (slab.tertiarySlab ?? "—")
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontWeight: 700,
                                  color: "#166534"
                                }}
                              >
                                PKR {slab.slabRatePkr.toLocaleString()}
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.7rem",
                                    color: "#64748b",
                                    fontWeight: 400
                                  }}
                                >
                                  {slab.rateBasis}
                                </span>
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    fontWeight: 700,
                                    background: slab.assessedUnitsCount > 0 ? "#dcfce7" : "#f1f5f9",
                                    color: slab.assessedUnitsCount > 0 ? "#166534" : "#64748b"
                                  }}
                                >
                                  {slab.assessedUnitsCount}
                                </span>
                              </td>
                              <td
                                style={{ padding: "0.6rem", textAlign: "right", fontWeight: 600 }}
                              >
                                PKR {slab.assessedDemandPkr.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontWeight: 600,
                                  color: "#166534"
                                }}
                              >
                                PKR {slab.realizedRecoveryPkr.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.6rem",
                                  textAlign: "right",
                                  fontWeight: 600,
                                  color: slab.outstandingArrearsPkr > 0 ? "#dc2626" : "#64748b"
                                }}
                              >
                                PKR {slab.outstandingArrearsPkr.toLocaleString()}
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "0.15rem 0.4rem",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    background:
                                      slab.recoveryRatePct >= 80
                                        ? "#dcfce7"
                                        : slab.recoveryRatePct >= 50
                                          ? "#fef3c7"
                                          : "#fee2e2",
                                    color:
                                      slab.recoveryRatePct >= 80
                                        ? "#166534"
                                        : slab.recoveryRatePct >= 50
                                          ? "#92400e"
                                          : "#991b1b"
                                  }}
                                >
                                  {slab.recoveryRatePct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot
                      style={{
                        background: "#f8fafc",
                        fontWeight: 700,
                        borderTop: "2px solid #cbd5e1"
                      }}
                    >
                      <tr>
                        <td colSpan={4} style={{ padding: "0.6rem" }}>
                          Total Second Schedule Slabs: {misMetrics.slabYields.length} &bull; Active
                          in Circle:{" "}
                          {misMetrics.slabYields.filter((s) => s.assessedUnitsCount > 0).length}
                        </td>
                        <td style={{ padding: "0.6rem", textAlign: "center" }}>
                          {misMetrics.slabYields.reduce((sum, s) => sum + s.assessedUnitsCount, 0)}
                        </td>
                        <td style={{ padding: "0.6rem", textAlign: "right", color: "#0f172a" }}>
                          PKR{" "}
                          {misMetrics.slabYields
                            .reduce((sum, s) => sum + s.assessedDemandPkr, 0)
                            .toLocaleString()}
                        </td>
                        <td style={{ padding: "0.6rem", textAlign: "right", color: "#166534" }}>
                          PKR{" "}
                          {misMetrics.slabYields
                            .reduce((sum, s) => sum + s.realizedRecoveryPkr, 0)
                            .toLocaleString()}
                        </td>
                        <td style={{ padding: "0.6rem", textAlign: "right", color: "#dc2626" }}>
                          PKR{" "}
                          {misMetrics.slabYields
                            .reduce((sum, s) => sum + s.outstandingArrearsPkr, 0)
                            .toLocaleString()}
                        </td>
                        <td style={{ padding: "0.6rem", textAlign: "center", color: "#166534" }}>
                          {misMetrics.kpis.recoveryRatePct}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB: PUBLIC ASSESSEE PORTAL & REAL-TIME QR VERIFICATION DESK */}
        {activeTab === "PUBLIC_PORTAL" && (
          <section className="tab-panel" aria-label="Public Assessee Portal">
            {/* Citizen Welcome Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
                borderRadius: "10px",
                padding: "1.5rem",
                color: "#ffffff",
                marginBottom: "1.5rem",
                boxShadow: "0 4px 12px rgba(30, 58, 138, 0.15)",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem"
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.35rem"
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>🌐</span>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#ffffff", fontWeight: 700 }}>
                    Punjab Professional Tax — Public Assessee Portal &amp; Verification Desk
                  </h3>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600
                    }}
                  >
                    Circle-Vehari &bull; Citizen Self-Service
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.9, maxWidth: "52rem" }}>
                  Official public access facility governed by Section 15 of the Punjab Professional
                  Tax Digitization Plan and Rule 4 of the 1977 Rules. Verify statutory instruments,
                  lookup real-time liabilities by CNIC/NTN, calculate statutory taxes across all 11
                  categories, and simulate instant digital settlements via ePay Punjab / 1Link.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleOpenCitizenPaymentModal()}
                  className="btn-primary"
                  style={{
                    backgroundColor: "#10b981",
                    borderColor: "#059669",
                    fontWeight: 700
                  }}
                >
                  💳 Quick ePay Deposit
                </button>
              </div>
            </div>

            {/* Desk 1: Universal QR & Statutory Document Authenticator */}
            <div className="content-panel" style={{ marginBottom: "1.5rem" }}>
              <div className="panel-header">
                <div>
                  <h4 style={{ margin: 0, color: "#0d3822", fontSize: "1.1rem" }}>
                    🔍 Desk 1: Universal QR Code &amp; Document Security PIN Authenticator
                  </h4>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                    Instant multi-document authentication for Form P.F.T-1 (Demand Notice), Form
                    P.F.T-2 (3-Copy Challan), Form P.F.T-5 (Tax Clearance Certificate), and
                    Statutory Payment Receipts via 6-digit Document Security PIN or QR Code.
                  </p>
                </div>
              </div>

              <div
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}
              >
                <input
                  type="text"
                  placeholder="Enter 6-digit Security PIN (e.g. 161105, 536863), Notice No, Challan No, or scan QR code..."
                  className="form-control"
                  style={{ flex: 1, minWidth: "20rem" }}
                  value={portalVerificationInput}
                  onChange={(e) => setPortalVerificationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleVerifyDocument();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowQrScannerModal(true)}
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857", fontWeight: 700 }}
                  title="Scan using device camera or upload an image file of a statutory QR code"
                >
                  📷 Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyDocument()}
                  className="btn-primary"
                  style={{ backgroundColor: "#1e3a8a", borderColor: "#1e40af" }}
                >
                  Verify Document
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortalVerificationInput("");
                    setPortalVerificationResult(null);
                  }}
                  className="btn-secondary"
                >
                  Clear
                </button>
              </div>

              {/* Sample QR & PIN Scan Demo Buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "#f8fafc",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "1rem"
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>
                  Quick Verification Demos:
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{
                    background: "#e0f2fe",
                    color: "#0369a1",
                    borderColor: "#bae6fd",
                    fontWeight: 700
                  }}
                  onClick={() => {
                    setPortalVerificationInput("161105");
                    handleVerifyDocument("161105");
                  }}
                >
                  🔐 PIN 161105 (Vehari Cotton PFT-2)
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{
                    background: "#e0f2fe",
                    color: "#0369a1",
                    borderColor: "#bae6fd",
                    fontWeight: 700
                  }}
                  onClick={() => {
                    setPortalVerificationInput("536863");
                    handleVerifyDocument("536863");
                  }}
                >
                  🔐 PIN 536863 (Kisan Pesticides PFT-2)
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{
                    background: "#e0f2fe",
                    color: "#0369a1",
                    borderColor: "#bae6fd",
                    fontWeight: 700
                  }}
                  onClick={() => {
                    setPortalVerificationInput("821525");
                    handleVerifyDocument("821525");
                  }}
                >
                  🔐 PIN 821525 (Vehari Cotton PFT-1)
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const unit = units.find((u) => u.id === "unit-vehari-cotton-01");
                    if (unit) {
                      const p1 = generateFormPFT1(unit);
                      setPortalVerificationInput(p1.qrPayload);
                      handleVerifyDocument(p1.qrPayload);
                    }
                  }}
                >
                  📱 QR PFT-1
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const unit = units.find((u) => u.id === "unit-kisan-pesticides-02");
                    if (unit) {
                      const p2 = generateFormPFT2(unit);
                      setPortalVerificationInput(p2.qrPayload);
                      handleVerifyDocument(p2.qrPayload);
                    }
                  }}
                >
                  📱 QR PFT-2
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    if (clearanceCertificates.length > 0) {
                      const cert = clearanceCertificates[0]!;
                      setPortalVerificationInput(cert.qrPayload);
                      handleVerifyDocument(cert.qrPayload);
                    } else {
                      showToast("info", "No clearance certificates issued yet.");
                    }
                  }}
                >
                  📱 QR PFT-5 Clearance
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    if (statutoryReceipts.length > 0) {
                      const rec = statutoryReceipts[0]!;
                      setPortalVerificationInput(rec.qrPayload);
                      handleVerifyDocument(rec.qrPayload);
                    } else {
                      showToast("info", "No receipts issued yet.");
                    }
                  }}
                >
                  📱 QR Receipt
                </button>
              </div>

              {/* Verification Output Card */}
              {portalVerificationResult && (
                <div
                  style={{
                    border: `2px solid ${
                      portalVerificationResult.verificationStatus === "AUTHENTIC_VALID"
                        ? "#10b981"
                        : portalVerificationResult.verificationStatus === "REVOKED_ARREARS_PENDING"
                          ? "#ef4444"
                          : portalVerificationResult.verificationStatus === "UNAPPROVED_DRAFT"
                            ? "#f59e0b"
                            : "#64748b"
                    }`,
                    borderRadius: "8px",
                    padding: "1.25rem",
                    background:
                      portalVerificationResult.verificationStatus === "AUTHENTIC_VALID"
                        ? "#f0fdf4"
                        : portalVerificationResult.verificationStatus === "REVOKED_ARREARS_PENDING"
                          ? "#fef2f2"
                          : portalVerificationResult.verificationStatus === "UNAPPROVED_DRAFT"
                            ? "#fffbeb"
                            : "#f8fafc"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "1rem",
                      marginBottom: "0.75rem"
                    }}
                  >
                    <div>
                      <span
                        className={`badge ${
                          portalVerificationResult.verificationStatus === "AUTHENTIC_VALID"
                            ? "badge-approved"
                            : portalVerificationResult.verificationStatus ===
                                "REVOKED_ARREARS_PENDING"
                              ? "badge-returned"
                              : portalVerificationResult.verificationStatus === "UNAPPROVED_DRAFT"
                                ? "badge-draft"
                                : "badge-inactive"
                        }`}
                        style={{ fontSize: "0.75rem", fontWeight: 700 }}
                      >
                        {portalVerificationResult.verificationStatus === "AUTHENTIC_VALID"
                          ? "✓ OFFICIAL AUTHENTIC INSTRUMENT"
                          : portalVerificationResult.verificationStatus ===
                              "REVOKED_ARREARS_PENDING"
                            ? "❌ INVALID / ARREARS PENDING"
                            : portalVerificationResult.verificationStatus === "UNAPPROVED_DRAFT"
                              ? "⚠️ UNAPPROVED DRAFT"
                              : "DOCUMENT NOT FOUND"}
                      </span>
                      <h4
                        style={{
                          margin: "0.5rem 0 0.25rem",
                          color: "#0f172a",
                          fontSize: "1.15rem"
                        }}
                      >
                        {portalVerificationResult.title}
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#334155" }}>
                        {portalVerificationResult.message}
                      </p>
                      {portalVerificationResult.pin && (
                        <div style={{ marginTop: "0.6rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              background: "#0369a1",
                              color: "#ffffff",
                              padding: "0.25rem 0.65rem",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              letterSpacing: "1px",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
                            }}
                          >
                            🔐 Document Security PIN: {portalVerificationResult.pin}
                          </span>
                        </div>
                      )}
                    </div>

                    {portalVerificationResult.qrPayload && (
                      <StatutoryQrCode
                        payload={portalVerificationResult.qrPayload}
                        size={85}
                        label="Verified Seal"
                        subtitle={portalVerificationResult.documentReference}
                      />
                    )}
                  </div>

                  {portalVerificationResult.documentType !== "UNKNOWN" && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                        gap: "0.75rem",
                        marginTop: "1rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid rgba(0,0,0,0.08)",
                        fontSize: "0.8rem"
                      }}
                    >
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>Document Ref:</span>
                        <strong>{portalVerificationResult.documentReference}</strong>
                      </div>
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>Assessee Name:</span>
                        <strong>{portalVerificationResult.unitName}</strong>
                        {portalVerificationResult.tradeName && (
                          <span style={{ display: "block", color: "#475569" }}>
                            ({portalVerificationResult.tradeName})
                          </span>
                        )}
                      </div>
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>Identifier:</span>
                        <strong>{portalVerificationResult.identifier}</strong>
                      </div>
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>Classification:</span>
                        <strong>{portalVerificationResult.scheduleEntry}</strong>
                      </div>
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>Assessed Tax:</span>
                        <strong>
                          PKR {portalVerificationResult.assessedAmount.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: "#64748b", display: "block" }}>
                          Live Ledger Arrears:
                        </span>
                        <strong
                          style={{
                            color:
                              portalVerificationResult.outstandingBalance > 0
                                ? "#b91c1c"
                                : "#166534"
                          }}
                        >
                          PKR {portalVerificationResult.outstandingBalance.toLocaleString()}
                        </strong>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <span style={{ color: "#64748b", display: "block" }}>
                          Official SHA-256 Digest:
                        </span>
                        <code
                          style={{
                            fontSize: "0.7rem",
                            background: "#e2e8f0",
                            padding: "0.15rem 0.35rem",
                            borderRadius: "3px"
                          }}
                        >
                          {portalVerificationResult.officialSha256}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desk 2: Citizen Taxpayer Liability & Challan Search */}
            <div className="content-panel" style={{ marginBottom: "1.5rem" }}>
              <div className="panel-header">
                <div>
                  <h4 style={{ margin: 0, color: "#0d3822", fontSize: "1.1rem" }}>
                    💳 Desk 2: Citizen Tax Liability &amp; Challan Search
                  </h4>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                    Search and inspect outstanding professional tax assessments, payment receipts,
                    and ePay challans by CNIC, NTN, or Permanent Demand Number.
                  </p>
                </div>
              </div>

              <div
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}
              >
                <input
                  type="text"
                  placeholder="Enter CNIC (e.g. 36601-2948192-3), NTN (e.g. 7412983-1), PIN, or Demand No (e.g. 0001)..."
                  className="form-control"
                  style={{ flex: 1, minWidth: "20rem" }}
                  value={portalSearchQuery}
                  onChange={(e) => setPortalSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchCitizenTaxpayer();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSearchCitizenTaxpayer()}
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                >
                  Search Records
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortalSearchQuery("");
                    setPortalSearchResult(null);
                  }}
                  className="btn-secondary"
                >
                  Clear
                </button>
              </div>

              {/* Sample Taxpayer Chips */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                  fontSize: "0.75rem",
                  marginBottom: "1rem"
                }}
              >
                <span style={{ color: "#64748b" }}>Try searching:</span>
                {units.slice(0, 4).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ fontSize: "0.7rem" }}
                    onClick={() => {
                      setPortalSearchQuery(u.identifierValue);
                      handleSearchCitizenTaxpayer(u.identifierValue);
                    }}
                  >
                    {u.identifierValue} ({u.legalName.slice(0, 18)}...)
                  </button>
                ))}
              </div>

              {/* Search Result Card */}
              {portalSearchResult && (
                <div
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "1.25rem",
                    background: "#ffffff"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "1rem",
                      marginBottom: "1rem"
                    }}
                  >
                    <div>
                      <h4 style={{ margin: "0 0 0.25rem", color: "#0d3822" }}>
                        {portalSearchResult.legalName}
                      </h4>
                      {portalSearchResult.tradeName && (
                        <p style={{ margin: "0 0 0.25rem", color: "#475569", fontSize: "0.85rem" }}>
                          Trading as: <em>{portalSearchResult.tradeName}</em>
                        </p>
                      )}
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                        {portalSearchResult.address} &bull; Circle-Vehari
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        className={`badge ${
                          portalSearchResult.outstandingBalance <= 0
                            ? "badge-approved"
                            : portalSearchResult.daysOverdue > 30
                              ? "badge-returned"
                              : "badge-draft"
                        }`}
                        style={{ fontSize: "0.75rem" }}
                      >
                        {portalSearchResult.outstandingBalance <= 0
                          ? "✓ NIL ARREARS (PAID)"
                          : portalSearchResult.defaulterStatus}
                      </span>
                      <div style={{ marginTop: "0.4rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Demand ID: </span>
                        <strong>{portalSearchResult.permanentDemandNo}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Financial Overview Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
                      gap: "0.75rem",
                      background: "#f8fafc",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "1.25rem"
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                        Schedule Entry
                      </span>
                      <strong style={{ fontSize: "0.85rem" }}>
                        {portalSearchResult.scheduleEntry}
                      </strong>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "#475569" }}>
                        {portalSearchResult.categoryName}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                        Assessed Tax
                      </span>
                      <strong style={{ fontSize: "0.95rem" }}>
                        PKR {portalSearchResult.assessedTax.toLocaleString()}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                        Penalties
                      </span>
                      <strong
                        style={{
                          fontSize: "0.95rem",
                          color: portalSearchResult.penalties > 0 ? "#b91c1c" : "#334155"
                        }}
                      >
                        PKR {portalSearchResult.penalties.toLocaleString()}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                        Total Paid
                      </span>
                      <strong style={{ fontSize: "0.95rem", color: "#166534" }}>
                        PKR {portalSearchResult.totalPaid.toLocaleString()}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                        Outstanding Arrears
                      </span>
                      <strong
                        style={{
                          fontSize: "1.1rem",
                          color: portalSearchResult.outstandingBalance > 0 ? "#b91c1c" : "#166534"
                        }}
                      >
                        PKR {portalSearchResult.outstandingBalance.toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      alignItems: "center"
                    }}
                  >
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        backgroundColor: "#10b981",
                        borderColor: "#059669",
                        fontWeight: 700
                      }}
                      onClick={() =>
                        handleOpenCitizenPaymentModal(
                          portalSearchResult.unit.id,
                          portalSearchResult.outstandingBalance > 0
                            ? portalSearchResult.outstandingBalance
                            : portalSearchResult.annualTaxRate
                        )
                      }
                    >
                      💳 Pay Now via ePay Punjab / 1Link
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setSelectedUnitId(portalSearchResult.unit.id);
                        setActiveTab("FORM_PFT1");
                      }}
                    >
                      📜 View Demand Notice ({portalSearchResult.noticeNumber})
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setSelectedUnitId(portalSearchResult.unit.id);
                        setActiveTab("FORM_PFT2");
                      }}
                    >
                      💳 View Bank Challan ({portalSearchResult.challanNumber})
                    </button>
                    {portalSearchResult.isClearanceEligible && (
                      <span
                        className="badge badge-approved"
                        style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
                      >
                        ✓ Eligible for Form P.F.T-5 Clearance Certificate
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Desk 3: Rule 4 Statutory Self-Assessment Calculator */}
            <div className="content-panel" style={{ marginBottom: "1.5rem" }}>
              <div className="panel-header">
                <div>
                  <h4 style={{ margin: 0, color: "#0d3822", fontSize: "1.1rem" }}>
                    🧮 Desk 3: Rule 4 Statutory Self-Assessment Calculator &amp; Declaration
                  </h4>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                    Determine legal professional tax liability under the Second Schedule to the
                    Punjab Finance Act, 1977 across all 11 statutory categories.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
                  gap: "1.25rem",
                  marginBottom: "1.25rem"
                }}
              >
                {/* Form Controls */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      marginBottom: "0.3rem"
                    }}
                  >
                    Second Schedule Category:
                  </label>
                  <select
                    className="form-control"
                    value={portalCalcCriteria.categoryCode}
                    onChange={(e) => handleUpdateSelfAssessment({ categoryCode: e.target.value })}
                  >
                    <option value="1">Category 1: Companies (Paid-up Capital)</option>
                    <option value="2">Category 2: Factories (Persons other than companies)</option>
                    <option value="3">
                      Category 3: Commercial Establishments (Other than companies)
                    </option>
                    <option value="4">Category 4: Importers and Exporters</option>
                    <option value="5">
                      Category 5: Contractors, Builders &amp; Property Developers
                    </option>
                    <option value="6">Category 6: Professions &amp; Service Providers</option>
                    <option value="7">Category 7: Petroleum, Diesel &amp; CNG Stations</option>
                    <option value="8">Category 8: Transport Goods &amp; Bus Terminals</option>
                    <option value="9">Category 9: Advertising &amp; Commercial Signage</option>
                    <option value="10">
                      Category 10: Air-Conditioned Restaurants / Bakeries / Sweet Shops
                    </option>
                    <option value="11">
                      Category 11: Persons Assessed to Pay Income Tax in Preceding FY
                    </option>
                  </select>

                  {/* Sub-inputs based on category */}
                  {portalCalcCriteria.categoryCode === "1" && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600 }}>
                        Paid-up Capital (PKR):
                      </label>
                      <select
                        className="form-control"
                        onChange={(e) =>
                          handleUpdateSelfAssessment({ paidUpCapitalPkr: Number(e.target.value) })
                        }
                      >
                        <option value="4000000">Up to Rs 5 Million (PKR 10,000)</option>
                        <option value="20000000">Exceeding Rs 5M up to Rs 50M (PKR 30,000)</option>
                        <option value="75000000">
                          Exceeding Rs 50M up to Rs 100M (PKR 50,000)
                        </option>
                        <option value="150000000">
                          Exceeding Rs 100M up to Rs 200M (PKR 75,000)
                        </option>
                        <option value="300000000">Exceeding Rs 200 Million (PKR 100,000)</option>
                      </select>
                    </div>
                  )}

                  {portalCalcCriteria.categoryCode === "2" && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600 }}>
                        Number of Employees:
                      </label>
                      <select
                        className="form-control"
                        onChange={(e) =>
                          handleUpdateSelfAssessment({ employeeCount: Number(e.target.value) })
                        }
                      >
                        <option value="5">Not exceeding 10 employees (PKR 2,000)</option>
                        <option value="18">Exceeding 10 but not exceeding 25 (PKR 5,000)</option>
                        <option value="35">Exceeding 25 employees (PKR 7,500)</option>
                      </select>
                    </div>
                  )}

                  {portalCalcCriteria.categoryCode === "3" && (
                    <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600 }}>
                          Number of Employees:
                        </label>
                        <select
                          className="form-control"
                          value={portalCalcCriteria.employeeCount ?? 12}
                          onChange={(e) =>
                            handleUpdateSelfAssessment({ employeeCount: Number(e.target.value) })
                          }
                        >
                          <option value="15">10 or more employees</option>
                          <option value="4">Fewer than 10 employees (Small shop)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600 }}>
                          Territorial Jurisdiction:
                        </label>
                        <select
                          className="form-control"
                          value={portalCalcCriteria.isMetropolitan ? "METRO" : "OTHER"}
                          onChange={(e) =>
                            handleUpdateSelfAssessment({
                              isMetropolitan: e.target.value === "METRO"
                            })
                          }
                        >
                          <option value="OTHER">
                            Tehsil Vehari / Other Areas (Strictly PKR 4,000)
                          </option>
                          <option value="METRO">
                            Metropolitan / Municipal Corp Limits (PKR 6,000)
                          </option>
                        </select>
                      </div>
                    </div>
                  )}

                  {portalCalcCriteria.categoryCode === "6" && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600 }}>
                        Profession / Calling:
                      </label>
                      <select
                        className="form-control"
                        onChange={(e) =>
                          handleUpdateSelfAssessment({ professionType: e.target.value })
                        }
                      >
                        <option value="SPECIALIST">
                          Medical Consultant / Specialist / Dental Surgeon (PKR 5,000)
                        </option>
                        <option value="RMP">
                          Registered Medical Practitioner (RMP) (PKR 4,000)
                        </option>
                        <option value="PESTICIDE_DEALER">
                          Pesticide / Fertilizer / Electronic Dealer (PKR 2,000)
                        </option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Calculation Output Card */}
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "2px solid #10b981",
                    borderRadius: "8px",
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <span className="badge badge-approved" style={{ fontSize: "0.7rem" }}>
                      STATUTORY SECOND SCHEDULE COMPUTATION
                    </span>
                    <h3 style={{ margin: "0.5rem 0 0.25rem", color: "#065f46" }}>
                      PKR {portalCalcResult.annualRatePkr.toLocaleString()}
                    </h3>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#166534" }}>
                      Basis: {portalCalcResult.rateBasis}
                    </p>

                    <div style={{ fontSize: "0.8rem", color: "#334155", lineHeight: 1.5 }}>
                      <p style={{ margin: "0.25rem 0" }}>
                        <strong>Statutory Entry:</strong> {portalCalcResult.subclassificationCode}{" "}
                        &bull; {portalCalcResult.categoryName}
                      </p>
                      <p style={{ margin: "0.25rem 0" }}>
                        <strong>Subcategory:</strong> {portalCalcResult.subcategory}
                      </p>
                      <p
                        style={{
                          margin: "0.5rem 0 0",
                          fontStyle: "italic",
                          fontSize: "0.75rem",
                          color: "#475569",
                          background: "#ffffff",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1"
                        }}
                      >
                        &ldquo;{portalCalcResult.officialLegalText}&rdquo;
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="btn-primary btn-block"
                      style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                      onClick={() =>
                        handleOpenCitizenPaymentModal(undefined, portalCalcResult.annualRatePkr)
                      }
                    >
                      💳 Declare &amp; Pay PKR {portalCalcResult.annualRatePkr.toLocaleString()}{" "}
                      Online
                    </button>
                  </div>
                </div>
              </div>
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
                  <label htmlFor="new-category" style={{ fontWeight: 600 }}>
                    1. Second Schedule Category (Class) *
                  </label>
                  <select
                    id="new-category"
                    className="form-control"
                    value={newCategoryCode}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat.category_code} value={cat.category_code}>
                        Class {cat.category_code}: {cat.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                {availableSubclasses.length > 0 && (
                  <div className="form-group">
                    <label htmlFor="new-subclass" style={{ fontWeight: 600 }}>
                      2. Sub-classification (Schedule Split) *
                    </label>
                    <select
                      id="new-subclass"
                      className="form-control"
                      value={newSubclassCode}
                      onChange={(e) => handleSubclassChange(e.target.value)}
                    >
                      {availableSubclasses.map((sub) => (
                        <option key={sub.code} value={sub.code}>
                          Code [{sub.code}] — {sub.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {availableTertiaryRules.length > 0 && (
                  <div className="form-group">
                    <label htmlFor="new-tertiary" style={{ fontWeight: 600 }}>
                      3. Tertiary Tier / Geographic &amp; Operational Scope *
                    </label>
                    <select
                      id="new-tertiary"
                      className="form-control"
                      value={newTertiaryCode}
                      onChange={(e) => handleTertiaryChange(e.target.value)}
                    >
                      {availableTertiaryRules.map((rule) => (
                        <option
                          key={rule.statutory_tertiary_code}
                          value={rule.statutory_tertiary_code ?? ""}
                        >
                          [{rule.statutory_tertiary_code}]{" "}
                          {rule.statutory_tertiary_classification ?? rule.subcategory} • PKR{" "}
                          {rule.annual_rate_pkr.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedStatutoryRule && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "6px",
                      padding: "0.85rem",
                      fontSize: "0.85rem"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem"
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#166534", fontSize: "0.95rem" }}>
                        Statutory Assessment Rate: PKR{" "}
                        {selectedStatutoryRule.annual_rate_pkr.toLocaleString()} / year
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          background: "#dcfce7",
                          color: "#15803d",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          border: "1px solid #86efac"
                        }}
                      >
                        Class Code: {selectedStatutoryRule.rule_code}
                      </span>
                    </div>

                    {/* PIN Preview Card */}
                    {previewUin && (
                      <div
                        style={{
                          marginTop: "0.65rem",
                          padding: "0.5rem 0.75rem",
                          background: "#ffffff",
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.25rem"
                          }}
                        >
                          <span style={{ fontSize: "0.725rem", color: "#64748b", fontWeight: 600 }}>
                            PROFESSIONAL IDENTIFICATION NUMBER (PIN):
                          </span>
                          <span style={{ fontSize: "0.68rem", color: "#0284c7", fontWeight: 600 }}>
                            PBS District 237 (Vehari)
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#1e40af",
                            letterSpacing: "0.5px"
                          }}
                        >
                          {previewUin}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                          Format: [District]-[Tehsil+Circle+Classification+Sequence]-[Version]
                          (Permanent)
                        </div>
                      </div>
                    )}

                    <span
                      style={{
                        color: "#4b5563",
                        fontSize: "0.75rem",
                        display: "block",
                        marginTop: "0.5rem"
                      }}
                    >
                      Statutory Legal Basis: {selectedStatutoryRule.official_text}
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
              id="show-cause-notice-printable"
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
                    🔐 PIN: {showCauseNoticeData.pin}
                  </span>
                </div>
                <div>
                  <strong>Permanent Demand No:</strong> {showCauseNoticeData.demandNumber}
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Date of Issue:</strong> {showCauseNoticeData.noticeDate}
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
                  <strong>Statutory Class:</strong> {showCauseNoticeData.scheduleEntry}
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
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "show-cause-notice-printable",
                      `Show_Cause_Notice_${showCauseNoticeData.noticeNumber}.pdf`
                    )
                  }
                  title="Download Official PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("show-cause-notice-printable")}
                  title="Print official notice document"
                >
                  🖨️ Print Notice
                </button>
              </div>
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
                          {target.demandUnit.permanentDemandNo}
                          {target.provincialUin ? ` [${target.provincialUin}]` : ""} &bull;{" "}
                          {target.statutoryRule.subclassification_code
                            ? `Class ${target.statutoryRule.subclassification_code}`
                            : `Class ${target.statutoryRule.category_code}`}
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
              id="recovery-certificate-printable"
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
                    🔐 PIN: {recoveryCertData.pin}
                  </span>
                </div>
                <div style={{ gridColumn: "span 2", textAlign: "right" }}>
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
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "recovery-certificate-printable",
                      `Recovery_Certificate_${recoveryCertData.certificateNumber}.pdf`
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("recovery-certificate-printable")}
                >
                  🖨️ Print Recovery Certificate
                </button>
              </div>
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

            <div id="batch-pft1-notices-printable" className="modal-body">
              {approvedUnits.map((u, idx) => {
                const noticeData = generateFormPFT1(u);

                return (
                  <div key={u.id} className="batch-sheet">
                    <div className="doc-box">
                      {/* Top Section with Left QR Code & Department Header */}
                      <div
                        style={{
                          display: "flex",
                          gap: "0.75rem",
                          alignItems: "center",
                          borderBottom: "2px solid #0d3822",
                          paddingBottom: "0.75rem",
                          marginBottom: "1rem"
                        }}
                      >
                        {/* Left: QR Code */}
                        <div style={{ flexShrink: 0 }}>
                          <StatutoryQrCode
                            payload={noticeData.qrPayload}
                            size={65}
                            label="Scan to Verify"
                            subtitle={noticeData.demandNumber}
                            onScanOrClick={(payload) => {
                              setPortalVerificationInput(payload);
                              handleVerifyDocument(payload);
                              setShowBatchPft1Modal(false);
                              setActiveTab("PUBLIC_PORTAL");
                            }}
                          />
                        </div>
                        {/* Right: Department Header */}
                        <div style={{ flex: 1, textAlign: "center" }}>
                          <div
                            style={{
                              display: "inline-block",
                              border: "1px solid #0d3822",
                              background: "#fef3c7",
                              padding: "0.15rem 0.5rem",
                              fontWeight: 700,
                              fontSize: "0.72rem",
                              color: "#92400e",
                              marginBottom: "0.2rem"
                            }}
                          >
                            FORM P.F.T-1 &bull; NOTICE OF TAX DEMAND
                          </div>
                          <h4
                            style={{
                              margin: "0 0 0.15rem",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              fontSize: "0.95rem"
                            }}
                          >
                            GOVERNMENT OF THE PUNJAB
                          </h4>
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              color: "#0d3822"
                            }}
                          >
                            EXCISE &amp; TAXATION DEPARTMENT &bull; DISTRICT VEHARI
                          </p>
                          <p
                            style={{ margin: "0.15rem 0 0", fontSize: "0.72rem", color: "#64748b" }}
                          >
                            [See Rule 6 of the Punjab Professions and Trades Tax Rules, 1977]
                          </p>
                        </div>
                      </div>

                      {/* Unified Metadata & Assessment Header */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.3rem 0.6rem",
                          marginBottom: "0.85rem",
                          fontSize: "0.78rem",
                          background: "#f8fafc",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0"
                        }}
                      >
                        <div
                          style={{
                            gridColumn: "span 2",
                            fontFamily: "monospace",
                            color: "#1e3a8a",
                            fontSize: "0.76rem"
                          }}
                        >
                          <strong>Notice No:</strong> {noticeData.noticeNumber}
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                              fontWeight: 800,
                              fontSize: "0.74rem",
                              background: "#e0f2fe",
                              color: "#0369a1",
                              border: "1px solid #bae6fd"
                            }}
                          >
                            🔐 PIN: {noticeData.pin}
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>Demand No:</strong>{" "}
                          <span
                            style={{ fontFamily: "monospace", fontWeight: 800, color: "#0d3822" }}
                          >
                            {noticeData.demandNumber}
                          </span>
                        </div>
                        {noticeData.provincialUin && (
                          <div
                            style={{
                              gridColumn: "span 2",
                              fontSize: "0.76rem",
                              borderTop: "1px dashed #e2e8f0",
                              paddingTop: "0.2rem"
                            }}
                          >
                            <strong>PIN (Professional Identification Number):</strong>{" "}
                            <span
                              style={{ fontFamily: "monospace", color: "#1d4ed8", fontWeight: 700 }}
                            >
                              {noticeData.provincialUin}
                            </span>
                          </div>
                        )}
                        <div>
                          <strong>Circle:</strong> {noticeData.circleName}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>District:</strong> {noticeData.districtName}
                        </div>
                        <div>
                          <strong>Date of Issue:</strong> {noticeData.issueDate}
                        </div>
                        <div style={{ textAlign: "right", color: "#b91c1c" }}>
                          <strong>Due Date:</strong> {noticeData.dueDate}
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
                          <strong>Statutory Class:</strong> {noticeData.scheduleEntry} -{" "}
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
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf("batch-pft1-notices-printable", "Batch_PFT1_Notices.pdf")
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("batch-pft1-notices-printable")}
                >
                  🖨️ Print Batch Book ({approvedUnits.length} Notices)
                </button>
              </div>
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

            <div id="batch-pft2-challans-printable" className="modal-body">
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
                              display: "flex",
                              gap: "0.4rem",
                              alignItems: "center",
                              borderBottom: "1px solid #0d3822",
                              paddingBottom: "0.35rem"
                            }}
                          >
                            <div style={{ flexShrink: 0 }}>
                              <StatutoryQrCode
                                payload={copy.qrPayload}
                                size={56}
                                label="Verify"
                                subtitle={copy.bankUse.challanSerial}
                              />
                            </div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                GOVT. OF THE PUNJAB
                              </div>
                              <div style={{ fontSize: "0.68rem", color: "#0d3822" }}>
                                EXCISE &amp; TAXATION
                              </div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  background: "#f0fdf4",
                                  padding: "0.1rem",
                                  fontWeight: 700,
                                  color: "#166534",
                                  borderRadius: "3px",
                                  marginTop: "0.15rem"
                                }}
                              >
                                {copy.copyTitle}
                              </div>
                            </div>
                          </div>

                          {/* Unified Metadata Header */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "0.25rem 0.4rem",
                              fontSize: "0.7rem",
                              background: "#f8fafc",
                              padding: "0.35rem",
                              borderRadius: "4px",
                              border: "1px solid #e2e8f0",
                              marginTop: "0.3rem"
                            }}
                          >
                            <div
                              style={{
                                gridColumn: "span 2",
                                fontSize: "0.68rem",
                                fontFamily: "monospace",
                                color: "#1e3a8a",
                                wordBreak: "break-all"
                              }}
                            >
                              <strong>Notice No:</strong> {copy.noticeNumber}
                            </div>
                            <div>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.05rem 0.35rem",
                                  borderRadius: "3px",
                                  fontFamily: "monospace",
                                  fontWeight: 800,
                                  fontSize: "0.68rem",
                                  background: "#e0f2fe",
                                  color: "#0369a1",
                                  border: "1px solid #bae6fd"
                                }}
                              >
                                🔐 PIN: {copy.pin}
                              </span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <strong>Demand No:</strong>{" "}
                              <span style={{ fontFamily: "monospace", fontWeight: 800 }}>
                                {copy.assessmentInfo.demandNo}
                              </span>
                            </div>
                            {copy.taxpayerInfo.provincialUin && (
                              <div
                                style={{
                                  gridColumn: "span 2",
                                  fontSize: "0.68rem",
                                  borderTop: "1px dashed #e2e8f0",
                                  paddingTop: "0.2rem"
                                }}
                              >
                                <strong>PIN:</strong>{" "}
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
                              <strong>Due:</strong> {copy.dueDate}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <strong>FY:</strong> {copy.taxYear}
                            </div>
                          </div>

                          {/* Assessee Details */}
                          <div
                            style={{
                              background: "#f8fafc",
                              padding: "0.35rem",
                              borderRadius: "4px",
                              fontSize: "0.72rem",
                              marginTop: "0.3rem"
                            }}
                          >
                            <div>
                              <strong>Class:</strong> {copy.taxpayerInfo.classification}{" "}
                              <span style={{ fontWeight: 700, color: "#166534" }}>
                                (PKR {copy.taxpayerInfo.slabRatePkr.toLocaleString()})
                              </span>
                            </div>
                            <div>
                              <strong>Assessee:</strong> {copy.taxpayerInfo.legalName}
                            </div>
                            <div>
                              <strong>Address:</strong> {copy.taxpayerInfo.address}
                            </div>
                          </div>

                          <div
                            style={{
                              borderTop: "1px dashed #cbd5e1",
                              borderBottom: "1px dashed #cbd5e1",
                              padding: "0.35rem 0",
                              fontSize: "0.72rem"
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
                                marginTop: "0.2rem",
                                color: "#0d3822"
                              }}
                            >
                              <span>Total Payable:</span>
                              <span>PKR {copy.taxPayable.totalPayable.toLocaleString()}</span>
                            </div>
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
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "batch-pft2-challans-printable",
                      "Batch_PFT2_Challans.pdf",
                      { orientation: "landscape" }
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("batch-pft2-challans-printable")}
                >
                  🖨️ Print Batch Challans ({approvedUnits.length} Sheets)
                </button>
              </div>
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

            <div id="dispatch-register-printable" className="modal-body">
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
                    onClick={() =>
                      downloadDocumentPdf(
                        "dispatch-register-printable",
                        "Circle_Notice_Dispatch_Register.pdf",
                        { orientation: "landscape" }
                      )
                    }
                  >
                    📥 PDF
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                    onClick={() => printIsolatedElement("dispatch-register-printable")}
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
                      Employee Count Dispute: Fewer than 10 workers (claims Class 3(ii) at PKR 2,000
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

            <div
              id="appellate-order-printable"
              className="modal-body"
              style={{ background: "#ffffff", padding: "1.5rem" }}
            >
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
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "4px",
                        fontFamily: "monospace",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                        background: "#e0f2fe",
                        color: "#0369a1",
                        border: "1px solid #bae6fd",
                        letterSpacing: "1.5px",
                        marginBottom: "0.25rem"
                      }}
                    >
                      🔐 PIN: {activeAppellateOrder.pin}
                    </span>
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

            <div className="modal-footer no-print" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "appellate-order-printable",
                      `Appellate_Order_${activeAppellateOrder.orderNumber}.pdf`
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("appellate-order-printable")}
                >
                  🖨️ Print Appellate Order
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAppellateOrderModal(false)}
              >
                Close
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
                                      {row.parsedUnit.statutoryRule.subclassification_code
                                        ? `Class ${row.parsedUnit.statutoryRule.subclassification_code}`
                                        : `Class ${row.parsedUnit.statutoryRule.category_code}`}
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

      {/* MODAL 17: OFFICIAL OFFICER LOGIN & AUTHORIZATION STUDIO (PHASE 5) */}
      {showAuthModal && (
        <div className="modal-overlay">
          <div
            className="modal-card modal-card-xl"
            style={{ display: "flex", flexDirection: "column", maxHeight: "92vh" }}
          >
            <div
              className="modal-header"
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #1e3a8a 100%)",
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
                  <span>🏛️</span>
                  <span>سرکاری پورٹل لاگ اِن و سیشن کنٹرول</span>
                </h3>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#d1fae5" }}>
                  Official Officer Authentication &amp; Multi-Role Jurisdiction Studio (Supabase
                  Auth)
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAuthModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: "auto", padding: "1.25rem" }}>
              {/* Tab Selector */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "0.5rem",
                  marginBottom: "0.75rem"
                }}
              >
                <button
                  type="button"
                  onClick={() => setAuthModeTab("QUICK")}
                  className="btn-secondary btn-sm"
                  style={{
                    backgroundColor: authModeTab === "QUICK" ? "#0d3822" : "#ffffff",
                    color: authModeTab === "QUICK" ? "#ffffff" : "#334155",
                    borderColor: authModeTab === "QUICK" ? "#0d3822" : "#cbd5e1",
                    fontWeight: 600
                  }}
                >
                  ⚡ Quick Switch Official Officer (سریع سرکاری سیشن)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModeTab("CREDENTIALS")}
                  className="btn-secondary btn-sm"
                  style={{
                    backgroundColor: authModeTab === "CREDENTIALS" ? "#0d3822" : "#ffffff",
                    color: authModeTab === "CREDENTIALS" ? "#ffffff" : "#334155",
                    borderColor: authModeTab === "CREDENTIALS" ? "#0d3822" : "#cbd5e1",
                    fontWeight: 600
                  }}
                >
                  🔐 Email &amp; Password Sign In (پاس ورڈ لاگ اِن)
                </button>
              </div>

              {/* View 1: Quick Switch Cards */}
              {authModeTab === "QUICK" && (
                <div>
                  <p style={{ fontSize: "0.825rem", color: "#64748b", margin: "0 0 1rem 0" }}>
                    Select an official Government officer profile below to authenticate an active
                    session. Each officer role enforces distinct statutory legal powers and
                    jurisdiction boundaries under the Punjab Finance Act 1977.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
                      gap: "1rem"
                    }}
                  >
                    {OFFICIAL_OFFICERS_REGISTRY.map((info) => {
                      const isCurrent = officer.email === info.email;
                      return (
                        <div
                          key={info.id}
                          style={{
                            border: isCurrent ? "2px solid #059669" : "1px solid #cbd5e1",
                            background: isCurrent ? "#f0fdf4" : "#ffffff",
                            borderRadius: "8px",
                            padding: "1rem",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            boxShadow: isCurrent ? "0 4px 6px -1px rgba(5, 150, 105, 0.1)" : "none"
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "0.5rem"
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    background:
                                      info.role === "INSPECTOR"
                                        ? "#e0f2fe"
                                        : info.role === "ETO"
                                          ? "#fef3c7"
                                          : "#f3e8ff",
                                    color:
                                      info.role === "INSPECTOR"
                                        ? "#0369a1"
                                        : info.role === "ETO"
                                          ? "#92400e"
                                          : "#6b21a8"
                                  }}
                                >
                                  {info.role} &bull; {info.jurisdictionTier}
                                </span>
                                <h4
                                  style={{
                                    margin: "0.4rem 0 0.15rem 0",
                                    fontSize: "1rem",
                                    color: "#0f172a"
                                  }}
                                >
                                  {info.name}
                                </h4>
                                <div
                                  style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 500 }}
                                >
                                  {info.title}
                                </div>
                              </div>
                              <span style={{ fontSize: "1.75rem" }}>
                                {info.role === "INSPECTOR"
                                  ? "👤"
                                  : info.role === "ETO"
                                    ? "⚖️"
                                    : "📊"}
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#64748b",
                                margin: "0.35rem 0 0.75rem 0"
                              }}
                            >
                              <div>
                                <strong>Jurisdiction:</strong> {info.jurisdictionName}
                              </div>
                              <div>
                                <strong>Email:</strong> {info.email}
                              </div>
                            </div>

                            <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "0.5rem" }}>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  color: "#334155",
                                  display: "block",
                                  marginBottom: "0.25rem"
                                }}
                              >
                                Enforced Legal Powers:
                              </span>
                              <ul
                                style={{
                                  margin: 0,
                                  paddingLeft: "1.1rem",
                                  fontSize: "0.72rem",
                                  color: "#475569",
                                  lineHeight: 1.4
                                }}
                              >
                                {info.statutoryPowers.map((p, i) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div style={{ marginTop: "1rem" }}>
                            {isCurrent ? (
                              <div
                                style={{
                                  textAlign: "center",
                                  padding: "0.45rem",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  borderRadius: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: 700
                                }}
                              >
                                ✓ Active Session
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isAuthenticating}
                                onClick={() =>
                                  handleAuthenticateOfficer(info.email, info.defaultPassword)
                                }
                                className="btn-primary btn-sm"
                                style={{
                                  width: "100%",
                                  justifyContent: "center",
                                  backgroundColor: "#0d3822",
                                  borderColor: "#0d3822"
                                }}
                              >
                                {isAuthenticating
                                  ? "Authenticating..."
                                  : `🔐 Authenticate as ${info.name.split(" ")[0]}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View 2: Email & Password Sign In */}
              {authModeTab === "CREDENTIALS" && (
                <div style={{ maxWidth: "28rem", margin: "0 auto", padding: "1rem 0" }}>
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      padding: "0.75rem 1rem",
                      borderRadius: "6px",
                      marginBottom: "1rem",
                      fontSize: "0.8rem",
                      color: "#166534"
                    }}
                  >
                    <strong>Deployment Note:</strong> Sign in using any official Punjab Excise
                    account or custom testing email on Vercel.
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAuthenticateOfficer(authEmailInput, authPasswordInput);
                    }}
                    style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                  >
                    <div className="form-group">
                      <label htmlFor="authEmail">Email Address (ای میل):</label>
                      <input
                        type="email"
                        id="authEmail"
                        required
                        className="form-control"
                        placeholder="e.g. officer.vehari@punjab.gov.pk or yourname@gmail.com"
                        value={authEmailInput}
                        onChange={(e) => setAuthEmailInput(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="authPassword">Password (پاس ورڈ):</label>
                      <input
                        type="password"
                        id="authPassword"
                        required
                        className="form-control"
                        value={authPasswordInput}
                        onChange={(e) => setAuthPasswordInput(e.target.value)}
                      />
                      <span style={{ fontSize: "0.725rem", color: "#64748b", marginTop: "0.2rem" }}>
                        Default passwords: <code>VehariInspector2026!</code> &bull;{" "}
                        <code>VehariETO2026!</code> &bull; <code>MultanDirector2026!</code>
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthenticating}
                      className="btn-primary"
                      style={{
                        width: "100%",
                        justifyContent: "center",
                        padding: "0.7rem",
                        backgroundColor: "#0d3822"
                      }}
                    >
                      {isAuthenticating
                        ? "Verifying with Supabase Auth..."
                        : "🔐 Sign In with Supabase Auth"}
                    </button>
                  </form>
                </div>
              )}

              {/* Statutory Legal Powers Matrix */}
              <div
                style={{
                  marginTop: "1.25rem",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "1rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem"
                  }}
                >
                  <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>
                    📜 قانونی اختیارات کا چارٹ (Server-Enforced Statutory Authority Matrix —
                    AGENTS.md)
                  </strong>
                  <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    Enforced at Domain Layer
                  </span>
                </div>

                <div className="table-container" style={{ border: "1px solid #cbd5e1" }}>
                  <table className="gov-table" style={{ fontSize: "0.78rem" }}>
                    <thead>
                      <tr>
                        <th>Statutory Action / Feature</th>
                        <th>Tax Inspector (Aslam)</th>
                        <th>Assessing Authority / ETO (Tariq)</th>
                        <th>Appellate Authority / Director (Shahid)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Market Survey &amp; Registration (Rule 4 &amp; 5)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>✓ Maker Authority</td>
                        <td style={{ color: "#166534" }}>✓ Authorized</td>
                        <td style={{ color: "#166534" }}>✓ Oversight</td>
                      </tr>
                      <tr>
                        <td>Statutory Assessment Approval (Rule 5(1))</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>✓ Statutory Approver</td>
                        <td style={{ color: "#166534" }}>✓ Authorized</td>
                      </tr>
                      <tr>
                        <td>Section 3(4) Penalty Imposition (Up to 100%)</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>✓ Exclusive ETO Power</td>
                        <td style={{ color: "#b91c1c" }}>✕ Blocked (Appellate Only)</td>
                      </tr>
                      <tr>
                        <td>Rule 12 Arrears of Land Revenue Certificate</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>✓ Exclusive ETO Power</td>
                        <td style={{ color: "#b91c1c" }}>✕ Blocked (Appellate Only)</td>
                      </tr>
                      <tr>
                        <td>Section 7 Judicial Appeals &amp; Decrees</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>
                          ✕ Conflict of Interest
                        </td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>
                          ✓ Sole Judicial Authority
                        </td>
                      </tr>
                      <tr>
                        <td>Form P.F.T-5 Tax Clearance Certificate (Rule 11)</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>
                          ✓ Statutory Approver &amp; Seal
                        </td>
                        <td style={{ color: "#166534" }}>✓ Authorized</td>
                      </tr>
                      <tr>
                        <td>Rule 10 Discontinuance Notice &amp; Inspection</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>
                          ✓ Field Inspection Maker
                        </td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>
                          ✓ Statutory Closure Order
                        </td>
                        <td style={{ color: "#166534" }}>✓ Oversight</td>
                      </tr>
                      <tr>
                        <td>Rule 5 Statutory Refunds &amp; Ledger Adjustments</td>
                        <td style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Blocked (Violation)</td>
                        <td style={{ color: "#166534", fontWeight: 700 }}>
                          ✓ Statutory Adjudication
                        </td>
                        <td style={{ color: "#166534" }}>✓ Authorized</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAuthModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 18: FORM P.F.T-5 CLEARANCE CERTIFICATE STUDIO */}
      {showClearanceModal && activeClearanceCert && (
        <div className="modal-backdrop" onClick={() => setShowClearanceModal(false)}>
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "850px" }}
          >
            <div className="modal-header">
              <div>
                <h3>📜 Form P.F.T-5: Professional Tax Clearance Certificate</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Official statutory certificate issued under Rule 11 &amp; Section 3(1) of Punjab
                  Finance Act 1977
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowClearanceModal(false)}
              >
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{ maxHeight: "78vh", overflowY: "auto", padding: "1.5rem" }}
            >
              {/* Printable Clearance Certificate Container */}
              <div
                id="clearance-certificate-printable"
                style={{
                  background: "#ffffff",
                  border: "3px double #0d3822",
                  outline: "1px solid #10b981",
                  borderRadius: "8px",
                  padding: "2.25rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  position: "relative",
                  fontFamily: "Georgia, serif"
                }}
              >
                {/* Official Punjab Government Seal Header */}
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "2px solid #0d3822",
                    paddingBottom: "1.25rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>🛡️</div>
                  <h4
                    style={{
                      margin: "0 0 0.25rem",
                      fontSize: "1.2rem",
                      letterSpacing: "0.08em",
                      color: "#0d3822",
                      textTransform: "uppercase"
                    }}
                  >
                    GOVERNMENT OF THE PUNJAB
                  </h4>
                  <h5
                    style={{
                      margin: "0 0 0.25rem",
                      fontSize: "1.05rem",
                      color: "#166534",
                      fontFamily: "'Noto Nastaliq Urdu', 'Urdu Typesetting', serif"
                    }}
                  >
                    حکومت پنجاب &bull; محکمہ ایکسائز، ٹیکسیشن و نارکوٹکس کنٹرول
                  </h5>
                  <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#475569" }}>
                    OFFICE OF THE EXCISE &amp; TAXATION OFFICER / ASSESSING AUTHORITY &bull;
                    CIRCLE-VEHARI
                  </p>
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: "0.75rem",
                      background: "#0d3822",
                      color: "#ffffff",
                      padding: "0.35rem 1.5rem",
                      borderRadius: "4px",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      letterSpacing: "0.06em"
                    }}
                  >
                    FORM P.F.T-5 &bull; فارم پی ایف ٹی-۵
                  </div>
                  <h3 style={{ margin: "0.6rem 0 0", fontSize: "1.25rem", color: "#0d3822" }}>
                    TAX CLEARANCE CERTIFICATE (سرٹیفکیٹ عدم بقایاجات)
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic" }}>
                    (Issued under Rule 11 of the Punjab Professions and Trades Tax Rules, 1977)
                  </span>
                </div>

                {/* Certificate Metadata Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    fontSize: "0.85rem",
                    marginBottom: "1.5rem",
                    background: "#f8fafc",
                    padding: "0.85rem 1rem",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0"
                  }}
                >
                  <div>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Certificate Serial No:</strong>{" "}
                      <span style={{ fontFamily: "monospace", color: "#065f46", fontWeight: 700 }}>
                        {activeClearanceCert.certificateNumber}
                      </span>
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "0.85rem",
                          background: "#ecfdf5",
                          color: "#047857",
                          border: "1px solid #a7f3d0",
                          letterSpacing: "1.5px"
                        }}
                      >
                        🔐 PIN: {activeClearanceCert.pin}
                      </span>
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Permanent Demand No:</strong> {activeClearanceCert.demandNo}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Tax District &amp; Circle:</strong> {activeClearanceCert.districtName}{" "}
                      ({activeClearanceCert.circleName})
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Date of Issue:</strong> {activeClearanceCert.issueDate}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Financial Year:</strong> {activeClearanceCert.financialYear}
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      <strong>Valid Until:</strong>{" "}
                      <span style={{ color: "#166534", fontWeight: 700 }}>
                        {activeClearanceCert.expiryDate}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Assessee Description */}
                <div style={{ marginBottom: "1.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  <p style={{ margin: "0.4rem 0" }}>
                    <strong>Name of Assessee / Establishment:</strong>{" "}
                    <span style={{ fontSize: "1.05rem", color: "#0d3822", fontWeight: 700 }}>
                      {activeClearanceCert.assesseeLegalName}
                    </span>
                    {activeClearanceCert.assesseeTradeName &&
                      activeClearanceCert.assesseeTradeName !==
                        activeClearanceCert.assesseeLegalName && (
                        <span>
                          {" "}
                          (Trading as: <em>{activeClearanceCert.assesseeTradeName}</em>)
                        </span>
                      )}
                  </p>
                  <p style={{ margin: "0.4rem 0" }}>
                    <strong>CNIC / Registration NTN:</strong>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {activeClearanceCert.identifierValue}
                    </span>
                  </p>
                  <p style={{ margin: "0.4rem 0" }}>
                    <strong>Principal Place of Business:</strong>{" "}
                    {activeClearanceCert.businessAddress}
                  </p>
                  <p style={{ margin: "0.4rem 0" }}>
                    <strong>Statutory Classification:</strong> Second Schedule, Entry{" "}
                    {activeClearanceCert.scheduleEntry} &bull; {activeClearanceCert.categoryName} (
                    <em>{activeClearanceCert.subcategoryName}</em>)
                  </p>
                </div>

                {/* Formal Statutory Recital (Bilingual English & Urdu) */}
                <div
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#f0fdf4",
                    padding: "1.25rem",
                    borderRadius: "6px",
                    marginBottom: "1.5rem",
                    lineHeight: 1.7
                  }}
                >
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem", color: "#14532d" }}>
                    <strong>STATUTORY CERTIFICATION:</strong> This is to formally certify that the
                    above-named assessee has fully satisfied, settled, and discharged all
                    professional tax liabilities, assessments, penalties, and arrears levied under
                    Section 3 of the Punjab Finance Act, 1977 (Act XV of 1977) for the financial
                    year <strong>{activeClearanceCert.financialYear}</strong>.
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.95rem",
                      color: "#064e3b",
                      fontFamily: "'Noto Nastaliq Urdu', 'Urdu Typesetting', serif",
                      direction: "rtl",
                      textAlign: "right"
                    }}
                  >
                    تصدیق کی جاتی ہے کہ مذکورہ بالا ٹیکس گزار / کاروباری ادارے نے پنجاب فنانس ایکٹ
                    ۱۹۷۷ء کے تحت مالی سال <strong>{activeClearanceCert.financialYear}</strong> کے
                    جملہ پیشہ وارانہ ٹیکس، بقایاجات اور قانونی جرمانوں کی مکمل ادائیگی کر دی ہے۔
                    سرکاری رجسٹر و لیجر کے مطابق مذکورہ یونٹ کے ذمہ کوئی رقم واجب الادا نہیں ہے۔
                  </p>
                </div>

                {/* Nil Balance Verification Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "0.75rem",
                    marginBottom: "1.75rem",
                    textAlign: "center"
                  }}
                >
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>
                      Statutory Demand
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "#334155" }}>
                      PKR {activeClearanceCert.annualTaxAssessed.toLocaleString()}
                    </strong>
                  </div>
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>
                      Total Recovered / Paid
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "#166534" }}>
                      PKR {activeClearanceCert.totalTaxPaid.toLocaleString()}
                    </strong>
                  </div>
                  <div
                    style={{
                      background: "#ecfdf5",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #a7f3d0"
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#065f46",
                        display: "block",
                        fontWeight: 700
                      }}
                    >
                      Arrears / Balance
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "#065f46" }}>
                      PKR 0 (NIL / کچھ نہیں)
                    </strong>
                  </div>
                </div>

                {/* Signatures, Seals, and QR Verification Footer */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1.2fr",
                    gap: "1.5rem",
                    alignItems: "center",
                    borderTop: "1px dashed #94a3b8",
                    paddingTop: "1.25rem",
                    fontSize: "0.8rem"
                  }}
                >
                  {/* Digital QR Box */}
                  <div style={{ textAlign: "center" }}>
                    <StatutoryQrCode
                      payload={activeClearanceCert.qrPayload}
                      size={90}
                      label="Scan to Verify Status"
                      subtitle={activeClearanceCert.certificateNumber}
                      onScanOrClick={(payload) => {
                        setPortalVerificationInput(payload);
                        handleVerifyDocument(payload);
                        setShowClearanceModal(false);
                        setActiveTab("PUBLIC_PORTAL");
                      }}
                    />
                  </div>

                  {/* Official Government Seal Emblem */}
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "inline-block",
                        width: "70px",
                        height: "70px",
                        borderRadius: "50%",
                        border: "2px solid #0d3822",
                        padding: "0.4rem",
                        color: "#0d3822"
                      }}
                    >
                      <div style={{ fontSize: "1.5rem", marginTop: "0.1rem" }}>🏛️</div>
                      <span style={{ fontSize: "0.55rem", fontWeight: 700, display: "block" }}>
                        SEAL OF ETO
                      </span>
                    </div>
                  </div>

                  {/* Assessing Authority Sign-off */}
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        borderBottom: "1px solid #334155",
                        width: "12rem",
                        marginLeft: "auto",
                        marginBottom: "0.4rem"
                      }}
                    />
                    <strong style={{ display: "block", fontSize: "0.9rem", color: "#0d3822" }}>
                      {activeClearanceCert.issuingOfficerName}
                    </strong>
                    <span style={{ display: "block", color: "#475569" }}>
                      {activeClearanceCert.issuingOfficerTitle}
                    </span>
                    <span style={{ display: "block", color: "#64748b", fontSize: "0.75rem" }}>
                      Assessing Authority &bull; Circle-Vehari
                    </span>
                  </div>
                </div>

                {/* Cryptographic SHA-256 Digest Non-Repudiation */}
                <div
                  style={{
                    marginTop: "1.25rem",
                    paddingTop: "0.6rem",
                    borderTop: "1px solid #e2e8f0",
                    fontSize: "0.68rem",
                    color: "#64748b",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <span>Official SHA-256 Digest: </span>
                    <span style={{ fontFamily: "monospace", color: "#334155" }}>
                      {activeClearanceCert.officialSha256}
                    </span>
                  </div>
                  <span>Punjab IT Board &bull; ET&amp;NC Department</span>
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                  onClick={() =>
                    downloadDocumentPdf(
                      "clearance-certificate-printable",
                      `Form_PFT5_Clearance_${activeClearanceCert.certificateNumber}.pdf`
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("clearance-certificate-printable")}
                >
                  🖨️ Print Form P.F.T-5 Certificate
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowClearanceModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 19: FILE RULE 10 DISCONTINUANCE NOTICE */}
      {showFileDiscontinuanceModal && (
        <div className="modal-backdrop" onClick={() => setShowFileDiscontinuanceModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header">
              <div>
                <h3>🛑 File Rule 10 Notice of Discontinuance</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Notice of trade cessation or business closure under Punjab Professions &amp;
                  Trades Tax Rules, 1977
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowFileDiscontinuanceModal(false)}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleFileDiscontinuance();
              }}
            >
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="disc-unit-select"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Select Taxpayer Unit:
                  </label>
                  <select
                    id="disc-unit-select"
                    value={discUnitId}
                    onChange={(e) => setDiscUnitId(e.target.value)}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.legalName} ({u.demandUnit.permanentDemandNo}) &bull; PKR{" "}
                        {computeLedgerBalance(u.ledgerEntries)} bal
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="disc-date-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Effective Date of Cessation / Closure:
                  </label>
                  <input
                    id="disc-date-input"
                    type="date"
                    value={discDate}
                    onChange={(e) => setDiscDate(e.target.value)}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    required
                  />
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Statutory Rule 10 requires 30 days prior written notice before closure.
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="disc-reason-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Grounds / Reason for Discontinuance:
                  </label>
                  <textarea
                    id="disc-reason-input"
                    value={discReason}
                    onChange={(e) => setDiscReason(e.target.value)}
                    rows={3}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    placeholder="E.g., Surrendered commercial lease deed, vacated premises, business insolvent, license canceled..."
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="disc-evidence-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Documentary Evidence Details:
                  </label>
                  <input
                    id="disc-evidence-input"
                    type="text"
                    value={discEvidence}
                    onChange={(e) => setDiscEvidence(e.target.value)}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    placeholder="E.g., Notarized lease surrender deed, electricity disconnection certificate, shop sale agreement"
                  />
                </div>

                <div
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fde68a",
                    borderRadius: "6px",
                    padding: "0.75rem",
                    fontSize: "0.8rem",
                    color: "#92400e"
                  }}
                >
                  <strong>⚠️ Legal Notice:</strong> Filing this notice will trigger a physical field
                  inspection by Circle Inspector Muhammad Aslam. Once verified, Assessing Authority
                  ETO Tariq Mahmood passes the final closure order. Historical arrears remain
                  recoverable.
                </div>
              </div>

              <div
                className="modal-footer"
                style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFileDiscontinuanceModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ backgroundColor: "#b91c1c", borderColor: "#991b1b" }}
                >
                  Submit Rule 10 Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 20: INSPECTOR DISCONTINUANCE FIELD INSPECTION */}
      {showDiscontinuanceInspectionModal && (
        <div className="modal-backdrop" onClick={() => setShowDiscontinuanceInspectionModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header">
              <div>
                <h3>🔍 Circle Inspector Field Verification (Rule 10)</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  On-site physical inspection by Tax Inspector Muhammad Aslam
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowDiscontinuanceInspectionModal(false)}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveDiscontinuanceInspection();
              }}
            >
              <div className="modal-body">
                {(() => {
                  const targetDisc = discontinuances.find((d) => d.id === targetDiscId);
                  return (
                    <div
                      style={{
                        marginBottom: "1rem",
                        background: "#f8fafc",
                        padding: "0.75rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem"
                      }}
                    >
                      <p style={{ margin: "0.2rem 0" }}>
                        <strong>Notice No:</strong> {targetDisc?.noticeNumber}
                      </p>
                      <p style={{ margin: "0.2rem 0" }}>
                        <strong>Establishment:</strong> {targetDisc?.assesseeLegalName}
                      </p>
                      <p style={{ margin: "0.2rem 0" }}>
                        <strong>Claimed Closure Date:</strong> {targetDisc?.discontinuanceDate}
                      </p>
                      <p style={{ margin: "0.2rem 0" }}>
                        <strong>Claimed Reason:</strong> {targetDisc?.reason}
                      </p>
                    </div>
                  );
                })()}

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="insp-findings-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Inspector Field Verification Report &amp; Findings:
                  </label>
                  <textarea
                    id="insp-findings-input"
                    value={discInspectorFindings}
                    onChange={(e) => setDiscInspectorFindings(e.target.value)}
                    rows={4}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    placeholder="Detail physical inspection: status of premises, whether shop is shuttered, neighbor inquiries, fixtures removed..."
                    required
                  />
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Signed by: {officer.name} ({officer.title}, Circle-Vehari)
                  </span>
                </div>
              </div>

              <div
                className="modal-footer"
                style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDiscontinuanceInspectionModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                >
                  Submit Inspection Report to ETO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 21: ETO DISCONTINUANCE ORDER PREVIEW / ISSUANCE */}
      {showDiscontinuanceOrderModal && (
        <div className="modal-backdrop" onClick={() => setShowDiscontinuanceOrderModal(false)}>
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "750px" }}
          >
            <div className="modal-header">
              <div>
                <h3>⚖️ Statutory Discontinuance Order (Rule 10)</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Official Order passed by Assessing Authority (Excise &amp; Taxation Officer,
                  Vehari)
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => {
                  setShowDiscontinuanceOrderModal(false);
                  setActiveDiscontinuanceOrder(null);
                }}
              >
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{ maxHeight: "75vh", overflowY: "auto", padding: "1.5rem" }}
            >
              {/* If previewing a generated document */}
              {activeDiscontinuanceOrder ? (
                <div
                  id="discontinuance-order-printable"
                  style={{
                    background: "#ffffff",
                    border: "2px solid #0d3822",
                    padding: "2rem",
                    borderRadius: "6px",
                    fontFamily: "Georgia, serif"
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      borderBottom: "1px solid #0d3822",
                      paddingBottom: "1rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <div style={{ fontSize: "1.5rem" }}>🏛️</div>
                    <h4 style={{ margin: "0.2rem 0", color: "#0d3822" }}>
                      GOVERNMENT OF THE PUNJAB
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                      OFFICE OF THE EXCISE &amp; TAXATION OFFICER &bull; CIRCLE-VEHARI
                    </p>
                    <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.15rem", color: "#0d3822" }}>
                      STATUTORY ORDER UNDER RULE 10 (DISCONTINUANCE OF TRADE)
                    </h3>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      marginBottom: "1rem"
                    }}
                  >
                    <span>
                      <strong>Order No:</strong> {activeDiscontinuanceOrder.orderNumber}
                    </span>
                    <span>
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
                          letterSpacing: "1.5px",
                          marginRight: "0.75rem"
                        }}
                      >
                        🔐 PIN: {activeDiscontinuanceOrder.pin}
                      </span>
                      <strong>Dated:</strong> {activeDiscontinuanceOrder.orderDate}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                    <p>
                      <strong>In the matter of:</strong>{" "}
                      {activeDiscontinuanceOrder.assesseeLegalName} (
                      {activeDiscontinuanceOrder.assesseeTradeName})
                    </p>
                    <p>
                      <strong>Permanent Demand No:</strong> {activeDiscontinuanceOrder.demandNo}{" "}
                      &bull; <strong>CNIC/NTN:</strong> {activeDiscontinuanceOrder.identifierValue}
                    </p>
                    <p>
                      <strong>Notice Reference:</strong> {activeDiscontinuanceOrder.noticeNumber}{" "}
                      (Effective: {activeDiscontinuanceOrder.discontinuanceDate})
                    </p>
                    <p>
                      <strong>Field Verification Report:</strong>{" "}
                      <em>&quot;{activeDiscontinuanceOrder.inspectorFindings}&quot;</em>
                    </p>
                  </div>

                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      padding: "1rem",
                      borderRadius: "6px",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <h5 style={{ margin: "0 0 0.5rem", color: "#0d3822" }}>
                      DECISION &amp; ORDER OF ASSESSING AUTHORITY:
                    </h5>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                      <strong>Decision:</strong>{" "}
                      <span
                        style={{
                          color:
                            activeDiscontinuanceOrder.etoDecision === "APPROVED"
                              ? "#166534"
                              : "#b91c1c",
                          fontWeight: 700
                        }}
                      >
                        {activeDiscontinuanceOrder.etoDecision === "APPROVED"
                          ? "APPROVED (DISCONTINUED)"
                          : "REJECTED"}
                      </span>
                    </p>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#334155" }}>
                      {activeDiscontinuanceOrder.etoReason}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      borderTop: "1px solid #cbd5e1",
                      paddingTop: "1rem",
                      fontSize: "0.8rem"
                    }}
                  >
                    <div>
                      <span
                        style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#64748b" }}
                      >
                        SHA-256: {activeDiscontinuanceOrder.officialSha256.slice(0, 32)}...
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong>{activeDiscontinuanceOrder.etoName}</strong>
                      <span style={{ display: "block", color: "#64748b" }}>
                        {activeDiscontinuanceOrder.etoTitle}, Circle-Vehari
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Decision Form for ETO */
                <div>
                  {(() => {
                    const targetDisc = discontinuances.find((d) => d.id === targetDiscId);
                    return (
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          padding: "1rem",
                          borderRadius: "6px",
                          marginBottom: "1.25rem",
                          fontSize: "0.85rem"
                        }}
                      >
                        <p style={{ margin: "0.2rem 0" }}>
                          <strong>Notice No:</strong> {targetDisc?.noticeNumber}
                        </p>
                        <p style={{ margin: "0.2rem 0" }}>
                          <strong>Taxpayer:</strong> {targetDisc?.assesseeLegalName}
                        </p>
                        <p style={{ margin: "0.2rem 0" }}>
                          <strong>Inspector Findings:</strong>{" "}
                          <em>&quot;{targetDisc?.inspectorReport}&quot;</em>
                        </p>
                      </div>
                    );
                  })()}

                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                      Assessing Authority Statutory Decision:
                    </label>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          cursor: "pointer"
                        }}
                      >
                        <input
                          type="radio"
                          name="disc-decision"
                          value="APPROVED"
                          checked={discEtoDecision === "APPROVED"}
                          onChange={() => setDiscEtoDecision("APPROVED")}
                        />
                        <strong style={{ color: "#166534" }}>
                          Approve Closure (Freeze Future Assessment)
                        </strong>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          cursor: "pointer"
                        }}
                      >
                        <input
                          type="radio"
                          name="disc-decision"
                          value="REJECTED"
                          checked={discEtoDecision === "REJECTED"}
                          onChange={() => setDiscEtoDecision("REJECTED")}
                        />
                        <strong style={{ color: "#b91c1c" }}>
                          Reject Notice (Continue Annual Assessment)
                        </strong>
                      </label>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label
                      htmlFor="disc-eto-reason"
                      style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                    >
                      Legal Reasoning / Order Justification:
                    </label>
                    <textarea
                      id="disc-eto-reason"
                      value={discEtoReason}
                      onChange={(e) => setDiscEtoReason(e.target.value)}
                      rows={3}
                      className="form-control"
                      style={{ width: "100%", padding: "0.5rem" }}
                      placeholder="State statutory grounds under Rule 10 and findings from field survey report..."
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <div
              className="modal-footer"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowDiscontinuanceOrderModal(false);
                  setActiveDiscontinuanceOrder(null);
                }}
              >
                Close
              </button>
              {activeDiscontinuanceOrder ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      downloadDocumentPdf(
                        "discontinuance-order-printable",
                        `Discontinuance_Order_${activeDiscontinuanceOrder.orderNumber}.pdf`
                      )
                    }
                  >
                    📥 Download PDF
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => printIsolatedElement("discontinuance-order-printable")}
                  >
                    🖨️ Print Order Document
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                  onClick={() => handleSaveDiscontinuanceOrder(discEtoDecision)}
                >
                  ⚖️ Sign &amp; Promulgate Rule 10 Order
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 22: FILE RULE 5 REFUND / ADJUSTMENT APPLICATION */}
      {showRefundModal && (
        <div className="modal-backdrop" onClick={() => setShowRefundModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header">
              <div>
                <h3>💰 File Rule 5 Refund / Credit Adjustment</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Statutory claim for excess deposit or erroneous tax assessment under Rule 5
                </p>
              </div>
              <button type="button" className="btn-close" onClick={() => setShowRefundModal(false)}>
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleFileRefundApplication();
              }}
            >
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ref-unit-select"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Select Taxpayer Unit:
                  </label>
                  <select
                    id="ref-unit-select"
                    value={refUnitId}
                    onChange={(e) => setRefUnitId(e.target.value)}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.legalName} ({u.demandUnit.permanentDemandNo}) &bull; PKR{" "}
                        {computeLedgerBalance(u.ledgerEntries)} bal
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ref-type-select"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Relief Mechanism:
                  </label>
                  <select
                    id="ref-type-select"
                    value={refType}
                    onChange={(e) => setRefType(e.target.value as "CREDIT_ADJUSTMENT" | "REFUND")}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    <option value="CREDIT_ADJUSTMENT">
                      Double-Entry Credit Adjustment (Carry forward against future demand)
                    </option>
                    <option value="REFUND">
                      Cash Treasury Refund (State Bank / Treasury Voucher)
                    </option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ref-amount-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Claimed Relief Amount (PKR):
                  </label>
                  <input
                    id="ref-amount-input"
                    type="number"
                    min={1}
                    value={refAmount}
                    onChange={(e) => setRefAmount(Number(e.target.value))}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ref-grounds-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Legal Grounds for Claim:
                  </label>
                  <textarea
                    id="ref-grounds-input"
                    value={refGrounds}
                    onChange={(e) => setRefGrounds(e.target.value)}
                    rows={3}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    placeholder="E.g., Inadvertent duplicate Challan 32-A deposit at NBP; rectification of rate schedule subcategory..."
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ref-evidence-input"
                    style={{ fontWeight: 600, display: "block", marginBottom: "0.3rem" }}
                  >
                    Documentary Evidence Reference:
                  </label>
                  <input
                    id="ref-evidence-input"
                    type="text"
                    value={refEvidence}
                    onChange={(e) => setRefEvidence(e.target.value)}
                    className="form-control"
                    style={{ width: "100%", padding: "0.5rem" }}
                    placeholder="E.g., National Bank Challan 32-A scroll reference, bank stamp copy, PSID 99201991"
                  />
                </div>
              </div>

              <div
                className="modal-footer"
                style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRefundModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
                >
                  Submit Application for ETO Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 23: RULE 5 REFUND ADJUDICATION ORDER STUDIO */}
      {showRefundOrderModal && activeRefundOrder && (
        <div className="modal-backdrop" onClick={() => setShowRefundOrderModal(false)}>
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "750px" }}
          >
            <div className="modal-header">
              <div>
                <h3>📄 Rule 5 Statutory Refund / Adjustment Decree</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Adjudication Order issued by Assessing Authority under Rule 5 of 1977 Rules
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => {
                  setShowRefundOrderModal(false);
                  setActiveRefundOrder(null);
                }}
              >
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{ maxHeight: "75vh", overflowY: "auto", padding: "1.5rem" }}
            >
              <div
                id="refund-order-printable"
                style={{
                  background: "#ffffff",
                  border: "2px solid #0d3822",
                  padding: "2rem",
                  borderRadius: "6px",
                  fontFamily: "Georgia, serif"
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "1px solid #0d3822",
                    paddingBottom: "1rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <div style={{ fontSize: "1.5rem" }}>🏛️</div>
                  <h4 style={{ margin: "0.2rem 0", color: "#0d3822" }}>GOVERNMENT OF THE PUNJAB</h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                    OFFICE OF THE EXCISE &amp; TAXATION OFFICER &bull; CIRCLE-VEHARI
                  </p>
                  <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.15rem", color: "#0d3822" }}>
                    STATUTORY ADJUDICATION ORDER UNDER RULE 5 (EXCESS TAX ADJUSTMENT)
                  </h3>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                    marginBottom: "1rem"
                  }}
                >
                  <span>
                    <strong>Order No:</strong> {activeRefundOrder.orderNumber}
                  </span>
                  <span>
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
                        letterSpacing: "1.5px",
                        marginRight: "0.75rem"
                      }}
                    >
                      🔐 PIN: {activeRefundOrder.pin}
                    </span>
                    <strong>Dated:</strong> {activeRefundOrder.orderDate}
                  </span>
                </div>

                <div style={{ fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                  <p>
                    <strong>Assessee:</strong> {activeRefundOrder.assesseeLegalName} (
                    {activeRefundOrder.assesseeTradeName})
                  </p>
                  <p>
                    <strong>Demand No:</strong> {activeRefundOrder.demandNo} &bull;{" "}
                    <strong>CNIC/NTN:</strong> {activeRefundOrder.identifierValue}
                  </p>
                  <p>
                    <strong>Application Ref:</strong> {activeRefundOrder.applicationNumber}
                  </p>
                  <p>
                    <strong>Relief Mode:</strong> {activeRefundOrder.type.replace(/_/g, " ")}
                  </p>
                  <p>
                    <strong>Claimed Amount:</strong> PKR {activeRefundOrder.amount.toLocaleString()}
                  </p>
                  <p>
                    <strong>Grounds of Relief:</strong> <em>{activeRefundOrder.grounds}</em>
                  </p>
                </div>

                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    padding: "1rem",
                    borderRadius: "6px",
                    marginBottom: "1.5rem"
                  }}
                >
                  <h5 style={{ margin: "0 0 0.5rem", color: "#166534" }}>
                    ORDER OF ASSESSING AUTHORITY:
                  </h5>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#14532d" }}>
                    Having examined the bank deposit scrolls, the claim is verified. An immutable
                    double-entry credit of{" "}
                    <strong>PKR {activeRefundOrder.amount.toLocaleString()}</strong> has been posted
                    to the permanent demand ledger of {activeRefundOrder.assesseeLegalName} under
                    transaction reference {activeRefundOrder.orderNumber}.
                  </p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#166534" }}>
                    ✓ Recorded in Demand &amp; Payment Ledger &bull; Immutable entry idempotency
                    verified
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    borderTop: "1px solid #cbd5e1",
                    paddingTop: "1rem",
                    fontSize: "0.8rem"
                  }}
                >
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#64748b" }}>
                      SHA-256: {activeRefundOrder.officialSha256.slice(0, 32)}...
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>{activeRefundOrder.etoName}</strong>
                    <span style={{ display: "block", color: "#64748b" }}>
                      {activeRefundOrder.etoTitle}, Circle-Vehari
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowRefundOrderModal(false);
                  setActiveRefundOrder(null);
                }}
              >
                Close
              </button>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "refund-order-printable",
                      `Refund_Order_${activeRefundOrder.orderNumber}.pdf`
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("refund-order-printable")}
                >
                  🖨️ Print Statutory Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 24: EXECUTIVE PRINT REPORT STUDIO (PHASE 7) */}
      {showExecutivePrintModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-report-title"
        >
          <div className="modal-card modal-card-lg" style={{ maxWidth: "64rem" }}>
            <div
              className="modal-header"
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #064e3b 100%)",
                color: "#ffffff"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.25rem" }}>🏛️</span>
                  <h3
                    id="exec-report-title"
                    style={{ margin: 0, color: "#ffffff", fontSize: "1.1rem" }}
                  >
                    Executive Gazetted Report Studio &bull; Punjab PTAS
                  </h3>
                </div>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#d1fae5" }}>
                  Official High-Fidelity Printable Document &bull; Section 15 of Digitization Plan
                  &bull; Multan Division
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowExecutivePrintModal(false)}
                aria-label="Close report studio"
              >
                &times;
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                maxHeight: "75vh",
                overflowY: "auto",
                padding: "1.5rem",
                background: "#f8fafc"
              }}
            >
              {/* Official Printable Report Container */}
              <div
                id="executive-report-printable"
                style={{
                  background: "#ffffff",
                  border: "2px solid #0d3822",
                  borderRadius: "6px",
                  padding: "2rem",
                  fontFamily: "Georgia, serif",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
                }}
              >
                {/* Official Letterhead Header */}
                <div
                  style={{
                    textAlign: "center",
                    borderBottom: "2px solid #0d3822",
                    paddingBottom: "1.25rem",
                    marginBottom: "1.5rem"
                  }}
                >
                  <div style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>🏛️</div>
                  <h4
                    style={{
                      margin: "0.15rem 0",
                      color: "#0d3822",
                      fontSize: "1.25rem",
                      letterSpacing: "0.05em"
                    }}
                  >
                    GOVERNMENT OF THE PUNJAB
                  </h4>
                  <p
                    style={{
                      margin: "0.15rem 0",
                      fontSize: "0.9rem",
                      color: "#334155",
                      fontWeight: 600
                    }}
                  >
                    DIRECTORATE GENERAL OF EXCISE, TAXATION &amp; NARCOTICS CONTROL
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                    MULTAN DIVISION &bull; DISTRICT VEHARI &bull; CIRCLE-VEHARI
                  </p>

                  <div
                    style={{
                      background: "#0d3822",
                      color: "#ffffff",
                      display: "inline-block",
                      padding: "0.35rem 1.25rem",
                      borderRadius: "4px",
                      marginTop: "0.85rem",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      letterSpacing: "0.03em"
                    }}
                  >
                    {executiveReportType === "EXECUTIVE_MIS_SUMMARY" &&
                      "EXECUTIVE MIS COMPREHENSIVE REVENUE & COMPLIANCE BRIEF"}
                    {executiveReportType === "PFT3_REGISTER" &&
                      "FORM P.F.T-3: ASSESSMENT & DEMAND REGISTER (RULE 11)"}
                    {executiveReportType === "DEFAULTER_ROLL" &&
                      "DEFAULTER ARREARS RECOVERY & REFERRAL ROLL (SECTION 3(4) & RULE 12)"}
                    {executiveReportType === "NOTICE_DISPATCH" &&
                      "CIRCLE NOTICE DISPATCH & SERVICE REGISTER (RULE 6(2))"}
                    {executiveReportType === "CLEARANCE_LOG" &&
                      "FORM P.F.T-5 TAX CLEARANCE CERTIFICATE ISSUANCE REGISTER"}
                    {executiveReportType === "RELIEF_REGISTER" &&
                      "STATUTORY RELIEF & ADJUSTMENT REGISTER (RULES 5 & 10)"}
                    {executiveReportType === "SLAB_DISTRIBUTION" &&
                      "STATUTORY SCHEDULE SUB-CLASS & TERTIARY SLABS DISTRIBUTION REGISTER"}
                  </div>
                </div>

                {/* Meta Details Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    fontSize: "0.8rem",
                    borderBottom: "1px solid #cbd5e1",
                    paddingBottom: "0.85rem",
                    marginBottom: "1.25rem",
                    color: "#334155"
                  }}
                >
                  <div>
                    <strong>Financial Year:</strong> 2026–2027
                    <br />
                    <strong>Jurisdiction:</strong> Circle-Vehari (Tehsil Vehari)
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <strong>Statutory Baseline:</strong> Section 3, Second Schedule
                    <br />
                    <strong>Accounting Head:</strong> B01601 - Tax on Professions
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>Date of Run:</strong> {new Date().toLocaleDateString("en-GB")}
                    <br />
                    <strong>Generated By:</strong> {officer.name} ({officer.role})
                  </div>
                </div>

                {/* Dynamic Content based on executiveReportType */}
                {executiveReportType === "EXECUTIVE_MIS_SUMMARY" && (
                  <div>
                    {/* Executive Summary Metrics Box */}
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        padding: "1rem",
                        borderRadius: "6px",
                        marginBottom: "1.5rem"
                      }}
                    >
                      <h5 style={{ margin: "0 0 0.5rem", color: "#166534", fontSize: "0.95rem" }}>
                        1. EXECUTIVE REVENUE REALIZATION SYNOPSIS:
                      </h5>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "0.75rem",
                          fontSize: "0.85rem"
                        }}
                      >
                        <div>
                          <span style={{ color: "#64748b" }}>Registered Assessees:</span>
                          <br />
                          <strong>{misMetrics.kpis.totalUnitsCount} Commercial Units</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Gross Assessed Demand:</span>
                          <br />
                          <strong>PKR {misMetrics.kpis.totalAssessedGross.toLocaleString()}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Realized Collections:</span>
                          <br />
                          <strong style={{ color: "#166534" }}>
                            PKR {misMetrics.kpis.totalRealizedRecovery.toLocaleString()}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Recovery Yield Rate:</span>
                          <br />
                          <strong>{misMetrics.kpis.recoveryRatePct}% Realized</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Budget Target (PKR 50,000):</span>
                          <br />
                          <strong>{misMetrics.kpis.targetRealizationPct}% Realized</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Remaining Arrears:</span>
                          <br />
                          <strong style={{ color: "#b91c1c" }}>
                            PKR {misMetrics.kpis.outstandingArrears.toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Category Yield Breakdown */}
                    <h5 style={{ margin: "1rem 0 0.5rem", color: "#0d3822", fontSize: "0.95rem" }}>
                      2. SECOND SCHEDULE STATUTORY CATEGORY REVENUE YIELD:
                    </h5>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                        marginBottom: "1.5rem"
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                          <th style={{ padding: "0.4rem", textAlign: "left" }}>Entry</th>
                          <th style={{ padding: "0.4rem", textAlign: "left" }}>Category Name</th>
                          <th style={{ padding: "0.4rem", textAlign: "center" }}>Units</th>
                          <th style={{ padding: "0.4rem", textAlign: "right" }}>Demand (PKR)</th>
                          <th style={{ padding: "0.4rem", textAlign: "right" }}>Realized (PKR)</th>
                          <th style={{ padding: "0.4rem", textAlign: "right" }}>Compliance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {misMetrics.categoryYields.map((cat) => (
                          <tr key={cat.categoryCode} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "0.35rem" }}>{cat.categoryCode}</td>
                            <td style={{ padding: "0.35rem" }}>{cat.categoryName}</td>
                            <td style={{ padding: "0.35rem", textAlign: "center" }}>
                              {cat.unitCount}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace"
                              }}
                            >
                              {cat.totalDemand.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                color: "#166534"
                              }}
                            >
                              {cat.realizedRecovery.toLocaleString()}
                            </td>
                            <td style={{ padding: "0.35rem", textAlign: "right", fontWeight: 700 }}>
                              {cat.compliancePct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Defaulter Funnel & Action Velocity */}
                    <h5 style={{ margin: "1rem 0 0.5rem", color: "#0d3822", fontSize: "0.95rem" }}>
                      3. STATUTORY ENFORCEMENT &amp; OPERATIONAL DESK VELOCITY:
                    </h5>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                        fontSize: "0.82rem",
                        marginBottom: "1.5rem"
                      }}
                    >
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: "0.75rem",
                          borderRadius: "4px"
                        }}
                      >
                        <strong
                          style={{ display: "block", color: "#b91c1c", marginBottom: "0.4rem" }}
                        >
                          Defaulter Arrears Exposure:
                        </strong>
                        <div>
                          &bull; Current within grace: {misMetrics.defaulterFunnel.current.count}{" "}
                          units (PKR {misMetrics.defaulterFunnel.current.amount.toLocaleString()})
                        </div>
                        <div>
                          &bull; Overdue 30+ days: {misMetrics.defaulterFunnel.overdue30Days.count}{" "}
                          units (PKR{" "}
                          {misMetrics.defaulterFunnel.overdue30Days.amount.toLocaleString()})
                        </div>
                        <div>
                          &bull; Show Cause Notice eligible:{" "}
                          {misMetrics.defaulterFunnel.penaltyEligible.count} units (PKR{" "}
                          {misMetrics.defaulterFunnel.penaltyEligible.amount.toLocaleString()})
                        </div>
                        <div>
                          &bull; Penalized under Sec 3(4):{" "}
                          {misMetrics.defaulterFunnel.penalized.count} units (PKR{" "}
                          {misMetrics.defaulterFunnel.penalized.amount.toLocaleString()})
                        </div>
                        <div>
                          &bull; Certified under Rule 12:{" "}
                          {misMetrics.defaulterFunnel.recoveryCertified.count} units (PKR{" "}
                          {misMetrics.defaulterFunnel.recoveryCertified.amount.toLocaleString()})
                        </div>
                      </div>
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: "0.75rem",
                          borderRadius: "4px"
                        }}
                      >
                        <strong
                          style={{ display: "block", color: "#0d3822", marginBottom: "0.4rem" }}
                        >
                          Operational Action Desk Backlog:
                        </strong>
                        <div>
                          &bull; Draft Assessments awaiting approval:{" "}
                          {misMetrics.pendency.pendingDraftAssessments}
                        </div>
                        <div>
                          &bull; Unserved Rule 6 Demand Notices:{" "}
                          {misMetrics.pendency.unservedNotices}
                        </div>
                        <div>
                          &bull; Rule 10 On-site Discontinuance Inspections:{" "}
                          {misMetrics.pendency.pendingFieldInspections}
                        </div>
                        <div>
                          &bull; Section 7 Appellate Hearings pending:{" "}
                          {misMetrics.pendency.pendingAppeals}
                        </div>
                        <div>
                          &bull; Rule 5 Statutory Refund Claims in review:{" "}
                          {misMetrics.pendency.pendingRefunds}
                        </div>
                        <div>
                          &bull; Form P.F.T-5 Clearance Certificates issued:{" "}
                          {misMetrics.pendency.clearanceCertificatesIssued}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {executiveReportType === "PFT3_REGISTER" && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.75rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>PDN</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>
                          Assessee Legal Name
                        </th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>CNIC / NTN</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Category / Entry</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Demand (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Penalty (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Paid (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Balance (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => {
                        const baseTax = u.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                        let penalty = 0;
                        let paid = 0;
                        for (const e of u.ledgerEntries) {
                          if (e.entryType === "PENALTY_DEMAND") penalty += e.amount;
                          if (e.amount < 0) paid += Math.abs(e.amount);
                        }
                        const bal = computeLedgerBalance(u.ledgerEntries);
                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                              {u.demandUnit.permanentDemandNo}
                              {u.provincialUin ? (
                                <span
                                  style={{ display: "block", fontSize: "0.7rem", color: "#0369a1" }}
                                >
                                  {u.provincialUin}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "0.35rem" }}>
                              <strong>{u.legalName}</strong>
                            </td>
                            <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                              {u.identifierValue}
                            </td>
                            <td style={{ padding: "0.35rem" }}>
                              Class {u.statutoryRule.subclassification_code}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace"
                              }}
                            >
                              {baseTax.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                color: penalty > 0 ? "#b91c1c" : undefined
                              }}
                            >
                              {penalty > 0 ? penalty.toLocaleString() : "0"}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                color: "#166534"
                              }}
                            >
                              {paid.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.35rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                fontWeight: 700,
                                color: bal > 0 ? "#b91c1c" : "#166534"
                              }}
                            >
                              {bal.toLocaleString()}
                            </td>
                            <td style={{ padding: "0.35rem", textAlign: "center" }}>
                              {bal <= 0 ? "PAID" : "ARREARS"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {executiveReportType === "DEFAULTER_ROLL" && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.75rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>PDN</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Address</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Schedule Entry</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Days Overdue</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Original Tax</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Penalty</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Total Arrears</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Recovery Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units
                        .filter((u) => computeLedgerBalance(u.ledgerEntries) > 0)
                        .map((u) => {
                          const aging = computeDefaulterAging(
                            u.ledgerEntries,
                            "2026-08-31",
                            undefined,
                            Boolean(u.isRecoveryCertified)
                          );
                          return (
                            <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                              <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                                {u.demandUnit.permanentDemandNo}
                                {u.provincialUin ? (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "0.7rem",
                                      color: "#0369a1"
                                    }}
                                  >
                                    {u.provincialUin}
                                  </span>
                                ) : null}
                              </td>
                              <td style={{ padding: "0.35rem" }}>
                                <strong>{u.legalName}</strong>
                              </td>
                              <td style={{ padding: "0.35rem" }}>{u.address}</td>
                              <td style={{ padding: "0.35rem" }}>
                                Class {u.statutoryRule.subclassification_code}
                              </td>
                              <td style={{ padding: "0.35rem", textAlign: "right" }}>
                                {aging.daysOverdue} days
                              </td>
                              <td
                                style={{
                                  padding: "0.35rem",
                                  textAlign: "right",
                                  fontFamily: "monospace"
                                }}
                              >
                                {aging.originalDemand.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.35rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: "#b91c1c"
                                }}
                              >
                                {aging.penaltyDemand.toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.35rem",
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  color: "#b91c1c"
                                }}
                              >
                                {aging.remainingBalance.toLocaleString()}
                              </td>
                              <td
                                style={{ padding: "0.35rem", textAlign: "center", fontWeight: 700 }}
                              >
                                {aging.status}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}

                {executiveReportType === "NOTICE_DISPATCH" && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.75rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Notice No</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Demand No</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Address</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Amount (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Served Date</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Serving Officer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                            PFT-1/VEH/2026/{u.id.slice(-4)}
                          </td>
                          <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                            {u.demandUnit.permanentDemandNo}
                          </td>
                          <td style={{ padding: "0.35rem" }}>
                            <strong>{u.legalName}</strong>
                          </td>
                          <td style={{ padding: "0.35rem" }}>{u.address}</td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace"
                            }}
                          >
                            {(u.assessmentVersions[0]?.snapshot.taxAmount ?? 0).toLocaleString()}
                          </td>
                          <td style={{ padding: "0.35rem", textAlign: "center" }}>
                            <span
                              className={
                                u.serviceStatus === "SERVED"
                                  ? "badge badge-approved"
                                  : "badge badge-draft"
                              }
                            >
                              {u.serviceStatus ?? "PENDING"}
                            </span>
                          </td>
                          <td style={{ padding: "0.35rem" }}>{u.servedAt ?? "—"}</td>
                          <td style={{ padding: "0.35rem" }}>
                            {u.servedBy ?? "Muhammad Aslam, Inspector"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {executiveReportType === "CLEARANCE_LOG" && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.75rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Certificate No</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Issue Date</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Valid Until</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>CNIC / NTN</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Cleared (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>
                          Official SHA-256 Digest
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {clearanceCertificates.map((cert) => (
                        <tr key={cert.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td
                            style={{ padding: "0.35rem", fontFamily: "monospace", fontWeight: 700 }}
                          >
                            {cert.certificateNumber}
                          </td>
                          <td style={{ padding: "0.35rem" }}>{cert.issueDate}</td>
                          <td style={{ padding: "0.35rem" }}>{cert.validUntil}</td>
                          <td style={{ padding: "0.35rem" }}>
                            <strong>{cert.assesseeLegalName}</strong>
                          </td>
                          <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                            {cert.cnicOrNtn}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#166534",
                              fontWeight: 700
                            }}
                          >
                            {cert.clearedAmountPkr.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              fontFamily: "monospace",
                              fontSize: "0.7rem",
                              color: "#64748b"
                            }}
                          >
                            {cert.officialSha256.slice(0, 24)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {executiveReportType === "RELIEF_REGISTER" && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.75rem",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Reference No</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Relief Type</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Assessee Name</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Filing Date</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Status</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Relief (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>
                          Order Number &amp; Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {discontinuances.map((d) => (
                        <tr key={d.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                            {d.noticeNumber}
                          </td>
                          <td style={{ padding: "0.35rem" }}>Rule 10 Discontinuance</td>
                          <td style={{ padding: "0.35rem" }}>
                            <strong>{d.assesseeLegalName}</strong>
                          </td>
                          <td style={{ padding: "0.35rem" }}>{d.discontinuanceDate}</td>
                          <td style={{ padding: "0.35rem", textAlign: "center" }}>
                            <span className="badge badge-approved">{d.status}</span>
                          </td>
                          <td style={{ padding: "0.35rem", textAlign: "right" }}>Closure</td>
                          <td style={{ padding: "0.35rem" }}>
                            {d.etoOrderNumber ?? "Pending"} ({d.etoOrderDate ?? "—"})
                          </td>
                        </tr>
                      ))}
                      {refundAdjustments.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "0.35rem", fontFamily: "monospace" }}>
                            {r.applicationNumber}
                          </td>
                          <td style={{ padding: "0.35rem" }}>Rule 5 {r.type}</td>
                          <td style={{ padding: "0.35rem" }}>
                            <strong>{r.assesseeLegalName}</strong>
                          </td>
                          <td style={{ padding: "0.35rem" }}>{r.filedAt.split("T")[0]}</td>
                          <td style={{ padding: "0.35rem", textAlign: "center" }}>
                            <span className="badge badge-approved">{r.status}</span>
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#166534"
                            }}
                          >
                            {r.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.35rem" }}>
                            {r.orderNumber ?? "Pending"} ({r.orderDate ?? "—"})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {executiveReportType === "SLAB_DISTRIBUTION" && (
                  <table
                    style={{
                      width: "100%",
                      fontSize: "0.75rem",
                      borderCollapse: "collapse",
                      marginBottom: "1.5rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #0d3822" }}>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Sub-Class</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>Category</th>
                        <th style={{ padding: "0.35rem", textAlign: "left" }}>
                          Tertiary Slab / Criteria
                        </th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Statutory Rate</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Units</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Demand (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Recovery (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "right" }}>Arrears (PKR)</th>
                        <th style={{ padding: "0.35rem", textAlign: "center" }}>Rate %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {misMetrics.slabYields.map((s) => (
                        <tr key={s.ruleId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "0.35rem", fontWeight: 700 }}>
                            {s.ruleCode ??
                              s.statutoryTertiaryCode ??
                              s.subclassificationCode ??
                              s.categoryCode}
                          </td>
                          <td style={{ padding: "0.35rem" }}>{s.categoryName}</td>
                          <td style={{ padding: "0.35rem" }}>{s.tertiarySlab}</td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace"
                            }}
                          >
                            {s.slabRatePkr.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.35rem", textAlign: "center" }}>
                            {s.assessedUnitsCount}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace"
                            }}
                          >
                            {s.assessedDemandPkr.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#166534"
                            }}
                          >
                            {s.realizedRecoveryPkr.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem",
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: s.outstandingArrearsPkr > 0 ? "#dc2626" : undefined
                            }}
                          >
                            {s.outstandingArrearsPkr.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.35rem", textAlign: "center", fontWeight: 700 }}>
                            {s.recoveryRatePct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Official Certification & Non-Repudiation Block */}
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    padding: "1rem",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    color: "#475569",
                    marginBottom: "1.5rem"
                  }}
                >
                  <p style={{ margin: "0 0 0.25rem", fontWeight: 700, color: "#0d3822" }}>
                    STATUTORY CERTIFICATION UNDER PUNJAB PROFESSIONAL TAX RULES, 1977:
                  </p>
                  <p style={{ margin: 0 }}>
                    This document is officially generated from the Punjab Professional Tax
                    Administration System (PTAS) immutable financial demand ledger. All figures are
                    non-repudiable and derived in compliance with Section 15 of the Punjab
                    Professional Tax Digitization Plan. Cryptographically hashed for provincial
                    audit integrity.
                  </p>
                </div>

                {/* Dual Signature Block */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "2rem",
                    borderTop: "1px solid #0d3822"
                  }}
                >
                  <div style={{ textAlign: "center", width: "40%" }}>
                    <div
                      style={{
                        borderBottom: "1px dashed #64748b",
                        height: "2.5rem",
                        marginBottom: "0.5rem"
                      }}
                    ></div>
                    <strong style={{ display: "block", fontSize: "0.85rem", color: "#0d3822" }}>
                      Tariq Mahmood
                    </strong>
                    <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                      Excise &amp; Taxation Officer / Assessing Authority
                      <br />
                      Tehsil Vehari &bull; Circle-Vehari
                    </span>
                  </div>

                  <div style={{ textAlign: "center", width: "40%" }}>
                    <div
                      style={{
                        borderBottom: "1px dashed #64748b",
                        height: "2.5rem",
                        marginBottom: "0.5rem"
                      }}
                    ></div>
                    <strong style={{ display: "block", fontSize: "0.85rem", color: "#0d3822" }}>
                      Shahid Nawaz
                    </strong>
                    <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                      Director, Excise, Taxation &amp; Narcotics Control
                      <br />
                      Multan Division &bull; Government of the Punjab
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowExecutivePrintModal(false)}
              >
                Close Report Studio
              </button>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "executive-report-printable",
                      "Punjab_PTAS_Executive_Gazetted_Report.pdf"
                    )
                  }
                  style={{ background: "#0d3822", borderColor: "#0d3822" }}
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("executive-report-printable")}
                >
                  🖨️ Print Gazetted Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CITIZEN DIGITAL PAYMENT SIMULATOR (17-DIGIT EPAY PSID) */}
      {showCitizenPaymentModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="citpay-modal-title"
        >
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3 id="citpay-modal-title">💳 Instant Citizen Digital Payment Simulator</h3>
              <button
                type="button"
                onClick={() => setShowCitizenPaymentModal(false)}
                className="modal-close-btn"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {citizenPaymentSuccess ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "1rem",
                    background: "#f0fdf4",
                    borderRadius: "8px",
                    border: "1px solid #10b981"
                  }}
                >
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎉</div>
                  <h4 style={{ margin: "0 0 0.5rem", color: "#065f46" }}>
                    Payment Successfully Settled!
                  </h4>
                  <p style={{ fontSize: "0.85rem", color: "#334155", margin: "0 0 1rem" }}>
                    Your deposit of{" "}
                    <strong>PKR {citizenPaymentSuccess.paidAmount.toLocaleString()}</strong> has
                    been credited to the Punjab Professional Tax Demand Ledger.
                  </p>

                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "6px",
                      border: "1px dashed #cbd5e1",
                      textAlign: "left",
                      fontSize: "0.8rem",
                      marginBottom: "1rem"
                    }}
                  >
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>17-Digit ePay PSID:</strong>{" "}
                      <code style={{ fontSize: "0.9rem", color: "#1e3a8a", fontWeight: 700 }}>
                        {citizenPaymentSuccess.psid}
                      </code>
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Transaction ID:</strong> {citizenPaymentSuccess.transactionId}
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Payment Channel:</strong>{" "}
                      {citizenPaymentSuccess.paymentChannel === "EPAY_PUNJAB"
                        ? "ePay Punjab / 1Link (Mobile / ATM)"
                        : "National Bank of Pakistan (Challan 32-A)"}
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Assessee:</strong> {citizenPaymentSuccess.unitName}
                    </p>
                    <p style={{ margin: "0.25rem 0" }}>
                      <strong>Remaining Derived Balance:</strong>{" "}
                      <span
                        style={{
                          fontWeight: 700,
                          color: citizenPaymentSuccess.newBalance <= 0 ? "#166534" : "#b91c1c"
                        }}
                      >
                        PKR {citizenPaymentSuccess.newBalance.toLocaleString()}
                      </span>
                    </p>
                    {citizenPaymentSuccess.clearanceIssued && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          padding: "0.5rem",
                          background: "#dcfce7",
                          borderRadius: "4px",
                          color: "#166534",
                          fontWeight: 600
                        }}
                      >
                        📜 Outstanding arrears fully cleared! Official Form P.F.T-5 Tax Clearance
                        Certificate issued:{" "}
                        <strong>{citizenPaymentSuccess.clearanceCertNumber}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setShowCitizenPaymentModal(false);
                        setActiveTab("CLEARANCE");
                      }}
                    >
                      📜 View Clearance Certificates
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowCitizenPaymentModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleExecuteCitizenPayment();
                  }}
                >
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      Select Assessee / Business Unit:
                    </label>
                    <select
                      className="form-control"
                      value={citizenPayUnitId}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setCitizenPayUnitId(uid);
                        const u = units.find((item) => item.id === uid);
                        if (u) {
                          const bal = computeLedgerBalance(u.ledgerEntries);
                          setCitizenPayAmount(bal > 0 ? bal : u.statutoryRule.annual_rate_pkr);
                        }
                      }}
                    >
                      {units.map((u) => {
                        const bal = computeLedgerBalance(u.ledgerEntries);
                        return (
                          <option key={u.id} value={u.id}>
                            {u.legalName} ({u.identifierType}: {u.identifierValue}) &bull; Balance:
                            PKR {bal.toLocaleString()}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      Payment Gateway Channel:
                    </label>
                    <select
                      className="form-control"
                      value={citizenPayChannel}
                      onChange={(e) =>
                        setCitizenPayChannel(e.target.value as "EPAY_PUNJAB" | "CHALLAN_32A")
                      }
                    >
                      <option value="EPAY_PUNJAB">
                        ePay Punjab (1Link Mobile Banking / ATM / OTC)
                      </option>
                      <option value="CHALLAN_32A">
                        Challan 32-A (National Bank of Pakistan Branch)
                      </option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      Generated 17-Digit ePay PSID:
                    </label>
                    <input
                      type="text"
                      readOnly
                      className="form-control"
                      value={generate17DigitEPayPsid(citizenPayUnitId || units[0]?.id || "0001")}
                      style={{
                        backgroundColor: "#f1f5f9",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#1e3a8a"
                      }}
                    />
                    <small style={{ color: "#64748b", display: "block", marginTop: "0.25rem" }}>
                      Compliant with Government of Punjab Dept Code &lsquo;1001&rsquo; &amp; Vehari
                      District &lsquo;366&rsquo;.
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                    <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      Deposit Amount (PKR):
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="form-control"
                      value={citizenPayAmount}
                      onChange={(e) => setCitizenPayAmount(Number(e.target.value))}
                      required
                    />
                  </div>

                  <div className="modal-footer" style={{ padding: 0 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowCitizenPaymentModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{
                        backgroundColor: "#10b981",
                        borderColor: "#059669",
                        fontWeight: 700
                      }}
                    >
                      ✓ Confirm Online Deposit
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MODAL: RECEIVE FORM PFT-2 PAYMENT CHALLAN (RULE 10 CONVERSION) */}
      {showReceivePft2Modal && receivingChallan && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "36rem",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
                color: "#ffffff",
                padding: "1rem 1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                  📥 Receive Form P.F.T-2 Payment Challan
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#d1fae5" }}>
                  Acknowledge Bank Deposit &bull; Convert to Official Statutory Receipt (Rule 10)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowReceivePft2Modal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.25rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.25rem" }}>
              {/* Challan Summary Banner */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "6px",
                  padding: "0.85rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.25rem"
                  }}
                >
                  <span style={{ color: "#166534", fontWeight: 700 }}>
                    {receivingChallan.challanNumber}
                  </span>
                  <span style={{ fontWeight: 700, color: "#065f46" }}>
                    PKR {receivingChallan.amountPayable.toLocaleString()}
                  </span>
                </div>
                <div style={{ color: "#334155" }}>
                  <strong>{receivingChallan.legalName}</strong> &bull;{" "}
                  {receivingChallan.identifierValue}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  Entry {receivingChallan.subclassificationCode}: {receivingChallan.category} (Slab:{" "}
                  {receivingChallan.tertiarySlab})
                </div>
                <div
                  style={{
                    marginTop: "0.4rem",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    alignItems: "center"
                  }}
                >
                  {receivingChallan.noticeNumber && (
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                        color: "#1e3a8a",
                        background: "#dbeafe",
                        padding: "0.15rem 0.4rem",
                        borderRadius: "4px",
                        fontWeight: 600
                      }}
                    >
                      {receivingChallan.noticeNumber}
                    </span>
                  )}
                  {receivingChallan.pin && (
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                        color: "#065f46",
                        background: "#d1fae5",
                        padding: "0.15rem 0.4rem",
                        borderRadius: "4px",
                        fontWeight: 700
                      }}
                    >
                      🔐 PIN: {receivingChallan.pin}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: "#475569",
                    fontSize: "0.75rem",
                    marginTop: "0.35rem",
                    display: "flex",
                    gap: "1.25rem",
                    borderTop: "1px dashed #cbd5e1",
                    paddingTop: "0.35rem"
                  }}
                >
                  <span>
                    📅 <strong>Issued:</strong> {receivingChallan.issueDate}
                  </span>
                  <span>
                    ⏰ <strong>Due Date:</strong> {receivingChallan.dueDate}
                  </span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConfirmReceivePft2();
                }}
              >
                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Payment Treasury Channel:
                  </label>
                  <select
                    className="form-control"
                    value={receivePaymentChannel}
                    onChange={(e) => setReceivePaymentChannel(e.target.value)}
                    required
                  >
                    <option value="National Bank of Pakistan">
                      National Bank of Pakistan (Authorized Treasury)
                    </option>
                    <option value="State Bank of Pakistan">State Bank of Pakistan</option>
                    <option value="ePay Punjab (Digital Bank Transfer)">
                      ePay Punjab (Digital Bank Transfer / 1Link)
                    </option>
                    <option value="Bank of Punjab">Bank of Punjab</option>
                    <option value="District Cash Counter (OTC)">
                      District Cash Counter (Over the Counter)
                    </option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Bank Branch / Treasury Location:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={receiveBankBranch}
                    onChange={(e) => setReceiveBankBranch(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Bank Scroll / CPR Reference Number:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. NBP-CPR-2026-90142"
                    value={receiveBankScrollRef}
                    onChange={(e) => setReceiveBankScrollRef(e.target.value)}
                    required
                  />
                  <small style={{ color: "#64748b", display: "block", marginTop: "0.2rem" }}>
                    Computerized Payment Receipt (CPR) or Bank Daily Scroll serial reference.
                  </small>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    marginBottom: "0.85rem"
                  }}
                >
                  <div className="form-group">
                    <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      📅 Date of Receipt:
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={receiveDate}
                      min={receivingChallan.issueDate}
                      max={receivingChallan.dueDate}
                      onChange={(e) => setReceiveDate(e.target.value)}
                      required
                    />
                    <small
                      style={{
                        color: "#047857",
                        fontSize: "0.72rem",
                        display: "block",
                        marginTop: "0.25rem",
                        fontWeight: 600
                      }}
                    >
                      Permitted: {receivingChallan.issueDate} to {receivingChallan.dueDate}
                    </small>
                  </div>
                  <div className="form-group">
                    <label
                      style={{
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem"
                      }}
                    >
                      <span>🔒</span>
                      <span>Amount Received (PKR):</span>
                      <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>
                        (Locked)
                      </span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={`PKR ${receivingChallan.amountPayable.toLocaleString()}`}
                      readOnly
                      disabled
                      style={{
                        backgroundColor: "#f8fafc",
                        color: "#0f172a",
                        cursor: "not-allowed",
                        fontWeight: 700,
                        border: "1px solid #cbd5e1"
                      }}
                    />
                    <small
                      style={{
                        color: "#64748b",
                        fontSize: "0.72rem",
                        display: "block",
                        marginTop: "0.25rem"
                      }}
                    >
                      Challan payable amount is legally locked to issued Form P.F.T-2.
                    </small>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Acknowledgement Remarks:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={receiveRemarks}
                    onChange={(e) => setReceiveRemarks(e.target.value)}
                  />
                </div>

                <div
                  className="modal-footer"
                  style={{ padding: 0, display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowReceivePft2Modal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ backgroundColor: "#047857", borderColor: "#065f46", fontWeight: 700 }}
                  >
                    ✓ Confirm Receipt &amp; Issue Official Receipt
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE FORM P.F.T-2 PAYMENT CHALLAN */}
      {showIssuePft2Modal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "42rem",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
                color: "#ffffff",
                padding: "1.1rem 1.35rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                  ➕ Issue Form P.F.T-2 Payment Challan (اجراء چالان فارم پی ایف ٹی-2)
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#bbf7d0" }}>
                  Official Statutory 3-Copy Payment Instrument under Rule 9 &bull; Circle-Vehari
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowIssuePft2Modal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.25rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.35rem" }}>
              {(() => {
                const selectedUnit = units.find((u) => u.id === issuePft2UnitId) ?? units[0];
                const latestVersion = selectedUnit?.assessmentVersions[0];
                const baseTax = latestVersion?.snapshot.taxAmount ?? 0;
                let penalty = 0;
                if (selectedUnit) {
                  for (const entry of selectedUnit.ledgerEntries) {
                    if (entry.entryType === "PENALTY_DEMAND") {
                      penalty += entry.amount;
                    }
                  }
                }
                const fullAssessed = baseTax + penalty;
                const isPartial = issuePft2PaymentScope === "PARTIAL";
                const effectiveAmount = isPartial ? issuePft2PartialAmount : fullAssessed;
                const remainingBalance = isPartial
                  ? Math.max(0, fullAssessed - effectiveAmount)
                  : 0;

                const liveNoticeNumber = selectedUnit
                  ? generatePft2NoticeNumber({
                      demandNumber: selectedUnit.demandUnit.permanentDemandNo,
                      issueDate: issuePft2IssueDate,
                      formTypeCode: issuePft2FormType,
                      demandScope: issuePft2DemandScope,
                      paymentScope: issuePft2PaymentScope,
                      amount: effectiveAmount
                    })
                  : "PFT2-...";

                const livePin = generateDocumentPin(liveNoticeNumber);

                return (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleConfirmIssuePft2();
                    }}
                  >
                    {/* Taxpayer Selection */}
                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                      <label style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0d3822" }}>
                        Taxpayer Establishment / Demand Unit:
                      </label>
                      <select
                        className="form-control"
                        value={issuePft2UnitId}
                        onChange={(e) => {
                          const uid = e.target.value;
                          setIssuePft2UnitId(uid);
                          const u = units.find((x) => x.id === uid);
                          const a = u?.assessmentVersions[0]?.snapshot.taxAmount ?? 0;
                          setIssuePft2PartialAmount(Math.round(a / 2));
                        }}
                        required
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.demandUnit.permanentDemandNo} &bull; {u.legalName} (
                            {u.statutoryRule.subclassification_code ??
                              u.statutoryRule.category_code}{" "}
                            - PKR{" "}
                            {u.assessmentVersions[0]?.snapshot.taxAmount?.toLocaleString() ?? 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedUnit && (
                      <div
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "6px",
                          padding: "0.75rem 1rem",
                          marginBottom: "1rem",
                          fontSize: "0.825rem",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.5rem"
                        }}
                      >
                        <div>
                          <strong>Assessee:</strong> {selectedUnit.legalName}
                        </div>
                        <div>
                          <strong>CNIC / NTN:</strong> {selectedUnit.identifierValue}
                        </div>
                        <div>
                          <strong>Classification:</strong> Class{" "}
                          {selectedUnit.statutoryRule.subclassification_code ??
                            selectedUnit.statutoryRule.category_code}
                        </div>
                        <div>
                          <strong>Assessed Annual Demand:</strong> PKR{" "}
                          {fullAssessed.toLocaleString()}
                        </div>
                      </div>
                    )}

                    {/* Form Controls Grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                        marginBottom: "1rem"
                      }}
                    >
                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Issue Date:</label>
                        <input
                          type="date"
                          className="form-control"
                          value={issuePft2IssueDate}
                          onChange={(e) => setIssuePft2IssueDate(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                          Due Date (تاریخ ادائیگی):
                        </label>
                        <input
                          type="date"
                          className="form-control"
                          value={issuePft2DueDate}
                          onChange={(e) => setIssuePft2DueDate(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                          Form Type Selection:
                        </label>
                        <select
                          className="form-control"
                          value={issuePft2FormType}
                          onChange={(e) =>
                            setIssuePft2FormType(
                              e.target.value as
                                | "STANDARD"
                                | "NOTICE_CUM_CHALLAN"
                                | "ARREARS_DEMAND"
                                | "REVISED_ASSESSMENT"
                            )
                          }
                          required
                        >
                          <option value="STANDARD">
                            01 - Standard Payment Challan (عام چالان)
                          </option>
                          <option value="NOTICE_CUM_CHALLAN">
                            02 - Notice-cum-Challan (نوٹس مع چالان)
                          </option>
                          <option value="ARREARS_DEMAND">
                            03 - Arrears Recovery Demand (بقایاجات چالان)
                          </option>
                          <option value="REVISED_ASSESSMENT">
                            04 - Revised Assessment / Relief (نظرثانی شدہ چالان)
                          </option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                          Demand Scope Code (دائرہ کار کوڈ):
                        </label>
                        <select
                          className="form-control"
                          value={issuePft2DemandScope}
                          onChange={(e) =>
                            setIssuePft2DemandScope(
                              e.target.value as "CURRENT" | "ARREAR" | "COMBINED"
                            )
                          }
                          required
                        >
                          <option value="CURRENT">
                            01 - Current Year Demand (موجودہ سالانہ ٹیکس)
                          </option>
                          <option value="ARREAR">
                            02 - Arrears / Prior Outstanding (بقایاجات)
                          </option>
                          <option value="COMBINED">
                            03 - Combined Current &amp; Arrears (مشترکہ ڈیمانڈ)
                          </option>
                        </select>
                      </div>
                    </div>

                    {/* Payment Mode Selection */}
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        padding: "0.85rem 1rem",
                        marginBottom: "1rem"
                      }}
                    >
                      <label
                        style={{
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          display: "block",
                          marginBottom: "0.5rem"
                        }}
                      >
                        Payment Amount Mode:
                      </label>
                      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="radio"
                            name="paymentScopeRadio"
                            value="FULL"
                            checked={issuePft2PaymentScope === "FULL"}
                            onChange={() => setIssuePft2PaymentScope("FULL")}
                          />
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                            Full Assessed Demand (PKR {fullAssessed.toLocaleString()})
                          </span>
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="radio"
                            name="paymentScopeRadio"
                            value="PARTIAL"
                            checked={issuePft2PaymentScope === "PARTIAL"}
                            onChange={() => setIssuePft2PaymentScope("PARTIAL")}
                          />
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                            Partial / Installment Amount (قسط / جزوی ادائیگی)
                          </span>
                        </label>
                      </div>

                      {issuePft2PaymentScope === "PARTIAL" && (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "1rem",
                            alignItems: "center"
                          }}
                        >
                          <div>
                            <label
                              style={{ fontWeight: 700, fontSize: "0.8rem", color: "#92400e" }}
                            >
                              Enter Partial Challan Amount (PKR):
                            </label>
                            <input
                              type="number"
                              min={100}
                              max={fullAssessed}
                              className="form-control"
                              value={issuePft2PartialAmount}
                              onChange={(e) => setIssuePft2PartialAmount(Number(e.target.value))}
                              required
                            />
                          </div>
                          <div
                            style={{
                              background: "#fef3c7",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "6px",
                              border: "1px solid #fde68a",
                              fontSize: "0.8rem"
                            }}
                          >
                            <span style={{ color: "#92400e", fontWeight: 700 }}>
                              Remaining Balance after payment:
                            </span>
                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#78350f" }}>
                              PKR {remainingBalance.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* LIVE STATUTORY PREVIEW BANNER */}
                    <div
                      style={{
                        background: "#f0f9ff",
                        border: "2px solid #bae6fd",
                        borderRadius: "8px",
                        padding: "1rem",
                        marginBottom: "1.25rem"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.5rem"
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            color: "#0369a1",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}
                        >
                          🔍 Live Statutory Identification Preview
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: "0.9rem",
                            background: "#0284c7",
                            color: "#ffffff",
                            letterSpacing: "2px"
                          }}
                          title="Official Document Security PIN"
                        >
                          🔐 PIN: {livePin}
                        </span>
                      </div>

                      <div style={{ marginBottom: "0.4rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                          Statutory Notice Number Pattern:
                        </span>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: "#0c4a6e",
                            background: "#ffffff",
                            padding: "0.4rem 0.6rem",
                            borderRadius: "4px",
                            border: "1px solid #e0f2fe",
                            marginTop: "0.2rem",
                            wordBreak: "break-all"
                          }}
                        >
                          {liveNoticeNumber}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.75rem",
                          color: "#0369a1",
                          fontWeight: 600
                        }}
                      >
                        <span>Challan Payable: PKR {effectiveAmount.toLocaleString()}</span>
                        <span>Due Date: {issuePft2DueDate}</span>
                        <span>
                          Digit Codes: [Type:{" "}
                          {issuePft2FormType === "STANDARD"
                            ? "01"
                            : issuePft2FormType === "NOTICE_CUM_CHALLAN"
                              ? "02"
                              : issuePft2FormType === "ARREARS_DEMAND"
                                ? "03"
                                : "04"}
                          ] &bull; [Scope:{" "}
                          {issuePft2DemandScope === "CURRENT"
                            ? "01"
                            : issuePft2DemandScope === "ARREAR"
                              ? "02"
                              : "03"}
                          ] &bull; [Payment: {issuePft2PaymentScope === "FULL" ? "01" : "02"}]
                        </span>
                      </div>
                    </div>

                    <div
                      className="modal-footer"
                      style={{
                        padding: 0,
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "0.5rem"
                      }}
                    >
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowIssuePft2Modal(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary"
                        style={{
                          backgroundColor: "#0d3822",
                          borderColor: "#062415",
                          fontWeight: 700
                        }}
                      >
                        ✓ Issue Form PFT-2 Challan
                      </button>
                    </div>
                  </form>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINT / DOWNLOAD FORM P.F.T-2 CHALLAN (3-COPY INSTRUMENT) */}
      {showPrintChallanModal && activePrintChallan && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "76rem",
              width: "100%",
              maxHeight: "94vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
                color: "#ffffff",
                padding: "1rem 1.35rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem"
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                  📑 Form P.F.T-2: Punjab Professional Tax Payment Challan
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#bbf7d0" }}>
                  Notice No: {activePrintChallan.noticeNumber} &bull; Security PIN: 🔐{" "}
                  {activePrintChallan.pin}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
                  onClick={() =>
                    downloadDocumentPdf(
                      "pft2-single-printable-document",
                      `Form_PFT2_Challan_${activePrintChallan.challanNumber.replace(/\//g, "_")}.pdf`,
                      { orientation: "landscape" }
                    )
                  }
                  title="Download 3-copy Form PFT-2 challan as PDF"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ backgroundColor: "#ffffff", color: "#0d3822", fontWeight: 700 }}
                  onClick={() => printIsolatedElement("pft2-single-printable-document")}
                  title="Print all 3 copies of this Form PFT-2 challan"
                >
                  🖨️ Print Challan (3 Copies)
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintChallanModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "1.25rem",
                    cursor: "pointer",
                    marginLeft: "0.5rem"
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ padding: "1.25rem" }}>
              {(() => {
                const targetUnit =
                  units.find((u) => u.id === activePrintChallan.unitId) ?? units[0];
                if (!targetUnit) return null;

                const challanModel = generateFormPFT2(targetUnit, {
                  customAmount: activePrintChallan.amountPayable,
                  dueDate: activePrintChallan.dueDate,
                  issueDate: activePrintChallan.issueDate,
                  formType: activePrintChallan.formType,
                  demandScope: activePrintChallan.demandScope,
                  paymentScope: activePrintChallan.paymentScope,
                  noticeNumber: activePrintChallan.noticeNumber,
                  pin: activePrintChallan.pin,
                  isPartial: activePrintChallan.paymentScope === "PARTIAL",
                  remainingBalance: activePrintChallan.remainingBalance
                });

                return (
                  <div>
                    {/* Notice & PIN Meta Header Banner */}
                    <div
                      style={{
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                        borderRadius: "6px",
                        padding: "0.75rem 1rem",
                        marginBottom: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        fontSize: "0.85rem"
                      }}
                    >
                      <div>
                        <strong style={{ color: "#0369a1" }}>Notice Number: </strong>
                        <span
                          style={{ fontFamily: "monospace", fontWeight: 700, color: "#0c4a6e" }}
                        >
                          {activePrintChallan.noticeNumber}
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            padding: "0.2rem 0.6rem",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: "0.85rem",
                            background: "#0284c7",
                            color: "#ffffff",
                            letterSpacing: "1.5px"
                          }}
                        >
                          🔐 PIN: {activePrintChallan.pin}
                        </span>
                      </div>
                    </div>

                    {/* 3-Copy Side-by-Side Grid */}
                    <div
                      className="challan-grid printable-document"
                      id="pft2-single-printable-document"
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
                                onScanOrClick={(payload) => {
                                  setPortalVerificationInput(payload);
                                  handleVerifyDocument(payload);
                                  setShowPrintChallanModal(false);
                                  setActiveTab("PUBLIC_PORTAL");
                                }}
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
                                  color: "#0d3822"
                                }}
                              >
                                GOVERNMENT OF THE PUNJAB
                              </h4>
                              <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700 }}>
                                EXCISE &amp; TAXATION DEPARTMENT
                              </p>
                              <p
                                style={{ margin: "0.1rem 0", fontSize: "0.68rem", fontWeight: 600 }}
                              >
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
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: 800,
                                  color: "#0d3822"
                                }}
                              >
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
                                  <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>
                                    Rs. 0
                                  </td>
                                </tr>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                  <td style={{ padding: "0.25rem 0.4rem" }}>Penalty</td>
                                  <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>
                                    Rs. 0
                                  </td>
                                </tr>
                                <tr style={{ fontWeight: 800, background: "#f0fdf4" }}>
                                  <td style={{ padding: "0.3rem 0.4rem", color: "#166534" }}>
                                    Total Payable
                                  </td>
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
                            <p style={{ margin: "0.1rem 0" }}>
                              Date: _____________________________
                            </p>
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
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL FORM PFT-2 CHALLAN */}
      {showCancelPft2Modal && cancellingChallan && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "30rem",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1"
            }}
          >
            <div
              style={{
                background: "#b91c1c",
                color: "#ffffff",
                padding: "1rem 1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                ❌ Cancel Form P.F.T-2 Challan
              </h3>
              <button
                type="button"
                onClick={() => setShowCancelPft2Modal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.25rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.25rem" }}>
              <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#475569" }}>
                Are you sure you want to cancel challan{" "}
                <strong>{cancellingChallan.challanNumber}</strong> issued to{" "}
                <strong>{cancellingChallan.legalName}</strong>?
              </p>

              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Cancellation Justification / Reason:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={cancelPft2Reason}
                  onChange={(e) => setCancelPft2Reason(e.target.value)}
                  required
                />
                <small style={{ color: "#64748b", display: "block", marginTop: "0.25rem" }}>
                  Mandatory for statutory audit compliance under Rule 11.
                </small>
              </div>

              <div
                className="modal-footer"
                style={{ padding: 0, display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCancelPft2Modal(false)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: "#dc2626", borderColor: "#b91c1c" }}
                  onClick={handleConfirmCancelPft2}
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STATUTORY PAYMENT RECEIPT / ACKNOWLEDGEMENT (RULE 10) */}
      {showReceiptDocumentModal && activeReceiptRecord && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card modal-card-lg"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "52rem",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #0d3822 0%, #14532d 100%)",
                color: "#ffffff",
                padding: "1rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                  Statutory Payment Receipt (Rule 10)
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#d1fae5" }}>
                  Official Treasury Acknowledgement &bull; Head B01601 &bull; Permanent Record
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    downloadDocumentPdf(
                      "receipt-document-card",
                      `Statutory_Receipt_${activeReceiptRecord.receiptNumber}.pdf`
                    )
                  }
                  style={{ background: "#ffffff", color: "#0d3822", fontWeight: 700 }}
                  title="Download clean standalone PDF file"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => printIsolatedElement("receipt-document-card")}
                  style={{ background: "rgba(255,255,255,0.2)", color: "#ffffff" }}
                  title="Print official document"
                >
                  🖨️ Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptDocumentModal(false);
                    setActiveReceiptRecord(null);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "1.25rem",
                    cursor: "pointer"
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document Body Target */}
            <div style={{ padding: "1.5rem" }}>
              <div
                id="receipt-document-card"
                className="printable-document receipt-document"
                style={{
                  border: "2px solid #0d3822",
                  borderRadius: "6px",
                  padding: "2rem",
                  background: "#ffffff",
                  fontFamily: "Georgia, serif",
                  position: "relative"
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
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "#475569",
                      letterSpacing: "0.05em"
                    }}
                  >
                    GOVERNMENT OF THE PUNJAB &bull; EXCISE, TAXATION &amp; NARCOTICS CONTROL
                    DEPARTMENT
                  </p>
                  <h2
                    style={{
                      margin: "0.35rem 0",
                      color: "#0d3822",
                      fontSize: "1.35rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em"
                    }}
                  >
                    OFFICE OF THE EXCISE &amp; TAXATION OFFICER, CIRCLE-VEHARI
                  </h2>
                  <h3
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "1.05rem",
                      color: "#166534",
                      fontWeight: 700
                    }}
                  >
                    STATUTORY PAYMENT RECEIPT / ACKNOWLEDGEMENT
                  </h3>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    (Issued under Rule 10 of the Punjab Professions and Trades Tax Rules, 1977)
                  </p>
                </div>

                {/* Metadata Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
                    gap: "1rem",
                    padding: "0.75rem 1rem",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    marginBottom: "1.5rem",
                    fontSize: "0.85rem"
                  }}
                >
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
                      Receipt Number:
                    </span>
                    <strong style={{ color: "#065f46", fontSize: "1rem" }}>
                      {activeReceiptRecord.receiptNumber}
                    </strong>
                    {activeReceiptRecord.pin && (
                      <span
                        style={{
                          display: "inline-block",
                          marginLeft: "0.5rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "0.8rem",
                          background: "#ecfdf5",
                          color: "#047857",
                          border: "1px solid #a7f3d0",
                          letterSpacing: "1px"
                        }}
                      >
                        🔐 PIN: {activeReceiptRecord.pin}
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
                      Date &amp; Time of Receipt:
                    </span>
                    <strong>
                      {activeReceiptRecord.dateOfReceipt} {activeReceiptRecord.timeOfReceipt}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
                      Challan Reference (Form P.F.T-2):
                    </span>
                    <strong>{activeReceiptRecord.challanNumber}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>
                      Permanent Demand No (PDN):
                    </span>
                    <strong>{activeReceiptRecord.demandNumber}</strong>
                  </div>
                </div>

                {/* Taxpayer Information */}
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginBottom: "1.5rem",
                    fontSize: "0.875rem"
                  }}
                >
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.5rem 0", color: "#64748b", width: "30%" }}>
                        Assessee Legal Name:
                      </td>
                      <td style={{ padding: "0.5rem 0", fontWeight: 700, color: "#0f172a" }}>
                        {activeReceiptRecord.assesseeLegalName}
                      </td>
                    </tr>
                    {activeReceiptRecord.assesseeTradeName && (
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "0.5rem 0", color: "#64748b" }}>
                          Trade / Business Name:
                        </td>
                        <td style={{ padding: "0.5rem 0", fontWeight: 600 }}>
                          {activeReceiptRecord.assesseeTradeName}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.5rem 0", color: "#64748b" }}>
                        Registration / Tax Identifier:
                      </td>
                      <td style={{ padding: "0.5rem 0", fontFamily: "monospace", fontWeight: 600 }}>
                        {activeReceiptRecord.identifierType}: {activeReceiptRecord.identifierValue}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.5rem 0", color: "#64748b" }}>Commercial Address:</td>
                      <td style={{ padding: "0.5rem 0" }}>{activeReceiptRecord.address}</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.5rem 0", color: "#64748b" }}>
                        Second Schedule Classification:
                      </td>
                      <td style={{ padding: "0.5rem 0", fontWeight: 600 }}>
                        Entry {activeReceiptRecord.subclassificationCode}:{" "}
                        {activeReceiptRecord.statutoryCategory} (Slab:{" "}
                        {activeReceiptRecord.tertiarySlab})
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.5rem 0", color: "#64748b" }}>
                        Provincial Account Head:
                      </td>
                      <td style={{ padding: "0.5rem 0", fontFamily: "monospace" }}>
                        B01601 &mdash; Punjab Professional Tax (Provincial)
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Amount Box */}
                <div
                  style={{
                    border: "2px solid #10b981",
                    borderRadius: "6px",
                    background: "#f0fdf4",
                    padding: "1.25rem",
                    marginBottom: "1.5rem",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem"
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#166534",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Total Tax Liability Discharged
                    </span>
                    <h1 style={{ margin: "0.25rem 0", color: "#065f46", fontSize: "1.75rem" }}>
                      PKR {activeReceiptRecord.amountPaidPkr.toLocaleString()}
                    </h1>
                    <p
                      style={{ margin: 0, fontSize: "0.85rem", color: "#166534", fontWeight: 600 }}
                    >
                      (Amount in words: {activeReceiptRecord.amountPaidWords})
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.35rem 0.75rem",
                        background: "#dcfce7",
                        color: "#166534",
                        fontWeight: 700,
                        borderRadius: "20px",
                        fontSize: "0.8rem",
                        border: "1px solid #86efac"
                      }}
                    >
                      ✓ TREASURY DEPOSIT VERIFIED
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        color: "#64748b",
                        marginTop: "0.35rem"
                      }}
                    >
                      Channel: {activeReceiptRecord.paymentChannel}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        color: "#1e3a8a"
                      }}
                    >
                      Scroll/CPR: {activeReceiptRecord.bankScrollRef}
                    </span>
                  </div>
                </div>

                {/* Statutory Certification Statement */}
                <div
                  style={{
                    background: "#fafafa",
                    borderLeft: "4px solid #0d3822",
                    padding: "0.85rem 1rem",
                    marginBottom: "1.75rem",
                    fontSize: "0.85rem",
                    color: "#334155",
                    lineHeight: 1.5
                  }}
                >
                  <strong>Statutory Certification:</strong> Received the amount stated above on
                  account of Punjab Professional Tax assessed under Section 3 of the Punjab Finance
                  Act, 1977. The amount has been credited to the official provincial head of account
                  and posted to the assessee&rsquo;s immutable demand ledger.
                </div>

                {/* Signatures & Security Footer */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    gap: "1.5rem",
                    borderTop: "1px solid #cbd5e1",
                    paddingTop: "1.5rem"
                  }}
                >
                  {/* Left: Authentic ISO/IEC 18004 QR Code */}
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <StatutoryQrCode
                      payload={activeReceiptRecord.qrPayload}
                      size={110}
                      label="SCAN TO VERIFY"
                      subtitle={activeReceiptRecord.receiptNumber}
                    />
                    <div>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: "#0d3822"
                        }}
                      >
                        GOVERNMENT OF PUNJAB VERIFICATION
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.65rem",
                          color: "#64748b",
                          maxWidth: "16rem",
                          marginTop: "0.2rem"
                        }}
                      >
                        Scan via smartphone camera to verify authenticity directly against the
                        provincial demand ledger.
                      </span>
                    </div>
                  </div>

                  {/* Right: Receiving Officer Seal & Sign */}
                  <div style={{ textAlign: "center", minWidth: "16rem" }}>
                    <div
                      style={{
                        borderBottom: "1px solid #000000",
                        width: "100%",
                        marginBottom: "0.5rem",
                        height: "2.5rem"
                      }}
                    />
                    <strong style={{ display: "block", fontSize: "0.9rem" }}>
                      {activeReceiptRecord.receivingOfficerName}
                    </strong>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                      {activeReceiptRecord.receivingOfficerTitle}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.7rem",
                        color: "#0d3822",
                        fontWeight: 700,
                        marginTop: "0.2rem"
                      }}
                    >
                      Assessing Authority &bull; Circle-Vehari
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                padding: "0.75rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Document SHA-256: {activeReceiptRecord.officialSha256.slice(0, 24)}...
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    downloadDocumentPdf(
                      "receipt-document-card",
                      `Statutory_Receipt_${activeReceiptRecord.receiptNumber}.pdf`
                    )
                  }
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => printIsolatedElement("receipt-document-card")}
                >
                  🖨️ Print Receipt
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowReceiptDocumentModal(false);
                    setActiveReceiptRecord(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PFT-2 EXECUTIVE MANAGEMENT BRIEF */}
      {showPft2ExecutiveModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "40rem",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1",
              padding: "1.5rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem"
              }}
            >
              <h3 style={{ margin: 0, color: "#0d3822", fontSize: "1.2rem" }}>
                📊 Form P.F.T-2 Executive Management Brief
              </h3>
              <button
                type="button"
                onClick={() => setShowPft2ExecutiveModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            {(() => {
              const summary = calculatePft2ExecutiveSummary(pft2Challans);
              return (
                <div>
                  <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0 0 1.25rem" }}>
                    Lifecycle summary of all Form P.F.T-2 Payment Challans in Circle-Vehari under
                    Rule 9 of the 1977 Rules.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                      marginBottom: "1.25rem"
                    }}
                  >
                    <div
                      style={{
                        background: "#f8fafc",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Total Assessed Demand
                      </span>
                      <h3 style={{ margin: "0.25rem 0", color: "#0d3822" }}>
                        PKR {summary.totalDemandPkr.toLocaleString()}
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                        {summary.total} total challans issued
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#f0fdf4",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #bbf7d0"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                        Realized Collections
                      </span>
                      <h3 style={{ margin: "0.25rem 0", color: "#15803d" }}>
                        PKR {summary.receivedAmountPkr.toLocaleString()}
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                        {summary.receivedCount} challans converted to receipts
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#fffbeb",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #fde68a"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#b45309" }}>
                        Pending Collections
                      </span>
                      <h3 style={{ margin: "0.25rem 0", color: "#d97706" }}>
                        PKR {summary.pendingAmountPkr.toLocaleString()}
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "#b45309" }}>
                        {summary.issuedCount} challans active in field
                      </span>
                    </div>

                    <div
                      style={{
                        background: "#f1f5f9",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                        Collection Realization Rate
                      </span>
                      <h3 style={{ margin: "0.25rem 0", color: "#1e3a8a" }}>
                        {summary.realizationRate}%
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {summary.cancelledCount} superseded / cancelled
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        handleExportPft2Csv();
                        setShowPft2ExecutiveModal(false);
                      }}
                    >
                      📥 Export CSV Register
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowPft2ExecutiveModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: RECEIPTS EXECUTIVE COLLECTION BRIEF */}
      {showReceiptsExecutiveModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              maxWidth: "42rem",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1",
              padding: "1.5rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem"
              }}
            >
              <h3 style={{ margin: 0, color: "#0d3822", fontSize: "1.2rem" }}>
                📊 Statutory Receipts Executive Collection Brief
              </h3>
              <button
                type="button"
                onClick={() => setShowReceiptsExecutiveModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            {(() => {
              const summary = calculateReceiptsExecutiveSummary(statutoryReceipts);
              return (
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                      marginBottom: "1.25rem"
                    }}
                  >
                    <div
                      style={{
                        background: "#f0fdf4",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #bbf7d0"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                        Total Verified Collections
                      </span>
                      <h2 style={{ margin: "0.25rem 0", color: "#065f46" }}>
                        PKR {summary.totalRevenuePkr.toLocaleString()}
                      </h2>
                      <span style={{ fontSize: "0.75rem", color: "#166534" }}>
                        Across {summary.totalReceipts} issued receipts
                      </span>
                    </div>
                    <div
                      style={{
                        background: "#f8fafc",
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Average Receipt Yield
                      </span>
                      <h2 style={{ margin: "0.25rem 0", color: "#1e3a8a" }}>
                        PKR {summary.averageReceiptPkr.toLocaleString()}
                      </h2>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Per discharged assessee
                      </span>
                    </div>
                  </div>

                  <h4 style={{ margin: "1rem 0 0.5rem", fontSize: "0.95rem", color: "#0f172a" }}>
                    Collections by Treasury Channel
                  </h4>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                      marginBottom: "1.25rem"
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
                        <th style={{ padding: "0.5rem", textAlign: "left" }}>Payment Channel</th>
                        <th style={{ padding: "0.5rem", textAlign: "center" }}>Transactions</th>
                        <th style={{ padding: "0.5rem", textAlign: "right" }}>Total Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary.channelBreakdown).map(([ch, data]) => (
                        <tr key={ch} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>{ch}</td>
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>{data.count}</td>
                          <td
                            style={{
                              padding: "0.5rem",
                              textAlign: "right",
                              color: "#166534",
                              fontWeight: 700
                            }}
                          >
                            PKR {data.totalPkr.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        handleExportReceiptsCsv();
                        setShowReceiptsExecutiveModal(false);
                      }}
                    >
                      📥 Export Receipts CSV
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowReceiptsExecutiveModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* UNIVERSAL QR CODE SCANNER MODAL */}
      <QrScannerModal
        isOpen={showQrScannerModal}
        onClose={() => setShowQrScannerModal(false)}
        onScan={(payload) => {
          setPortalVerificationInput(payload);
          handleVerifyDocument(payload);
          showToast("success", `QR Code detected and verified!`);
        }}
      />
    </div>
  );
}

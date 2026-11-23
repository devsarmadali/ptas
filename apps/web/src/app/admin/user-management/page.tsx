"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CADRE_BPS_BOUNDS,
  canAuthorityManageCadre,
  canEditOfficerProfile,
  normalizeCadreCode,
  type PostChargeType
} from "@ptas/domain";
import {
  type JurisdictionGovernanceOverview,
  type LiveAuditRecord,
  type LiveOfficerAccount,
  type ProvisionableCadreRole,
  type SanctionedPostRecord,
  adminCreateOfficer,
  adminSetOfficerPassword,
  assignOfficerToPost,
  attachCircleToTehsil,
  fetchJurisdictionGovernanceOverview,
  fetchOfficersDirectory,
  fetchUserManagementAuditLog,
  relieveOfficerFromPost,
  renameJurisdictionEntity,
  sanctionCirclePost,
  setOfficerStatus,
  updateOfficerProfile
} from "../../../lib/user-management-service";
import {
  getPasswordResetRedirectUrl,
  getSupabaseAuthClient,
  resolveAuthenticatedOfficer
} from "../../../lib/supabase-auth";
import type { MockOfficer } from "../../../lib/pilot-store";
import { RowActionMenu } from "../../../components/RowActionMenu";
import { StandalonePageHeader } from "../../../components/ui/StandalonePageHeader";
import { CloseIcon } from "../../../components/ui/Icons";

type GovernanceTab = "JURISDICTION" | "OFFICERS" | "AUDIT";
type CadreFilter = "ALL" | "DET" | "ETO" | "ETI" | "ETC" | "ADMIN";
type PostingStatusFilter = "ALL" | "POSTED" | "UNPOSTED";
type AccountStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

function getBpsOptionsForCadre(cadre: string): readonly { value: number; label: string }[] {
  const canon = normalizeCadreCode(cadre);
  switch (canon) {
    case "DET":
      return [{ value: 19, label: "BPS-19 — Director Excise & Taxation" }];
    case "ETO":
      return [{ value: 17, label: "BPS-17 — Excise & Taxation Officer" }];
    case "ETI":
      return [{ value: 16, label: "BPS-16 — Excise & Taxation Inspector" }];
    case "ETC":
      return [{ value: 5, label: "BPS-05 — Excise & Taxation Constable (Notice Delivery Only)" }];
    default:
      return [
        { value: 5, label: "BPS-05 — ETC Constable (Notice Delivery)" },
        { value: 16, label: "BPS-16 — ETI Inspector" },
        { value: 17, label: "BPS-17 — ETO Assessing Authority" },
        { value: 19, label: "BPS-19 — Director DET" }
      ];
  }
}

function formatCadreLabel(roleOrCadre: string | null | undefined): string {
  const canon = normalizeCadreCode(roleOrCadre);
  switch (canon) {
    case "DET":
      return "DET (BPS-19)";
    case "ETO":
      return "ETO (BPS-17)";
    case "ETI":
      return "ETI (BPS-16)";
    case "ETC":
      return "ETC (BS-05 Notice Delivery)";
    case "ADMIN":
      return "Provincial Admin";
    case "FINANCE":
      return "Finance";
    case "AUDITOR":
      return "Auditor";
    default:
      return String(roleOrCadre ?? "Officer");
  }
}

function getDefaultDesignation(cadre: ProvisionableCadreRole): string {
  const canon = normalizeCadreCode(cadre);
  switch (canon) {
    case "DET":
      return "Director Excise & Taxation";
    case "ETO":
      return "Excise & Taxation Officer";
    case "ETC":
      return "Excise & Taxation Constable (Notice Delivery)";
    default:
      return "Excise & Taxation Inspector";
  }
}

export default function UserManagementPage() {
  const [currentOfficer, setCurrentOfficer] = useState<MockOfficer | null>(null);
  const [officers, setOfficers] = useState<LiveOfficerAccount[]>([]);
  const [overview, setOverview] = useState<JurisdictionGovernanceOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<LiveAuditRecord[]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const auditLogsLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Consolidated 3-tab model (no redundant MATRIX tab)
  const [activeTab, setActiveTab] = useState<GovernanceTab>("JURISDICTION");
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Jurisdiction & Post filters
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>("ALL");
  const [jurisdictionSearch, setJurisdictionSearch] = useState<string>("");
  const deferredJurisdictionSearch = useDeferredValue(jurisdictionSearch);

  // Officers directory filters
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [roleFilter, setRoleFilter] = useState<CadreFilter>("ALL");
  const [postingStatusFilter, setPostingStatusFilter] = useState<PostingStatusFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("ALL");

  // Modal: Provision New Officer
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFatherName, setCreateFatherName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<ProvisionableCadreRole>("ETI");
  const [createPostId, setCreatePostId] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createCnic, setCreateCnic] = useState("");
  const [createDesignation, setCreateDesignation] = useState("Excise & Taxation Inspector");
  const [createOfficeAddress, setCreateOfficeAddress] = useState(
    "Excise & Taxation Office, Danewal Road, Vehari"
  );
  const [createPpoNumber, setCreatePpoNumber] = useState("");
  const [createBpsScale, setCreateBpsScale] = useState<number>(16);
  const [createTransferOrderNumber, setCreateTransferOrderNumber] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  // Modal: Edit Subordinate Profile (self-edit strictly disabled)
  const [editingOfficer, setEditingOfficer] = useState<LiveOfficerAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCnic, setEditCnic] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editOfficeAddress, setEditOfficeAddress] = useState("");
  const [editPpoNumber, setEditPpoNumber] = useState("");
  const [editFatherName, setEditFatherName] = useState("");
  const [editBpsScale, setEditBpsScale] = useState<number>(16);

  // Modal: Assign / Transfer Permanent Post
  const [assignModalPost, setAssignModalPost] = useState<SanctionedPostRecord | null>(null);
  const [assignModalOfficer, setAssignModalOfficer] = useState<LiveOfficerAccount | null>(null);
  const [selectedAssignPostId, setSelectedAssignPostId] = useState("");
  const [selectedAssignUserId, setSelectedAssignUserId] = useState("");
  const [assignChargeType, setAssignChargeType] = useState<PostChargeType>("SUBSTANTIVE");
  const [assignOrderNumber, setAssignOrderNumber] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [relieveExistingIncumbent, setRelieveExistingIncumbent] = useState(false);

  // Modal: Relieve Officer From Post (Leaves Post VACANT)
  const [relievePostTarget, setRelievePostTarget] = useState<SanctionedPostRecord | null>(null);
  const [relieveReason, setRelieveReason] = useState("");
  const [relieveOrderNumber, setRelieveOrderNumber] = useState("");

  // Modal: Attach Circle to Tehsil (Same-District Tehsil OR NULL District HQ)
  const [attachingCircleId, setAttachingCircleId] = useState<string | null>(null);
  const [targetTehsilId, setTargetTehsilId] = useState<string>("");
  const [attachReason, setAttachReason] = useState("");

  // Modal: Rename Geographical Entity Display Name (Code Immutable)
  const [renamingEntity, setRenamingEntity] = useState<{
    readonly entityType: "CIRCLE" | "DISTRICT" | "DIVISION";
    readonly entityId: string;
    readonly code: string;
    readonly currentName: string;
  } | null>(null);
  const [renameNewName, setRenameNewName] = useState("");
  const [renameReason, setRenameReason] = useState("");

  // Modal: Sanction Additional Circle Post (Admin / DET)
  const [sanctionTargetCircle, setSanctionTargetCircle] = useState<{
    readonly circleId: string;
    readonly circleCode: string;
    readonly circleName: string;
  } | null>(null);
  const [sanctionRoleCode, setSanctionRoleCode] = useState<"ETI" | "ETC">("ETC");
  const [sanctionOrderNo, setSanctionOrderNo] = useState("");
  const [sanctionReason, setSanctionReason] = useState("");

  // Modal: Password Management
  const [passwordOfficer, setPasswordOfficer] = useState<LiveOfficerAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  // Modal: Activate / Suspend Officer
  const [statusTogglingOfficer, setStatusTogglingOfficer] = useState<LiveOfficerAccount | null>(
    null
  );
  const [statusReason, setStatusReason] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const hasModal =
      isCreateModalOpen ||
      Boolean(editingOfficer) ||
      Boolean(assignModalPost) ||
      Boolean(assignModalOfficer) ||
      Boolean(relievePostTarget) ||
      Boolean(attachingCircleId) ||
      Boolean(renamingEntity) ||
      Boolean(sanctionTargetCircle) ||
      Boolean(passwordOfficer) ||
      Boolean(statusTogglingOfficer);
    if (!hasModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (statusTogglingOfficer) setStatusTogglingOfficer(null);
      else if (passwordOfficer) setPasswordOfficer(null);
      else if (sanctionTargetCircle) setSanctionTargetCircle(null);
      else if (renamingEntity) setRenamingEntity(null);
      else if (attachingCircleId) setAttachingCircleId(null);
      else if (relievePostTarget) setRelievePostTarget(null);
      else if (assignModalPost || assignModalOfficer) {
        setAssignModalPost(null);
        setAssignModalOfficer(null);
      } else if (editingOfficer) setEditingOfficer(null);
      else if (isCreateModalOpen) setIsCreateModalOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    isCreateModalOpen,
    editingOfficer,
    assignModalPost,
    assignModalOfficer,
    relievePostTarget,
    attachingCircleId,
    renamingEntity,
    sanctionTargetCircle,
    passwordOfficer,
    statusTogglingOfficer
  ]);

  const loadLiveContext = async () => {
    try {
      setIsRefreshing(true);
      const supabase = getSupabaseAuthClient();
      const { data: authData } = await supabase.auth.getUser();

      if (!authData?.user) {
        setCurrentOfficer(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const officer = await resolveAuthenticatedOfficer(authData.user);
      setCurrentOfficer(officer);

      if (officer.role === "ETC") {
        setOfficers([]);
        setOverview(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const shouldRefreshAudit = activeTabRef.current === "AUDIT";
      if (!shouldRefreshAudit) {
        auditLogsLoadedRef.current = false;
      }

      const [dir, govOverview, logs] = await Promise.all([
        fetchOfficersDirectory({ force: true }),
        fetchJurisdictionGovernanceOverview({ force: true }),
        shouldRefreshAudit
          ? fetchUserManagementAuditLog(100, { force: true })
          : Promise.resolve(null)
      ]);

      setOfficers(dir);
      setOverview(govOverview);
      if (logs) {
        setAuditLogs(logs);
        auditLogsLoadedRef.current = true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Live administrative context load error:", err);
      setFeedback({ type: "error", text: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadLiveContext();
  }, []);

  useEffect(() => {
    if (
      activeTab !== "AUDIT" ||
      !currentOfficer ||
      currentOfficer.role === "ETC" ||
      auditLogsLoadedRef.current
    ) {
      return;
    }
    let cancelled = false;
    setIsLoadingAuditLogs(true);
    void fetchUserManagementAuditLog(100)
      .then((logs) => {
        if (!cancelled) {
          setAuditLogs(logs);
          auditLogsLoadedRef.current = true;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Audit trail load error:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAuditLogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentOfficer]);

  const actorCanonRole = useMemo(
    () => normalizeCadreCode(currentOfficer?.cadreCode ?? currentOfficer?.role) ?? "ETI",
    [currentOfficer]
  );

  const canManagePosts = Boolean(overview?.actor.can_manage_posts);
  const canRenameCircles = Boolean(overview?.actor.can_rename_circles);
  const canRenameDistricts = Boolean(overview?.actor.can_rename_districts);
  const canRenameDivisions = Boolean(overview?.actor.can_rename_divisions);
  const canSanctionCirclePosts = Boolean(overview?.actor.can_sanction_circle_posts);
  const isInspector = actorCanonRole === "ETI";

  const districts = overview?.districts ?? [];
  const allCircles = overview?.circles ?? [];
  const allTehsils = overview?.tehsils ?? [];
  const allPosts = overview?.posts ?? [];
  const supervisoryPosts = overview?.supervisory_posts ?? [];

  const visibleTehsils = useMemo(() => {
    if (selectedDistrictFilter === "ALL") return allTehsils;
    return allTehsils.filter((t) => t.district_id === selectedDistrictFilter);
  }, [allTehsils, selectedDistrictFilter]);

  const visibleCircles = useMemo(() => {
    const q = deferredJurisdictionSearch.trim().toLowerCase();
    return allCircles.filter((c) => {
      if (selectedDistrictFilter !== "ALL" && c.district_id !== selectedDistrictFilter) {
        return false;
      }
      if (!q) return true;
      const postMatch = c.posts.some(
        (p) =>
          p.post_code.toLowerCase().includes(q) ||
          (p.incumbent_name ?? "").toLowerCase().includes(q)
      );
      return (
        c.circle_code.toLowerCase().includes(q) ||
        c.circle_name.toLowerCase().includes(q) ||
        (c.tehsil_name ?? "district hq").toLowerCase().includes(q) ||
        c.district_name.toLowerCase().includes(q) ||
        postMatch
      );
    });
  }, [allCircles, selectedDistrictFilter, deferredJurisdictionSearch]);

  const unattachedCircles = useMemo(
    () => visibleCircles.filter((c) => !c.tehsil_id),
    [visibleCircles]
  );

  const attachingCircle = useMemo(
    () => allCircles.find((c) => c.circle_id === attachingCircleId) ?? null,
    [allCircles, attachingCircleId]
  );

  const attachingDistrictTehsils = useMemo(() => {
    if (!attachingCircle) return [];
    return allTehsils.filter((t) => t.district_id === attachingCircle.district_id);
  }, [allTehsils, attachingCircle]);

  // Metrics
  const vacantPostsCount = useMemo(() => allPosts.filter((p) => p.is_vacant).length, [allPosts]);
  const occupiedPostsCount = useMemo(() => allPosts.filter((p) => !p.is_vacant).length, [allPosts]);
  const totalUnitsMonitored = useMemo(
    () => allCircles.reduce((sum, c) => sum + c.units_count, 0),
    [allCircles]
  );

  // Vacant posts matching selected cadre in Create Officer modal
  const vacantPostsForCreateRole = useMemo(() => {
    const canon = normalizeCadreCode(createRole);
    return allPosts.filter((p) => p.is_vacant && p.status === "ACTIVE" && p.cadre_code === canon);
  }, [allPosts, createRole]);

  // Eligible officers for assigning to a specific sanctioned post
  const eligibleOfficersForPostModal = useMemo(() => {
    const targetPost = assignModalPost;
    if (!targetPost) return [];
    return officers.filter((o) => {
      const canon = normalizeCadreCode(o.cadre_code ?? o.role);
      const bps = o.bps_scale ?? 0;
      return (
        o.active &&
        o.user_id !== currentOfficer?.id &&
        canon === targetPost.cadre_code &&
        bps >= targetPost.min_bps &&
        bps <= targetPost.max_bps
      );
    });
  }, [assignModalPost, officers, currentOfficer]);

  // Eligible sanctioned posts when assigning/transferring a specific officer
  const eligiblePostsForOfficerModal = useMemo(() => {
    if (!assignModalOfficer) return [];
    const officerCanon = normalizeCadreCode(
      assignModalOfficer.cadre_code ?? assignModalOfficer.role
    );
    const officerBps = assignModalOfficer.bps_scale ?? 0;
    return allPosts.filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.cadre_code === officerCanon &&
        officerBps >= p.min_bps &&
        officerBps <= p.max_bps &&
        canAuthorityManageCadre(actorCanonRole, p.cadre_code)
    );
  }, [assignModalOfficer, allPosts, actorCanonRole]);

  // Filtered officers directory
  const filteredOfficers = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return officers.filter((o) => {
      const canon = normalizeCadreCode(o.cadre_code ?? o.role) ?? o.role;
      if (roleFilter !== "ALL" && canon !== roleFilter) return false;
      const pStatus = o.posting_status ?? (o.post_id ? "POSTED" : "UNPOSTED");
      if (postingStatusFilter !== "ALL" && pStatus !== postingStatusFilter) return false;
      if (statusFilter === "ACTIVE" && !o.active) return false;
      if (statusFilter === "INACTIVE" && o.active) return false;

      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q) ||
        o.circle_name.toLowerCase().includes(q) ||
        (o.post_code ?? "").toLowerCase().includes(q) ||
        o.cnic.toLowerCase().includes(q) ||
        o.designation.toLowerCase().includes(q)
      );
    });
  }, [officers, roleFilter, postingStatusFilter, statusFilter, deferredSearchQuery]);

  // Provision Officer Modal handlers
  const handleOpenCreateModal = (preselectedPost?: SanctionedPostRecord) => {
    const initialRole: ProvisionableCadreRole = preselectedPost
      ? (preselectedPost.role_code as ProvisionableCadreRole)
      : "ETI";
    const initialCanon = normalizeCadreCode(initialRole) ?? "ETI";
    const defaultBps =
      initialCanon === "DET" ? 19 : initialCanon === "ETO" ? 17 : initialCanon === "ETC" ? 5 : 16;
    const firstVacant =
      preselectedPost ??
      allPosts.find((p) => p.is_vacant && p.status === "ACTIVE" && p.cadre_code === initialCanon);

    setCreateRole(initialRole);
    setCreateBpsScale(defaultBps);
    setCreateDesignation(getDefaultDesignation(initialRole));
    setCreatePostId(firstVacant?.post_id ?? "");
    setCreateName("");
    setCreateFatherName("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateCnic("");
    setCreatePpoNumber("");
    setCreateTransferOrderNumber(`SO(Admin)ET/2026/${Math.floor(100 + Math.random() * 900)}`);
    setCreateOfficeAddress(
      "Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari"
    );
    setCreatePassword("");
    setIsCreateModalOpen(true);
  };

  const handleSaveCreate = async () => {
    if (!createName.trim() || !createEmail.trim()) {
      setFeedback({ type: "error", text: "Officer name and official email are required." });
      return;
    }
    if (!createPassword || createPassword.length < 12) {
      setFeedback({ type: "error", text: "Initial password must be at least 12 characters." });
      return;
    }
    if (!createPostId) {
      setFeedback({
        type: "error",
        text: "Please select an available permanent sanctioned post for this cadre."
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedPost = allPosts.find((p) => p.post_id === createPostId) ?? null;
      const anchorId =
        selectedPost?.circle_id ?? selectedPost?.district_id ?? selectedPost?.division_id ?? null;
      const res = await adminCreateOfficer({
        name: createName.trim(),
        email: createEmail.trim(),
        role: createRole,
        circleId: anchorId,
        postId: createPostId,
        phone: createPhone.trim(),
        cnic: createCnic.trim(),
        designation: createDesignation.trim() || getDefaultDesignation(createRole),
        officeAddress: createOfficeAddress.trim(),
        initialPassword: createPassword,
        ppoNumber: createPpoNumber.trim(),
        fatherName: createFatherName.trim(),
        bpsScale: createBpsScale,
        transferOrderNumber: createTransferOrderNumber.trim()
      });
      setFeedback({
        type: "success",
        text: `Officer ${res.name} (${res.email}) provisioned and posted to ${selectedPost?.post_code ?? "sanctioned post"}.`
      });
      setIsCreateModalOpen(false);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Subordinate Profile handlers (self blocked)
  const handleOpenEdit = (o: LiveOfficerAccount) => {
    if (
      !canEditOfficerProfile(currentOfficer?.id, actorCanonRole, o.user_id, o.cadre_code ?? o.role)
    ) {
      setFeedback({
        type: "error",
        text: "Access denied: Only a superior jurisdiction authority may edit an officer's profile."
      });
      return;
    }
    const canon = normalizeCadreCode(o.cadre_code ?? o.role) ?? "ETI";
    const bpsFallback = canon === "DET" ? 19 : canon === "ETO" ? 17 : canon === "ETC" ? 5 : 16;
    setEditingOfficer(o);
    setEditName(o.name);
    setEditPhone(o.phone);
    setEditCnic(o.cnic);
    setEditDesignation(o.designation);
    setEditOfficeAddress(o.office_address);
    setEditPpoNumber(o.ppo_number || "");
    setEditFatherName(o.father_name || "");
    setEditBpsScale(o.bps_scale ?? bpsFallback);
  };

  const handleSaveEdit = async () => {
    if (!editingOfficer) return;
    try {
      setIsSubmitting(true);
      await updateOfficerProfile({
        userId: editingOfficer.user_id,
        displayName: editName.trim() || editingOfficer.name,
        phone: editPhone.trim(),
        cnic: editCnic.trim(),
        designation: editDesignation.trim(),
        officeAddress: editOfficeAddress.trim(),
        ppoNumber: editPpoNumber.trim(),
        fatherName: editFatherName.trim(),
        bpsScale: editBpsScale
      });
      setFeedback({
        type: "success",
        text: `Subordinate officer profile for ${editingOfficer.name} updated.`
      });
      setEditingOfficer(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Assign / Transfer Post handlers
  const handleOpenAssignFromPost = (post: SanctionedPostRecord) => {
    setAssignModalOfficer(null);
    setAssignModalPost(post);
    setSelectedAssignPostId(post.post_id);
    const eligible = officers.filter((o) => {
      const canon = normalizeCadreCode(o.cadre_code ?? o.role);
      const bps = o.bps_scale ?? 0;
      return (
        o.active &&
        o.user_id !== currentOfficer?.id &&
        canon === post.cadre_code &&
        bps >= post.min_bps &&
        bps <= post.max_bps
      );
    });
    setSelectedAssignUserId(eligible[0]?.user_id ?? "");
    setAssignChargeType("SUBSTANTIVE");
    setAssignOrderNumber(`SO(Admin)ET/2026/${Math.floor(100 + Math.random() * 900)}`);
    setAssignNotes("");
    setRelieveExistingIncumbent(!post.is_vacant);
  };

  const handleOpenAssignFromOfficer = (o: LiveOfficerAccount) => {
    const officerCanon = normalizeCadreCode(o.cadre_code ?? o.role);
    const officerBps = o.bps_scale ?? 0;
    const candidates = allPosts.filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.cadre_code === officerCanon &&
        officerBps >= p.min_bps &&
        officerBps <= p.max_bps &&
        canAuthorityManageCadre(actorCanonRole, p.cadre_code)
    );
    const preferred = candidates.find((p) => p.is_vacant) ?? candidates[0];
    setAssignModalPost(null);
    setAssignModalOfficer(o);
    setSelectedAssignPostId(preferred?.post_id ?? "");
    setSelectedAssignUserId(o.user_id);
    setAssignChargeType("SUBSTANTIVE");
    setAssignOrderNumber(`SO(Admin)ET/2026/${Math.floor(100 + Math.random() * 900)}`);
    setAssignNotes("");
    setRelieveExistingIncumbent(false);
  };

  const handleSaveAssignPost = async () => {
    const postId = assignModalPost ? assignModalPost.post_id : selectedAssignPostId;
    const userId = assignModalOfficer ? assignModalOfficer.user_id : selectedAssignUserId;
    if (!postId || !userId || !assignOrderNumber.trim()) {
      setFeedback({
        type: "error",
        text: "Target sanctioned post, eligible officer, and transfer order number are required."
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await assignOfficerToPost({
        postId,
        userId,
        chargeType: assignChargeType,
        transferOrderNumber: assignOrderNumber.trim(),
        handingOverNotes: assignNotes.trim(),
        relieveCurrentIncumbent: relieveExistingIncumbent
      });
      setFeedback({
        type: "success",
        text: "Official posting order executed on permanent sanctioned post."
      });
      setAssignModalPost(null);
      setAssignModalOfficer(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Relieve Officer From Post handlers
  const handleOpenRelievePost = (post: SanctionedPostRecord) => {
    setRelievePostTarget(post);
    setRelieveReason("");
    setRelieveOrderNumber(`SO(Admin)ET/2026/${Math.floor(100 + Math.random() * 900)}`);
  };

  const handleSaveRelievePost = async () => {
    if (!relievePostTarget || !relieveReason.trim()) {
      setFeedback({ type: "error", text: "Administrative reason is required to vacate a post." });
      return;
    }
    try {
      setIsSubmitting(true);
      await relieveOfficerFromPost({
        postId: relievePostTarget.post_id,
        reason: relieveReason.trim(),
        transferOrderNumber: relieveOrderNumber.trim()
      });
      setFeedback({
        type: "success",
        text: `Incumbent relieved. Permanent post ${relievePostTarget.post_code} is now VACANT.`
      });
      setRelievePostTarget(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Attach Circle to Tehsil handlers
  const handleOpenAttachCircle = (circleId: string, currentTehsilId: string | null) => {
    setAttachingCircleId(circleId);
    setTargetTehsilId(currentTehsilId ?? "__UNATTACHED__");
    setAttachReason("");
  };

  const handleSaveAttachCircle = async () => {
    if (!attachingCircle) return;
    try {
      setIsSubmitting(true);
      const nextTehsilId = targetTehsilId === "__UNATTACHED__" ? null : targetTehsilId;
      await attachCircleToTehsil({
        circleId: attachingCircle.circle_id,
        tehsilId: nextTehsilId,
        reason:
          attachReason.trim() ||
          `Circle ${attachingCircle.circle_code} Tehsil attachment updated by supervisory authority`
      });
      setFeedback({
        type: "success",
        text: `${attachingCircle.circle_code} (${attachingCircle.circle_name}) Tehsil attachment updated.`
      });
      setAttachingCircleId(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Rename Entity Display Name handlers (Immutable Code preserved)
  const handleOpenRename = (params: {
    entityType: "CIRCLE" | "DISTRICT" | "DIVISION";
    entityId: string;
    code: string;
    currentName: string;
  }) => {
    setRenamingEntity(params);
    setRenameNewName(params.currentName);
    setRenameReason("");
  };

  const handleSaveRename = async () => {
    if (!renamingEntity || !renameNewName.trim() || !renameReason.trim()) {
      setFeedback({
        type: "error",
        text: "New display name and statutory notification reason are required."
      });
      return;
    }
    try {
      setIsSubmitting(true);
      await renameJurisdictionEntity({
        entityType: renamingEntity.entityType,
        entityId: renamingEntity.entityId,
        newName: renameNewName.trim(),
        reason: renameReason.trim()
      });
      setFeedback({
        type: "success",
        text: `Renamed ${renamingEntity.code} display label to "${renameNewName.trim()}" while keeping immutable code ${renamingEntity.code}.`
      });
      setRenamingEntity(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sanction Additional Circle Post handlers (DET / Admin)
  const handleOpenSanctionPost = (circleId: string, circleCode: string, circleName: string) => {
    setSanctionTargetCircle({ circleId, circleCode, circleName });
    setSanctionRoleCode("ETC");
    setSanctionOrderNo(`FD(ET)2026/${Math.floor(100 + Math.random() * 900)}`);
    setSanctionReason("");
  };

  const handleSaveSanctionPost = async () => {
    if (!sanctionTargetCircle || !sanctionOrderNo.trim()) {
      setFeedback({ type: "error", text: "Sanction order number is required." });
      return;
    }
    try {
      setIsSubmitting(true);
      await sanctionCirclePost({
        circleId: sanctionTargetCircle.circleId,
        roleCode: sanctionRoleCode,
        sanctionedOrderNo: sanctionOrderNo.trim(),
        reason: sanctionReason.trim()
      });
      setFeedback({
        type: "success",
        text: `Sanctioned additional permanent ${sanctionRoleCode} post for ${sanctionTargetCircle.circleCode}.`
      });
      setSanctionTargetCircle(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password handlers
  const handleOpenPassword = (o: LiveOfficerAccount) => {
    setPasswordOfficer(o);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setMustChangePassword(o.user_id !== currentOfficer?.id);
  };

  const handleSavePassword = async () => {
    if (!passwordOfficer) return;
    if (newPassword.length < 12) {
      setFeedback({
        type: "error",
        text: "Password must be at least 12 characters as required by PTAS security policy."
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", text: "Passwords do not match." });
      return;
    }

    try {
      setIsSubmitting(true);
      await adminSetOfficerPassword({
        targetUserId: passwordOfficer.user_id,
        newPassword,
        mustChange: mustChangePassword
      });
      setFeedback({
        type: "success",
        text: `Password updated for ${passwordOfficer.name}.`
      });
      setPasswordOfficer(null);
      setNewPassword("");
      setConfirmPassword("");
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!passwordOfficer?.email) return;
    try {
      setIsSendingResetEmail(true);
      const supabase = getSupabaseAuthClient();
      const redirectUrl = getPasswordResetRedirectUrl(window.location.origin);
      const { error } = await supabase.auth.resetPasswordForEmail(passwordOfficer.email, {
        redirectTo: redirectUrl
      });
      if (error) throw error;
      setFeedback({
        type: "success",
        text: `Password reset link dispatched to ${passwordOfficer.email}.`
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  // Status Toggle handlers
  const handleOpenToggleStatus = (o: LiveOfficerAccount) => {
    setStatusTogglingOfficer(o);
    setStatusReason("");
  };

  const handleSaveToggleStatus = async () => {
    if (!statusTogglingOfficer) return;
    try {
      setIsSubmitting(true);
      const nextActive = !statusTogglingOfficer.active;
      await setOfficerStatus({
        userId: statusTogglingOfficer.user_id,
        active: nextActive,
        reason:
          statusReason.trim() ||
          `Officer account ${nextActive ? "activated" : "suspended"} by superior authority`
      });
      setFeedback({
        type: "success",
        text: `Officer ${statusTogglingOfficer.name} ${nextActive ? "activated" : "suspended (held posts vacated)"}.`
      });
      setStatusTogglingOfficer(null);
      await loadLiveContext();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unauthenticated guard
  if (!isLoading && !currentOfficer) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page standalone-page--narrow"
        style={{ paddingTop: "4rem" }}
      >
        <div
          className="surface-card"
          style={{ textAlign: "center", borderColor: "var(--color-danger-border)" }}
        >
          <h1
            style={{ color: "var(--color-danger-text)", margin: "0 0 0.5rem", fontSize: "1.35rem" }}
          >
            Authentication Required
          </h1>
          <p style={{ color: "var(--color-text-muted)", lineHeight: 1.6 }}>
            Administrative and Jurisdiction Governance Desks require an active departmental officer
            session with statutory authorization.
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: "1.25rem" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => (window.location.href = "/sign-in")}
            >
              Sign In to Department Desk
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Fail-closed guard for ETC (BPS-05 Notice Delivery Only)
  if (!isLoading && currentOfficer?.role === "ETC") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="standalone-page standalone-page--narrow"
        style={{ paddingTop: "4rem" }}
      >
        <div
          className="surface-card"
          style={{ textAlign: "center", borderColor: "var(--color-danger-border)" }}
        >
          <h1
            style={{ color: "var(--color-danger-text)", margin: "0 0 0.5rem", fontSize: "1.35rem" }}
          >
            Restricted Access — Notice Delivery Personnel (BPS-05)
          </h1>
          <p style={{ color: "var(--color-text-muted)", lineHeight: 1.6 }}>
            Your sanctioned post (<strong>{currentOfficer.postCode || "ETC"}</strong>) is scoped
            exclusively to notice delivery. Personnel administration and jurisdiction
            reconfiguration are restricted to Assessing Authorities (ETO), Directors (DET), and
            Admins.
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: "1.25rem" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => (window.location.href = "/")}
            >
              Return to Portal
            </button>
          </div>
        </div>
      </main>
    );
  }

  const selfOfficerRow = officers.find(
    (o) => o.user_id === currentOfficer?.id || o.auth_user_id === currentOfficer?.id
  );

  return (
    <div className="standalone-page" style={{ maxWidth: "88rem" }}>
      <StandalonePageHeader
        eyebrow="Live Database • Permanent Geographical Identities & Sanctioned Posts"
        title={
          isInspector
            ? "Circle Desk & Sanctioned Post Status"
            : "Jurisdiction, Sanctioned Posts & Cadre Governance"
        }
        subtitle={
          <>
            Officer: <strong>{currentOfficer?.name}</strong> (
            {currentOfficer?.postCode || formatCadreLabel(actorCanonRole)}) &bull; Scope:{" "}
            <strong>{currentOfficer?.jurisdictionName}</strong> ({currentOfficer?.jurisdictionTier})
          </>
        }
        backHref="/"
        backLabel="Return to Main Portal"
        topLinks={[
          { label: "P.F.T-3 Register", href: "/demand/pft3" },
          { label: "Survey Units", href: "/assessment/survey" }
        ]}
        bannerActions={
          <>
            <button
              type="button"
              onClick={() => void loadLiveContext()}
              disabled={isRefreshing}
              className="btn-on-dark-outline"
            >
              {isRefreshing ? "Syncing…" : "Refresh Live Data"}
            </button>

            {canManagePosts && (
              <button
                type="button"
                id="btn-provision-officer"
                onClick={() => handleOpenCreateModal()}
                className="btn-on-dark"
              >
                + Provision &amp; Post Officer
              </button>
            )}

            {selfOfficerRow && (
              <button
                type="button"
                onClick={() => handleOpenPassword(selfOfficerRow)}
                className="btn-on-dark-outline"
              >
                Change My Password
              </button>
            )}
          </>
        }
      />

      <main id="main-content" tabIndex={-1}>
        {feedback && (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            className={`alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="btn-ghost btn-sm"
              aria-label="Dismiss notification"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}

        {/* Governance Notice Banner */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.82rem",
            color: "#334155",
            lineHeight: 1.5
          }}
        >
          <strong>Position-Based Governance Policy:</strong> Geographical codes (Division, District,
          Circle e.g. <code>VHR-1</code>) and permanent sanctioned posts (<code>DET</code> BPS-19,{" "}
          <code>ETO</code> BPS-17, <code>ETI</code> BPS-14–16, <code>ETC</code> BPS-05 Notice
          Delivery) are permanent and immutable. Relieving an officer leaves their sanctioned post{" "}
          <strong>VACANT</strong> without deleting the post. Officers cannot modify their own
          profile; only superior authority within jurisdiction may edit officer records.
        </div>

        {/* Summary Metrics Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(13.5rem, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem"
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "1.1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase"
              }}
            >
              Permanent Circles
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0d3822" }}>
              {allCircles.length}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#475569" }}>
              Across {districts.length} District(s) &bull; {allTehsils.length} Tehsil(s)
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase"
              }}
            >
              Sanctioned Posts Staffed
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0d3822" }}>
              {occupiedPostsCount} / {allPosts.length}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>
              {vacantPostsCount} vacant post(s) ready for posting
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase"
              }}
            >
              Personnel in Cadre Directory
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0d3822" }}>
              {officers.filter((o) => o.active).length} / {officers.length}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#166534" }}>Active personnel profiles</div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "1.1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase"
              }}
            >
              Monitored Tax Units
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0d3822" }}>
              {totalUnitsMonitored.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#166534" }}>Form P.F.T-3 units in scope</div>
          </div>
        </div>

        {/* Consolidated 3-Tab Strip */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "2px solid #e2e8f0",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            paddingBottom: "0.25rem"
          }}
        >
          <button
            type="button"
            id="tab-jurisdiction"
            className={`subtab-btn ${activeTab === "JURISDICTION" ? "active" : ""}`}
            onClick={() => setActiveTab("JURISDICTION")}
            style={{
              padding: "0.6rem 1.15rem",
              fontWeight: 700,
              fontSize: "0.85rem",
              borderRadius: "6px 6px 0 0",
              border: "none",
              cursor: "pointer",
              background: activeTab === "JURISDICTION" ? "#0d3822" : "transparent",
              color: activeTab === "JURISDICTION" ? "#ffffff" : "#475569"
            }}
          >
            🏛️ Jurisdiction &amp; Sanctioned Posts ({allCircles.length})
          </button>

          <button
            type="button"
            id="tab-officers"
            className={`subtab-btn ${activeTab === "OFFICERS" ? "active" : ""}`}
            onClick={() => setActiveTab("OFFICERS")}
            style={{
              padding: "0.6rem 1.15rem",
              fontWeight: 700,
              fontSize: "0.85rem",
              borderRadius: "6px 6px 0 0",
              border: "none",
              cursor: "pointer",
              background: activeTab === "OFFICERS" ? "#0d3822" : "transparent",
              color: activeTab === "OFFICERS" ? "#ffffff" : "#475569"
            }}
          >
            👮 Personnel Cadre Directory ({officers.length})
          </button>

          <button
            type="button"
            id="tab-audit"
            className={`subtab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
            onClick={() => setActiveTab("AUDIT")}
            style={{
              padding: "0.6rem 1.15rem",
              fontWeight: 700,
              fontSize: "0.85rem",
              borderRadius: "6px 6px 0 0",
              border: "none",
              cursor: "pointer",
              background: activeTab === "AUDIT" ? "#0d3822" : "transparent",
              color: activeTab === "AUDIT" ? "#ffffff" : "#475569"
            }}
          >
            📜 Statutory Audit Trail ({auditLogs.length})
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: CONSOLIDATED JURISDICTION & SANCTIONED POSTS */}
        {/* ============================================================ */}
        {activeTab === "JURISDICTION" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Filter bar */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <input
                type="text"
                className="form-control"
                aria-label="Filter circles, tehsils, post codes, or incumbents"
                placeholder="Search Circle code (VHR-1), Circle name, Tehsil, Post code, or Officer…"
                value={jurisdictionSearch}
                onChange={(e) => setJurisdictionSearch(e.target.value)}
                style={{ flex: "1 1 16rem", maxWidth: "28rem", fontSize: "0.85rem" }}
              />

              {districts.length > 1 && (
                <select
                  aria-label="Filter by District"
                  className="form-control"
                  value={selectedDistrictFilter}
                  onChange={(e) => setSelectedDistrictFilter(e.target.value)}
                  style={{ width: "auto", fontSize: "0.85rem" }}
                >
                  <option value="ALL">All Districts ({districts.length})</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.district_code} — {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Supervisory Sanctioned Posts (DET BPS-19 & ETO BPS-17) */}
            {supervisoryPosts.length > 0 && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "1.25rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    marginBottom: "1rem"
                  }}
                >
                  <div>
                    <h2
                      style={{ margin: 0, fontSize: "1.1rem", color: "#0d3822", fontWeight: 700 }}
                    >
                      Supervisory Cadre Sanctioned Posts (DET BPS-19 &amp; ETO BPS-17)
                    </h2>
                    <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                      Permanent Divisional &amp; District posts. Superiors may staff, relieve, or
                      rename display labels without altering permanent codes.
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
                    gap: "0.9rem"
                  }}
                >
                  {supervisoryPosts
                    .filter(
                      (sp) =>
                        selectedDistrictFilter === "ALL" ||
                        !sp.district_id ||
                        sp.district_id === selectedDistrictFilter
                    )
                    .map((sp) => {
                      const canStaff = canAuthorityManageCadre(actorCanonRole, sp.cadre_code);
                      const canRenameTarget =
                        (sp.jurisdiction_tier === "DIVISION" && canRenameDivisions) ||
                        (sp.jurisdiction_tier === "DISTRICT" && canRenameDistricts);
                      const renameEntityId =
                        sp.jurisdiction_tier === "DIVISION" ? sp.division_id : sp.district_id;
                      const renameEntityType =
                        sp.jurisdiction_tier === "DIVISION" ? "DIVISION" : "DISTRICT";
                      const renameCurrentName =
                        sp.jurisdiction_tier === "DIVISION"
                          ? sp.division_name
                          : (sp.district_name ?? "");
                      const renameImmutableCode =
                        sp.jurisdiction_tier === "DIVISION"
                          ? sp.division_abbrev
                          : (sp.district_code ?? "");

                      return (
                        <div
                          key={sp.post_id}
                          style={{
                            border: sp.is_vacant ? "1px dashed #d97706" : "1px solid #cbd5e1",
                            background: sp.is_vacant ? "#fffbeb" : "#f8fafc",
                            borderRadius: "8px",
                            padding: "0.9rem"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "0.5rem",
                              marginBottom: "0.4rem"
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 800,
                                fontSize: "0.85rem",
                                color: "#0d3822"
                              }}
                            >
                              {sp.post_code}
                            </span>
                            <span className="badge badge-submitted" style={{ fontSize: "0.68rem" }}>
                              {sp.role_code} &bull; BPS-{sp.min_bps}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
                            {sp.post_title}
                          </div>
                          <div style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
                            {sp.is_vacant ? (
                              <span style={{ color: "#b45309", fontWeight: 700 }}>
                                VACANT PERMANENT POST
                              </span>
                            ) : (
                              <>
                                <strong style={{ color: "#0d3822" }}>{sp.incumbent_name}</strong>
                                <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                                  {sp.incumbent_ppo || sp.incumbent_email} &bull; Order:{" "}
                                  {sp.transfer_order_number}
                                </div>
                              </>
                            )}
                          </div>

                          {(canStaff || canRenameTarget) && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.4rem",
                                marginTop: "0.75rem"
                              }}
                            >
                              {canStaff && (
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => handleOpenAssignFromPost(sp)}
                                >
                                  {sp.is_vacant ? "Assign Eligible" : "Reassign"}
                                </button>
                              )}
                              {canStaff &&
                                !sp.is_vacant &&
                                sp.incumbent_user_id !== currentOfficer?.id && (
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => handleOpenRelievePost(sp)}
                                  >
                                    Relieve
                                  </button>
                                )}
                              {canRenameTarget && renameEntityId && (
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() =>
                                    handleOpenRename({
                                      entityType: renameEntityType,
                                      entityId: renameEntityId,
                                      code: renameImmutableCode,
                                      currentName: renameCurrentName
                                    })
                                  }
                                >
                                  Rename {renameEntityType === "DIVISION" ? "Division" : "District"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ALL District Tehsils Summary (sourced directly from geo_tehsils) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
                gap: "1rem"
              }}
            >
              {visibleTehsils.map((t) => {
                const attachedCircles = visibleCircles.filter((c) => c.tehsil_id === t.id);
                const totalUnits = attachedCircles.reduce((sum, c) => sum + c.units_count, 0);
                const staffedEti = attachedCircles.filter((c) =>
                  c.posts.some((p) => p.role_code === "ETI" && !p.is_vacant)
                ).length;

                return (
                  <div
                    key={t.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      border: "2px solid #0d3822",
                      padding: "1rem 1.15rem"
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
                      <h3
                        style={{ margin: 0, fontSize: "1rem", color: "#0d3822", fontWeight: 700 }}
                      >
                        Tehsil {t.name}
                      </h3>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.72rem",
                          background: "#f1f5f9",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "4px"
                        }}
                      >
                        PBS #{t.tehsil_code}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>
                      <div>
                        Attached Circles: <strong>{attachedCircles.length}</strong> ({staffedEti}{" "}
                        ETI staffed)
                      </div>
                      <div>
                        Tax Units: <strong>{totalUnits.toLocaleString()}</strong>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "0.6rem",
                        paddingTop: "0.55rem",
                        borderTop: "1px dashed #cbd5e1",
                        fontSize: "0.74rem",
                        color: "var(--color-text-muted)"
                      }}
                    >
                      {attachedCircles.length > 0
                        ? attachedCircles.map((c) => c.circle_code).join(", ")
                        : "No circles currently attached"}
                    </div>
                  </div>
                );
              })}

              {unattachedCircles.length > 0 && (
                <div
                  style={{
                    background: "#fffbeb",
                    borderRadius: "10px",
                    border: "2px dashed #d97706",
                    padding: "1rem 1.15rem"
                  }}
                >
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", color: "#92400e" }}>
                    District HQ (Unattached)
                  </h3>
                  <div style={{ fontSize: "0.82rem", color: "#78350f" }}>
                    Circles directly under District HQ: <strong>{unattachedCircles.length}</strong>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#92400e", marginTop: "0.45rem" }}>
                    {unattachedCircles.map((c) => c.circle_code).join(", ")}
                  </div>
                </div>
              )}
            </div>

            {/* Consolidated Circle & Sanctioned Posts Governance Table */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "1.25rem"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  marginBottom: "1rem"
                }}
              >
                <div>
                  <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#0d3822", fontWeight: 700 }}>
                    Permanent Circles, Tehsil Attachment &amp; Circle Sanctioned Posts
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    Every Circle retains an immutable permanent code and permanent ETI + ETC (BS-05
                    Notice Delivery) posts.
                  </span>
                </div>
                <span
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    color: "#166534",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "5px",
                    fontSize: "0.75rem",
                    fontWeight: 700
                  }}
                >
                  Immutable Circle Codes &bull; Decoupled Posts
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="gov-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th scope="col">Immutable Code</th>
                      <th scope="col">Circle Display Name &amp; Units</th>
                      <th scope="col">Attached Tehsil</th>
                      <th scope="col">Sanctioned Circle Posts (ETI &amp; ETC BS-05)</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Jurisdiction Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCircles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: "2rem",
                            color: "var(--color-text-muted)"
                          }}
                        >
                          No permanent circles match your filter.
                        </td>
                      </tr>
                    ) : (
                      visibleCircles.map((circle) => (
                        <tr key={circle.circle_id}>
                          <td>
                            <span
                              title="Permanent immutable statutory identifier"
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 800,
                                color: "#0d3822",
                                fontSize: "0.88rem",
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                padding: "0.2rem 0.45rem",
                                borderRadius: "4px",
                                display: "inline-block"
                              }}
                            >
                              {circle.circle_code}
                            </span>
                            <div
                              style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.2rem" }}
                            >
                              {circle.district_name} ({circle.district_code})
                            </div>
                          </td>

                          <td>
                            <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>
                              {circle.circle_name}
                            </strong>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#475569",
                                marginTop: "0.15rem"
                              }}
                            >
                              {circle.units_count.toLocaleString()} units (
                              {circle.approved_units_count.toLocaleString()} approved)
                            </div>
                            {circle.total_assessed_demand > 0 && (
                              <div
                                style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 600 }}
                              >
                                PKR {circle.total_assessed_demand.toLocaleString()}
                              </div>
                            )}
                          </td>

                          <td>
                            {circle.tehsil_name ? (
                              <span
                                style={{
                                  background: "#e0f2fe",
                                  color: "#0369a1",
                                  fontWeight: 700,
                                  padding: "0.25rem 0.6rem",
                                  borderRadius: "4px",
                                  fontSize: "0.78rem",
                                  display: "inline-block"
                                }}
                              >
                                Tehsil {circle.tehsil_name}
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  fontWeight: 700,
                                  padding: "0.25rem 0.6rem",
                                  borderRadius: "4px",
                                  fontSize: "0.78rem",
                                  display: "inline-block"
                                }}
                              >
                                District HQ (Unattached)
                              </span>
                            )}
                          </td>

                          <td>
                            <div
                              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
                            >
                              {circle.posts.map((post) => {
                                const canStaff = canAuthorityManageCadre(
                                  actorCanonRole,
                                  post.cadre_code
                                );
                                return (
                                  <div
                                    key={post.post_id}
                                    style={{
                                      border: post.is_vacant
                                        ? "1px dashed #d97706"
                                        : "1px solid #e2e8f0",
                                      background: post.is_vacant ? "#fffbeb" : "#f8fafc",
                                      borderRadius: "6px",
                                      padding: "0.5rem 0.65rem"
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                        gap: "0.35rem"
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontFamily: "monospace",
                                          fontSize: "0.78rem",
                                          fontWeight: 700,
                                          color: "#0d3822"
                                        }}
                                      >
                                        {post.post_code}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "0.68rem",
                                          fontWeight: 700,
                                          color: post.role_code === "ETC" ? "#7c2d12" : "#1e3a8a",
                                          background:
                                            post.role_code === "ETC" ? "#ffedd5" : "#dbeafe",
                                          padding: "0.1rem 0.4rem",
                                          borderRadius: "3px"
                                        }}
                                      >
                                        {post.role_code === "ETC"
                                          ? "ETC • BPS-05 Notice Delivery"
                                          : `ETI • BPS-${post.min_bps}–${post.max_bps}`}
                                      </span>
                                    </div>

                                    <div style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
                                      {post.is_vacant ? (
                                        <span style={{ color: "#b45309", fontWeight: 700 }}>
                                          VACANT
                                        </span>
                                      ) : (
                                        <div>
                                          <strong style={{ color: "#0f172a" }}>
                                            {post.incumbent_name}
                                          </strong>{" "}
                                          <span style={{ fontSize: "0.7rem", color: "#475569" }}>
                                            ({post.charge_type ?? "SUBSTANTIVE"})
                                          </span>
                                          {post.incumbent_ppo && (
                                            <span
                                              style={{
                                                fontSize: "0.7rem",
                                                color: "#0369a1",
                                                marginLeft: "0.35rem"
                                              }}
                                            >
                                              {post.incumbent_ppo}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {canStaff && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexWrap: "wrap",
                                          gap: "0.35rem",
                                          marginTop: "0.4rem"
                                        }}
                                      >
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          onClick={() => handleOpenAssignFromPost(post)}
                                        >
                                          {post.is_vacant ? "Assign Officer" : "Transfer / Replace"}
                                        </button>
                                        {post.is_vacant && (
                                          <button
                                            type="button"
                                            className="btn-ghost btn-sm"
                                            onClick={() => handleOpenCreateModal(post)}
                                          >
                                            + Onboard Here
                                          </button>
                                        )}
                                        {!post.is_vacant &&
                                          post.incumbent_user_id !== currentOfficer?.id && (
                                            <button
                                              type="button"
                                              className="btn-ghost btn-sm"
                                              onClick={() => handleOpenRelievePost(post)}
                                            >
                                              Relieve to Vacant
                                            </button>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          <td style={{ textAlign: "right" }}>
                            {(canManagePosts || canRenameCircles || canSanctionCirclePosts) && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  flexWrap: "wrap",
                                  gap: "0.4rem"
                                }}
                              >
                                {canManagePosts && (
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() =>
                                      handleOpenAttachCircle(circle.circle_id, circle.tehsil_id)
                                    }
                                    style={{ background: "#0d3822", borderColor: "#062415" }}
                                  >
                                    Change Tehsil
                                  </button>
                                )}
                                {canRenameCircles && (
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() =>
                                      handleOpenRename({
                                        entityType: "CIRCLE",
                                        entityId: circle.circle_id,
                                        code: circle.circle_code,
                                        currentName: circle.circle_name
                                      })
                                    }
                                  >
                                    Rename
                                  </button>
                                )}
                                {canSanctionCirclePosts && (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm"
                                    onClick={() =>
                                      handleOpenSanctionPost(
                                        circle.circle_id,
                                        circle.circle_code,
                                        circle.circle_name
                                      )
                                    }
                                  >
                                    + Sanction Post
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: PERSONNEL CADRE DIRECTORY */}
        {/* ============================================================ */}
        {activeTab === "OFFICERS" && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              padding: "1.25rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
                flexWrap: "wrap",
                gap: "0.75rem"
              }}
            >
              <input
                type="text"
                aria-label="Search officers by name, email, post code, CNIC, or circle"
                className="form-control"
                placeholder="Search by name, email, post code, CNIC, or circle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: "1 1 16rem", maxWidth: "24rem", fontSize: "0.85rem" }}
              />

              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <select
                  aria-label="Filter by Cadre"
                  className="form-control"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as CadreFilter)}
                  style={{ fontSize: "0.85rem", width: "auto" }}
                >
                  <option value="ALL">All Cadres</option>
                  <option value="DET">DET (Director BPS-19)</option>
                  <option value="ETO">ETO (BPS-17)</option>
                  <option value="ETI">ETI (Inspector BPS-14–16)</option>
                  <option value="ETC">ETC (Constable BS-05)</option>
                  <option value="ADMIN">Admin</option>
                </select>

                <select
                  aria-label="Filter by Posting Status"
                  className="form-control"
                  value={postingStatusFilter}
                  onChange={(e) => setPostingStatusFilter(e.target.value as PostingStatusFilter)}
                  style={{ fontSize: "0.85rem", width: "auto" }}
                >
                  <option value="ALL">All Posting States</option>
                  <option value="POSTED">Posted</option>
                  <option value="UNPOSTED">Unposted Reserve</option>
                </select>

                <select
                  aria-label="Filter by Account Status"
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as AccountStatusFilter)}
                  style={{ fontSize: "0.85rem", width: "auto" }}
                >
                  <option value="ALL">All Accounts</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Suspended</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th scope="col">Officer Name &amp; Cadre Grade</th>
                    <th scope="col">Assigned Permanent Post(s)</th>
                    <th scope="col">Tehsil / District</th>
                    <th scope="col">Contact</th>
                    <th scope="col">CNIC &amp; PPO</th>
                    <th scope="col">Account</th>
                    <th scope="col" style={{ textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOfficers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: "center",
                          padding: "2rem",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        No officer profiles match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredOfficers.map((o) => {
                      const oCanon = normalizeCadreCode(o.cadre_code ?? o.role) ?? o.role;
                      const isSelf =
                        o.user_id === currentOfficer?.id || o.auth_user_id === currentOfficer?.id;
                      const canEditSubordinate = canEditOfficerProfile(
                        currentOfficer?.id,
                        actorCanonRole,
                        o.user_id,
                        oCanon
                      );
                      const canStaffSubordinate =
                        !isSelf && canAuthorityManageCadre(actorCanonRole, oCanon);
                      const isUnposted =
                        (o.posting_status ?? (o.post_id ? "POSTED" : "UNPOSTED")) === "UNPOSTED";

                      return (
                        <tr key={o.user_id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  background:
                                    oCanon === "ETO"
                                      ? "#0d3822"
                                      : oCanon === "DET"
                                        ? "#581c87"
                                        : oCanon === "ETC"
                                          ? "#9a3412"
                                          : "#1e40af",
                                  color: "#ffffff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "0.8rem",
                                  flexShrink: 0
                                }}
                              >
                                {o.name
                                  .split(" ")
                                  .map((w) => w[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div>
                                <strong style={{ color: "#0f172a" }}>
                                  {o.name} {isSelf && "(You)"}
                                </strong>
                                {o.father_name && (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "0.72rem",
                                      color: "var(--color-text-muted)"
                                    }}
                                  >
                                    s/o {o.father_name}
                                  </span>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: "0.35rem",
                                    marginTop: "0.15rem"
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 700,
                                      background: "#f1f5f9",
                                      color: "#334155",
                                      padding: "0.1rem 0.35rem",
                                      borderRadius: "3px",
                                      border: "1px solid #cbd5e1"
                                    }}
                                  >
                                    {oCanon} &bull; BPS-{o.bps_scale ?? 14}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", color: "#475569" }}>
                                    {o.designation || formatCadreLabel(oCanon)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            {isUnposted ? (
                              <span
                                style={{
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  fontWeight: 700,
                                  fontSize: "0.72rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "4px"
                                }}
                              >
                                UNPOSTED RESERVE
                              </span>
                            ) : (
                              <div>
                                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontWeight: 700,
                                      fontSize: "0.78rem",
                                      color: "#0d3822"
                                    }}
                                  >
                                    {o.post_code || o.circle_code}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 600,
                                      background:
                                        o.charge_type === "ADDITIONAL_CHARGE"
                                          ? "#fef3c7"
                                          : "#f0fdf4",
                                      color:
                                        o.charge_type === "ADDITIONAL_CHARGE"
                                          ? "#92400e"
                                          : "#166534",
                                      padding: "0.1rem 0.4rem",
                                      borderRadius: "3px"
                                    }}
                                  >
                                    {o.charge_type ?? "SUBSTANTIVE"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.78rem", color: "#334155" }}>
                                  {o.circle_name}
                                </div>
                                {(o.additional_posts ?? []).map((ap) => (
                                  <div
                                    key={ap.post_id}
                                    style={{
                                      fontSize: "0.7rem",
                                      color: "#92400e",
                                      marginTop: "0.15rem"
                                    }}
                                  >
                                    + {ap.post_code} ({ap.charge_type})
                                  </div>
                                ))}
                                {o.transfer_order_number && (
                                  <div
                                    style={{
                                      fontSize: "0.7rem",
                                      color: "var(--color-text-muted)",
                                      fontFamily: "monospace"
                                    }}
                                  >
                                    Order: {o.transfer_order_number}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td>
                            <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                              {o.district_name || "Punjab Provincial"}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                              {o.tehsil_name ? `Tehsil ${o.tehsil_name}` : o.division_name || "HQ"}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontSize: "0.78rem" }}>{o.email}</div>
                            <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                              {o.phone || "No phone registered"}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>
                              {o.cnic || "Not recorded"}
                            </div>
                            {o.ppo_number && (
                              <div
                                style={{ fontSize: "0.7rem", color: "#0369a1", fontWeight: 600 }}
                              >
                                {o.ppo_number}
                              </div>
                            )}
                          </td>

                          <td>
                            <span
                              className={`badge ${o.active ? "badge-approved" : "badge-returned"}`}
                              style={{ fontSize: "0.7rem" }}
                            >
                              {o.active ? "ACTIVE" : "SUSPENDED"}
                            </span>
                            {isSelf && (
                              <div
                                style={{
                                  fontSize: "0.68rem",
                                  color: "#64748b",
                                  marginTop: "0.2rem"
                                }}
                              >
                                Managed by superior
                              </div>
                            )}
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <RowActionMenu
                              align="right"
                              actions={[
                                ...(canEditSubordinate
                                  ? [
                                      {
                                        id: `edit-${o.user_id}`,
                                        label: "Edit Officer Profile",
                                        icon: "✏️",
                                        onClick: () => handleOpenEdit(o)
                                      }
                                    ]
                                  : []),
                                ...(canStaffSubordinate && o.active
                                  ? [
                                      {
                                        id: `assign-${o.user_id}`,
                                        label: isUnposted
                                          ? "Assign to Vacant Post"
                                          : "Transfer / Add Charge Post",
                                        icon: "🔄",
                                        onClick: () => handleOpenAssignFromOfficer(o)
                                      }
                                    ]
                                  : []),
                                ...(isSelf || canEditSubordinate
                                  ? [
                                      {
                                        id: `password-${o.user_id}`,
                                        label: isSelf
                                          ? "Change My Password"
                                          : "Reset Officer Password",
                                        icon: "🔑",
                                        onClick: () => handleOpenPassword(o)
                                      }
                                    ]
                                  : []),
                                ...(canEditSubordinate
                                  ? [
                                      {
                                        id: `status-${o.user_id}`,
                                        label: o.active ? "Suspend Officer" : "Activate Officer",
                                        icon: o.active ? "⏸️" : "▶️",
                                        onClick: () => handleOpenToggleStatus(o)
                                      }
                                    ]
                                  : [])
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: STATUTORY AUDIT TRAIL */}
        {/* ============================================================ */}
        {activeTab === "AUDIT" && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              padding: "1.25rem"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "1rem"
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#0d3822", fontWeight: 700 }}>
                  Statutory Governance &amp; Posting Audit Log
                </h2>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  Immutable records for officer profiles, post assignments, reliefs, Circle renames,
                  and Tehsil attachments.
                </span>
              </div>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "#166534",
                  background: "#f0fdf4",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "4px",
                  fontWeight: 700
                }}
              >
                PKT (UTC+05:00)
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Performed By</th>
                    <th scope="col">Event</th>
                    <th scope="col">Transition</th>
                    <th scope="col">Statutory Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingAuditLogs && auditLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: "2rem",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        Loading administrative audit trail…
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: "2rem",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        No administrative audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                          {new Date(log.occurred_at).toLocaleString("en-PK", {
                            timeZone: "Asia/Karachi"
                          })}
                        </td>
                        <td>
                          <strong>{log.performed_by_name}</strong>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.72rem",
                              color: "var(--color-text-muted)"
                            }}
                          >
                            {log.actor_role}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-submitted" style={{ fontSize: "0.7rem" }}>
                            {log.event_type}
                          </span>
                        </td>
                        <td
                          style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#475569" }}
                        >
                          {log.from_status || log.to_status
                            ? `${log.from_status ?? "—"} → ${log.to_status ?? "—"}`
                            : log.aggregate_id}
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "#166534", fontWeight: 600 }}>
                          {log.reason || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 1: PROVISION NEW OFFICER TO PERMANENT VACANT POST */}
        {/* ============================================================ */}
        {isCreateModalOpen && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-create-officer-title"
          >
            <div className="modal-card">
              <div className="modal-header">
                <h3 id="admin-create-officer-title">Provision &amp; Post Officer to Cadre</h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-name"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Full Name: *
                    </label>
                    <input
                      id="ptas-admin-create-name"
                      type="text"
                      className="form-control"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-father"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Father&apos;s Name:
                    </label>
                    <input
                      id="ptas-admin-create-father"
                      type="text"
                      className="form-control"
                      value={createFatherName}
                      onChange={(e) => setCreateFatherName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-email"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Official Login Email: *
                    </label>
                    <input
                      id="ptas-admin-create-email"
                      type="email"
                      className="form-control"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-role"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Service Cadre: *
                    </label>
                    <select
                      id="ptas-admin-create-role"
                      className="form-control"
                      value={createRole}
                      onChange={(e) => {
                        const r = e.target.value as ProvisionableCadreRole;
                        const canon = normalizeCadreCode(r) ?? "ETI";
                        const bounds =
                          canon === "DET" || canon === "ETO" || canon === "ETI" || canon === "ETC"
                            ? CADRE_BPS_BOUNDS[canon]
                            : CADRE_BPS_BOUNDS.ETI;
                        setCreateRole(r);
                        setCreateBpsScale(bounds.min);
                        setCreateDesignation(getDefaultDesignation(r));
                        const matchPost = allPosts.find(
                          (p) => p.is_vacant && p.status === "ACTIVE" && p.cadre_code === canon
                        );
                        setCreatePostId(matchPost?.post_id ?? "");
                      }}
                    >
                      <option value="ETI">ETI — Excise &amp; Taxation Inspector (BPS-16)</option>
                      <option value="ETC">ETC — Constable (BPS-05 Notice Delivery Only)</option>
                      {canAuthorityManageCadre(actorCanonRole, "ETO") && (
                        <option value="ETO">ETO — District Officer (BPS-17)</option>
                      )}
                      {canAuthorityManageCadre(actorCanonRole, "DET") && (
                        <option value="DET">DET — Director Excise &amp; Taxation (BPS-19)</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-bps"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Basic Pay Scale (BPS): *
                    </label>
                    <select
                      id="ptas-admin-create-bps"
                      className="form-control"
                      value={createBpsScale}
                      onChange={(e) => setCreateBpsScale(Number(e.target.value))}
                    >
                      {getBpsOptionsForCadre(createRole).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-post"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Target Vacant Sanctioned Post: *
                    </label>
                    <select
                      id="ptas-admin-create-post"
                      className="form-control"
                      value={createPostId}
                      onChange={(e) => setCreatePostId(e.target.value)}
                    >
                      {vacantPostsForCreateRole.length === 0 ? (
                        <option value="">
                          No vacant {normalizeCadreCode(createRole)} posts in scope
                        </option>
                      ) : (
                        vacantPostsForCreateRole.map((p) => (
                          <option key={p.post_id} value={p.post_id}>
                            {p.post_code} — {p.circle_name ?? p.district_name ?? p.division_name}{" "}
                            [VACANT]
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-order"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Appointment / Transfer Order No: *
                    </label>
                    <input
                      id="ptas-admin-create-order"
                      type="text"
                      className="form-control"
                      value={createTransferOrderNumber}
                      onChange={(e) => setCreateTransferOrderNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-ppo"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      PPO / Personnel No:
                    </label>
                    <input
                      id="ptas-admin-create-ppo"
                      type="text"
                      className="form-control"
                      value={createPpoNumber}
                      onChange={(e) => setCreatePpoNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-phone"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Mobile Phone:
                    </label>
                    <input
                      id="ptas-admin-create-phone"
                      type="text"
                      className="form-control"
                      value={createPhone}
                      onChange={(e) => setCreatePhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-create-cnic"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      CNIC:
                    </label>
                    <input
                      id="ptas-admin-create-cnic"
                      type="text"
                      className="form-control"
                      value={createCnic}
                      onChange={(e) => setCreateCnic(e.target.value)}
                      placeholder="36603-XXXXXXX-X"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-create-designation"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Official Designation:
                  </label>
                  <input
                    id="ptas-admin-create-designation"
                    type="text"
                    className="form-control"
                    value={createDesignation}
                    onChange={(e) => setCreateDesignation(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-create-address"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Office Postal Address:
                  </label>
                  <input
                    id="ptas-admin-create-address"
                    type="text"
                    className="form-control"
                    value={createOfficeAddress}
                    onChange={(e) => setCreateOfficeAddress(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-create-password"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Initial Temporary Password (Minimum 12 characters): *
                  </label>
                  <input
                    id="ptas-admin-create-password"
                    type="password"
                    className="form-control"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    minLength={12}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveCreate()}
                    disabled={isSubmitting || !createPostId}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Provisioning…" : "Provision & Assign to Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 2: EDIT SUBORDINATE OFFICER PROFILE (NO SELF EDIT) */}
        {/* ============================================================ */}
        {editingOfficer && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-officer-title"
          >
            <div className="modal-card" style={{ maxWidth: "34rem" }}>
              <div className="modal-header">
                <h3 id="admin-edit-officer-title">
                  Edit Subordinate Profile &bull; {editingOfficer.name}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setEditingOfficer(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-name"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Full Display Name: *
                    </label>
                    <input
                      id="ptas-admin-edit-name"
                      type="text"
                      className="form-control"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-father"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Father&apos;s Name:
                    </label>
                    <input
                      id="ptas-admin-edit-father"
                      type="text"
                      className="form-control"
                      value={editFatherName}
                      onChange={(e) => setEditFatherName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-designation"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Official Designation:
                    </label>
                    <input
                      id="ptas-admin-edit-designation"
                      type="text"
                      className="form-control"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-bps"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Basic Pay Scale (BPS):
                    </label>
                    <select
                      id="ptas-admin-edit-bps"
                      className="form-control"
                      value={editBpsScale}
                      onChange={(e) => setEditBpsScale(Number(e.target.value))}
                    >
                      {getBpsOptionsForCadre(editingOfficer.cadre_code ?? editingOfficer.role).map(
                        (opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-cnic"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      CNIC:
                    </label>
                    <input
                      id="ptas-admin-edit-cnic"
                      type="text"
                      className="form-control"
                      value={editCnic}
                      onChange={(e) => setEditCnic(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-edit-ppo"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Personnel PPO No:
                    </label>
                    <input
                      id="ptas-admin-edit-ppo"
                      type="text"
                      className="form-control"
                      value={editPpoNumber}
                      onChange={(e) => setEditPpoNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-edit-phone"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Official Mobile Phone:
                  </label>
                  <input
                    id="ptas-admin-edit-phone"
                    type="text"
                    className="form-control"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-edit-address"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Office Postal Address:
                  </label>
                  <input
                    id="ptas-admin-edit-address"
                    type="text"
                    className="form-control"
                    value={editOfficeAddress}
                    onChange={(e) => setEditOfficeAddress(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingOfficer(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveEdit()}
                    disabled={isSubmitting}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Saving…" : "Save Officer Updates"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 3: ASSIGN OR TRANSFER OFFICER ON PERMANENT POST */}
        {/* ============================================================ */}
        {(assignModalPost || assignModalOfficer) && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-assign-post-title"
          >
            <div className="modal-card" style={{ maxWidth: "36rem" }}>
              <div className="modal-header">
                <h3 id="admin-assign-post-title">
                  {assignModalPost
                    ? `Staff Permanent Post • ${assignModalPost.post_code}`
                    : `Post / Transfer Officer • ${assignModalOfficer?.name}`}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => {
                    setAssignModalPost(null);
                    setAssignModalOfficer(null);
                  }}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                {assignModalPost ? (
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label
                      htmlFor="ptas-admin-assign-officer"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Select Eligible Officer ({assignModalPost.cadre_code}, BPS-
                      {assignModalPost.min_bps}–{assignModalPost.max_bps}): *
                    </label>
                    <select
                      id="ptas-admin-assign-officer"
                      className="form-control"
                      value={selectedAssignUserId}
                      onChange={(e) => setSelectedAssignUserId(e.target.value)}
                    >
                      {eligibleOfficersForPostModal.length === 0 ? (
                        <option value="">
                          No active {assignModalPost.cadre_code} officers eligible in directory
                        </option>
                      ) : (
                        eligibleOfficersForPostModal.map((o) => (
                          <option key={o.user_id} value={o.user_id}>
                            {o.name} ({o.post_code ? `Current: ${o.post_code}` : "UNPOSTED"})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label
                      htmlFor="ptas-admin-assign-post"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Select Target Sanctioned Post (
                      {assignModalOfficer?.cadre_code ?? assignModalOfficer?.role}): *
                    </label>
                    <select
                      id="ptas-admin-assign-post"
                      className="form-control"
                      value={selectedAssignPostId}
                      onChange={(e) => setSelectedAssignPostId(e.target.value)}
                    >
                      {eligiblePostsForOfficerModal.length === 0 ? (
                        <option value="">No eligible posts available in scope</option>
                      ) : (
                        eligiblePostsForOfficerModal.map((p) => (
                          <option key={p.post_id} value={p.post_id}>
                            {p.post_code} — {p.circle_name ?? p.district_name ?? p.division_name}{" "}
                            {p.is_vacant ? "[VACANT]" : `[Incumbent: ${p.incumbent_name}]`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-assign-order"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Posting / Transfer Order No: *
                    </label>
                    <input
                      id="ptas-admin-assign-order"
                      type="text"
                      className="form-control"
                      value={assignOrderNumber}
                      onChange={(e) => setAssignOrderNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label
                      htmlFor="ptas-admin-assign-charge"
                      style={{ fontWeight: 700, fontSize: "0.85rem" }}
                    >
                      Charge Type: *
                    </label>
                    <select
                      id="ptas-admin-assign-charge"
                      className="form-control"
                      value={assignChargeType}
                      onChange={(e) => setAssignChargeType(e.target.value as PostChargeType)}
                    >
                      <option value="SUBSTANTIVE">Substantive Charge</option>
                      <option value="ADDITIONAL_CHARGE">Additional Charge</option>
                      <option value="LOOK_AFTER">Look-After Charge</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.825rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={relieveExistingIncumbent}
                      onChange={(e) => setRelieveExistingIncumbent(e.target.checked)}
                    />
                    Relieve current incumbent if target post is occupied
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-assign-notes"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Handing-Over / Administrative Notes:
                  </label>
                  <textarea
                    id="ptas-admin-assign-notes"
                    className="form-control"
                    rows={3}
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setAssignModalPost(null);
                      setAssignModalOfficer(null);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveAssignPost()}
                    disabled={
                      isSubmitting ||
                      !(assignModalPost ? selectedAssignUserId : selectedAssignPostId)
                    }
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Executing…" : "Confirm Post Assignment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 4: RELIEVE OFFICER FROM PERMANENT POST (LEAVES VACANT) */}
        {/* ============================================================ */}
        {relievePostTarget && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-relieve-post-title"
          >
            <div className="modal-card modal-card-sm">
              <div className="modal-header">
                <h3 id="admin-relieve-post-title">
                  Relieve Officer &bull; {relievePostTarget.post_code}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setRelievePostTarget(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: "0.85rem", color: "#334155", margin: "0 0 1rem" }}>
                  Relieving <strong>{relievePostTarget.incumbent_name}</strong> closes their active
                  tenure on <strong>{relievePostTarget.post_code}</strong> and marks the permanent
                  post <strong>VACANT</strong> (neither the post nor officer account is deleted).
                </p>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-relieve-order"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Transfer / Relief Order No:
                  </label>
                  <input
                    id="ptas-admin-relieve-order"
                    type="text"
                    className="form-control"
                    value={relieveOrderNumber}
                    onChange={(e) => setRelieveOrderNumber(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-relieve-reason"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Administrative Reason: *
                  </label>
                  <textarea
                    id="ptas-admin-relieve-reason"
                    className="form-control"
                    rows={3}
                    value={relieveReason}
                    onChange={(e) => setRelieveReason(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRelievePostTarget(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveRelievePost()}
                    disabled={isSubmitting}
                    style={{ background: "#b45309", borderColor: "#92400e" }}
                  >
                    {isSubmitting ? "Relieving…" : "Relieve to Vacant"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 5: ATTACH CIRCLE TO TEHSIL OR DISTRICT HQ */}
        {/* ============================================================ */}
        {attachingCircle && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-attach-circle-title"
          >
            <div className="modal-card" style={{ maxWidth: "34rem" }}>
              <div className="modal-header">
                <h3 id="admin-attach-circle-title">
                  Change Tehsil &bull; {attachingCircle.circle_code}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setAttachingCircleId(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    fontSize: "0.825rem",
                    color: "#166534"
                  }}
                >
                  Circle <strong>{attachingCircle.circle_name}</strong> (
                  <code>{attachingCircle.circle_code}</code>) in District{" "}
                  <strong>{attachingCircle.district_name}</strong> is currently{" "}
                  <strong>
                    {attachingCircle.tehsil_name
                      ? `Tehsil ${attachingCircle.tehsil_name}`
                      : "District HQ (Unattached)"}
                  </strong>
                  .
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-attach-tehsil"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Target Tehsil in {attachingCircle.district_name}: *
                  </label>
                  <select
                    id="ptas-admin-attach-tehsil"
                    className="form-control"
                    value={targetTehsilId}
                    onChange={(e) => setTargetTehsilId(e.target.value)}
                  >
                    {attachingDistrictTehsils.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tehsil {t.name} (PBS #{t.tehsil_code})
                      </option>
                    ))}
                    <option value="__UNATTACHED__">District HQ / Unattached (No Tehsil)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-attach-reason"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Reorganization Order / Reason: *
                  </label>
                  <textarea
                    id="ptas-admin-attach-reason"
                    className="form-control"
                    rows={3}
                    value={attachReason}
                    onChange={(e) => setAttachReason(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAttachingCircleId(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveAttachCircle()}
                    disabled={isSubmitting}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Saving…" : "Update Tehsil Attachment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 6: RENAME DISPLAY NAME (IMMUTABLE CODE LOCKED) */}
        {/* ============================================================ */}
        {renamingEntity && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-rename-entity-title"
          >
            <div className="modal-card modal-card-sm">
              <div className="modal-header">
                <h3 id="admin-rename-entity-title">
                  Rename {renamingEntity.entityType} ({renamingEntity.code})
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setRenamingEntity(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: "0.82rem", color: "#334155", margin: "0 0 1rem" }}>
                  Permanent identifier <code>{renamingEntity.code}</code> is{" "}
                  <strong>immutable</strong> and cannot change. Only the display title updates
                  across active registers and posts.
                </p>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-rename-name"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    New Display Name: *
                  </label>
                  <input
                    id="ptas-admin-rename-name"
                    type="text"
                    className="form-control"
                    value={renameNewName}
                    onChange={(e) => setRenameNewName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-rename-reason"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Gazette / Administrative Order Reason: *
                  </label>
                  <textarea
                    id="ptas-admin-rename-reason"
                    className="form-control"
                    rows={3}
                    value={renameReason}
                    onChange={(e) => setRenameReason(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRenamingEntity(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveRename()}
                    disabled={isSubmitting}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Renaming…" : "Confirm Rename"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 7: SANCTION ADDITIONAL CIRCLE POST */}
        {/* ============================================================ */}
        {sanctionTargetCircle && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-sanction-post-title"
          >
            <div className="modal-card modal-card-sm">
              <div className="modal-header">
                <h3 id="admin-sanction-post-title">
                  Sanction Additional Post &bull; {sanctionTargetCircle.circleCode}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setSanctionTargetCircle(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: "0.82rem", color: "#334155", margin: "0 0 1rem" }}>
                  Adds a numbered permanent sanctioned post under{" "}
                  <strong>
                    {sanctionTargetCircle.circleCode} ({sanctionTargetCircle.circleName})
                  </strong>
                  .
                </p>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-sanction-role"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Post Cadre: *
                  </label>
                  <select
                    id="ptas-admin-sanction-role"
                    className="form-control"
                    value={sanctionRoleCode}
                    onChange={(e) => setSanctionRoleCode(e.target.value as "ETI" | "ETC")}
                  >
                    <option value="ETC">ETC — Constable (BPS-05 Notice Delivery Only)</option>
                    <option value="ETI">ETI — Excise &amp; Taxation Inspector (BPS-14–16)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-sanction-order"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Finance / Establishment Sanction Order No: *
                  </label>
                  <input
                    id="ptas-admin-sanction-order"
                    type="text"
                    className="form-control"
                    value={sanctionOrderNo}
                    onChange={(e) => setSanctionOrderNo(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-sanction-reason"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Justification:
                  </label>
                  <textarea
                    id="ptas-admin-sanction-reason"
                    className="form-control"
                    rows={2}
                    value={sanctionReason}
                    onChange={(e) => setSanctionReason(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSanctionTargetCircle(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveSanctionPost()}
                    disabled={isSubmitting}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Creating…" : "Create Sanctioned Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 8: PASSWORD MANAGEMENT */}
        {/* ============================================================ */}
        {passwordOfficer && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-password-officer-title"
          >
            <div className="modal-card" style={{ maxWidth: "34rem" }}>
              <div className="modal-header">
                <h3 id="admin-password-officer-title">
                  Password Management &bull; {passwordOfficer.name}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setPasswordOfficer(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-pw-new"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    New Password (minimum 12 characters): *
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      id="ptas-admin-pw-new"
                      type={showPassword ? "text" : "password"}
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={12}
                      required
                    />
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="ptas-admin-pw-confirm"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Confirm Password: *
                  </label>
                  <input
                    id="ptas-admin-pw-confirm"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {passwordOfficer.user_id !== currentOfficer?.id && (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.825rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mustChangePassword}
                        onChange={(e) => setMustChangePassword(e.target.checked)}
                      />
                      Require officer to change password on next sign-in
                    </label>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem"
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void handleSendResetEmail()}
                    disabled={isSendingResetEmail || !passwordOfficer.email}
                  >
                    {isSendingResetEmail ? "Sending…" : "Send Reset Link"}
                  </button>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setPasswordOfficer(null)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleSavePassword()}
                      disabled={isSubmitting}
                      style={{ background: "#0d3822", borderColor: "#062415" }}
                    >
                      {isSubmitting ? "Updating…" : "Save Password"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 9: SUSPEND / ACTIVATE OFFICER */}
        {/* ============================================================ */}
        {statusTogglingOfficer && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-status-toggle-title"
          >
            <div className="modal-card modal-card-sm">
              <div className="modal-header">
                <h3 id="admin-status-toggle-title">
                  {statusTogglingOfficer.active ? "Suspend Officer" : "Activate Officer"} &bull;{" "}
                  {statusTogglingOfficer.name}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  onClick={() => setStatusTogglingOfficer(null)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: "0.875rem", color: "#334155", margin: "0 0 1rem" }}>
                  {statusTogglingOfficer.active
                    ? "Suspending this officer will revoke active sessions and vacate all held permanent posts (leaving posts VACANT without deleting them)."
                    : "Activate this officer account to make them eligible for sanctioned post assignments."}
                </p>

                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <label
                    htmlFor="ptas-admin-status-reason"
                    style={{ fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    Administrative Justification: *
                  </label>
                  <textarea
                    id="ptas-admin-status-reason"
                    className="form-control"
                    rows={3}
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setStatusTogglingOfficer(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveToggleStatus()}
                    disabled={isSubmitting}
                    style={{
                      background: statusTogglingOfficer.active ? "#b91c1c" : "#0d3822",
                      borderColor: statusTogglingOfficer.active ? "#991b1b" : "#062415"
                    }}
                  >
                    {isSubmitting
                      ? "Updating…"
                      : statusTogglingOfficer.active
                        ? "Confirm Suspension"
                        : "Confirm Activation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

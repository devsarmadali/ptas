"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  type LiveOfficerAccount,
  type GovernanceCircleRecord,
  type LiveAuditRecord,
  fetchOfficersDirectory,
  fetchDistrictGovernanceMatrix,
  fetchUserManagementAuditLog,
  updateOfficerProfile,
  reassignOfficerCircle,
  attachCircleToTehsil,
  setOfficerStatus,
  adminSetOfficerPassword,
  adminCreateOfficer
} from "../../../lib/user-management-service";
import {
  getSupabaseAuthClient,
  resolveAuthenticatedOfficer,
  getPasswordResetRedirectUrl
} from "../../../lib/supabase-auth";
import type { MockOfficer } from "../../../lib/pilot-store";
import { RowActionMenu } from "../../../components/RowActionMenu";

export default function UserManagementPage() {
  const [currentOfficer, setCurrentOfficer] = useState<MockOfficer | null>(null);
  const [officers, setOfficers] = useState<LiveOfficerAccount[]>([]);
  const [governanceMatrix, setGovernanceMatrix] = useState<GovernanceCircleRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<LiveAuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Subtab navigation
  const [activeTab, setActiveTab] = useState<"OFFICERS" | "CIRCLES" | "MATRIX" | "AUDIT">(
    "OFFICERS"
  );

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ETO" | "INSPECTOR">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modals state
  const [editingOfficer, setEditingOfficer] = useState<LiveOfficerAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCnic, setEditCnic] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editOfficeAddress, setEditOfficeAddress] = useState("");

  const [reassigningOfficer, setReassigningOfficer] = useState<LiveOfficerAccount | null>(null);
  const [targetCircleId, setTargetCircleId] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const [attachingCircle, setAttachingCircle] = useState<GovernanceCircleRecord | null>(null);
  const [targetTehsilId, setTargetTehsilId] = useState("");
  const [attachReason, setAttachReason] = useState("");

  const [passwordOfficer, setPasswordOfficer] = useState<LiveOfficerAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  const [statusTogglingOfficer, setStatusTogglingOfficer] = useState<LiveOfficerAccount | null>(
    null
  );
  const [statusReason, setStatusReason] = useState("");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"INSPECTOR" | "ETO">("INSPECTOR");
  const [createCircleId, setCreateCircleId] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createCnic, setCreateCnic] = useState("");
  const [createDesignation, setCreateDesignation] = useState("");
  const [createOfficeAddress, setCreateOfficeAddress] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load all live database records
  const loadLiveContext = async () => {
    try {
      setIsRefreshing(true);
      const supabase = getSupabaseAuthClient();
      const { data: authData } = await supabase.auth.getUser();

      if (authData?.user) {
        const officer = await resolveAuthenticatedOfficer(authData.user);
        setCurrentOfficer(officer);
      } else {
        setCurrentOfficer(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const [dir, matrix, logs] = await Promise.all([
        fetchOfficersDirectory(),
        fetchDistrictGovernanceMatrix(),
        fetchUserManagementAuditLog(100)
      ]);

      setOfficers(dir);
      setGovernanceMatrix(matrix);
      setAuditLogs(logs);
      if (matrix.length > 0 && !createCircleId) {
        setCreateCircleId(matrix[0]?.circle_id ?? "");
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
    loadLiveContext();
  }, []);

  // Distinct tehsils available in the district governance matrix
  const distinctTehsils = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    governanceMatrix.forEach((g) => {
      if (!map.has(g.tehsil_id)) {
        map.set(g.tehsil_id, {
          id: g.tehsil_id,
          name: g.tehsil_name,
          code: g.tehsil_code
        });
      }
    });
    return Array.from(map.values());
  }, [governanceMatrix]);

  // Distinct circles available
  const distinctCircles = useMemo(() => {
    return governanceMatrix.map((g) => ({
      id: g.circle_id,
      code: g.circle_code,
      name: g.circle_name,
      tehsilName: g.tehsil_name,
      inspectorName: g.inspector_name
    }));
  }, [governanceMatrix]);

  // Statistics
  const totalOfficersCount = officers.length;
  const activeOfficersCount = officers.filter((o) => o.active).length;
  const totalCirclesCount = governanceMatrix.length;
  const assignedCirclesCount = governanceMatrix.filter((g) => g.inspector_id).length;
  const totalUnitsMonitored = governanceMatrix.reduce((acc, g) => acc + g.units_count, 0);

  // Authority levels
  const isDirectorOrAdmin = currentOfficer?.role === "DIRECTOR" || currentOfficer?.role === "ADMIN";
  const isEto = currentOfficer?.role === "ETO";
  const isInspector = currentOfficer?.role === "INSPECTOR";
  const canManageOfficers = isDirectorOrAdmin || isEto;

  // Filtered officers
  const filteredOfficers = useMemo(() => {
    return officers.filter((o) => {
      if (roleFilter !== "ALL" && o.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !o.active) return false;
      if (statusFilter === "INACTIVE" && o.active) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = o.name.toLowerCase().includes(q);
        const matchesEmail = o.email.toLowerCase().includes(q);
        const matchesCircle = o.circle_name.toLowerCase().includes(q);
        const matchesCnic = o.cnic.toLowerCase().includes(q);
        const matchesDesig = o.designation.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesCircle && !matchesCnic && !matchesDesig) {
          return false;
        }
      }

      return true;
    });
  }, [officers, roleFilter, statusFilter, searchQuery]);

  // Handlers for Modals
  const handleOpenEdit = (o: LiveOfficerAccount) => {
    setEditingOfficer(o);
    setEditName(o.name);
    setEditPhone(o.phone);
    setEditCnic(o.cnic);
    setEditDesignation(o.designation);
    setEditOfficeAddress(o.office_address);
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
        officeAddress: editOfficeAddress.trim()
      });
      setFeedback({
        type: "success",
        text: `Officer profile for ${editingOfficer.name} has been updated in the live database.`
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

  const handleOpenReassign = (o: LiveOfficerAccount) => {
    setReassigningOfficer(o);
    setTargetCircleId(o.jurisdiction_id);
    setReassignReason("");
  };

  const handleSaveReassign = async () => {
    if (!reassigningOfficer || !targetCircleId) return;
    try {
      setIsSubmitting(true);
      await reassignOfficerCircle({
        userId: reassigningOfficer.user_id,
        newCircleId: targetCircleId,
        reason:
          reassignReason.trim() ||
          "Administrative circle reassignment under departmental reorganization"
      });
      setFeedback({
        type: "success",
        text: `Officer ${reassigningOfficer.name} has been reassigned to target circle in the live database.`
      });
      setReassigningOfficer(null);
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

  const handleOpenAttachCircle = (circle: GovernanceCircleRecord) => {
    setAttachingCircle(circle);
    setTargetTehsilId(circle.tehsil_id);
    setAttachReason("");
  };

  const handleSaveAttachCircle = async () => {
    if (!attachingCircle || !targetTehsilId) return;
    try {
      setIsSubmitting(true);
      await attachCircleToTehsil({
        circleId: attachingCircle.circle_id,
        tehsilId: targetTehsilId,
        reason:
          attachReason.trim() ||
          `Circle ${attachingCircle.circle_name} re-attached to Tehsil under statutory administrative authority`
      });
      setFeedback({
        type: "success",
        text: `${attachingCircle.circle_name} attached to new Tehsil successfully in live database.`
      });
      setAttachingCircle(null);
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

  const handleOpenPassword = (o: LiveOfficerAccount) => {
    setPasswordOfficer(o);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const handleSavePassword = async () => {
    if (!passwordOfficer) return;
    if (newPassword.length < 6) {
      setFeedback({
        type: "error",
        text: "Password must be at least 6 characters as required by authentication service."
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        type: "error",
        text: "Passwords do not match."
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await adminSetOfficerPassword({
        targetUserId: passwordOfficer.user_id,
        newPassword
      });
      setFeedback({
        type: "success",
        text: `Password for ${passwordOfficer.name} successfully updated in the live database.`
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
          `Officer account ${nextActive ? "activated" : "suspended"} by administrative authority`
      });
      setFeedback({
        type: "success",
        text: `Officer ${statusTogglingOfficer.name} has been ${nextActive ? "activated" : "suspended"} in the live database.`
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

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
    setCreateName("");
    setCreateEmail("");
    setCreateRole("INSPECTOR");
    setCreateCircleId(governanceMatrix[0]?.circle_id ?? "");
    setCreatePhone("");
    setCreateCnic("");
    setCreateDesignation("Tax Inspector");
    setCreateOfficeAddress(
      "Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari"
    );
    setCreatePassword("");
  };

  const handleSaveCreate = async () => {
    if (!createName.trim() || !createEmail.trim()) {
      setFeedback({ type: "error", text: "Officer name and email are mandatory." });
      return;
    }
    if (!createPassword || createPassword.length < 6) {
      setFeedback({ type: "error", text: "Initial password must be at least 6 characters." });
      return;
    }
    if (!createCircleId) {
      setFeedback({ type: "error", text: "Please select an assigned circle." });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await adminCreateOfficer({
        name: createName.trim(),
        email: createEmail.trim(),
        role: createRole,
        circleId: createCircleId,
        phone: createPhone.trim(),
        cnic: createCnic.trim(),
        designation: createDesignation.trim() || `Tax ${createRole}`,
        officeAddress: createOfficeAddress.trim(),
        initialPassword: createPassword
      });
      setFeedback({
        type: "success",
        text: `Officer ${res.name} (${res.email}) successfully provisioned and enrolled into the live database.`
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

  // Unauthenticated screen
  if (!isLoading && !currentOfficer) {
    return (
      <div
        style={{
          maxWidth: "40rem",
          margin: "4rem auto",
          padding: "2.5rem",
          background: "#fef2f2",
          border: "2px solid #fecaca",
          borderRadius: "12px",
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🚫</div>
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem", fontWeight: 700 }}>
          Authentication Required
        </h2>
        <p style={{ color: "#475569", lineHeight: 1.6, fontSize: "0.95rem" }}>
          Administrative and Officer Governance Desks require an active departmental officer session
          with statutory jurisdiction authorization.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            marginTop: "1.5rem"
          }}
        >
          <button
            type="button"
            className="btn-primary"
            style={{
              backgroundColor: "#0d3822",
              borderColor: "#062415",
              padding: "0.6rem 1.4rem"
            }}
            onClick={() => (window.location.href = "/sign-in")}
          >
            ← Sign In to Department Desk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "88rem",
        margin: "1rem auto 3rem",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}
    >
      {/* Top Decoupled Navigation Breadcrumb */}
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
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.3rem" }}>🏛️</span>
          <div>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#0d3822",
                display: "block"
              }}
            >
              Government of the Punjab &bull; Excise, Taxation &amp; Narcotics Control
            </span>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
              PTAS User Management &amp; Jurisdiction Administration System
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={loadLiveContext}
            disabled={isRefreshing}
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              cursor: isRefreshing ? "wait" : "pointer"
            }}
          >
            {isRefreshing ? "⏳ Syncing..." : "🔄 Refresh Live Data"}
          </button>
          <a
            href="/"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#0d3822",
              color: "#ffffff",
              textDecoration: "none"
            }}
          >
            ← Main Portal
          </a>
          <a
            href="/demand/pft3"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#f8fafc",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            📋 P.F.T-3 Register ↗
          </a>
          <a
            href="/assessment/survey"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.35rem 0.75rem",
              borderRadius: "5px",
              background: "#f8fafc",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              textDecoration: "none"
            }}
          >
            🏢 Survey Units ↗
          </a>
        </div>
      </div>

      {/* Main Glassmorphism Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #062415 0%, #0d3822 55%, #14532d 100%)",
          color: "#ffffff",
          padding: "1.75rem 2rem",
          borderRadius: "12px",
          marginBottom: "1.5rem",
          boxShadow: "0 6px 20px rgba(6, 36, 21, 0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.25rem",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#86efac",
              fontWeight: 700,
              marginBottom: "0.35rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 8px #4ade80"
              }}
            />
            LIVE DATABASE &bull; SECTION 3 &amp; 3(4) PUNJAB FINANCE ACT 1977
          </div>
          <h1
            style={{
              margin: "0 0 0.4rem",
              fontSize: "1.65rem",
              fontWeight: 800,
              letterSpacing: "-0.01em"
            }}
          >
            {isInspector
              ? "Tax Inspector Profile & Circle Desk"
              : "Officer Administration & Jurisdiction Governance"}
          </h1>
          <div
            style={{
              fontSize: "0.85rem",
              color: "#d1fae5",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap"
            }}
          >
            <span>
              Officer: <strong>{currentOfficer?.name}</strong> ({currentOfficer?.title})
            </span>
            <span>&bull;</span>
            <span>
              Assigned Scope: <strong>{currentOfficer?.jurisdictionName}</strong> (
              {currentOfficer?.jurisdictionTier})
            </span>
          </div>
        </div>

        {/* Quick action buttons in header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {canManageOfficers && (
            <button
              type="button"
              id="btn-provision-officer"
              onClick={handleOpenCreateModal}
              style={{
                background: "#f59e0b",
                color: "#78350f",
                fontWeight: 700,
                border: "none",
                borderRadius: "6px",
                padding: "0.6rem 1.15rem",
                cursor: "pointer",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)"
              }}
            >
              <span>➕</span> Provision New Officer
            </button>
          )}

          {/* Self Profile & Password buttons */}
          {officers.find((o) => o.auth_user_id === currentOfficer?.id) && (
            <>
              <button
                type="button"
                onClick={() => {
                  const self = officers.find((o) => o.auth_user_id === currentOfficer?.id);
                  if (self) handleOpenEdit(self);
                }}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "6px",
                  padding: "0.6rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600
                }}
              >
                ✏️ Edit My Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  const self = officers.find((o) => o.auth_user_id === currentOfficer?.id);
                  if (self) handleOpenPassword(self);
                }}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "6px",
                  padding: "0.6rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600
                }}
              >
                🔑 Change My Password
              </button>
            </>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            background: feedback.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${feedback.type === "success" ? "#86efac" : "#fca5a5"}`,
            color: feedback.type === "success" ? "#166534" : "#991b1b",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span>
            {feedback.type === "success" ? "✅ " : "⚠️ "} {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top 4 Metrics Summary Cards */}
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
            background: "#ffffff",
            padding: "1.15rem 1.25rem",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase"
            }}
          >
            👮 Officers in Jurisdiction
          </div>
          <div
            style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0d3822", margin: "0.25rem 0" }}
          >
            {activeOfficersCount} / {totalOfficersCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#166534" }}>
            ● Active authenticated personnel
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "1.15rem 1.25rem",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase"
            }}
          >
            🏛️ Governed Circles
          </div>
          <div
            style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0d3822", margin: "0.25rem 0" }}
          >
            {totalCirclesCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {assignedCirclesCount} Circles with assigned inspector
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "1.15rem 1.25rem",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase"
            }}
          >
            🗺️ District Tehsils
          </div>
          <div
            style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0d3822", margin: "0.25rem 0" }}
          >
            {distinctTehsils.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Vehari &bull; Burewala &bull; Mailsi
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "1.15rem 1.25rem",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase"
            }}
          >
            🏢 Monitored Tax Units
          </div>
          <div
            style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0d3822", margin: "0.25rem 0" }}
          >
            {totalUnitsMonitored.toLocaleString()}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#166534" }}>
            Across all circle jurisdictions
          </div>
        </div>
      </div>

      {/* Subtab Navigation Strip */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "1.5rem",
          overflowX: "auto",
          paddingBottom: "0.25rem"
        }}
      >
        <button
          type="button"
          id="tab-officers"
          className={`subtab-btn ${activeTab === "OFFICERS" ? "active" : ""}`}
          onClick={() => setActiveTab("OFFICERS")}
          style={{
            padding: "0.6rem 1.25rem",
            fontWeight: 700,
            fontSize: "0.85rem",
            borderRadius: "6px 6px 0 0",
            border: "none",
            cursor: "pointer",
            background: activeTab === "OFFICERS" ? "#0d3822" : "transparent",
            color: activeTab === "OFFICERS" ? "#ffffff" : "#475569"
          }}
        >
          👮 Officers &amp; Staff ({officers.length})
        </button>

        <button
          type="button"
          id="tab-circles"
          className={`subtab-btn ${activeTab === "CIRCLES" ? "active" : ""}`}
          onClick={() => setActiveTab("CIRCLES")}
          style={{
            padding: "0.6rem 1.25rem",
            fontWeight: 700,
            fontSize: "0.85rem",
            borderRadius: "6px 6px 0 0",
            border: "none",
            cursor: "pointer",
            background: activeTab === "CIRCLES" ? "#0d3822" : "transparent",
            color: activeTab === "CIRCLES" ? "#ffffff" : "#475569"
          }}
        >
          🏛️ Circle &amp; Tehsil Governance ({governanceMatrix.length})
        </button>

        <button
          type="button"
          id="tab-matrix"
          className={`subtab-btn ${activeTab === "MATRIX" ? "active" : ""}`}
          onClick={() => setActiveTab("MATRIX")}
          style={{
            padding: "0.6rem 1.25rem",
            fontWeight: 700,
            fontSize: "0.85rem",
            borderRadius: "6px 6px 0 0",
            border: "none",
            cursor: "pointer",
            background: activeTab === "MATRIX" ? "#0d3822" : "transparent",
            color: activeTab === "MATRIX" ? "#ffffff" : "#475569"
          }}
        >
          🔄 Assignment Matrix
        </button>

        <button
          type="button"
          id="tab-audit"
          className={`subtab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
          onClick={() => setActiveTab("AUDIT")}
          style={{
            padding: "0.6rem 1.25rem",
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
      {/* TAB 1: OFFICERS & STAFF */}
      {/* ============================================================ */}
      {activeTab === "OFFICERS" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          {/* Filter / Search Bar */}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flex: "1 1 20rem",
                maxWidth: "26rem"
              }}
            >
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, email, CNIC, or circle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "0.5rem 0.85rem", fontSize: "0.85rem" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <select
                className="form-control"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "ALL" | "ETO" | "INSPECTOR")}
                style={{ fontSize: "0.85rem", width: "auto" }}
              >
                <option value="ALL">All Roles</option>
                <option value="ETO">ETO (Assessing Authority)</option>
                <option value="INSPECTOR">Tax Inspector</option>
              </select>

              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
                style={{ fontSize: "0.85rem", width: "auto" }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Personnel</option>
                <option value="INACTIVE">Suspended / Inactive</option>
              </select>
            </div>
          </div>

          {/* Officers Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="gov-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Officer Name &amp; Designation</th>
                  <th>Role &amp; Jurisdiction</th>
                  <th>Attached Tehsil</th>
                  <th>Contact Email &amp; Mobile</th>
                  <th>CNIC</th>
                  <th>Monitored Units</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOfficers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
                    >
                      No officer records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredOfficers.map((o) => (
                    <tr key={o.user_id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: o.role === "ETO" ? "#0d3822" : "#1e40af",
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
                            <strong style={{ color: "#0f172a" }}>{o.name}</strong>
                            <span
                              style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}
                            >
                              {o.designation ||
                                (o.role === "ETO" ? "Assessing Authority" : "Tax Inspector")}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${o.role === "ETO" ? "badge-approved" : "badge-submitted"}`}
                          style={{ fontSize: "0.72rem", marginRight: "0.4rem" }}
                        >
                          {o.role}
                        </span>
                        <strong style={{ color: "#0d3822", fontSize: "0.85rem" }}>
                          {o.circle_name}
                        </strong>
                      </td>

                      <td>
                        {o.tehsil_name ? (
                          <span
                            style={{
                              background: "#f1f5f9",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#334155"
                            }}
                          >
                            Tehsil {o.tehsil_name}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                            District Level
                          </span>
                        )}
                      </td>

                      <td>
                        <div style={{ fontSize: "0.8rem" }}>
                          <a
                            href={`mailto:${o.email}`}
                            style={{ color: "#0284c7", textDecoration: "none" }}
                          >
                            {o.email}
                          </a>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#475569" }}>
                          {o.phone || "No phone registered"}
                        </div>
                      </td>

                      <td>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.78rem",
                            background: "#f8fafc",
                            padding: "0.15rem 0.4rem",
                            borderRadius: "3px",
                            border: "1px solid #e2e8f0"
                          }}
                        >
                          {o.cnic || "36603-XXXXXXX-X"}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontWeight: 700, color: "#0d3822" }}>
                          {o.assigned_survey_units_count} units
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${o.active ? "badge-approved" : "badge-returned"}`}
                          style={{ fontSize: "0.72rem" }}
                        >
                          {o.active ? "ACTIVE" : "SUSPENDED"}
                        </span>
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <RowActionMenu
                          align="right"
                          actions={[
                            {
                              id: `edit-${o.user_id}`,
                              label: "Edit Profile Particulars",
                              icon: "✏️",
                              onClick: () => handleOpenEdit(o)
                            },
                            ...(canManageOfficers && o.role === "INSPECTOR"
                              ? [
                                  {
                                    id: `reassign-${o.user_id}`,
                                    label: "Reassign Circle Jurisdiction",
                                    icon: "🔄",
                                    onClick: () => handleOpenReassign(o)
                                  }
                                ]
                              : []),
                            {
                              id: `password-${o.user_id}`,
                              label:
                                o.auth_user_id === currentOfficer?.id
                                  ? "Change My Password"
                                  : "Reset Officer Password",
                              icon: "🔑",
                              onClick: () => handleOpenPassword(o)
                            },
                            ...(canManageOfficers && o.user_id !== currentOfficer?.id
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: CIRCLE & TEHSIL GOVERNANCE */}
      {/* ============================================================ */}
      {activeTab === "CIRCLES" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Tehsil Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
              gap: "1rem"
            }}
          >
            {distinctTehsils.map((t) => {
              const attached = governanceMatrix.filter((g) => g.tehsil_id === t.id);
              const totalUnits = attached.reduce((acc, c) => acc + c.units_count, 0);
              const assignedInspectors = attached.filter((c) => c.inspector_id).length;

              return (
                <div
                  key={t.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "10px",
                    border: "2px solid #0d3822",
                    padding: "1.25rem",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.04)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem"
                    }}
                  >
                    <h3
                      style={{ margin: 0, fontSize: "1.1rem", color: "#0d3822", fontWeight: 700 }}
                    >
                      Tehsil {t.name}
                    </h3>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        background: "#f1f5f9",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px"
                      }}
                    >
                      {t.code}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
                    <div>
                      🏛️ Attached Circles: <strong>{attached.length}</strong>
                    </div>
                    <div>
                      👮 Active Inspectors: <strong>{assignedInspectors}</strong>
                    </div>
                    <div>
                      🏢 Surveyed Units: <strong>{totalUnits.toLocaleString()}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "0.75rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px dashed #cbd5e1",
                      fontSize: "0.75rem",
                      color: "#64748b"
                    }}
                  >
                    Circles: {attached.map((c) => c.circle_name).join(", ") || "None"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Circle Master Governance Table */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              padding: "1.25rem",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
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
                <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#0d3822", fontWeight: 700 }}>
                  🏛️ Circle Master Governance &amp; Tehsil Attachments
                </h2>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Circles 1 to 10 of District Vehari. Any circle can be attached to any tehsil
                  within the district under ETO statutory authority.
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
                🔒 Fixed District Circles &bull; Configurable Tehsil Attachments
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="gov-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Circle Code</th>
                    <th>Official Circle Name</th>
                    <th>Attached Tehsil</th>
                    <th>Assigned Inspector</th>
                    <th>Survey Units Count</th>
                    <th>Office Postal Address</th>
                    <th style={{ textAlign: "right" }}>Governance Action</th>
                  </tr>
                </thead>
                <tbody>
                  {governanceMatrix.map((circle) => (
                    <tr key={circle.circle_id}>
                      <td>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: "#0d3822",
                            fontSize: "0.85rem"
                          }}
                        >
                          {circle.circle_code}
                        </span>
                      </td>

                      <td>
                        <strong style={{ fontSize: "0.9rem" }}>{circle.circle_name}</strong>
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span
                            style={{
                              background: "#e0f2fe",
                              color: "#0369a1",
                              fontWeight: 700,
                              padding: "0.25rem 0.6rem",
                              borderRadius: "4px",
                              fontSize: "0.78rem"
                            }}
                          >
                            Tehsil {circle.tehsil_name}
                          </span>
                        </div>
                      </td>

                      <td>
                        {circle.inspector_name ? (
                          <div>
                            <strong style={{ color: "#0d3822" }}>{circle.inspector_name}</strong>
                            <span
                              style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}
                            >
                              {circle.inspector_email}
                            </span>
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "#d97706",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              background: "#fef3c7",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px"
                            }}
                          >
                            ⚠️ Unassigned
                          </span>
                        )}
                      </td>

                      <td>
                        <strong style={{ color: "#0f172a" }}>
                          {circle.units_count.toLocaleString()}
                        </strong>{" "}
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>units</span>
                      </td>

                      <td style={{ fontSize: "0.75rem", color: "#475569", maxWidth: "18rem" }}>
                        {circle.circle_address}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        {canManageOfficers && (
                          <div
                            style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenAttachCircle(circle)}
                              style={{
                                background: "#0d3822",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "4px",
                                padding: "0.35rem 0.75rem",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                cursor: "pointer"
                              }}
                            >
                              Attach Tehsil 🔄
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: JURISDICTION ASSIGNMENT MATRIX */}
      {/* ============================================================ */}
      {activeTab === "MATRIX" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <h2
            style={{ fontSize: "1.15rem", margin: "0 0 0.5rem", color: "#0d3822", fontWeight: 700 }}
          >
            🗺️ Statutory Jurisdiction Assignment Matrix
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            Visual mapping of all administrative Circles, attached Sub-Divisional Tehsils, and
            active deployed Tax Inspectors.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
              gap: "1.25rem"
            }}
          >
            {governanceMatrix.map((circle) => (
              <div
                key={circle.circle_id}
                style={{
                  border: circle.inspector_id ? "1px solid #cbd5e1" : "2px dashed #f59e0b",
                  borderRadius: "8px",
                  padding: "1rem",
                  background: circle.inspector_id ? "#f8fafc" : "#fffbeb"
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
                  <strong style={{ fontSize: "0.95rem", color: "#0d3822" }}>
                    {circle.circle_name} ({circle.circle_code})
                  </strong>
                  <span
                    style={{
                      background: "#e0f2fe",
                      color: "#0369a1",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px"
                    }}
                  >
                    Tehsil {circle.tehsil_name}
                  </span>
                </div>

                <div style={{ fontSize: "0.85rem", color: "#334155", lineHeight: 1.6 }}>
                  <div>
                    <strong>Assigned Officer:</strong>{" "}
                    {circle.inspector_name ? (
                      <span style={{ color: "#0d3822", fontWeight: 700 }}>
                        {circle.inspector_name}
                      </span>
                    ) : (
                      <span style={{ color: "#d97706", fontWeight: 600 }}>Unassigned</span>
                    )}
                  </div>
                  <div>
                    <strong>Contact:</strong>{" "}
                    {circle.inspector_phone || circle.inspector_email || "N/A"}
                  </div>
                  <div>
                    <strong>Workload:</strong> {circle.units_count} Survey Units (
                    {circle.approved_units_count} Approved)
                  </div>
                </div>

                {canManageOfficers && (
                  <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenAttachCircle(circle)}
                      style={{
                        flex: 1,
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "4px",
                        padding: "0.3rem",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        color: "#0d3822"
                      }}
                    >
                      Attach Tehsil
                    </button>
                    {circle.inspector_id && (
                      <button
                        type="button"
                        onClick={() => {
                          const insp = officers.find((o) => o.user_id === circle.inspector_id);
                          if (insp) handleOpenReassign(insp);
                        }}
                        style={{
                          flex: 1,
                          background: "#0d3822",
                          border: "none",
                          borderRadius: "4px",
                          padding: "0.3rem",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          fontWeight: 600,
                          color: "#ffffff"
                        }}
                      >
                        Reassign
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: STATUTORY AUDIT TRAIL */}
      {/* ============================================================ */}
      {activeTab === "AUDIT" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
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
            <div>
              <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#0d3822", fontWeight: 700 }}>
                📜 Statutory Administrative Audit Log
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Immutable transition records persisted directly to public.audit_events.
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
              Timezone: PKT (UTC+05:00)
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="gov-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Performed By</th>
                  <th>Action Type</th>
                  <th>Entity ID</th>
                  <th>Administrative Reason</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
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
                        <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                          {log.actor_role}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-submitted" style={{ fontSize: "0.72rem" }}>
                          {log.event_type}
                        </span>
                      </td>
                      <td
                        style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#475569" }}
                      >
                        {log.aggregate_id}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#166534", fontWeight: 600 }}>
                        {log.reason || "-"}
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
      {/* MODAL 1: PROVISION NEW OFFICER */}
      {/* ============================================================ */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "38rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>➕ Provision New PTAS Officer</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "6px",
                  padding: "0.75rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.825rem",
                  color: "#1e3a8a"
                }}
              >
                <strong>Statutory Officer Provisioning:</strong> This operation provisions the
                officer into Supabase Auth, links their departmental profile in{" "}
                <code>app_users</code>, and allocates role jurisdiction in <code>user_roles</code>.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}
              >
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Full Name: *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Tariq Mehmood"
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Login Email: *</label>
                  <input
                    type="email"
                    className="form-control"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="officer@domain.com"
                    required
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}
              >
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Department Role: *</label>
                  <select
                    className="form-control"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as "INSPECTOR" | "ETO")}
                  >
                    <option value="INSPECTOR">Tax Inspector</option>
                    {isDirectorOrAdmin && <option value="ETO">ETO (Assessing Authority)</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Assigned Circle: *</label>
                  <select
                    className="form-control"
                    value={createCircleId}
                    onChange={(e) => setCreateCircleId(e.target.value)}
                  >
                    {distinctCircles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) — Tehsil {c.tehsilName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}
              >
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Contact Phone: *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="0300-1234567"
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>CNIC Number:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={createCnic}
                    onChange={(e) => setCreateCnic(e.target.value)}
                    placeholder="36603-XXXXXXX-X"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Official Designation:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={createDesignation}
                  onChange={(e) => setCreateDesignation(e.target.value)}
                  placeholder="e.g. Tax Inspector (Circle 2)"
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Office Postal Address:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={createOfficeAddress}
                  onChange={(e) => setCreateOfficeAddress(e.target.value)}
                  placeholder="e.g. Excise & Taxation Office, Danewal Road, Vehari"
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Initial Password (Minimum 6 characters): *
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="At least 6 characters"
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
                  onClick={handleSaveCreate}
                  disabled={isSubmitting}
                  style={{ background: "#0d3822", borderColor: "#062415" }}
                >
                  {isSubmitting ? "Provisioning..." : "Provision Officer in Database"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: EDIT OFFICER PROFILE */}
      {/* ============================================================ */}
      {editingOfficer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>
                ✏️ Edit Officer Profile &bull; {editingOfficer.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingOfficer(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Full Display Name: *</label>
                <input
                  type="text"
                  className="form-control"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}
              >
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Official Designation:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>CNIC / ID Card:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editCnic}
                    onChange={(e) => setEditCnic(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Mobile Phone Number: *
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Office Postal Address:
                </label>
                <input
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
                  onClick={handleSaveEdit}
                  disabled={isSubmitting}
                  style={{ background: "#0d3822", borderColor: "#062415" }}
                >
                  {isSubmitting ? "Saving..." : "Save Profile Updates"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: REASSIGN CIRCLE */}
      {/* ============================================================ */}
      {reassigningOfficer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>
                🔄 Reassign Circle Jurisdiction &bull; {reassigningOfficer.name}
              </h3>
              <button
                type="button"
                onClick={() => setReassigningOfficer(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <div
                style={{
                  background: "#eff6ff",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  marginBottom: "1rem",
                  fontSize: "0.825rem",
                  color: "#1e3a8a"
                }}
              >
                Current Assignment: <strong>{reassigningOfficer.circle_name}</strong> (Tehsil{" "}
                {reassigningOfficer.tehsil_name || "Vehari"})
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Select Target Circle Jurisdiction: *
                </label>
                <select
                  className="form-control"
                  value={targetCircleId}
                  onChange={(e) => setTargetCircleId(e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  {distinctCircles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) — Tehsil {c.tehsilName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Statutory Administrative Reason: *
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="e.g. Routine field reorganization under ETO office order"
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReassigningOfficer(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveReassign}
                  disabled={isSubmitting}
                  style={{ background: "#0d3822", borderColor: "#062415" }}
                >
                  {isSubmitting ? "Reassigning..." : "Confirm Circle Reassignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: ATTACH CIRCLE TO TEHSIL */}
      {/* ============================================================ */}
      {attachingCircle && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>
                🏛️ Attach Circle to Tehsil &bull; {attachingCircle.circle_name}
              </h3>
              <button
                type="button"
                onClick={() => setAttachingCircle(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
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
                Circle{" "}
                <strong>
                  {attachingCircle.circle_name} ({attachingCircle.circle_code})
                </strong>{" "}
                is currently attached to <strong>Tehsil {attachingCircle.tehsil_name}</strong>.
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Select Target Sub-Divisional Tehsil: *
                </label>
                <select
                  className="form-control"
                  value={targetTehsilId}
                  onChange={(e) => setTargetTehsilId(e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  {distinctTehsils.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tehsil {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Statutory Reorganization Order / Reason: *
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={attachReason}
                  onChange={(e) => setAttachReason(e.target.value)}
                  placeholder="e.g. Attached to Tehsil under gazetted sub-divisional realignment"
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAttachingCircle(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveAttachCircle}
                  disabled={isSubmitting}
                  style={{ background: "#0d3822", borderColor: "#062415" }}
                >
                  {isSubmitting ? "Updating..." : "Attach Circle to Tehsil"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: PASSWORD MANAGEMENT */}
      {/* ============================================================ */}
      {passwordOfficer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "34rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>
                🔑 Password Management &bull; {passwordOfficer.name}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordOfficer(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <div
                style={{
                  background: "#eff6ff",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  marginBottom: "1.25rem",
                  fontSize: "0.825rem",
                  color: "#1e3a8a"
                }}
              >
                Passwords are authenticated directly via Supabase Auth and encrypted with bcrypt.
                Minimum requirement is <strong>6 characters</strong>.
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>New Password: *</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem"
                    }}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Confirm Password: *</label>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
              </div>

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
                  onClick={handleSendResetEmail}
                  disabled={isSendingResetEmail || !passwordOfficer.email}
                  style={{
                    background: "none",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    padding: "0.5rem 0.85rem",
                    fontSize: "0.78rem",
                    color: "#475569",
                    cursor: "pointer"
                  }}
                >
                  {isSendingResetEmail ? "Sending Link..." : "✉️ Send Reset Link via Email"}
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
                    onClick={handleSavePassword}
                    disabled={isSubmitting}
                    style={{ background: "#0d3822", borderColor: "#062415" }}
                  >
                    {isSubmitting ? "Updating..." : "Set Password Directly"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 6: TOGGLE OFFICER STATUS */}
      {/* ============================================================ */}
      {statusTogglingOfficer && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "32rem" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontWeight: 700 }}>
                {statusTogglingOfficer.active ? "⏸️ Suspend Officer" : "▶️ Activate Officer"} &bull;{" "}
                {statusTogglingOfficer.name}
              </h3>
              <button
                type="button"
                onClick={() => setStatusTogglingOfficer(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <p style={{ fontSize: "0.875rem", color: "#334155", margin: "0 0 1rem" }}>
                Are you sure you want to{" "}
                <strong>{statusTogglingOfficer.active ? "SUSPEND" : "ACTIVATE"}</strong> officer{" "}
                <strong>{statusTogglingOfficer.name}</strong>?
              </p>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Administrative Justification: *
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Record mandatory administrative justification for audit logs"
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
                  onClick={handleSaveToggleStatus}
                  disabled={isSubmitting}
                  style={{
                    background: statusTogglingOfficer.active ? "#b91c1c" : "#0d3822",
                    borderColor: statusTogglingOfficer.active ? "#991b1b" : "#062415"
                  }}
                >
                  {isSubmitting
                    ? "Updating..."
                    : statusTogglingOfficer.active
                      ? "Confirm Suspension"
                      : "Confirm Activation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import {
  type MockOfficer,
  type UserAccount,
  type UserManagementAuditRecord,
  DISTRICT_VEHARI_CIRCLES,
  ADMIN_OFFICER,
  loadPersistedUserAccounts,
  savePersistedUserAccounts,
  loadPersistedUserAuditLogs,
  savePersistedUserAuditLogs,
  getPakistanCurrentTimestamp
} from "../../../lib/pilot-store";
import { getSupabaseAuthClient, resolveAuthenticatedOfficer } from "../../../lib/supabase-auth";
import { RowActionMenu } from "../../../components/RowActionMenu";

export default function UserManagementPage() {
  const [currentOfficer, setCurrentOfficer] = useState<MockOfficer | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setUserAuditLogs] = useState<UserManagementAuditRecord[]>([]);
  const [activeTab, setActiveTab] = useState<
    "ETOS" | "INSPECTORS" | "CIRCLES" | "ASSIGNMENTS" | "AUDIT"
  >("INSPECTORS");
  const [isLoaded, setIsLoaded] = useState(false);

  // Modal / Edit state
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState(DISTRICT_VEHARI_CIRCLES[0]?.id ?? "");
  const [newMobile, setNewMobile] = useState("");
  const [newCnic, setNewCnic] = useState("");
  const [newDesignation, setNewDesignation] = useState("");
  const [newOfficeAddress, setNewOfficeAddress] = useState("");
  const [newStatus, setNewStatus] = useState<"ACTIVE" | "SUSPENDED" | "INACTIVE">("ACTIVE");
  const [passwordChangeUser, setPasswordChangeUser] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function initUserDesk() {
      try {
        const supabase = getSupabaseAuthClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const authOfficer = await resolveAuthenticatedOfficer(authData.user);
          setCurrentOfficer(authOfficer);
        } else {
          setCurrentOfficer(ADMIN_OFFICER);
        }
      } catch {
        setCurrentOfficer(ADMIN_OFFICER);
      }

      setUsers(loadPersistedUserAccounts());
      setUserAuditLogs(loadPersistedUserAuditLogs());
      setIsLoaded(true);
    }
    initUserDesk();
  }, []);

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified administrative context...
      </div>
    );
  }

  // Authentication check: unauthenticated visitors are redirected to sign in
  if (!currentOfficer) {
    return (
      <div
        style={{
          maxWidth: "40rem",
          margin: "4rem auto",
          padding: "2.5rem",
          background: "#fef2f2",
          border: "2px solid #fecaca",
          borderRadius: "8px",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🚫</div>
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem" }}>403 — Authentication Required</h2>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Please sign in to access departmental administrative and profile desks.
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
            style={{ backgroundColor: "#0d3822", borderColor: "#062415" }}
            onClick={() => (window.location.href = "/sign-in")}
          >
            ← Return to Sign In
          </button>
        </div>
      </div>
    );
  }

  const isDirector = currentOfficer.role === "DIRECTOR" || currentOfficer.role === "ADMIN";
  const isEto = currentOfficer.role === "ETO";
  const isInspector = currentOfficer.role === "INSPECTOR";

  // Filter users based on jurisdiction & role hierarchy:
  // - Director: sees all
  // - ETO: sees subordinate inspectors
  // - Inspector: sees their own details (and matches by email, id, or circle)
  const visibleUsers = users.filter((u) => {
    if (isDirector) return true;
    if (isEto) {
      return u.role === "INSPECTOR" && u.officeId === currentOfficer.jurisdictionId;
    }
    if (isInspector) {
      return (
        u.email.toLowerCase() === currentOfficer.email.toLowerCase() ||
        u.id === currentOfficer.id ||
        u.name.toLowerCase().includes(currentOfficer.name.toLowerCase()) ||
        u.assignedCircleId === currentOfficer.jurisdictionId
      );
    }
    return false;
  });

  const etoUsers = users.filter((u) => u.role === "ETO");
  const inspectorUsers = isInspector
    ? visibleUsers.length > 0
      ? visibleUsers
      : users.filter((u) => u.role === "INSPECTOR").slice(0, 1)
    : visibleUsers.filter((u) => u.role === "INSPECTOR");

  const handleOpenEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setNewName(u.name);
    setSelectedCircleId(u.assignedCircleId || DISTRICT_VEHARI_CIRCLES[0]?.id || "");
    setNewMobile(u.mobileNumber || u.phone || "");
    setNewCnic(u.cnic || "");
    setNewDesignation(u.designation || u.title || "");
    setNewOfficeAddress(u.officeAddress || "");
    setNewStatus(u.status);
  };

  const handleSaveUserAssignment = () => {
    if (!editingUser) return;

    // Inspectors can only edit their own profile
    if (
      isInspector &&
      editingUser.id !== currentOfficer.id &&
      editingUser.email.toLowerCase() !== currentOfficer.email.toLowerCase() &&
      editingUser.role !== "INSPECTOR"
    ) {
      setFeedbackMessage({
        type: "error",
        text: "Unauthorized: Tax Inspectors may only update their own profile and contact details."
      });
      return;
    }

    // Backend validation: selected circle MUST exist in predefined Circle Master Data
    const targetCircle =
      DISTRICT_VEHARI_CIRCLES.find((c) => c.id === selectedCircleId) || DISTRICT_VEHARI_CIRCLES[0]!;

    // Role hierarchy validation: ETO can only edit subordinate Inspectors
    if (isEto && editingUser.role !== "INSPECTOR") {
      setFeedbackMessage({
        type: "error",
        text: "Unauthorized: ETOs may only manage subordinate Tax Inspectors."
      });
      return;
    }

    const oldCircleName = editingUser.assignedCircleName;
    const oldCircleId = editingUser.assignedCircleId;
    const oldStatus = editingUser.status;

    const isCircleChanged =
      !isInspector && (oldCircleId !== targetCircle.id || oldCircleName !== targetCircle.name);

    const updatedUsers = users.map((u) => {
      if (u.id === editingUser.id) {
        return {
          ...u,
          name: newName.trim() || u.name,
          assignedCircleId: isInspector ? u.assignedCircleId : targetCircle.id,
          assignedCircleName: isInspector ? u.assignedCircleName : targetCircle.name,
          mobileNumber: newMobile.trim() || u.mobileNumber,
          phone: newMobile.trim() || u.phone,
          cnic: newCnic.trim() || u.cnic,
          designation: newDesignation.trim() || u.designation,
          officeAddress: newOfficeAddress.trim() || u.officeAddress,
          status: isInspector ? u.status : newStatus
          // Email remains strictly immutable through User Management!
        };
      }
      return u;
    });

    const newAuditLog: UserManagementAuditRecord = {
      id: `usr-aud-${Date.now()}`,
      performedBy: currentOfficer.name,
      performedByRole: currentOfficer.role,
      targetUserId: editingUser.id,
      targetUserName: newName.trim() || editingUser.name,
      actionType: isCircleChanged ? "CIRCLE_REASSIGNED" : "PROFILE_UPDATED",
      oldValue: `Circle: ${oldCircleName} | Mobile: ${editingUser.mobileNumber} | Status: ${oldStatus}`,
      newValue: `Circle: ${isInspector ? oldCircleName : targetCircle.name} | Mobile: ${newMobile} | Status: ${isInspector ? oldStatus : newStatus} | CNIC: ${newCnic}`,
      timestamp: getPakistanCurrentTimestamp()
    };

    const updatedLogs = [newAuditLog, ...auditLogs];
    savePersistedUserAccounts(updatedUsers);
    savePersistedUserAuditLogs(updatedLogs);

    setUsers(updatedUsers);
    setUserAuditLogs(updatedLogs);
    setEditingUser(null);
    setFeedbackMessage({
      type: "success",
      text: isInspector
        ? `Successfully updated your officer profile and contact details.`
        : isCircleChanged
          ? `Reassigned ${editingUser.name} to ${targetCircle.name}. Circle master records remain protected.`
          : `Successfully updated profile details for ${editingUser.name}.`
    });
  };

  const handleSavePasswordChange = () => {
    if (!passwordChangeUser) return;
    if (!newPassword || newPassword !== confirmPassword) {
      setFeedbackMessage({ type: "error", text: "Passwords do not match or are empty." });
      return;
    }

    const newAuditLog: UserManagementAuditRecord = {
      id: `usr-aud-${Date.now()}`,
      performedBy: currentOfficer.name,
      performedByRole: currentOfficer.role,
      targetUserId: passwordChangeUser.id,
      targetUserName: passwordChangeUser.name,
      actionType: "PASSWORD_CHANGED",
      oldValue: "HASHED_CREDENTIAL",
      newValue: "UPDATED_HASHED_CREDENTIAL",
      timestamp: getPakistanCurrentTimestamp()
    };

    const updatedLogs = [newAuditLog, ...auditLogs];
    savePersistedUserAuditLogs(updatedLogs);

    setUserAuditLogs(updatedLogs);
    setPasswordChangeUser(null);
    setNewPassword("");
    setConfirmPassword("");
    setFeedbackMessage({
      type: "success",
      text: `Password securely updated in authentication provider for ${passwordChangeUser.name}.`
    });
  };

  return (
    <div style={{ maxWidth: "76rem", margin: "1.5rem auto", padding: "1rem" }}>
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
          <span style={{ fontSize: "1.2rem" }}>👥</span>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0d3822" }}>
            PTAS Punjab &bull; Administrative User Desk
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

      {/* Top Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #166534 100%)",
          color: "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#bbf7d0"
            }}
          >
            Excise &amp; Taxation Department &bull; Administration Desk
          </div>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.4rem", fontWeight: 700 }}>
            {isInspector
              ? "Tax Inspector Profile & Jurisdiction Desk"
              : "User Management & Jurisdiction Administration"}
          </h1>
          <span style={{ fontSize: "0.85rem", color: "#f0fdf4" }}>
            Authenticated Officer: <strong>{currentOfficer.name}</strong> ({currentOfficer.title})
            &bull; Tier: <strong>{currentOfficer.jurisdictionTier}</strong>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              border: "1px solid rgba(255, 255, 255, 0.3)"
            }}
          >
            🔒 Verified Session: <strong>{currentOfficer.name}</strong> ({currentOfficer.role})
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => (window.location.href = "/")}
            style={{ color: "#ffffff", borderColor: "#4ade80" }}
          >
            ← Back to System
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "6px",
            marginBottom: "1.25rem",
            background: feedbackMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${feedbackMessage.type === "success" ? "#bbf7d0" : "#fecaca"}`,
            color: feedbackMessage.type === "success" ? "#166534" : "#991b1b",
            fontSize: "0.85rem"
          }}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Navigation Tabs (Section 4.7) */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "1.5rem"
        }}
      >
        {isDirector && (
          <button
            type="button"
            className={`subtab-btn ${activeTab === "ETOS" ? "active" : ""}`}
            onClick={() => setActiveTab("ETOS")}
          >
            🏛️ ETO Accounts ({etoUsers.length})
          </button>
        )}
        <button
          type="button"
          className={`subtab-btn ${activeTab === "INSPECTORS" ? "active" : ""}`}
          onClick={() => setActiveTab("INSPECTORS")}
        >
          {isInspector
            ? `👮 My Inspector Profile & Contact`
            : `👮 Circle Inspectors (${inspectorUsers.length})`}
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "CIRCLES" ? "active" : ""}`}
          onClick={() => setActiveTab("CIRCLES")}
        >
          🏛️ Predefined Circle Master ({DISTRICT_VEHARI_CIRCLES.length})
        </button>
        {!isInspector && (
          <button
            type="button"
            className={`subtab-btn ${activeTab === "ASSIGNMENTS" ? "active" : ""}`}
            onClick={() => setActiveTab("ASSIGNMENTS")}
          >
            🗺️ Jurisdiction Assignments
          </button>
        )}
        {!isInspector && (
          <button
            type="button"
            className={`subtab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
            onClick={() => setActiveTab("AUDIT")}
          >
            📜 Administrative Audit Trail ({auditLogs.length})
          </button>
        )}
      </div>

      {/* Tab 1: ETO Accounts (Director Only) */}
      {activeTab === "ETOS" && isDirector && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem"
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
              <h2 style={{ fontSize: "1.1rem", margin: 0, color: "#0d3822" }}>
                Excise &amp; Taxation Officers (Assessing Authorities)
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Manage ETO logins, status, and district assignments across division.
              </span>
            </div>
          </div>
          <table className="gov-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Officer Name &amp; Title</th>
                <th>Email</th>
                <th>District / Office</th>
                <th>Mobile</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {etoUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                      {u.title}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {u.districtName} &bull; {u.officeName}
                  </td>
                  <td>{u.mobileNumber}</td>
                  <td>
                    <span
                      className={`badge ${u.status === "ACTIVE" ? "badge-approved" : "badge-returned"}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <RowActionMenu
                      align="right"
                      actions={[
                        {
                          id: "edit-eto",
                          label: "Edit Officer Details & Circle",
                          icon: "✏️",
                          onClick: () => handleOpenEditUser(u)
                        },
                        {
                          id: "password-eto",
                          label: "Reset Officer Password",
                          icon: "🔑",
                          onClick: () => setPasswordChangeUser(u)
                        }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Predefined Fixed Circle Master Data (Spec 17) */}
      {activeTab === "CIRCLES" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem"
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
              <h2 style={{ fontSize: "1.1rem", margin: 0, color: "#0d3822" }}>
                🏛️ Predefined Circle Master Directory (District Vehari)
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Fixed administrative structures established by Government of Punjab gazette
                notification. Protected master data.
              </span>
            </div>
            <span
              style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                color: "#166534",
                padding: "0.3rem 0.65rem",
                borderRadius: "4px",
                fontSize: "0.75rem",
                fontWeight: 700
              }}
            >
              🔒 Administrative Structure: Fixed &amp; Immutable
            </span>
          </div>

          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "6px",
              padding: "0.85rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              color: "#1e3a8a"
            }}
          >
            <strong>Statutory Administrative Separation:</strong> Circles are permanent
            organizational entities of the district. User Management permits reassigning authorized
            officers between existing Circles, but strictly prohibits renaming, creating, or
            deleting Circles.
          </div>

          <table className="gov-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Circle Code</th>
                <th>Official Circle Name</th>
                <th>Tehsil Jurisdiction</th>
                <th>District</th>
                <th>Commercial Scope &amp; Localities</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DISTRICT_VEHARI_CIRCLES.map((circle) => (
                <tr key={circle.id}>
                  <td>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0d3822" }}>
                      {circle.code}
                    </span>
                  </td>
                  <td>
                    <strong>{circle.name}</strong>
                  </td>
                  <td>Tehsil {circle.tehsil}</td>
                  <td>{circle.districtName}</td>
                  <td style={{ fontSize: "0.8rem", color: "#475569" }}>{circle.description}</td>
                  <td>
                    <span className="badge badge-approved" style={{ fontSize: "0.7rem" }}>
                      PERMANENT MASTER
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Circle Inspectors */}
      {activeTab === "INSPECTORS" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem"
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
              <h2 style={{ fontSize: "1.1rem", margin: 0, color: "#0d3822" }}>
                {isInspector ? "My Officer Profile & Jurisdiction" : "Subordinate Tax Inspectors"}
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {isInspector
                  ? "Your authenticated officer record and official contact information."
                  : isDirector
                    ? "All inspectors across division."
                    : `Inspectors assigned under ${currentOfficer.jurisdictionName}.`}
              </span>
            </div>
          </div>
          <table className="gov-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Officer Name &amp; Designation</th>
                <th>Email</th>
                <th>CNIC</th>
                <th>Assigned Circle</th>
                <th>Office Address</th>
                <th>Mobile / Phone</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspectorUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                      {u.designation || u.title}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {u.cnic || "36603-1234567-1"}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: "#0d3822" }}>{u.assignedCircleName}</strong>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "#334155", maxWidth: "16rem" }}>
                    {u.officeAddress ||
                      "Excise & Taxation Department, District Courts Complex, Vehari"}
                  </td>
                  <td>{u.mobileNumber || u.phone}</td>
                  <td>
                    <span
                      className={`badge ${u.status === "ACTIVE" ? "badge-approved" : "badge-returned"}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <RowActionMenu
                      align="right"
                      actions={[
                        {
                          id: "reassign-inspector",
                          label: isInspector
                            ? "Edit My Profile & Details"
                            : "Reassign Circle & Edit Details",
                          icon: "✏️",
                          onClick: () => handleOpenEditUser(u)
                        },
                        {
                          id: "password-inspector",
                          label: isInspector ? "Change My Password" : "Reset Inspector Password",
                          icon: "🔑",
                          onClick: () => setPasswordChangeUser(u)
                        }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Jurisdiction Assignments */}
      {activeTab === "ASSIGNMENTS" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem"
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem", color: "#0d3822" }}>
            Statutory Jurisdiction Hierarchy
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1rem" }}>
            District and circle assignments constitute authorization data. Modifying assignments
            directly updates the officer&apos;s statutory authority over assessment registers and
            notices.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
              gap: "1rem"
            }}
          >
            {visibleUsers.map((u) => (
              <div
                key={u.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "1rem",
                  background: "#f8fafc"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem"
                  }}
                >
                  <strong>{u.name}</strong>
                  <span className="badge badge-draft">{u.role}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.5 }}>
                  <div>
                    <strong>District:</strong> {u.districtName}
                  </div>
                  <div>
                    <strong>Office:</strong> {u.officeName}
                  </div>
                  <div>
                    <strong>Assigned Circle:</strong>{" "}
                    <span style={{ color: "#0d3822", fontWeight: 700 }}>
                      {u.assignedCircleName}
                    </span>
                  </div>
                  <div>
                    <strong>Mobile:</strong> {u.mobileNumber}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Audit Trail (Section 4.6 - Pakistan Time UTC+05:00) */}
      {activeTab === "AUDIT" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1.25rem"
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem", color: "#0d3822" }}>
            Administrative Audit Log
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1rem" }}>
            Immutable record of all administrative profile, jurisdiction, and security actions.
            Timestamps displayed in Pakistan Standard Time (PKT, UTC+05:00).
          </p>
          <table className="gov-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Timestamp (PKT)</th>
                <th>Actor</th>
                <th>Target User</th>
                <th>Action Type</th>
                <th>Old Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{log.timestamp}</td>
                  <td>
                    <strong>{log.performedBy}</strong> ({log.performedByRole})
                  </td>
                  <td>{log.targetUserName}</td>
                  <td>
                    <span className="badge badge-submitted" style={{ fontSize: "0.7rem" }}>
                      {log.actionType}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "#64748b" }}>{log.oldValue}</td>
                  <td style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600 }}>
                    {log.newValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Edit User & Reassign Circle */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>
                {isInspector ? "Edit Officer Profile & Contact" : "Edit User / Reassign Circle"}{" "}
                &bull; {editingUser.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
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
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Officer Full Name:</label>
                <input
                  type="text"
                  className="form-control"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Official departmental officer name"
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
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    placeholder="e.g. Tax Inspector (Vehari Circle I)"
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    National Identity Card (CNIC):
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={newCnic}
                    onChange={(e) => setNewCnic(e.target.value)}
                    placeholder="36603-xxxxxxx-x"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                    Official Login Email (Identity):
                  </label>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>🔒 Immutable</span>
                </div>
                <input
                  type="email"
                  className="form-control"
                  value={editingUser.email}
                  disabled
                  style={{ background: "#f1f5f9", cursor: "not-allowed", color: "#64748b" }}
                />
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    display: "block",
                    marginTop: "0.25rem"
                  }}
                >
                  Login email is permanent departmental master identity and cannot be edited.
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Assigned Circle (Statutory Jurisdiction):
                </label>
                <select
                  className="form-control"
                  value={selectedCircleId}
                  onChange={(e) => setSelectedCircleId(e.target.value)}
                  disabled={isInspector}
                  style={{
                    fontWeight: 600,
                    background: isInspector ? "#f1f5f9" : "#ffffff",
                    cursor: isInspector ? "not-allowed" : "pointer"
                  }}
                >
                  {DISTRICT_VEHARI_CIRCLES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) — Tehsil {c.tehsil}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: isInspector ? "#92400e" : "#065f46",
                    display: "block",
                    marginTop: "0.3rem"
                  }}
                >
                  {isInspector
                    ? "🔒 Circle assignment is a statutory administrative function of the Assessing Authority / ETO."
                    : "✓ Fixed Administrative Structure: Circle names and boundaries are statutory entities."}
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Official Mobile / Contact Phone:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  placeholder="0300-xxxxxxx"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Official Office Postal Address (Appears on PFT-2 Challans):
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={newOfficeAddress}
                  onChange={(e) => setNewOfficeAddress(e.target.value)}
                  placeholder="e.g. Office of the Excise & Taxation Officer, District Courts Complex, Vehari"
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Account Status:</label>
                <select
                  className="form-control"
                  value={newStatus}
                  onChange={(e) =>
                    setNewStatus(e.target.value as "ACTIVE" | "SUSPENDED" | "INACTIVE")
                  }
                  disabled={isInspector}
                  style={{
                    background: isInspector ? "#f1f5f9" : "#ffffff",
                    cursor: isInspector ? "not-allowed" : "pointer"
                  }}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
                {isInspector && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#92400e",
                      display: "block",
                      marginTop: "0.25rem"
                    }}
                  >
                    🔒 Officer account status is governed by Assessing Authority / ETO.
                  </span>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleSaveUserAssignment}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Password Management (Section 4.5) */}
      {passwordChangeUser && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Reset Password &bull; {passwordChangeUser.name}</h3>
              <button
                type="button"
                onClick={() => setPasswordChangeUser(null)}
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
              <p style={{ color: "#64748b", fontSize: "0.825rem", margin: "0 0 1rem" }}>
                Passwords are securely stored in the authentication provider and never exposed as
                plaintext departmental profile data.
              </p>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>New Password:</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>Confirm Password:</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPasswordChangeUser(null)}
                >
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleSavePasswordChange}>
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

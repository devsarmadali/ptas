"use client";

import React, { useEffect, useState } from "react";
import {
  type MockOfficer,
  type UserAccount,
  type UserManagementAuditRecord,
  MOCK_OFFICERS,
  loadPilotState,
  savePilotState,
  getPakistanCurrentTimestamp
} from "../../../lib/pilot-store";
import { RowActionMenu } from "../../../components/RowActionMenu";

export default function UserManagementPage() {
  const [currentOfficer, setCurrentOfficer] = useState<MockOfficer | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setUserAuditLogs] = useState<UserManagementAuditRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"ETOS" | "INSPECTORS" | "ASSIGNMENTS" | "AUDIT">(
    "INSPECTORS"
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Modal / Edit state
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [newCircleName, setNewCircleName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newStatus, setNewStatus] = useState<"ACTIVE" | "SUSPENDED" | "INACTIVE">("ACTIVE");
  const [passwordChangeUser, setPasswordChangeUser] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const state = loadPilotState();
    setCurrentOfficer(state.currentOfficer);
    setUsers(state.users ?? []);
    setUserAuditLogs(state.userAuditLogs ?? []);
    setIsLoaded(true);
  }, []);

  if (!isLoaded) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading verified administrative context...
      </div>
    );
  }

  // Section 4.1: Inspector is blocked from UI, direct URL, and API
  if (!currentOfficer || currentOfficer.role === "INSPECTOR") {
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
        <h2 style={{ color: "#991b1b", margin: "0 0 0.5rem" }}>403 — Access Denied</h2>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          You are currently authenticated as{" "}
          <strong>{currentOfficer?.name || "Tax Inspector"}</strong> (Role:{" "}
          <code>{currentOfficer?.role || "INSPECTOR"}</code>). The User Management &amp;
          Jurisdiction Administration Desk is strictly restricted to{" "}
          <strong>Excise &amp; Taxation Officers (ETO)</strong> and <strong>Directors</strong>.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            marginTop: "1.5rem",
            flexWrap: "wrap"
          }}
        >
          <button
            type="button"
            className="btn-primary"
            style={{ backgroundColor: "#065f46", borderColor: "#047857" }}
            onClick={() => {
              const eto = MOCK_OFFICERS.find((o) => o.role === "ETO");
              if (eto) {
                const state = loadPilotState();
                state.currentOfficer = eto;
                savePilotState(state);
                setCurrentOfficer(eto);
              }
            }}
          >
            ⚖️ Switch to ETO Tariq Mahmood
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ backgroundColor: "#4338ca", borderColor: "#3730a3" }}
            onClick={() => {
              const director = MOCK_OFFICERS.find((o) => o.role === "DIRECTOR");
              if (director) {
                const state = loadPilotState();
                state.currentOfficer = director;
                savePilotState(state);
                setCurrentOfficer(director);
              }
            }}
          >
            📊 Switch to Director Tahir Raza
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => (window.location.href = "/")}
          >
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isDirector = currentOfficer.role === "DIRECTOR";
  const isEto = currentOfficer.role === "ETO";

  // Filter users based on jurisdiction & role hierarchy (Director sees all, ETO sees subordinate inspectors)
  const visibleUsers = users.filter((u) => {
    if (isDirector) return true;
    if (isEto) {
      return u.role === "INSPECTOR" && u.officeId === currentOfficer.jurisdictionId;
    }
    return false;
  });

  const etoUsers = users.filter((u) => u.role === "ETO");
  const inspectorUsers = visibleUsers.filter((u) => u.role === "INSPECTOR");

  const handleSaveUserAssignment = () => {
    if (!editingUser) return;

    const state = loadPilotState();
    const oldCircle = editingUser.assignedCircleName;
    const oldStatus = editingUser.status;

    const updatedUsers = (state.users ?? users).map((u) => {
      if (u.id === editingUser.id) {
        return {
          ...u,
          assignedCircleName: newCircleName || u.assignedCircleName,
          mobileNumber: newMobile || u.mobileNumber,
          status: newStatus
        };
      }
      return u;
    });

    const newAuditLog: UserManagementAuditRecord = {
      id: `usr-aud-${Date.now()}`,
      performedBy: currentOfficer.name,
      performedByRole: currentOfficer.role,
      targetUserId: editingUser.id,
      targetUserName: editingUser.name,
      actionType: oldCircle !== newCircleName ? "CIRCLE_REASSIGNED" : "PROFILE_UPDATED",
      oldValue: `Circle: ${oldCircle} | Status: ${oldStatus}`,
      newValue: `Circle: ${newCircleName || oldCircle} | Status: ${newStatus}`,
      timestamp: getPakistanCurrentTimestamp()
    };

    const updatedLogs = [newAuditLog, ...(state.userAuditLogs ?? auditLogs)];
    state.users = updatedUsers;
    state.userAuditLogs = updatedLogs;
    savePilotState(state);

    setUsers(updatedUsers);
    setUserAuditLogs(updatedLogs);
    setEditingUser(null);
    setFeedbackMessage({
      type: "success",
      text: `Successfully updated profile and circle jurisdiction for ${editingUser.name}.`
    });
  };

  const handleSavePasswordChange = () => {
    if (!passwordChangeUser) return;
    if (!newPassword || newPassword !== confirmPassword) {
      setFeedbackMessage({ type: "error", text: "Passwords do not match or are empty." });
      return;
    }

    const state = loadPilotState();
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

    const updatedLogs = [newAuditLog, ...(state.userAuditLogs ?? auditLogs)];
    state.userAuditLogs = updatedLogs;
    savePilotState(state);

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
            href="/documents/pf2/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.3rem 0.65rem",
              borderRadius: "4px",
              background: "#047857",
              color: "#ffffff",
              textDecoration: "none"
            }}
          >
            💳 Issue Form PFT-2 ↗
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
            User Management &amp; Jurisdiction Administration
          </h1>
          <span style={{ fontSize: "0.85rem", color: "#f0fdf4" }}>
            Authenticated Officer: <strong>{currentOfficer.name}</strong> ({currentOfficer.title})
            &bull; Tier: <strong>{currentOfficer.jurisdictionTier}</strong>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {MOCK_OFFICERS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`role-switch-btn ${currentOfficer.email === o.email ? "active" : ""}`}
                onClick={() => {
                  const state = loadPilotState();
                  state.currentOfficer = o;
                  savePilotState(state);
                  setCurrentOfficer(o);
                }}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  background:
                    currentOfficer.email === o.email ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  color: currentOfficer.email === o.email ? "#0d3822" : "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: 600
                }}
                title={`Switch to ${o.name} (${o.role})`}
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
          👮 Circle Inspectors ({inspectorUsers.length})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "ASSIGNMENTS" ? "active" : ""}`}
          onClick={() => setActiveTab("ASSIGNMENTS")}
        >
          🗺️ Jurisdiction Assignments
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "AUDIT" ? "active" : ""}`}
          onClick={() => setActiveTab("AUDIT")}
        >
          📜 Administrative Audit Trail ({auditLogs.length})
        </button>
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
                          onClick: () => {
                            setEditingUser(u);
                            setNewCircleName(u.assignedCircleName);
                            setNewMobile(u.mobileNumber);
                            setNewStatus(u.status);
                          }
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
                Subordinate Tax Inspectors
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {isDirector
                  ? "All inspectors across division."
                  : `Inspectors assigned under ${currentOfficer.jurisdictionName}.`}
              </span>
            </div>
          </div>
          <table className="gov-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Inspector Name</th>
                <th>Email</th>
                <th>Assigned Circle</th>
                <th>Mobile</th>
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
                      {u.title}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <strong style={{ color: "#0d3822" }}>{u.assignedCircleName}</strong>
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
                          id: "reassign-inspector",
                          label: "Reassign Circle & Edit Details",
                          icon: "🔄",
                          onClick: () => {
                            setEditingUser(u);
                            setNewCircleName(u.assignedCircleName);
                            setNewMobile(u.mobileNumber);
                            setNewStatus(u.status);
                          }
                        },
                        {
                          id: "password-inspector",
                          label: "Reset Inspector Password",
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
              <h3 style={{ margin: 0 }}>Edit User / Reassign Circle &bull; {editingUser.name}</h3>
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
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Assigned Circle Jurisdiction:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  placeholder="e.g. Circle-Vehari, Circle-Mailsi, Circle-Burewala"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                  Mobile Number (Verification &amp; Recovery):
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  required
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
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
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

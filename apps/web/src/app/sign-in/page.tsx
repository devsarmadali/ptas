"use client";

import React, { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OFFICIAL_OFFICERS_REGISTRY,
  type OfficerCredentialInfo,
  signInOfficer
} from "../../lib/supabase-auth";
import {
  loadPilotState,
  savePilotState,
  setCurrentOfficerInStore,
  type PilotAuditItem
} from "../../lib/pilot-store";

const asRoute = (path: string): Route => path as unknown as Route;

export default function SignInPage() {
  const router = useRouter();

  // Default selected role: Tax Inspector (first officer)
  const [selectedOfficer, setSelectedOfficer] = useState<OfficerCredentialInfo>(
    OFFICIAL_OFFICERS_REGISTRY[0]!
  );
  const [email, setEmail] = useState(OFFICIAL_OFFICERS_REGISTRY[0]!.email);
  const [password, setPassword] = useState(OFFICIAL_OFFICERS_REGISTRY[0]!.defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle selecting one of the 3 pre-filled roles
  const handleSelectRole = (officer: OfficerCredentialInfo) => {
    setSelectedOfficer(officer);
    setEmail(officer.email);
    setPassword(officer.defaultPassword);
    setErrorMessage(null);
  };

  const executeSignIn = async (targetEmail: string, targetPassword: string) => {
    setIsAuthenticating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await signInOfficer(targetEmail, targetPassword);
      if (result.success && result.officer) {
        // Update persistent store
        setCurrentOfficerInStore(result.officer);

        // Record official audit log
        try {
          const state = loadPilotState();
          const auditItem: PilotAuditItem = {
            id: `audit-auth-${Date.now()}`,
            eventType: "OFFICER_SESSION_ESTABLISHED",
            actorName: result.officer.name,
            actorRole: result.officer.role,
            target: `${result.officer.name} (${result.officer.email})`,
            timestamp: new Date().toISOString(),
            correlationId: `corr-auth-${Date.now()}`,
            details: `Official statutory session established via Sign In Portal for ${result.officer.name} (${result.officer.title}).`
          };
          state.auditLogs = [auditItem, ...(state.auditLogs || [])];
          savePilotState(state);
        } catch (e) {
          console.warn("Could not log sign-in audit event", e);
        }

        setSuccessMessage(
          `Authenticated as ${result.officer.name} (${result.officer.role}). Redirecting...`
        );
        if (typeof window !== "undefined") {
          window.location.href = "/assessment/pft3";
        } else {
          router.push(asRoute("/assessment/pft3"));
        }
      } else {
        setErrorMessage(result.message || "Invalid officer credentials.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Authentication failed: ${msg}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSignIn(email, password);
  };

  const handleInstantSignIn = (officer: OfficerCredentialInfo) => {
    handleSelectRole(officer);
    void executeSignIn(officer.email, officer.defaultPassword);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 40%, #e2e8f0 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)"
      }}
    >
      {/* Top Government Ribbon */}
      <header
        style={{
          background: "linear-gradient(135deg, #0d3822 0%, #134e2c 60%, #1e3a8a 100%)",
          color: "#ffffff",
          padding: "1rem 2rem",
          borderBottom: "3px solid #b45309",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)"
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <span style={{ fontSize: "2rem" }}>🏛️</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    background: "#059669",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px"
                  }}
                >
                  Government of the Punjab
                </span>
                <span style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                  Excise, Taxation &amp; Narcotics Control Department
                </span>
              </div>
              <h1
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em"
                }}
              >
                Punjab Professional Tax Administration System (PTAS)
              </h1>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link
              href={asRoute("/verify")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.4rem 0.85rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#f8fafc",
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                borderRadius: "6px",
                textDecoration: "none",
                transition: "all 0.15s ease"
              }}
              title="Citizen Public Verification Portal"
            >
              <span>🔍</span>
              <span>Citizen Verification Portal ↗</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          maxWidth: "1140px",
          width: "100%",
          margin: "2rem auto",
          padding: "0 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem"
        }}
      >
        {/* Title & Statutory Banner */}
        <div style={{ textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              background: "#dcfce7",
              color: "#166534",
              border: "1px solid #86efac",
              padding: "0.25rem 0.75rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.5rem"
            }}
          >
            Official Officer Authentication Portal
          </span>
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em"
            }}
          >
            Statutory Role Sign In &amp; Access Control
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              color: "#475569",
              maxWidth: "46rem",
              marginLeft: "auto",
              marginRight: "auto"
            }}
          >
            Select any of the official departmental roles below (including Provincial Administrator
            with full authorities) to immediately authenticate with certified jurisdiction powers
            under Section 3 of the Punjab Finance Act 1977.
          </p>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: "8px",
              padding: "0.85rem 1.25rem",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              boxShadow: "0 2px 4px rgba(239, 68, 68, 0.08)"
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              borderRadius: "8px",
              padding: "0.85rem 1.25rem",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              boxShadow: "0 2px 4px rgba(34, 197, 94, 0.08)"
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>✓</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Section 1: Pre-filled Role Selector Cards */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.75rem"
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#1e293b",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              <span>1. Choose an Official Role (Pre-filled Credentials)</span>
            </h3>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Click any card to select &amp; pre-fill credentials
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
              gap: "1rem"
            }}
          >
            {OFFICIAL_OFFICERS_REGISTRY.map((info) => {
              const isSelected = selectedOfficer.email === info.email;
              const roleColor =
                info.role === "INSPECTOR"
                  ? { bg: "#e0f2fe", text: "#0369a1", border: "#7dd3fc", accent: "#0284c7" }
                  : info.role === "ETO"
                    ? { bg: "#fef3c7", text: "#92400e", border: "#fde68a", accent: "#d97706" }
                    : info.role === "DIRECTOR"
                      ? { bg: "#f3e8ff", text: "#6b21a8", border: "#d8b4fe", accent: "#9333ea" }
                      : { bg: "#fce7f3", text: "#831843", border: "#fbcfe8", accent: "#be185d" };

              return (
                <div
                  key={info.id}
                  onClick={() => handleSelectRole(info)}
                  style={{
                    cursor: "pointer",
                    border: isSelected ? "2px solid #059669" : "1px solid #cbd5e1",
                    background: isSelected ? "#f0fdf4" : "#ffffff",
                    borderRadius: "10px",
                    padding: "1.15rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                    transition: "all 0.15s ease",
                    boxShadow: isSelected
                      ? "0 8px 16px -2px rgba(5, 150, 105, 0.16), 0 0 0 1px #059669"
                      : "0 2px 4px rgba(0, 0, 0, 0.04)"
                  }}
                >
                  <div>
                    {/* Header Row: Role Badge & Active Indicator */}
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
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          background: roleColor.bg,
                          color: roleColor.text,
                          border: `1px solid ${roleColor.border}`
                        }}
                      >
                        {info.role} • {info.jurisdictionTier}
                      </span>
                      {isSelected && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "#059669",
                            background: "#dcfce7",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "9999px",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem"
                          }}
                        >
                          <span>✓</span> Selected
                        </span>
                      )}
                    </div>

                    {/* Officer Name & Title */}
                    <h4
                      style={{
                        margin: "0 0 0.2rem",
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        color: "#0f172a"
                      }}
                    >
                      {info.name}
                    </h4>
                    <p
                      style={{
                        margin: "0 0 0.65rem",
                        fontSize: "0.8rem",
                        color: "#475569",
                        lineHeight: 1.3
                      }}
                    >
                      {info.title} &bull; <strong>{info.jurisdictionName}</strong>
                    </p>

                    {/* Credentials Preview Pill */}
                    <div
                      style={{
                        background: isSelected ? "#ffffff" : "#f8fafc",
                        border: "1px dashed #cbd5e1",
                        borderRadius: "6px",
                        padding: "0.5rem 0.65rem",
                        marginBottom: "0.85rem",
                        fontSize: "0.75rem",
                        fontFamily: "monospace"
                      }}
                    >
                      <div style={{ color: "#334155", marginBottom: "0.2rem" }}>
                        <span style={{ color: "#64748b" }}>User:</span> {info.email}
                      </div>
                      <div style={{ color: "#334155" }}>
                        <span style={{ color: "#64748b" }}>Pass:</span> {info.defaultPassword}
                      </div>
                    </div>

                    {/* Statutory Powers List */}
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      <strong style={{ color: "#334155" }}>Key Statutory Powers:</strong>
                      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.4 }}>
                        {info.statutoryPowers.slice(0, 2).map((power, idx) => (
                          <li key={idx}>{power}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Instant Sign In Button */}
                  <div
                    style={{
                      marginTop: "1rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid #e2e8f0"
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstantSignIn(info);
                      }}
                      disabled={isAuthenticating}
                      className="btn-primary btn-sm"
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.75rem",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        background: isSelected
                          ? "linear-gradient(135deg, #0d3822 0%, #059669 100%)"
                          : "#334155",
                        borderColor: isSelected ? "#059669" : "#334155",
                        color: "#ffffff"
                      }}
                    >
                      <span>⚡</span>
                      <span>One-Click Sign In as {info.role}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Active Credential Sign In Form */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "1.5rem",
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.05)"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              borderBottom: "1px solid #f1f5f9",
              paddingBottom: "0.75rem"
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}
              >
                <span>🔐 2. Review Credentials &amp; Sign In</span>
              </h3>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Credentials pre-filled from your selection above. You may also enter custom
                departmental credentials.
              </p>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "#f1f5f9",
                padding: "0.25rem 0.65rem",
                borderRadius: "6px",
                fontSize: "0.75rem",
                color: "#334155"
              }}
            >
              <span>Selected Role:</span>
              <strong style={{ color: "#0d3822" }}>
                {selectedOfficer.name} ({selectedOfficer.role})
              </strong>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.25rem"
              }}
            >
              {/* Email / Username Field */}
              <div>
                <label
                  htmlFor="officer-email"
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "0.35rem"
                  }}
                >
                  Official Email / Username:
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.95rem",
                      color: "#64748b"
                    }}
                  >
                    📧
                  </span>
                  <input
                    id="officer-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. inspector.vehari@punjab.gov.pk"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem 0.6rem 2.3rem",
                      fontSize: "0.85rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      background: "#ffffff",
                      color: "#0f172a",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label
                  htmlFor="officer-password"
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "0.35rem"
                  }}
                >
                  Password:
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.95rem",
                      color: "#64748b"
                    }}
                  >
                    🔒
                  </span>
                  <input
                    id="officer-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter official password"
                    style={{
                      width: "100%",
                      padding: "0.6rem 4.5rem 0.6rem 2.3rem",
                      fontSize: "0.85rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      background: "#ffffff",
                      color: "#0f172a",
                      boxSizing: "border-box"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: "absolute",
                      right: "0.5rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      fontSize: "0.75rem",
                      color: "#0369a1",
                      cursor: "pointer",
                      padding: "0.2rem 0.4rem",
                      fontWeight: 600
                    }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Active Jurisdiction:{" "}
                  <strong>
                    {selectedOfficer.jurisdictionName} ({selectedOfficer.jurisdictionTier})
                  </strong>
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="btn-primary"
                  style={{
                    padding: "0.65rem 1.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #0d3822 0%, #15803d 100%)",
                    borderColor: "#0d3822",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: isAuthenticating ? "not-allowed" : "pointer"
                  }}
                >
                  {isAuthenticating ? (
                    <>
                      <span>⏳</span>
                      <span>Authenticating Officer...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In as {selectedOfficer.role}</span>
                      <span>➔</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: "#0f172a",
          color: "#94a3b8",
          padding: "1.25rem 2rem",
          fontSize: "0.78rem",
          borderTop: "1px solid #1e293b",
          textAlign: "center"
        }}
      >
        <div style={{ maxWidth: "1440px", margin: "0 auto" }}>
          <p style={{ margin: "0 0 0.35rem" }}>
            Punjab Professional Tax Administration System (PTAS) &bull; Governed under the Punjab
            Finance Act 1977
          </p>
          <p style={{ margin: 0, color: "#64748b" }}>
            Official use only. All login events and statutory state modifications are audited with
            cryptographic SHA-256 fingerprinting.
          </p>
        </div>
      </footer>
    </div>
  );
}

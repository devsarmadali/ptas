"use client";

import React, { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getPasswordResetRedirectUrl,
  getSupabaseAuthClient,
  signInOfficer
} from "../../lib/supabase-auth";

const asRoute = (path: string): Route => path as unknown as Route;

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await signInOfficer(email, password);
      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }
      setStatusMessage(
        `Authenticated as ${result.officer.name} (${result.officer.role}) for ${result.officer.jurisdictionName}.`
      );
      router.push(asRoute("/assessment/pft3"));
    } catch {
      setErrorMessage("Authentication failed. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePasswordSetup = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setErrorMessage("Enter your email address before requesting a password setup link.");
      return;
    }
    setIsSendingReset(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const supabase = getSupabaseAuthClient();
      const redirectTo = getPasswordResetRedirectUrl(window.location.origin);
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) throw error;
      setStatusMessage(
        "If this email is registered, Supabase has sent a password setup link. Check the inbox and spam folder."
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "The password setup email could not be sent. Please wait and retry or contact the PTAS administrator.";
      setErrorMessage(msg);
    } finally {
      setIsSendingReset(false);
    }
  };

  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background: "linear-gradient(180deg, #ecfdf5 0%, #f8fafc 52%, #e2e8f0 100%)"
      }}
    >
      <section
        aria-labelledby="sign-in-heading"
        style={{
          width: "min(100%, 32rem)",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.12)",
          overflow: "hidden"
        }}
      >
        <header
          style={{
            padding: "1.5rem",
            color: "#ffffff",
            background: "linear-gradient(135deg, #0d3822 0%, #134e2c 55%, #1e3a8a 100%)",
            borderBottom: "3px solid #b45309"
          }}
        >
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 700 }}>
            GOVERNMENT OF THE PUNJAB
          </p>
          <h1 id="sign-in-heading" style={{ margin: 0, fontSize: "1.4rem" }}>
            PTAS Officer Sign In
          </h1>
          <p style={{ margin: "0.5rem 0 0", color: "#d1fae5", fontSize: "0.85rem" }}>
            Use the email registered in Supabase Auth. Your role and jurisdiction are resolved from
            the server after authentication.
          </p>
        </header>

        <div style={{ padding: "1.5rem" }}>
          {!isConfigured && (
            <div
              role="alert"
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                border: "1px solid #fed7aa",
                borderRadius: "6px",
                color: "#9a3412",
                background: "#fff7ed",
                fontSize: "0.85rem",
                lineHeight: "1.4"
              }}
            >
              <strong>Configuration Notice:</strong> Supabase authentication is not configured on
              this deployment. Please add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your Vercel Project Settings &gt;
              Environment Variables.
            </div>
          )}
          {errorMessage && (
            <div
              id="sign-in-error"
              role="alert"
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                color: "#991b1b",
                background: "#fef2f2"
              }}
            >
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div
              role="status"
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                border: "1px solid #bbf7d0",
                borderRadius: "6px",
                color: "#166534",
                background: "#f0fdf4"
              }}
            >
              {statusMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="officer-email">Email address</label>
              <input
                id="officer-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="form-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={errorMessage ? "sign-in-error" : undefined}
                placeholder="name@example.com"
              />
            </div>

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label htmlFor="officer-password">Password</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  id="officer-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="form-control"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={errorMessage ? "sign-in-error" : undefined}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: "1.25rem" }}
            >
              {isAuthenticating ? "Verifying…" : "Sign in with Supabase Auth"}
            </button>

            <button
              type="button"
              disabled={isSendingReset}
              className="btn-secondary"
              onClick={() => void handlePasswordSetup()}
              style={{ width: "100%", justifyContent: "center", marginTop: "0.75rem" }}
            >
              {isSendingReset ? "Sending…" : "Set or reset password"}
            </button>
          </form>

          <p style={{ margin: "1rem 0 0", color: "#64748b", fontSize: "0.78rem" }}>
            An email address alone grants no PTAS access. Authentication must succeed and an active
            role-and-jurisdiction assignment must exist in the database.
          </p>

          <Link
            href={asRoute("/verify")}
            style={{ display: "inline-block", marginTop: "1rem", fontSize: "0.82rem" }}
          >
            Open citizen document verification
          </Link>
        </div>
      </section>
    </main>
  );
}

"use client";

import React, { Suspense, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getPasswordResetRedirectUrl,
  getSupabaseAuthClient,
  signInOfficer
} from "../../lib/supabase-auth";
import { AlertTriangleIcon, CheckCircleIcon } from "../../components/ui/Icons";

const asRoute = (path: string): Route => path as unknown as Route;

function getSafeReturnUrl(target: string | null): string {
  if (!target) return "/assessment/pft3";
  const trimmed = target.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.includes("\\") &&
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return trimmed;
  }
  return "/assessment/pft3";
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnParam =
    searchParams.get("returnUrl") || searchParams.get("redirect") || searchParams.get("next");
  const destination = getSafeReturnUrl(returnParam);

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
      router.push(asRoute(destination));
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
        "If this email is registered, a password setup link has been sent. Check the inbox and spam folder."
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
    <div className="auth-shell">
      <a href="#main-content" className="skip-link">
        Skip to sign in form
      </a>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ width: "100%", display: "grid", placeItems: "center" }}
      >
        <section className="auth-card" aria-labelledby="sign-in-heading">
          <header className="auth-header">
            <div className="auth-brand-row">
              <div className="auth-seal-badge">
                <img
                  src="/punjab-logo.png"
                  alt="Government of the Punjab Official Seal"
                  width={40}
                  height={40}
                />
              </div>
              <div>
                <p className="auth-brand-eyebrow">Government of the Punjab</p>
                <p className="auth-brand-dept">
                  Excise, Taxation &amp; Narcotics Control Department
                </p>
              </div>
            </div>
            <h1 id="sign-in-heading">PTAS Officer Sign In</h1>
            <p className="auth-header-desc">
              Use your registered official email address. Your role and jurisdiction are resolved
              from the server after authentication.
            </p>
          </header>

          <div className="auth-body">
            {!isConfigured && (
              <div role="alert" className="alert alert-warning">
                <AlertTriangleIcon size={18} />
                <div>
                  <strong>Configuration Notice:</strong> Authentication service is not configured on
                  this deployment. Please verify your environment configuration or contact the
                  system administrator.
                </div>
              </div>
            )}

            {errorMessage && (
              <div id="sign-in-error" role="alert" className="alert alert-error">
                <AlertTriangleIcon size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {statusMessage && (
              <div role="status" className="alert alert-success">
                <CheckCircleIcon size={18} />
                <span>{statusMessage}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
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

              <div className="form-group">
                <label htmlFor="officer-password">Password</label>
                <div className="auth-password-row">
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="auth-actions">
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="btn-primary"
                  style={{ width: "100%" }}
                >
                  {isAuthenticating ? "Verifying…" : "Sign In"}
                </button>

                <button
                  type="button"
                  disabled={isSendingReset}
                  className="btn-secondary"
                  onClick={() => void handlePasswordSetup()}
                  style={{ width: "100%" }}
                >
                  {isSendingReset ? "Sending…" : "Set or reset password"}
                </button>
              </div>
            </form>

            <p className="auth-note">
              An email address alone grants no PTAS access. Authentication must succeed and an
              active role-and-jurisdiction assignment must exist in the database.
            </p>

            <div className="auth-footer-links">
              <Link href={asRoute("/verify")}>Open citizen document verification</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" tabIndex={-1} className="auth-shell">
          <div style={{ color: "var(--color-brand-900)", fontWeight: 600 }}>
            Loading PTAS Sign In…
          </div>
        </main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

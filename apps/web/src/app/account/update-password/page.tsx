"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getSupabaseAuthClient } from "../../../lib/supabase-auth";

const asRoute = (path: string): Route => path as unknown as Route;

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    const supabase = getSupabaseAuthClient();
    const recoveryParameters = new URLSearchParams(window.location.hash.slice(1));
    const recoveryErrorCode = recoveryParameters.get("error_code");
    const recoveryErrorDescription = recoveryParameters.get("error_description");
    const isRecovery = recoveryParameters.get("type") === "recovery";

    if (recoveryErrorCode || recoveryErrorDescription) {
      window.history.replaceState(null, "", window.location.pathname);
      setHasRecoverySession(false);
      setError(
        recoveryErrorCode === "otp_expired"
          ? "This one-time password setup link has expired or was already used. Request a new link from the PTAS sign-in page."
          : recoveryErrorDescription || "This password setup link is invalid. Request a new link."
      );
      return;
    }

    const acceptRecoverySession = (hasSession: boolean) => {
      if (!hasSession) return false;
      window.history.replaceState(null, "", window.location.pathname);
      setError(null);
      setHasRecoverySession(true);
      return true;
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (isRecovery && session)) {
        acceptRecoverySession(Boolean(session));
      }
    });

    const establishRecoverySession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && acceptRecoverySession(Boolean(data.session))) return;
      setHasRecoverySession(false);
      setError("This password setup link is invalid or expired. Request a new link.");
    };

    void establishRecoverySession();
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (password.length < 12) {
      setError("Use at least 12 characters for the new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }
    if (!hasRecoverySession) {
      setError("This password setup link is missing, invalid, or expired. Request a new link.");
      return;
    }

    setIsSaving(true);
    try {
      const supabase = getSupabaseAuthClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmation("");
      setMessage("Password updated. You can now sign in to PTAS.");
      await supabase.auth.signOut();
    } catch {
      setError("The password could not be updated. Request a new setup link and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main style={{ maxWidth: "32rem", margin: "4rem auto", padding: "1rem" }}>
      <h1>Set PTAS password</h1>
      <p>Open this page from the Supabase password setup email, then choose your password.</p>
      {error && <div role="alert">{error}</div>}
      {message && <div role="status">{message}</div>}
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <div className="form-group">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="form-control"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="form-control"
            required
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={isSaving || !hasRecoverySession}>
          {isSaving ? "Saving…" : "Save password"}
        </button>
      </form>
      <Link href={asRoute("/sign-in")} style={{ display: "inline-block", marginTop: "1rem" }}>
        Return to sign in
      </Link>
    </main>
  );
}

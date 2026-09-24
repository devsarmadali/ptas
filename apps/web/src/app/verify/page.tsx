"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadPilotState } from "../../lib/pilot-store";
import { verifyStatutoryDocument, type DocumentVerificationResult } from "../../lib/public-portal";

export function PublicVerificationContent({ defaultQuery }: { defaultQuery?: string }) {
  const searchParams = useSearchParams();
  const refParam =
    defaultQuery ||
    searchParams.get("ref") ||
    searchParams.get("pin") ||
    searchParams.get("q") ||
    "";

  const [searchQuery, setSearchQuery] = useState(refParam);
  const [result, setResult] = useState<DocumentVerificationResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (refParam) {
      setSearchQuery(refParam);
      executeVerification(refParam);
    }
  }, [refParam]);

  const executeVerification = (query: string) => {
    if (!query.trim()) return;

    const state = loadPilotState();
    const verificationResult = verifyStatutoryDocument(
      query.trim(),
      state.units,
      state.clearanceCertificates ?? [],
      state.statutoryReceipts ?? [],
      state.pft2Challans ?? []
    );

    setResult(verificationResult);
    setHasSearched(true);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification(searchQuery);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "1.5rem 1rem" }}>
      {/* Return to Dashboard and Related Portals Link Bar */}
      <div
        style={{
          maxWidth: "48rem",
          margin: "0 auto 1.5rem auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        <a
          href="/"
          style={{
            fontSize: "0.85rem",
            color: "#0d3822",
            textDecoration: "none",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem"
          }}
        >
          ← Return to Main PTAS System
        </a>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a
            href="/documents/pf2/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.82rem",
              color: "#047857",
              textDecoration: "none",
              fontWeight: 600
            }}
          >
            💳 Issue Form PFT-2 ↗
          </a>
          <a
            href="/admin/user-management"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.82rem",
              color: "#475569",
              textDecoration: "none",
              fontWeight: 600
            }}
          >
            👥 User Desk ↗
          </a>
        </div>
      </div>

      {/* Clean Public Citizen Header (No staff navigation or editing controls) */}
      <div
        style={{ maxWidth: "48rem", margin: "0 auto", textAlign: "center", marginBottom: "2rem" }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#0d3822",
            color: "#ffffff",
            padding: "0.4rem 1rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: "0.75rem"
          }}
        >
          Official Public Verification Portal
        </div>
        <h1
          style={{ color: "#0d3822", fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.5rem" }}
        >
          Government of the Punjab
        </h1>
        <p style={{ color: "#475569", margin: 0, fontSize: "0.95rem" }}>
          Excise, Taxation &amp; Narcotics Control Department &bull; Professional Tax Verification
        </p>
      </div>

      <div
        style={{
          maxWidth: "42rem",
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          padding: "1.75rem"
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ marginBottom: "1.5rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: "0.5rem"
            }}
          >
            Enter Document Security PIN, Notice #, or Challan #:
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              className="form-control"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. 6-digit PIN (e.g. 684219) or PFT2-0001-..."
              style={{ fontSize: "0.95rem", padding: "0.65rem 0.85rem" }}
              required
            />
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: "0.65rem 1.25rem", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Verify Now
            </button>
          </div>
        </form>

        {hasSearched && result && (
          <div
            style={{
              borderRadius: "8px",
              border: `2px solid ${result.isValid ? "#86efac" : "#fca5a5"}`,
              background: result.isValid ? "#f0fdf4" : "#fef2f2",
              padding: "1.5rem"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem"
              }}
            >
              <span style={{ fontSize: "2rem" }}>{result.isValid ? "✅" : "⚠️"}</span>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    color: result.isValid ? "#166534" : "#991b1b"
                  }}
                >
                  {result.title}
                </h2>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: result.isValid ? "#15803d" : "#b91c1c",
                    textTransform: "uppercase"
                  }}
                >
                  Status: {result.verificationStatus}
                </span>
              </div>
            </div>

            <p
              style={{
                fontSize: "0.875rem",
                color: "#1e293b",
                lineHeight: 1.5,
                margin: "0 0 1rem"
              }}
            >
              {result.message}
            </p>

            {/* Read-Only Public Attributes */}
            {result.isValid && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #bbf7d0",
                  borderRadius: "6px",
                  padding: "1rem",
                  fontSize: "0.825rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.65rem",
                  color: "#334155"
                }}
              >
                {result.unitName && (
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                      Assessee Name:
                    </span>
                    <strong>{result.unitName}</strong>
                  </div>
                )}
                {result.identifier && (
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                      Identifier:
                    </span>
                    <strong>{result.identifier}</strong>
                  </div>
                )}
                {result.categoryName && (
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                      Classification:
                    </span>
                    <span>{result.categoryName}</span>
                  </div>
                )}
                {result.scheduleEntry && (
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                      Schedule Entry:
                    </span>
                    <span>{result.scheduleEntry}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                    Issuing Authority:
                  </span>
                  <span>{result.issuingAuthority}</span>
                </div>
                <div>
                  <span style={{ color: "#64748b", display: "block", fontSize: "0.72rem" }}>
                    Verified At:
                  </span>
                  <span style={{ fontFamily: "monospace" }}>{result.verifiedAt}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{ textAlign: "center", marginTop: "2rem", color: "#94a3b8", fontSize: "0.75rem" }}
      >
        Official Provincial Digital Verification Service &bull; Punjab Professional Tax
        Administration System (PTAS)
      </div>
    </div>
  );
}

export default function PublicVerificationPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center" }}>Loading verification portal...</div>
      }
    >
      <PublicVerificationContent />
    </Suspense>
  );
}

"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  verifyStatutoryDocumentOnline,
  type DocumentVerificationResult
} from "../../lib/public-portal";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  SearchIcon
} from "../../components/ui/Icons";

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
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (refParam) {
      setSearchQuery(refParam);
      void executeVerification(refParam);
    }
  }, [refParam]);

  const executeVerification = async (query: string) => {
    if (!query.trim()) return;

    setIsVerifying(true);
    setHasSearched(true);
    try {
      const verificationResult = await verifyStatutoryDocumentOnline(query.trim());
      setResult(verificationResult);
    } catch {
      setResult({
        isValid: false,
        documentType: "UNKNOWN",
        verificationStatus: "INVALID_NOT_FOUND",
        title: "Verification Error",
        message: "An unexpected error occurred while verifying the document. Please try again.",
        documentReference: query.trim(),
        unitName: "N/A",
        identifier: "N/A",
        address: "N/A",
        categoryName: "N/A",
        scheduleEntry: "N/A",
        assessedAmount: 0,
        outstandingBalance: 0,
        officialSha256: "",
        qrPayload: "",
        verifiedAt: new Date().toISOString(),
        issuingAuthority: "Excise & Taxation Department, Punjab"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeVerification(searchQuery);
  };

  return (
    <div className="standalone-page standalone-page--narrow">
      <a href="#main-content" className="skip-link">
        Skip to verification form
      </a>

      <header>
        <nav className="standalone-topbar" aria-label="Public portal navigation">
          <a
            href="/"
            className="btn-secondary btn-sm"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            <ArrowLeftIcon size={14} />
            <span>Return to Main PTAS System</span>
          </a>
          <span className="badge badge-approved">Official Public Verification Portal</span>
        </nav>

        <div style={{ textAlign: "center", margin: "1.25rem 0 1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
            <img
              src="/punjab-logo.png"
              alt="Government of the Punjab Official Seal"
              width={72}
              height={60}
              style={{
                width: "68px",
                height: "auto",
                maxHeight: "60px",
                objectFit: "contain"
              }}
            />
          </div>
          <h1
            style={{
              color: "var(--color-brand-900)",
              fontSize: "1.65rem",
              fontWeight: 800,
              margin: "0 0 0.4rem",
              lineHeight: 1.2
            }}
          >
            Government of the Punjab
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.95rem" }}>
            Excise, Taxation &amp; Narcotics Control Department &bull; Professional Tax Verification
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="surface-card" aria-label="Document verification lookup">
          <form onSubmit={handleSearchSubmit} style={{ marginBottom: hasSearched ? "1.5rem" : 0 }}>
            <div className="form-group">
              <label htmlFor="verify-query-input">
                Enter Security Code, Notice Number, or Challan Number
              </label>
              <div className="verify-search-row">
                <input
                  id="verify-query-input"
                  type="text"
                  className="form-control"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. 6-digit Security Code (e.g. 684219) or PFT2-0001-..."
                  required
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="btn-primary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  <SearchIcon size={15} />
                  <span>{isVerifying ? "Verifying..." : "Verify Now"}</span>
                </button>
              </div>
              <p className="form-help">
                Supports Form P.F.T-1 demand notices, Form P.F.T-2 challans, Form P.F.T-5 clearance
                certificates, and official receipts.
              </p>
            </div>
          </form>

          {isVerifying && (
            <div
              role="status"
              style={{
                padding: "2rem 1rem",
                textAlign: "center",
                color: "var(--color-text-muted)"
              }}
            >
              Verifying statutory document with the official Punjab register...
            </div>
          )}

          {!isVerifying && hasSearched && result && (
            <div
              role={result.isValid ? "status" : "alert"}
              aria-live="polite"
              aria-label="Verification result"
              style={{
                borderRadius: "var(--radius-lg)",
                border: `1.5px solid ${result.isValid ? "var(--color-success-border)" : "var(--color-danger-border)"}`,
                background: result.isValid
                  ? "var(--color-success-surface)"
                  : "var(--color-danger-surface)",
                padding: "1.25rem"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.85rem"
                }}
              >
                <span
                  style={{
                    color: result.isValid ? "var(--color-success-text)" : "var(--color-danger-text)"
                  }}
                >
                  {result.isValid ? <CheckCircleIcon size={28} /> : <AlertTriangleIcon size={28} />}
                </span>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      color: result.isValid
                        ? "var(--color-success-text)"
                        : "var(--color-danger-text)"
                    }}
                  >
                    {result.title}
                  </h2>
                  <span
                    className={`badge ${result.isValid ? "badge-approved" : "badge-returned"}`}
                    style={{ marginTop: "0.25rem" }}
                  >
                    Status: {result.verificationStatus}
                  </span>
                </div>
              </div>

              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text)",
                  lineHeight: 1.5,
                  margin: "0 0 1rem"
                }}
              >
                {result.message}
              </p>

              {result.isValid && (
                <div
                  className="detail-grid"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-success-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "1rem",
                    fontSize: "0.85rem",
                    color: "var(--color-text-secondary)"
                  }}
                >
                  {result.unitName && (
                    <div>
                      <span className="detail-field-label">Profession/Trade Name</span>
                      <strong>{result.unitName}</strong>
                    </div>
                  )}
                  {result.identifier && (
                    <div>
                      <span className="detail-field-label">Identifier</span>
                      <strong>{result.identifier}</strong>
                    </div>
                  )}
                  {result.categoryName && (
                    <div>
                      <span className="detail-field-label">Classification</span>
                      <span>{result.categoryName}</span>
                    </div>
                  )}
                  {result.scheduleEntry && (
                    <div>
                      <span className="detail-field-label">Schedule Entry</span>
                      <span>{result.scheduleEntry}</span>
                    </div>
                  )}
                  <div>
                    <span className="detail-field-label">Issuing Authority</span>
                    <span>{result.issuingAuthority}</span>
                  </div>
                  <div>
                    <span className="detail-field-label">Verified At</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{result.verifiedAt}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer
        style={{
          textAlign: "center",
          marginTop: "1.5rem",
          color: "var(--color-text-muted)",
          fontSize: "0.78rem"
        }}
      >
        Official Provincial Digital Verification Service &bull; Punjab Professional Tax
        Administration System (PTAS)
      </footer>
    </div>
  );
}

export default function PublicVerificationPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          className="standalone-page standalone-page--narrow"
          style={{ textAlign: "center" }}
        >
          Loading verification portal...
        </main>
      }
    >
      <PublicVerificationContent />
    </Suspense>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface StatutoryQrCodeProps {
  readonly payload: string;
  readonly size?: number | undefined;
  readonly securityCode?: string | undefined;
  readonly label?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly onScanOrClick?: ((payload: string) => void) | undefined;
}

/**
 * Renders an authentic, standards-compliant ISO/IEC 18004 QR code for statutory documents.
 * Generates a crisp raster data URL (PNG) embedded directly in the DOM, guaranteeing
 * 100% fidelity and scannability in downloaded PDFs (avoiding html2canvas SVG black-box artifacts).
 *
 * Implements Section 1.3 & 1.4 of the Consolidated Implementation Specification:
 * - Emits the scannable QR image itself without redundant text labels ("Scan to verify", etc.).
 * - Renders security code cleanly directly below the QR with lock icon (🔒 68XXXXXX).
 */
export function StatutoryQrCode({
  payload,
  size = 120,
  securityCode,
  label,
  subtitle,
  onScanOrClick
}: StatutoryQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let isCurrent = true;
    const effectivePayload = payload || "PTAS-PUNJAB:BLANK";

    QRCode.toDataURL(effectivePayload, {
      margin: 1,
      errorCorrectionLevel: "M",
      width: Math.max(size * 2, 240),
      color: {
        dark: "#0d3822",
        light: "#ffffff"
      }
    })
      .then((url) => {
        if (isCurrent) {
          setDataUrl(url);
        }
      })
      .catch((err) => {
        console.error("Failed to generate statutory QR DataURL:", err);
      });

    return () => {
      isCurrent = false;
    };
  }, [payload, size]);

  return (
    <div
      className="statutory-qr-container"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.35rem",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        cursor: onScanOrClick ? "pointer" : "default",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        textAlign: "center"
      }}
      onClick={() => onScanOrClick?.(payload)}
      title={onScanOrClick ? "Click to verify this official Punjab Government document" : payload}
      role={onScanOrClick ? "button" : undefined}
      tabIndex={onScanOrClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onScanOrClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onScanOrClick(payload);
        }
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`Official Statutory QR Code for ${payload}`}
          width={size}
          height={size}
          style={{
            display: "block",
            imageRendering: "pixelated",
            width: `${size}px`,
            height: `${size}px`
          }}
        />
      ) : (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            color: "#64748b",
            fontSize: "0.75rem"
          }}
        >
          Generating QR...
        </div>
      )}

      {/* Security Code display: Lock icon + actual code directly below QR */}
      {securityCode && (
        <div
          style={{
            marginTop: "0.3rem",
            fontSize: "0.75rem",
            fontWeight: 800,
            fontFamily: "monospace",
            color: "#0f172a",
            letterSpacing: "1px",
            background: "#f1f5f9",
            padding: "0.15rem 0.45rem",
            borderRadius: "4px",
            border: "1px solid #e2e8f0"
          }}
        >
          🔒 {securityCode}
        </div>
      )}

      {/* Optional legacy labels if explicitly passed */}
      {label && (
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 700,
            color: "#0d3822",
            marginTop: "0.25rem",
            letterSpacing: "0.02em"
          }}
        >
          {label}
        </span>
      )}
      {subtitle ? (
        <span
          style={{
            fontSize: "0.55rem",
            color: "#64748b",
            fontFamily: "monospace",
            maxWidth: `${size + 24}px`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}

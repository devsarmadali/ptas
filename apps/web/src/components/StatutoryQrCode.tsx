"use client";

import React, { useMemo } from "react";
import QRCode from "qrcode";

interface StatutoryQrCodeProps {
  readonly payload: string;
  readonly size?: number;
  readonly label?: string;
  readonly subtitle?: string;
  readonly onScanOrClick?: ((payload: string) => void) | undefined;
}

/**
 * Renders an authentic, standards-compliant ISO/IEC 18004 QR code using
 * Reed-Solomon Error Correction (Level 'M') and official quiet zone margin.
 * Fully compatible with all standard smartphone camera scanners and barcode decoders.
 */
export function StatutoryQrCode({
  payload,
  size = 120,
  label = "Scan to Verify",
  subtitle,
  onScanOrClick
}: StatutoryQrCodeProps) {
  const qrSvgData = useMemo(() => {
    try {
      const qr = QRCode.create(payload || "PTAS-PUNJAB:BLANK", {
        errorCorrectionLevel: "M"
      });
      const numModules = qr.modules.size;
      const margin = 3;
      const totalSize = numModules + margin * 2;

      let path = "";
      for (let r = 0; r < numModules; r++) {
        for (let c = 0; c < numModules; c++) {
          if (qr.modules.get(r, c)) {
            path += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }

      return {
        totalSize,
        path
      };
    } catch (err) {
      console.error("Failed to generate statutory QR code:", err);
      return null;
    }
  }, [payload]);

  if (!qrSvgData) {
    return (
      <div
        className="statutory-qr-container"
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0.5rem",
          background: "#ffffff",
          border: "1px dashed #ef4444",
          borderRadius: "6px",
          color: "#991b1b",
          fontSize: "0.75rem"
        }}
      >
        QR Error
      </div>
    );
  }

  const { totalSize, path } = qrSvgData;

  return (
    <div
      className="statutory-qr-container"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0.5rem",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        cursor: onScanOrClick ? "pointer" : "default",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease"
      }}
      onClick={() => onScanOrClick?.(payload)}
      title={
        onScanOrClick
          ? "Click or point smartphone camera to verify this official Punjab Government document"
          : payload
      }
      role={onScanOrClick ? "button" : undefined}
      tabIndex={onScanOrClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onScanOrClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onScanOrClick(payload);
        }
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        style={{ display: "block" }}
        shapeRendering="crispEdges"
        aria-label={`Official Statutory QR Code for ${payload}`}
      >
        <rect width={totalSize} height={totalSize} fill="#ffffff" />
        <path d={path} fill="#0d3822" />
      </svg>
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

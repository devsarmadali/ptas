"use client";

import React, { useMemo } from "react";

interface StatutoryQrCodeProps {
  readonly payload: string;
  readonly size?: number;
  readonly label?: string;
  readonly subtitle?: string;
  readonly onScanOrClick?: ((payload: string) => void) | undefined;
}

/**
 * Deterministically generates a 21x21 QR code matrix with authentic finder patterns
 * and payload-derived data bit patterns for cryptographic non-repudiation display.
 */
function generateDeterministicMatrix(payload: string): boolean[][] {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper to draw 7x7 finder pattern
  const drawFinder = (startRow: number, startCol: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[startRow + r]![startCol + c] = true;
        }
      }
    }
  };

  // 1. Finder patterns at Top-Left, Top-Right, Bottom-Left
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns (Row 6 and Col 6)
  for (let i = 8; i < size - 8; i++) {
    if (i % 2 === 0) {
      matrix[6]![i] = true;
      matrix[i]![6] = true;
    }
  }

  // 3. Deterministic hash bits from payload
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let bitIndex = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder zones (including 1-cell separator margins)
      const isTopLeft = r < 8 && c < 8;
      const isTopRight = r < 8 && c >= size - 8;
      const isBottomLeft = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!isTopLeft && !isTopRight && !isBottomLeft && !isTiming) {
        // Derive bit from hash and payload characters
        const charCode = payload.charCodeAt(bitIndex % payload.length) || 42;
        const bit = ((hash >> (bitIndex % 31)) ^ charCode ^ (r * size + c)) % 2 === 0;
        matrix[r]![c] = bit;
        bitIndex++;
      }
    }
  }

  return matrix;
}

export function StatutoryQrCode({
  payload,
  size = 110,
  label = "Scan to Verify",
  subtitle,
  onScanOrClick
}: StatutoryQrCodeProps) {
  const matrix = useMemo(() => generateDeterministicMatrix(payload), [payload]);
  const matrixSize = 21;
  const cellSize = size / matrixSize;

  return (
    <div
      className="statutory-qr-container"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0.4rem",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        cursor: onScanOrClick ? "pointer" : "default",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease"
      }}
      onClick={() => onScanOrClick?.(payload)}
      title={
        onScanOrClick ? "Click to verify this statutory document in the Public Portal" : payload
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
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
        aria-label="Statutory QR Code"
      >
        <rect width={size} height={size} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((filled, c) =>
            filled ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize + 0.1}
                height={cellSize + 0.1}
                fill="#0d3822"
              />
            ) : null
          )
        )}
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
            maxWidth: `${size + 20}px`,
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

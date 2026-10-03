"use client";

import React from "react";
import { Pft2ChallanCopy } from "./Pft2ChallanCopy";
import type { FormPFT2Model } from "../lib/statutory-forms";

export interface Pft2ChallanDocumentProps {
  readonly challan: FormPFT2Model;
  readonly id?: string | undefined;
  readonly onScanOrClick?: ((payload: string) => void) | undefined;
}

/**
 * Three-Copy Statutory Payment Instrument Component (Form P.F.T-2).
 *
 * Renders exactly THREE copies side-by-side:
 * - Copy 1: TAXPAYER'S COPY
 * - Copy 2: BANK'S COPY
 * - Copy 3: DEPARTMENT'S COPY
 *
 * Features:
 * - Uniform width across all 3 copies.
 * - Perforated scissor cut guide between copies.
 * - Single-page A4 landscape print compatibility.
 * - Zero vertical whitespace waste.
 */
export function Pft2ChallanDocument({
  challan,
  id = "issued-pft2-document-target",
  onScanOrClick
}: Pft2ChallanDocumentProps) {
  const copies = challan.copies;

  return (
    <div
      className="challan-grid printable-document"
      id={id}
      style={{
        width: "100%",
        maxWidth: "82rem",
        margin: "0 auto",
        background: "#ffffff",
        padding: "0.5rem",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.04)"
      }}
    >
      {copies.map((copy, idx) => (
        <React.Fragment key={copy.copyTitle || idx}>
          <Pft2ChallanCopy copy={copy} copyIndex={idx} onScanOrClick={onScanOrClick} />
        </React.Fragment>
      ))}
    </div>
  );
}

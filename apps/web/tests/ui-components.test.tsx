import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Modal } from "../src/components/ui/Modal";
import { StandalonePageHeader } from "../src/components/ui/StandalonePageHeader";
import { RowActionMenu } from "../src/components/RowActionMenu";
import { QrScannerModal } from "../src/components/QrScannerModal";

describe("PTAS shared UI primitives & accessible overlays", () => {
  it("Modal renders nothing when closed and accessible dialog attributes when open", () => {
    const closedMarkup = renderToStaticMarkup(
      <Modal isOpen={false} onClose={() => {}} title="Hidden Modal">
        <p>Body</p>
      </Modal>
    );
    expect(closedMarkup).toBe("");

    const openMarkup = renderToStaticMarkup(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Officer Verification Modal"
        footer={<button type="button">Submit</button>}
        closeLabel="Dismiss verification modal"
      >
        <p>Assessment body content</p>
      </Modal>
    );

    expect(openMarkup).toContain('role="dialog"');
    expect(openMarkup).toContain('aria-modal="true"');
    expect(openMarkup).toContain("aria-labelledby=");
    expect(openMarkup).toContain("Officer Verification Modal");
    expect(openMarkup).toContain("Assessment body content");
    expect(openMarkup).toContain("Dismiss verification modal");
    expect(openMarkup).toContain("Submit");
  });

  it("StandalonePageHeader renders skip link, print suppression, h1, and navigation links", () => {
    const markup = renderToStaticMarkup(
      <StandalonePageHeader
        eyebrow="Punjab Excise & Taxation"
        title="Statutory Form P.F.T-2 Challan"
        subtitle="Assessment & Demand Receipt"
        backHref="/"
        backLabel="Back to Portal"
        topLinks={[
          { label: "Verify Portal", href: "/verify" },
          { label: "Official Rules", href: "https://example.gov.pk", external: true }
        ]}
        bannerActions={<button type="button">Print Challan</button>}
      />
    );

    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain("skip-link");
    expect(markup).toContain("no-print");
    expect(markup).toContain("<h1");
    expect(markup).toContain("Statutory Form P.F.T-2 Challan");
    expect(markup).toContain("Punjab Excise &amp; Taxation");
    expect(markup).toContain("Back to Portal");
    expect(markup).toContain("Verify Portal");
    expect(markup).toContain("Print Challan");
  });

  it("RowActionMenu renders accessible menu trigger semantics", () => {
    const markup = renderToStaticMarkup(
      <RowActionMenu
        label="Unit Actions"
        ariaLabel="Actions for PIN-001"
        actions={[
          { id: "open", label: "Open Dossier", href: "/units/1/details" },
          { id: "approve", label: "Approve", variant: "primary", onClick: () => {} }
        ]}
      />
    );

    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Actions for PIN-001"');
    expect(markup).toContain("Unit Actions");
  });

  it("QrScannerModal renders closed state cleanly and WAI-ARIA tabs when open", () => {
    const closedMarkup = renderToStaticMarkup(
      <QrScannerModal isOpen={false} onClose={() => {}} onScan={() => {}} />
    );
    expect(closedMarkup).toBe("");

    const openMarkup = renderToStaticMarkup(
      <QrScannerModal isOpen={true} onClose={() => {}} onScan={() => {}} />
    );

    expect(openMarkup).toContain('role="dialog"');
    expect(openMarkup).toContain('aria-modal="true"');
    expect(openMarkup).toContain('role="tablist"');
    expect(openMarkup).toContain('role="tab"');
    expect(openMarkup).toContain('role="tabpanel"');
  });
});

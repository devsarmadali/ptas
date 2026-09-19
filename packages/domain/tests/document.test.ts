import { describe, expect, it } from "vitest";
import type { FormTemplatePayload, LegalConfigurationVersion } from "../src/index.js";
import {
  PROVISIONAL_DISCLAIMER,
  computeContentSha256,
  renderDocument,
  verifyDocumentIntegrity
} from "../src/index.js";

describe("document rendering domain operations", () => {
  const approvedTemplate: LegalConfigurationVersion<FormTemplatePayload> = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    configType: "FORM",
    code: "FORM_PFT_2",
    versionNo: 1,
    effectiveFrom: "2026-07-01",
    status: "APPROVED",
    approvalEvidenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt: "2026-07-01T00:00:00.000Z",
    payload: {
      title: "Notice of Assessment and Demand",
      templateBody:
        "Take notice that for the financial year {{financialYear}}, professional tax of PKR {{assessedDemand}} has been assessed for {{taxpayerName}} (CNIC/NTN: {{identifier}}). Please deposit within 30 days."
    }
  };

  const draftTemplate: LegalConfigurationVersion<FormTemplatePayload> = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    configType: "FORM",
    code: "FORM_PFT_2_DRAFT",
    versionNo: 2,
    effectiveFrom: "2026-07-01",
    status: "DRAFT",
    createdAt: "2026-07-01T00:00:00.000Z",
    payload: {
      title: "Proposed Notice of Assessment",
      templateBody: "Proposed demand: PKR {{assessedDemand}} for {{taxpayerName}}."
    }
  };

  const approvedSnapshot = {
    taxpayerName: "Tariq Mahmood Autos",
    identifier: "35201*******1",
    financialYear: "2026-2027",
    assessedDemand: 5000,
    circleName: "Circle-A Lahore"
  };

  const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const assessmentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("renders a document faithfully from an approved template and snapshot", () => {
    const doc = renderDocument({
      aggregateType: "ASSESSMENT",
      aggregateId: assessmentId,
      template: approvedTemplate,
      snapshot: approvedSnapshot,
      generatedBy: userId
    });

    expect(doc.aggregateType).toBe("ASSESSMENT");
    expect(doc.aggregateId).toBe(assessmentId);
    expect(doc.templateConfigId).toBe(approvedTemplate.id);
    expect(doc.isProvisional).toBe(false);
    expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.renderedContent).toContain("DOCUMENT: Notice of Assessment and Demand");
    expect(doc.renderedContent).toContain("FORM CODE: FORM_PFT_2 (v1)");
    expect(doc.renderedContent).toContain(
      "professional tax of PKR 5000 has been assessed for Tariq Mahmood Autos"
    );
    expect(doc.renderedContent).not.toContain(PROVISIONAL_DISCLAIMER);
    expect(Object.isFrozen(doc)).toBe(true);

    // Verify integrity
    expect(verifyDocumentIntegrity(doc.renderedContent, doc.sha256)).toBe(true);
  });

  it("visibly marks documents rendered with draft templates as non-operative", () => {
    const doc = renderDocument({
      aggregateType: "ASSESSMENT",
      aggregateId: assessmentId,
      template: draftTemplate,
      snapshot: approvedSnapshot,
      generatedBy: userId
    });

    expect(doc.isProvisional).toBe(true);
    expect(doc.renderedContent).toContain(PROVISIONAL_DISCLAIMER);
    expect(doc.renderedContent).toContain("Proposed demand: PKR 5000 for Tariq Mahmood Autos.");
    expect(verifyDocumentIntegrity(doc.renderedContent, doc.sha256)).toBe(true);
  });

  it("visibly marks documents as non-operative when explicit isProvisional is passed", () => {
    const doc = renderDocument({
      aggregateType: "ASSESSMENT",
      aggregateId: assessmentId,
      template: approvedTemplate,
      snapshot: approvedSnapshot,
      generatedBy: userId,
      isProvisional: true
    });

    expect(doc.isProvisional).toBe(true);
    expect(doc.renderedContent).toContain(PROVISIONAL_DISCLAIMER);
  });

  it("computes 64-char SHA-256 and detects tampering", () => {
    const doc = renderDocument({
      aggregateType: "ASSESSMENT",
      aggregateId: assessmentId,
      template: approvedTemplate,
      snapshot: approvedSnapshot,
      generatedBy: userId
    });

    expect(computeContentSha256(doc.renderedContent)).toBe(doc.sha256);
    expect(verifyDocumentIntegrity(doc.renderedContent, doc.sha256)).toBe(true);

    // Tampered content must fail integrity verification
    const tampered = doc.renderedContent.replace("PKR 5000", "PKR 1000");
    expect(verifyDocumentIntegrity(tampered, doc.sha256)).toBe(false);
  });

  it("rejects non-FORM configuration templates", () => {
    const rateConfig: LegalConfigurationVersion = {
      id: crypto.randomUUID(),
      configType: "RATE",
      code: "RATE_SCHEDULE",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      status: "APPROVED",
      approvalEvidenceId: crypto.randomUUID(),
      createdAt: "2026-07-01T00:00:00.000Z",
      payload: { amount: 5000 }
    };

    expect(() =>
      renderDocument({
        aggregateType: "ASSESSMENT",
        aggregateId: assessmentId,
        template: rateConfig,
        snapshot: approvedSnapshot,
        generatedBy: userId
      })
    ).toThrow(/Template configType must be 'FORM'/);
  });

  it("validates required parameters", () => {
    expect(() =>
      renderDocument({
        aggregateType: "",
        aggregateId: assessmentId,
        template: approvedTemplate,
        snapshot: approvedSnapshot,
        generatedBy: userId
      })
    ).toThrow(/aggregateType is required/);

    expect(() =>
      renderDocument({
        aggregateType: "ASSESSMENT",
        aggregateId: "",
        template: approvedTemplate,
        snapshot: approvedSnapshot,
        generatedBy: userId
      })
    ).toThrow(/aggregateId is required/);

    expect(() =>
      renderDocument({
        aggregateType: "ASSESSMENT",
        aggregateId: assessmentId,
        template: approvedTemplate,
        snapshot: null as unknown as Record<string, unknown>,
        generatedBy: userId
      })
    ).toThrow(/snapshot must be a non-null object/);
  });
});

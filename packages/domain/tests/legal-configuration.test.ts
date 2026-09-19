import { describe, expect, it } from "vitest";
import {
  activateConfiguration,
  approveConfiguration,
  createApprovalEvidence,
  createDraftConfiguration,
  findActiveConfiguration,
  isConfigurationEffective,
  retireConfiguration,
  validateApprovalEvidence
} from "../src/legal-configuration.js";
import type { AuditActor } from "../src/audit.js";

const TEST_ACTOR: AuditActor = {
  userId: "usr-admin-1",
  roleCode: "SUPER_ADMIN",
  jurisdictionId: "reg-01"
};

const VALID_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("approval evidence validation", () => {
  it("creates valid approval evidence with 64-char hex SHA256", () => {
    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/001",
        approvingAuthority: "Finance Department, Government of Punjab",
        approvedOn: "2026-06-15",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );

    expect(evidence.approvalIdentifier).toBe("FD/PFT/2026/001");
    expect(evidence.sourceDocumentSha256).toBe(VALID_SHA256);
    expect(evidence.createdBy).toBe("usr-admin-1");
    expect(() => validateApprovalEvidence(evidence)).not.toThrow();
  });

  it("rejects evidence with invalid SHA256 length or non-hex characters", () => {
    expect(() =>
      createApprovalEvidence(
        {
          approvalIdentifier: "FD/PFT/2026/002",
          approvingAuthority: "Finance Department",
          approvedOn: "2026-06-15",
          sourceDocumentSha256: "not-a-valid-sha256",
          effectiveFrom: "2026-07-01"
        },
        TEST_ACTOR
      )
    ).toThrow("must be a valid 64-character hexadecimal SHA-256 hash");
  });

  it("rejects evidence with inverted dates (effectiveTo before effectiveFrom)", () => {
    expect(() =>
      createApprovalEvidence(
        {
          approvalIdentifier: "FD/PFT/2026/003",
          approvingAuthority: "Finance Department",
          approvedOn: "2026-06-15",
          sourceDocumentSha256: VALID_SHA256,
          effectiveFrom: "2026-07-01",
          effectiveTo: "2025-06-30"
        },
        TEST_ACTOR
      )
    ).toThrow("effectiveTo cannot be earlier than effectiveFrom");
  });
});

describe("legal configuration lifecycle", () => {
  const mockSchedulePayload = {
    scheduleName: "Mock Test Schedule 2026",
    categories: [
      { code: "CAT_TEST_A", baseRate: 1000 },
      { code: "CAT_TEST_B", baseRate: 2500 }
    ]
  };

  it("creates a draft configuration in DRAFT status", () => {
    const draft = createDraftConfiguration({
      configType: "SCHEDULE",
      code: "SCH_2026_MOCK",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: mockSchedulePayload
    });

    expect(draft.status).toBe("DRAFT");
    expect(draft.code).toBe("SCH_2026_MOCK");
    expect(draft.approvalEvidenceId).toBeUndefined();
    expect(draft.payload.scheduleName).toBe("Mock Test Schedule 2026");
  });

  it("strictly prevents activating an unapproved DRAFT configuration", () => {
    const draft = createDraftConfiguration({
      configType: "RATE",
      code: "RATE_TEST",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: { rate: 1000 }
    });

    expect(() => activateConfiguration(draft, "2026-07-15")).toThrow(
      "Cannot activate unapproved configuration: status is DRAFT"
    );
  });

  it("transitions DRAFT to APPROVED when valid evidence is attached", () => {
    const draft = createDraftConfiguration({
      configType: "SCHEDULE",
      code: "SCH_2026_MOCK",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: mockSchedulePayload
    });

    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/010",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-20",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );

    const approved = approveConfiguration(draft, evidence);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvalEvidenceId).toBe(evidence.id);
  });

  it("activates an APPROVED configuration within its effective window", () => {
    const draft = createDraftConfiguration({
      configType: "SCHEDULE",
      code: "SCH_2026_MOCK",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: mockSchedulePayload
    });

    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/010",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-20",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );

    const approved = approveConfiguration(draft, evidence);
    const active = activateConfiguration(approved, "2026-07-05");

    expect(active.status).toBe("ACTIVE");
    expect(isConfigurationEffective(active, "2026-08-01")).toBe(true);
    expect(isConfigurationEffective(active, "2028-01-01")).toBe(false); // Expired
  });

  it("rejects activation before effectiveFrom date", () => {
    const draft = createDraftConfiguration({
      configType: "RATE",
      code: "RATE_2026",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: { amount: 500 }
    });

    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/011",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-20",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );

    const approved = approveConfiguration(draft, evidence);

    expect(() => activateConfiguration(approved, "2026-06-25")).toThrow(
      "Cannot activate configuration before effectiveFrom date"
    );
  });

  it("retires an active configuration", () => {
    const draft = createDraftConfiguration({
      configType: "ACCOUNT_HEAD",
      code: "HEAD_B011",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      payload: { headCode: "B01177" }
    });

    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/012",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-20",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01"
      },
      TEST_ACTOR
    );

    const approved = approveConfiguration(draft, evidence);
    const active = activateConfiguration(approved, "2026-07-01");
    const retired = retireConfiguration(active);

    expect(retired.status).toBe("RETIRED");
    expect(isConfigurationEffective(retired, "2026-07-01")).toBe(false);
  });

  it("resolves active configuration for given date using findActiveConfiguration", () => {
    const evidence1 = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2025/001",
        approvingAuthority: "Finance Department",
        approvedOn: "2025-06-15",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2025-07-01",
        effectiveTo: "2026-06-30"
      },
      TEST_ACTOR
    );

    const evidence2 = createApprovalEvidence(
      {
        approvalIdentifier: "FD/PFT/2026/001",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-15",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );

    const v1 = activateConfiguration(
      approveConfiguration(
        createDraftConfiguration({
          configType: "FORM",
          code: "FORM_PFT1",
          versionNo: 1,
          effectiveFrom: "2025-07-01",
          effectiveTo: "2026-06-30",
          payload: { layout: "v1-mock-layout" }
        }),
        evidence1
      ),
      "2025-07-01"
    );

    const v2 = activateConfiguration(
      approveConfiguration(
        createDraftConfiguration({
          configType: "FORM",
          code: "FORM_PFT1",
          versionNo: 2,
          effectiveFrom: "2026-07-01",
          effectiveTo: "2027-06-30",
          payload: { layout: "v2-mock-layout" }
        }),
        evidence2
      ),
      "2026-07-01"
    );

    const configs = [v1, v2];

    const activeIn2025 = findActiveConfiguration(configs, "FORM", "FORM_PFT1", "2025-10-15");
    expect(activeIn2025?.versionNo).toBe(1);

    const activeIn2026 = findActiveConfiguration(configs, "FORM", "FORM_PFT1", "2026-09-01");
    expect(activeIn2026?.versionNo).toBe(2);

    const activeIn2030 = findActiveConfiguration(configs, "FORM", "FORM_PFT1", "2030-01-01");
    expect(activeIn2030).toBeNull();
  });
});

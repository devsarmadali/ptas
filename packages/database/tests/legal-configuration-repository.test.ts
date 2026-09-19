import { describe, expect, it } from "vitest";
import { InMemoryLegalConfigurationRepository, InMemoryAuditRepository } from "../src/index.js";
import {
  activateConfiguration,
  approveConfiguration,
  createApprovalEvidence,
  createDraftConfiguration
} from "@ptas/domain";
import type { AuditActor, AuditContext } from "@ptas/domain";

const TEST_ACTOR: AuditActor = {
  userId: "usr-admin-01",
  roleCode: "ADMIN",
  jurisdictionId: "reg-01"
};

const TEST_AUDIT_CTX: AuditContext = {
  correlationId: "corr-cfg-99",
  actor: TEST_ACTOR
};

const VALID_SHA256 = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("InMemoryLegalConfigurationRepository", () => {
  it("saves approval evidence and emits audit event", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryLegalConfigurationRepository(auditRepo);

    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "GAZETTE-2026-PTAS-01",
        approvingAuthority: "Government of the Punjab",
        approvedOn: "2026-06-25",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR,
      "2026-06-25T10:00:00.000Z"
    );

    const saved = await repo.saveApprovalEvidence(evidence, TEST_AUDIT_CTX);
    expect(saved.id).toBe(evidence.id);

    const byId = await repo.findApprovalEvidenceById(evidence.id);
    expect(byId).not.toBeNull();
    expect(byId?.approvalIdentifier).toBe("GAZETTE-2026-PTAS-01");

    const byIdent = await repo.findApprovalEvidenceByIdentifier("GAZETTE-2026-PTAS-01");
    expect(byIdent).not.toBeNull();
    expect(byIdent?.id).toBe(evidence.id);

    // Verify audit event
    const auditEvents = await auditRepo.queryByCorrelationId("corr-cfg-99");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.eventType).toBe("APPROVAL_EVIDENCE_RECORDED");
    expect(auditEvents[0]?.aggregateId).toBe(evidence.id);
  });

  it("rejects duplicate approval evidence identifiers", async () => {
    const repo = new InMemoryLegalConfigurationRepository();
    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "GAZETTE-DUP-01",
        approvingAuthority: "Government of the Punjab",
        approvedOn: "2026-06-25",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01"
      },
      TEST_ACTOR
    );

    await repo.saveApprovalEvidence(evidence, TEST_AUDIT_CTX);
    await expect(
      repo.saveApprovalEvidence({ ...evidence, id: "different-uuid" }, TEST_AUDIT_CTX)
    ).rejects.toThrow("already exists");
  });

  it("stores draft configuration, enforces approval constraint, and updates lifecycle to active", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryLegalConfigurationRepository(auditRepo);

    const draft = createDraftConfiguration({
      configType: "RATE",
      code: "RATE_TEST_2026",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      payload: { testAmount: 2000 }
    });

    await repo.createVersion(draft, TEST_AUDIT_CTX);

    const found = await repo.findVersion("RATE", "RATE_TEST_2026", 1);
    expect(found).not.toBeNull();
    expect(found?.status).toBe("DRAFT");

    // Saving evidence
    const evidence = createApprovalEvidence(
      {
        approvalIdentifier: "FD/RATE/2026/01",
        approvingAuthority: "Finance Department",
        approvedOn: "2026-06-28",
        sourceDocumentSha256: VALID_SHA256,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2027-06-30"
      },
      TEST_ACTOR
    );
    await repo.saveApprovalEvidence(evidence, TEST_AUDIT_CTX);

    // Approve
    const approved = approveConfiguration(draft, evidence);
    await repo.updateVersion(approved, TEST_AUDIT_CTX);

    // Activate
    const active = activateConfiguration(approved, "2026-07-01");
    await repo.updateVersion(active, TEST_AUDIT_CTX);

    // Query active version
    const activeVersion = await repo.findActiveVersion("RATE", "RATE_TEST_2026", "2026-08-15");
    expect(activeVersion).not.toBeNull();
    expect(activeVersion?.status).toBe("ACTIVE");
    expect(activeVersion?.versionNo).toBe(1);

    // Query outside active window returns null
    const inactiveVersion = await repo.findActiveVersion("RATE", "RATE_TEST_2026", "2028-01-01");
    expect(inactiveVersion).toBeNull();
  });

  it("rejects non-DRAFT version creation without approvalEvidenceId", async () => {
    const repo = new InMemoryLegalConfigurationRepository();

    const invalidApproved = {
      id: "ver-invalid-1",
      configType: "SCHEDULE" as const,
      code: "SCH_INVALID",
      versionNo: 1,
      effectiveFrom: "2026-07-01",
      payload: {},
      status: "APPROVED" as const,
      approvalEvidenceId: undefined, // Missing!
      createdAt: new Date().toISOString()
    };

    await expect(repo.createVersion(invalidApproved, TEST_AUDIT_CTX)).rejects.toThrow(
      "requires an approvalEvidenceId"
    );
  });
});

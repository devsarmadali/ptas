import { describe, expect, it } from "vitest";
import { InMemoryAssessmentRepository, InMemoryAuditRepository } from "../src/index.js";
import {
  approveAssessmentVersion,
  createAssessment,
  createAssessmentRevision,
  submitAssessmentVersion
} from "@ptas/domain";
import type { AuditActor, AuditContext } from "@ptas/domain";

const INSPECTOR_ACTOR: AuditActor = {
  userId: "usr-insp-01",
  roleCode: "INSPECTOR",
  jurisdictionId: "circle-01"
};

const ETO_ACTOR: AuditActor = {
  userId: "usr-eto-01",
  roleCode: "ETO",
  jurisdictionId: "dist-01"
};

const AUDIT_CTX: AuditContext = {
  correlationId: "corr-asmt-100",
  actor: INSPECTOR_ACTOR
};

describe("InMemoryAssessmentRepository", () => {
  const snapshotV1 = {
    taxpayerName: "Punjab Logistics Co",
    activities: ["ROAD_FREIGHT"],
    applicableRate: 2500
  };

  it("creates assessment, initial version, and emits audit event", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryAssessmentRepository(auditRepo);

    const { assessment, version } = createAssessment(
      {
        taxpayerId: "tp-001",
        financialYearId: "fy-2026",
        snapshot: snapshotV1
      },
      INSPECTOR_ACTOR,
      "2026-07-01T08:00:00.000Z"
    );

    const result = await repo.createAssessment(assessment, version, AUDIT_CTX);
    expect(result.assessment.id).toBe(assessment.id);
    expect(result.version.versionNo).toBe(1);

    const found = await repo.findById(assessment.id);
    expect(found).not.toBeNull();
    expect(found?.taxpayerId).toBe("tp-001");
    expect(found?.financialYearId).toBe("fy-2026");

    const foundByYear = await repo.findByTaxpayerAndYear("tp-001", "fy-2026");
    expect(foundByYear).not.toBeNull();
    expect(foundByYear?.id).toBe(assessment.id);

    // Verify audit event
    const auditEvents = await auditRepo.queryByCorrelationId("corr-asmt-100");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.eventType).toBe("ASSESSMENT_CREATED");
  });

  it("strictly enforces one assessment per taxpayer and financial year", async () => {
    const repo = new InMemoryAssessmentRepository();

    const first = createAssessment(
      {
        taxpayerId: "tp-001",
        financialYearId: "fy-2026",
        snapshot: snapshotV1
      },
      INSPECTOR_ACTOR
    );
    await repo.createAssessment(first.assessment, first.version, AUDIT_CTX);

    const duplicateSecond = createAssessment(
      {
        id: "different-assessment-id",
        taxpayerId: "tp-001", // same taxpayer
        financialYearId: "fy-2026", // same year
        snapshot: { ...snapshotV1, applicableRate: 5000 }
      },
      INSPECTOR_ACTOR
    );

    await expect(
      repo.createAssessment(duplicateSecond.assessment, duplicateSecond.version, AUDIT_CTX)
    ).rejects.toThrow("already exists for taxpayer tp-001 and financial year fy-2026");
  });

  it("updates workflow status, approves version, and prevents in-place edit of approved version", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryAssessmentRepository(auditRepo);

    const initial = createAssessment(
      {
        taxpayerId: "tp-002",
        financialYearId: "fy-2026",
        snapshot: snapshotV1
      },
      INSPECTOR_ACTOR
    );
    await repo.createAssessment(initial.assessment, initial.version, AUDIT_CTX);

    // Submit
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);
    await repo.updateVersion(submitted.assessment, submitted.version, AUDIT_CTX);

    // Approve
    const approved = approveAssessmentVersion(
      submitted.assessment,
      submitted.version,
      ETO_ACTOR,
      "evidence-uuid-88",
      "2026-07-15T10:00:00.000Z"
    );
    await repo.updateVersion(approved.assessment, approved.version, {
      ...AUDIT_CTX,
      actor: ETO_ACTOR
    });

    const storedApproved = await repo.findVersion(initial.assessment.id, 1);
    expect(storedApproved?.status).toBe("APPROVED");
    expect(storedApproved?.approvedBy).toBe(ETO_ACTOR.userId);

    // Attempting to edit approved version in place must fail
    const illegalEdit = {
      ...approved.version,
      snapshot: { ...snapshotV1, applicableRate: 9999 }
    };

    await expect(repo.updateVersion(approved.assessment, illegalEdit, AUDIT_CTX)).rejects.toThrow(
      "Cannot edit approved assessment version v1 in place (immutable)"
    );
  });

  it("creates revision v2 and tracks multiple versions ordered monotonically", async () => {
    const auditRepo = new InMemoryAuditRepository();
    const repo = new InMemoryAssessmentRepository(auditRepo);

    const initial = createAssessment(
      {
        taxpayerId: "tp-003",
        financialYearId: "fy-2026",
        snapshot: snapshotV1
      },
      INSPECTOR_ACTOR
    );
    await repo.createAssessment(initial.assessment, initial.version, AUDIT_CTX);

    const submitted = submitAssessmentVersion(initial.assessment, initial.version);
    await repo.updateVersion(submitted.assessment, submitted.version, AUDIT_CTX);

    const approved = approveAssessmentVersion(submitted.assessment, submitted.version, ETO_ACTOR);
    await repo.updateVersion(approved.assessment, approved.version, {
      ...AUDIT_CTX,
      actor: ETO_ACTOR
    });

    // Create revision v2
    const revisedSnapshot = {
      ...snapshotV1,
      applicableRate: 4000
    };
    const revision = createAssessmentRevision(
      approved.assessment,
      approved.version,
      "Additional business activity declared",
      revisedSnapshot,
      INSPECTOR_ACTOR,
      "2026-08-01T09:00:00.000Z"
    );

    await repo.createRevision(revision.assessment, revision.version, AUDIT_CTX);

    const versions = await repo.listVersions(initial.assessment.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.versionNo).toBe(1);
    expect(versions[0]?.status).toBe("APPROVED");
    expect(versions[0]?.snapshot.applicableRate).toBe(2500);

    expect(versions[1]?.versionNo).toBe(2);
    expect(versions[1]?.status).toBe("REVISION_DRAFT");
    expect(versions[1]?.snapshot.applicableRate).toBe(4000);
  });
});

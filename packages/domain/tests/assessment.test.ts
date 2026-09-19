import { describe, expect, it } from "vitest";
import {
  approveAssessmentVersion,
  assertApprovedVersionImmutable,
  createAssessment,
  createAssessmentRevision,
  recordHearingEvidence,
  resubmitAssessmentRevision,
  returnAssessmentVersion,
  submitAssessmentVersion
} from "../src/assessment.js";
import type { AuditActor } from "../src/audit.js";

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

describe("assessment state machine and lifecycle", () => {
  const initialSnapshot = {
    taxpayerId: "tp-100",
    businessName: "Punjab Hardware Traders",
    declaredActivities: ["WHOLESALE_HARDWARE"],
    assessedRate: 2500,
    penaltyCeiling: 2500
  };

  it("initializes an assessment and v1 in DRAFT status", () => {
    const { assessment, version } = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR,
      "2026-07-10T10:00:00.000Z"
    );

    expect(assessment.taxpayerId).toBe("tp-100");
    expect(assessment.financialYearId).toBe("fy-2026-2027");
    expect(assessment.status).toBe("DRAFT");
    expect(assessment.currentVersionNo).toBe(1);

    expect(version.versionNo).toBe(1);
    expect(version.status).toBe("DRAFT");
    expect(version.snapshot.assessedRate).toBe(2500);
    expect(version.approvedBy).toBeUndefined();
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(version)).toBe(true);
  });

  it("transitions DRAFT -> SUBMITTED by Inspector", () => {
    const { assessment, version } = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );

    const submitted = submitAssessmentVersion(assessment, version);
    expect(submitted.assessment.status).toBe("SUBMITTED");
    expect(submitted.version.status).toBe("SUBMITTED");
  });

  it("allows ETO to return assessment with explanatory reason", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);

    const returned = returnAssessmentVersion(
      submitted.assessment,
      submitted.version,
      "Discrepancy in declared turnover category",
      ETO_ACTOR
    );

    expect(returned.assessment.status).toBe("RETURNED");
    expect(returned.version.status).toBe("RETURNED");
    expect(returned.version.reason).toBe("Discrepancy in declared turnover category");
  });

  it("blocks non-ETO role from returning an assessment", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);

    expect(() =>
      returnAssessmentVersion(submitted.assessment, submitted.version, "Reason", INSPECTOR_ACTOR)
    ).toThrow("requires ETO or higher");
  });

  it("allows recording hearing evidence from SUBMITTED status", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);

    const hearing = recordHearingEvidence(
      submitted.assessment,
      submitted.version,
      "Hearing conducted on 2026-07-20 in District Office; taxpayer present",
      ETO_ACTOR
    );

    expect(hearing.assessment.status).toBe("HEARING_RECORDED");
    expect(hearing.version.status).toBe("HEARING_RECORDED");
  });

  it("strictly enforces that only statutory ETO authority can approve", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);

    // Inspector attempts approval -> must be rejected
    expect(() =>
      approveAssessmentVersion(submitted.assessment, submitted.version, INSPECTOR_ACTOR)
    ).toThrow("requires assessing authority ETO or higher");

    // ETO approves -> succeeds
    const approved = approveAssessmentVersion(
      submitted.assessment,
      submitted.version,
      ETO_ACTOR,
      "evidence-uuid-1",
      "2026-07-25T11:00:00.000Z"
    );

    expect(approved.assessment.status).toBe("APPROVED");
    expect(approved.version.status).toBe("APPROVED");
    expect(approved.version.approvedBy).toBe(ETO_ACTOR.userId);
    expect(approved.version.approvedAt).toBe("2026-07-25T11:00:00.000Z");
    expect(approved.version.approvalEvidenceId).toBe("evidence-uuid-1");
  });

  it("guarantees approved snapshots cannot be edited in place", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);
    const approved = approveAssessmentVersion(submitted.assessment, submitted.version, ETO_ACTOR);

    expect(() => assertApprovedVersionImmutable(approved.version)).toThrow(
      "Approved snapshots are immutable"
    );
    expect(() => submitAssessmentVersion(approved.assessment, approved.version)).toThrow(
      "Approved snapshots are immutable"
    );
  });

  it("creates revision v2 while keeping v1 completely immutable and intact", () => {
    const initial = createAssessment(
      {
        taxpayerId: "tp-100",
        financialYearId: "fy-2026-2027",
        snapshot: initialSnapshot
      },
      INSPECTOR_ACTOR
    );
    const submitted = submitAssessmentVersion(initial.assessment, initial.version);
    const approved = approveAssessmentVersion(submitted.assessment, submitted.version, ETO_ACTOR);

    const revisedSnapshot = {
      ...initialSnapshot,
      assessedRate: 3500
    };

    const revision = createAssessmentRevision(
      approved.assessment,
      approved.version,
      "Taxpayer opened second branch; higher tier applicable",
      revisedSnapshot,
      INSPECTOR_ACTOR
    );

    // Assessment is updated to version 2 in REVISION_DRAFT
    expect(revision.assessment.currentVersionNo).toBe(2);
    expect(revision.assessment.status).toBe("REVISION_DRAFT");

    // New version 2 created in REVISION_DRAFT
    expect(revision.version.versionNo).toBe(2);
    expect(revision.version.status).toBe("REVISION_DRAFT");
    expect(revision.version.snapshot.assessedRate).toBe(3500);
    expect(revision.version.reason).toContain("Taxpayer opened second branch");

    // Original approved v1 remains completely untouched!
    expect(approved.version.versionNo).toBe(1);
    expect(approved.version.status).toBe("APPROVED");
    expect(approved.version.snapshot.assessedRate).toBe(2500);

    // Resubmit and re-approve revision
    const resubmitted = resubmitAssessmentRevision(revision.assessment, revision.version);
    expect(resubmitted.assessment.status).toBe("RESUBMITTED");
    expect(resubmitted.version.status).toBe("RESUBMITTED");

    const reapproved = approveAssessmentVersion(
      resubmitted.assessment,
      resubmitted.version,
      ETO_ACTOR
    );
    expect(reapproved.assessment.status).toBe("APPROVED");
    expect(reapproved.version.versionNo).toBe(2);
    expect(reapproved.version.status).toBe("APPROVED");
  });
});

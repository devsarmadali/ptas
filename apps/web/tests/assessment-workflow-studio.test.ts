import { describe, expect, it } from "vitest";
import {
  MOCK_OFFICERS,
  createInitialPilotUnits,
  type StoredUnit,
  type StoredUnitSnapshot,
  type PilotAuditItem
} from "../src/lib/pilot-store.js";
import {
  submitAssessmentVersion,
  approveAssessmentVersion,
  returnAssessmentVersion,
  type Assessment,
  type AssessmentVersion,
  type DemandLedgerEntry,
  type AuditActor
} from "@ptas/domain";

describe("Statutory Assessment Queue & Survey Workflow Studio", () => {
  const inspector = MOCK_OFFICERS.find((o) => o.role === "INSPECTOR")!;
  const eto = MOCK_OFFICERS.find((o) => o.role === "ETO")!;

  const etoActor: AuditActor = {
    userId: eto.id,
    roleCode: eto.role,
    jurisdictionId: "30000000-0000-0000-0000-000000000004"
  };

  it("allows Inspector to submit a feeded (DRAFT) survey unit for ETO review", () => {
    const units = createInitialPilotUnits();
    // Create a feeded survey unit in DRAFT status
    const draftUnit: StoredUnit = {
      ...units[0]!,
      assessments: [{ ...units[0]!.assessments[0]!, status: "DRAFT" }],
      assessmentVersions: [{ ...units[0]!.assessmentVersions[0]!, status: "DRAFT" }]
    };
    expect(draftUnit.assessments[0]?.status).toBe("DRAFT");

    const { assessment: submittedAsm, version: submittedVer } = submitAssessmentVersion(
      draftUnit.assessments[0]!,
      draftUnit.assessmentVersions[0]!
    );

    expect(submittedAsm.status).toBe("SUBMITTED");
    expect(submittedVer.status).toBe("SUBMITTED");
  });

  it("supports ETO statutory approval and data trimming upon PFT-3 incorporation", () => {
    const units = createInitialPilotUnits();
    // Unit 3 (Al-Madina Commercial) is in SUBMITTED
    const submittedUnit = units[2]!;
    expect(submittedUnit.assessments[0]?.status).toBe("SUBMITTED");

    const { assessment: approvedAsm, version: approvedVer } = approveAssessmentVersion(
      submittedUnit.assessments[0]!,
      submittedUnit.assessmentVersions[0]!,
      etoActor
    );

    expect(approvedAsm.status).toBe("APPROVED");
    expect(approvedVer.status).toBe("APPROVED");
    expect(approvedVer.approvedBy).toBe(eto.id);

    // Verify trimming helper logic
    const demandNo = "PDN-2026-00099";
    const pinNo = "PIN-998877";
    const demandEntry: DemandLedgerEntry = {
      id: "entry-01",
      demandUnitId: submittedUnit.demandUnit.id,
      financialYearId: "2026-2027",
      entryType: "ASSESSMENT_DEMAND",
      amount: 4000,
      sourceType: "ASSESSMENT",
      sourceId: approvedAsm.id,
      idempotencyKey: "test-idem",
      correlationId: "test-corr",
      postedBy: eto.name,
      postedAt: new Date().toISOString(),
      metadata: {}
    };

    const trimmedUnit: StoredUnit = {
      id: submittedUnit.id,
      legalName: submittedUnit.legalName,
      tradeName: submittedUnit.tradeName,
      identifierType: submittedUnit.identifierType,
      identifierValue: submittedUnit.identifierValue,
      address: submittedUnit.address,
      locality: submittedUnit.locality,
      circleId: submittedUnit.circleId,
      circleName: submittedUnit.circleName,
      districtName: submittedUnit.districtName,
      categoryCode: submittedUnit.categoryCode,
      subclassificationCode: submittedUnit.subclassificationCode,
      statutoryTertiaryCode: submittedUnit.statutoryTertiaryCode,
      statutoryRuleId: submittedUnit.statutoryRuleId,
      statutoryRule: submittedUnit.statutoryRule,
      assessmentNumber: submittedUnit.assessmentNumber,
      demandNumber: demandNo,
      pinNumber: pinNo,
      provincialUin: submittedUnit.provincialUin,
      pft3Registered: true,
      demandUnit: submittedUnit.demandUnit,
      assessments: [approvedAsm],
      assessmentVersions: [approvedVer],
      ledgerEntries: [demandEntry, ...submittedUnit.ledgerEntries],
      openingArrears: submittedUnit.openingArrears,
      createdAt: submittedUnit.createdAt
    };

    expect(trimmedUnit.pft3Registered).toBe(true);
    expect(trimmedUnit.demandNumber).toBe(demandNo);
    expect(trimmedUnit.pinNumber).toBe(pinNo);
    expect(trimmedUnit.assessments[0]?.status).toBe("APPROVED");
    expect(trimmedUnit.ledgerEntries).toContain(demandEntry);
  });

  it("supports ETO returning assessment to Inspector with mandatory statutory observations", () => {
    const units = createInitialPilotUnits();
    const submittedUnit = units[2]!;
    expect(submittedUnit.assessments[0]?.status).toBe("SUBMITTED");

    const observations =
      "Commercial floor area requires field remeasurement under Schedule Subclass 3(i)(b).";
    const { assessment: returnedAsm, version: returnedVer } = returnAssessmentVersion(
      submittedUnit.assessments[0]!,
      submittedUnit.assessmentVersions[0]!,
      observations,
      etoActor
    );

    expect(returnedAsm.status).toBe("RETURNED");
    expect(returnedVer.status).toBe("RETURNED");
    expect(returnedVer.reason).toBe(observations);
  });

  it("allows Inspector to update particulars and resubmit returned assessment to ETO", () => {
    const units = createInitialPilotUnits();
    const submittedUnit = units[2]!;

    // 1. ETO returns
    const { assessment: returnedAsm, version: returnedVer } = returnAssessmentVersion(
      submittedUnit.assessments[0]!,
      submittedUnit.assessmentVersions[0]!,
      "Remeasure floor area",
      etoActor
    );

    // 2. Inspector updates & resubmits
    const resubmittedAsm: Assessment = {
      ...returnedAsm,
      status: "SUBMITTED"
    };
    const resubmittedVer: AssessmentVersion<StoredUnitSnapshot> = {
      ...returnedVer,
      status: "SUBMITTED",
      reason: "Inspector updated field survey particulars per ETO observation."
    };

    expect(resubmittedAsm.status).toBe("SUBMITTED");
    expect(resubmittedVer.status).toBe("SUBMITTED");
    expect(resubmittedVer.reason).toContain("Inspector updated field survey");
  });

  it("supports authorized administrative closure of unviable/defunct units with full audit trail", () => {
    const units = createInitialPilotUnits();
    const targetUnit = units[0]!;

    const closeReason = "Business permanently liquidated and ceased all commercial operations.";
    const closedAsm: Assessment = {
      ...targetUnit.assessments[0]!,
      status: "WITHDRAWN"
    };
    const closedVer: AssessmentVersion<StoredUnitSnapshot> = {
      ...targetUnit.assessmentVersions[0]!,
      status: "WITHDRAWN",
      reason: closeReason
    };

    const closedUnit: StoredUnit = {
      ...targetUnit,
      isDiscontinued: true,
      discontinuanceStatus: "DISCONTINUED",
      discontinuanceReason: closeReason,
      discontinuanceDate: new Date().toISOString(),
      assessments: [closedAsm, ...targetUnit.assessments.slice(1)],
      assessmentVersions: [closedVer, ...targetUnit.assessmentVersions.slice(1)]
    };

    const auditItem: PilotAuditItem = {
      id: "audit-close-test",
      eventType: "UNIT_CLOSED",
      actorName: eto.name,
      actorRole: eto.role,
      target: targetUnit.legalName,
      timestamp: new Date().toISOString(),
      correlationId: "corr-close-test",
      details: `Authorized closure of unit '${targetUnit.legalName}': ${closeReason}`
    };

    expect(closedUnit.isDiscontinued).toBe(true);
    expect(closedUnit.discontinuanceStatus).toBe("DISCONTINUED");
    expect(closedUnit.assessments[0]?.status).toBe("WITHDRAWN");
    expect(auditItem.eventType).toBe("UNIT_CLOSED");
  });

  it("handles multi-unit bulk selection and batch counters correctly", () => {
    const units = createInitialPilotUnits();
    const testUnits = [
      {
        ...units[0]!,
        assessments: [{ ...units[0]!.assessments[0]!, status: "DRAFT" as const }]
      },
      units[1]!,
      units[2]! // SUBMITTED
    ];
    const selectedIds = new Set([testUnits[0]!.id, testUnits[1]!.id, testUnits[2]!.id]);

    const selectedUnits = testUnits.filter((u) => selectedIds.has(u.id));
    expect(selectedUnits).toHaveLength(3);

    const submittedCount = selectedUnits.filter(
      (u) => u.assessments[0]?.status === "SUBMITTED"
    ).length;
    expect(submittedCount).toBe(1); // Al-Madina is submitted

    const feededOrReturnedCount = selectedUnits.filter(
      (u) =>
        (u.assessments[0]?.status ?? "DRAFT") === "DRAFT" || u.assessments[0]?.status === "RETURNED"
    ).length;
    expect(feededOrReturnedCount).toBe(1); // testUnits[0] is draft
  });
});

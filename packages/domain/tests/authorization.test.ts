import { describe, expect, it } from "vitest";
import { Jurisdiction } from "../src/jurisdiction.js";
import {
  evaluateJurisdictionAccess,
  evaluateActionAccess,
  AuthSubject
} from "../src/authorization.js";

const jurisdictions: readonly Jurisdiction[] = [
  {
    id: "reg-lahore",
    type: "REGION",
    code: "REG_LHR",
    name: "Lahore Region",
    parentId: null,
    activeFrom: "2020-01-01"
  },
  {
    id: "dist-lahore",
    type: "DISTRICT",
    code: "DIST_LHR",
    name: "Lahore District",
    parentId: "reg-lahore",
    activeFrom: "2020-01-01"
  },
  {
    id: "off-zone-1",
    type: "OFFICE",
    code: "ETO_ZONE_1",
    name: "ETO Zone 1",
    parentId: "dist-lahore",
    activeFrom: "2020-01-01"
  },
  {
    id: "circ-a",
    type: "CIRCLE",
    code: "CIRC_A",
    name: "Circle A",
    parentId: "off-zone-1",
    activeFrom: "2020-01-01"
  },
  {
    id: "circ-b",
    type: "CIRCLE",
    code: "CIRC_B",
    name: "Circle B",
    parentId: "off-zone-1",
    activeFrom: "2020-01-01"
  },
  {
    id: "off-zone-2",
    type: "OFFICE",
    code: "ETO_ZONE_2",
    name: "ETO Zone 2",
    parentId: "dist-lahore",
    activeFrom: "2020-01-01"
  },
  {
    id: "circ-c",
    type: "CIRCLE",
    code: "CIRC_C",
    name: "Circle C",
    parentId: "off-zone-2",
    activeFrom: "2020-01-01"
  }
];

const asOf = new Date("2026-06-01T12:00:00.000Z");

describe("jurisdiction-based authorization policy", () => {
  it("permits inspector access to their assigned circle", () => {
    const inspectorSubject: AuthSubject = {
      userId: "usr-inspector-1",
      assignments: [
        {
          id: "asgn-1",
          userId: "usr-inspector-1",
          roleCode: "INSPECTOR",
          jurisdictionId: "circ-a",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null
        }
      ]
    };

    const decision = evaluateJurisdictionAccess({
      subject: inspectorSubject,
      targetJurisdictionId: "circ-a",
      jurisdictions,
      asOf
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("ALLOWED");
  });

  it("denies inspector access to an unrelated circle (Circle A inspector requesting Circle B)", () => {
    const inspectorSubject: AuthSubject = {
      userId: "usr-inspector-1",
      assignments: [
        {
          id: "asgn-1",
          userId: "usr-inspector-1",
          roleCode: "INSPECTOR",
          jurisdictionId: "circ-a",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null
        }
      ]
    };

    const decision = evaluateJurisdictionAccess({
      subject: inspectorSubject,
      targetJurisdictionId: "circ-b",
      jurisdictions,
      asOf
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("UNRELATED_JURISDICTION");
  });

  it("permits ETO access to all descendant circles under their office", () => {
    const etoSubject: AuthSubject = {
      userId: "usr-eto-1",
      assignments: [
        {
          id: "asgn-eto-zone-1",
          userId: "usr-eto-1",
          roleCode: "ETO",
          jurisdictionId: "off-zone-1",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null
        }
      ]
    };

    // Access own office
    expect(
      evaluateJurisdictionAccess({
        subject: etoSubject,
        targetJurisdictionId: "off-zone-1",
        jurisdictions,
        asOf
      }).allowed
    ).toBe(true);

    // Access child circle A
    expect(
      evaluateJurisdictionAccess({
        subject: etoSubject,
        targetJurisdictionId: "circ-a",
        jurisdictions,
        asOf
      }).allowed
    ).toBe(true);

    // Access child circle B
    expect(
      evaluateJurisdictionAccess({
        subject: etoSubject,
        targetJurisdictionId: "circ-b",
        jurisdictions,
        asOf
      }).allowed
    ).toBe(true);

    // Denied on separate office and circle under Zone 2
    expect(
      evaluateJurisdictionAccess({
        subject: etoSubject,
        targetJurisdictionId: "off-zone-2",
        jurisdictions,
        asOf
      }).allowed
    ).toBe(false);

    expect(
      evaluateJurisdictionAccess({
        subject: etoSubject,
        targetJurisdictionId: "circ-c",
        jurisdictions,
        asOf
      }).allowed
    ).toBe(false);
  });

  it("denies access when user assignment is expired as of reference date", () => {
    const expiredSubject: AuthSubject = {
      userId: "usr-expired",
      assignments: [
        {
          id: "asgn-old",
          userId: "usr-expired",
          roleCode: "INSPECTOR",
          jurisdictionId: "circ-a",
          validFrom: "2025-01-01T00:00:00.000Z",
          validTo: "2025-12-31T23:59:59.999Z" // expired before 2026-06-01
        }
      ]
    };

    const decision = evaluateJurisdictionAccess({
      subject: expiredSubject,
      targetJurisdictionId: "circ-a",
      jurisdictions,
      asOf
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("NO_ACTIVE_ASSIGNMENT");
  });

  it("differentiates statutory action authority: inspectors cannot approve assessments", () => {
    const inspectorSubject: AuthSubject = {
      userId: "usr-inspector-1",
      assignments: [
        {
          id: "asgn-1",
          userId: "usr-inspector-1",
          roleCode: "INSPECTOR",
          jurisdictionId: "circ-a",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null
        }
      ]
    };

    // Inspector submitting in own circle -> ALLOWED
    const submitDecision = evaluateActionAccess({
      subject: inspectorSubject,
      targetJurisdictionId: "circ-a",
      action: "SUBMIT",
      jurisdictions,
      asOf
    });
    expect(submitDecision.allowed).toBe(true);

    // Inspector attempting statutory approval -> INSUFFICIENT_ROLE
    const approveDecision = evaluateActionAccess({
      subject: inspectorSubject,
      targetJurisdictionId: "circ-a",
      action: "APPROVE",
      jurisdictions,
      asOf
    });
    expect(approveDecision.allowed).toBe(false);
    expect(approveDecision.reason).toBe("INSUFFICIENT_ROLE");

    // ETO attempting approval in circle A -> ALLOWED
    const etoSubject: AuthSubject = {
      userId: "usr-eto-1",
      assignments: [
        {
          id: "asgn-eto",
          userId: "usr-eto-1",
          roleCode: "ETO",
          jurisdictionId: "off-zone-1",
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null
        }
      ]
    };
    const etoApproveDecision = evaluateActionAccess({
      subject: etoSubject,
      targetJurisdictionId: "circ-a",
      action: "APPROVE",
      jurisdictions,
      asOf
    });
    expect(etoApproveDecision.allowed).toBe(true);
  });
});

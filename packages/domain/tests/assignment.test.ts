import { describe, expect, it } from "vitest";
import { Jurisdiction } from "../src/jurisdiction.js";
import {
  UserRoleAssignment,
  validateInspectorCircleAssignment,
  validateAssignmentHistory,
  getActiveAssignments
} from "../src/assignment.js";

const jurisdictions: readonly Jurisdiction[] = [
  {
    id: "off-1",
    type: "OFFICE",
    code: "OFF_1",
    name: "Office 1",
    parentId: null,
    activeFrom: "2020-01-01"
  },
  {
    id: "circ-a",
    type: "CIRCLE",
    code: "CIRC_A",
    name: "Circle A",
    parentId: "off-1",
    activeFrom: "2020-01-01"
  },
  {
    id: "circ-b",
    type: "CIRCLE",
    code: "CIRC_B",
    name: "Circle B",
    parentId: "off-1",
    activeFrom: "2020-01-01"
  }
];

describe("inspector-circle assignment rules", () => {
  it("allows assigning an inspector to an active circle when no active assignment exists", () => {
    const candidate: UserRoleAssignment = {
      id: "asgn-1",
      userId: "usr-inspector-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circ-a",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null
    };

    const result = validateInspectorCircleAssignment(
      candidate,
      [],
      jurisdictions,
      new Date("2026-06-01T00:00:00.000Z")
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects assigning an inspector to an office or non-circle jurisdiction", () => {
    const candidate: UserRoleAssignment = {
      id: "asgn-office",
      userId: "usr-inspector-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "off-1", // OFFICE instead of CIRCLE
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null
    };

    const result = validateInspectorCircleAssignment(
      candidate,
      [],
      jurisdictions,
      new Date("2026-06-01T00:00:00.000Z")
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_JURISDICTION_TYPE")).toBe(true);
  });

  it("enforces one active circle assignment rule: rejects concurrent active circle assignment", () => {
    const existingHistory: readonly UserRoleAssignment[] = [
      {
        id: "asgn-circ-a",
        userId: "usr-inspector-1",
        roleCode: "INSPECTOR",
        jurisdictionId: "circ-a",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null // actively assigned
      }
    ];

    const candidate: UserRoleAssignment = {
      id: "asgn-circ-b",
      userId: "usr-inspector-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circ-b",
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: null
    };

    const asOf = new Date("2026-04-01T00:00:00.000Z");
    const result = validateInspectorCircleAssignment(
      candidate,
      existingHistory,
      jurisdictions,
      asOf
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "OVERLAPPING_ASSIGNMENT")).toBe(true);
    expect(result.errors.some((e) => e.code === "MULTIPLE_ACTIVE_ASSIGNMENTS")).toBe(true);
  });

  it("allows sequential, non-overlapping circle assignments (transfer history)", () => {
    const closedFirstAssignment: UserRoleAssignment = {
      id: "asgn-circ-a-closed",
      userId: "usr-inspector-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circ-a",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-06-30T23:59:59.999Z" // closed before second starts
    };

    const secondCandidate: UserRoleAssignment = {
      id: "asgn-circ-b-new",
      userId: "usr-inspector-1",
      roleCode: "INSPECTOR",
      jurisdictionId: "circ-b",
      validFrom: "2026-07-01T00:00:00.000Z",
      validTo: null
    };

    const asOf = new Date("2026-08-01T00:00:00.000Z");
    const result = validateInspectorCircleAssignment(
      secondCandidate,
      [closedFirstAssignment],
      jurisdictions,
      asOf
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Active assignment check
    const active = getActiveAssignments(
      "usr-inspector-1",
      [closedFirstAssignment, secondCandidate],
      asOf
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.jurisdictionId).toBe("circ-b");
  });

  it("validates assignment history and flags overlapping intervals", () => {
    const overlappingHistory: readonly UserRoleAssignment[] = [
      {
        id: "a1",
        userId: "usr-1",
        roleCode: "INSPECTOR",
        jurisdictionId: "circ-a",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2026-06-01T00:00:00.000Z"
      },
      {
        id: "a2",
        userId: "usr-1",
        roleCode: "INSPECTOR",
        jurisdictionId: "circ-b",
        validFrom: "2026-05-01T00:00:00.000Z", // overlaps May 1 to June 1
        validTo: "2026-12-31T00:00:00.000Z"
      }
    ];

    const result = validateAssignmentHistory(overlappingHistory);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CONCURRENT_OVERLAPPING_ASSIGNMENT")).toBe(true);
  });
});

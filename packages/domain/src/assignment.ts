import { Jurisdiction } from "./jurisdiction.js";

export interface UserRoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly roleCode: string;
  readonly jurisdictionId: string;
  readonly validFrom: string; // ISO string e.g. 2026-01-01T00:00:00.000Z or YYYY-MM-DD
  readonly validTo?: string | null;
}

export interface AssignmentValidationError {
  readonly assignmentId?: string;
  readonly code: string;
  readonly message: string;
}

export interface AssignmentValidationResult {
  readonly valid: boolean;
  readonly errors: readonly AssignmentValidationError[];
}

export function isAssignmentActiveAt(assignment: UserRoleAssignment, asOf: Date | string): boolean {
  const asOfTime = new Date(asOf).getTime();
  const fromTime = new Date(assignment.validFrom).getTime();
  if (isNaN(fromTime)) return false;
  if (asOfTime < fromTime) return false;

  if (assignment.validTo) {
    const toTime = new Date(assignment.validTo).getTime();
    if (!isNaN(toTime) && asOfTime >= toTime) return false;
  }

  return true;
}

export function getActiveAssignments(
  userId: string,
  history: readonly UserRoleAssignment[],
  asOf: Date | string
): readonly UserRoleAssignment[] {
  return history.filter((a) => a.userId === userId && isAssignmentActiveAt(a, asOf));
}

export function validateInspectorCircleAssignment(
  candidate: UserRoleAssignment,
  existingHistory: readonly UserRoleAssignment[],
  jurisdictions: readonly Jurisdiction[],
  asOf: Date | string
): AssignmentValidationResult {
  const errors: AssignmentValidationError[] = [];

  if (candidate.roleCode !== "INSPECTOR") {
    errors.push({
      code: "INVALID_ROLE",
      message: `Expected role INSPECTOR but received ${candidate.roleCode}`
    });
    return { valid: false, errors };
  }

  // Validate target jurisdiction is a valid active circle
  const targetJurisdiction = jurisdictions.find((j) => j.id === candidate.jurisdictionId);
  if (!targetJurisdiction) {
    errors.push({
      code: "JURISDICTION_NOT_FOUND",
      message: `Target jurisdiction ${candidate.jurisdictionId} does not exist`
    });
  } else if (targetJurisdiction.type !== "CIRCLE") {
    errors.push({
      code: "INVALID_JURISDICTION_TYPE",
      message: `Inspector must be assigned to a CIRCLE, but target is ${targetJurisdiction.type}`
    });
  }

  const candidateFrom = new Date(candidate.validFrom).getTime();
  const candidateTo = candidate.validTo ? new Date(candidate.validTo).getTime() : Infinity;

  if (candidateTo <= candidateFrom) {
    errors.push({
      code: "INVALID_DATE_RANGE",
      message: "validTo must be strictly greater than validFrom"
    });
  }

  // Enforce "one active inspector-circle assignment rule" across history
  const inspectorAssignments = existingHistory.filter(
    (a) => a.userId === candidate.userId && a.roleCode === "INSPECTOR"
  );

  for (const existing of inspectorAssignments) {
    if (existing.id === candidate.id) continue;

    const existingFrom = new Date(existing.validFrom).getTime();
    const existingTo = existing.validTo ? new Date(existing.validTo).getTime() : Infinity;

    // Check for overlapping intervals
    const overlaps = candidateFrom < existingTo && candidateTo > existingFrom;
    if (overlaps) {
      errors.push({
        assignmentId: existing.id,
        code: "OVERLAPPING_ASSIGNMENT",
        message: `Inspector already has an overlapping circle assignment (${existing.jurisdictionId}) from ${existing.validFrom} to ${existing.validTo ?? "indefinite"}`
      });
    }
  }

  // Check if active at asOf date
  const candidateActiveNow = isAssignmentActiveAt(candidate, asOf);
  if (candidateActiveNow) {
    const currentlyActive = inspectorAssignments.filter(
      (a) => a.id !== candidate.id && isAssignmentActiveAt(a, asOf)
    );
    if (currentlyActive.length > 0) {
      errors.push({
        code: "MULTIPLE_ACTIVE_ASSIGNMENTS",
        message: `Inspector already has an active circle assignment at ${new Date(asOf).toISOString()}`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateAssignmentHistory(
  assignments: readonly UserRoleAssignment[]
): AssignmentValidationResult {
  const errors: AssignmentValidationError[] = [];
  const grouped = new Map<string, UserRoleAssignment[]>();

  for (const a of assignments) {
    const key = `${a.userId}:${a.roleCode}`;
    const list = grouped.get(key) ?? [];
    list.push(a);
    grouped.set(key, list);

    const from = new Date(a.validFrom).getTime();
    const to = a.validTo ? new Date(a.validTo).getTime() : Infinity;
    if (to <= from) {
      errors.push({
        assignmentId: a.id,
        code: "INVALID_DATE_RANGE",
        message: `validTo must be after validFrom for assignment ${a.id}`
      });
    }
  }

  for (const [key, userRoleList] of grouped.entries()) {
    for (let i = 0; i < userRoleList.length; i++) {
      for (let j = i + 1; j < userRoleList.length; j++) {
        const a1 = userRoleList[i];
        const a2 = userRoleList[j];
        if (!a1 || !a2) continue;

        const from1 = new Date(a1.validFrom).getTime();
        const to1 = a1.validTo ? new Date(a1.validTo).getTime() : Infinity;
        const from2 = new Date(a2.validFrom).getTime();
        const to2 = a2.validTo ? new Date(a2.validTo).getTime() : Infinity;

        if (from1 < to2 && to1 > from2) {
          errors.push({
            assignmentId: a2.id,
            code: "CONCURRENT_OVERLAPPING_ASSIGNMENT",
            message: `Concurrent overlapping assignment for ${key}: [${a1.id}] and [${a2.id}] overlap in effective dates`
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

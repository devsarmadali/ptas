import { Jurisdiction, isDescendantOrSelf } from "./jurisdiction.js";
import { UserRoleAssignment, isAssignmentActiveAt } from "./assignment.js";

export type AccessDecisionReason =
  "ALLOWED" | "NO_ACTIVE_ASSIGNMENT" | "UNRELATED_JURISDICTION" | "INSUFFICIENT_ROLE";

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: AccessDecisionReason;
  readonly matchedAssignment?: UserRoleAssignment | undefined;
  readonly message: string;
}

export interface AuthSubject {
  readonly userId: string;
  readonly assignments: readonly UserRoleAssignment[];
}

export interface EvaluateJurisdictionAccessParams {
  readonly subject: AuthSubject;
  readonly targetJurisdictionId: string;
  readonly jurisdictions: readonly Jurisdiction[];
  readonly asOf: Date | string;
}

export function evaluateJurisdictionAccess({
  subject,
  targetJurisdictionId,
  jurisdictions,
  asOf
}: EvaluateJurisdictionAccessParams): AccessDecision {
  const activeAssignments = subject.assignments.filter((a) => isAssignmentActiveAt(a, asOf));

  if (activeAssignments.length === 0) {
    return {
      allowed: false,
      reason: "NO_ACTIVE_ASSIGNMENT",
      message: `User ${subject.userId} has no active jurisdiction assignments as of ${new Date(asOf).toISOString()}`
    };
  }

  for (const assignment of activeAssignments) {
    if (isDescendantOrSelf(targetJurisdictionId, assignment.jurisdictionId, jurisdictions)) {
      return {
        allowed: true,
        reason: "ALLOWED",
        matchedAssignment: assignment,
        message: `Access granted via active ${assignment.roleCode} assignment to ${assignment.jurisdictionId}`
      };
    }
  }

  return {
    allowed: false,
    reason: "UNRELATED_JURISDICTION",
    message: `User ${subject.userId} does not have jurisdiction over ${targetJurisdictionId}`
  };
}

export type DomainAction = "VIEW" | "DRAFT" | "SUBMIT" | "APPROVE" | "REVISE";

export interface EvaluateActionAccessParams extends EvaluateJurisdictionAccessParams {
  readonly action: DomainAction;
}

const STATUTORY_APPROVAL_ROLES = new Set(["ETO", "DIRECTOR", "ADMIN"]);

export function evaluateActionAccess(params: EvaluateActionAccessParams): AccessDecision {
  const jurisdictionDecision = evaluateJurisdictionAccess(params);
  if (!jurisdictionDecision.allowed) {
    return jurisdictionDecision;
  }

  const role = jurisdictionDecision.matchedAssignment?.roleCode;

  if (params.action === "APPROVE") {
    if (!role || !STATUTORY_APPROVAL_ROLES.has(role)) {
      return {
        allowed: false,
        reason: "INSUFFICIENT_ROLE",
        matchedAssignment: jurisdictionDecision.matchedAssignment,
        message: `Role ${role} is not legally authorized to approve statutory decisions (requires assessing authority ETO or higher)`
      };
    }
  }

  return {
    allowed: true,
    reason: "ALLOWED",
    matchedAssignment: jurisdictionDecision.matchedAssignment,
    message: `Authorized to perform ${params.action} on jurisdiction ${params.targetJurisdictionId}`
  };
}

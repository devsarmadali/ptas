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

export type DomainAction =
  "VIEW" | "DRAFT" | "SUBMIT" | "RETURN" | "APPROVE" | "REVISE" | "ADMINISTER_USERS" | "VIEW_AUDIT";

export interface EvaluateActionAccessParams extends EvaluateJurisdictionAccessParams {
  readonly action: DomainAction;
}

const ACTION_ROLES: Readonly<Record<DomainAction, ReadonlySet<string>>> = {
  VIEW: new Set(["INSPECTOR", "ETO", "DIRECTOR", "AUDITOR", "FINANCE"]),
  DRAFT: new Set(["INSPECTOR"]),
  SUBMIT: new Set(["INSPECTOR"]),
  RETURN: new Set(["ETO"]),
  APPROVE: new Set(["ETO"]),
  REVISE: new Set(["INSPECTOR"]),
  ADMINISTER_USERS: new Set(["ADMIN"]),
  VIEW_AUDIT: new Set(["DIRECTOR", "AUDITOR"])
};

export function evaluateActionAccess(params: EvaluateActionAccessParams): AccessDecision {
  const jurisdictionDecision = evaluateJurisdictionAccess(params);
  if (!jurisdictionDecision.allowed) {
    return jurisdictionDecision;
  }

  const role = jurisdictionDecision.matchedAssignment?.roleCode;

  const allowedRoles = ACTION_ROLES[params.action];
  if (!role || !allowedRoles.has(role)) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_ROLE",
      matchedAssignment: jurisdictionDecision.matchedAssignment,
      message: `Role ${role ?? "UNASSIGNED"} is not authorized to perform ${params.action}`
    };
  }

  return {
    allowed: true,
    reason: "ALLOWED",
    matchedAssignment: jurisdictionDecision.matchedAssignment,
    message: `Authorized to perform ${params.action} on jurisdiction ${params.targetJurisdictionId}`
  };
}

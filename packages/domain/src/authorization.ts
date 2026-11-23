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
  | "VIEW"
  | "DRAFT"
  | "SUBMIT"
  | "RETURN"
  | "APPROVE"
  | "REVISE"
  | "DELIVER_NOTICE"
  | "MANAGE_JURISDICTION_POSTS"
  | "ADMINISTER_USERS"
  | "VIEW_AUDIT";

export interface EvaluateActionAccessParams extends EvaluateJurisdictionAccessParams {
  readonly action: DomainAction;
}

function normalizeRoleCode(roleCode: string): string {
  const upper = roleCode.trim().toUpperCase();
  if (upper === "DIRECTOR") return "DET";
  if (upper === "INSPECTOR") return "ETI";
  return upper;
}

const ACTION_ROLES: Readonly<Record<DomainAction, ReadonlySet<string>>> = {
  VIEW: new Set(["ETI", "ETO", "DET", "AUDITOR", "FINANCE"]),
  DRAFT: new Set(["ETI"]),
  SUBMIT: new Set(["ETI"]),
  RETURN: new Set(["ETO"]),
  APPROVE: new Set(["ETO"]),
  REVISE: new Set(["ETI"]),
  DELIVER_NOTICE: new Set(["ETC", "ETI"]),
  MANAGE_JURISDICTION_POSTS: new Set(["ADMIN", "DET", "ETO"]),
  ADMINISTER_USERS: new Set(["ADMIN", "DET", "ETO"]),
  VIEW_AUDIT: new Set(["DET", "AUDITOR", "ADMIN"])
};

export function evaluateActionAccess(params: EvaluateActionAccessParams): AccessDecision {
  const activeAssignments = params.subject.assignments.filter((a) =>
    isAssignmentActiveAt(a, params.asOf)
  );
  if (activeAssignments.length === 0) {
    return {
      allowed: false,
      reason: "NO_ACTIVE_ASSIGNMENT",
      message: `User ${params.subject.userId} has no active jurisdiction assignments as of ${new Date(params.asOf).toISOString()}`
    };
  }

  const matchingAssignments = activeAssignments.filter((assignment) =>
    isDescendantOrSelf(params.targetJurisdictionId, assignment.jurisdictionId, params.jurisdictions)
  );
  if (matchingAssignments.length === 0) {
    return {
      allowed: false,
      reason: "UNRELATED_JURISDICTION",
      message: `User ${params.subject.userId} does not have jurisdiction over ${params.targetJurisdictionId}`
    };
  }

  const allowedRoles = ACTION_ROLES[params.action];
  const authorizedAssignment = matchingAssignments.find((a) =>
    allowedRoles.has(normalizeRoleCode(a.roleCode))
  );

  if (!authorizedAssignment) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_ROLE",
      matchedAssignment: matchingAssignments[0],
      message: `Role ${matchingAssignments[0]?.roleCode ?? "UNASSIGNED"} is not authorized to perform ${params.action}`
    };
  }

  return {
    allowed: true,
    reason: "ALLOWED",
    matchedAssignment: authorizedAssignment,
    message: `Authorized to perform ${params.action} on jurisdiction ${params.targetJurisdictionId}`
  };
}

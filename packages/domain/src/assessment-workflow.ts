export type AssessmentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "RETURNED"
  | "HEARING_RECORDED"
  | "APPROVED"
  | "REVISION_DRAFT"
  | "RESUBMITTED"
  | "DECISION_REQUESTED"
  | "WITHDRAWN"
  | "ADJUSTED";

export type AssessmentAction =
  | "SUBMIT"
  | "RETURN"
  | "RECORD_HEARING"
  | "APPROVE"
  | "CREATE_REVISION"
  | "RESUBMIT"
  | "REQUEST_DECISION"
  | "APPROVE_WITHDRAWAL"
  | "APPROVE_ADJUSTMENT";

const transitions: Readonly<
  Record<AssessmentStatus, Partial<Record<AssessmentAction, AssessmentStatus>>>
> = {
  DRAFT: { SUBMIT: "SUBMITTED" },
  SUBMITTED: { RETURN: "RETURNED", RECORD_HEARING: "HEARING_RECORDED", APPROVE: "APPROVED" },
  RETURNED: { SUBMIT: "SUBMITTED" },
  HEARING_RECORDED: { APPROVE: "APPROVED", RETURN: "RETURNED" },
  APPROVED: { CREATE_REVISION: "REVISION_DRAFT", REQUEST_DECISION: "DECISION_REQUESTED" },
  REVISION_DRAFT: { RESUBMIT: "RESUBMITTED" },
  RESUBMITTED: { APPROVE: "APPROVED", RETURN: "RETURNED" },
  DECISION_REQUESTED: { APPROVE_WITHDRAWAL: "WITHDRAWN", APPROVE_ADJUSTMENT: "ADJUSTED" },
  WITHDRAWN: {},
  ADJUSTED: { CREATE_REVISION: "REVISION_DRAFT" }
};

export function transitionAssessment(
  status: AssessmentStatus,
  action: AssessmentAction
): AssessmentStatus {
  const next = transitions[status][action];
  if (!next) {
    throw new Error(`Action ${action} is not allowed from ${status}`);
  }
  return next;
}

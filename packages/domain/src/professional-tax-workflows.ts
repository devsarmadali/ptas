export type WorkflowRole = "INSPECTOR" | "ETO" | "FINANCE" | "DIRECTOR" | "SYSTEM";

export interface TransitionRule<State extends string, Action extends string> {
  readonly from: State;
  readonly action: Action;
  readonly to: State;
  readonly roles: readonly WorkflowRole[];
  readonly requiresReason?: boolean;
}

function applyTransition<State extends string, Action extends string>(
  rules: readonly TransitionRule<State, Action>[],
  state: State,
  action: Action,
  role: WorkflowRole,
  reason?: string
): State {
  const rule = rules.find((candidate) => candidate.from === state && candidate.action === action);
  if (!rule) throw new Error(`Action ${action} is not allowed from ${state}`);
  if (!rule.roles.includes(role)) throw new Error(`Role ${role} is not authorized for ${action}`);
  if (rule.requiresReason && !reason?.trim()) throw new Error(`${action} requires a reason`);
  return rule.to;
}

export type SurveyState = "NEW" | "FEEDED" | "SUBMITTED" | "RETURNED" | "APPROVED" | "CLOSED";
export type SurveyAction = "FEED" | "SUBMIT" | "RETURN" | "APPROVE" | "CLOSE" | "RESUBMIT";

export const SURVEY_TRANSITIONS: readonly TransitionRule<SurveyState, SurveyAction>[] = [
  { from: "NEW", action: "FEED", to: "FEEDED", roles: ["INSPECTOR"] },
  { from: "NEW", action: "CLOSE", to: "CLOSED", roles: ["INSPECTOR"], requiresReason: true },
  { from: "FEEDED", action: "SUBMIT", to: "SUBMITTED", roles: ["INSPECTOR"] },
  { from: "FEEDED", action: "CLOSE", to: "CLOSED", roles: ["INSPECTOR"], requiresReason: true },
  { from: "SUBMITTED", action: "RETURN", to: "RETURNED", roles: ["ETO"], requiresReason: true },
  { from: "SUBMITTED", action: "APPROVE", to: "APPROVED", roles: ["ETO"] },
  { from: "RETURNED", action: "RESUBMIT", to: "SUBMITTED", roles: ["INSPECTOR"] }
];

export function transitionSurvey(
  state: SurveyState,
  action: SurveyAction,
  role: WorkflowRole,
  reason?: string
): SurveyState {
  return applyTransition(SURVEY_TRANSITIONS, state, action, role, reason);
}

export type ShowCauseState =
  "CREATED" | "ISSUED" | "SERVED" | "SERVICE_RECORDED" | "PROCESS_COMPLETED" | "PENALTY_IMPOSED";
export type ShowCauseAction =
  "ISSUE" | "SERVE" | "RECORD_SERVICE" | "COMPLETE_PROCESS" | "IMPOSE_PENALTY";

const SHOW_CAUSE_TRANSITIONS: readonly TransitionRule<ShowCauseState, ShowCauseAction>[] = [
  { from: "CREATED", action: "ISSUE", to: "ISSUED", roles: ["ETO"] },
  { from: "ISSUED", action: "SERVE", to: "SERVED", roles: ["INSPECTOR"] },
  { from: "SERVED", action: "RECORD_SERVICE", to: "SERVICE_RECORDED", roles: ["INSPECTOR"] },
  {
    from: "SERVICE_RECORDED",
    action: "COMPLETE_PROCESS",
    to: "PROCESS_COMPLETED",
    roles: ["ETO"],
    requiresReason: true
  },
  {
    from: "PROCESS_COMPLETED",
    action: "IMPOSE_PENALTY",
    to: "PENALTY_IMPOSED",
    roles: ["ETO"],
    requiresReason: true
  }
];

export function transitionShowCause(
  state: ShowCauseState,
  action: ShowCauseAction,
  role: WorkflowRole,
  reason?: string
): ShowCauseState {
  return applyTransition(SHOW_CAUSE_TRANSITIONS, state, action, role, reason);
}

export type DeletionRequestState = "PENDING" | "RETURNED" | "APPROVED";
export type DeletionRequestAction = "RETURN" | "APPROVE" | "RESUBMIT";
const DELETION_TRANSITIONS: readonly TransitionRule<DeletionRequestState, DeletionRequestAction>[] =
  [
    { from: "PENDING", action: "RETURN", to: "RETURNED", roles: ["ETO"], requiresReason: true },
    { from: "PENDING", action: "APPROVE", to: "APPROVED", roles: ["ETO"], requiresReason: true },
    {
      from: "RETURNED",
      action: "RESUBMIT",
      to: "PENDING",
      roles: ["INSPECTOR"],
      requiresReason: true
    }
  ];

export function transitionDeletionRequest(
  state: DeletionRequestState,
  action: DeletionRequestAction,
  role: WorkflowRole,
  reason?: string
): DeletionRequestState {
  return applyTransition(DELETION_TRANSITIONS, state, action, role, reason);
}

export type ChallanAdministrativeState = "PREPARED" | "ISSUED" | "CANCELLED";
export type ChallanPaymentState = "OUTSTANDING" | "RECEIVED";

export function canReceiveChallanPayment(
  administrativeState: ChallanAdministrativeState,
  paymentState: ChallanPaymentState
): boolean {
  return administrativeState !== "PREPARED" && paymentState === "OUTSTANDING";
}

export function isAutomaticCancellationDue(
  administrativeState: ChallanAdministrativeState,
  paymentState: ChallanPaymentState,
  dueDate: string,
  pakistanBusinessDate: string,
  graceDays = 3
): boolean {
  if (administrativeState !== "ISSUED" || paymentState !== "OUTSTANDING") return false;
  const boundary = new Date(`${dueDate}T00:00:00+05:00`);
  boundary.setUTCDate(boundary.getUTCDate() + graceDays + 1);
  const today = new Date(`${pakistanBusinessDate}T00:00:00+05:00`);
  return today.getTime() >= boundary.getTime();
}

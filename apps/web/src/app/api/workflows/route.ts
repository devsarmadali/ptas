import { createPtasSupabaseClient } from "@ptas/database/client";
import { NextResponse } from "next/server";

type WorkflowCommand =
  | { type: "SURVEY_TRANSITION"; payload: Record<string, unknown> }
  | { type: "REQUEST_DEMAND_DELETION"; payload: Record<string, unknown> }
  | { type: "REVIEW_DEMAND_DELETION"; payload: Record<string, unknown> }
  | { type: "SHOW_CAUSE_TRANSITION"; payload: Record<string, unknown> }
  | { type: "PFT2_TRANSITION"; payload: Record<string, unknown> }
  | { type: "RECEIVE_PFT2_PAYMENT"; payload: Record<string, unknown> }
  | { type: "STAGE_SURVEY_IMPORT"; payload: Record<string, unknown> }
  | { type: "PROMOTE_SURVEY_IMPORT"; payload: Record<string, unknown> }
  | { type: "BULK_SUBMIT_SURVEY_IMPORT"; payload: Record<string, unknown> }
  | { type: "BULK_APPROVE_SURVEY_IMPORT"; payload: Record<string, unknown> };

const RPC_BY_COMMAND = {
  SURVEY_TRANSITION: "transition_survey_unit",
  REQUEST_DEMAND_DELETION: "request_demand_deletion",
  REVIEW_DEMAND_DELETION: "review_demand_deletion",
  SHOW_CAUSE_TRANSITION: "transition_show_cause",
  PFT2_TRANSITION: "transition_pft2_challan",
  RECEIVE_PFT2_PAYMENT: "receive_pft2_payment",
  STAGE_SURVEY_IMPORT: "stage_survey_import_current",
  PROMOTE_SURVEY_IMPORT: "promote_survey_import",
  BULK_SUBMIT_SURVEY_IMPORT: "bulk_submit_survey_import",
  BULK_APPROVE_SURVEY_IMPORT: "bulk_approve_survey_import"
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authenticated bearer session required" }, { status: 401 });
  }
  const accessToken = authorization.slice(7).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "Workflow service unavailable" }, { status: 503 });

  const supabase = createPtasSupabaseClient({ url, key, accessToken });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  let command: WorkflowCommand;
  try {
    command = (await request.json()) as WorkflowCommand;
  } catch {
    return NextResponse.json({ error: "Invalid JSON command" }, { status: 400 });
  }
  const rpc = RPC_BY_COMMAND[command.type];
  if (!rpc || !command.payload || typeof command.payload !== "object") {
    return NextResponse.json({ error: "Unsupported workflow command" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc(rpc, command.payload as never);
  if (error) {
    const conflict = error.code === "40001" || error.code === "23505";
    const forbidden = error.code === "42501";
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: conflict ? 409 : forbidden ? 403 : 422 }
    );
  }
  return NextResponse.json({ data }, { status: 200 });
}

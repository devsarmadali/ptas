import { createPtasSupabaseClient } from "@ptas/database/client";
import { NextResponse } from "next/server";
import {
  MAX_WORKFLOW_BODY_BYTES,
  buildNoStoreHeaders,
  checkSlidingWindowRateLimit,
  createRequestId,
  extractClientIp,
  hashRateLimitSubject
} from "../../../lib/api-security";

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
  const requestId = createRequestId();
  const baseHeaders = buildNoStoreHeaders(requestId);

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json(
          { error: "Cross-origin workflow request rejected", requestId },
          { status: 403, headers: baseHeaders }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Malformed origin header", requestId },
        { status: 400, headers: baseHeaders }
      );
    }
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_WORKFLOW_BODY_BYTES) {
      return NextResponse.json(
        { error: "Workflow command payload exceeds maximum allowed size", requestId },
        { status: 413, headers: baseHeaders }
      );
    }
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authenticated bearer session required", requestId },
      { status: 401, headers: baseHeaders }
    );
  }
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Authenticated bearer session required", requestId },
      { status: 401, headers: baseHeaders }
    );
  }

  const rateKey = `wf:${hashRateLimitSubject(`${accessToken}:${extractClientIp(request.headers)}`)}`;
  const rateLimit = checkSlidingWindowRateLimit(rateKey, { limit: 60, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many workflow requests. Please retry shortly.", requestId },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Workflow service unavailable", requestId },
      { status: 503, headers: baseHeaders }
    );
  }

  const supabase = createPtasSupabaseClient({ url, key, accessToken });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Invalid or expired session", requestId },
      { status: 401, headers: baseHeaders }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Unable to read command request body", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_WORKFLOW_BODY_BYTES) {
    return NextResponse.json(
      { error: "Workflow command payload exceeds maximum allowed size", requestId },
      { status: 413, headers: baseHeaders }
    );
  }

  let command: WorkflowCommand;
  try {
    command = JSON.parse(rawBody) as WorkflowCommand;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON command", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  const rpc =
    command && typeof command === "object" && !Array.isArray(command)
      ? RPC_BY_COMMAND[command.type]
      : undefined;
  if (
    !rpc ||
    !command.payload ||
    typeof command.payload !== "object" ||
    Array.isArray(command.payload)
  ) {
    return NextResponse.json(
      { error: "Unsupported workflow command", requestId },
      { status: 400, headers: baseHeaders }
    );
  }

  const { data, error } = await supabase.rpc(rpc, command.payload as never);
  if (error) {
    console.error(`[PTAS Workflow RPC Error] req=${requestId} rpc=${rpc}:`, {
      code: error.code,
      message: error.message
    });
    const conflict = error.code === "40001" || error.code === "23505";
    const forbidden = error.code === "42501";
    const sanitizedMessage = conflict
      ? "Conflict: Record has been concurrently updated or duplicate identifier exists."
      : forbidden
        ? "Access denied: Insufficient privileges or jurisdiction mismatch for this statutory command."
        : "The submitted workflow command could not be processed according to statutory validation rules.";
    return NextResponse.json(
      { error: sanitizedMessage, code: error.code, requestId },
      { status: conflict ? 409 : forbidden ? 403 : 422, headers: baseHeaders }
    );
  }
  return NextResponse.json({ data, requestId }, { status: 200, headers: baseHeaders });
}

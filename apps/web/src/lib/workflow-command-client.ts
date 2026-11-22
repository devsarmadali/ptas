import { getSupabaseAuthClient } from "./supabase-auth";

const WORKFLOW_REQUEST_TIMEOUT_MS = 30_000;
const MAX_IDEMPOTENT_RETRIES = 2;

export async function executeWorkflowCommand<T>(
  type:
    | "SURVEY_TRANSITION"
    | "REQUEST_DEMAND_DELETION"
    | "REVIEW_DEMAND_DELETION"
    | "SHOW_CAUSE_TRANSITION"
    | "PFT2_TRANSITION"
    | "RECEIVE_PFT2_PAYMENT"
    | "STAGE_SURVEY_IMPORT"
    | "PROMOTE_SURVEY_IMPORT"
    | "BULK_SUBMIT_SURVEY_IMPORT"
    | "BULK_APPROVE_SURVEY_IMPORT",
  payload: Readonly<Record<string, unknown>>
): Promise<T> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) throw new Error("Authenticated workflow service is not configured");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Authenticated workflow session required");

  const hasIdempotencyKey =
    typeof payload.p_idempotency_key === "string" && payload.p_idempotency_key.trim().length > 0;
  const maxAttempts = hasIdempotencyKey ? MAX_IDEMPOTENT_RETRIES + 1 : 1;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, payload }),
        signal: AbortSignal.timeout(WORKFLOW_REQUEST_TIMEOUT_MS)
      });

      const isTransientStatus =
        response.status === 502 || response.status === 503 || response.status === 504;

      let body: { data?: T; error?: string } = {};
      try {
        body = (await response.json()) as { data?: T; error?: string };
      } catch {
        body = {};
      }

      if (response.ok && body.data !== undefined) {
        return body.data;
      }

      const error = new Error(body.error ?? `Workflow command failed (HTTP ${response.status})`);
      if (!isTransientStatus || attempt >= maxAttempts) {
        throw error;
      }
      lastError = error;
    } catch (err) {
      const normalizedError =
        err instanceof Error ? err : new Error("Workflow network request failed");
      const isAbortOrNetwork =
        normalizedError.name === "TimeoutError" ||
        normalizedError.name === "AbortError" ||
        normalizedError instanceof TypeError ||
        normalizedError.message.includes("HTTP 50");
      if (!isAbortOrNetwork || attempt >= maxAttempts) {
        throw normalizedError;
      }
      lastError = normalizedError;
    }

    const delayMs = attempt * 250 + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw lastError ?? new Error("Workflow command failed");
}

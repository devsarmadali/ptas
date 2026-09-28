import { getSupabaseAuthClient } from "./supabase-auth";

export async function executeWorkflowCommand<T>(
  type:
    | "SURVEY_TRANSITION"
    | "REQUEST_DEMAND_DELETION"
    | "REVIEW_DEMAND_DELETION"
    | "SHOW_CAUSE_TRANSITION"
    | "PFT2_TRANSITION"
    | "RECEIVE_PFT2_PAYMENT",
  payload: Readonly<Record<string, unknown>>
): Promise<T> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) throw new Error("Authenticated workflow service is not configured");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Authenticated workflow session required");

  const response = await fetch("/api/workflows", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, payload })
  });
  const body = (await response.json()) as { data?: T; error?: string };
  if (!response.ok || body.data === undefined) {
    throw new Error(body.error ?? "Workflow command failed");
  }
  return body.data;
}

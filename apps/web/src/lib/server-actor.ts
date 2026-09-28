import { createPtasSupabaseClient } from "@ptas/database/client";
import type { DocumentAuthorizationContext } from "./pdf/types";

const ALLOWED_ROLES = new Set(["INSPECTOR", "ETO", "DIRECTOR", "FINANCE", "AUDITOR"]);

export async function resolveDocumentActor(
  authorizationHeader: string | null
): Promise<DocumentAuthorizationContext> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new Error("Authorization required: verified bearer session missing");
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new Error("Authorization required: bearer token missing");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Authorization service is not configured");
  }

  const supabase = createPtasSupabaseClient({ url, key, accessToken });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Authorization required: invalid or expired session");
  }

  const { data: assignment, error: assignmentError } = await supabase.rpc("resolve_my_ptas_actor");
  if (
    assignmentError ||
    !assignment ||
    typeof assignment !== "object" ||
    Array.isArray(assignment)
  ) {
    throw new Error("Authorization denied: active PTAS assignment lookup failed");
  }

  const actor = assignment as { role?: unknown; jurisdiction_id?: unknown; user_id?: unknown };
  const role = String(actor.role ?? "").toUpperCase();
  const jurisdictionId = String(actor.jurisdiction_id ?? "").trim();
  if (!ALLOWED_ROLES.has(role) || !jurisdictionId) {
    throw new Error("Authorization denied: active PTAS role and jurisdiction assignment required");
  }

  return { officerId: String(actor.user_id ?? data.user.id), role, jurisdictionId };
}

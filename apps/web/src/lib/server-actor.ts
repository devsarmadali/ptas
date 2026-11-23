import { createHash } from "node:crypto";
import { createPtasSupabaseClient } from "@ptas/database/client";
import type { DocumentAuthorizationContext } from "./pdf/types";

// Note: ETC (BS-05 Notice Delivery Only) and ADMIN are explicitly excluded from statutory PDF endpoints.
const CANONICAL_DOCUMENT_ROLE_MAP: Readonly<Record<string, string>> = {
  INSPECTOR: "INSPECTOR",
  ETI: "INSPECTOR",
  ETO: "ETO",
  DIRECTOR: "DIRECTOR",
  DET: "DIRECTOR",
  FINANCE: "FINANCE",
  AUDITOR: "AUDITOR"
};
const ACTOR_CACHE_TTL_MS = 15_000;
const ACTOR_CACHE_MAX_ENTRIES = 512;

interface CachedActorEntry {
  context: DocumentAuthorizationContext;
  expiresAt: number;
}

const actorCache = new Map<string, CachedActorEntry>();
const inFlightActorLookups = new Map<string, Promise<DocumentAuthorizationContext>>();

function hashAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

function extractJwtExpiryMs(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

export function clearDocumentActorCache(): void {
  actorCache.clear();
  inFlightActorLookups.clear();
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function createScopedSupabaseClient(authorizationHeader: string | null) {
  const accessToken = extractBearerToken(authorizationHeader);
  if (!accessToken) {
    throw new Error("Authorization required: verified bearer session missing");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Authorization service is not configured");
  }
  return createPtasSupabaseClient({ url, key, accessToken });
}

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

  const cacheKey = hashAccessToken(accessToken);
  const now = Date.now();
  const cached = actorCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > now) {
      return { ...cached.context };
    }
    actorCache.delete(cacheKey);
  }

  const inFlight = inFlightActorLookups.get(cacheKey);
  if (inFlight) {
    return { ...(await inFlight) };
  }

  const lookupPromise = (async (): Promise<DocumentAuthorizationContext> => {
    const supabase = createPtasSupabaseClient({ url, key, accessToken });
    const authResult = await supabase.auth.getUser(accessToken);
    const data = authResult?.data;
    const error = authResult?.error;
    if (error || !data?.user) {
      throw new Error("Authorization required: invalid or expired session");
    }

    const { data: assignment, error: assignmentError } =
      await supabase.rpc("resolve_my_ptas_actor");
    if (
      assignmentError ||
      !assignment ||
      typeof assignment !== "object" ||
      Array.isArray(assignment)
    ) {
      throw new Error("Authorization denied: active PTAS assignment lookup failed");
    }

    const actor = assignment as { role?: unknown; jurisdiction_id?: unknown; user_id?: unknown };
    const rawRole = String(actor.role ?? "")
      .trim()
      .toUpperCase();
    const role = CANONICAL_DOCUMENT_ROLE_MAP[rawRole];
    const jurisdictionId = String(actor.jurisdiction_id ?? "").trim();
    if (!role || !jurisdictionId) {
      throw new Error(
        "Authorization denied: active PTAS role and jurisdiction assignment required"
      );
    }

    const context: DocumentAuthorizationContext = {
      officerId: String(actor.user_id ?? data.user.id),
      role,
      jurisdictionId
    };

    const jwtExpMs = extractJwtExpiryMs(accessToken);
    const resolvedAt = Date.now();
    const expiresAt =
      jwtExpMs !== null
        ? Math.min(resolvedAt + ACTOR_CACHE_TTL_MS, jwtExpMs)
        : resolvedAt + ACTOR_CACHE_TTL_MS;

    if (expiresAt > resolvedAt) {
      if (actorCache.size >= ACTOR_CACHE_MAX_ENTRIES) {
        for (const [entryKey, entry] of actorCache) {
          if (entry.expiresAt <= resolvedAt) {
            actorCache.delete(entryKey);
          }
        }
        while (actorCache.size >= ACTOR_CACHE_MAX_ENTRIES) {
          const oldestKey = actorCache.keys().next().value;
          if (oldestKey === undefined) break;
          actorCache.delete(oldestKey);
        }
      }
      actorCache.set(cacheKey, { context: { ...context }, expiresAt });
    }

    return context;
  })();

  inFlightActorLookups.set(cacheKey, lookupPromise);
  try {
    return { ...(await lookupPromise) };
  } finally {
    if (inFlightActorLookups.get(cacheKey) === lookupPromise) {
      inFlightActorLookups.delete(cacheKey);
    }
  }
}

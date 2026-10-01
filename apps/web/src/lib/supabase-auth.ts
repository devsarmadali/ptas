/**
 * PTAS Vehari Pilot: Real Supabase Authentication & Multi-User Session Management
 * Governed by:
 * - AGENTS.md: Enforce role and jurisdiction on server/client for every read/write.
 * - Section 3, 3(4), and Section 7 of Punjab Finance Act 1977.
 * - Rules 4, 5, 6, 9, 10, 11, 12, 13 of Punjab Professions and Trades Tax Rules 1977.
 */

import {
  type AuthChangeEvent,
  type Session,
  type User,
  createBrowserSupabaseClient
} from "@ptas/database/client";
import type { MockOfficer, MockRole } from "./pilot-store";

/** @deprecated Login identities are provisioned in Supabase Auth and are never embedded here. */
export interface OfficerCredentialInfo {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: MockRole;
  readonly title: string;
  readonly jurisdictionId: string;
  readonly jurisdictionName: string;
  readonly jurisdictionTier: MockOfficer["jurisdictionTier"];
  readonly badgeText: string;
  readonly statutoryPowers: readonly string[];
}

/** @deprecated Kept temporarily for legacy UI compatibility; production accounts are server-side. */
export const OFFICIAL_OFFICERS_REGISTRY: readonly OfficerCredentialInfo[] = [];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getPasswordResetRedirectUrl(
  browserOrigin: string,
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
): string {
  const localOrigin = browserOrigin.replace(/\/$/, "");
  const productionOrigin = configuredOrigin?.trim().replace(/\/$/, "");
  // Password setup is an externally delivered workflow. Prefer the configured canonical
  // application URL even when the request originates from a local administrator session.
  // Local-only development remains available by leaving NEXT_PUBLIC_APP_URL unset.
  const origin = productionOrigin || localOrigin;
  return `${origin}/account/update-password`;
}

let browserClientInstance: ReturnType<typeof createBrowserSupabaseClient> | null = null;

export function getSupabaseAuthClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase browser authentication is not configured");
  }
  if (!browserClientInstance) {
    browserClientInstance = createBrowserSupabaseClient({
      url: SUPABASE_URL,
      key: SUPABASE_KEY
    });
  }
  return browserClientInstance;
}

export type SignInResult =
  | {
      readonly success: true;
      readonly officer: MockOfficer;
      readonly user: User;
      readonly isCloudAuth: true;
      readonly message: string;
      readonly error?: undefined;
    }
  | {
      readonly success: false;
      readonly isCloudAuth: false;
      readonly message: string;
      readonly error: string;
    };

type ActorAssignment = {
  user_id?: unknown;
  display_name?: unknown;
  role?: unknown;
  jurisdiction_id?: unknown;
  jurisdiction_name?: unknown;
  jurisdiction_tier?: unknown;
};

const ALLOWED_ROLES: readonly MockRole[] = ["INSPECTOR", "ETO", "DIRECTOR", "ADMIN"];
const ALLOWED_JURISDICTION_TIERS: readonly MockOfficer["jurisdictionTier"][] = [
  "REGION",
  "DISTRICT",
  "OFFICE",
  "CIRCLE"
];

export function mapActorAssignmentToOfficer(
  assignment: ActorAssignment,
  user: Pick<User, "id" | "email">
): MockOfficer {
  const role = String(assignment.role ?? "").toUpperCase() as MockRole;
  const jurisdictionTier = String(
    assignment.jurisdiction_tier ?? ""
  ).toUpperCase() as MockOfficer["jurisdictionTier"];
  const jurisdictionId = String(assignment.jurisdiction_id ?? "").trim();

  if (!ALLOWED_ROLES.includes(role) || !ALLOWED_JURISDICTION_TIERS.includes(jurisdictionTier)) {
    throw new Error("Authenticated account has an unsupported PTAS role or jurisdiction tier");
  }
  if (!jurisdictionId) {
    throw new Error("Authenticated account has no active PTAS jurisdiction assignment");
  }

  return {
    id: String(assignment.user_id ?? user.id),
    name: String(assignment.display_name ?? user.email ?? "PTAS Officer"),
    email: user.email ?? "",
    role,
    title:
      role === "ETO"
        ? "Excise & Taxation Officer"
        : role === "INSPECTOR"
          ? "Excise & Taxation Inspector"
          : role === "DIRECTOR"
            ? "Director Excise & Taxation"
            : "System Administrator",
    jurisdictionId,
    jurisdictionName: String(assignment.jurisdiction_name ?? "Assigned Jurisdiction"),
    jurisdictionTier,
    badgeText: `${role} — authenticated database assignment`
  };
}

/** Resolve the current authenticated identity through server-controlled PTAS assignments. */
export async function resolveAuthenticatedOfficer(user: User): Promise<MockOfficer> {
  const supabase = getSupabaseAuthClient();
  const { data: assignment, error } = await supabase.rpc("resolve_my_ptas_actor");
  if (error || !assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
    throw new Error("Authenticated account has no active PTAS role assignment");
  }
  return mapActorAssignmentToOfficer(assignment as ActorAssignment, user);
}

/**
 * Authenticates an officer with Supabase Auth. Authentication failures are fail-closed;
 * offline/demo fallbacks must never create an authorized officer session.
 */
export async function signInOfficer(email: string, password?: string): Promise<SignInResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return {
      success: false,
      isCloudAuth: false,
      message: "Please enter a valid email address.",
      error: "INVALID_EMAIL"
    };
  }

  const effectivePassword = password?.trim();
  if (!effectivePassword) {
    return {
      success: false,
      isCloudAuth: false,
      message: "Password is required.",
      error: "PASSWORD_REQUIRED"
    };
  }

  try {
    const supabase = getSupabaseAuthClient();
    const networkTimeout = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ data: { user: null }, error: new Error("Auth network timeout") }),
        10000
      )
    );
    const { data, error } = await Promise.race([
      supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: effectivePassword
      }),
      networkTimeout
    ]);

    if (!error && data.user) {
      try {
        const officer = await resolveAuthenticatedOfficer(data.user);
        return {
          success: true,
          officer,
          user: data.user,
          isCloudAuth: true,
          message: `Authenticated via Supabase Auth as ${officer.name} (${officer.role})`
        };
      } catch (assignmentError) {
        await supabase.auth.signOut();
        throw assignmentError;
      }
    }

    return {
      success: false,
      isCloudAuth: false,
      message: error?.message || "Authentication failed.",
      error: "AUTHENTICATION_FAILED"
    };
  } catch (err: unknown) {
    console.warn("Supabase Auth failure:", err);
    return {
      success: false,
      isCloudAuth: false,
      message: "Authentication service is unavailable. No officer session was created.",
      error: "AUTH_SERVICE_UNAVAILABLE"
    };
  }
}

/**
 * Signs out the currently authenticated officer.
 */
export async function signOutOfficer(): Promise<void> {
  try {
    const supabase = getSupabaseAuthClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("Sign out note:", err);
  }
}

/**
 * Subscribes to Supabase Auth state changes.
 */
export function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  try {
    const supabase = getSupabaseAuthClient();
    const { data } = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  } catch {
    return {
      unsubscribe: () => {}
    };
  }
}

export type StatutoryAction =
  | "REGISTER_UNIT"
  | "SUBMIT_ASSESSMENT"
  | "APPROVE_ASSESSMENT"
  | "RETURN_ASSESSMENT"
  | "IMPOSE_PENALTY"
  | "ISSUE_RECOVERY_CERTIFICATE"
  | "SCHEDULE_APPEAL_HEARING"
  | "ADJUDICATE_APPEAL"
  | "ISSUE_CLEARANCE_CERTIFICATE"
  | "SUBMIT_DISCONTINUANCE_INSPECTION"
  | "ADJUDICATE_DISCONTINUANCE"
  | "ADJUDICATE_REFUND";

/**
 * Server/Client Enforced Statutory Authority Guard (AGENTS.md Rule 2).
 */
export function verifyOfficerAuthority(
  officer: MockOfficer,
  action: StatutoryAction
): { authorized: boolean; reason?: string } {
  switch (action) {
    case "REGISTER_UNIT":
    case "SUBMIT_ASSESSMENT":
      return officer.role === "INSPECTOR"
        ? { authorized: true }
        : { authorized: false, reason: `Only an assigned Inspector may perform ${action}.` };

    case "APPROVE_ASSESSMENT":
    case "RETURN_ASSESSMENT":
      if (officer.role !== "ETO") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: assessment approval or return requires the assigned ETO. Current role: ${officer.role}.`
        };
      }
      return { authorized: true };

    case "IMPOSE_PENALTY":
    case "ISSUE_RECOVERY_CERTIFICATE":
      if (officer.role !== "ETO") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Section 3(4) penalty imposition and Rule 12 Land Revenue Recovery certification require the assigned Assessing Authority (ETO). Current role: ${officer.role}.`
        };
      }
      return { authorized: true };

    case "SCHEDULE_APPEAL_HEARING":
    case "ADJUDICATE_APPEAL":
      if (officer.role !== "DIRECTOR") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Under Section 7 and Rule 13, only the assigned Appellate Authority (Director) may hear and decide appeals. Current role: ${officer.role}.`
        };
      }
      return { authorized: true };

    case "ISSUE_CLEARANCE_CERTIFICATE":
      if (officer.role !== "ETO") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Form P.F.T-5 Tax Clearance Certificates must be issued under official seal by the assigned Assessing Authority (ETO). Inspectors cannot issue clearance certificates.`
        };
      }
      return { authorized: true };

    case "SUBMIT_DISCONTINUANCE_INSPECTION":
      if (officer.role !== "INSPECTOR") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Field inspections under Rule 10 are conducted by Circle Tax Inspectors.`
        };
      }
      return { authorized: true };

    case "ADJUDICATE_DISCONTINUANCE":
      if (officer.role !== "ETO") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: discontinuance adjudication requires the assigned ETO.`
        };
      }
      return { authorized: true };

    case "ADJUDICATE_REFUND":
      if (officer.role !== "ETO" && officer.role !== "DIRECTOR") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: refund/adjustment adjudication requires an ETO or Director acting under approved policy.`
        };
      }
      return { authorized: true };

    default:
      return { authorized: false, reason: "Action is not present in the approved role matrix." };
  }
}

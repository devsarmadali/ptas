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
import {
  CIRCLE_VEHARI_ID,
  MOCK_OFFICERS,
  MULTAN_REGION_ID,
  TEHSIL_VEHARI_ID,
  type MockOfficer,
  type MockRole
} from "./pilot-store";

export interface OfficerCredentialInfo {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: MockRole;
  readonly title: string;
  readonly jurisdictionId: string;
  readonly jurisdictionName: string;
  readonly jurisdictionTier: "REGION" | "OFFICE" | "CIRCLE";
  readonly badgeText: string;
  readonly statutoryPowers: readonly string[];
}

export const OFFICIAL_OFFICERS_REGISTRY: readonly OfficerCredentialInfo[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "Muhammad Aslam",
    email: "inspector.vehari@punjab.gov.pk",
    role: "INSPECTOR",
    title: "Tax Inspector",
    jurisdictionId: CIRCLE_VEHARI_ID,
    jurisdictionName: "Circle-Vehari",
    jurisdictionTier: "CIRCLE",
    badgeText: "Inspector (Maker / Survey / Payments)",
    statutoryPowers: [
      "Rule 4 & 5: Field Market Survey across Circle-Vehari",
      "Form PFT-3: Commercial Taxpayer Registration",
      "Rule 4: Draft Assessment Preparation",
      "Rule 6: Delivery of Form PFT-1 Notice of Demand",
      "Rule 9: Form PFT-2 & Challan 32-A Payment Receipt Collection"
    ]
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "Tariq Mahmood",
    email: "eto.vehari@punjab.gov.pk",
    role: "ETO",
    title: "Excise & Taxation Officer (Assessing Authority)",
    jurisdictionId: TEHSIL_VEHARI_ID,
    jurisdictionName: "Tehsil Vehari",
    jurisdictionTier: "OFFICE",
    badgeText: "Assessing Authority (Review / Approval / Form PFT-2)",
    statutoryPowers: [
      "Section 3 & Rule 5(1): Statutory Assessment Approval",
      "Rule 5(1): Assessment Remand / Return with Reasons",
      "Append-Only Demand Ledger Entry Authorization",
      "Rule 9: Issuance of Form PFT-2 Treasury Payment Challans",
      "Section 3(4): Imposition of Statutory Penalties (up to 100% ceiling)",
      "Rule 12: Recovery Certificate for Arrears of Land Revenue"
    ]
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "Shahid Nawaz",
    email: "director.multan@punjab.gov.pk",
    role: "DIRECTOR",
    title: "Director Excise & Taxation",
    jurisdictionId: MULTAN_REGION_ID,
    jurisdictionName: "Multan Region",
    jurisdictionTier: "REGION",
    badgeText: "Appellate Authority (Section 7 Appeals / Region Oversight)",
    statutoryPowers: [
      "Section 7 & Rule 13: Statutory Appellate Authority",
      "Rule 13(2): Scrutiny of Undisputed Tax Pre-Deposit",
      "Rule 13: Scheduling Court Hearings & Summons",
      "Judicial Decrees: Confirm, Reduce, Annul, Remand, or Remit Penalty",
      "Demand Ledger Revision & Relief Adjustments",
      "Regional Division Oversight & ePay Exception Desk"
    ]
  },
  {
    id: "a0000000-0000-4000-8000-000000000000",
    name: "Provincial Administrator",
    email: "admin.ptas@punjab.gov.pk",
    role: "ADMIN",
    title: "Provincial System Administrator",
    jurisdictionId: MULTAN_REGION_ID,
    jurisdictionName: "Punjab Provincial Apex (All Jurisdictions)",
    jurisdictionTier: "REGION",
    badgeText: "System Administrator (Technical Administration Only)",
    statutoryPowers: [
      "Technical user provisioning and configuration deployment",
      "Operational support with audited, non-statutory access",
      "Cannot assess, approve, penalize, decide appeals, or authorize financial adjustments"
    ]
  }
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

export interface SignInResult {
  readonly success: boolean;
  readonly officer: MockOfficer;
  readonly user?: User | undefined;
  readonly isCloudAuth: boolean;
  readonly message: string;
  readonly error?: string | undefined;
}

/**
 * Maps a Supabase user or email to its official MockOfficer profile.
 * Supports official Punjab accounts as well as any Vercel/demo domain email.
 */
export function getOfficerProfileByEmail(email: string): MockOfficer {
  const normalized = email.trim().toLowerCase();
  const registered = OFFICIAL_OFFICERS_REGISTRY.find((o) => o.email.toLowerCase() === normalized);

  if (registered) {
    return {
      id: registered.id,
      name: registered.name,
      email: registered.email,
      role: registered.role,
      title: registered.title,
      jurisdictionId: registered.jurisdictionId,
      jurisdictionName: registered.jurisdictionName,
      jurisdictionTier: registered.jurisdictionTier,
      badgeText: registered.badgeText
    };
  }

  throw new Error("Authenticated account has no approved PTAS officer assignment");
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
      officer: MOCK_OFFICERS[0],
      isCloudAuth: false,
      message: "Please enter a valid email address.",
      error: "INVALID_EMAIL"
    };
  }

  const effectivePassword = password?.trim();
  if (!effectivePassword) {
    return {
      success: false,
      officer: MOCK_OFFICERS[0],
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
        1200
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
      const approvedProfile = getOfficerProfileByEmail(data.user.email || normalizedEmail);
      const officer: MockOfficer = { ...approvedProfile, id: data.user.id };

      return {
        success: true,
        officer,
        user: data.user,
        isCloudAuth: true,
        message: `Authenticated via Supabase Auth as ${officer.name} (${officer.role})`
      };
    }

    return {
      success: false,
      officer: MOCK_OFFICERS[0],
      isCloudAuth: false,
      message: error?.message || "Authentication failed.",
      error: "AUTHENTICATION_FAILED"
    };
  } catch (err: unknown) {
    console.warn("Supabase Auth failure:", err);
    return {
      success: false,
      officer: MOCK_OFFICERS[0],
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
          reason: `Statutory Authority Violation: Section 3(4) penalty imposition and Rule 12 Land Revenue Recovery certification are exclusive statutory powers of the Assessing Authority (ETO Tariq Mahmood). Current role: ${officer.role}.`
        };
      }
      return { authorized: true };

    case "SCHEDULE_APPEAL_HEARING":
    case "ADJUDICATE_APPEAL":
      if (officer.role !== "DIRECTOR") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Under Section 7 & Rule 13, only the Appellate Authority (Director Shahid Nawaz) has judicial jurisdiction to hear and decide appeals. Current role: ${officer.role}.`
        };
      }
      return { authorized: true };

    case "ISSUE_CLEARANCE_CERTIFICATE":
      if (officer.role !== "ETO") {
        return {
          authorized: false,
          reason: `Statutory Authority Violation: Form P.F.T-5 Tax Clearance Certificates must be issued under official seal by an Assessing Authority (ETO Tariq Mahmood). Inspectors cannot issue clearance certificates.`
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

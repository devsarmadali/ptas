import { describe, expect, it } from "vitest";
import {
  OFFICIAL_OFFICERS_REGISTRY,
  getPasswordResetRedirectUrl,
  mapActorAssignmentToOfficer,
  signInOfficer,
  verifyOfficerAuthority
} from "../src/lib/supabase-auth.js";
import type { MockOfficer, MockRole } from "../src/lib/pilot-store.js";

function officer(role: MockRole): MockOfficer {
  return {
    id: `test-${role.toLowerCase()}`,
    name: `Test ${role}`,
    email: `${role.toLowerCase()}@example.invalid`,
    role,
    title: role,
    jurisdictionId: "test-jurisdiction",
    jurisdictionName: "Test Jurisdiction",
    jurisdictionTier: role === "INSPECTOR" ? "CIRCLE" : role === "ETO" ? "DISTRICT" : "REGION",
    badgeText: "Test fixture"
  };
}

describe("Supabase Auth and server-side PTAS assignment enforcement", () => {
  it("uses the canonical application URL for password recovery redirects", () => {
    expect(
      getPasswordResetRedirectUrl("http://localhost:3000", "https://punjab-ptas.vercel.app/")
    ).toBe("https://punjab-ptas.vercel.app/account/update-password");
    expect(
      getPasswordResetRedirectUrl(
        "https://preview-branch.vercel.app",
        "https://punjab-ptas.vercel.app/"
      )
    ).toBe("https://punjab-ptas.vercel.app/account/update-password");
    expect(getPasswordResetRedirectUrl("http://localhost:3000", "")).toBe(
      "http://localhost:3000/account/update-password"
    );
  });

  it("does not embed a fixed account registry in the browser bundle", () => {
    expect(OFFICIAL_OFFICERS_REGISTRY).toEqual([]);
  });

  it("maps an authenticated user from the server role and jurisdiction result", () => {
    const officer = mapActorAssignmentToOfficer(
      {
        user_id: "app-user-id",
        display_name: "Muhammad Nasir Khan",
        role: "INSPECTOR",
        jurisdiction_id: "circle-id",
        jurisdiction_name: "Circle 1",
        jurisdiction_tier: "CIRCLE"
      },
      { id: "auth-user-id", email: "any.valid@example.com" }
    );

    expect(officer.email).toBe("any.valid@example.com");
    expect(officer.role).toBe("INSPECTOR");
    expect(officer.jurisdictionName).toBe("Circle 1");
  });

  it("rejects unsupported client-controlled role or incomplete jurisdiction data", () => {
    expect(() =>
      mapActorAssignmentToOfficer(
        {
          role: "SUPERUSER",
          jurisdiction_id: "circle-id",
          jurisdiction_tier: "CIRCLE"
        },
        { id: "auth-user-id", email: "officer@example.com" }
      )
    ).toThrow("unsupported PTAS role");

    expect(() =>
      mapActorAssignmentToOfficer(
        { role: "ETO", jurisdiction_tier: "DISTRICT" },
        { id: "auth-user-id", email: "officer@example.com" }
      )
    ).toThrow("no active PTAS jurisdiction assignment");
  });

  it("fails closed for malformed email and missing password", async () => {
    const invalidResult = await signInOfficer("not-an-email");
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBe("INVALID_EMAIL");

    const missingPassword = await signInOfficer("officer@example.com");
    expect(missingPassword.success).toBe(false);
    expect(missingPassword.error).toBe("PASSWORD_REQUIRED");
  });

  it("retains the statutory least-privilege action matrix", () => {
    const inspector = officer("INSPECTOR");
    const eto = officer("ETO");
    const director = officer("DIRECTOR");
    const admin = officer("ADMIN");

    expect(verifyOfficerAuthority(inspector, "SUBMIT_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(eto, "SUBMIT_ASSESSMENT").authorized).toBe(false);
    expect(verifyOfficerAuthority(eto, "APPROVE_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(inspector, "APPROVE_ASSESSMENT").authorized).toBe(false);
    expect(verifyOfficerAuthority(director, "ADJUDICATE_APPEAL").authorized).toBe(true);
    expect(verifyOfficerAuthority(eto, "ADJUDICATE_APPEAL").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "ISSUE_RECOVERY_CERTIFICATE").authorized).toBe(false);
  });
});

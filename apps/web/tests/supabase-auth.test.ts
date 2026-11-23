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
    expect(officer.cadreCode).toBe("ETI");
    expect(officer.jurisdictionName).toBe("Circle 1");

    const detOfficer = mapActorAssignmentToOfficer(
      {
        user_id: "det-user-id",
        display_name: "Director Multan",
        role: "DET",
        cadre_code: "DET",
        bps_scale: 19,
        post_id: "post-det-mtn",
        post_code: "DET-MTN",
        post_title: "Director Excise & Taxation, Multan Division (BPS-19)",
        charge_type: "SUBSTANTIVE",
        jurisdiction_id: "div-mtn",
        jurisdiction_code: "MTN",
        jurisdiction_name: "Multan Division",
        jurisdiction_tier: "DIVISION"
      },
      { id: "auth-det", email: "det.mtn@example.com" }
    );
    expect(detOfficer.role).toBe("DIRECTOR");
    expect(detOfficer.cadreCode).toBe("DET");
    expect(detOfficer.bpsScale).toBe(19);
    expect(detOfficer.postCode).toBe("DET-MTN");
    expect(detOfficer.jurisdictionTier).toBe("DIVISION");

    const etcOfficer = mapActorAssignmentToOfficer(
      {
        user_id: "etc-user-id",
        display_name: "Constable Ali",
        role: "ETC",
        cadre_code: "ETC",
        bps_scale: 5,
        post_id: "post-etc-vhr-1",
        post_code: "ETC-VHR-1",
        post_title: "Excise & Taxation Constable (Notice Delivery), Circle 1 Vehari",
        charge_type: "SUBSTANTIVE",
        jurisdiction_id: "cir-vhr-1",
        jurisdiction_code: "VHR-1",
        jurisdiction_name: "Circle 1 Vehari",
        jurisdiction_tier: "CIRCLE"
      },
      { id: "auth-etc", email: "etc.vhr1@example.com" }
    );
    expect(etcOfficer.role).toBe("ETC");
    expect(etcOfficer.cadreCode).toBe("ETC");
    expect(etcOfficer.bpsScale).toBe(5);
    expect(etcOfficer.postCode).toBe("ETC-VHR-1");
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

    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const unconfiguredResult = await signInOfficer("officer@example.com", "validPassword123");
      expect(unconfiguredResult.success).toBe(false);
      expect(unconfiguredResult.error).toBe("AUTH_SERVICE_UNAVAILABLE");
      expect(unconfiguredResult.message).toContain("Authentication service is not configured");
    } finally {
      if (previousUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    }
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

import { describe, expect, it } from "vitest";
import {
  OFFICIAL_OFFICERS_REGISTRY,
  getOfficerProfileByEmail,
  signInOfficer,
  verifyOfficerAuthority
} from "../src/lib/supabase-auth.js";

describe("Phase 5: Supabase Real Auth & Statutory Authority Enforcement", () => {
  it("maintains exactly 4 distinct official Punjab Excise officer accounts (including Admin)", () => {
    expect(OFFICIAL_OFFICERS_REGISTRY).toHaveLength(4);

    const [inspector, eto, director, admin] = OFFICIAL_OFFICERS_REGISTRY;
    expect(inspector?.role).toBe("INSPECTOR");
    expect(inspector?.email).toBe("inspector.vehari@punjab.gov.pk");
    expect(inspector?.jurisdictionTier).toBe("CIRCLE");

    expect(eto?.role).toBe("ETO");
    expect(eto?.email).toBe("eto.vehari@punjab.gov.pk");
    expect(eto?.jurisdictionTier).toBe("OFFICE");

    expect(director?.role).toBe("DIRECTOR");
    expect(director?.email).toBe("director.multan@punjab.gov.pk");
    expect(director?.jurisdictionTier).toBe("REGION");

    expect(admin?.role).toBe("ADMIN");
    expect(admin?.email).toBe("admin.ptas@punjab.gov.pk");
    expect(admin?.jurisdictionTier).toBe("REGION");
  });

  it("resolves official officer profiles from official @punjab.gov.pk emails", () => {
    const inspector = getOfficerProfileByEmail("INSPECTOR.VEHARI@PUNJAB.GOV.PK");
    expect(inspector.role).toBe("INSPECTOR");
    expect(inspector.name).toBe("Muhammad Aslam");
    expect(inspector.jurisdictionTier).toBe("CIRCLE");

    const eto = getOfficerProfileByEmail("eto.vehari@punjab.gov.pk");
    expect(eto.role).toBe("ETO");
    expect(eto.name).toBe("Tariq Mahmood");
    expect(eto.jurisdictionTier).toBe("OFFICE");

    const director = getOfficerProfileByEmail("director.multan@punjab.gov.pk");
    expect(director.role).toBe("DIRECTOR");
    expect(director.name).toBe("Shahid Nawaz");
    expect(director.jurisdictionTier).toBe("REGION");

    const admin = getOfficerProfileByEmail("admin.ptas@punjab.gov.pk");
    expect(admin.role).toBe("ADMIN");
    expect(admin.name).toBe("Provincial Administrator");
    expect(admin.jurisdictionTier).toBe("REGION");
  });

  it("rejects unassigned and invalid identities", async () => {
    expect(() => getOfficerProfileByEmail("pilot.officer@vercel.app")).toThrow(
      "no approved PTAS officer assignment"
    );

    const invalidResult = await signInOfficer("not-an-email");
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBe("INVALID_EMAIL");
  });

  it("fails closed when a password is not supplied", async () => {
    const result = await signInOfficer("inspector.vehari@punjab.gov.pk");
    expect(result.success).toBe(false);
    expect(result.error).toBe("PASSWORD_REQUIRED");
  });

  it("strictly enforces role and jurisdiction authority on actions (AGENTS.md Rule 2)", () => {
    const inspector = getOfficerProfileByEmail("inspector.vehari@punjab.gov.pk");
    const eto = getOfficerProfileByEmail("eto.vehari@punjab.gov.pk");
    const director = getOfficerProfileByEmail("director.multan@punjab.gov.pk");
    const admin = getOfficerProfileByEmail("admin.ptas@punjab.gov.pk");

    // 1. Assessment submission: assigned Inspector only
    expect(verifyOfficerAuthority(inspector, "SUBMIT_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(eto, "SUBMIT_ASSESSMENT").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "SUBMIT_ASSESSMENT").authorized).toBe(false);

    // 2. Assessment approval: assigned ETO only
    const inspAppr = verifyOfficerAuthority(inspector, "APPROVE_ASSESSMENT");
    expect(inspAppr.authorized).toBe(false);
    expect(inspAppr.reason).toContain("Statutory Authority Violation");
    expect(verifyOfficerAuthority(eto, "APPROVE_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(director, "APPROVE_ASSESSMENT").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "APPROVE_ASSESSMENT").authorized).toBe(false);

    // 3. Section 3(4) Penalty Imposition: ETO only
    const inspPen = verifyOfficerAuthority(inspector, "IMPOSE_PENALTY");
    expect(inspPen.authorized).toBe(false);
    expect(verifyOfficerAuthority(eto, "IMPOSE_PENALTY").authorized).toBe(true);
    const dirPen = verifyOfficerAuthority(director, "IMPOSE_PENALTY");
    expect(dirPen.authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "IMPOSE_PENALTY").authorized).toBe(false);

    // 4. Section 7 & Rule 13 Appellate Adjudication: Director only
    const inspApp = verifyOfficerAuthority(inspector, "ADJUDICATE_APPEAL");
    expect(inspApp.authorized).toBe(false);
    const etoApp = verifyOfficerAuthority(eto, "ADJUDICATE_APPEAL");
    expect(etoApp.authorized).toBe(false); // ETO cannot adjudicate appeals against own orders
    expect(verifyOfficerAuthority(director, "ADJUDICATE_APPEAL").authorized).toBe(true);
    expect(verifyOfficerAuthority(admin, "ADJUDICATE_APPEAL").authorized).toBe(false);

    // 5. Technical admin has no statutory authority
    expect(verifyOfficerAuthority(admin, "ISSUE_CLEARANCE_CERTIFICATE").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "ISSUE_RECOVERY_CERTIFICATE").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "SUBMIT_DISCONTINUANCE_INSPECTION").authorized).toBe(
      false
    );
    expect(verifyOfficerAuthority(admin, "ADJUDICATE_DISCONTINUANCE").authorized).toBe(false);
    expect(verifyOfficerAuthority(admin, "ADJUDICATE_REFUND").authorized).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  OFFICIAL_OFFICERS_REGISTRY,
  getOfficerProfileByEmail,
  signInOfficer,
  verifyOfficerAuthority
} from "../src/lib/supabase-auth.js";

describe("Phase 5: Supabase Real Auth & Statutory Authority Enforcement", () => {
  it("maintains exactly 3 distinct official Punjab Excise officer accounts", () => {
    expect(OFFICIAL_OFFICERS_REGISTRY).toHaveLength(3);

    const [inspector, eto, director] = OFFICIAL_OFFICERS_REGISTRY;
    expect(inspector?.role).toBe("INSPECTOR");
    expect(inspector?.email).toBe("inspector.vehari@punjab.gov.pk");
    expect(inspector?.jurisdictionTier).toBe("CIRCLE");

    expect(eto?.role).toBe("ETO");
    expect(eto?.email).toBe("eto.vehari@punjab.gov.pk");
    expect(eto?.jurisdictionTier).toBe("OFFICE");

    expect(director?.role).toBe("DIRECTOR");
    expect(director?.email).toBe("director.multan@punjab.gov.pk");
    expect(director?.jurisdictionTier).toBe("REGION");
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
  });

  it("accepts custom deployment and Vercel domain emails dynamically", async () => {
    const customResult = await signInOfficer("pilot.officer@vercel.app", "Password123!");
    expect(customResult.success).toBe(true);
    expect(customResult.officer.email).toBe("pilot.officer@vercel.app");
    expect(customResult.officer.title).toContain("Vercel");

    // Rejects invalid email strings without @
    const invalidResult = await signInOfficer("not-an-email");
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBe("INVALID_EMAIL");
  });

  it("authenticates official officers successfully", async () => {
    const result = await signInOfficer("inspector.vehari@punjab.gov.pk");
    expect(result.success).toBe(true);
    expect(result.officer.role).toBe("INSPECTOR");
    expect(result.officer.name).toBe("Muhammad Aslam");
  });

  it("strictly enforces role and jurisdiction authority on actions (AGENTS.md Rule 2)", () => {
    const inspector = getOfficerProfileByEmail("inspector.vehari@punjab.gov.pk");
    const eto = getOfficerProfileByEmail("eto.vehari@punjab.gov.pk");
    const director = getOfficerProfileByEmail("director.multan@punjab.gov.pk");

    // 1. Assessment submission: All officers can submit survey assessments
    expect(verifyOfficerAuthority(inspector, "SUBMIT_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(eto, "SUBMIT_ASSESSMENT").authorized).toBe(true);

    // 2. Assessment approval: Requires ETO or Director
    const inspAppr = verifyOfficerAuthority(inspector, "APPROVE_ASSESSMENT");
    expect(inspAppr.authorized).toBe(false);
    expect(inspAppr.reason).toContain("Statutory Authority Violation");
    expect(verifyOfficerAuthority(eto, "APPROVE_ASSESSMENT").authorized).toBe(true);
    expect(verifyOfficerAuthority(director, "APPROVE_ASSESSMENT").authorized).toBe(true);

    // 3. Section 3(4) Penalty Imposition: Exclusive to Assessing Authority (ETO)
    const inspPen = verifyOfficerAuthority(inspector, "IMPOSE_PENALTY");
    expect(inspPen.authorized).toBe(false);
    expect(verifyOfficerAuthority(eto, "IMPOSE_PENALTY").authorized).toBe(true);
    const dirPen = verifyOfficerAuthority(director, "IMPOSE_PENALTY");
    expect(dirPen.authorized).toBe(false);

    // 4. Section 7 & Rule 13 Appellate Adjudication: Exclusive to Appellate Authority (Director)
    const inspApp = verifyOfficerAuthority(inspector, "ADJUDICATE_APPEAL");
    expect(inspApp.authorized).toBe(false);
    const etoApp = verifyOfficerAuthority(eto, "ADJUDICATE_APPEAL");
    expect(etoApp.authorized).toBe(false); // ETO cannot adjudicate appeals against own orders
    expect(verifyOfficerAuthority(director, "ADJUDICATE_APPEAL").authorized).toBe(true);
  });
});

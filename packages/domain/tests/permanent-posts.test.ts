import { describe, expect, it } from "vitest";
import {
  CADRE_BPS_BOUNDS,
  canAuthorityManageCadre,
  canAuthorityRenameEntity,
  canCadreHoldPost,
  canEditOfficerProfile,
  isBpsValidForCadre,
  normalizeCadreCode
} from "../src/geography.js";

describe("permanent sanctioned posts & civil service cadre rules", () => {
  it("normalizes legacy role codes to canonical cadres", () => {
    expect(normalizeCadreCode("DIRECTOR")).toBe("DET");
    expect(normalizeCadreCode("det")).toBe("DET");
    expect(normalizeCadreCode("INSPECTOR")).toBe("ETI");
    expect(normalizeCadreCode("eti")).toBe("ETI");
    expect(normalizeCadreCode("ETC")).toBe("ETC");
    expect(normalizeCadreCode("ETO")).toBe("ETO");
    expect(normalizeCadreCode("UNKNOWN")).toBeNull();
  });

  it("enforces exact statutory BPS grades including DET = BPS-19, ETI = BPS-16, and ETC = BPS-05", () => {
    expect(CADRE_BPS_BOUNDS.DET).toMatchObject({ min: 19, max: 19 });
    expect(CADRE_BPS_BOUNDS.ETO).toMatchObject({ min: 17, max: 17 });
    expect(CADRE_BPS_BOUNDS.ETI).toMatchObject({ min: 16, max: 16 });
    expect(CADRE_BPS_BOUNDS.ETC).toMatchObject({ min: 5, max: 5 });

    expect(isBpsValidForCadre("DET", 19)).toBe(true);
    expect(isBpsValidForCadre("DET", 18)).toBe(false);
    expect(isBpsValidForCadre("ETO", 17)).toBe(true);
    expect(isBpsValidForCadre("ETO", 16)).toBe(false);
    expect(isBpsValidForCadre("ETI", 16)).toBe(true);
    expect(isBpsValidForCadre("ETI", 14)).toBe(false);
    expect(isBpsValidForCadre("ETI", 17)).toBe(false);
    expect(isBpsValidForCadre("ETC", 5)).toBe(true);
    expect(isBpsValidForCadre("ETC", 14)).toBe(false);
  });

  it("prevents cross-cadre or out-of-grade posting onto sanctioned posts", () => {
    const etiPost = {
      cadreCode: "ETI" as const,
      minBps: 16,
      maxBps: 16,
      status: "ACTIVE" as const
    };
    const etcPost = {
      cadreCode: "ETC" as const,
      minBps: 5,
      maxBps: 5,
      status: "ACTIVE" as const
    };
    const detPost = {
      cadreCode: "DET" as const,
      minBps: 19,
      maxBps: 19,
      status: "ACTIVE" as const
    };

    expect(canCadreHoldPost("ETI", 16, etiPost)).toBe(true);
    expect(canCadreHoldPost("ETC", 5, etiPost)).toBe(false);
    expect(canCadreHoldPost("ETI", 16, etcPost)).toBe(false);
    expect(canCadreHoldPost("ETC", 5, etcPost)).toBe(true);
    expect(canCadreHoldPost("DET", 19, detPost)).toBe(true);
    expect(canCadreHoldPost("DET", 18, detPost)).toBe(false);
  });

  it("enforces strict supervisory hierarchy and superior-only renaming", () => {
    expect(canAuthorityManageCadre("ETO", "ETI")).toBe(true);
    expect(canAuthorityManageCadre("ETO", "ETC")).toBe(true);
    expect(canAuthorityManageCadre("ETO", "ETO")).toBe(false);
    expect(canAuthorityManageCadre("ETO", "DET")).toBe(false);
    expect(canAuthorityManageCadre("DET", "ETO")).toBe(true);
    expect(canAuthorityManageCadre("ETI", "ETC")).toBe(false);
    expect(canAuthorityManageCadre("ETC", "ETC")).toBe(false);

    expect(canAuthorityRenameEntity("ETO", "CIRCLE")).toBe(true);
    expect(canAuthorityRenameEntity("ETI", "CIRCLE")).toBe(false);
    expect(canAuthorityRenameEntity("ETO", "DISTRICT")).toBe(false);
    expect(canAuthorityRenameEntity("DET", "DISTRICT")).toBe(true);
    expect(canAuthorityRenameEntity("DET", "DIVISION")).toBe(false);
    expect(canAuthorityRenameEntity("ADMIN", "DIVISION")).toBe(true);
  });

  it("strictly prohibits self-profile-editing for all users including ADMIN, DET, and ETO", () => {
    expect(canEditOfficerProfile("u-admin", "ADMIN", "u-admin", "ADMIN")).toBe(false);
    expect(canEditOfficerProfile("u-det", "DET", "u-det", "DET")).toBe(false);
    expect(canEditOfficerProfile("u-eto", "ETO", "u-eto", "ETO")).toBe(false);
    expect(canEditOfficerProfile("u-eti", "ETI", "u-eti", "ETI")).toBe(false);
    expect(canEditOfficerProfile("u-etc", "ETC", "u-etc", "ETC")).toBe(false);

    expect(canEditOfficerProfile("u-eto", "ETO", "u-eti", "ETI")).toBe(true);
    expect(canEditOfficerProfile("u-eto", "ETO", "u-etc", "ETC")).toBe(true);
    expect(canEditOfficerProfile("u-det", "DET", "u-eto", "ETO")).toBe(true);
    expect(canEditOfficerProfile("u-eto", "ETO", "u-det", "DET")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  MOCK_OFFICERS,
  createInitialPilotUnits,
  createInitialAuditLogs,
  createInitialReconciliations,
  createInitialAppeals
} from "../src/lib/pilot-store.js";
import { computeLedgerBalance } from "@ptas/domain";

describe("Vehari Pilot Store & Statutory Seed Verification", () => {
  it("provides exactly 3 distinct mock authority roles", () => {
    expect(MOCK_OFFICERS).toHaveLength(3);

    const [inspector, eto, director] = MOCK_OFFICERS;
    expect(inspector.role).toBe("INSPECTOR");
    expect(inspector.name).toBe("Muhammad Aslam");
    expect(inspector.jurisdictionTier).toBe("CIRCLE");

    expect(eto.role).toBe("ETO");
    expect(eto.name).toBe("Tariq Mahmood");
    expect(eto.jurisdictionTier).toBe("OFFICE");

    expect(director.role).toBe("DIRECTOR");
    expect(director.name).toBe("Shahid Nawaz");
    expect(director.jurisdictionTier).toBe("REGION");
  });

  it("seeds initial Vehari taxpayers strictly with Second Schedule statutory rates", () => {
    const units = createInitialPilotUnits();
    expect(units).toHaveLength(4);

    // 1. Vehari Cotton Ginners (Pvt.) Ltd.
    const cottonUnit = units.find((u) => u.legalName.includes("Cotton Ginners"))!;
    expect(cottonUnit).toBeDefined();
    expect(cottonUnit.statutoryRuleId).toBe("PFT-1.i");
    expect(cottonUnit.statutoryRule.annual_rate_pkr).toBe(10000);
    // Paid in full via ePay -> balance 0
    expect(computeLedgerBalance(cottonUnit.ledgerEntries)).toBe(0);

    // 2. Kisan Pesticides & Fertilizer Agency
    const kisanUnit = units.find((u) => u.tradeName?.includes("Kisan Pesticides"))!;
    expect(kisanUnit).toBeDefined();
    expect(kisanUnit.statutoryRuleId).toBe("PFT-6.x");
    expect(kisanUnit.statutoryRule.annual_rate_pkr).toBe(2000);
    expect(computeLedgerBalance(kisanUnit.ledgerEntries)).toBe(2000);

    // 3. Al-Madina Commercial Center (Commercial Establishment, 10+ employees, Others)
    // STRICT DOMAIN RULE: Rate is strictly PKR 4,000 (NOT 5,000)
    const alMadinaUnit = units.find((u) => u.legalName.includes("Al-Madina"))!;
    expect(alMadinaUnit).toBeDefined();
    expect(alMadinaUnit.statutoryRuleId).toBe("PFT-3.i.b");
    expect(alMadinaUnit.statutoryRule.annual_rate_pkr).toBe(4000);
    expect(alMadinaUnit.assessments[0]?.status).toBe("SUBMITTED");

    // 4. Chenab Sweets & Bakers (AC Food Establishment)
    const chenabUnit = units.find((u) => u.legalName.includes("Chenab Sweets"))!;
    expect(chenabUnit).toBeDefined();
    expect(chenabUnit.statutoryRuleId).toBe("PFT-10");
    expect(chenabUnit.statutoryRule.annual_rate_pkr).toBe(5000);
  });

  it("initializes audit log, reconciliation, and appeal seed streams", () => {
    const audits = createInitialAuditLogs();
    expect(audits.length).toBeGreaterThan(0);

    const reconciliations = createInitialReconciliations();
    expect(reconciliations.length).toBeGreaterThan(0);
    expect(reconciliations[0]?.status).toBe("MATCHED");

    const appeals = createInitialAppeals();
    expect(appeals.length).toBeGreaterThan(0);
    expect(appeals[0]?.appealNumber).toBe("ETD/MLN/APP/2026/001");
    expect(appeals[0]?.status).toBe("HEARING_SCHEDULED");
  });
});

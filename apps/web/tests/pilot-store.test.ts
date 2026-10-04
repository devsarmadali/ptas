import { describe, expect, it } from "vitest";
import {
  MOCK_OFFICERS,
  createInitialPilotUnits,
  createInitialAuditLogs,
  createInitialReconciliations,
  createInitialAppeals,
  createInitialPft2Challans,
  loadPilotState,
  validatePft2IssuanceAmount
} from "../src/lib/pilot-store.js";
import { computeLedgerBalance } from "@ptas/domain";

describe("Vehari Pilot Store & Statutory Seed Verification", () => {
  it("never exposes the legacy seed as operational runtime state", () => {
    const state = loadPilotState();
    expect(state.units).toEqual([]);
    expect(state.auditLogs).toEqual([]);
    expect(state.appeals).toEqual([]);
    expect(state.pft2Challans).toEqual([]);
    expect(state.statutoryReceipts).toEqual([]);
  });

  it("provides exactly 4 distinct mock authority roles (including Admin)", () => {
    expect(MOCK_OFFICERS).toHaveLength(4);

    const [inspector, eto, director, admin] = MOCK_OFFICERS;
    expect(inspector.role).toBe("INSPECTOR");
    expect(inspector.name).toBe("Tax Inspector (Vehari Circle I)");
    expect(inspector.jurisdictionTier).toBe("CIRCLE");

    expect(eto.role).toBe("ETO");
    expect(eto.name).toBe("Excise & Taxation Officer (Vehari)");
    expect(eto.jurisdictionTier).toBe("OFFICE");

    expect(director.role).toBe("DIRECTOR");
    expect(director.name).toBe("Director Excise & Taxation (Multan Division)");
    expect(director.jurisdictionTier).toBe("REGION");

    expect(admin.role).toBe("ADMIN");
    expect(admin.name).toBe("Provincial Administrator");
    expect(admin.jurisdictionTier).toBe("REGION");
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
    const appeals = createInitialAppeals();
    expect(appeals.length).toBeGreaterThan(0);
    expect(appeals[0]?.appealNumber).toBe("PB/ET/VHR/CIR-1/APP/2026-27/00001");
    expect(appeals[0]?.status).toBe("HEARING_SCHEDULED");
  });

  it("ensures every seeded PFT-2 Challan has valid issue/due date window and fixed payable amount", () => {
    const units = createInitialPilotUnits();
    const challans = createInitialPft2Challans(units);
    expect(challans.length).toBeGreaterThanOrEqual(4);

    for (const c of challans) {
      expect(c.issueDate).toBeDefined();
      expect(c.dueDate).toBeDefined();
      expect(c.issueDate <= c.dueDate).toBe(true);
      expect(c.amountPayable).toBeGreaterThan(0);
      expect(c.noticeNumber).toMatch(/^PFT2-/);
      expect(c.pin).toMatch(/^\d{6}$/);
    }
  });

  it("validates PFT-2 issuance correctly for CURRENT, ARREAR, and COMBINED scopes with opening arrears and penalties", () => {
    const units = createInitialPilotUnits();
    const alMadina = units.find((u) => u.legalName.includes("Al-Madina"))!;

    // Case 1: Unit with no arrears fails ARREAR issuance
    const resNoArrears = validatePft2IssuanceAmount({
      unit: { ...alMadina, openingArrears: 0 },
      demandScope: "ARREAR"
    });
    expect(resNoArrears.canIssue).toBe(false);
    expect(resNoArrears.error).toContain("No Arrear Pending");

    // Case 2: Unit with openingArrears allows ARREAR issuance
    const resWithArrears = validatePft2IssuanceAmount({
      unit: { ...alMadina, openingArrears: 3500 },
      demandScope: "ARREAR"
    });
    expect(resWithArrears.canIssue).toBe(true);
    expect(resWithArrears.calculatedAmount).toBe(3500);

    // Case 3: Unit with COMBINED scope incorporates current assessed + opening arrears + penalties
    const resCombined = validatePft2IssuanceAmount({
      unit: {
        ...alMadina,
        openingArrears: 3500,
        ledgerEntries: [
          ...alMadina.ledgerEntries,
          {
            id: "pen-entry-1",
            demandUnitId: alMadina.demandUnit.id,
            financialYearId: "2026-2027",
            entryType: "PENALTY_DEMAND",
            amount: 500,
            sourceType: "ASSESSMENT",
            sourceId: "pen-1",
            idempotencyKey: "idem-pen-1",
            correlationId: "corr-pen-1",
            postedBy: "officer-eto-1",
            postedAt: "2026-08-15T00:00:00Z",
            metadata: { description: "Late fee penalty" }
          }
        ]
      },
      demandScope: "COMBINED"
    });
    expect(resCombined.canIssue).toBe(true);
    // current (4000) + arrears (3500) + penalty (500) = 8000
    expect(resCombined.calculatedAmount).toBe(8000);
  });
});

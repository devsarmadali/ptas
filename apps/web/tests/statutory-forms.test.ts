import { describe, expect, it } from "vitest";
import {
  generateCircleDispatchRegister,
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateLandRevenueRecoveryCertificate,
  generateShowCausePenaltyNotice,
  numberToWordsPkr
} from "../src/lib/statutory-forms.js";
import { createInitialPilotUnits } from "../src/lib/pilot-store.js";

describe("Statutory Forms Generation (Form P.F.T-1, Form P.F.T-2, Form P.F.T-3)", () => {
  const units = createInitialPilotUnits();
  const alMadinaUnit = units.find((u) => u.legalName.includes("Al-Madina"))!;
  const cottonUnit = units.find((u) => u.legalName.includes("Cotton Ginners"))!;

  it("converts Pakistani Rupee amounts into exact legal words", () => {
    expect(numberToWordsPkr(4000)).toBe("Four Thousand Rupees Only");
    expect(numberToWordsPkr(10000)).toBe("Ten Thousand Rupees Only");
    expect(numberToWordsPkr(1500)).toBe("One Thousand Five Hundred Rupees Only");
    expect(numberToWordsPkr(7500)).toBe("Seven Thousand Five Hundred Rupees Only");
    expect(numberToWordsPkr(70000)).toBe("Seventy Thousand Rupees Only");
    expect(numberToWordsPkr(100000)).toBe("One Lakh Rupees Only");
  });

  it("generates Form P.F.T-1 (Notice of Tax Demand under Rule 6)", () => {
    const pft1 = generateFormPFT1(alMadinaUnit);
    expect(pft1.demandNumber).toBe("PDN-VEH-2026-0003");
    expect(pft1.assesseeLegalName).toBe(alMadinaUnit.legalName);
    expect(pft1.taxAmount).toBe(4000);
    expect(pft1.taxAmountWords).toBe("Four Thousand Rupees Only");
    expect(pft1.scheduleEntry).toBe("Entry 3(i)(b)");
    expect(pft1.officialSha256).toHaveLength(64);
    expect(pft1.serviceReceipt.demandNumber).toBe("PDN-VEH-2026-0003");
    expect(pft1.serviceReceipt.serverRole).toContain("Service Officer");
  });

  it("generates Form P.F.T-2 (3-Copy Official Payment Challan under Rule 9)", () => {
    const pft2 = generateFormPFT2(alMadinaUnit);
    expect(pft2.copies).toHaveLength(3);

    const [taxpayerCopy, bankCopy, deptCopy] = pft2.copies;
    expect(taxpayerCopy.copyTitle).toBe("PART 1: TAXPAYER'S COPY");
    expect(bankCopy.copyTitle).toBe("PART 2: BANK'S COPY");
    expect(deptCopy.copyTitle).toBe("PART 3: DEPARTMENT'S COPY");

    expect(taxpayerCopy.headOfAccount).toContain("B01601");
    expect(taxpayerCopy.district).toBe("Vehari");
    expect(taxpayerCopy.taxPayable.currentTax).toBe(4000);
    expect(taxpayerCopy.taxPayable.totalPayableWords).toBe("Four Thousand Rupees Only");
    expect(pft2.officialSha256).toHaveLength(64);
  });

  it("generates Form P.F.T-3 (Assessment & Demand Register under Rule 11)", () => {
    const rows = generateFormPFT3Rows(units);
    expect(rows).toHaveLength(4);

    const cottonRow = rows.find((r) => r.legalName.includes("Cotton Ginners"))!;
    expect(cottonRow.assessedCurrentTax).toBe(10000);
    expect(cottonRow.totalPaid).toBe(10000);
    expect(cottonRow.outstandingBalance).toBe(0);

    const alMadinaRow = rows.find((r) => r.legalName.includes("Al-Madina"))!;
    expect(alMadinaRow.assessedCurrentTax).toBe(4000);
    expect(alMadinaRow.scheduleEntry).toBe("Entry 3(i)(b)");
  });

  it("generates Show Cause Notice for Imposition of Penalty (Rule 10 & Sec 3(4))", () => {
    const scn = generateShowCausePenaltyNotice(alMadinaUnit, 45);
    expect(scn.noticeNumber).toContain("SCN-PEN-VEH/2026");
    expect(scn.demandNumber).toBe("PDN-VEH-2026-0003");
    expect(scn.originalTaxAmount).toBe(4000);
    expect(scn.maximumPenaltyExposable).toBe(4000); // 100% cap
    expect(scn.daysOverdue).toBe(45);
    expect(scn.officialSha256).toHaveLength(64);
    expect(scn.assessingAuthorityName).toBe("Tariq Mahmood");
  });

  it("generates Certificate of Recovery as Arrears of Land Revenue (Rule 12)", () => {
    const cert = generateLandRevenueRecoveryCertificate(alMadinaUnit);
    expect(cert.certificateNumber).toContain("CERT-LRA-VEH/2026");
    expect(cert.collectorDesignation).toContain("The Collector / Tehsildar (Recovery)");
    expect(cert.originalTaxAmount).toBe(4000);
    expect(cert.totalArrearsRecoverable).toBe(4000);
    expect(cert.officialSha256).toHaveLength(64);
    expect(cert.recoverySection).toContain("Punjab Land Revenue Act 1967");
  });

  it("generates Circle Notice Dispatch & Service Register under Rule 6", () => {
    const register = generateCircleDispatchRegister(units, "2026-07-02");
    expect(register.circleName).toBe("Circle-Vehari");
    expect(register.district).toBe("Vehari");
    expect(register.financialYear).toBe("2026-2027");
    expect(register.totalNotices).toBe(4);
    expect(register.rows).toHaveLength(4);
    expect(register.totalServed).toBe(3); // Cotton Ginners, Kisan Pesticides, Chenab Sweets
    expect(register.totalPending).toBe(1); // Al-Madina
    expect(register.officialSha256).toHaveLength(64);

    const firstRow = register.rows[0]!;
    expect(firstRow.noticeNumber).toContain("PFT-1/VEH/2026");
    expect(firstRow.demandNumber).toBe("PDN-VEH-2026-0001");
    expect(firstRow.serverName).toContain("Muhammad Aslam");
    expect(firstRow.serviceStatus).toBe("SERVED");
  });
});

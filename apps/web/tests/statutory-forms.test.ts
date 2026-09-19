import { describe, expect, it } from "vitest";
import {
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
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
});

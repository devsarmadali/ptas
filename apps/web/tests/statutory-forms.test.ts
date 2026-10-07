import { describe, expect, it } from "vitest";
import {
  generateAppellateOrderDocument,
  generateCircleDispatchRegister,
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateLandRevenueRecoveryCertificate,
  generatePft2NoticeNumber,
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
    expect(pft1.demandNumber).toBe("0003");
    expect(pft1.assesseeLegalName).toBe(alMadinaUnit.legalName);
    expect(pft1.taxAmount).toBe(4000);
    expect(pft1.taxAmountWords).toBe("Four Thousand Rupees Only");
    expect(pft1.scheduleEntry).toBe("Class 3(i)(b)");
    expect(pft1.subclassificationCode).toBe("3(i)");
    expect(pft1.statutoryTertiaryCode).toBe("3(i)(b)");
    expect(pft1.tertiarySlab).toContain("Other");
    expect(pft1.slabRatePkr).toBe(4000);
    expect(pft1.rateBasis).toContain("annum");
    expect(pft1.statutoryClassificationFull).toContain("3(i)");
    expect(pft1.officialSha256).toHaveLength(64);
    expect(pft1.serviceReceipt.demandNumber).toBe("0003");
    expect(pft1.serviceReceipt.serverRole).toContain("Service Officer");
  });

  it("generates Form P.F.T-2 (3-Copy Official Payment Challan under Rule 9)", () => {
    const pft2 = generateFormPFT2(alMadinaUnit);
    expect(pft2.copies).toHaveLength(3);

    const [taxpayerCopy, bankCopy, deptCopy] = pft2.copies;
    expect(taxpayerCopy.copyTitle).toBe("TAXPAYER'S COPY");
    expect(bankCopy.copyTitle).toBe("BANK'S COPY");
    expect(deptCopy.copyTitle).toBe("DEPARTMENT'S COPY");

    expect(taxpayerCopy.headOfAccount).toContain("B01601");
    expect(taxpayerCopy.district).toBe("Vehari");
    expect(taxpayerCopy.taxPayable.currentTax).toBe(4000);
    expect(taxpayerCopy.taxPayable.totalPayableWords).toBe("Four Thousand Rupees Only");
    expect(taxpayerCopy.taxpayerInfo.subclassificationCode).toBe("3(i)");
    expect(taxpayerCopy.taxpayerInfo.statutoryTertiaryCode).toBe("3(i)(b)");
    expect(taxpayerCopy.taxpayerInfo.tertiarySlab).toContain("Other");
    expect(taxpayerCopy.taxpayerInfo.slabRatePkr).toBe(4000);
    expect(taxpayerCopy.taxpayerInfo.statutoryClassificationFull).toContain("3(i)");
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
    expect(alMadinaRow.scheduleEntry).toBe("Class 3(i)(b)");
    expect(alMadinaRow.subclassificationCode).toBe("3(i)");
    expect(alMadinaRow.statutoryTertiaryCode).toBe("3(i)(b)");
    expect(alMadinaRow.tertiarySlab).toContain("Other");
    expect(alMadinaRow.slabRatePkr).toBe(4000);
  });

  it("preserves imported demand identifiers and source-unit identity in P.F.T-3", () => {
    const importedUnit = {
      ...alMadinaUnit,
      id: "unit-imported-d-16",
      demandNumber: "D-16",
      demandUnit: { ...alMadinaUnit.demandUnit, permanentDemandNo: "D-16" }
    };

    const [row] = generateFormPFT3Rows([importedUnit]);
    expect(row?.sourceUnitId).toBe("unit-imported-d-16");
    expect(row?.permanentDemandNo).toBe("D-16");
  });

  it("consolidates current assessed tax and arrears into total demand and outstanding balance in P.F.T-3", () => {
    const unitWithArrears = {
      ...alMadinaUnit,
      id: "unit-arrears-test",
      openingArrears: 5000,
      ledgerEntries: []
    };

    const [row] = generateFormPFT3Rows([unitWithArrears]);
    expect(row?.assessedCurrentTax).toBe(4000);
    expect(row?.arrears).toBe(5000);
    expect(row?.totalDemand).toBe(9000);
    expect(row?.totalPaid).toBe(0);
    expect(row?.outstandingBalance).toBe(9000);
  });

  it("generates Show Cause Notice for Imposition of Penalty (Rule 10 & Sec 3(4))", () => {
    const scn = generateShowCausePenaltyNotice(alMadinaUnit, 45);
    expect(scn.noticeNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/SCN\/2026-27\/\d{5}/);
    expect(scn.demandNumber).toBe("0003");
    expect(scn.originalTaxAmount).toBe(4000);
    expect(scn.maximumPenaltyExposable).toBe(4000); // 100% cap
    expect(scn.daysOverdue).toBe(45);
    expect(scn.officialSha256).toHaveLength(64);
    expect(scn.assessingAuthorityName).toBe("Assessing Authority");
  });

  it("generates Certificate of Recovery as Arrears of Land Revenue (Rule 12)", () => {
    const cert = generateLandRevenueRecoveryCertificate(alMadinaUnit);
    expect(cert.certificateNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/LRC\/2026-27\/\d{5}/);
    expect(cert.collectorDesignation).toContain("The Collector / Tehsildar (Recovery)");
    expect(cert.originalTaxAmount).toBe(4000);
    expect(cert.totalArrearsRecoverable).toBe(4000);
    expect(cert.officialSha256).toHaveLength(64);
    expect(cert.recoverySection).toContain("Punjab Land Revenue Act 1967");
  });

  it("generates Circle Notice Dispatch & Service Register under Rule 6", () => {
    const register = generateCircleDispatchRegister(units, "2026-07-02");
    expect(register.circleName).toBe("Vehari Circle I (City / Commercial)");
    expect(register.district).toBe("Vehari");
    expect(register.financialYear).toBe("2026-2027");
    expect(register.totalNotices).toBe(4);
    expect(register.rows).toHaveLength(4);
    expect(register.totalServed).toBe(3); // Cotton Ginners, Kisan Pesticides, Chenab Sweets
    expect(register.totalPending).toBe(1); // Al-Madina
    expect(register.officialSha256).toHaveLength(64);

    const firstRow = register.rows[0]!;
    expect(firstRow.noticeNumber).toMatch(/PB\/ET\/VHR\/CIR-1\/PFT1\/2026-27\/\d{5}/);
    expect(firstRow.demandNumber).toBe("0001");
    expect(firstRow.serverName).toContain("Tax Inspector");
    expect(firstRow.serviceStatus).toBe("SERVED");
  });

  it("generates official judicial Appellate Order document (Section 7 & Rule 13)", () => {
    const order = generateAppellateOrderDocument({
      appealNumber: "ETD/MLN/APP/2026/001",
      orderNumber: "ETD/MLN/ORD/2026/001",
      filingDate: "2026-07-20",
      hearingDate: "2026-08-05",
      orderDate: "2026-08-05",
      unit: alMadinaUnit,
      groundOfAppeal:
        "Establishment employs fewer than 10 workers and is liable under Class 3(ii) at PKR 2,000",
      undisputedTaxDeposited: 2000,
      decisionType: "REDUCE",
      reliefAmount: 2000,
      revisedTaxAmount: 2000,
      findingsAndReasoning:
        "Field inspection by ETO confirms 6 staff members. Assessment reduced to Class 3(ii)."
    });

    expect(order.appealNumber).toBe("ETD/MLN/APP/2026/001");
    expect(order.orderNumber).toBe("ETD/MLN/ORD/2026/001");
    expect(order.courtTitle).toContain("DIRECTOR EXCISE & TAXATION, MULTAN DIVISION");
    expect(order.decisionType).toBe("REDUCE");
    expect(order.reliefAmount).toBe(2000);
    expect(order.revisedTaxAmount).toBe(2000);
    expect(order.appellateAuthorityName).toBe("Director Excise & Taxation / Appellate Authority");
    expect(order.officialSha256).toHaveLength(64);
    expect(order.operativeOrderUrdu).toContain("The appeal is partially allowed");
    expect(order.pin).toMatch(/^\d{6}$/);
  });

  it("generates statutory PFT-2 Notice Number containing numeric digit codes instead of text", () => {
    const noticeNo1 = generatePft2NoticeNumber({
      demandNumber: "0001",
      issueDate: "2026-09-20",
      formTypeCode: "01",
      demandScope: "01",
      paymentScope: "01",
      amount: 5000
    });
    // Draft payload prefix is replaced server-side by registered district/circle codes.
    expect(noticeNo1).toBe("PFT2-0001-260920010101-5000");

    const noticeNo2 = generatePft2NoticeNumber({
      demandNumber: "0002",
      issueDate: "2026-09-20",
      formTypeCode: "NOTICE_CUM_CHALLAN",
      demandScope: "COMBINED",
      paymentScope: "PARTIAL",
      amount: 2500
    });
    // Converts text input to 02 (NCUM), 03 (COMB), 02 (PARTIAL).
    expect(noticeNo2).toBe("PFT2-0002-260920020302-2500");

    const canonicalNoticeNo = generatePft2NoticeNumber({
      demandNumber: "1184",
      issueDate: "2026-10-03",
      districtCode: "VHR",
      circleCode: "01",
      formTypeCode: "STANDARD",
      demandScope: "CURRENT",
      paymentScope: "FULL",
      amount: 2000
    });
    expect(canonicalNoticeNo).toBe("VHR-01-1184-261003010101-2000");
  });

  it("generates Form P.F.T-2 with custom options, partial payment, and document security PIN", () => {
    const pft2 = generateFormPFT2(alMadinaUnit, {
      dueDate: "2026-09-30",
      issueDate: "2026-09-20",
      formType: "02",
      demandScope: "01",
      paymentScope: "02",
      customAmount: 2000,
      isPartial: true,
      remainingBalance: 2000,
      noticeNumber: "PFT2-0003-09-20-02-01-02-2000",
      pin: "654321"
    });

    expect(pft2.pin).toBe("654321");
    expect(pft2.noticeNumber).toBe("PFT2-0003-09-20-02-01-02-2000");
    expect(pft2.formType).toBe("02");
    expect(pft2.demandScope).toBe("01");
    expect(pft2.paymentScope).toBe("02");
    expect(pft2.displayAmount).toBe(2000);
    expect(pft2.isPartial).toBe(true);
    expect(pft2.remainingBalance).toBe(2000);

    // Check all copies have the PIN and notice number
    for (const copy of pft2.copies) {
      expect(copy.pin).toBe("654321");
      expect(copy.noticeNumber).toBe("PFT2-0003-09-20-02-01-02-2000");
      expect(copy.taxPayable.totalPayable).toBe(2000);
      expect(copy.dueDate).toBe("2026-09-30");
    }
  });

  it("verifies that all statutory documents contain a valid 6-digit numeric Document Security PIN", () => {
    const pft1 = generateFormPFT1(alMadinaUnit);
    expect(pft1.pin).toMatch(/^\d{6}$/);

    const pft2 = generateFormPFT2(alMadinaUnit);
    expect(pft2.pin).toMatch(/^\d{6}$/);
    expect(pft2.noticeNumber).toMatch(/^PFT2-0003-/);

    const scn = generateShowCausePenaltyNotice(alMadinaUnit, 30);
    expect(scn.pin).toMatch(/^\d{6}$/);

    const lrc = generateLandRevenueRecoveryCertificate(alMadinaUnit);
    expect(lrc.pin).toMatch(/^\d{6}$/);
  });

  it("correctly handles Form PFT-2 demand scopes (CURRENT, ARREAR, COMBINED) with arrears and penalty", () => {
    const unitWithArrearsAndPenalty = {
      ...alMadinaUnit,
      openingArrears: 5000,
      ledgerEntries: [
        ...alMadinaUnit.ledgerEntries,
        {
          id: "ledger-pen-1",
          demandUnitId: alMadinaUnit.demandUnit.id,
          financialYearId: "2026-2027",
          entryType: "PENALTY_DEMAND" as const,
          amount: 1000,
          sourceType: "ASSESSMENT",
          sourceId: "penalty-1",
          idempotencyKey: "idem-pen-1",
          correlationId: "pen-corr-1",
          postedBy: "officer-eto-1",
          postedAt: "2026-08-01T10:00:00Z",
          metadata: { description: "Late default statutory penalty" }
        }
      ]
    };

    // 1. Current Demand Scope: only current assessed tax
    const currentChallan = generateFormPFT2(unitWithArrearsAndPenalty, {
      demandScope: "CURRENT"
    });
    expect(currentChallan.pft2TypeLabel).toBe("CURRENT");
    expect(currentChallan.displayAmount).toBe(4000);
    expect(currentChallan.copies[0].taxPayable.currentTax).toBe(4000);
    expect(currentChallan.copies[0].taxPayable.arrears).toBe(0);
    expect(currentChallan.copies[0].taxPayable.penalty).toBe(0);
    expect(currentChallan.copies[0].taxPayable.totalPayable).toBe(4000);

    // 2. Arrear Demand Scope: only opening arrears
    const arrearChallan = generateFormPFT2(unitWithArrearsAndPenalty, {
      demandScope: "ARREAR"
    });
    expect(arrearChallan.pft2TypeLabel).toBe("ARREARS");
    expect(arrearChallan.displayAmount).toBe(5000);
    expect(arrearChallan.copies[0].taxPayable.currentTax).toBe(0);
    expect(arrearChallan.copies[0].taxPayable.arrears).toBe(5000);
    expect(arrearChallan.copies[0].taxPayable.penalty).toBe(0);
    expect(arrearChallan.copies[0].taxPayable.totalPayable).toBe(5000);

    // 3. Combined Demand Scope: current tax (4000) + arrears (5000) + penalty (1000) = 10000
    const combinedChallan = generateFormPFT2(unitWithArrearsAndPenalty, {
      demandScope: "COMBINED"
    });
    expect(combinedChallan.pft2TypeLabel).toBe("COMBINED (CURRENT + ARREARS)");
    expect(combinedChallan.displayAmount).toBe(10000);
    expect(combinedChallan.copies[0].taxPayable.currentTax).toBe(4000);
    expect(combinedChallan.copies[0].taxPayable.arrears).toBe(5000);
    expect(combinedChallan.copies[0].taxPayable.penalty).toBe(1000);
    expect(combinedChallan.copies[0].taxPayable.totalPayable).toBe(10000);
    expect(combinedChallan.copies[0].taxPayable.totalPayableWords).toBe("Ten Thousand Rupees Only");
  });
});

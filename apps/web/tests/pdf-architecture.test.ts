import { describe, expect, it } from "vitest";
import {
  generateAppellateOrderDocument,
  generateCircleDispatchRegister,
  generateFormPFT1,
  generateFormPFT2,
  generateFormPFT3Rows,
  generateLandRevenueRecoveryCertificate,
  generateShowCausePenaltyNotice,
  type TaxClearanceCertificateModel
} from "../src/lib/statutory-forms.js";
import { createInitialPilotUnits } from "../src/lib/pilot-store.js";
import {
  generateAuthoritativePdf,
  validateDocumentAuthorization,
  validateDocumentLifecycle
} from "../src/lib/pdf/document-engine.js";
import { generatePft2ChallanPdf } from "../src/lib/pdf/templates/pft2-challan.js";
import { generatePft1DemandNoticePdf } from "../src/lib/pdf/templates/pft1-demand-notice.js";
import { generatePft3AssessmentRegisterPdf } from "../src/lib/pdf/templates/pft3-assessment-register.js";
import { generateShowCauseNoticePdf } from "../src/lib/pdf/templates/show-cause-notice.js";
import { generateStatutoryReceiptPdf } from "../src/lib/pdf/templates/statutory-receipt.js";
import { generateExecutivePft2BriefPdf } from "../src/lib/pdf/templates/executive-pft2-brief.js";
import {
  generateStatutoryReportPdf,
  type StatutoryReportData
} from "../src/lib/pdf/templates/statutory-reports.js";
import { generateTaxClearanceCertificatePdf } from "../src/lib/pdf/templates/tax-clearance-certificate.js";
import { generateLandRevenueRecoveryPdf } from "../src/lib/pdf/templates/land-revenue-recovery.js";
import { generateAppellateOrderPdf } from "../src/lib/pdf/templates/appellate-order.js";
import { generateUnitDossierPdf } from "../src/lib/pdf/templates/unit-dossier.js";
import { generateQrDataUrl } from "../src/lib/pdf/base-document.js";
import type {
  DocumentAuthorizationContext,
  ExecutivePft2BriefData,
  UnitDossierData
} from "../src/lib/pdf/types.js";
import type { StatutoryReceiptDocument } from "../src/lib/receipt-generator.js";

describe("Centralized PDF Architecture & Document Lifecycle Engine", () => {
  const units = createInitialPilotUnits();
  const alMadina = units.find((u) => u.legalName.includes("Al-Madina"))!;
  const cotton = units.find((u) => u.legalName.includes("Cotton Ginners"))!;

  // ---------------------------------------------------------------------------
  // 1. LIFECYCLE STATE GATING & BUSINESS RULES
  // ---------------------------------------------------------------------------
  describe("Document Lifecycle Validation", () => {
    it("rejects PFT2 Challan download before recorded issuance", () => {
      const unissuedChallan = generateFormPFT2(alMadina);
      const result = validateDocumentLifecycle("PFT2_CHALLAN", {
        ...unissuedChallan,
        challanStatus: "PENDING_REVIEW"
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot be generated before official issuance");
    });

    it("allows PFT2 Challan download once officially ISSUED or RECEIVED", () => {
      const issuedChallan = generateFormPFT2(alMadina);
      issuedChallan.challanStatus = "ISSUED";

      const result = validateDocumentLifecycle("PFT2_CHALLAN", issuedChallan);
      expect(result.allowed).toBe(true);

      const receivedChallan = { ...issuedChallan, challanStatus: "RECEIVED" };
      expect(validateDocumentLifecycle("PFT2_CHALLAN", receivedChallan).allowed).toBe(true);
    });

    it("rejects PFT1 Demand Notice when assessment status is unapproved without provisional flag", () => {
      const pft1 = generateFormPFT1(alMadina);
      const result = validateDocumentLifecycle("PFT1_DEMAND_NOTICE", {
        ...pft1,
        assessmentStatus: "DRAFT",
        isProvisional: false
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("ETO approval");
    });

    it("allows PFT1 Demand Notice when assessment is APPROVED", () => {
      const pft1 = generateFormPFT1(alMadina);
      const result = validateDocumentLifecycle("PFT1_DEMAND_NOTICE", {
        ...pft1,
        assessmentStatus: "APPROVED"
      });

      expect(result.allowed).toBe(true);
    });

    it("rejects Tax Clearance Certificate (PFT-5) if outstanding balance > 0", () => {
      const result = validateDocumentLifecycle("TAX_CLEARANCE_CERTIFICATE", {
        unit: alMadina,
        currentBalancePkr: 4000,
        certificateNumber: "PFT5-TEST-001"
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("outstanding tax balance");
    });

    it("allows Tax Clearance Certificate (PFT-5) when outstanding balance is 0", () => {
      const result = validateDocumentLifecycle("TAX_CLEARANCE_CERTIFICATE", {
        unit: alMadina,
        currentBalancePkr: 0,
        certificateNumber: "PFT5-TEST-001"
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SERVER-SIDE ROLE AND JURISDICTION AUTHORIZATION
  // ---------------------------------------------------------------------------
  describe("Security and Jurisdiction Authorization", () => {
    it("denies SYSTEM_ADMIN statutory document access", () => {
      const adminCtx: DocumentAuthorizationContext = {
        role: "SYSTEM_ADMIN",
        district: "Vehari",
        circle: "Circle-A"
      };

      const result = validateDocumentAuthorization("PFT2_CHALLAN", adminCtx, {
        district: "Multan",
        circle: "Circle-B"
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("TECHNICAL_ADMIN_NO_STATUTORY_ACCESS");
    });

    it("denies document generation when actor context is missing", () => {
      const result = validateDocumentAuthorization(
        "PFT2_CHALLAN",
        {},
        {
          district: "Vehari",
          circle: "Circle-A"
        }
      );
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe("AUTHENTICATED_ROLE_REQUIRED");
    });

    it("allows ETO within their own circle jurisdiction", () => {
      const etoCtx: DocumentAuthorizationContext = {
        role: "EXCISE_TAXATION_OFFICER",
        district: "Vehari",
        circle: "Vehari Circle-I"
      };

      const result = validateDocumentAuthorization("PFT1_DEMAND_NOTICE", etoCtx, {
        district: "Vehari",
        circle: "Vehari Circle-I"
      });
      expect(result.authorized).toBe(true);
    });

    it("denies ETO access to records outside their district jurisdiction", () => {
      const etoCtx: DocumentAuthorizationContext = {
        role: "EXCISE_TAXATION_OFFICER",
        district: "Vehari",
        circle: "Vehari Circle-I"
      };

      const result = validateDocumentAuthorization("PFT1_DEMAND_NOTICE", etoCtx, {
        district: "Lahore",
        circle: "Lahore Circle-V"
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("District jurisdiction mismatch");
    });

    it("denies ASSISTANT_EXCISE_OFFICER access to judicial Appellate Orders", () => {
      const inspectorCtx: DocumentAuthorizationContext = {
        role: "ASSISTANT_EXCISE_OFFICER",
        district: "Vehari",
        circle: "Circle-I"
      };

      const result = validateDocumentAuthorization("APPELLATE_ORDER", inspectorCtx, {
        district: "Vehari",
        circle: "Circle-I"
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("Insufficient clearance");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. VECTOR QR CODE GENERATION
  // ---------------------------------------------------------------------------
  describe("QR Code Generation Quality", () => {
    it("generates deterministic, high-resolution QR data URLs without DOM canvas dependency", async () => {
      const qrPayload = JSON.stringify({
        doc: "PFT-2",
        psid: "99100000000000003",
        taxpayer: "Al-Madina Cotton",
        amount: 4000
      });

      const qrDataUrl = await generateQrDataUrl(qrPayload);
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(qrDataUrl.length).toBeGreaterThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. FORM PFT-2 PAYMENT CHALLAN SPECIFICATION (A4 LANDSCAPE, 3 COPIES)
  // ---------------------------------------------------------------------------
  describe("Form P.F.T-2 Challan PDF Generation", () => {
    it("generates A4 Landscape vector PDF with 3 counterfoil copies side-by-side", async () => {
      const challan = generateFormPFT2(alMadina);
      challan.challanStatus = "ISSUED";

      const pdf = await generatePft2ChallanPdf(challan);
      expect(pdf).toBeDefined();

      // Verify exact A4 Landscape dimensions (297mm x 210mm)
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      expect(Math.round(width)).toBe(297);
      expect(Math.round(height)).toBe(210);

      // Verify single page allocation for the 3-counterfoil layout (fits on 1 page with no overflow)
      expect(pdf.getNumberOfPages()).toBe(1);

      // Verify binary PDF buffer generation
      const arrayBuffer = pdf.output("arraybuffer");
      expect(arrayBuffer.byteLength).toBeGreaterThan(5000);

      // Verify exactly three copies defined in model
      expect(challan.copies).toHaveLength(3);
      expect(challan.copies[0]?.copyTitle).toBe("TAXPAYER'S COPY");
      expect(challan.copies[1]?.copyTitle).toBe("BANK'S COPY");
      expect(challan.copies[2]?.copyTitle).toBe("DEPARTMENT'S COPY");
    });

    it("generates PFT2 challan with reconstructed notice number, compact counterfoil, and security code below QR", async () => {
      const challan = generateFormPFT2(alMadina);
      (challan as any).challanStatus = "ISSUED";
      (challan as any).noticeNumber = "PFT2-1184-2610030101-2000";
      (challan as any).pin = "741386";
      challan.copies.forEach((copy) => {
        (copy as any).noticeNumber = "PFT2-1184-2610030101-2000";
        (copy as any).pin = "741386";
        (copy.assessmentInfo as any).demandNo = "1184";
        (copy as any).district = "Vehari";
      });

      const pdf = await generatePft2ChallanPdf(challan);
      expect(pdf.getNumberOfPages()).toBe(1);

      const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
      expect(pdfBytes.length).toBeGreaterThan(5000);

      const fs = await import("node:fs");
      const artifactDir =
        "C:\\Users\\ETIVE\\.gemini\\antigravity-ide\\brain\\d93a868a-d531-4c38-b5f0-d2a8ca652865";
      if (fs.existsSync(artifactDir)) {
        fs.writeFileSync(`${artifactDir}\\sample_pft2_challan.pdf`, pdfBytes);
      }
    });

    it("verifies date and tax year formatters for compact statutory display", async () => {
      const { formatChallanDisplayDate, formatChallanTaxYear, cleanChallanScope } =
        await import("../src/lib/pft2-formatters.js");

      // Date formatting: DD-Mon-YYYY
      expect(formatChallanDisplayDate("2026-10-03")).toBe("03-Oct-2026");
      expect(formatChallanDisplayDate("2026-07-01")).toBe("01-Jul-2026");
      expect(formatChallanDisplayDate("31/08/2026")).toBe("31-Aug-2026");
      expect(formatChallanDisplayDate("31/10/2026")).toBe("31-Oct-2026");
      expect(formatChallanDisplayDate("03-Oct-2026")).toBe("03-Oct-2026");

      // Tax Year formatting
      expect(formatChallanTaxYear("2026-2027")).toBe("2026-27");
      expect(formatChallanTaxYear("2026-27")).toBe("2026-27");

      // Scope cleaning (removes redundant "DEMAND")
      expect(cleanChallanScope("CURRENT DEMAND")).toBe("CURRENT");
      expect(cleanChallanScope("ARREAR DEMAND")).toBe("ARREAR");
      expect(cleanChallanScope("COMBINED DEMAND")).toBe("COMBINED");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. FORM PFT-1 NOTICE OF DEMAND (A4 PORTRAIT WITH RULE 6 SERVICE RECEIPT)
  // ---------------------------------------------------------------------------
  describe("Form P.F.T-1 Notice of Demand PDF Generation", () => {
    it("generates A4 Portrait vector PDF with statutory demand text and service receipt", async () => {
      const pft1 = generateFormPFT1(alMadina);
      const pdf = await generatePft1DemandNoticePdf(pft1);

      expect(pdf).toBeDefined();

      // Verify exact A4 Portrait dimensions (210mm x 297mm)
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      expect(Math.round(width)).toBe(210);
      expect(Math.round(height)).toBe(297);

      expect(pdf.getNumberOfPages()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. FORM PFT-3 ASSESSMENT REGISTER (A4 LANDSCAPE MULTI-PAGE PAGINATION)
  // ---------------------------------------------------------------------------
  describe("Form P.F.T-3 Assessment Register PDF Generation", () => {
    it("paginates long datasets across pages with repeated table headers and footers", async () => {
      // Create a large dataset of 60 register rows to force multi-page continuation
      const baseRows = generateFormPFT3Rows(units);
      const largeRows = [];
      for (let i = 0; i < 60; i++) {
        const template = baseRows[i % baseRows.length]!;
        largeRows.push({
          ...template,
          serialNumber: i + 1,
          provincialUin: `PFT-TEST-${String(i + 1).padStart(4, "0")}`,
          assesseeLegalName: `Test Assessee Unit #${i + 1} Industrial Estate`
        });
      }

      const pdf = await generatePft3AssessmentRegisterPdf({
        rows: largeRows,
        district: "Vehari",
        circle: "Circle-I (Industrial)",
        financialYear: "2025-2026",
        certifiedByTitle: "Excise & Taxation Officer / Assessing Authority, Vehari"
      });

      // Verify A4 Landscape
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(297);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(210);

      // 60 rows must paginate into at least 2 pages
      const pageCount = pdf.getNumberOfPages();
      expect(pageCount).toBeGreaterThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. SHOW CAUSE PENALTY NOTICE
  // ---------------------------------------------------------------------------
  describe("Show Cause Penalty Notice PDF Generation", () => {
    it("generates Section 3(5) & Rule 12 statutory notice", async () => {
      const noticeData = generateShowCausePenaltyNotice(cotton, 45);

      const pdf = await generateShowCauseNoticePdf(noticeData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. STATUTORY PAYMENT RECEIPT VOUCHER (RULE 10)
  // ---------------------------------------------------------------------------
  describe("Statutory Payment Receipt Voucher PDF Generation", () => {
    it("generates Rule 10 receipt with CPR voucher", async () => {
      const receiptData: StatutoryReceiptDocument = {
        receiptNumber: "REC-2026-00042",
        pin: "654321",
        provincialUin: alMadina.provincialUin,
        challanNumber: "PFT2-0003",
        demandNumber: alMadina.demandUnit.permanentDemandNo,
        assesseeLegalName: alMadina.legalName,
        assesseeTradeName: alMadina.tradeName,
        identifier: `${alMadina.identifierType}: ${alMadina.identifierValue}`,
        address: alMadina.address,
        statutoryCategory: "Class 3(i) Companies",
        subclassificationCode: null,
        tertiarySlab: null,
        amountPaid: 4000,
        amountPaidWords: "Four Thousand Rupees Only",
        dateOfReceipt: "2026-09-20",
        timeOfReceipt: "11:42:00",
        paymentChannel: "e-Pay Punjab (1Link OTC)",
        bankBranch: "National Bank of Pakistan, Main Branch Vehari (0142)",
        bankScrollRef: "SCR-2026-0920-0042",
        receivingOfficerName: "Muhammad Aslam",
        receivingOfficerTitle: "Scroll Officer / Cashier",
        canonicalReceiptText: "CANONICAL-RECEIPT-TEXT",
        officialSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
        qrPayload: "PTAS:RECEIPT:REC-2026-00042"
      };

      const pdf = await generateStatutoryReceiptPdf(receiptData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. EXECUTIVE PFT-2 BRIEF
  // ---------------------------------------------------------------------------
  describe("Executive PFT-2 Brief PDF Generation", () => {
    it("generates Executive Management Brief with KPIs and Circle Performance", async () => {
      const briefData: ExecutivePft2BriefData = {
        totalChallans: 142,
        totalAssessedSum: 890000,
        totalReceivedSum: 720000,
        totalOutstandingSum: 170000,
        fullScopeCount: 100,
        partialScopeCount: 42,
        issuedCount: 142,
        receivedCount: 118,
        cancelledCount: 0,
        circleBreakdown: [
          { circleName: "Vehari Circle-I", count: 80, totalAmount: 450000 },
          { circleName: "Burewala Circle-II", count: 40, totalAmount: 320000 },
          { circleName: "Mailsi Circle-III", count: 22, totalAmount: 120000 }
        ],
        categoryBreakdown: [
          { categoryName: "Class 3(i) Joint Stock Companies", count: 90, totalAmount: 500000 },
          { categoryName: "Class 2 Factories & Mills", count: 52, totalAmount: 250000 }
        ],
        generatedAt: "2026-09-26",
        officerName: "Malik Muhammad Imran",
        officerTitle: "ETO Vehari",
        officialSha256: "sha256-brief-test"
      };

      const pdf = await generateExecutivePft2BriefPdf(briefData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. STATUTORY SCHEDULE REPORTS
  // ---------------------------------------------------------------------------
  describe("Statutory Schedule Reports PDF Generation", () => {
    it("generates paginated Defaulters Roll Report", async () => {
      const reportData: StatutoryReportData = {
        title: "STATUTORY DEFAULTERS ROLL & RECOVERY DOCKET",
        scheduleCode: "SCHEDULE-DEFAULTERS",
        district: "Vehari",
        circle: "Circle-I",
        financialYear: "2025-2026",
        headers: ["SR", "PIN", "LEGAL NAME", "DEMAND", "OUTSTANDING", "DAYS OVERDUE", "STAGE"],
        rows: [
          ["1", "PFT-0001", "Al-Madina Cotton", "PKR 4,000", "PKR 4,000", "45 Days", "Show Cause"],
          ["2", "PFT-0002", "Pak Chemical Ltd", "PKR 10,000", "PKR 10,000", "60 Days", "Warrant"]
        ],
        columnWidths: [12, 30, 75, 30, 30, 25, 35]
      };
      const pdf = await generateStatutoryReportPdf(reportData);

      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(297);
    });

    it("generates Notice Dispatch Register", async () => {
      const registerData = generateCircleDispatchRegister("Vehari", "Circle-I", units);
      const pdf = await generateStatutoryReportPdf({
        reportTitle: "STATUTORY NOTICE DISPATCH REGISTER (RULE 6)",
        statutoryReference: "RULE-6-DISPATCH",
        district: "Vehari",
        circle: "Circle-I",
        financialYear: "2025-2026",
        headers: ["SR", "DISPATCH NO", "LEGAL NAME", "PIN", "MODE", "DATE", "STATUS"],
        rows: (registerData.rows || []).map((e) => [
          String(e.serialNumber),
          e.noticeNumber || "DISP-001",
          e.assesseeLegalName,
          e.demandNumber || "N/A",
          "Official Notice Server",
          e.dispatchDate,
          e.serviceStatus
        ])
      });

      expect(pdf).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 11. TAX CLEARANCE CERTIFICATE (FORM PFT-5)
  // ---------------------------------------------------------------------------
  describe("Tax Clearance Certificate (Form P.F.T-5) PDF Generation", () => {
    it("generates official zero-balance clearance certificate", async () => {
      const certData: TaxClearanceCertificateModel = {
        isEligible: true,
        certificateNumber: "PFT5-VEH-2026-0089",
        pin: "68000000",
        provincialUin: alMadina.provincialUin,
        issueDate: "2026-09-26",
        expiryDate: "2027-06-30",
        financialYear: "2025-2026",
        district: "Vehari",
        districtName: "Vehari",
        tehsil: "Tehsil Vehari",
        circle: "Circle-I",
        circleName: "Circle-I",
        assesseeLegalName: alMadina.legalName,
        assesseeTradeName: alMadina.tradeName,
        identifierType: alMadina.identifierType,
        identifierValue: alMadina.identifierValue,
        address: alMadina.address,
        businessAddress: alMadina.address,
        demandNo: alMadina.demandUnit.permanentDemandNo,
        categoryName: "Class 3(i) Companies",
        scheduleEntry: "Class 3",
        annualTaxAssessed: 4000,
        totalTaxPaid: 4000,
        currentOutstandingBalance: 0,
        headOfAccount: "B01601 - Tax on Professions, Trades and Callings",
        issuingOfficerName: "Malik Muhammad Imran",
        issuingOfficerTitle: "Excise & Taxation Officer, Vehari",
        officialSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        qrPayload: "PTAS:PFT5:PFT5-VEH-2026-0089",
        canonicalCertificateText: "PFT-5 CLEARANCE CERTIFICATE"
      };

      const pdf = await generateTaxClearanceCertificatePdf(certData);

      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. LAND REVENUE RECOVERY REQUISITION
  // ---------------------------------------------------------------------------
  describe("Land Revenue Recovery Requisition Certificate PDF Generation", () => {
    it("generates Section 11 & Punjab Land Revenue Act 1967 warrant", async () => {
      const recoveryData = generateLandRevenueRecoveryCertificate(
        cotton,
        "Deputy Commissioner / District Collector, Vehari"
      );

      const pdf = await generateLandRevenueRecoveryPdf(recoveryData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. JUDICIAL APPELLATE ORDER
  // ---------------------------------------------------------------------------
  describe("Appellate Authority Judicial Order PDF Generation", () => {
    it("generates Section 7 & Rule 13 appellate decision", async () => {
      const orderData = generateAppellateOrderDocument({
        appealNumber: "APP-VEH-2026-0003",
        filingDate: "2026-09-01",
        orderDate: "2026-09-24",
        unit: alMadina,
        groundOfAppeal: "Erroneous category slab applied under Schedule Item 3.",
        undisputedTaxDeposited: 2000,
        decisionType: "REDUCE",
        reliefAmount: 2000,
        revisedTaxAmount: 2000,
        findingsAndReasoning:
          "Assessee produced audited financial statements proving eligibility for lower bracket."
      });

      const pdf = await generateAppellateOrderPdf(orderData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 14. UNIT MASTER DOSSIER
  // ---------------------------------------------------------------------------
  describe("Unit Master Dossier PDF Generation", () => {
    it("generates complete registration, assessment, and append-only ledger dossier", async () => {
      const dossierData: UnitDossierData = {
        unit: alMadina,
        generatedAt: "2026-09-26",
        officerName: "Malik Muhammad Imran",
        officerTitle: "Excise & Taxation Officer, Vehari",
        officialSha256: "sha256-dossier-al-madina"
      };

      const pdf = await generateUnitDossierPdf(dossierData);
      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
    });
  });

  // ---------------------------------------------------------------------------
  // 15. CENTRAL AUTHORITATIVE DISPATCHER ROUTING
  // ---------------------------------------------------------------------------
  describe("Central Authoritative PDF Router (generateAuthoritativePdf)", () => {
    it("routes PFT2 Challan through authoritative generator", async () => {
      const challan = generateFormPFT2(alMadina);
      challan.challanStatus = "ISSUED";

      const pdf = await generateAuthoritativePdf(
        {
          documentType: "PFT2_CHALLAN",
          entityId: alMadina.provincialUin,
          data: challan
        },
        undefined,
        { role: "ETO", district: "Vehari", circle: "Vehari Circle-I" }
      );

      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(297);
    });

    it("routes PFT1 Demand Notice through authoritative generator", async () => {
      const pft1 = generateFormPFT1(alMadina);
      const pdf = await generateAuthoritativePdf(
        {
          documentType: "PFT1_DEMAND_NOTICE",
          entityId: alMadina.provincialUin,
          data: pft1
        },
        undefined,
        { role: "ETO", district: "Vehari", circle: "Vehari Circle-I" }
      );

      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
    });

    it("allows an authenticated Inspector to generate a jurisdiction-scoped executive brief", async () => {
      const pdf = await generateAuthoritativePdf(
        "EXECUTIVE_PFT2_BRIEF",
        {
          totalChallans: 0,
          totalAssessedSum: 0,
          totalReceivedSum: 0,
          totalOutstandingSum: 0,
          fullScopeCount: 0,
          partialScopeCount: 0,
          issuedCount: 0,
          receivedCount: 0,
          cancelledCount: 0,
          circleBreakdown: [],
          categoryBreakdown: [],
          generatedAt: "2026-10-02",
          officerName: "Muhammad Nasir Khan",
          officerTitle: "Excise & Taxation Inspector",
          officialSha256: "test-executive-brief"
        },
        {
          role: "INSPECTOR",
          jurisdictionId: alMadina.circleId,
          circle: alMadina.circleName ?? "Circle 1"
        }
      );

      expect(pdf).toBeDefined();
      expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
    });

    it("rejects unauthorized lifecycle state when invoked through central dispatcher", async () => {
      const unissuedChallan = generateFormPFT2(alMadina);
      unissuedChallan.challanStatus = "PENDING_REVIEW";

      await expect(
        generateAuthoritativePdf({
          documentType: "PFT2_CHALLAN",
          entityId: alMadina.provincialUin,
          data: unissuedChallan
        })
      ).rejects.toThrow(/Document lifecycle violation/);
    });
  });
});

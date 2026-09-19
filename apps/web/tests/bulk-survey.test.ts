import { describe, expect, it } from "vitest";
import {
  convertValidSurveyUnitsToStoredUnits,
  generateSurveyCsvTemplate,
  parseBulkSurveyCsv,
  parseCsvContent
} from "../src/lib/bulk-survey.js";
import { MOCK_OFFICERS, createInitialPilotUnits } from "../src/lib/pilot-store.js";

describe("Phase 4: Bulk Survey Import & PFT-3 Register Ingestion", () => {
  it("generates a valid, download-ready survey CSV template", () => {
    const template = generateSurveyCsvTemplate();
    expect(template).toContain("Legal Name");
    expect(template).toContain("Identifier Value");
    expect(template).toContain("Statutory Rule ID");
    expect(template).toContain("Vehari Grain Commission Shop");

    const parsed = parseCsvContent(template);
    expect(parsed.length).toBe(6); // 1 header + 5 data rows
    expect(parsed[0]).toContain("Legal Name");
  });

  it("handles RFC-4180 CSV parsing with commas, quotes, and CRLF line endings", () => {
    const sample =
      "Legal Name,Trade Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Phone\r\n" +
      '"Boutique, Fashion & Tailoring","Glamour Center",CNIC,36601-1111111-1,"Shop #4, Main Bazar, Vehari",PFT-3.i.b,0300-1234567\r\n' +
      '"Al-Qasim ""Special"" Rice Mills",Al-Qasim,NTN,1234567-8,"Grain Market, Vehari",PFT-1.i,0301-9998887';

    const parsed = parseCsvContent(sample);
    expect(parsed.length).toBe(3);
    expect(parsed[1]?.[0]).toBe("Boutique, Fashion & Tailoring");
    expect(parsed[1]?.[4]).toBe("Shop #4, Main Bazar, Vehari");
    expect(parsed[2]?.[0]).toBe('Al-Qasim "Special" Rice Mills');
  });

  it("successfully validates and parses the standard template against Second Schedule rules", () => {
    const existingUnits = createInitialPilotUnits();
    const template = generateSurveyCsvTemplate();

    const result = parseBulkSurveyCsv(template, existingUnits);
    expect(result.totalRows).toBe(5);
    expect(result.validRowsCount).toBe(5);
    expect(result.errorRowsCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.validUnits.length).toBe(5);

    // Verify statutory rule resolution and rates
    const grainShop = result.validUnits.find((u) => u.legalName.includes("Grain Commission"));
    expect(grainShop).toBeDefined();
    expect(grainShop?.statutoryRule.rule_id).toBe("PFT-6.x");
    expect(grainShop?.taxAmount).toBe(2000);

    const clinic = result.validUnits.find((u) => u.legalName.includes("Clinic"));
    expect(clinic).toBeDefined();
    expect(clinic?.statutoryRule.rule_id).toBe("PFT-6.ii");
    expect(clinic?.taxAmount).toBe(4000);

    const sweetPalace = result.validUnits.find((u) => u.legalName.includes("Sweet Palace"));
    expect(sweetPalace).toBeDefined();
    expect(sweetPalace?.statutoryRule.rule_id).toBe("PFT-10");
    expect(sweetPalace?.taxAmount).toBe(5000);

    const developers = result.validUnits.find((u) => u.legalName.includes("Developers"));
    expect(developers).toBeDefined();
    expect(developers?.statutoryRule.rule_id).toBe("PFT-8");
    expect(developers?.taxAmount).toBe(50000);
  });

  it("resolves both machine rule IDs (PFT-6.x) and schedule subclassification codes (6(x))", () => {
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID\n" +
      "Test Subclass Shop,CNIC,36601-9999999-1,Bazar Vehari,6(x)\n" +
      "Test Direct Rule Shop,CNIC,36601-8888888-2,Bazar Vehari,PFT-10";

    const result = parseBulkSurveyCsv(csv, []);
    expect(result.validRowsCount).toBe(2);
    expect(result.rows[0]?.parsedUnit?.statutoryRule.rule_id).toBe("PFT-6.x");
    expect(result.rows[1]?.parsedUnit?.statutoryRule.rule_id).toBe("PFT-10");
  });

  it("detects missing mandatory fields and invalid identifiers", () => {
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID\n" +
      ",CNIC,36601-1234567-1,Vehari,PFT-6.x\n" + // Missing Legal Name
      "Missing Address Shop,CNIC,36601-1234567-2,,PFT-6.x\n" + // Missing Address
      "Invalid CNIC Shop,CNIC,12345,Vehari,PFT-6.x\n" + // Invalid CNIC (too short)
      "Invalid Rule Shop,CNIC,36601-1234567-3,Vehari,NON_EXISTENT_RULE"; // Invalid Rule

    const result = parseBulkSurveyCsv(csv, []);
    expect(result.totalRows).toBe(4);
    expect(result.validRowsCount).toBe(0);
    expect(result.errorRowsCount).toBe(4);

    expect(result.rows[0]?.errors).toContain("Missing required field: Legal Name");
    expect(result.rows[1]?.errors).toContain("Missing required field: Commercial Address");
    expect(result.rows[2]?.errors[0]).toContain("Invalid CNIC");
    expect(result.rows[3]?.errors[0]).toContain("Unrecognized Statutory Rule");
  });

  it("flags in-file duplicate identifiers across rows", () => {
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID\n" +
      "First Entry,CNIC,36601-5555555-5,Grain Market Vehari,PFT-6.x\n" +
      "Duplicate Entry,CNIC,36601-5555555-5,Club Road Vehari,PFT-8";

    const result = parseBulkSurveyCsv(csv, []);
    expect(result.totalRows).toBe(2);
    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(1);
    expect(result.duplicateCount).toBe(1);

    expect(result.rows[1]?.status).toBe("ERROR");
    expect(result.rows[1]?.errors[0]).toContain("Duplicate identifier in upload file");
  });

  it("flags duplicate identifiers matching existing registered units", () => {
    const existingUnits = createInitialPilotUnits();
    // existing unit: Kisan Pesticides & Fertilizer Agency has CNIC 36601-2948192-3
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID\n" +
      "Duplicate Assessee,CNIC,36601-2948192-3,Grain Market Vehari,PFT-6.x";

    const result = parseBulkSurveyCsv(csv, existingUnits);
    expect(result.totalRows).toBe(1);
    expect(result.validRowsCount).toBe(0);
    expect(result.errorRowsCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.rows[0]?.errors[0]).toContain("Already registered");
  });

  it("converts valid survey units into StoredUnit records with initial submitted assessments", () => {
    const template = generateSurveyCsvTemplate();
    const result = parseBulkSurveyCsv(template, []);
    expect(result.validUnits.length).toBe(5);

    const officer = MOCK_OFFICERS[0]; // Inspector Aslam
    const { newUnits, auditItems } = convertValidSurveyUnitsToStoredUnits(
      result.validUnits,
      officer,
      4
    );

    expect(newUnits).toHaveLength(5);
    expect(auditItems).toHaveLength(1);
    expect(auditItems[0]?.eventType).toBe("BULK_SURVEY_IMPORTED");
    expect(auditItems[0]?.details).toContain("Circle-Vehari");

    // Check sequential permanent demand numbers
    expect(newUnits[0]?.demandUnit.permanentDemandNo).toBe("PDN-VEH-2026-0005");
    expect(newUnits[4]?.demandUnit.permanentDemandNo).toBe("PDN-VEH-2026-0009");

    // Check initial submitted assessment state
    for (const unit of newUnits) {
      expect(unit.assessments).toHaveLength(1);
      expect(unit.assessments[0]?.status).toBe("SUBMITTED");
      expect(unit.assessmentVersions[0]?.status).toBe("SUBMITTED");
      expect(unit.ledgerEntries).toHaveLength(0); // Ledger begins on approval
    }
  });
});

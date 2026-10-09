import { describe, expect, it } from "vitest";
import {
  convertValidSurveyUnitsToStoredUnits,
  generateSurveyCsvTemplate,
  parseBulkSurveyCsv,
  parseCsvContent,
  parseSurveyImportPayloadRows
} from "../src/lib/bulk-survey.js";
import { MOCK_OFFICERS, createInitialPilotUnits } from "../src/lib/pilot-store.js";
import { SURVEY_IMPORT_HEADERS } from "@ptas/domain";

describe("Phase 4: Bulk Survey Import & PFT-3 Register Ingestion", () => {
  it("generates a valid, download-ready blank survey CSV template", () => {
    const template = generateSurveyCsvTemplate();
    expect(template).toContain("Legal Name / Entity Name");
    expect(template).toContain("Taxpayer Name / Proprietor");
    expect(template).toContain("Identifier Type");
    expect(template).toContain("Identifier Value");
    expect(template).toContain("Commercial Address");
    expect(template).toContain("Statutory Rule ID (Auto)");
    expect(template).toContain("Phone");

    const parsed = parseCsvContent(template);
    expect(parsed.length).toBe(1); // 1 header row, zero sample units
    expect(parsed[0]).toEqual(SURVEY_IMPORT_HEADERS);
  });

  it("maps the 30-column workbook contract to server import keys", () => {
    const template = generateSurveyCsvTemplate();
    const row = SURVEY_IMPORT_HEADERS.map((header) => {
      if (header === "Division" || header === "Region") return "Multan";
      if (header === "District" || header === "Zone") return "Vehari";
      if (header === "Legal Name / Entity Name") return "Example Entity";
      return "";
    });
    const payloadRows = parseSurveyImportPayloadRows(`${template}${row.join(",")}\r\n`);
    expect(payloadRows).toEqual([
      expect.objectContaining({
        division: "Multan",
        region: "Multan",
        district: "Vehari",
        zone: "Vehari",
        legal_name: "Example Entity"
      })
    ]);
  });

  it("accepts an explicitly under-review survey row without treating it as an assessment", () => {
    const values = Object.fromEntries(SURVEY_IMPORT_HEADERS.map((header) => [header, ""]));
    Object.assign(values, {
      Division: "Multan",
      Region: "Multan",
      District: "Vehari",
      Zone: "Vehari",
      Circle: "Circle 1",
      "Commercial Address": "Main Bazar Vehari",
      "Legal Name / Entity Name": "Pending Classification Shop",
      "Tax Class (Select)": "Persons other than companies owning commercial establishments",
      "Financial Year (Auto)": "2026-2027",
      "Survey Date (Auto)": "2026-09-27",
      "Taxpayer Status": "Active",
      Remarks: "Under review"
    });
    const row = SURVEY_IMPORT_HEADERS.map((header) => values[header]);
    const csv = `${generateSurveyCsvTemplate()}${row.join(",")}\r\n`;

    const result = parseBulkSurveyCsv(csv, []);

    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(0);
    expect(result.validUnits).toHaveLength(0);
    expect(result.rows[0]?.warnings[0]).toContain("outside PFT-3");
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

  it("successfully validates and parses a survey batch against Second Schedule rules", () => {
    const existingUnits = createInitialPilotUnits();
    const sampleCsv =
      "Legal Name,Trade Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Phone\n" +
      "Vehari Grain Commission Shop,Kisan Commission,CNIC,36601-3829103-7,Shop 14 Grain Market Vehari,PFT-6.x,0300-7766554\n" +
      "Dr. Tariq Dental Clinic,Tariq Clinic,CNIC,36601-9281726-1,Club Road Vehari,PFT-6.ii,0301-4433221\n" +
      "Al-Madina Sweet Palace,Al-Madina Sweets,CNIC,36601-1928374-5,Karkhana Bazar Vehari,PFT-10,0302-1122334\n" +
      "Vehari Modern Developers,Modern City,NTN,7829102-4,Main Boulevard Vehari,PFT-8,0303-9988776\n" +
      "Chenab Cotton Ginners,Chenab Ginning,NTN,3920192-1,Multan Road Vehari,PFT-1.i,0304-5566778";

    const result = parseBulkSurveyCsv(sampleCsv, existingUnits);
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

  it("converts valid survey units into StoredUnit records with initial draft assessments", () => {
    const sampleCsv =
      "Legal Name,Trade Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Phone\n" +
      "Vehari Grain Commission Shop,Kisan Commission,CNIC,36601-3829103-7,Shop 14 Grain Market Vehari,PFT-6.x,0300-7766554\n" +
      "Dr. Tariq Dental Clinic,Tariq Clinic,CNIC,36601-9281726-1,Club Road Vehari,PFT-6.ii,0301-4433221\n" +
      "Al-Madina Sweet Palace,Al-Madina Sweets,CNIC,36601-1928374-5,Karkhana Bazar Vehari,PFT-10,0302-1122334\n" +
      "Vehari Modern Developers,Modern City,NTN,7829102-4,Main Boulevard Vehari,PFT-8,0303-9988776\n" +
      "Chenab Cotton Ginners,Chenab Ginning,NTN,3920192-1,Multan Road Vehari,PFT-1.i,0304-5566778";

    const result = parseBulkSurveyCsv(sampleCsv, []);
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
    expect(auditItems[0]?.details).toContain("Vehari Circle I");

    // Check sequential permanent demand numbers (circle-wise 4-digit sequence)
    expect(newUnits[0]?.demandUnit.permanentDemandNo).toBe("0005");
    expect(newUnits[4]?.demandUnit.permanentDemandNo).toBe("0009");

    // Check initial draft (feeded) assessment state per Issue 03
    for (const unit of newUnits) {
      expect(unit.assessments).toHaveLength(1);
      expect(unit.assessments[0]?.status).toBe("DRAFT");
      expect(unit.assessmentVersions[0]?.status).toBe("DRAFT");
      expect(unit.ledgerEntries).toHaveLength(0); // Ledger begins on approval
    }
  });

  it("enforces circle jurisdiction boundary for Inspector (denies non-matching circles)", () => {
    const inspector = MOCK_OFFICERS[0]; // Tax Inspector (Vehari Circle I)
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Circle\n" +
      "Shop in Circle 1,CNIC,36601-1111111-1,Main Bazar Vehari,PFT-6.x,Vehari Circle I (City / Commercial)\n" +
      "Shop in Burewala,CNIC,36601-2222222-2,Main Bazar Burewala,PFT-6.x,Burewala Circle";

    const result = parseBulkSurveyCsv(csv, [], inspector);
    expect(result.totalRows).toBe(2);
    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[1]?.status).toBe("ERROR");
    expect(result.rows[1]?.errors[0]).toContain("Jurisdiction mismatch: Inspector");
    expect(result.rows[1]?.errors[0]).toContain("Cannot import record for Circle");
  });

  it("allows ETO to import rows across all District Vehari sub-jurisdiction circles but denies other districts", () => {
    const eto = MOCK_OFFICERS[1]; // ETO Vehari
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,District,Circle\n" +
      "Burewala Traders,CNIC,36601-3333333-3,Grain Market Burewala,PFT-6.x,Vehari,Burewala Circle\n" +
      "Mailsi Cotton Shop,CNIC,36601-4444444-4,Colony Road Mailsi,PFT-6.x,Vehari,Mailsi Circle\n" +
      "Multan Mall Shop,CNIC,36601-5555555-5,Cantonment Multan,PFT-6.x,Multan,Multan Circle 1";

    const result = parseBulkSurveyCsv(csv, [], eto);
    expect(result.totalRows).toBe(3);
    expect(result.validRowsCount).toBe(2);
    expect(result.errorRowsCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[1]?.status).toBe("VALID");
    expect(result.rows[2]?.status).toBe("ERROR");
    expect(result.rows[2]?.errors[0]).toContain("Jurisdiction mismatch");
  });

  it("discards rows with already existing legal names in the same circle", () => {
    const existingUnits = createInitialPilotUnits();
    const existingName = existingUnits[0]!.legalName;
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Circle\n" +
      `${existingName.toLowerCase()},CNIC,36601-9988112-9,New Branch Club Road,PFT-1.i,Vehari Circle I (City / Commercial)\n` +
      `${existingName},CNIC,36601-9988113-8,Chichawatni Road,PFT-1.i,Burewala Circle`;

    const result = parseBulkSurveyCsv(csv, existingUnits);
    expect(result.totalRows).toBe(2);
    // Row 1 should be discarded as duplicate legal name in Circle I
    expect(result.rows[0]?.status).toBe("ERROR");
    expect(result.rows[0]?.errors[0]).toContain("Duplicate legal name: Legal name");
    expect(result.rows[0]?.errors[0]).toContain("already exists in circle");
    expect(result.rows[0]?.errors[0]).toContain("Discarded per circle duplication rules");
    // Row 2 should be valid because it belongs to a different circle (Burewala Circle)
    expect(result.rows[1]?.status).toBe("VALID");
    expect(result.duplicateCount).toBe(1);
    expect(result.validRowsCount).toBe(1);
  });

  it("discards intra-batch duplicate legal names within the same circle", () => {
    const csv =
      "Legal Name,Identifier Type,Identifier Value,Commercial Address,Statutory Rule ID,Circle\n" +
      "Bismillah Cloth House,CNIC,36601-1122112-1,Shop 1 Main Bazar,PFT-3.i.b,Vehari Circle I (City / Commercial)\n" +
      "bismillah cloth house,CNIC,36601-1122113-2,Shop 2 Main Bazar,PFT-3.i.b,Vehari Circle I (City / Commercial)";

    const result = parseBulkSurveyCsv(csv, []);
    expect(result.totalRows).toBe(2);
    expect(result.validRowsCount).toBe(1);
    expect(result.errorRowsCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.rows[0]?.status).toBe("VALID");
    expect(result.rows[1]?.status).toBe("ERROR");
    expect(result.rows[1]?.errors[0]).toContain("Duplicate legal name in upload file");
  });
});

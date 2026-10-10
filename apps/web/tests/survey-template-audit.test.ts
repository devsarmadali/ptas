import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  convertSurveyWorkbookToCsv,
  parseBulkSurveyCsv,
  parseSurveyImportPayloadRows
} from "../src/lib/bulk-survey";
import { MOCK_OFFICERS } from "../src/lib/pilot-store";

describe("Standardized Ingestion Audit of PTAS_Multan_Division_Field_Survey_With_Units_v1.13.xlsx", () => {
  const filePath = path.resolve(
    __dirname,
    "../../../PTAS_Multan_Division_Field_Survey_With_Units_v1.13.xlsx"
  );

  it("converts workbook and parses 763 surveyed units reliably", async () => {
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const file = new File([blob], "PTAS_Multan_Division_Field_Survey_With_Units_v1.13.xlsx");

    // 1. Convert Excel workbook to standard RFC-4180 CSV
    const csv = await convertSurveyWorkbookToCsv(file);
    const lines = csv.split("\r\n").filter((l) => l.trim().length > 0);

    // 1 header + 763 populated unit rows
    expect(lines.length).toBe(764);

    // 2. Validate with ETO officer jurisdiction (Assessing Authority)
    const etoOfficer = MOCK_OFFICERS.find((o) => o.role === "ETO");
    expect(etoOfficer).toBeDefined();

    const parseResult = parseBulkSurveyCsv(csv, [], etoOfficer);

    expect(parseResult.totalRows).toBe(763);
    // 750 valid units (classified ready + unclassified pending review)
    expect(parseResult.validRowsCount).toBe(750);
    // 13 duplicate legal names in Circle 1 flagged per statutory duplication rules
    expect(parseResult.errorRowsCount).toBe(13);
    expect(parseResult.duplicateCount).toBe(13);

    // Verify classified units have resolved rules and rates
    const classifiedUnits = parseResult.validUnits.filter((u) => u.statutoryRule !== undefined);
    expect(classifiedUnits.length).toBe(650);

    // Verify all classified units have positive annual rate
    for (const u of classifiedUnits) {
      expect(u.taxAmount).toBeGreaterThan(0);
      expect(u.categoryCode).toBeDefined();
      expect(u.districtName).toBe("Vehari");
      expect(u.circleName).toBe("Vehari Circle I (City / Commercial)");
    }

    // 3. Verify server payload mapping
    const payloadRows = parseSurveyImportPayloadRows(csv);
    expect(payloadRows.length).toBe(763);
    const firstPayload = payloadRows[0];
    expect(firstPayload).toBeDefined();
    expect(firstPayload?.division).toBe("Multan");
    expect(firstPayload?.district).toBe("Vehari");
    expect(firstPayload?.legal_name).toBe("Horizon Oil Company");
  }, 60000);
});

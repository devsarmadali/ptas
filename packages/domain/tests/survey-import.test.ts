import { describe, expect, it } from "vitest";
import {
  SURVEY_IMPORT_COLUMNS,
  SURVEY_IMPORT_HEADERS,
  createSurveyImportCsvTemplate,
  isExactSurveyImportHeader
} from "../src/survey-import.js";

describe("survey import contract", () => {
  it("matches the Survey_Import_Filled workbook contract", () => {
    expect(SURVEY_IMPORT_COLUMNS).toHaveLength(30);
    expect(SURVEY_IMPORT_HEADERS[0]).toBe("Survey No. (Auto)");
    expect(SURVEY_IMPORT_HEADERS[29]).toBe("Import Status (Auto)");
    expect(createSurveyImportCsvTemplate()).toBe(`\uFEFF${SURVEY_IMPORT_HEADERS.join(",")}\r\n`);
  });

  it("requires the complete ordered header contract", () => {
    expect(isExactSurveyImportHeader(SURVEY_IMPORT_HEADERS)).toBe(true);
    expect(isExactSurveyImportHeader(SURVEY_IMPORT_HEADERS.slice(1))).toBe(false);
    expect(isExactSurveyImportHeader([...SURVEY_IMPORT_HEADERS].reverse())).toBe(false);
  });
});

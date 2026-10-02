import { describe, expect, it } from "vitest";
import { mapOperationalUnit } from "../src/lib/operational-survey.js";

describe("operational survey projection", () => {
  it("keeps internal UUID keys out of public statutory identifier fields", () => {
    const unit = mapOperationalUnit({
      unit_id: "7e65b0a1-4e56-4608-9717-61d846c7665f",
      workflow_state: "APPROVED",
      taxpayer: {
        id: "63eb45f4-0fbe-44b9-a652-c256ac021140",
        legal_name: "City Electronics",
        permanent_demand_no: null
      },
      identifier: { identifier_type: "NTN", identifier_value: "1234567-8" },
      profile: {
        survey_no: "486ba4ad-4620-43cf-a3b6-13363289fb15",
        legacy_demand_no: "V-01-184",
        address: "Vehari"
      },
      jurisdiction: {
        id: "38fbea1f-2630-4a3e-a1c4-8fd041e45058",
        name: "Circle 1",
        tier: "CIRCLE"
      },
      assessment: {
        id: "e1808a0d-3c91-4c1c-aa76-1ee5731d492e",
        status: "APPROVED"
      },
      demand_unit: { id: "3ffd77cd-cab1-483d-b5fe-3afa2e171852" },
      pft3_registered: true
    });

    expect(unit.assessmentNumber).toBe("");
    expect(unit.pinNumber).toBeUndefined();
    expect(unit.provincialUin).toBe("");
    expect(unit.demandNumber).toBe("V-01-184");
    expect(unit.demandUnit.permanentDemandNo).toBe("V-01-184");
    expect(unit.circleName).toBe("Circle 1");
    expect(unit.pft3Registered).toBe(true);
  });

  it("accepts explicit non-UUID assessment and PIN values", () => {
    const unit = mapOperationalUnit({
      unit_id: "7e65b0a1-4e56-4608-9717-61d846c7665f",
      taxpayer: {
        legal_name: "Registered Unit",
        permanent_demand_no: "PIN-VHR-0001"
      },
      profile: {
        survey_no: "486ba4ad-4620-43cf-a3b6-13363289fb15",
        assessment_number: "ASM-VHR-0001",
        legacy_demand_no: "D-16"
      }
    });

    expect(unit.assessmentNumber).toBe("ASM-VHR-0001");
    expect(unit.pinNumber).toBe("PIN-VHR-0001");
    expect(unit.provincialUin).toBe("PIN-VHR-0001");
  });
});

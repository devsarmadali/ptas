import { describe, expect, it } from "vitest";
import { transitionAssessment } from "../src/assessment-workflow";

describe("assessment workflow", () => {
  it("supports submit and approval", () => {
    expect(transitionAssessment("DRAFT", "SUBMIT")).toBe("SUBMITTED");
    expect(transitionAssessment("HEARING_RECORDED", "APPROVE")).toBe("APPROVED");
  });

  it("does not allow direct draft approval", () => {
    expect(() => transitionAssessment("DRAFT", "APPROVE")).toThrow(/not allowed/);
  });

  it("uses a revision after approval", () => {
    expect(transitionAssessment("APPROVED", "CREATE_REVISION")).toBe("REVISION_DRAFT");
  });
});

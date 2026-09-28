import { describe, expect, it } from "vitest";
import {
  canReceiveChallanPayment,
  isAutomaticCancellationDue,
  transitionDeletionRequest,
  transitionShowCause,
  transitionSurvey
} from "../src/professional-tax-workflows.js";

describe("professional tax workflows", () => {
  it("enforces Inspector submission and ETO approval", () => {
    expect(transitionSurvey("FEEDED", "SUBMIT", "INSPECTOR")).toBe("SUBMITTED");
    expect(transitionSurvey("SUBMITTED", "APPROVE", "ETO")).toBe("APPROVED");
    expect(() => transitionSurvey("FEEDED", "APPROVE", "ETO")).toThrow(/not allowed/);
    expect(() => transitionSurvey("SUBMITTED", "APPROVE", "INSPECTOR")).toThrow(/not authorized/);
  });

  it("makes close and return terminal or reasoned", () => {
    expect(() => transitionSurvey("FEEDED", "CLOSE", "INSPECTOR")).toThrow(/reason/);
    expect(transitionSurvey("FEEDED", "CLOSE", "INSPECTOR", "duplicate import")).toBe("CLOSED");
    expect(() => transitionSurvey("CLOSED", "SUBMIT", "INSPECTOR")).toThrow(/not allowed/);
  });

  it("cannot skip show-cause prerequisites", () => {
    expect(() => transitionShowCause("ISSUED", "IMPOSE_PENALTY", "ETO", "late response")).toThrow(
      /not allowed/
    );
    expect(
      transitionShowCause("PROCESS_COMPLETED", "IMPOSE_PENALTY", "ETO", "response decided")
    ).toBe("PENALTY_IMPOSED");
  });

  it("segregates demand deletion request and approval", () => {
    expect(() => transitionDeletionRequest("PENDING", "APPROVE", "INSPECTOR", "requested")).toThrow(
      /not authorized/
    );
    expect(transitionDeletionRequest("PENDING", "APPROVE", "ETO", "duplicate demand")).toBe(
      "APPROVED"
    );
  });

  it("allows receipt after administrative cancellation", () => {
    expect(canReceiveChallanPayment("CANCELLED", "OUTSTANDING")).toBe(true);
    expect(canReceiveChallanPayment("PREPARED", "OUTSTANDING")).toBe(false);
    expect(canReceiveChallanPayment("CANCELLED", "RECEIVED")).toBe(false);
  });

  it("uses the Pakistan business-date boundary after the full grace period", () => {
    expect(isAutomaticCancellationDue("ISSUED", "OUTSTANDING", "2026-09-01", "2026-09-04")).toBe(
      false
    );
    expect(isAutomaticCancellationDue("ISSUED", "OUTSTANDING", "2026-09-01", "2026-09-05")).toBe(
      true
    );
  });
});

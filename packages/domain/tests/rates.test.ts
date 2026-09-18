import { describe, expect, it } from "vitest";
import { assertPenaltyWithinCeiling, selectHighestApprovedRate } from "../src/rates";

describe("rate rules", () => {
  it("selects the highest applicable approved rate", () => {
    expect(
      selectHighestApprovedRate([
        { categoryVersionId: "a", amount: 1000 },
        { categoryVersionId: "b", amount: 5000 },
        { categoryVersionId: "c", amount: 2000 }
      ])
    ).toEqual({ categoryVersionId: "b", amount: 5000 });
  });

  it("rejects a penalty above the tax amount ceiling", () => {
    expect(() => assertPenaltyWithinCeiling(1001, 1000)).toThrow(/ceiling/);
  });
});

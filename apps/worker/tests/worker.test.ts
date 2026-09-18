import { describe, expect, it } from "vitest";
import { processJob } from "../src/index.js";

describe("worker job processor", () => {
  it("rejects invalid job envelopes missing required properties", async () => {
    await expect(
      processJob({
        id: "",
        type: "test",
        correlationId: "corr-1",
        attempt: 1,
        payload: null
      })
    ).rejects.toThrow("Invalid job envelope");
  });

  it("accepts a valid job envelope", async () => {
    await expect(
      processJob({
        id: "job-1",
        type: "unregistered.job",
        correlationId: "corr-1",
        attempt: 1,
        payload: { sample: true }
      })
    ).resolves.toBeUndefined();
  });
});

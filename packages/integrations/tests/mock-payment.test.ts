import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "../src";

describe("mock payment provider", () => {
  it("returns deterministic non-production data", async () => {
    const result = await new MockPaymentProvider().verifyAndParse(new Uint8Array(), {});
    expect(result.providerEventId).toBe("mock-event-1");
  });
});

import { describe, expect, it } from "vitest";
import { MockPaymentAdapter } from "@ptas/integrations";
import { JobProcessor, createPaymentJobHandler, processJob } from "../src/index.js";

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

  it("processes payment confirmation job using MockPaymentAdapter", async () => {
    const adapter = new MockPaymentAdapter();
    const processor = new JobProcessor();

    const lookup = (psid: string) => {
      if (psid === "12345678901234567") {
        return {
          demandUnitId: "du-1",
          amount: 2500,
          taxpayerId: "tp-1"
        };
      }
      return null;
    };

    processor.registerHandler("payment.confirmation", createPaymentJobHandler(adapter, lookup));

    const event = adapter.createSignedWebhookEvent({
      psid: "12345678901234567",
      amount: 2500,
      transactionReference: "TXN-WORKER-001",
      settlementDate: "2026-07-16",
      status: "PAID"
    });

    const result = (await processor.processJob({
      id: "job-pay-01",
      type: "payment.confirmation",
      correlationId: "corr-worker-pay",
      attempt: 1,
      payload: event
    })) as { outcome: string; amount: number };

    expect(result.outcome).toBe("PROCESSED");
    expect(result.amount).toBe(2500);
    expect(adapter.isProcessed(event.eventId)).toBe(true);

    // Duplicate redelivery test
    const dupResult = (await processor.processJob({
      id: "job-pay-02",
      type: "payment.confirmation",
      correlationId: "corr-worker-pay-dup",
      attempt: 1,
      payload: event
    })) as { outcome: string };

    expect(dupResult.outcome).toBe("DUPLICATE_IGNORED");
  });

  it("routes exceeded retry attempts to dead-letter queue via worker job", async () => {
    const adapter = new MockPaymentAdapter();
    const processor = new JobProcessor();

    processor.registerHandler(
      "payment.confirmation",
      createPaymentJobHandler(adapter, () => null)
    );

    const event = adapter.createSignedWebhookEvent({
      psid: "12345678901234567",
      amount: 2500,
      transactionReference: "TXN-WORKER-002",
      settlementDate: "2026-07-16",
      status: "PAID"
    });

    const result = (await processor.processJob({
      id: "job-pay-retry",
      type: "payment.confirmation",
      correlationId: "corr-worker-pay-retry",
      attempt: 4, // Max attempts exceeded
      payload: event
    })) as { outcome: string; deadLetterReason: string };

    expect(result.outcome).toBe("DEAD_LETTER");
    expect(result.deadLetterReason).toContain("Exceeded maximum retry attempts");
    expect(adapter.getDeadLetters()).toHaveLength(1);
  });
});

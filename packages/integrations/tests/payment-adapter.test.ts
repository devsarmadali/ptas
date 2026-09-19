import { describe, expect, it } from "vitest";
import type { PaymentConfirmationPayload } from "../src/index.js";
import { MockPaymentAdapter } from "../src/index.js";

describe("MockPaymentAdapter (PTAS-090)", () => {
  const validPsid = "99202607160000001";
  const expectedDemand = {
    demandUnitId: "11111111-1111-4111-8111-111111111111",
    amount: 5000,
    taxpayerId: "22222222-2222-4222-8222-222222222222"
  };

  const lookup = (psid: string) => {
    if (psid === validPsid) {
      return expectedDemand;
    }
    return null;
  };

  const validPayload: PaymentConfirmationPayload = {
    psid: validPsid,
    amount: 5000,
    transactionReference: "EPAY-TXN-20260716-0001",
    settlementDate: "2026-07-16",
    status: "PAID"
  };

  it("successfully verifies and processes a valid signed payment webhook", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const event = freshAdapter.createSignedWebhookEvent(validPayload);

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-pay-01" },
      lookup
    );

    expect(result.outcome).toBe("PROCESSED");
    expect(result.eventId).toBe(event.eventId);
    expect(result.amount).toBe(5000);
    expect(freshAdapter.isProcessed(event.eventId)).toBe(true);
  });

  it("handles duplicate event redeliveries idempotently without side-effects", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const event = freshAdapter.createSignedWebhookEvent(validPayload);

    // First processing
    const firstResult = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-pay-02" },
      lookup
    );
    expect(firstResult.outcome).toBe("PROCESSED");

    // Second processing of identical event
    const secondResult = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-pay-02-retry" },
      lookup
    );
    expect(secondResult.outcome).toBe("DUPLICATE_IGNORED");
    expect(secondResult.eventId).toBe(event.eventId);
  });

  it("rejects invalid HMAC signatures and routes to dead-letter queue", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const event = freshAdapter.createSignedWebhookEvent(validPayload, {
      customSecret: "wrong-secret-00000000000000000000000000000000"
    });

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-bad-sig" },
      lookup
    );

    expect(result.outcome).toBe("DEAD_LETTER");
    expect(result.deadLetterReason).toContain("Invalid cryptographic HMAC signature");

    const deadLetters = freshAdapter.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]?.originalEvent.eventId).toBe(event.eventId);
    expect(deadLetters[0]?.error).toContain("Invalid cryptographic HMAC signature");
  });

  it("rejects timestamps outside acceptable replay window and routes to dead letter", async () => {
    const freshAdapter = new MockPaymentAdapter("secret", 300);
    const expiredTimestamp = new Date(Date.now() - 600 * 1000).toISOString(); // 10 minutes ago (> 5 min)
    const event = freshAdapter.createSignedWebhookEvent(validPayload, {
      timestamp: expiredTimestamp
    });

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-expired" },
      lookup
    );

    expect(result.outcome).toBe("DEAD_LETTER");
    expect(result.deadLetterReason).toContain("replay window");
  });

  it("detects amount mismatches and records them in reconciliation log", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const mismatchedPayload: PaymentConfirmationPayload = {
      ...validPayload,
      amount: 3000 // Expected is 5000
    };
    const event = freshAdapter.createSignedWebhookEvent(mismatchedPayload);

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-mismatch" },
      lookup
    );

    expect(result.outcome).toBe("AMOUNT_MISMATCH");
    expect(result.discrepancy?.expected).toBe(5000);
    expect(result.discrepancy?.received).toBe(3000);
    expect(result.discrepancy?.difference).toBe(-2000);

    // Must not be marked as processed
    expect(freshAdapter.isProcessed(event.eventId)).toBe(false);

    // Recorded in reconciliation log
    const mismatches = freshAdapter.getMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.difference).toBe(-2000);
  });

  it("handles unknown PSID without recording as processed", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const unknownPayload: PaymentConfirmationPayload = {
      ...validPayload,
      psid: "00000000000000000"
    };
    const event = freshAdapter.createSignedWebhookEvent(unknownPayload);

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-unknown-psid" },
      lookup
    );

    expect(result.outcome).toBe("PSID_NOT_FOUND");
    expect(freshAdapter.isProcessed(event.eventId)).toBe(false);
  });

  it("routes message to dead-letter queue when retry attempts exceed 3", async () => {
    const freshAdapter = new MockPaymentAdapter();
    const event = freshAdapter.createSignedWebhookEvent(validPayload);

    const result = await freshAdapter.processPaymentEvent(
      event,
      { correlationId: "corr-max-retries", attempt: 4 },
      lookup
    );

    expect(result.outcome).toBe("DEAD_LETTER");
    expect(result.deadLetterReason).toContain("Exceeded maximum retry attempts");

    const deadLetters = freshAdapter.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]?.attempts).toBe(4);
  });
});

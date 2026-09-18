export type PaymentConfirmation = Readonly<{
  providerEventId: string;
  providerReference: string;
  amount: number;
  occurredAt: string;
  payloadHash: string;
}>;

export interface PaymentProviderPort {
  verifyAndParse(
    rawBody: Uint8Array,
    headers: Readonly<Record<string, string>>
  ): Promise<PaymentConfirmation>;
}

export class MockPaymentProvider implements PaymentProviderPort {
  async verifyAndParse(): Promise<PaymentConfirmation> {
    return {
      providerEventId: "mock-event-1",
      providerReference: "mock-reference-1",
      amount: 1000,
      occurredAt: "2026-07-16T00:00:00.000Z",
      payloadHash: "mock-hash-not-for-production"
    };
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";

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

export interface PaymentConfirmationPayload {
  readonly psid: string; // Statutory PSID / Challan reference
  readonly amount: number; // Deposit amount
  readonly transactionReference: string;
  readonly settlementDate: string; // YYYY-MM-DD
  readonly status: "PAID" | "FAILED" | "REVERSED";
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PaymentWebhookEvent {
  readonly providerId: string;
  readonly eventId: string;
  readonly timestamp: string; // ISO 8601
  readonly signature: string; // HMAC-SHA256 hex digest
  readonly payload: PaymentConfirmationPayload;
}

export type ProcessPaymentOutcome =
  "PROCESSED" | "DUPLICATE_IGNORED" | "AMOUNT_MISMATCH" | "PSID_NOT_FOUND" | "DEAD_LETTER";

export interface ProcessPaymentResult {
  readonly outcome: ProcessPaymentOutcome;
  readonly eventId: string;
  readonly transactionReference?: string | undefined;
  readonly amount?: number | undefined;
  readonly expectedAmount?: number | undefined;
  readonly discrepancy?:
    | {
        readonly expected: number;
        readonly received: number;
        readonly difference: number;
      }
    | undefined;
  readonly deadLetterReason?: string | undefined;
  readonly processedAt: string; // ISO 8601
}

export interface DeadLetterRecord {
  readonly id: string;
  readonly originalEvent: PaymentWebhookEvent;
  readonly error: string;
  readonly correlationId: string;
  readonly attempts: number;
  readonly routedAt: string; // ISO 8601
}

export interface ReconciliationMismatch {
  readonly eventId: string;
  readonly psid: string;
  readonly expectedAmount: number;
  readonly receivedAmount: number;
  readonly difference: number;
  readonly transactionReference: string;
  readonly recordedAt: string; // ISO 8601
}

export interface ExpectedDemandInfo {
  readonly demandUnitId: string;
  readonly amount: number;
  readonly taxpayerId: string;
}

export type ExpectedDemandLookup = (
  psid: string
) => Promise<ExpectedDemandInfo | null> | ExpectedDemandInfo | null;

export const DEFAULT_MOCK_WEBHOOK_SECRET = "ptas-mock-dev-secret-0123456789abcdef";
const MAX_RETAINED_RECORDS = 10_000;

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeJsonValue(entry);
      }
    }
    return sorted;
  }
  return value;
}

export function computeHmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex").toLowerCase();
}

export function serializeWebhookPayload(
  payload: PaymentConfirmationPayload,
  timestamp: string
): string {
  const canonicalJson = JSON.stringify(canonicalizeJsonValue(payload));
  return `${timestamp}.${canonicalJson}`;
}

export function verifyWebhookSignature(
  payload: PaymentConfirmationPayload,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || signature.length !== 64) {
    return false;
  }
  const serialized = serializeWebhookPayload(payload, timestamp);
  const computed = computeHmacSha256(serialized, secret);

  const sigBuf = Buffer.from(signature.toLowerCase(), "utf8");
  const compBuf = Buffer.from(computed, "utf8");

  if (sigBuf.length !== compBuf.length) {
    return false;
  }
  return timingSafeEqual(sigBuf, compBuf);
}

export function validateReplayWindow(
  timestampIso: string,
  maxClockSkewSeconds = 300,
  nowMs = Date.now()
): boolean {
  const ts = Date.parse(timestampIso);
  if (Number.isNaN(ts)) {
    return false;
  }
  const skewMs = Math.abs(nowMs - ts);
  return skewMs <= maxClockSkewSeconds * 1000;
}

export class MockPaymentAdapter {
  private readonly processedEventIds = new Set<string>();
  private readonly inFlightEventIds = new Set<string>();
  private readonly deadLetters: DeadLetterRecord[] = [];
  private readonly mismatches: ReconciliationMismatch[] = [];

  constructor(
    private readonly secret: string = DEFAULT_MOCK_WEBHOOK_SECRET,
    private readonly maxClockSkewSeconds: number = 300
  ) {
    if (
      process.env.NODE_ENV === "production" &&
      (!secret || secret === DEFAULT_MOCK_WEBHOOK_SECRET || secret.length < 32)
    ) {
      throw new Error(
        "Production payment webhook adapter requires a dedicated HMAC secret of at least 32 characters."
      );
    }
  }

  private recordDeadLetter(
    event: PaymentWebhookEvent,
    error: string,
    correlationId: string,
    attempts: number,
    routedAt: string
  ): DeadLetterRecord {
    const deadLetter: DeadLetterRecord = Object.freeze({
      id: crypto.randomUUID(),
      originalEvent: event,
      error,
      correlationId,
      attempts,
      routedAt
    });
    this.deadLetters.push(deadLetter);
    if (this.deadLetters.length > MAX_RETAINED_RECORDS) {
      this.deadLetters.shift();
    }
    return deadLetter;
  }

  private recordMismatch(mismatchRecord: ReconciliationMismatch): void {
    this.mismatches.push(mismatchRecord);
    if (this.mismatches.length > MAX_RETAINED_RECORDS) {
      this.mismatches.shift();
    }
  }

  private markProcessed(eventId: string): void {
    if (this.processedEventIds.has(eventId)) {
      return;
    }
    if (this.processedEventIds.size >= MAX_RETAINED_RECORDS) {
      const oldest = this.processedEventIds.values().next().value;
      if (oldest !== undefined) {
        this.processedEventIds.delete(oldest);
      }
    }
    this.processedEventIds.add(eventId);
  }

  createSignedWebhookEvent(
    payload: PaymentConfirmationPayload,
    options?: {
      providerId?: string;
      eventId?: string;
      timestamp?: string;
      customSecret?: string;
    }
  ): PaymentWebhookEvent {
    const timestamp = options?.timestamp ?? new Date().toISOString();
    const secretToUse = options?.customSecret ?? this.secret;
    const serialized = serializeWebhookPayload(payload, timestamp);
    const signature = computeHmacSha256(serialized, secretToUse);

    return Object.freeze({
      providerId: options?.providerId ?? "EPAY_PUNJAB_MOCK",
      eventId: options?.eventId ?? crypto.randomUUID(),
      timestamp,
      signature,
      payload: Object.freeze({ ...payload })
    });
  }

  async processPaymentEvent(
    event: PaymentWebhookEvent,
    context: { correlationId: string; attempt?: number; nowMs?: number },
    lookup: ExpectedDemandLookup
  ): Promise<ProcessPaymentResult> {
    const attempt = context.attempt ?? 1;
    const nowIso = new Date().toISOString();

    // 1. Dead-letter on exceeded attempts (Poison-pill mitigation)
    if (attempt > 3) {
      const deadLetter = this.recordDeadLetter(
        event,
        `Exceeded maximum retry attempts (attempt: ${attempt} > 3)`,
        context.correlationId,
        attempt,
        nowIso
      );
      return Object.freeze({
        outcome: "DEAD_LETTER",
        eventId: event.eventId,
        deadLetterReason: deadLetter.error,
        processedAt: nowIso
      });
    }

    // 2. Cryptographic signature verification
    const isValidSig = verifyWebhookSignature(
      event.payload,
      event.timestamp,
      event.signature,
      this.secret
    );
    if (!isValidSig) {
      const deadLetter = this.recordDeadLetter(
        event,
        "Invalid cryptographic HMAC signature",
        context.correlationId,
        attempt,
        nowIso
      );
      return Object.freeze({
        outcome: "DEAD_LETTER",
        eventId: event.eventId,
        deadLetterReason: deadLetter.error,
        processedAt: nowIso
      });
    }

    // 3. Replay-window timestamp check
    const isWithinWindow = validateReplayWindow(
      event.timestamp,
      this.maxClockSkewSeconds,
      context.nowMs ?? Date.now()
    );
    if (!isWithinWindow) {
      const deadLetter = this.recordDeadLetter(
        event,
        `Timestamp outside acceptable replay window (skew > ${this.maxClockSkewSeconds}s)`,
        context.correlationId,
        attempt,
        nowIso
      );
      return Object.freeze({
        outcome: "DEAD_LETTER",
        eventId: event.eventId,
        deadLetterReason: deadLetter.error,
        processedAt: nowIso
      });
    }

    // 4. Reject non-settlement statuses and non-positive amounts
    if (
      event.payload.status !== "PAID" ||
      !Number.isFinite(event.payload.amount) ||
      event.payload.amount <= 0
    ) {
      const reason =
        event.payload.status !== "PAID"
          ? `Non-settlement payment webhook status rejected: ${String(event.payload.status)}`
          : "Payment webhook amount must be a positive finite number";
      const deadLetter = this.recordDeadLetter(
        event,
        reason,
        context.correlationId,
        attempt,
        nowIso
      );
      return Object.freeze({
        outcome: "DEAD_LETTER",
        eventId: event.eventId,
        deadLetterReason: deadLetter.error,
        processedAt: nowIso
      });
    }

    // 5. Idempotency + concurrent in-flight lock: Redelivered or racing events must not duplicate processing
    if (this.processedEventIds.has(event.eventId) || this.inFlightEventIds.has(event.eventId)) {
      return Object.freeze({
        outcome: "DUPLICATE_IGNORED",
        eventId: event.eventId,
        transactionReference: event.payload.transactionReference,
        amount: event.payload.amount,
        processedAt: nowIso
      });
    }

    this.inFlightEventIds.add(event.eventId);
    try {
      // 6. PSID demand lookup
      const demand = await lookup(event.payload.psid);
      if (!demand) {
        return Object.freeze({
          outcome: "PSID_NOT_FOUND",
          eventId: event.eventId,
          transactionReference: event.payload.transactionReference,
          amount: event.payload.amount,
          processedAt: nowIso
        });
      }

      // 7. Reconciliation amount mismatch detection
      if (demand.amount !== event.payload.amount) {
        const difference = event.payload.amount - demand.amount;
        this.recordMismatch(
          Object.freeze({
            eventId: event.eventId,
            psid: event.payload.psid,
            expectedAmount: demand.amount,
            receivedAmount: event.payload.amount,
            difference,
            transactionReference: event.payload.transactionReference,
            recordedAt: nowIso
          })
        );

        return Object.freeze({
          outcome: "AMOUNT_MISMATCH",
          eventId: event.eventId,
          transactionReference: event.payload.transactionReference,
          amount: event.payload.amount,
          expectedAmount: demand.amount,
          discrepancy: Object.freeze({
            expected: demand.amount,
            received: event.payload.amount,
            difference
          }),
          processedAt: nowIso
        });
      }

      // 8. Successful, balanced processing
      this.markProcessed(event.eventId);

      return Object.freeze({
        outcome: "PROCESSED",
        eventId: event.eventId,
        transactionReference: event.payload.transactionReference,
        amount: event.payload.amount,
        expectedAmount: demand.amount,
        processedAt: nowIso
      });
    } finally {
      this.inFlightEventIds.delete(event.eventId);
    }
  }

  getDeadLetters(): readonly DeadLetterRecord[] {
    return Object.freeze([...this.deadLetters]);
  }

  getMismatches(): readonly ReconciliationMismatch[] {
    return Object.freeze([...this.mismatches]);
  }

  isProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }
}

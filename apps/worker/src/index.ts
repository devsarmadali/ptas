import type {
  ExpectedDemandLookup,
  MockPaymentAdapter,
  PaymentWebhookEvent,
  ProcessPaymentResult
} from "@ptas/integrations";

export type JobEnvelope = Readonly<{
  id: string;
  type: string;
  correlationId: string;
  attempt: number;
  payload: unknown;
}>;

export type JobHandler = (job: JobEnvelope) => Promise<unknown>;

export class JobProcessor {
  private readonly handlers = new Map<string, JobHandler>();

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async processJob(job: JobEnvelope): Promise<unknown> {
    if (!job.id || !job.type || !job.correlationId) {
      throw new Error("Invalid job envelope");
    }

    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.warn(`No handler registered for job type: ${job.type}`);
      return undefined;
    }

    return handler(job);
  }
}

export function createPaymentJobHandler(
  adapter: MockPaymentAdapter,
  lookup: ExpectedDemandLookup
): JobHandler {
  return async (job: JobEnvelope): Promise<ProcessPaymentResult> => {
    const event = job.payload as PaymentWebhookEvent;
    if (!event || !event.eventId || !event.payload) {
      throw new Error("Invalid payment webhook payload in job envelope");
    }

    return adapter.processPaymentEvent(
      event,
      {
        correlationId: job.correlationId,
        attempt: job.attempt
      },
      lookup
    );
  };
}

const defaultProcessor = new JobProcessor();

export async function processJob(job: JobEnvelope): Promise<void> {
  await defaultProcessor.processJob(job);
}

export type JobEnvelope = Readonly<{
  id: string;
  type: string;
  correlationId: string;
  attempt: number;
  payload: unknown;
}>;

export async function processJob(job: JobEnvelope): Promise<void> {
  if (!job.id || !job.type || !job.correlationId) {
    throw new Error("Invalid job envelope");
  }

  // Provider-specific queue acknowledgement and retry behavior belongs in an adapter.
  console.warn(`No handler registered for job type: ${job.type}`);
}

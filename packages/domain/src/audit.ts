export interface AuditActor {
  readonly userId: string;
  readonly roleCode: string;
  readonly jurisdictionId?: string | undefined;
  readonly ipAddress?: string | undefined;
}

export interface AuditContext {
  readonly correlationId: string;
  readonly actor: AuditActor;
  readonly causationId?: string | undefined;
}

export interface CommandContext<TInput = unknown> {
  readonly commandId: string;
  readonly auditContext: AuditContext;
  readonly input: TInput;
}

export interface AuditEvent {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateType?: string | undefined;
  readonly aggregateId?: string | undefined;
  readonly actorId: string;
  readonly actorRole: string;
  readonly jurisdictionId?: string | undefined;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string; // ISO 8601 timestamp
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CreateAuditEventParams {
  readonly id?: string | undefined;
  readonly eventType: string;
  readonly aggregateType?: string | undefined;
  readonly aggregateId?: string | undefined;
  readonly actor: AuditActor;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: Date | string;
  readonly payload: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|credential|api[_-]?key|private[_-]?key|bearer|auth|authorization|pin|cvv|session[_-]?id|cookie|connection[_-]?string)/i;

const PRIVATE_KEY_PATTERN = /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i;

// 13-digit CNIC format (with or without hyphens: 35201-1234567-1 or 3520112345671)
const CNIC_HYPHEN_PATTERN = /\b(\d{5})-(\d{7})-(\d{1})\b/g;
const CNIC_RAW_PATTERN = /\b(\d{5})(\d{7})(\d{1})\b/g;

export function maskCnic(value: string): string {
  return value
    .replace(CNIC_HYPHEN_PATTERN, "$1-*******-$3")
    .replace(CNIC_RAW_PATTERN, "$1*******$3");
}

export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    if (PRIVATE_KEY_PATTERN.test(data)) {
      return "[REDACTED PRIVATE KEY]";
    }
    return maskCnic(data);
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return "[UNSUPPORTED DATA TYPE]";
}

export function validateCommandContext(ctx: CommandContext): void {
  if (!ctx || typeof ctx !== "object") {
    throw new Error("Invalid command context: context object is required");
  }

  if (!ctx.commandId || typeof ctx.commandId !== "string" || !ctx.commandId.trim()) {
    throw new Error("Invalid command context: commandId is required");
  }

  if (!ctx.auditContext || typeof ctx.auditContext !== "object") {
    throw new Error("Invalid command context: auditContext is required");
  }

  if (
    !ctx.auditContext.correlationId ||
    typeof ctx.auditContext.correlationId !== "string" ||
    !ctx.auditContext.correlationId.trim()
  ) {
    throw new Error("Invalid command context: correlationId is required");
  }

  const { actor } = ctx.auditContext;
  if (!actor || typeof actor !== "object") {
    throw new Error("Invalid command context: actor is required in auditContext");
  }

  if (!actor.userId || typeof actor.userId !== "string" || !actor.userId.trim()) {
    throw new Error("Invalid command context: actor.userId is required");
  }

  if (!actor.roleCode || typeof actor.roleCode !== "string" || !actor.roleCode.trim()) {
    throw new Error("Invalid command context: actor.roleCode is required");
  }
}

export function createAuditEvent(params: CreateAuditEventParams): AuditEvent {
  if (!params.eventType || !params.eventType.trim()) {
    throw new Error("AuditEvent requires an eventType");
  }
  if (!params.correlationId || !params.correlationId.trim()) {
    throw new Error("AuditEvent requires a correlationId");
  }
  if (!params.actor?.userId || !params.actor?.roleCode) {
    throw new Error("AuditEvent requires actor with userId and roleCode");
  }

  const occurredAtIso =
    params.occurredAt instanceof Date
      ? params.occurredAt.toISOString()
      : new Date(params.occurredAt).toISOString();

  const sanitizedPayload = redactSensitiveData(params.payload) as Record<string, unknown>;

  return Object.freeze({
    id: params.id ?? `audit-${params.correlationId}-${Date.parse(occurredAtIso)}`,
    eventType: params.eventType.trim(),
    aggregateType: params.aggregateType?.trim() || undefined,
    aggregateId: params.aggregateId?.trim() || undefined,
    actorId: params.actor.userId.trim(),
    actorRole: params.actor.roleCode.trim(),
    jurisdictionId: params.actor.jurisdictionId?.trim() || undefined,
    correlationId: params.correlationId.trim(),
    causationId: params.causationId?.trim() || undefined,
    occurredAt: occurredAtIso,
    payload: Object.freeze(sanitizedPayload)
  });
}

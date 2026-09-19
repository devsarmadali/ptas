export type DemandLedgerEntryType =
  "ASSESSMENT_DEMAND" | "REVISION_ADJUSTMENT" | "PENALTY_DEMAND" | "MANUAL_ADJUSTMENT" | "REVERSAL";

export interface DemandUnit {
  readonly id: string;
  readonly taxpayerId: string;
  readonly permanentDemandNo: string;
  readonly createdAt: string; // ISO 8601
}

export interface DemandLedgerEntry {
  readonly id: string;
  readonly demandUnitId: string;
  readonly financialYearId: string;
  readonly entryType: DemandLedgerEntryType;
  readonly amount: number; // Stored as 2-decimal rounded number; CHECK (amount <> 0)
  readonly sourceType: string;
  readonly sourceId: string;
  readonly reversesEntryId?: string | undefined;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly postedBy: string;
  readonly postedAt: string; // ISO 8601
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CreateDemandLedgerEntryInput {
  readonly id?: string | undefined;
  readonly demandUnitId: string;
  readonly financialYearId: string;
  readonly entryType: DemandLedgerEntryType;
  readonly amount: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly reversesEntryId?: string | undefined;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly postedBy: string;
  readonly postedAt?: Date | string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface CreateInitialDemandInput {
  readonly id?: string | undefined;
  readonly demandUnitId: string;
  readonly financialYearId: string;
  readonly assessmentVersionId: string;
  readonly amount: number;
  readonly actorId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly postedAt?: Date | string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface CreateRevisionAdjustmentInput {
  readonly id?: string | undefined;
  readonly demandUnitId: string;
  readonly financialYearId: string;
  readonly revisionVersionId: string;
  readonly previousAmount: number;
  readonly newAmount: number;
  readonly actorId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly postedAt?: Date | string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

function roundToTwoDecimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function createDemandLedgerEntry(input: CreateDemandLedgerEntryInput): DemandLedgerEntry {
  const demandUnitId = input.demandUnitId.trim();
  if (!demandUnitId) {
    throw new Error("demandUnitId is required");
  }

  const financialYearId = input.financialYearId.trim();
  if (!financialYearId) {
    throw new Error("financialYearId is required");
  }

  if (!Number.isFinite(input.amount)) {
    throw new Error("amount must be a finite number");
  }

  const roundedAmount = roundToTwoDecimals(input.amount);
  // Non-negotiable domain rule: Ledger entries cannot have zero amount (CHECK amount <> 0)
  if (roundedAmount === 0) {
    throw new Error("Ledger entry amount cannot be zero");
  }

  const sourceType = input.sourceType.trim();
  if (!sourceType) {
    throw new Error("sourceType is required");
  }

  const sourceId = input.sourceId.trim();
  if (!sourceId) {
    throw new Error("sourceId is required");
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required");
  }

  const correlationId = input.correlationId.trim();
  if (!correlationId) {
    throw new Error("correlationId is required");
  }

  const postedBy = input.postedBy.trim();
  if (!postedBy) {
    throw new Error("postedBy is required");
  }

  const entryId = input.id ?? crypto.randomUUID();

  if (input.reversesEntryId && input.reversesEntryId === entryId) {
    throw new Error("Ledger entry cannot reverse itself (reversesEntryId <> id)");
  }

  const postedAt = input.postedAt
    ? typeof input.postedAt === "string"
      ? input.postedAt
      : input.postedAt.toISOString()
    : new Date().toISOString();

  return Object.freeze({
    id: entryId,
    demandUnitId,
    financialYearId,
    entryType: input.entryType,
    amount: roundedAmount,
    sourceType,
    sourceId,
    reversesEntryId: input.reversesEntryId ?? undefined,
    idempotencyKey,
    correlationId,
    postedBy,
    postedAt,
    metadata: Object.freeze({ ...(input.metadata ?? {}) })
  });
}

export function createInitialDemandEntry(input: CreateInitialDemandInput): DemandLedgerEntry {
  if (input.amount <= 0) {
    throw new Error("Initial assessment demand amount must be greater than zero");
  }

  return createDemandLedgerEntry({
    id: input.id,
    demandUnitId: input.demandUnitId,
    financialYearId: input.financialYearId,
    entryType: "ASSESSMENT_DEMAND",
    amount: input.amount,
    sourceType: "ASSESSMENT",
    sourceId: input.assessmentVersionId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    postedBy: input.actorId,
    postedAt: input.postedAt,
    metadata: {
      assessmentVersionId: input.assessmentVersionId,
      ...input.metadata
    }
  });
}

export function createRevisionAdjustmentEntry(
  input: CreateRevisionAdjustmentInput
): DemandLedgerEntry {
  const previousRounded = roundToTwoDecimals(input.previousAmount);
  const newRounded = roundToTwoDecimals(input.newAmount);
  const delta = roundToTwoDecimals(newRounded - previousRounded);

  if (delta === 0) {
    throw new Error(
      `Revision adjustment delta is zero (${previousRounded} -> ${newRounded}); no financial ledger adjustment required`
    );
  }

  return createDemandLedgerEntry({
    id: input.id,
    demandUnitId: input.demandUnitId,
    financialYearId: input.financialYearId,
    entryType: "REVISION_ADJUSTMENT",
    amount: delta,
    sourceType: "ASSESSMENT",
    sourceId: input.revisionVersionId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    postedBy: input.actorId,
    postedAt: input.postedAt,
    metadata: {
      revisionVersionId: input.revisionVersionId,
      previousAmount: previousRounded,
      newAmount: newRounded,
      delta,
      ...input.metadata
    }
  });
}

export function createReversalEntry(
  originalEntry: DemandLedgerEntry,
  reason: string,
  actorId: string,
  correlationId: string,
  idempotencyKey: string,
  postedAt?: Date | string
): DemandLedgerEntry {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("Reversal reason is required");
  }

  const oppositeAmount = roundToTwoDecimals(-originalEntry.amount);

  return createDemandLedgerEntry({
    demandUnitId: originalEntry.demandUnitId,
    financialYearId: originalEntry.financialYearId,
    entryType: "REVERSAL",
    amount: oppositeAmount,
    sourceType: originalEntry.sourceType,
    sourceId: originalEntry.sourceId,
    reversesEntryId: originalEntry.id,
    idempotencyKey,
    correlationId,
    postedBy: actorId,
    postedAt,
    metadata: {
      reversalReason: trimmedReason,
      reversedEntryId: originalEntry.id,
      reversedEntryType: originalEntry.entryType,
      reversedAmount: originalEntry.amount
    }
  });
}

export function computeLedgerBalance(
  entries: readonly DemandLedgerEntry[],
  financialYearId?: string
): number {
  const filtered = financialYearId
    ? entries.filter((e) => e.financialYearId === financialYearId)
    : entries;

  const total = filtered.reduce((acc, entry) => acc + entry.amount, 0);
  return roundToTwoDecimals(total);
}

export function assertLedgerEntryImmutable(): never {
  throw new Error(
    "demand_ledger is append-only; updates and deletes are prohibited by statutory ledger rules"
  );
}

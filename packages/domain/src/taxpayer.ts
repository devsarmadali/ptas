import type { AuditActor } from "./audit.js";

export type TaxpayerStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "DUPLICATE_MERGED" | "ARCHIVED";

export type IdentifierType =
  "CNIC" | "NTN" | "PASSPORT" | "PRA_PNTN" | "LEGACY_ASSESSEE_CODE" | "REGISTRATION_NO";

export interface TaxpayerIdentifier {
  readonly identifierType: IdentifierType;
  readonly normalizedValue: string;
  readonly maskedValue: string;
  readonly validFrom: string; // YYYY-MM-DD
  readonly validTo?: string | undefined; // YYYY-MM-DD
}

export interface Taxpayer {
  readonly id: string;
  readonly permanentDemandNo?: string | undefined;
  readonly displayName: string;
  readonly status: TaxpayerStatus;
  readonly currentCircleId: string;
  readonly identifiers: readonly TaxpayerIdentifier[];
  readonly createdAt: string; // ISO 8601
  readonly createdBy: string;
  readonly updatedAt: string; // ISO 8601
  readonly rowVersion: number;
}

export interface CreateTaxpayerInput {
  readonly id?: string | undefined;
  readonly permanentDemandNo?: string | undefined;
  readonly displayName: string;
  readonly currentCircleId: string;
  readonly status?: TaxpayerStatus | undefined;
  readonly identifiers?:
    | readonly {
        readonly identifierType: IdentifierType;
        readonly value: string;
        readonly validFrom?: string | undefined;
        readonly validTo?: string | undefined;
      }[]
    | undefined;
}

export function normalizeIdentifier(type: IdentifierType, rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error(`Identifier value for type ${type} cannot be empty`);
  }

  switch (type) {
    case "CNIC": {
      // 13 numeric digits
      const digitsOnly = trimmed.replace(/\D/g, "");
      if (digitsOnly.length !== 13) {
        throw new Error(`CNIC must contain exactly 13 digits, got ${digitsOnly.length}`);
      }
      return digitsOnly;
    }
    case "NTN": {
      // Typically 7 or 8 digits
      const digitsOnly = trimmed.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 8) {
        throw new Error(`NTN must contain 7 or 8 digits, got ${digitsOnly.length}`);
      }
      return digitsOnly;
    }
    case "PASSPORT":
    case "PRA_PNTN":
    case "LEGACY_ASSESSEE_CODE":
    case "REGISTRATION_NO": {
      return trimmed.toUpperCase().replace(/\s+/g, " ");
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported identifier type: ${_exhaustive}`);
    }
  }
}

export function maskIdentifier(type: IdentifierType, normalizedValue: string): string {
  switch (type) {
    case "CNIC": {
      // Format: 35201*******1 (first 5, 7 asterisks, last 1)
      if (normalizedValue.length === 13) {
        const p1 = normalizedValue.slice(0, 5);
        const p3 = normalizedValue.slice(12);
        return `${p1}*******${p3}`;
      }
      return normalizedValue;
    }
    case "NTN": {
      // Format: 1234***-8
      if (normalizedValue.length >= 7) {
        const p1 = normalizedValue.slice(0, 4);
        const pLast = normalizedValue.slice(-1);
        const starCount = normalizedValue.length - 5;
        return `${p1}${"*".repeat(starCount)}-${pLast}`;
      }
      return normalizedValue;
    }
    case "PASSPORT":
    case "PRA_PNTN":
    case "LEGACY_ASSESSEE_CODE":
    case "REGISTRATION_NO": {
      if (normalizedValue.length <= 4) {
        return "*".repeat(normalizedValue.length);
      }
      const first = normalizedValue.slice(0, 2);
      const last = normalizedValue.slice(-2);
      const middleStars = "*".repeat(Math.max(2, normalizedValue.length - 4));
      return `${first}${middleStars}${last}`;
    }
    default: {
      return "*".repeat(normalizedValue.length);
    }
  }
}

export function validateIdentifier(
  type: IdentifierType,
  rawValue: string
): { valid: boolean; error?: string } {
  try {
    normalizeIdentifier(type, rawValue);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export function createTaxpayer(
  input: CreateTaxpayerInput,
  actor: AuditActor,
  asOf: Date | string = new Date()
): Taxpayer {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("Taxpayer displayName cannot be empty");
  }
  if (displayName.length > 250) {
    throw new Error("Taxpayer displayName exceeds maximum length of 250 characters");
  }

  const currentCircleId = input.currentCircleId.trim();
  if (!currentCircleId) {
    throw new Error("Taxpayer currentCircleId is required");
  }

  const timestamp = typeof asOf === "string" ? asOf : asOf.toISOString();
  const dateOnly = timestamp.slice(0, 10);

  const identifiers: TaxpayerIdentifier[] = [];
  if (input.identifiers && input.identifiers.length > 0) {
    for (const idDef of input.identifiers) {
      const normalizedValue = normalizeIdentifier(idDef.identifierType, idDef.value);
      const maskedValue = maskIdentifier(idDef.identifierType, normalizedValue);
      identifiers.push(
        Object.freeze({
          identifierType: idDef.identifierType,
          normalizedValue,
          maskedValue,
          validFrom: idDef.validFrom ?? dateOnly,
          validTo: idDef.validTo
        })
      );
    }
  }

  const taxpayer: Taxpayer = {
    id: input.id ?? crypto.randomUUID(),
    permanentDemandNo: input.permanentDemandNo,
    displayName,
    status: input.status ?? "DRAFT",
    currentCircleId,
    identifiers: Object.freeze(identifiers),
    createdAt: timestamp,
    createdBy: actor.userId,
    updatedAt: timestamp,
    rowVersion: 1
  };

  return Object.freeze(taxpayer);
}

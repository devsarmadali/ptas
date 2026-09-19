import type { AuditActor } from "./audit.js";
import type { Jurisdiction } from "./jurisdiction.js";
import { isDescendantOrSelf } from "./jurisdiction.js";
import type { IdentifierType, Taxpayer, TaxpayerStatus } from "./taxpayer.js";

export interface MaskedTaxpayerIdentifier {
  readonly identifierType: IdentifierType;
  readonly maskedValue: string;
  readonly validFrom: string;
  readonly validTo?: string | undefined;
}

export interface TaxpayerSearchResult {
  readonly id: string;
  readonly permanentDemandNo?: string | undefined;
  readonly displayName: string;
  readonly status: TaxpayerStatus;
  readonly currentCircleId: string;
  readonly identifiers: readonly MaskedTaxpayerIdentifier[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaxpayerSearchQuery {
  readonly query?: string | undefined;
  readonly currentCircleId?: string | undefined;
  readonly status?: TaxpayerStatus | undefined;
  readonly actor: AuditActor;
  readonly jurisdictions: readonly Jurisdiction[];
}

export function toSearchResult(taxpayer: Taxpayer): TaxpayerSearchResult {
  return Object.freeze({
    id: taxpayer.id,
    permanentDemandNo: taxpayer.permanentDemandNo,
    displayName: taxpayer.displayName,
    status: taxpayer.status,
    currentCircleId: taxpayer.currentCircleId,
    identifiers: Object.freeze(
      taxpayer.identifiers.map((id) =>
        Object.freeze({
          identifierType: id.identifierType,
          maskedValue: id.maskedValue,
          validFrom: id.validFrom,
          validTo: id.validTo
        })
      )
    ),
    createdAt: taxpayer.createdAt,
    updatedAt: taxpayer.updatedAt
  });
}

/**
 * Filters taxpayers based on server-side jurisdiction authorization and optional query terms.
 * Enforces BR-011: Access is strictly limited by both role and jurisdiction.
 * Returns results with masked identifiers only.
 */
export function filterTaxpayersByJurisdiction(
  taxpayers: readonly Taxpayer[],
  query: TaxpayerSearchQuery
): readonly TaxpayerSearchResult[] {
  const { actor, jurisdictions } = query;

  // Actor must have a bound jurisdiction to query taxpayers
  if (!actor.jurisdictionId) {
    return Object.freeze([]);
  }

  // If a specific circle was requested, verify that circle is within actor's jurisdiction scope
  if (query.currentCircleId) {
    const isAuthorized = isDescendantOrSelf(
      query.currentCircleId,
      actor.jurisdictionId,
      jurisdictions
    );
    if (!isAuthorized) {
      return Object.freeze([]);
    }
  }

  const queryTerm = query.query?.trim().toLowerCase();

  const results: TaxpayerSearchResult[] = [];

  for (const tp of taxpayers) {
    // 1. Verify jurisdiction access: circle must be a descendant of actor's jurisdiction
    const hasJurisdictionAccess = isDescendantOrSelf(
      tp.currentCircleId,
      actor.jurisdictionId,
      jurisdictions
    );
    if (!hasJurisdictionAccess) {
      continue;
    }

    // 2. Specific circle filter if requested
    if (query.currentCircleId && tp.currentCircleId !== query.currentCircleId) {
      continue;
    }

    // 3. Status filter if requested
    if (query.status && tp.status !== query.status) {
      continue;
    }

    // 4. Term matching (name or identifier)
    if (queryTerm) {
      const nameMatches = tp.displayName.toLowerCase().includes(queryTerm);
      const identifierMatches = tp.identifiers.some(
        (id) =>
          id.normalizedValue.toLowerCase().includes(queryTerm) ||
          id.maskedValue.toLowerCase().includes(queryTerm)
      );

      if (!nameMatches && !identifierMatches) {
        continue;
      }
    }

    results.push(toSearchResult(tp));
  }

  return Object.freeze(results);
}

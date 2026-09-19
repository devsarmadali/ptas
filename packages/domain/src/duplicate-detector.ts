import type { IdentifierType, Taxpayer } from "./taxpayer.js";
import { maskIdentifier, normalizeIdentifier } from "./taxpayer.js";

export type DuplicateConfidence = "EXACT" | "HIGH" | "MEDIUM";

export interface DuplicateMatch {
  readonly existingTaxpayerId: string;
  readonly existingDisplayName: string;
  readonly matchReason: string;
  readonly confidence: DuplicateConfidence;
  readonly matchedFields: readonly string[];
}

export interface CandidateTaxpayerInput {
  readonly id?: string | undefined;
  readonly displayName: string;
  readonly currentCircleId: string;
  readonly identifiers?:
    | readonly {
        readonly identifierType: IdentifierType;
        readonly value: string;
      }[]
    | undefined;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Calculates simple token overlap similarity (Jaccard on words)
 */
function tokenSimilarity(s1: string, s2: string): number {
  const tokens1 = new Set(s1.split(" ").filter((t) => t.length > 1));
  const tokens2 = new Set(s2.split(" ").filter((t) => t.length > 1));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  const jaccard = intersection / union;
  const overlap = intersection / Math.min(tokens1.size, tokens2.size);

  return Math.max(jaccard, overlap * 0.85);
}

/**
 * Surfaces duplicate candidates for an incoming or existing taxpayer candidate.
 * Never silently merges records; returns all surfaced matches with explicit confidence and reasons.
 */
export function findDuplicateCandidates(
  candidate: CandidateTaxpayerInput,
  existingTaxpayers: readonly Taxpayer[]
): readonly DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const normCandidateName = normalizeName(candidate.displayName);

  // Normalize candidate identifiers for lookup
  const candidateNormalizedIds = (candidate.identifiers ?? []).map((id) => {
    let norm: string;
    try {
      norm = normalizeIdentifier(id.identifierType, id.value);
    } catch {
      // If normalization fails, use trimmed value
      norm = id.value.trim();
    }
    return {
      type: id.identifierType,
      normalized: norm,
      masked: maskIdentifier(id.identifierType, norm)
    };
  });

  for (const existing of existingTaxpayers) {
    // Skip comparing against self if candidate already has an id
    if (candidate.id && existing.id === candidate.id) {
      continue;
    }

    // 1. Check exact identifier matches (EXACT confidence)
    let identifierMatched = false;
    for (const cId of candidateNormalizedIds) {
      const matchInExisting = existing.identifiers.find(
        (eId) => eId.identifierType === cId.type && eId.normalizedValue === cId.normalized
      );
      if (matchInExisting) {
        matches.push(
          Object.freeze({
            existingTaxpayerId: existing.id,
            existingDisplayName: existing.displayName,
            matchReason: `Exact identifier match on ${cId.type} (${cId.masked})`,
            confidence: "EXACT",
            matchedFields: Object.freeze([cId.type])
          })
        );
        identifierMatched = true;
        break; // One exact identifier match is sufficient for this existing record
      }
    }

    if (identifierMatched) {
      continue;
    }

    const normExistingName = normalizeName(existing.displayName);
    const sameCircle = candidate.currentCircleId === existing.currentCircleId;

    // 2. Exact name in the same circle (HIGH confidence)
    if (normCandidateName && normCandidateName === normExistingName && sameCircle) {
      matches.push(
        Object.freeze({
          existingTaxpayerId: existing.id,
          existingDisplayName: existing.displayName,
          matchReason: `Identical taxpayer name in the same circle (${existing.currentCircleId})`,
          confidence: "HIGH",
          matchedFields: Object.freeze(["displayName", "currentCircleId"])
        })
      );
      continue;
    }

    // 3. Exact name in a different circle (MEDIUM confidence)
    if (normCandidateName && normCandidateName === normExistingName && !sameCircle) {
      matches.push(
        Object.freeze({
          existingTaxpayerId: existing.id,
          existingDisplayName: existing.displayName,
          matchReason: `Identical taxpayer name registered in another circle (${existing.currentCircleId})`,
          confidence: "MEDIUM",
          matchedFields: Object.freeze(["displayName"])
        })
      );
      continue;
    }

    // 4. High name token similarity in the same circle (MEDIUM confidence)
    if (sameCircle && normCandidateName && normExistingName) {
      const similarity = tokenSimilarity(normCandidateName, normExistingName);
      if (similarity >= 0.75) {
        matches.push(
          Object.freeze({
            existingTaxpayerId: existing.id,
            existingDisplayName: existing.displayName,
            matchReason: `High name similarity (${Math.round(similarity * 100)}%) in the same circle`,
            confidence: "MEDIUM",
            matchedFields: Object.freeze(["displayName", "currentCircleId"])
          })
        );
      }
    }
  }

  return Object.freeze(matches);
}

export function hasExactDuplicate(candidates: readonly DuplicateMatch[]): boolean {
  return candidates.some((c) => c.confidence === "EXACT");
}

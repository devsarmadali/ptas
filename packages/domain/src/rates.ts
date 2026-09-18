export type CandidateRate = Readonly<{
  categoryVersionId: string;
  amount: number;
}>;

export function selectHighestApprovedRate(candidates: readonly CandidateRate[]): CandidateRate {
  if (candidates.length === 0) {
    throw new Error("At least one approved candidate rate is required");
  }

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.amount) || candidate.amount < 0) {
      throw new Error("Candidate rate must be a finite non-negative amount");
    }
  }

  return candidates.reduce((highest, current) =>
    current.amount > highest.amount ? current : highest
  );
}

export function assertPenaltyWithinCeiling(penalty: number, taxAmount: number): void {
  if (![penalty, taxAmount].every(Number.isFinite) || penalty < 0 || taxAmount < 0) {
    throw new Error("Amounts must be finite and non-negative");
  }
  if (penalty > taxAmount) {
    throw new Error("Penalty exceeds the configured legal ceiling");
  }
}

// Derived-stat registry. Every rate/efficiency metric the stats stage computes
// lives here, so the same formula is defined once and never drifts between
// positions. Each metric documents its formula, denominator rule, minimum
// sample, divide-by-zero behaviour, and rounding policy.
//
// Golden rule: a metric returns `null` (explicit "not computable"), never
// Infinity or NaN, when the denominator is below its minimum sample. Callers
// treat null as an engine-defined unknown — they never coerce it to 0.

import type { WindowAggregate } from '@/pipeline/stats/types';

// Full internal precision. Rounding happens only at the engine boundary if a
// spec mandates it; the stats stage stores/derives at full precision.
export function safeDiv(
  numerator: number,
  denominator: number,
  minDenominator: number,
): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator < minDenominator || denominator <= 0) return null;
  return numerator / denominator;
}

// ---- receiving ----
export function catchRate(a: WindowAggregate, minTargets = 1): number | null {
  return safeDiv(a.receptions, a.targets, minTargets); // receptions ÷ targets
}
export function yardsPerTarget(a: WindowAggregate, minTargets = 1): number | null {
  return safeDiv(a.receivingYards, a.targets, minTargets);
}
export function yardsPerReception(a: WindowAggregate, minReceptions = 1): number | null {
  return safeDiv(a.receivingYards, a.receptions, minReceptions);
}
export function yacPerReception(a: WindowAggregate, minReceptions = 1): number | null {
  if (a.receivingYardsAfterCatch === null) return null; // provider did not supply
  return safeDiv(a.receivingYardsAfterCatch, a.receptions, minReceptions);
}
export function averageDepthOfTarget(a: WindowAggregate, minTargets = 1): number | null {
  if (a.receivingAirYards === null) return null; // air yards ÷ targets
  return safeDiv(a.receivingAirYards, a.targets, minTargets);
}
// Window target share = summed player targets ÷ summed reconstructed team
// targets. teamTargetsRecon is Σ(targets ÷ weekly share) over weeks with a
// positive share; null when no week supplied a share.
export function targetShare(a: WindowAggregate, minTeamTargets = 1): number | null {
  if (a.teamTargetsRecon === null) return null;
  return safeDiv(a.targets, a.teamTargetsRecon, minTeamTargets);
}

// ---- rushing ----
export function yardsPerCarry(a: WindowAggregate, minCarries = 1): number | null {
  return safeDiv(a.rushingYards, a.carries, minCarries);
}

// ---- passing (QB) ----
export function completionPct(a: WindowAggregate, minAttempts = 1): number | null {
  return safeDiv(a.completions, a.attempts, minAttempts);
}
export function yardsPerAttempt(a: WindowAggregate, minAttempts = 1): number | null {
  return safeDiv(a.passingYards, a.attempts, minAttempts);
}
// Classic AY/A = (yards + 20·TD − 45·INT) ÷ attempts (Pro-Football-Reference).
export function adjustedYardsPerAttempt(a: WindowAggregate, minAttempts = 10): number | null {
  return safeDiv(a.passingYards + 20 * a.passingTds - 45 * a.interceptions, a.attempts, minAttempts);
}
export function interceptionRate(a: WindowAggregate, minAttempts = 10): number | null {
  return safeDiv(a.interceptions, a.attempts, minAttempts);
}
export function rushAttemptsPerGame(a: WindowAggregate, minGames = 1): number | null {
  return safeDiv(a.carries, a.games, minGames);
}

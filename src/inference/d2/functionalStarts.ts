// D2 — functional QB starts (REGISTRY §9). Pure. Official starts (DIRECT/DERIVED)
// stay distinct from inferred functional starts (MODEL_ESTIMATE); only official
// provenance satisfies `starts_official` (the ESTABLISHED_STARTER guardrail lives in
// the QB role ladder, §3.4). Regular-season only; future-dated plays excluded.

import { D2 } from '@/inference/registry/family';
import { roundHalfAwayFromZero } from '@/inference/util/numeric';
import { isOfficialProvenance, LIMITATION_CODES, type LimitationCode } from '@/inference/types';
import type { SourceOrInferenceProvenance } from '@/inference/types';

/** One QB game row (regular season, per team). */
export interface QbGameRow {
  readonly gameId: string;
  readonly kickoff: string;
  readonly seasonType: 'REG' | 'POST';
  readonly season: number;
  readonly team: string;
  readonly qbSnapShare: number | null;
  readonly passAttempts: number | null;
}

export interface OfficialStarts {
  readonly careerStarts: number;
  readonly recentStarts: number;
  readonly recentGames: number;
  /** DIRECT (raw feed fact) or DERIVED (computed from official starter flags). */
  readonly provenance: 'DIRECT' | 'DERIVED';
}

export interface FunctionalStartsInput {
  readonly asOf: string;
  /** Rung 1 — official starts, if a verified source is present. */
  readonly official?: OfficialStarts;
  /** Rung 2 — per-game rows for inference (all seasons/teams; REG + POST). */
  readonly games?: readonly QbGameRow[];
  /** gameIds constituting the last-17 team games (the recent window, §9.1). */
  readonly last17TeamGameIds?: readonly string[];
}

export interface FunctionalStartsResult {
  readonly careerStarts: number | null;
  readonly recentStarts: number | null;
  readonly recentStartRate: number | null;
  readonly recentGames: number;
  readonly provenance: SourceOrInferenceProvenance | null;
  /** true iff provenance ∈ {DIRECT, DERIVED} — satisfies starts_official (§20.D2). */
  readonly startsOfficial: boolean;
  readonly careerStatus: 'AVAILABLE' | 'UNAVAILABLE';
  readonly recentStatus: 'AVAILABLE' | 'NOT_APPLICABLE' | 'UNAVAILABLE';
  readonly limitations: readonly LimitationCode[];
  readonly startInferencePenalty: number; // §9.2 — 120 for inferred, else 0
}

/** §9.1 functional_start = majority snaps AND ≥ T_START attempts. */
export function isFunctionalStart(row: QbGameRow): boolean {
  return row.qbSnapShare !== null && row.qbSnapShare >= D2.snapMajority && row.passAttempts !== null && row.passAttempts >= D2.tStart;
}

export function computeFunctionalStarts(input: FunctionalStartsInput): FunctionalStartsResult {
  // Rung 1 — official starts.
  if (input.official) {
    const o = input.official;
    const rate = o.recentGames > 0 ? roundHalfAwayFromZero(o.recentStarts / o.recentGames, 4) : null;
    return {
      careerStarts: o.careerStarts,
      recentStarts: o.recentGames > 0 ? o.recentStarts : null,
      recentStartRate: rate,
      recentGames: o.recentGames,
      provenance: o.provenance,
      startsOfficial: isOfficialProvenance(o.provenance),
      careerStatus: 'AVAILABLE',
      recentStatus: o.recentGames > 0 ? 'AVAILABLE' : 'NOT_APPLICABLE',
      limitations: [],
      startInferencePenalty: 0,
    };
  }

  // Rung 2 — inferred functional starts (regular season, ≤ asOf).
  const asOfMs = Date.parse(input.asOf);
  const games = (input.games ?? []).filter(
    (g) => g.seasonType === 'REG' && Date.parse(g.kickoff) < asOfMs,
  );
  if (games.length === 0) {
    return {
      careerStarts: null,
      recentStarts: null,
      recentStartRate: null,
      recentGames: 0,
      provenance: null,
      startsOfficial: false,
      careerStatus: 'UNAVAILABLE',
      recentStatus: 'UNAVAILABLE',
      limitations: [],
      startInferencePenalty: 0,
    };
  }

  const careerStarts = games.filter(isFunctionalStart).length;
  const recentSet = new Set(input.last17TeamGameIds ?? []);
  const recentRows = games.filter((g) => recentSet.has(g.gameId));
  const recentGames = recentRows.length;
  const recentStartsEst = recentRows.filter(isFunctionalStart).length;
  const recentStartRate = recentGames > 0 ? roundHalfAwayFromZero(recentStartsEst / recentGames, 4) : null;

  return {
    careerStarts,
    recentStarts: recentGames > 0 ? recentStartsEst : null,
    recentStartRate,
    recentGames,
    provenance: 'MODEL_ESTIMATE',
    startsOfficial: false,
    careerStatus: 'AVAILABLE',
    recentStatus: recentGames > 0 ? 'AVAILABLE' : 'NOT_APPLICABLE',
    limitations: [LIMITATION_CODES.INFERRED_START_NOT_OFFICIAL],
    startInferencePenalty: D2.startInferencePenalty,
  };
}

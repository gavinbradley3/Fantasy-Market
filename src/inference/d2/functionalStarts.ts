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

/**
 * TWO RECENT WINDOWS, DELIBERATELY DISTINCT.
 *
 * `recent_games` / `recent_starts` are ENGINE INPUTS. The QB engine bounds `recent_games`
 * to `[0,8]` and requires `recent_starts ≤ recent_games` (`src/qb-model/validation.ts`), so
 * they are counted over the ENGINE window of 8 games. The registry's own convention is to
 * adopt an engine-defined value verbatim and tag it `ENGINE_PRECEDENT` — §7.3 does exactly
 * that for `probability_active`, citing QB engine §26.5.8.
 *
 * `recent_start_rate` is NOT an engine input. It feeds §6.2 `starter_stability` inside the
 * environment model, and REGISTRY §9.2 fixes its window at 17 team games (one season,
 * `MVP_HEURISTIC`). That window is unchanged.
 *
 * Collapsing the two into one window would silently redefine §9.2's rate; widening the
 * engine window past 8 would make the engine reject the input outright. They are different
 * questions with different consumers, so they are counted separately and named separately.
 * See REGISTRY §9.2 "Window separation".
 */
export interface OfficialStarts {
  readonly careerStarts: number;
  /** Engine window (8 games) — the value handed to the engine as `recent_starts`. */
  readonly recentStarts: number;
  /** Engine window (8 games) — the value handed to the engine as `recent_games`. */
  readonly recentGames: number;
  /** §9.2 role window (17 team games) — starts, for `recent_start_rate` only. */
  readonly roleWindowStarts: number;
  /** §9.2 role window (17 team games) — player games, the rate's denominator. */
  readonly roleWindowGames: number;
  /** DIRECT (raw feed fact) or DERIVED (computed from official starter flags). */
  readonly provenance: 'DIRECT' | 'DERIVED';
}

export interface FunctionalStartsInput {
  readonly asOf: string;
  /** Rung 1 — official starts, if a verified source is present. */
  readonly official?: OfficialStarts;
  /** Rung 2 — per-game rows for inference (all seasons/teams; REG + POST). */
  readonly games?: readonly QbGameRow[];
  /** gameIds constituting the last-17 team games — the §9.2 rate window. */
  readonly last17TeamGameIds?: readonly string[];
  /** gameIds constituting the last-8 team games — the engine-input window. */
  readonly engineWindowTeamGameIds?: readonly string[];
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
    // §9.2 — the rate is computed over the 17-game role window, never the engine window.
    const rate = o.roleWindowGames > 0 ? roundHalfAwayFromZero(o.roleWindowStarts / o.roleWindowGames, 4) : null;
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

  // §9.2 role window (17 team games) — the rate's window, and only the rate's.
  const roleSet = new Set(input.last17TeamGameIds ?? []);
  const roleRows = games.filter((g) => roleSet.has(g.gameId));
  const roleWindowGames = roleRows.length;
  const roleWindowStarts = roleRows.filter(isFunctionalStart).length;
  const recentStartRate = roleWindowGames > 0 ? roundHalfAwayFromZero(roleWindowStarts / roleWindowGames, 4) : null;

  // Engine window (8 games) — what the engine is handed. Falls back to the role window only
  // when no engine window was supplied, preserving the behaviour of callers that pass one set.
  const engineSet = new Set(input.engineWindowTeamGameIds ?? input.last17TeamGameIds ?? []);
  const engineRows = games.filter((g) => engineSet.has(g.gameId));
  const recentGames = engineRows.length;
  const recentStartsEst = engineRows.filter(isFunctionalStart).length;

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

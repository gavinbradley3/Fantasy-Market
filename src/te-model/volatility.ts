/**
 * Volatility score and dependence ratios (Section 26.12). Uses current active-game
 * values, never Pactive-weighted Weekly EFO. Volatility never alters projections.
 */

import { clamp } from "./percentiles.js";
import type {
  TEActiveGameProjection,
  TECanonicalValues,
  TEDerivedValues,
  TEMVPInput,
  TEScoring,
  TEShrunkValues,
} from "./types.js";

export interface TEVolatilityResult {
  score: number;
  td_dependence: number;
  explosive_dependence: number;
}

export function computeVolatility(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunk: TEShrunkValues,
  derived: TEDerivedValues,
  currentActiveGame: TEActiveGameProjection,
  scoring: TEScoring
): TEVolatilityResult {
  const touchdownPoints =
    currentActiveGame.expected_receiving_touchdowns * scoring.points_per_receiving_td;

  const tdDependence = clamp(
    touchdownPoints / Math.max(currentActiveGame.active_game_fantasy_points, 1),
    0,
    1
  );

  const explosiveYardageProxy = clamp((shrunk.shrunk_yards_per_reception - 9.0) / 9.0, 0, 1);

  const explosiveDependence = clamp(
    0.6 * explosiveYardageProxy + 0.4 * clamp(shrunk.shrunk_yac_per_reception / 8.0, 0, 1),
    0,
    1
  );

  const priorWeight = 140 / (input.career_routes + 140);

  const rawVolatility =
    16 * (1 - canonical.rp4) +
    10 * derived.blocking_gap +
    16 * canonical.competition_pressure +
    18 * tdDependence +
    10 * explosiveDependence +
    14 * priorWeight +
    (input.injury_status === "QUESTIONABLE" || input.injury_status === "UNKNOWN" ? 10 : 0) +
    (input.role_change === "PROMOTED" ||
    input.role_change === "DEMOTED" ||
    input.role_change === "UNKNOWN"
      ? 10
      : 0) +
    (input.teammate_return_flag ? 8 : 0) +
    (input.another_receiving_te_flag ? 8 : 0) +
    (input.temporary_opportunity_flag ? 8 : 0) +
    (input.new_team_flag ? 6 : 0);

  return {
    score: clamp(rawVolatility, 0, 100),
    td_dependence: tdDependence,
    explosive_dependence: explosiveDependence,
  };
}

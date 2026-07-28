// Accessible-data RB valuation model (rb-accessible-1.0). Pure and deterministic.
//
// WHAT THIS MODEL IS
// A deliberately reduced running-back model built on the only evidence the live pipeline can
// acquire: the weekly box score, point-in-time roster/biographical facts, and team
// opportunity shares reconstructed from the same box scores. It has its own components,
// weights and confidence ceiling. It is NOT the frozen RB engine with defaults substituted —
// running that engine on this input set would silently exercise two dozen fallback paths and
// present the result as a full valuation, which is the failure this tier exists to avoid.
//
// WHAT IT DOES NOT CONSUME
// No route data of any kind. `career_routes` is a full-model-only input; this model does not
// take it, does not proxy it, and does not name anything after it. Where the frozen engine
// used a career route count as the sample-size denominator for its receiving-rate shrinkage,
// this model uses OBSERVED career targets — the semantically correct exposure count for a
// per-target rate, and one the provider actually publishes.
//
// COMPONENTS (0–100 each)
//   RV  Rush volume        carries per game, recent window
//   RCV Receiving volume   targets + receptions per game, recent window
//   EFF Efficiency         yards per carry and yards per touch, shrunk by exposure
//   SC  Scoring            total touchdowns per game, shrunk by exposure
//   RS  Role share         carry share + target share of reconstructed team totals
//   TR  Trajectory         newest season per-game touches vs. prior season
//   AG  Age                RB age curve
//   AV  Availability       point-in-time roster state
//   DUR Durability         share of possible games appeared in

import { clamp } from './numeric';
import {
  ageScore,
  availabilityScore,
  buildConfidence,
  durabilityScore,
  isUnavailable,
  TIER_WIDE_MISSING_INPUTS,
  TIER_WIDE_PENALTIES,
  trajectoryScore,
  type ConfidencePenaltyCode,
} from './common';
import { rate, scaleFrom, score100, shrink, weightedMean, type Anchor } from './scale';
import type { AccessibleInput, AccessibleResult } from './types';

export const RB_ACCESSIBLE_VERSION = 'rb-accessible-1.0';

/**
 * Carries per game. 16+ is an unambiguous lead back; 12 is a clear primary in a modern
 * rotation; 8 is a committee split; under 4 is a situational/emergency back.
 */
const RB_CARRIES_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 2, score: 12 },
  { at: 4, score: 24 },
  { at: 8, score: 45 },
  { at: 12, score: 63 },
  { at: 16, score: 80 },
  { at: 20, score: 93 },
  { at: 24, score: 100 },
];

/**
 * Targets per game. Receiving work is the most stable and most transferable part of an RB's
 * value: it survives a change of offence better than carries and is what separates a
 * three-down back from a two-down one. 5+ is a genuine passing-game weapon.
 */
const RB_TARGETS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.5, score: 12 },
  { at: 1, score: 24 },
  { at: 2, score: 44 },
  { at: 3.5, score: 66 },
  { at: 5, score: 84 },
  { at: 7, score: 100 },
];

/**
 * Receiving yards per game. Paired with targets per game so receiving value reflects both the
 * opportunity and what was actually produced with it. Replaces an earlier formulation that
 * re-scaled receptions onto the TARGETS anchor, which double-counted receiving volume and
 * pushed pass-catching backups above bell cows in the live population.
 */
const RB_RECEIVING_YARDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 4, score: 14 },
  { at: 9, score: 30 },
  { at: 16, score: 50 },
  { at: 25, score: 72 },
  { at: 34, score: 88 },
  { at: 45, score: 100 },
];

/**
 * Yards per carry, after shrinkage. League-average is ~4.3; the scale is deliberately narrow
 * because YPC is a noisy, offensive-line-dependent statistic that should not dominate a
 * valuation. A full point of YPC moves the component about 35 points, no more.
 */
const RB_YPC: readonly Anchor[] = [
  { at: 3.2, score: 14 },
  { at: 3.8, score: 33 },
  { at: 4.3, score: 50 },
  { at: 4.8, score: 67 },
  { at: 5.4, score: 84 },
  { at: 6.2, score: 96 },
];

/** Yards per touch, which folds receiving efficiency in alongside rushing. */
const RB_YARDS_PER_TOUCH: readonly Anchor[] = [
  { at: 3.4, score: 14 },
  { at: 4.0, score: 32 },
  { at: 4.6, score: 50 },
  { at: 5.3, score: 68 },
  { at: 6.2, score: 85 },
  { at: 7.2, score: 96 },
];

/** Total touchdowns per game, after shrinkage. 0.5 TD/game is elite goal-line usage. */
const RB_TDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.1, score: 22 },
  { at: 0.25, score: 45 },
  { at: 0.4, score: 66 },
  { at: 0.55, score: 84 },
  { at: 0.8, score: 100 },
];

/** Carry share of reconstructed team carries. 0.5+ is a true bell cow. */
const RB_CARRY_SHARE: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.08, score: 14 },
  { at: 0.18, score: 34 },
  { at: 0.3, score: 56 },
  { at: 0.42, score: 76 },
  { at: 0.55, score: 92 },
  { at: 0.65, score: 100 },
];

/** Target share of reconstructed team targets. RB target shares are structurally small. */
const RB_TARGET_SHARE: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.03, score: 18 },
  { at: 0.06, score: 40 },
  { at: 0.1, score: 62 },
  { at: 0.15, score: 84 },
  { at: 0.2, score: 100 },
];

// League priors for shrinkage, with the exposure count at which observation and prior weigh
// equally. Carries are a high-volume, low-information-per-event statistic, so YPC needs a
// large pseudo-count before an outlier is believed; touchdown rate needs a very large one
// because scoring is the noisiest thing a back does.
const YPC_PRIOR = 4.3;
const YPC_PSEUDO_CARRIES = 130;
const YPT_PRIOR = 4.7;
const YPT_PSEUDO_TOUCHES = 120;
const TD_PER_GAME_PRIOR = 0.18;
const TD_PSEUDO_GAMES = 22;

/**
 * Horizon weights. Weekly leans on current volume, role and availability; dynasty leans on
 * age, receiving profile and trajectory, because those are what survive three seasons. Each
 * column sums to 1.0 over the components it uses; a component that is null is dropped and
 * the remaining weights renormalize (see `weightedMean`).
 */
const RB_HORIZON_WEIGHTS = {
  weekly: { RV: 0.26, RCV: 0.14, EFF: 0.08, SC: 0.1, RS: 0.16, TR: 0.03, AG: 0.03, AV: 0.16, DUR: 0.04 },
  ros: { RV: 0.24, RCV: 0.15, EFF: 0.09, SC: 0.09, RS: 0.15, TR: 0.05, AG: 0.06, AV: 0.11, DUR: 0.06 },
  oneYear: { RV: 0.21, RCV: 0.16, EFF: 0.09, SC: 0.08, RS: 0.15, TR: 0.07, AG: 0.14, AV: 0.04, DUR: 0.06 },
  threeYear: { RV: 0.18, RCV: 0.18, EFF: 0.08, SC: 0.06, RS: 0.15, TR: 0.08, AG: 0.2, AV: 0.01, DUR: 0.06 },
  dynasty: { RV: 0.16, RCV: 0.19, EFF: 0.08, SC: 0.05, RS: 0.14, TR: 0.09, AG: 0.23, AV: 0.0, DUR: 0.06 },
} as const;

/**
 * The headline "overall" position value: a weighted blend across horizons, leaning
 * medium-to-long term for a dynasty product.
 *
 * It is deliberately NOT the dynasty composite alone. Dynasty puts the most weight on age, so
 * using it as the single sort key made age the primary determinant of a player's headline
 * number — a 4-year age gap outranked the difference between a lead back and a backup, and the
 * best weekly back in the live population headlined below a rotational one. Blending horizons
 * keeps long-term value dominant without letting one age-heavy column decide the board.
 */
const OVERALL_BLEND = { ros: 0.15, oneYear: 0.3, threeYear: 0.3, dynasty: 0.25 } as const;

/** Minimum career games before the model will value a back at all. */
export const RB_MIN_CAREER_GAMES = 1;

export function evaluateAccessibleRB(input: AccessibleInput): AccessibleResult {
  const p = input.production;
  if (p.career.games < RB_MIN_CAREER_GAMES) {
    return {
      tier: 'INSUFFICIENT',
      position: 'RB',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_QUALIFYING_GAMES',
      reason: 'No regular-season game record exists for this player at the valuation date.',
    };
  }

  // A back with games but no observed carries AND no observed targets has no opportunity
  // evidence at all — there is nothing to value, and scoring him zero would rank him against
  // players we actually measured.
  const careerCarries = p.career.carries;
  const careerTargets = p.career.targets;
  if ((careerCarries === null || careerCarries === 0) && (careerTargets === null || careerTargets === 0)) {
    return {
      tier: 'INSUFFICIENT',
      position: 'RB',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_OFFENSIVE_OPPORTUNITY',
      reason: 'The player appeared in games but recorded no carries or targets, so there is no usage to value.',
    };
  }

  // --- volume (role window: latest season when it is a full one, else the recent window) ---
  const role$ = p.roleWindow;
  const carriesPerGame = perGameOf(role$.carries, role$.games);
  const targetsPerGame = perGameOf(role$.targets, role$.games);
  const receivingYardsPerGame = perGameOf(role$.receivingYards, role$.games);

  const RV = carriesPerGame === null ? null : score100(scaleFrom(RB_CARRIES_PER_GAME, carriesPerGame));
  // Receiving volume blends the opportunity (targets) with what was produced from it
  // (receiving yards). Targets lead because they are the role signal; yards confirm it.
  const RCV = weightedMean([
    { value: targetsPerGame === null ? null : score100(scaleFrom(RB_TARGETS_PER_GAME, targetsPerGame)), weight: 0.6 },
    {
      value:
        receivingYardsPerGame === null
          ? null
          : score100(scaleFrom(RB_RECEIVING_YARDS_PER_GAME, receivingYardsPerGame)),
      weight: 0.4,
    },
  ]);

  // --- efficiency (career exposure, shrunk) ---
  const ypc = rate(p.career.rushingYards, careerCarries, 20);
  const shrunkYpc = ypc === null ? null : shrink(ypc, careerCarries ?? 0, YPC_PRIOR, YPC_PSEUDO_CARRIES);
  const touches = totalTouches(p.career.carries, p.career.receptions);
  const totalYards = sumOrNull(p.career.rushingYards, p.career.receivingYards);
  const ypt = rate(totalYards, touches, 20);
  const shrunkYpt = ypt === null ? null : shrink(ypt, touches ?? 0, YPT_PRIOR, YPT_PSEUDO_TOUCHES);
  const EFF = weightedMean([
    { value: shrunkYpc === null ? null : score100(scaleFrom(RB_YPC, shrunkYpc)), weight: 0.55 },
    { value: shrunkYpt === null ? null : score100(scaleFrom(RB_YARDS_PER_TOUCH, shrunkYpt)), weight: 0.45 },
  ]);

  // --- scoring ---
  const careerTds = sumOrNull(p.career.rushingTds, p.career.receivingTds);
  const tdPerGame = rate(careerTds, p.career.games, 1);
  const shrunkTd =
    tdPerGame === null ? null : shrink(tdPerGame, p.career.games, TD_PER_GAME_PRIOR, TD_PSEUDO_GAMES);
  const SC = shrunkTd === null ? null : score100(scaleFrom(RB_TDS_PER_GAME, shrunkTd));

  // --- role share ---
  const shares = p.teamShares;
  const RS = weightedMean([
    {
      value:
        shares?.carryShare == null ? null : score100(scaleFrom(RB_CARRY_SHARE, clamp(shares.carryShare, 0, 1))),
      weight: 0.6,
    },
    {
      value:
        shares?.targetShare == null ? null : score100(scaleFrom(RB_TARGET_SHARE, clamp(shares.targetShare, 0, 1))),
      weight: 0.4,
    },
  ]);

  // --- trajectory, age, availability, durability ---
  const TR = trajectoryScore(p.latestSeason, p.priorSeason, (w) => totalTouches(w.carries, w.receptions));
  const AG = ageScore('RB', input.age);
  const AV = score100(availabilityScore(input.availability));
  const DUR = durabilityScore(p);

  const components = compact({ RV, RCV, EFF, SC, RS, TR, AG, AV, DUR });
  const composites = {
    weekly: composite('weekly', components),
    ros: composite('ros', components),
    oneYear: composite('oneYear', components),
    threeYear: composite('threeYear', components),
    dynasty: composite('dynasty', components),
  };

  const role = classifyRole(carriesPerGame, targetsPerGame, shares?.carryShare ?? null);
  const penalties = collectPenalties(input, TR, AG);
  const confidence = buildConfidence(penalties);
  const factors = buildFactors({ input, components, role, carriesPerGame, targetsPerGame, shrunkYpc, shares });

  return {
    tier: 'ACCESSIBLE',
    modelVersion: RB_ACCESSIBLE_VERSION,
    position: 'RB',
    canonicalId: input.canonicalId,
    asOf: input.asOf,
    components,
    composites,
    positionValue: overallValue(composites),
    role,
    confidence,
    explanation: factors.explanation,
    positiveFactors: factors.positive,
    negativeFactors: factors.negative,
    materialMissingInputs: [...TIER_WIDE_MISSING_INPUTS],
    provenance: {
      gamesObserved: p.career.games,
      seasonsObserved: p.seasonsPlayed,
      teamSharesDerived: shares !== null,
      observedFields: [
        'carries',
        'rushing_yards',
        'rushing_touchdowns',
        'targets',
        'receptions',
        'receiving_yards',
        'receiving_touchdowns',
        'games_played',
      ],
      derivedFields: [
        'carries_per_game',
        'targets_per_game',
        'yards_per_carry_shrunk',
        'yards_per_touch_shrunk',
        'touchdowns_per_game_shrunk',
        ...(shares ? ['carry_share_reconstructed', 'target_share_reconstructed'] : []),
        ...(TR !== null ? ['season_over_season_trajectory'] : []),
      ],
      unavailableFields: ['career_routes', 'route_participation', 'snap_share', 'red_zone_usage', 'team_context'],
    },
  };
}

// ---------------------------------------------------------------------------

function perGameOf(total: number | null, games: number): number | null {
  return rate(total, games, 1);
}

/** The documented multi-horizon blend used as the headline position value. */
export function overallValue(composites: {
  readonly ros: number;
  readonly oneYear: number;
  readonly threeYear: number;
  readonly dynasty: number;
}): number {
  return score100(
    composites.ros * OVERALL_BLEND.ros +
      composites.oneYear * OVERALL_BLEND.oneYear +
      composites.threeYear * OVERALL_BLEND.threeYear +
      composites.dynasty * OVERALL_BLEND.dynasty,
  );
}

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** True touches: carries plus RECEPTIONS (a target is an opportunity, not a touch). */
function totalTouches(carries: number | null, receptions: number | null): number | null {
  return sumOrNull(carries, receptions);
}

function compact(scores: Readonly<Record<string, number | null>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) if (v !== null) out[k] = v;
  return out;
}

function composite(horizon: keyof typeof RB_HORIZON_WEIGHTS, components: Readonly<Record<string, number>>): number {
  const weights = RB_HORIZON_WEIGHTS[horizon];
  const parts = Object.entries(weights).map(([code, weight]) => ({
    value: components[code] ?? null,
    weight,
  }));
  return score100(weightedMean(parts) ?? 0);
}

/**
 * Role classification from usage over the role window. Every threshold is a usage statement, so
 * the label is checkable against the same numbers the user can see.
 */
export function classifyRole(
  carriesPerGame: number | null,
  targetsPerGame: number | null,
  carryShare: number | null,
): string {
  const c = carriesPerGame ?? 0;
  const t = targetsPerGame ?? 0;
  if (c >= 15 || (carryShare !== null && carryShare >= 0.45)) {
    return t >= 3 ? 'Three-down lead back' : 'Lead rusher';
  }
  if (c >= 9) return t >= 3 ? 'Primary back in a rotation' : 'Early-down rotational back';
  if (c >= 4) return t >= 2.5 ? 'Receiving-leaning rotational back' : 'Committee back';
  if (t >= 2) return 'Pass-catching specialist';
  if (c > 0 || t > 0) return 'Depth back';
  return 'No measured usage';
}

function collectPenalties(
  input: AccessibleInput,
  trajectory: number | null,
  age: number | null,
): ConfidencePenaltyCode[] {
  const codes: ConfidencePenaltyCode[] = [...TIER_WIDE_PENALTIES];
  const p = input.production;
  if (p.career.games < 4) codes.push('MINIMAL_CAREER_SAMPLE');
  if (p.career.games < 8) codes.push('SPARSE_CAREER_SAMPLE');
  if (trajectory === null) codes.push('NO_TRAJECTORY');
  if (p.teamShares === null) codes.push('NO_TEAM_SHARES');
  if (age === null) codes.push('AGE_UNKNOWN');
  if (input.availability === 'UNKNOWN') codes.push('STATUS_UNATTESTED');
  if (p.recent.games === 0) codes.push('STALE_PRODUCTION');
  return codes;
}

function buildFactors(args: {
  input: AccessibleInput;
  components: Readonly<Record<string, number>>;
  role: string;
  carriesPerGame: number | null;
  targetsPerGame: number | null;
  shrunkYpc: number | null;
  shares: AccessibleInput['production']['teamShares'];
}): { explanation: string; positive: string[]; negative: string[] } {
  const { input, components, role, carriesPerGame, targetsPerGame, shrunkYpc, shares } = args;
  const positive: string[] = [];
  const negative: string[] = [];
  const one = (n: number) => n.toFixed(1);

  if (carriesPerGame !== null && carriesPerGame >= 14) {
    positive.push(`Carries a lead-back workload (${one(carriesPerGame)} per game over ${input.production.roleWindow.games} games).`);
  } else if (carriesPerGame !== null && carriesPerGame < 6) {
    negative.push(`Limited rushing workload (${one(carriesPerGame)} carries per game).`);
  }
  if (targetsPerGame !== null && targetsPerGame >= 3) {
    positive.push(`Meaningful passing-game role (${one(targetsPerGame)} targets per game), which holds value across offences.`);
  } else if (targetsPerGame !== null && targetsPerGame < 1) {
    negative.push('Almost no passing-game involvement, leaving value dependent on carries alone.');
  }
  if (shares?.carryShare != null && shares.carryShare >= 0.4) {
    positive.push(`Commands ${Math.round(shares.carryShare * 100)}% of the team's measured carries.`);
  }
  if (shrunkYpc !== null && shrunkYpc >= 4.7) {
    positive.push(`Efficient on the ground (${shrunkYpc.toFixed(2)} yards per carry after regressing for sample size).`);
  } else if (shrunkYpc !== null && shrunkYpc <= 3.9) {
    negative.push(`Below-average rushing efficiency (${shrunkYpc.toFixed(2)} yards per carry after regression).`);
  }
  if ((components.AG ?? 100) <= 45) {
    negative.push(`Age ${input.age ?? '?'} sits on the steep part of the running-back decline curve.`);
  } else if ((components.AG ?? 0) >= 92 && input.age !== null) {
    positive.push(`Age ${input.age} is inside the running-back production peak.`);
  }
  if (isUnavailable(input.availability)) {
    negative.push('Currently not expected to play, which suppresses the near-term outlook.');
  }
  if ((components.TR ?? 50) >= 70) positive.push('Per-game usage grew against the previous season.');
  else if ((components.TR ?? 50) <= 30) negative.push('Per-game usage fell against the previous season.');
  if (input.production.career.games < 8) {
    negative.push(`Only ${input.production.career.games} career games observed, so every rate is thinly evidenced.`);
  }

  const explanation =
    `${role}. Valued from ${input.production.career.games} observed games across ` +
    `${input.production.seasonsPlayed} season${input.production.seasonsPlayed === 1 ? '' : 's'} using box-score ` +
    'production, reconstructed team shares and age — without route, snap or red-zone data.';

  return { explanation, positive, negative };
}

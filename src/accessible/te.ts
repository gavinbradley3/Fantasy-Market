// Accessible-data TE valuation model (te-accessible-1.0). Pure and deterministic.
//
// Same posture as the RB accessible model: a purpose-built reduced model over the acquirable
// box score, not the frozen TE engine with defaults substituted. The frozen TE engine is
// route-centric by design — `career_routes` gates its TPRR shrinkage, its volatility prior
// weight, its confidence bands and one of its role thresholds — so running it without routes
// would put an unmeasured number at the centre of four different calculations.
//
// This model consumes no route data. Where the frozen engine used career routes as the
// exposure denominator, this model uses OBSERVED career targets: the correct exposure count
// for a per-target rate, and one nflverse publishes.
//
// COMPONENTS (0–100 each)
//   TV  Target volume      targets per game, recent window
//   RP  Receiving output   receiving yards per game, recent window
//   EFF Efficiency         catch rate and yards per reception, shrunk by target exposure
//   SC  Scoring            receiving touchdowns per game, shrunk
//   RS  Role share         target share of reconstructed team targets
//   TR  Trajectory         newest season per-game targets vs. prior season
//   AG  Age                TE age curve (later peak, gentler decline than RB)
//   AV  Availability       point-in-time roster state
//   DUR Durability         share of possible games appeared in

import { clamp } from './numeric';
import {
  ageScore,
  availabilityScore,
  buildConfidence,
  durabilityScore,
  isNotRostered,
  isStaleProduction,
  isUnavailable,
  TIER_WIDE_MISSING_INPUTS,
  TIER_WIDE_PENALTIES,
  trajectoryScore,
  type ConfidencePenaltyCode,
} from './common';
import { rate, scaleFrom, score100, shrink, weightedMean, type Anchor } from './scale';
import type { AccessibleInput, AccessibleResult } from './types';

export const TE_ACCESSIBLE_VERSION = 'te-accessible-1.0';

/**
 * Targets per game. Tight end target volume is structurally lower than wide receiver: 5+ per
 * game is a genuine focal point (the handful of TEs used like a slot receiver), 4 is a clear
 * starter, 2 is a rotational piece, under 1 is a blocking specialist.
 */
const TE_TARGETS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.75, score: 12 },
  { at: 1.5, score: 24 },
  { at: 2.5, score: 42 },
  { at: 4, score: 63 },
  { at: 5.5, score: 82 },
  { at: 7, score: 96 },
  { at: 8.5, score: 100 },
];

/** Receiving yards per game. 55+ is a top-five season; 15 is a marginal contributor. */
const TE_YARDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 8, score: 14 },
  { at: 16, score: 27 },
  { at: 27, score: 45 },
  { at: 40, score: 65 },
  { at: 55, score: 84 },
  { at: 70, score: 97 },
];

/**
 * Catch rate after shrinkage. Tight ends are targeted at shorter average depth than
 * receivers, so the league norm is high (~0.68) and the usable range is narrow.
 */
const TE_CATCH_RATE: readonly Anchor[] = [
  { at: 0.5, score: 12 },
  { at: 0.6, score: 33 },
  { at: 0.68, score: 50 },
  { at: 0.75, score: 68 },
  { at: 0.82, score: 86 },
  { at: 0.88, score: 96 },
];

/** Yards per reception after shrinkage. Separates seam threats from short-area outlets. */
const TE_YARDS_PER_RECEPTION: readonly Anchor[] = [
  { at: 6.5, score: 12 },
  { at: 8.5, score: 32 },
  { at: 10.5, score: 50 },
  { at: 12.5, score: 70 },
  { at: 14.5, score: 88 },
  { at: 16.5, score: 98 },
];

/** Receiving touchdowns per game after shrinkage. TE scoring is red-zone-driven and spiky. */
const TE_TDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.06, score: 22 },
  { at: 0.15, score: 45 },
  { at: 0.28, score: 68 },
  { at: 0.42, score: 87 },
  { at: 0.6, score: 100 },
];

/** Target share of reconstructed team targets. 0.2+ is a primary receiving option. */
const TE_TARGET_SHARE: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.03, score: 12 },
  { at: 0.07, score: 30 },
  { at: 0.12, score: 52 },
  { at: 0.18, score: 74 },
  { at: 0.24, score: 92 },
  { at: 0.3, score: 100 },
];

// Shrinkage priors. Catch rate converges quickly, so a modest pseudo-count suffices; yards
// per reception is noisier; touchdown rate is the noisiest and needs the largest.
const CATCH_RATE_PRIOR = 0.68;
const CATCH_RATE_PSEUDO_TARGETS = 45;
const YPR_PRIOR = 10.8;
const YPR_PSEUDO_RECEPTIONS = 40;
const TD_PER_GAME_PRIOR = 0.13;
const TD_PSEUDO_GAMES = 24;

/**
 * Horizon weights. Weekly leans on volume, role and availability; dynasty leans on age,
 * target volume and trajectory. Tight end value is more volume-driven and less
 * efficiency-driven than running back, because the position's fantasy scoring is dominated by
 * how often the offence looks at it.
 */
const TE_HORIZON_WEIGHTS = {
  weekly: { TV: 0.24, RP: 0.2, EFF: 0.08, SC: 0.1, RS: 0.17, TR: 0.03, AG: 0.02, AV: 0.13, DUR: 0.03 },
  ros: { TV: 0.23, RP: 0.19, EFF: 0.09, SC: 0.09, RS: 0.16, TR: 0.05, AG: 0.05, AV: 0.09, DUR: 0.05 },
  oneYear: { TV: 0.22, RP: 0.18, EFF: 0.09, SC: 0.07, RS: 0.16, TR: 0.07, AG: 0.12, AV: 0.04, DUR: 0.05 },
  threeYear: { TV: 0.21, RP: 0.16, EFF: 0.09, SC: 0.05, RS: 0.15, TR: 0.09, AG: 0.18, AV: 0.01, DUR: 0.06 },
  dynasty: { TV: 0.2, RP: 0.15, EFF: 0.09, SC: 0.05, RS: 0.14, TR: 0.1, AG: 0.21, AV: 0.0, DUR: 0.06 },
} as const;

/**
 * The headline "overall" position value — the same documented horizon blend the RB model uses,
 * and for the same reason: the dynasty composite alone made age the primary sort key for the
 * whole board. Declared here rather than shared so each position's blend stays independently
 * reviewable.
 */
const OVERALL_BLEND = { ros: 0.15, oneYear: 0.3, threeYear: 0.3, dynasty: 0.25 } as const;

export const TE_MIN_CAREER_GAMES = 1;

export function evaluateAccessibleTE(input: AccessibleInput): AccessibleResult {
  const p = input.production;
  if (p.career.games < TE_MIN_CAREER_GAMES) {
    return {
      tier: 'INSUFFICIENT',
      position: 'TE',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_QUALIFYING_GAMES',
      reason: 'No regular-season game record exists for this player at the valuation date.',
    };
  }

  // A tight end with games but no observed target is a real and common case (a pure blocking
  // or special-teams tight end). The receiving model cannot value him, and scoring him zero
  // would rank a legitimate blocking specialist against measured receivers as though the
  // model had assessed his actual job. That is reported, not guessed.
  const careerTargets = p.career.targets;
  if (careerTargets === null || careerTargets === 0) {
    return {
      tier: 'INSUFFICIENT',
      position: 'TE',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_RECEIVING_OPPORTUNITY',
      reason:
        'The player appeared in games but was never targeted, so this receiving-based model has no usage to value. ' +
        'Blocking contribution is not measurable from the available data.',
    };
  }

  // --- volume (role window: latest season when it is a full one, else the recent window) ---
  const role$ = p.roleWindow;
  const targetsPerGame = rate(role$.targets, role$.games, 1);
  const yardsPerGame = rate(role$.receivingYards, role$.games, 1);
  const TV = targetsPerGame === null ? null : score100(scaleFrom(TE_TARGETS_PER_GAME, targetsPerGame));
  const RP = yardsPerGame === null ? null : score100(scaleFrom(TE_YARDS_PER_GAME, yardsPerGame));

  // --- efficiency (career exposure, shrunk) ---
  const catchRate = rate(p.career.receptions, careerTargets, 10);
  const shrunkCatch =
    catchRate === null ? null : shrink(catchRate, careerTargets, CATCH_RATE_PRIOR, CATCH_RATE_PSEUDO_TARGETS);
  const ypr = rate(p.career.receivingYards, p.career.receptions, 10);
  const shrunkYpr =
    ypr === null ? null : shrink(ypr, p.career.receptions ?? 0, YPR_PRIOR, YPR_PSEUDO_RECEPTIONS);
  const EFF = weightedMean([
    { value: shrunkCatch === null ? null : score100(scaleFrom(TE_CATCH_RATE, shrunkCatch)), weight: 0.45 },
    { value: shrunkYpr === null ? null : score100(scaleFrom(TE_YARDS_PER_RECEPTION, shrunkYpr)), weight: 0.55 },
  ]);

  // --- scoring ---
  const tdPerGame = rate(p.career.receivingTds, p.career.games, 1);
  const shrunkTd =
    tdPerGame === null ? null : shrink(tdPerGame, p.career.games, TD_PER_GAME_PRIOR, TD_PSEUDO_GAMES);
  const SC = shrunkTd === null ? null : score100(scaleFrom(TE_TDS_PER_GAME, shrunkTd));

  // --- role share ---
  const shares = p.teamShares;
  const RS =
    shares?.targetShare == null ? null : score100(scaleFrom(TE_TARGET_SHARE, clamp(shares.targetShare, 0, 1)));

  // --- trajectory, age, availability, durability ---
  const TR = trajectoryScore(p.latestSeason, p.priorSeason, (w) => w.targets);
  const AG = ageScore('TE', input.age);
  const AV = score100(availabilityScore(input.availability));
  const DUR = durabilityScore(p);

  const components = compact({ TV, RP, EFF, SC, RS, TR, AG, AV, DUR });
  const composites = {
    weekly: composite('weekly', components),
    ros: composite('ros', components),
    oneYear: composite('oneYear', components),
    threeYear: composite('threeYear', components),
    dynasty: composite('dynasty', components),
  };

  const role = classifyTERole(targetsPerGame, shares?.targetShare ?? null, yardsPerGame);
  const confidence = buildConfidence(collectPenalties(input, TR, AG));
  const factors = buildFactors({ input, components, role, targetsPerGame, yardsPerGame, shrunkCatch, shares });

  return {
    tier: 'ACCESSIBLE',
    modelVersion: TE_ACCESSIBLE_VERSION,
    position: 'TE',
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
      observedFields: ['targets', 'receptions', 'receiving_yards', 'receiving_touchdowns', 'games_played'],
      derivedFields: [
        'targets_per_game',
        'receiving_yards_per_game',
        'catch_rate_shrunk',
        'yards_per_reception_shrunk',
        'touchdowns_per_game_shrunk',
        ...(shares?.targetShare != null ? ['target_share_reconstructed'] : []),
        ...(TR !== null ? ['season_over_season_trajectory'] : []),
      ],
      unavailableFields: [
        'career_routes',
        'route_participation',
        'snap_share',
        'red_zone_target_rate',
        'average_depth_of_target',
        'team_context',
      ],
    },
  };
}

// ---------------------------------------------------------------------------

function compact(scores: Readonly<Record<string, number | null>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) if (v !== null) out[k] = v;
  return out;
}

function composite(horizon: keyof typeof TE_HORIZON_WEIGHTS, components: Readonly<Record<string, number>>): number {
  const weights = TE_HORIZON_WEIGHTS[horizon];
  const parts = Object.entries(weights).map(([code, weight]) => ({ value: components[code] ?? null, weight }));
  return score100(weightedMean(parts) ?? 0);
}

/**
 * Role from usage over the role window. Thresholds were tightened after the first live run
 * labelled almost every top-25 tight end a "primary receiving option": measured over a rolling
 * 8-game window, a fill-in starter reached 5 targets a game easily. Both the window and these
 * thresholds changed, so the label now requires a genuine season-long focal-point load.
 */
export function classifyTERole(
  targetsPerGame: number | null,
  targetShare: number | null,
  yardsPerGame: number | null,
): string {
  const t = targetsPerGame ?? 0;
  const y = yardsPerGame ?? 0;
  if (t >= 6 || (targetShare !== null && targetShare >= 0.22 && t >= 4.5)) return 'Primary receiving option';
  if (t >= 4.5) return 'Featured starting tight end';
  if (t >= 2.75) return y >= 28 ? 'Starting tight end' : 'Rotational receiving tight end';
  if (t >= 1.25) return 'Secondary tight end';
  return 'Blocking-first or depth tight end';
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
  if (p.teamShares?.targetShare == null) codes.push('NO_TEAM_SHARES');
  if (age === null) codes.push('AGE_UNKNOWN');
  if (input.availability === 'UNKNOWN') codes.push('STATUS_UNATTESTED');
  if (isStaleProduction(p, input.asOf)) codes.push('STALE_PRODUCTION');
  return codes;
}

function buildFactors(args: {
  input: AccessibleInput;
  components: Readonly<Record<string, number>>;
  role: string;
  targetsPerGame: number | null;
  yardsPerGame: number | null;
  shrunkCatch: number | null;
  shares: AccessibleInput['production']['teamShares'];
}): { explanation: string; positive: string[]; negative: string[] } {
  const { input, components, role, targetsPerGame, yardsPerGame, shrunkCatch, shares } = args;
  const positive: string[] = [];
  const negative: string[] = [];
  const one = (n: number) => n.toFixed(1);

  if (targetsPerGame !== null && targetsPerGame >= 4.5) {
    positive.push(`Commands a receiver-level target load (${one(targetsPerGame)} per game over ${input.production.roleWindow.games} games).`);
  } else if (targetsPerGame !== null && targetsPerGame < 1.5) {
    negative.push(`Rarely targeted (${one(targetsPerGame)} per game), limiting fantasy relevance.`);
  }
  if (yardsPerGame !== null && yardsPerGame >= 45) {
    positive.push(`Producing ${Math.round(yardsPerGame)} receiving yards per game.`);
  } else if (yardsPerGame !== null && yardsPerGame < 15) {
    negative.push(`Low receiving output (${Math.round(yardsPerGame)} yards per game).`);
  }
  if (shares?.targetShare != null && shares.targetShare >= 0.18) {
    positive.push(`Absorbs ${Math.round(shares.targetShare * 100)}% of the team's measured targets.`);
  }
  if (shrunkCatch !== null && shrunkCatch >= 0.75) {
    positive.push(`Reliable hands (${Math.round(shrunkCatch * 100)}% catch rate after regressing for sample size).`);
  } else if (shrunkCatch !== null && shrunkCatch <= 0.6) {
    negative.push(`Below-average catch rate (${Math.round(shrunkCatch * 100)}% after regression).`);
  }
  if ((components.AG ?? 100) <= 55) {
    negative.push(`Age ${input.age ?? '?'} works against the multi-year outlook.`);
  } else if ((components.AG ?? 0) >= 95 && input.age !== null) {
    positive.push(`Age ${input.age} sits in the tight-end production prime.`);
  }
  if (isUnavailable(input.availability)) {
    negative.push('Currently not expected to play, which suppresses the near-term outlook.');
  } else if (isNotRostered(input.availability)) {
    negative.push('Not on an active roster at this date, which weighs on the near-term outlook.');
  }
  if (isStaleProduction(input.production, input.asOf)) {
    negative.push('Has not played in over a year, so the measured role may no longer hold.');
  }
  if ((components.TR ?? 50) >= 70) positive.push('Target volume grew against the previous season.');
  else if ((components.TR ?? 50) <= 30) negative.push('Target volume fell against the previous season.');
  if (input.production.career.games < 8) {
    negative.push(`Only ${input.production.career.games} career games observed, so every rate is thinly evidenced.`);
  }

  const explanation =
    `${role}. Valued from ${input.production.career.games} observed games across ` +
    `${input.production.seasonsPlayed} season${input.production.seasonsPlayed === 1 ? '' : 's'} using box-score ` +
    'receiving production, reconstructed target share and age — without route, snap or target-quality data.';

  return { explanation, positive, negative };
}

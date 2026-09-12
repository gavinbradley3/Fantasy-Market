// Accessible-data WR valuation model (wr-accessible-1.0). Pure and deterministic.
//
// WHY THIS EXISTS
// The frozen WR engine is a ROUTE-AND-EXPECTATION model. Five of the inputs at the centre of
// it — career routes, route participation over the last four and eight games, targets per route
// run, expected fantasy points per target, catch rate over expected — exist only in charted
// data no free source publishes. PlayerTicker can supply none of them today, so the engine ran
// on its own fallback ladder instead: a flat 0.5 route participation, a flat 0.18 targets per
// route run, a reference-median expectation, and a catch rate over expected of exactly zero,
// for every receiver in the league. Those are the same numbers for everyone, so the components
// built on them carried no information, and the engine's own confidence correctly reported
// that as near-zero for all 309 valued receivers.
//
// This is not that engine with better defaults. It is a smaller model over the columns
// nflverse actually publishes, and it asks a narrower question it can answer honestly: how much
// of his team's passing game does this receiver command, what does he do with it, and how much
// of his career is still ahead of him.
//
// WHAT MAKES IT A WR MODEL RATHER THAN THE TE MODEL RETUNED
// Three deliberate structural differences, each following from how the position works:
//
//   1. TARGET SHARE IS THE HEADLINE COMPONENT, not a supporting one. Receiver value is
//      fundamentally a claim on a finite resource — the passing game — and share states that
//      claim directly. At tight end, share is diluted by the blocking half of the job and
//      volume describes the role better.
//   2. AIR YARDS ENTER OPPORTUNITY. Two receivers can draw the same targets and be aimed at
//      very different places. Air yards per game is the intended downfield volume, and it is
//      the only target-QUALITY signal in the free stack. It is used as VOLUME rather than as a
//      per-target average because average depth is not monotone in value — a nineteen-yard
//      average describes a boom-and-bust role, not a better one — while total intended yardage
//      is. Depth still appears, as the role label and in the explanations.
//   3. EFFICIENCY IS PER TARGET, NOT PER RECEPTION. Yards per reception rewards a receiver for
//      the targets he failed to catch by excluding them. Yards per target is the rate the
//      opportunity actually returned, and it prices catch rate and depth together.
//
// COMPONENTS (0–100 each)
//   TS  Target share      provider-measured share of team targets, role window
//   OP  Opportunity       targets per game and air yards per game, shrunk by games observed
//   PR  Production        receiving yards per game, role window, shrunk by games observed
//   EF  Efficiency        yards per target and catch rate, shrunk by career target exposure
//   SC  Scoring           receiving touchdowns per game, shrunk
//   TR  Trajectory        newest season per-game targets against the prior season
//   AG  Age               WR age curve
//   DC  Draft capital     draft round, with its weight DECAYING as observed games accumulate
//   AV  Availability      point-in-time roster state
//   DU  Durability        share of rostered team weeks appeared in

import { clamp } from './numeric';
import {
  ageScore,
  availabilityScore,
  buildConfidence,
  durabilityScore,
  isNotRostered,
  isStaleProduction,
  isUnavailable,
  shrunkPerGameRate,
  TIER_WIDE_MISSING_INPUTS,
  trajectoryScore,
  type ConfidencePenaltyCode,
} from './common';
import { rate, scaleFrom, score100, shrink, weightedMean, type Anchor } from './scale';
import type { AccessibleInput, AccessibleResult } from './types';

export const WR_ACCESSIBLE_VERSION = 'wr-accessible-1.0';

/**
 * Share of the team's targets over the role window.
 *
 * The scale is anchored on what a role actually looks like: a genuine alpha clears 28%, a clear
 * number one sits near 24%, a second receiver near 18%, a third near 12%, and a depth piece
 * under 7%. Share saturates near a third of the offence because no receiver commands much more
 * than that over a season.
 */
const WR_TARGET_SHARE: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.05, score: 10 },
  { at: 0.1, score: 26 },
  { at: 0.145, score: 42 },
  { at: 0.19, score: 60 },
  { at: 0.24, score: 78 },
  { at: 0.29, score: 93 },
  { at: 0.34, score: 100 },
];

/** Targets per game. 8 is a number-one load, 6 a second receiver, 3.5 a third, under 2 depth. */
const WR_TARGETS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 1, score: 8 },
  { at: 2, score: 18 },
  { at: 3.5, score: 33 },
  { at: 5, score: 48 },
  { at: 6.5, score: 63 },
  { at: 8, score: 78 },
  { at: 9.5, score: 90 },
  { at: 11, score: 100 },
];

/**
 * Air yards per game — targets multiplied by the depth they were thrown at.
 *
 * Intended downfield volume. A number-one receiver draws 80–100, a possession slot 40–55, a
 * depth receiver under 25. Used instead of a depth AVERAGE because the average is not monotone
 * in value while the total is.
 */
const WR_AIR_YARDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 10, score: 8 },
  { at: 25, score: 22 },
  { at: 40, score: 36 },
  { at: 60, score: 54 },
  { at: 80, score: 71 },
  { at: 100, score: 86 },
  { at: 120, score: 97 },
  { at: 140, score: 100 },
];

/** Receiving yards per game. 90+ is a top-five season, 50 a solid starter, under 15 marginal. */
const WR_YARDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 8, score: 10 },
  { at: 18, score: 22 },
  { at: 30, score: 37 },
  { at: 45, score: 55 },
  { at: 60, score: 71 },
  { at: 75, score: 86 },
  { at: 90, score: 97 },
  { at: 105, score: 100 },
];

/**
 * Yards per target after shrinkage — the rate the opportunity actually returned.
 *
 * League average is near 7.8. This is the receiver efficiency metric that does not launder
 * away incompletions the way yards per reception does.
 */
const WR_YARDS_PER_TARGET: readonly Anchor[] = [
  { at: 4.5, score: 8 },
  { at: 5.5, score: 20 },
  { at: 6.5, score: 34 },
  { at: 7.5, score: 48 },
  { at: 8.5, score: 63 },
  { at: 9.5, score: 78 },
  { at: 10.5, score: 90 },
  { at: 11.5, score: 98 },
];

/**
 * Catch rate after shrinkage.
 *
 * The receiver band sits well below the tight end's — around 0.63 against 0.68 — because
 * receivers are thrown to further downfield and into tighter coverage.
 */
const WR_CATCH_RATE: readonly Anchor[] = [
  { at: 0.45, score: 10 },
  { at: 0.55, score: 30 },
  { at: 0.63, score: 50 },
  { at: 0.7, score: 68 },
  { at: 0.76, score: 84 },
  { at: 0.82, score: 96 },
];

/** Receiving touchdowns per game after shrinkage. */
const WR_TDS_PER_GAME: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 0.05, score: 14 },
  { at: 0.12, score: 30 },
  { at: 0.22, score: 50 },
  { at: 0.35, score: 70 },
  { at: 0.5, score: 88 },
  { at: 0.65, score: 100 },
];

/** The WR age curve, declared in `common.ts` beside the other two so they compare in one place. */
export { WR_AGE_ANCHORS } from './common';

/**
 * Draft-capital score by round.
 *
 * Draft position is a statement about the OPPORTUNITY a team intends to give a player, which is
 * exactly the quantity the components above measure directly. It is therefore treated as a
 * PRIOR that the observed record supersedes, never as standing evidence — see
 * `DRAFT_CAPITAL_HALF_LIFE_GAMES`.
 */
const WR_DRAFT_CAPITAL: Readonly<Record<number, number>> = {
  1: 100,
  2: 82,
  3: 66,
  4: 52,
  5: 40,
  6: 30,
  7: 22,
};
const WR_DRAFT_CAPITAL_UNDRAFTED = 15;

/**
 * Games at which draft capital and the observed record carry equal weight.
 *
 * The weight on draft capital is `k / (games + k)`. At no games it is the only signal there is;
 * by one full season it is worth half; by three seasons it is worth a quarter and the football
 * evidence has taken over. This is what keeps draft position from behaving like a permanent
 * grade, which is the specific failure mode the full model shows — its Role Durability
 * component resolves contract security from draft round for every receiver in the league, so a
 * first-rounder carries the bonus for his whole career whatever he has since done.
 */
const DRAFT_CAPITAL_HALF_LIFE_GAMES = 16;
const DRAFT_CAPITAL_NEUTRAL = 50;

/**
 * VOLUME priors — the per-game usage expected of a receiver we have not watched.
 *
 * Teams carry five or six receivers and start three, so the modal rostered receiver is a
 * rotational piece, and the prior describes one. The three numbers are mutually consistent by
 * construction rather than by coincidence: 2.8 targets at the declared 7.8 yards-per-target
 * prior is 21.8 receiving yards, and at the declared 9.5-yard depth prior is 26.6 air yards.
 *
 * Authored football statements, not fitted to the ingested seasons — fitting them to the same
 * seasons the model is then scored on would be a point-in-time leak.
 */
const WR_TARGETS_PER_GAME_PRIOR = 2.8;
const WR_YARDS_PER_GAME_PRIOR = 22.0;
const WR_AIR_YARDS_PER_GAME_PRIOR = 27.0;

// Efficiency shrinkage priors. Catch rate converges fastest; yards per target is noisier
// because one deep completion moves it; touchdown rate is noisiest of all.
const CATCH_RATE_PRIOR = 0.63;
const CATCH_RATE_PSEUDO_TARGETS = 50;
const YPT_PRIOR = 7.8;
const YPT_PSEUDO_TARGETS = 60;
const TD_PER_GAME_PRIOR = 0.15;
const TD_PSEUDO_GAMES = 26;
/** League average depth of target, used as the role-label prior when air yards are absent. */
const ADOT_PRIOR = 9.5;

/**
 * Horizon weights.
 *
 * The governing constraint is that OBSERVED FOOTBALL must outweigh biography at every horizon,
 * including dynasty. On the dynasty horizon the six evidence components (TS, OP, PR, EF, SC, TR)
 * carry 0.72 against 0.21 for age and draft capital combined. The frozen engine puts 0.25 on its
 * age-and-development component alone and a further 0.23 on a Role Durability component whose
 * contract-security input is itself resolved from draft round, which is how an unproven
 * first-round rookie comes to outrank a proven veteran there.
 *
 * Weekly leans on current usage and availability; dynasty shifts weight from availability and
 * scoring onto age, trajectory and durability. Target share leads every horizon because it is
 * both the best-measured and the most persistent receiver signal.
 */
const WR_HORIZON_WEIGHTS = {
  weekly: { TS: 0.22, OP: 0.19, PR: 0.16, EF: 0.08, SC: 0.07, TR: 0.03, AG: 0.02, DC: 0.01, AV: 0.19, DU: 0.03 },
  ros: { TS: 0.23, OP: 0.19, PR: 0.15, EF: 0.09, SC: 0.06, TR: 0.05, AG: 0.05, DC: 0.02, AV: 0.12, DU: 0.04 },
  oneYear: { TS: 0.23, OP: 0.18, PR: 0.14, EF: 0.09, SC: 0.06, TR: 0.07, AG: 0.1, DC: 0.03, AV: 0.05, DU: 0.05 },
  threeYear: { TS: 0.21, OP: 0.17, PR: 0.13, EF: 0.09, SC: 0.05, TR: 0.08, AG: 0.14, DC: 0.04, AV: 0.02, DU: 0.07 },
  dynasty: { TS: 0.2, OP: 0.16, PR: 0.13, EF: 0.09, SC: 0.05, TR: 0.09, AG: 0.16, DC: 0.05, AV: 0.0, DU: 0.07 },
} as const;

/**
 * The headline position value — the same documented horizon blend the RB and TE accessible
 * models use, and for the same reason: the dynasty composite alone made age the primary sort key
 * for the whole board. Declared here rather than shared so each position's blend stays
 * independently reviewable.
 */
const OVERALL_BLEND = { ros: 0.15, oneYear: 0.3, threeYear: 0.3, dynasty: 0.25 } as const;

export const WR_MIN_CAREER_GAMES = 1;

export function evaluateAccessibleWR(input: AccessibleInput): AccessibleResult {
  const p = input.production;
  if (p.career.games < WR_MIN_CAREER_GAMES) {
    return {
      tier: 'INSUFFICIENT',
      position: 'WR',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_QUALIFYING_GAMES',
      reason: 'No regular-season game record exists for this player at the valuation date.',
    };
  }

  // A receiver with games but no observed target has no receiving role to value. Scoring him
  // zero would rank a special-teams or blocking-assignment receiver against measured receivers
  // as though the model had assessed his actual job. That is reported, not guessed.
  const careerTargets = p.career.targets;
  if (careerTargets === null || careerTargets === 0) {
    return {
      tier: 'INSUFFICIENT',
      position: 'WR',
      canonicalId: input.canonicalId,
      reasonCode: 'NO_RECEIVING_OPPORTUNITY',
      reason:
        'The player appeared in games but was never targeted, so this receiving-based model has no usage to value.',
    };
  }

  // --- opportunity (role window: latest season when it is a full one, else recent 8) ---
  //
  // RAW rates are what the receiver actually did and are what the role label and explanations
  // quote; SHRUNK rates are what the components score, regressed toward the league prior by
  // games observed so a one-game sample cannot saturate a component.
  const role$ = p.roleWindow;
  const targetsPerGame = rate(role$.targets, role$.games, 1);
  const yardsPerGame = rate(role$.receivingYards, role$.games, 1);
  const adot = rate(role$.receivingAirYards, role$.targets, 5);

  const shrunkTargets = shrunkPerGameRate(role$.targets, role$.games, WR_TARGETS_PER_GAME_PRIOR);
  const shrunkYards = shrunkPerGameRate(role$.receivingYards, role$.games, WR_YARDS_PER_GAME_PRIOR);
  const shrunkAirYards = shrunkPerGameRate(role$.receivingAirYards, role$.games, WR_AIR_YARDS_PER_GAME_PRIOR);

  // Target share: the provider's own measurement when it exists, the reconstructed share
  // otherwise. The reconstructed one sums only the players the snapshot holds rows for, so it
  // is an upper bound; preferring the measurement is preferring a number to a bound.
  const measuredShare = p.providerTargetShare;
  const shareValue = measuredShare ?? p.teamShares?.targetShare ?? null;
  const TS = shareValue === null ? null : score100(scaleFrom(WR_TARGET_SHARE, clamp(shareValue, 0, 1)));

  // Opportunity blends how often he is thrown to with how far. Air yards carry the smaller
  // share because they are the same targets counted again with depth attached.
  const OP = weightedMean([
    { value: shrunkTargets === null ? null : score100(scaleFrom(WR_TARGETS_PER_GAME, shrunkTargets)), weight: 0.62 },
    { value: shrunkAirYards === null ? null : score100(scaleFrom(WR_AIR_YARDS_PER_GAME, shrunkAirYards)), weight: 0.38 },
  ]);

  const PR = shrunkYards === null ? null : score100(scaleFrom(WR_YARDS_PER_GAME, shrunkYards));

  // --- efficiency (career exposure, shrunk by targets) ---
  const ypt = rate(p.career.receivingYards, careerTargets, 10);
  const shrunkYpt = ypt === null ? null : shrink(ypt, careerTargets, YPT_PRIOR, YPT_PSEUDO_TARGETS);
  const catchRate = rate(p.career.receptions, careerTargets, 10);
  const shrunkCatch =
    catchRate === null ? null : shrink(catchRate, careerTargets, CATCH_RATE_PRIOR, CATCH_RATE_PSEUDO_TARGETS);
  const EF = weightedMean([
    { value: shrunkYpt === null ? null : score100(scaleFrom(WR_YARDS_PER_TARGET, shrunkYpt)), weight: 0.6 },
    { value: shrunkCatch === null ? null : score100(scaleFrom(WR_CATCH_RATE, shrunkCatch)), weight: 0.4 },
  ]);

  // --- scoring ---
  const tdPerGame = rate(p.career.receivingTds, p.career.games, 1);
  const shrunkTd =
    tdPerGame === null ? null : shrink(tdPerGame, p.career.games, TD_PER_GAME_PRIOR, TD_PSEUDO_GAMES);
  const SC = shrunkTd === null ? null : score100(scaleFrom(WR_TDS_PER_GAME, shrunkTd));

  // --- trajectory, age, draft capital, availability, durability ---
  const TR = trajectoryScore(p.latestSeason, p.priorSeason, (w) => w.targets);
  const AG = ageScore('WR', input.age);
  const DC = draftCapitalScore(input.draftRound, p.career.games);
  const AV = score100(availabilityScore(input.availability));
  const DU = durabilityScore(p);

  const components = compact({ TS, OP, PR, EF, SC, TR, AG, DC, AV, DU });
  const composites = {
    weekly: composite('weekly', components),
    ros: composite('ros', components),
    oneYear: composite('oneYear', components),
    threeYear: composite('threeYear', components),
    dynasty: composite('dynasty', components),
  };

  const role = classifyWRRole(targetsPerGame, shareValue, adot);
  const confidence = buildConfidence(
    collectPenalties(input, TR, AG, shareValue, measuredShare, role$),
    p.career.games,
  );
  const factors = buildFactors({
    input,
    components,
    role,
    targetsPerGame,
    yardsPerGame,
    adot,
    shrunkYpt,
    shareValue,
    measuredShare,
  });

  return {
    tier: 'ACCESSIBLE',
    modelVersion: WR_ACCESSIBLE_VERSION,
    position: 'WR',
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
    materialMissingInputs: [...TIER_WIDE_MISSING_INPUTS, 'targets per route run', 'expected points per target'],
    provenance: {
      gamesObserved: p.career.games,
      seasonsObserved: p.seasonsPlayed,
      teamSharesDerived: measuredShare === null && p.teamShares !== null,
      observedFields: [
        'targets',
        'receptions',
        'receiving_yards',
        'receiving_touchdowns',
        'receiving_air_yards',
        'games_played',
        ...(measuredShare !== null ? ['target_share'] : []),
      ],
      derivedFields: [
        'targets_per_game_shrunk',
        'air_yards_per_game_shrunk',
        'receiving_yards_per_game_shrunk',
        'yards_per_target_shrunk',
        'catch_rate_shrunk',
        'touchdowns_per_game_shrunk',
        'average_depth_of_target',
        ...(measuredShare === null && p.teamShares?.targetShare != null ? ['target_share_reconstructed'] : []),
        ...(TR !== null ? ['season_over_season_trajectory'] : []),
        ...(DC !== null ? ['draft_capital_decayed_by_sample'] : []),
      ],
      unavailableFields: [
        'career_routes',
        'route_participation',
        'targets_per_route_run',
        'expected_fantasy_points_per_target',
        'catch_rate_over_expected',
        'expected_td_rate_per_target',
        'snap_share',
        'red_zone_target_rate',
        'qb_environment',
        'team_context',
        'contract_security',
      ],
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Draft capital, with its weight decaying as the observed record accumulates.
 *
 * Returns `null` only when no round is known AND there is nothing to decay toward — which
 * cannot happen here, since the neutral value is always available. A player with no draft round
 * is treated as undrafted, because upstream does not distinguish undrafted from unknown; that
 * conflation is recorded on the confidence penalties.
 */
export function draftCapitalScore(round: number | null, gamesObserved: number): number {
  const raw = round === null ? WR_DRAFT_CAPITAL_UNDRAFTED : WR_DRAFT_CAPITAL[round] ?? WR_DRAFT_CAPITAL_UNDRAFTED;
  const games = Math.max(0, gamesObserved);
  const weightOnDraft = DRAFT_CAPITAL_HALF_LIFE_GAMES / (games + DRAFT_CAPITAL_HALF_LIFE_GAMES);
  return score100(weightOnDraft * raw + (1 - weightOnDraft) * DRAFT_CAPITAL_NEUTRAL);
}

function compact(scores: Readonly<Record<string, number | null>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) if (v !== null) out[k] = v;
  return out;
}

function composite(horizon: keyof typeof WR_HORIZON_WEIGHTS, components: Readonly<Record<string, number>>): number {
  const weights = WR_HORIZON_WEIGHTS[horizon];
  const parts = Object.entries(weights).map(([code, weight]) => ({ value: components[code] ?? null, weight }));
  return score100(weightedMean(parts) ?? 0);
}

/**
 * Role from usage over the role window.
 *
 * Share leads the classification because it is what separates a number one from a high-volume
 * piece on a pass-heavy team. Depth of target only refines the label — it never raises it.
 */
export function classifyWRRole(
  targetsPerGame: number | null,
  targetShare: number | null,
  adot: number | null,
): string {
  const t = targetsPerGame ?? 0;
  const s = targetShare;
  const deep = (adot ?? ADOT_PRIOR) >= 12.5;
  if ((s !== null && s >= 0.27) || t >= 9) return 'Alpha target earner';
  if ((s !== null && s >= 0.22) || t >= 7.25) return deep ? 'Number-one receiver, downfield role' : 'Number-one receiver';
  if ((s !== null && s >= 0.16) || t >= 5.25) return deep ? 'Starting receiver, field-stretching role' : 'Starting receiver';
  if ((s !== null && s >= 0.1) || t >= 3.25) return 'Rotational receiver';
  if (t >= 1.5) return 'Depth receiver with situational usage';
  return 'Depth receiver';
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
  shareValue: number | null,
  measuredShare: number | null,
  roleWindow: AccessibleInput['production']['roleWindow'],
): ConfidencePenaltyCode[] {
  // Player-specific evidence gaps only. Sample size is not here: it sets the BASE the score
  // starts from (`sampleEvidenceScore`), because every other number the model produces rests
  // on it. The tier's constant coverage gaps are not here either — they are reported through
  // `materialMissingInputs` and the model tier, not subtracted from every player's confidence.
  const codes: ConfidencePenaltyCode[] = [];
  const p = input.production;
  if (trajectory === null) codes.push('NO_TRAJECTORY');
  // A RECONSTRUCTED share is a bound rather than a measurement, so it costs the same as having
  // no share at all would cost a model that leant on it less heavily than this one does.
  if (shareValue === null || measuredShare === null) codes.push('NO_TEAM_SHARES');
  if (roleWindow.receivingAirYards === null) codes.push('NO_TARGET_DEPTH');
  if (age === null) codes.push('AGE_UNKNOWN');
  if (input.draftRound === null) codes.push('DRAFT_ROUND_UNKNOWN');
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
  adot: number | null;
  shrunkYpt: number | null;
  shareValue: number | null;
  measuredShare: number | null;
}): { explanation: string; positive: string[]; negative: string[] } {
  const { input, components, role, targetsPerGame, yardsPerGame, adot, shrunkYpt, shareValue, measuredShare } = args;
  const positive: string[] = [];
  const negative: string[] = [];
  const one = (n: number) => n.toFixed(1);
  const p = input.production;

  if (shareValue !== null && shareValue >= 0.24) {
    positive.push(`Commands ${Math.round(shareValue * 100)}% of his team's targets.`);
  } else if (shareValue !== null && shareValue < 0.1) {
    negative.push(`Draws only ${Math.round(shareValue * 100)}% of his team's targets.`);
  }
  if (targetsPerGame !== null && targetsPerGame >= 7.25) {
    positive.push(`Number-one target volume (${one(targetsPerGame)} per game over ${p.roleWindow.games} games).`);
  } else if (targetsPerGame !== null && targetsPerGame < 2.5) {
    negative.push(`Rarely targeted (${one(targetsPerGame)} per game), limiting fantasy relevance.`);
  }
  if (yardsPerGame !== null && yardsPerGame >= 70) {
    positive.push(`Producing ${Math.round(yardsPerGame)} receiving yards per game.`);
  } else if (yardsPerGame !== null && yardsPerGame < 20) {
    negative.push(`Low receiving output (${Math.round(yardsPerGame)} yards per game).`);
  }
  if (adot !== null && adot >= 13) {
    positive.push(`Used downfield (${one(adot)}-yard average target depth), which raises his ceiling.`);
  } else if (adot !== null && adot <= 6.5) {
    negative.push(`Targeted close to the line (${one(adot)}-yard average depth), capping his yardage upside.`);
  }
  if (shrunkYpt !== null && shrunkYpt >= 9.5) {
    positive.push(`Returns ${one(shrunkYpt)} yards per target after regressing for sample size.`);
  } else if (shrunkYpt !== null && shrunkYpt <= 6.3) {
    negative.push(`Only ${one(shrunkYpt)} yards per target after regression.`);
  }
  if ((components.AG ?? 100) <= 55) {
    negative.push(`Age ${input.age ?? '?'} works against the multi-year outlook.`);
  } else if ((components.AG ?? 0) >= 97 && input.age !== null) {
    positive.push(`Age ${input.age} sits in the receiver production prime.`);
  }
  if (isUnavailable(input.availability)) {
    negative.push('Currently not expected to play, which suppresses the near-term outlook.');
  } else if (isNotRostered(input.availability)) {
    negative.push('Not on an active roster at this date, which weighs on the near-term outlook.');
  }
  if (isStaleProduction(p, input.asOf)) {
    negative.push('Has not played in over a year, so the measured role may no longer hold.');
  }
  if ((components.TR ?? 50) >= 70) positive.push('Target volume grew against the previous season.');
  else if ((components.TR ?? 50) <= 30) negative.push('Target volume fell against the previous season.');
  if (p.career.games < 8) {
    negative.push(`Only ${p.career.games} career games observed, so every rate is thinly evidenced.`);
  }

  const shareSource =
    measuredShare !== null
      ? "the provider's measured target share"
      : shareValue !== null
        ? 'a reconstructed target share'
        : 'no target share';
  const explanation =
    `${role}. Valued from ${p.career.games} observed games across ${p.seasonsPlayed} ` +
    `season${p.seasonsPlayed === 1 ? '' : 's'} using box-score receiving production, ${shareSource} and ` +
    'target depth from air yards — without route, snap or expected-value data.';

  return { explanation, positive, negative };
}

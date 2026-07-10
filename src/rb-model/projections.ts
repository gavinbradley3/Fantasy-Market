// §26.10 Expected Fantasy Output — deterministic expected values (no Monte Carlo).
// Football-stat expectations are active-game-conditional and include the workload
// ramp; only Weekly EFO, ROS EFO, and expected active games carry Pactive. Pactive
// is applied exactly once. One/Three/Dynasty EFO are deferred — composites only.

import {
  EFFECTIVE_YPC_CLAMP,
  QB_CARRY_PRESSURE_COEF,
  QB_GOAL_LINE_PRESSURE_COEF,
  REC_TD_RATE,
  RUSH_TD_RATE,
  SCORING_FACTOR,
} from '@/rb-model/constants';
import { clamp } from '@/rb-model/math';
import type { ScoringVector } from '@/rb-model/types';

export interface ActiveGame {
  expectedCarries: number;
  expectedRushingYards: number;
  expectedRushingTouchdowns: number;
  expectedRoutes: number;
  expectedTargets: number;
  expectedReceptions: number;
  expectedReceivingYards: number;
  expectedReceivingTouchdowns: number;
  activeGameFantasyPoints: number;
}

export interface ProjectionInputs {
  av: number; // Availability component 0–100
  inactiveList: boolean; // OUT / IR / PUP / SUSPENDED
  teamNonQbRush: number;
  carryShare: number;
  qbRushPressure: number;
  teamDropbacks: number;
  routeParticipation: number;
  shrunkTPRR: number;
  shrunkCatchRate: number;
  shrunkRecYardsPerReception: number;
  shrunkYPC: number;
  pointsPerDrive: number;
  goalLineShare: number;
  redZoneShare: number;
  workloadRamp: number; // canonical, clamped [0,1]
  expectedGamesRemaining: number;
  scoring: ScoringVector;
}

export interface Projections {
  probabilityActive: number;
  effectiveRamp: number;
  currentActiveGame: ActiveGame;
  fullWorkloadActiveGame: ActiveGame;
  weeklyEFO: number;
  expectedActiveGamesRemaining: number;
  rosEFO: number;
}

// §26.10.2 — one deterministic active-game function.
export function calculateActiveGame(p: ProjectionInputs, ramp: number): ActiveGame {
  const expectedCarries =
    p.teamNonQbRush * p.carryShare * (1 - QB_CARRY_PRESSURE_COEF * p.qbRushPressure) * ramp;

  const expectedRoutes = p.teamDropbacks * p.routeParticipation * ramp;
  const expectedTargets = expectedRoutes * p.shrunkTPRR;
  const expectedReceptions = expectedTargets * p.shrunkCatchRate;
  const expectedReceivingYards = expectedReceptions * p.shrunkRecYardsPerReception;

  const effectiveYPC = clamp(p.shrunkYPC, EFFECTIVE_YPC_CLAMP[0], EFFECTIVE_YPC_CLAMP[1]);
  const expectedRushingYards = expectedCarries * effectiveYPC;

  const scoringFactor = clamp(
    p.pointsPerDrive / SCORING_FACTOR.divisor,
    SCORING_FACTOR.min,
    SCORING_FACTOR.max,
  );

  const baseRushTdRatePerCarry =
    RUSH_TD_RATE.base +
    RUSH_TD_RATE.goalLineCoef * p.goalLineShare +
    RUSH_TD_RATE.redZoneCoef * p.redZoneShare;

  const qbGoalLineFactor = 1 - QB_GOAL_LINE_PRESSURE_COEF * p.qbRushPressure;

  const expectedRushingTouchdowns =
    expectedCarries * baseRushTdRatePerCarry * scoringFactor * qbGoalLineFactor;

  const expectedReceivingTouchdowns = expectedTargets * REC_TD_RATE * scoringFactor;

  const activeGameFantasyPoints =
    expectedRushingYards * p.scoring.points_per_rushing_yard +
    expectedRushingTouchdowns * p.scoring.points_per_rushing_td +
    expectedReceptions * p.scoring.points_per_reception +
    expectedReceivingYards * p.scoring.points_per_receiving_yard +
    expectedReceivingTouchdowns * p.scoring.points_per_receiving_td;

  return {
    expectedCarries,
    expectedRushingYards,
    expectedRushingTouchdowns,
    expectedRoutes,
    expectedTargets,
    expectedReceptions,
    expectedReceivingYards,
    expectedReceivingTouchdowns,
    activeGameFantasyPoints,
  };
}

export function computeProjections(p: ProjectionInputs): Projections {
  // §26.10.1 — inactive-list policy forces all output to zero regardless of ramp.
  const probabilityActive = p.inactiveList ? 0 : p.av / 100;
  const effectiveRamp = p.inactiveList ? 0 : clamp(p.workloadRamp, 0, 1);

  const currentActiveGame = calculateActiveGame(p, effectiveRamp);
  const fullWorkloadActiveGame = calculateActiveGame(p, 1.0);

  // §26.10.3 — Weekly EFO applies Pactive exactly once.
  const weeklyEFO = probabilityActive * currentActiveGame.activeGameFantasyPoints;

  // §26.10.4 — recovery-aware ROS approximation.
  const expectedActiveGamesRemaining = p.expectedGamesRemaining * probabilityActive;
  let rosEFO: number;
  if (expectedActiveGamesRemaining <= 0) {
    rosEFO = 0;
  } else {
    const firstActiveGameWeight = Math.min(expectedActiveGamesRemaining, 1);
    const laterActiveGames = Math.max(expectedActiveGamesRemaining - firstActiveGameWeight, 0);
    rosEFO =
      firstActiveGameWeight * currentActiveGame.activeGameFantasyPoints +
      laterActiveGames * fullWorkloadActiveGame.activeGameFantasyPoints;
  }

  return {
    probabilityActive,
    effectiveRamp,
    currentActiveGame,
    fullWorkloadActiveGame,
    weeklyEFO,
    expectedActiveGamesRemaining,
    rosEFO,
  };
}

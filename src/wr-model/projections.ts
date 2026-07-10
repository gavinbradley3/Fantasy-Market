// §26.10 Expected Fantasy Output — deterministic expected values (no Monte
// Carlo). Football-stat expectations are active-game-conditional; only weekly
// EFO, ROS EFO, and expected active games carry Pactive. One/Three/Dynasty EFO
// are deferred — composites only.

import {
  CATCH_BASE,
  CATCH_CLAMP,
  CATCH_DEPTH_COEF,
  CATCH_DEPTH_PIVOT,
  YPR_ADOT_COEF,
  YPR_CLAMP,
  YPR_INTERCEPT,
} from '@/wr-model/constants';
import { clamp } from '@/wr-model/math';
import type { ScoringVector } from '@/wr-model/types';

export interface ProjectionInputs {
  av: number; // Availability component 0–100
  teamDropbacks: number;
  rp4: number;
  shrunkTPRR: number;
  adot: number;
  shrunkCROE: number;
  shrunkDepthAdjYpt: number;
  xtdPerTarget: number;
  expectedGamesRemaining: number;
  scoring: ScoringVector;
}

export interface Projections {
  probabilityActive: number;
  expectedRoutes: number;
  expectedTargets: number;
  expectedCatchRate: number;
  expectedYardsPerReception: number;
  expectedReceptions: number;
  expectedReceivingYards: number;
  expectedReceivingTouchdowns: number;
  activeGameFantasyPoints: number;
  weeklyEFO: number;
  expectedActiveGamesRemaining: number;
  rosEFO: number;
}

export function computeProjections(p: ProjectionInputs): Projections {
  const probabilityActive = p.av / 100;

  const expectedRoutes = p.teamDropbacks * p.rp4;
  const expectedTargets = expectedRoutes * p.shrunkTPRR;

  const baseCatchRate = CATCH_BASE - CATCH_DEPTH_COEF * Math.max(p.adot - CATCH_DEPTH_PIVOT, 0);
  const expectedCatchRate = clamp(baseCatchRate + p.shrunkCROE, CATCH_CLAMP[0], CATCH_CLAMP[1]);

  const expectedYardsPerReception = clamp(
    YPR_INTERCEPT + YPR_ADOT_COEF * p.adot + p.shrunkDepthAdjYpt,
    YPR_CLAMP[0],
    YPR_CLAMP[1],
  );

  const expectedReceptions = expectedTargets * expectedCatchRate;
  const expectedReceivingYards = expectedReceptions * expectedYardsPerReception;
  const expectedReceivingTouchdowns = expectedTargets * p.xtdPerTarget;

  const activeGameFantasyPoints =
    expectedReceptions * p.scoring.points_per_reception +
    expectedReceivingYards * p.scoring.points_per_receiving_yard +
    expectedReceivingTouchdowns * p.scoring.points_per_receiving_td;

  const weeklyEFO = probabilityActive * activeGameFantasyPoints;

  const expectedActiveGamesRemaining = p.expectedGamesRemaining * probabilityActive;
  const rosEFO = expectedActiveGamesRemaining * activeGameFantasyPoints;

  return {
    probabilityActive,
    expectedRoutes,
    expectedTargets,
    expectedCatchRate,
    expectedYardsPerReception,
    expectedReceptions,
    expectedReceivingYards,
    expectedReceivingTouchdowns,
    activeGameFantasyPoints,
    weeklyEFO,
    expectedActiveGamesRemaining,
    rosEFO,
  };
}

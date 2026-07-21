// Readiness-frontier analysis (pure, deterministic). Turns per-player readiness
// missing-field lists into player-level counterfactuals: how many players become
// READY if a given set of field categories were solved — WITHOUT fabricating any
// numeric value or running an engine. "Solved" means "treat this field as present
// for the readiness completeness check".
//
// The whole point (task): a stage that removes many FIELDS can still unlock ZERO
// PLAYERS if each player retains one unsolved final blocker. This module measures
// players, not fields.

import type { ReadinessSummary, MissingRequirement } from '@/pipeline/readiness/engineReadiness';
import type { SupportedPosition } from '@/pipeline/types';
import { SUPPORTED_POSITIONS } from '@/pipeline/types';
import {
  classifyField,
  type AvailabilityClass,
  type FieldClassification,
  type ReadinessStage,
} from '@/pipeline/readiness-audit/classifier';

// Counterfactual scenarios. Each decides whether a classified missing field is
// treated as solved. Order is stable for deterministic reporting.
export type ScenarioId =
  | 'CURRENT'
  | 'STATS_FREE'
  | 'CONTEXT_ONLY'
  | 'PROJECTIONS_ONLY'
  | 'CONTEXT_PLUS_PROJECTIONS'
  | 'ALL_FREE_SOLVABLE'
  | 'FREE_PLUS_SPEC_FALLBACK'
  | 'AUTHORED_SUPPLEMENT';

export const SCENARIOS: readonly ScenarioId[] = [
  'CURRENT',
  'STATS_FREE',
  'CONTEXT_ONLY',
  'PROJECTIONS_ONLY',
  'CONTEXT_PLUS_PROJECTIONS',
  'ALL_FREE_SOLVABLE',
  'FREE_PLUS_SPEC_FALLBACK',
  'AUTHORED_SUPPLEMENT',
];

interface ClassifiedBlocker {
  readonly field: string;
  readonly stage: ReadinessStage;
  readonly classification: FieldClassification;
}

function fieldSolved(scenario: ScenarioId, b: ClassifiedBlocker): boolean {
  const { stage, classification: c } = b;
  switch (scenario) {
    case 'CURRENT':
      return false;
    case 'STATS_FREE':
      return stage === 'stats' && c.freeSolvable;
    case 'CONTEXT_ONLY':
      return stage === 'context';
    case 'PROJECTIONS_ONLY':
      return stage === 'projections';
    case 'CONTEXT_PLUS_PROJECTIONS':
      return stage === 'context' || stage === 'projections';
    case 'ALL_FREE_SOLVABLE':
      return c.freeSolvable;
    case 'FREE_PLUS_SPEC_FALLBACK':
      return c.freeSolvable || c.specFallback;
    case 'AUTHORED_SUPPLEMENT':
      return c.availability !== 'UNKNOWN';
  }
}

export interface PlayerFrontier {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly status: ReadinessSummary['status'];
  readonly currentBlockers: readonly string[];
  readonly minimumFieldsToReady: number;
  readonly blockingStages: readonly ReadinessStage[];
  readonly readyAfter: Readonly<Record<ScenarioId, boolean>>;
  /** Blockers still unsolved after context + projections (the true final wall). */
  readonly finalBlockersAfterContextProjections: readonly string[];
}

export interface PositionSummary {
  readonly position: SupportedPosition;
  readonly playersAssessed: number;
  readonly currentlyReady: number;
  readonly readyAfter: Readonly<Record<ScenarioId, number>>;
  /** Not ready even with an authored supplement (should be 0 unless UNKNOWN fields). */
  readonly stillBlockedAfterAuthored: number;
}

export interface FieldCriticality {
  readonly field: string;
  readonly stage: ReadinessStage;
  readonly position: SupportedPosition;
  readonly playersBlocked: number;
  readonly availability: AvailabilityClass;
  readonly freeSolvable: boolean;
  readonly specFallback: boolean;
}

export interface FrontierReport {
  readonly generatedAt: string;
  readonly playersAssessed: number;
  readonly currentlyReady: number;
  readonly scenarioReadyCounts: Readonly<Record<ScenarioId, number>>;
  readonly players: readonly PlayerFrontier[];
  readonly positionSummaries: readonly PositionSummary[];
  /** Fields blocking EVERY not-ready player of a position (universal blockers). */
  readonly universalBlockersByPosition: Readonly<Record<SupportedPosition, readonly string[]>>;
  readonly mostFrequentBlockers: readonly { field: string; players: number }[];
  /** Distinct blocker-set signatures and how many players share each. */
  readonly blockerCombinations: readonly { fields: readonly string[]; players: number }[];
  readonly fieldCriticality: readonly FieldCriticality[];
  /** Fields still blocking someone after context + projections are solved. */
  readonly finalBlockersAfterContextProjections: readonly string[];
}

function stageOf(m: MissingRequirement): ReadinessStage {
  return m.suppliedBy as ReadinessStage;
}

function classify(position: SupportedPosition, m: MissingRequirement): ClassifiedBlocker {
  const stage = stageOf(m);
  return { field: m.field, stage, classification: classifyField(position, stage, m.field) };
}

function emptyScenarioCounts(): Record<ScenarioId, number> {
  const out = {} as Record<ScenarioId, number>;
  for (const s of SCENARIOS) out[s] = 0;
  return out;
}

export function computeFrontier(
  readiness: readonly ReadinessSummary[],
  generatedAt: string,
): FrontierReport {
  const players: PlayerFrontier[] = [];

  for (const r of readiness) {
    const blockers = r.missing.map((m) => classify(r.position, m));
    const currentBlockers = [...new Set(blockers.map((b) => b.field))].sort();
    const blockingStages = [...new Set(blockers.map((b) => b.stage))].sort() as ReadinessStage[];

    const readyAfter = {} as Record<ScenarioId, boolean>;
    for (const s of SCENARIOS) {
      readyAfter[s] =
        r.status === 'READY' || (r.status === 'NOT_READY' && blockers.every((b) => fieldSolved(s, b)));
    }
    const finalAfterBoth = blockers
      .filter((b) => !fieldSolved('CONTEXT_PLUS_PROJECTIONS', b))
      .map((b) => b.field)
      .sort();

    players.push({
      canonicalId: r.canonicalId,
      position: r.position,
      status: r.status,
      currentBlockers,
      minimumFieldsToReady: currentBlockers.length,
      blockingStages,
      readyAfter,
      finalBlockersAfterContextProjections: [...new Set(finalAfterBoth)],
    });
  }
  players.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  // Scenario ready counts (players).
  const scenarioReadyCounts = emptyScenarioCounts();
  for (const p of players) for (const s of SCENARIOS) if (p.readyAfter[s]) scenarioReadyCounts[s] += 1;

  // Position summaries.
  const positionSummaries: PositionSummary[] = [];
  const universalBlockersByPosition = {} as Record<SupportedPosition, readonly string[]>;
  for (const pos of SUPPORTED_POSITIONS) {
    const group = players.filter((p) => p.position === pos);
    const readyAfter = emptyScenarioCounts();
    for (const p of group) for (const s of SCENARIOS) if (p.readyAfter[s]) readyAfter[s] += 1;
    positionSummaries.push({
      position: pos,
      playersAssessed: group.length,
      currentlyReady: group.filter((p) => p.status === 'READY').length,
      readyAfter,
      stillBlockedAfterAuthored: group.filter((p) => !p.readyAfter.AUTHORED_SUPPLEMENT).length,
    });
    // Universal blockers: fields blocking every NOT_READY player of the position.
    const notReady = group.filter((p) => p.status === 'NOT_READY');
    if (notReady.length === 0) {
      universalBlockersByPosition[pos] = [];
    } else {
      const common = notReady
        .map((p) => new Set(p.currentBlockers))
        .reduce((acc, set) => new Set([...acc].filter((f) => set.has(f))));
      universalBlockersByPosition[pos] = [...common].sort();
    }
  }

  // Blocker frequency + combinations.
  const blockerCounts = new Map<string, number>();
  const comboCounts = new Map<string, { fields: readonly string[]; players: number }>();
  for (const p of players) {
    if (p.status !== 'NOT_READY') continue;
    for (const f of p.currentBlockers) blockerCounts.set(f, (blockerCounts.get(f) ?? 0) + 1);
    const sig = p.currentBlockers.join('|');
    const c = comboCounts.get(sig);
    if (c) c.players += 1;
    else comboCounts.set(sig, { fields: p.currentBlockers, players: 1 });
  }
  const mostFrequentBlockers = [...blockerCounts.entries()]
    .map(([field, playersN]) => ({ field, players: playersN }))
    .sort((a, b) => (b.players !== a.players ? b.players - a.players : a.field.localeCompare(b.field)));
  const blockerCombinations = [...comboCounts.values()]
    .sort((a, b) => (b.players !== a.players ? b.players - a.players : a.fields.join('|').localeCompare(b.fields.join('|'))));

  // Field criticality matrix (per position+field).
  const critMap = new Map<string, FieldCriticality>();
  for (const r of readiness) {
    if (r.status !== 'NOT_READY') continue;
    for (const m of r.missing) {
      const stage = stageOf(m);
      const cls = classifyField(r.position, stage, m.field);
      const key = `${r.position}|${m.field}`;
      const existing = critMap.get(key);
      if (existing) {
        critMap.set(key, { ...existing, playersBlocked: existing.playersBlocked + 1 });
      } else {
        critMap.set(key, {
          field: m.field,
          stage,
          position: r.position,
          playersBlocked: 1,
          availability: cls.availability,
          freeSolvable: cls.freeSolvable,
          specFallback: cls.specFallback,
        });
      }
    }
  }
  const fieldCriticality = [...critMap.values()].sort((a, b) =>
    a.position !== b.position
      ? a.position.localeCompare(b.position)
      : b.playersBlocked !== a.playersBlocked
        ? b.playersBlocked - a.playersBlocked
        : a.field.localeCompare(b.field),
  );

  const finalBlockersAfterContextProjections = [
    ...new Set(players.flatMap((p) => p.finalBlockersAfterContextProjections)),
  ].sort();

  return {
    generatedAt,
    playersAssessed: players.length,
    currentlyReady: players.filter((p) => p.status === 'READY').length,
    scenarioReadyCounts,
    players,
    positionSummaries,
    universalBlockersByPosition,
    mostFrequentBlockers,
    blockerCombinations,
    fieldCriticality,
    finalBlockersAfterContextProjections,
  };
}

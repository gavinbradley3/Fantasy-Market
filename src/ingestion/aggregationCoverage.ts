import type { ObservedAggregationCoverage } from '@/accessible/production';
import { betaTargetShare, type AggregationOptions } from './aggregationPolicy';
import { windowsFor } from './observedFacts';
import { roleWindowGames } from './observedProduction';
import type { GameStatRecord, NormalizedPosition } from './types';

/** Audit the fields actually consumed by the position, without changing any model formula. */
export function aggregationCoverage(
  position: NormalizedPosition,
  games: readonly GameStatRecord[],
  options: AggregationOptions,
): ObservedAggregationCoverage {
  const { career, recent } = windowsFor(games);
  const role = roleWindowGames(games);
  const issues: ObservedAggregationCoverage['issues'][number][] = [];
  const inspect = (window: string, rows: readonly GameStatRecord[], fields: readonly (keyof GameStatRecord)[]) => {
    for (const field of fields) {
      const absent = rows.filter((g) => typeof g[field] !== 'number' || !Number.isFinite(g[field]));
      if (!absent.length) continue;
      issues.push({ code: absent.length === rows.length ? 'UNOBSERVED_WINDOW_COLUMN' : 'PARTIAL_WINDOW_COLUMN',
        window, field, totalGames: rows.length, observedGames: rows.length - absent.length,
        unavailableGameIds: [...new Set(absent.map((g) => g.gameId))].sort() });
    }
  };
  if (position === 'QB') {
    inspect('career', career, ['passAttempts', 'carries', 'passingYards', 'passingTds', 'interceptions', 'rushingYards']);
    inspect('recent', recent, ['passAttempts', 'completions', 'passingYards', 'passingTds', 'interceptions', 'sacks', 'carries', 'rushingYards', 'rushingTds']);
  } else {
    const fields: (keyof GameStatRecord)[] = ['targets', 'receptions', 'receivingYards', 'receivingTds'];
    if (position === 'RB') fields.push('carries', 'rushingYards', 'rushingTds');
    inspect('career', career, fields);
    inspect('role', role, position === 'WR' ? [...fields, 'receivingAirYards'] : fields);
    const seasons = [...new Set(career.map((g) => g.season))].sort((a, b) => b - a).slice(0, 2);
    for (const [index, season] of seasons.entries()) {
      inspect(index === 0 ? 'latestSeason' : 'priorSeason', career.filter((g) => g.season === season),
        position === 'RB' ? ['carries', 'receptions'] : ['targets']);
    }
    if (position === 'WR') {
      const coverage = betaTargetShare(role, options);
      for (const [code, ids] of [
        ['TARGET_DENOMINATOR_UNAVAILABLE', coverage.missingGameIds],
        ['TARGET_DENOMINATOR_CONFLICT', coverage.conflictingGameIds],
      ] as const) {
        if (ids.length) issues.push({ code, window: 'role', field: 'targetShare', totalGames: role.length,
          observedGames: role.length - coverage.missingGameIds.length - coverage.conflictingGameIds.length,
          unavailableGameIds: ids });
      }
    }
  }
  return { policyVersion: options.policy, numericalEvidenceComplete: issues.length === 0, issues };
}

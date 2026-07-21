// Coverage analysis — the guard that prevents partial career data from
// masquerading as a full-career value. A player's `career_routes` proxy is
// COMPLETE only when the entire required horizon (career start → as-of season)
// falls inside the source's covered seasons.

import type { CoverageInfo } from '@/pipeline/participation/types';

export interface CoverageInput {
  readonly careerStartSeason: number | null; // rookie/draft year
  readonly asOfSeason: number;
  readonly coveredSeasons: readonly number[]; // e.g. 2016..2023
  readonly coveredGames: number;
  readonly playerSeasons: readonly number[]; // seasons the player appears in the feed
}

export function computeCoverage(input: CoverageInput): CoverageInfo {
  const covered = [...input.coveredSeasons].sort((a, b) => a - b);
  const minCovered = covered.length > 0 ? covered[0] : null;
  const maxCovered = covered.length > 0 ? covered[covered.length - 1] : null;
  const seasons = [...input.playerSeasons].sort((a, b) => a - b);
  const firstCoveredSeason = seasons.length > 0 ? seasons[0] : null;
  const lastCoveredSeason = seasons.length > 0 ? seasons[seasons.length - 1] : null;

  const base = {
    firstCoveredSeason,
    lastCoveredSeason,
    coveredGames: input.coveredGames,
    careerStartSeason: input.careerStartSeason,
    asOfSeason: input.asOfSeason,
  };

  if (input.coveredGames === 0 || minCovered === null || maxCovered === null) {
    return { ...base, state: 'UNAVAILABLE', reason: 'no covered participation for this player' };
  }
  if (input.careerStartSeason === null) {
    return { ...base, state: 'PARTIAL', reason: 'career start season unknown — cannot prove full-career coverage' };
  }
  const careerStartCovered = input.careerStartSeason >= minCovered;
  const asOfCovered = input.asOfSeason <= maxCovered;
  if (careerStartCovered && asOfCovered) {
    return { ...base, state: 'COMPLETE' };
  }
  const why: string[] = [];
  if (!careerStartCovered) why.push(`career began ${input.careerStartSeason} before coverage (${minCovered})`);
  if (!asOfCovered) why.push(`as-of ${input.asOfSeason} beyond coverage (${maxCovered})`);
  return { ...base, state: 'PARTIAL', reason: why.join('; ') };
}

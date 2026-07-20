// Deterministic aggregation of snap records into snap-share windows. Pure fold
// over rows sorted by (season, week); order-independent. Snap share for a window
// is Σ player offensive snaps ÷ Σ reconstructed team offensive snaps (snaps-
// weighted), reconstructed exactly per week as offenseSnaps ÷ offensePct.

import type { SnapRecord, SnapWindow, SnapWindowAggregate } from '@/pipeline/snaps/types';

export interface SnapAggregateConfig {
  readonly currentSeason: number;
}

function fold(rows: readonly SnapRecord[], window: SnapWindow): SnapWindowAggregate {
  const seasons = new Set<number>();
  let games = 0;
  let offenseSnaps = 0;
  let teamSnaps = 0;
  let shareWeeks = 0;
  for (const r of rows) {
    seasons.add(r.season);
    games += 1;
    offenseSnaps += r.offenseSnaps;
    if (r.offensePct !== null && r.offensePct > 0 && r.offenseSnaps > 0) {
      teamSnaps += r.offenseSnaps / r.offensePct;
      shareWeeks += 1;
    }
  }
  return {
    window,
    games,
    seasons: [...seasons].sort((a, b) => a - b),
    offenseSnaps,
    teamOffenseSnaps: shareWeeks > 0 ? teamSnaps : null,
    shareWeeks,
  };
}

function sortChrono(rows: readonly SnapRecord[]): SnapRecord[] {
  return [...rows].sort((a, b) => (a.season !== b.season ? a.season - b.season : a.week - b.week));
}

export function aggregateSnapWindows(
  rows: readonly SnapRecord[],
  cfg: SnapAggregateConfig,
): Record<SnapWindow, SnapWindowAggregate> {
  const chrono = sortChrono(rows);
  const upToCurrent = chrono.filter((r) => r.season <= cfg.currentSeason);
  const newestFirst = [...upToCurrent].reverse();
  return {
    CURRENT_SEASON: fold(chrono.filter((r) => r.season === cfg.currentSeason), 'CURRENT_SEASON'),
    PREVIOUS_SEASON: fold(chrono.filter((r) => r.season === cfg.currentSeason - 1), 'PREVIOUS_SEASON'),
    LAST_4: fold(newestFirst.slice(0, 4), 'LAST_4'),
    LAST_8: fold(newestFirst.slice(0, 8), 'LAST_8'),
  };
}

/** Snap share for a window: Σ snaps ÷ Σ team snaps; null below a minimum sample. */
export function snapShare(a: SnapWindowAggregate, minTeamSnaps = 1): number | null {
  if (a.teamOffenseSnaps === null) return null;
  if (a.teamOffenseSnaps < minTeamSnaps || a.teamOffenseSnaps <= 0) return null;
  const share = a.offenseSnaps / a.teamOffenseSnaps;
  return Number.isFinite(share) ? share : null;
}

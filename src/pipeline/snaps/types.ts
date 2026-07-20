// Provider-neutral snap-count / participation types.
//
// A SnapRecord is one player's participation line for one game-week: total
// offensive snaps and the offensive snap SHARE (offense_pct). nflverse
// snap-count rows never travel past the adapter. Team offensive snaps are
// recovered exactly from `offense_snaps ÷ offense_pct` (no reconstruction guess).
//
// Counting values (offensive snaps) default to 0 only for a row that exists;
// the share is `number | null` — a missing share is never 0.

import type { SupportedPosition } from '@/pipeline/types';

export type SeasonType = 'REG' | 'POST';
export type SnapPosition = SupportedPosition | 'OTHER';

export interface SnapRecord {
  readonly gsis: string; // strong join key (post-crosswalk from PFR upstream)
  readonly playerName?: string;
  readonly position: SnapPosition;
  readonly team?: string;
  readonly season: number;
  readonly week: number;
  readonly seasonType: SeasonType;
  /** Player offensive snaps this game (direct). */
  readonly offenseSnaps: number;
  /** Offensive snap share = player snaps ÷ team snaps (direct; nflverse offense_pct). */
  readonly offensePct: number | null;
}

// Windows the engines reason over for snap share. Snap-share fields the engines
// consume are trailing-game and previous-season, so those are the windows built.
export type SnapWindow = 'CURRENT_SEASON' | 'PREVIOUS_SEASON' | 'LAST_4' | 'LAST_8';

export const SNAP_WINDOWS: readonly SnapWindow[] = [
  'CURRENT_SEASON',
  'PREVIOUS_SEASON',
  'LAST_4',
  'LAST_8',
];

// Window aggregate: summed player snaps and summed reconstructed team snaps, so
// snap share = Σ player snaps ÷ Σ team snaps (snaps-weighted, deterministic).
export interface SnapWindowAggregate {
  readonly window: SnapWindow;
  readonly games: number;
  readonly seasons: readonly number[];
  readonly offenseSnaps: number;
  /** Σ (offenseSnaps ÷ offensePct) over weeks with a positive share; null if none. */
  readonly teamOffenseSnaps: number | null;
  readonly shareWeeks: number;
}

export interface PlayerSnapAggregate {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly gsis: string;
  readonly windows: Readonly<Record<SnapWindow, SnapWindowAggregate>>;
}

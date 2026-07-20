// Provider-neutral statistics types for the nflverse stats stage.
//
// A WeeklyStatRecord is one player's line for one game-week, already parsed and
// type-checked but not yet joined to a canonical identity or aggregated. nflverse
// column shapes never travel past the adapter — the rest of the pipeline sees
// only these neutral records and the aggregates derived from them.
//
// Counting stats are `number` and default to 0 (a player with a weekly row who
// had 0 carries genuinely had 0). Rate/share/air-yard fields the provider may
// omit are `number | null` — null means "not supplied", never 0.

import type { SupportedPosition } from '@/pipeline/types';

export type SeasonType = 'REG' | 'POST';

// Positions we retain from the stats feed. 'OTHER' keeps a parsed row that is a
// valid stat line but not one of the four valued positions (reported, not fed).
export type StatPosition = SupportedPosition | 'OTHER';

export interface WeeklyStatRecord {
  readonly gsis: string; // strong join key (nflverse player_id)
  readonly playerName?: string;
  readonly position: StatPosition;
  readonly team?: string;
  readonly season: number;
  readonly week: number;
  readonly seasonType: SeasonType;

  // Passing (counting)
  readonly completions: number;
  readonly attempts: number;
  readonly passingYards: number;
  readonly passingTds: number;
  readonly interceptions: number;
  readonly sacks: number;
  readonly sackYards: number;

  // Rushing (counting)
  readonly carries: number;
  readonly rushingYards: number;
  readonly rushingTds: number;

  // Receiving (counting)
  readonly receptions: number;
  readonly targets: number;
  readonly receivingYards: number;
  readonly receivingTds: number;

  // Provider-supplied auxiliaries that may be absent (null, never 0).
  readonly receivingAirYards: number | null;
  readonly receivingYardsAfterCatch: number | null;
  readonly targetShare: number | null; // player targets ÷ team targets, that week
}

// The historical windows the engines reason over (from the model specs).
export type StatWindow = 'CAREER' | 'CURRENT_SEASON' | 'PREVIOUS_SEASON' | 'LAST_4' | 'LAST_8';

export const STAT_WINDOWS: readonly StatWindow[] = [
  'CAREER',
  'CURRENT_SEASON',
  'PREVIOUS_SEASON',
  'LAST_4',
  'LAST_8',
];

// A window aggregate: summed counting stats plus the sample size and the
// reconstructed team-targets denominator used for target share. Every field is
// a plain sum computed deterministically; derived rates are computed on demand
// by the derived-stat registry, never stored pre-rounded here.
export interface WindowAggregate {
  readonly window: StatWindow;
  readonly games: number; // weekly rows in the window (games played)
  readonly seasons: readonly number[]; // seasons contributing, ascending

  readonly completions: number;
  readonly attempts: number;
  readonly passingYards: number;
  readonly passingTds: number;
  readonly interceptions: number;
  readonly sacks: number;
  readonly sackYards: number;

  readonly carries: number;
  readonly rushingYards: number;
  readonly rushingTds: number;

  readonly receptions: number;
  readonly targets: number;
  readonly receivingYards: number;
  readonly receivingTds: number;

  // Sums of provider auxiliaries over the weeks that supplied them, plus the
  // count of contributing weeks so a mean can be taken honestly.
  readonly receivingAirYards: number | null;
  readonly airYardsWeeks: number;
  readonly receivingYardsAfterCatch: number | null;
  readonly yacWeeks: number;
  // Reconstructed team targets (player targets ÷ target share) summed over the
  // weeks that supplied a positive share; drives window target share.
  readonly teamTargetsRecon: number | null;
  readonly targetShareWeeks: number;
}

// Per-canonical-player set of window aggregates for a single position.
export interface PlayerStatAggregate {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly gsis: string;
  readonly windows: Readonly<Record<StatWindow, WindowAggregate>>;
}

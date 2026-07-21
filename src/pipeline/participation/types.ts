// Provider-neutral participation types.
//
// A ParticipationPlay is one qualifying-or-not play with the offensive GSIS ids
// on the field. nflverse pbp-participation shapes never travel past the adapter.
// Coverage is first-class: a route proxy built from 2016–2023 participation must
// never masquerade as a full career for a player active beyond that window.

import type { SupportedPosition } from '@/pipeline/types';

export type SeasonType = 'REG' | 'POST';

export interface ParticipationPlay {
  readonly gameId: string;
  readonly playId: string;
  readonly season: number;
  readonly week: number;
  readonly seasonType: SeasonType;
  /** Possession (offensive) team for this play. */
  readonly offenseTeam: string;
  /** Distinct offensive GSIS ids on the field (deduped within the play). */
  readonly offensePlayers: readonly string[];
  /** True when the play is a qualifying dropback (see playQualification). */
  readonly isDropback: boolean;
  /** Personnel completeness: false when the offense_players list looked short. */
  readonly personnelComplete: boolean;
}

// Coverage of a player's REQUIRED horizon by the source.
export type CoverageState = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface CoverageInfo {
  readonly state: CoverageState;
  readonly firstCoveredSeason: number | null;
  readonly lastCoveredSeason: number | null;
  readonly coveredGames: number;
  readonly careerStartSeason: number | null;
  readonly asOfSeason: number;
  /** Why the horizon is not fully represented (when PARTIAL/UNAVAILABLE). */
  readonly reason?: string;
}

// Per-player participation aggregate over covered seasons up to the as-of season.
export interface PlayerParticipationAggregate {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly gsis: string;
  /** Qualifying pass-play (dropback) participations across covered games. */
  readonly qualifyingPassPlayParticipations: number;
  readonly coverage: CoverageInfo;
}

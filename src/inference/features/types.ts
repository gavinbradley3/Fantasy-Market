// Normalized inference-feature input records (SPEC §4, REGISTRY §20.F11).
//
// These are the provider-neutral, as-of-clamped fact records the Phase-2A
// extractors and models consume. They are the boundary the later live-pipeline
// integration (Phase 2B+) will populate; Phase 2A depends only on these shapes.

// SupportedPosition is defined once in `@/inference/types`; re-exported here for
// convenience so feature consumers have a single import site.
export type { SupportedPosition } from '@/inference/types';
import type { SupportedPosition } from '@/inference/types';

/** Roster membership state (REGISTRY §20.F10 inclusion list). */
export type RosterStatus =
  | 'ACTIVE'
  | 'IR'
  | 'PUP'
  | 'NFI'
  | 'SUSPENDED'
  | 'PRACTICE_SQUAD'
  | 'RESERVE'
  | 'FREE_AGENT';

export type SeasonType = 'REG' | 'POST';

/** Transaction event kinds used by REGISTRY §4.3 / §5.1 / §20.F11. */
export type TransactionType =
  | 'SIGN'
  | 'TRADE_IN'
  | 'TRADE_OUT'
  | 'WAIVED'
  | 'RELEASED'
  | 'BENCHED'
  | 'TRADE_BLOCK'
  | 'ACTIVATED'
  | 'IR_PLACED';

/** One roster snapshot entry for a player (per source timestamp / season). */
export interface RosterEntry {
  readonly canonicalId: string;
  readonly team: string;
  readonly position: SupportedPosition;
  readonly status: RosterStatus;
  readonly season: number;
  readonly draftRound: number | null; // 1..7 or null (UDFA/unknown)
  readonly sourceTimestamp: string;
  readonly snapshotId: string;
}

/** A confirmed transaction affecting a player (S9). */
export interface TransactionEvent {
  readonly canonicalId: string;
  readonly type: TransactionType;
  readonly team: string | null;
  readonly date: string; // event date (ISO)
  readonly sourceTimestamp: string;
}

/** A scheduled team game (S5). */
export interface ScheduleGame {
  readonly team: string;
  readonly gameId: string;
  readonly kickoff: string; // ISO
  readonly seasonType: SeasonType;
  readonly season: number;
}

/** A per-game usage row for a player (from weekly stats/snaps/participation). */
export interface PlayerGameUsage {
  readonly canonicalId: string;
  readonly team: string;
  readonly gameId: string;
  readonly kickoff: string; // ISO
  readonly season: number;
  readonly seasonType: SeasonType;
  readonly sourceTimestamp: string;
  readonly targetShare: number | null;
  readonly carryShare: number | null;
  readonly snapShare: number | null;
  readonly routeParticipation: number | null;
  readonly goalLineCarryShare: number | null;
  readonly adot: number | null;
  readonly tprr: number | null;
  readonly touches: number | null; // carries + receptions
  /** true when a qualifying pass-play participation row exists (WR route proxy). */
  readonly participationCovered: boolean;
}

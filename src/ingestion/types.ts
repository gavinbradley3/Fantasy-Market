// PlayerTicker — live-data ingestion & normalization layer (Phase 4).
//
// This module owns the boundary between EXTERNAL provider data and the frozen AIL.
// Providers adapt to PlayerTicker; PlayerTicker never adapts to a provider schema.
// The AIL (`runInference(NormalizedInferenceInput)`) never sees a provider name, a
// provider id, a provider field, pagination, or HTTP — only NORMALIZED records.
//
// Everything here is deterministic, replayable, and provider-independent. No wall
// clock, no randomness, no network is read inside normalization; adapters receive
// already-fetched raw payloads (the fetch transport is a later, separable concern).

// ============================================================================
// Providers & capabilities (describe capabilities, not vendors)
// ============================================================================

/** Ingestion-layer provider identifier (broader than the canonical ProviderId). */
export type IngestionProvider =
  | 'nflverse'
  | 'sleeper'
  | 'espn'
  | 'fantasypros'
  | 'pfr'
  | 'stathead'
  | 'pff'
  | 'manual';

/** A capability a provider may advertise (the AIL consumes capabilities, not vendors). */
export type Capability =
  | 'identity'
  | 'roster'
  | 'team'
  | 'schedule'
  | 'games'
  | 'playByPlay'
  | 'participation'
  | 'injuries'
  | 'availability'
  | 'transactions'
  | 'officialStarts'
  | 'projections'
  | 'depthCharts';

/** Deterministic freshness metadata attached to every normalized record. */
export interface FreshnessMeta {
  readonly provider: IngestionProvider;
  /** When the raw payload was captured (ISO). Injected, never Date.now(). */
  readonly fetchedAt: string;
  /** The date/window the data is effective for (ISO). */
  readonly effectiveDate: string;
  /** Provider's own last-updated stamp (ISO), when available. */
  readonly lastUpdated: string | null;
  /** Provider schema/dataset version, when available. */
  readonly sourceVersion: string | null;
}

/** The provider id an adapter used to LINK a record to a player (resolved later). */
export interface ProviderRef {
  readonly key: string; // e.g. "gsis" | "sleeper"
  readonly value: string;
}

/** Base of every normalized record: a canonical player key + freshness. */
export interface NormalizedRecordBase {
  /** Canonical PlayerTicker id (filled by the identity layer); null until resolved. */
  readonly canonicalId: string | null;
  /** Provider id used for identity linkage (adapters set this; identity resolves it). */
  readonly providerRef: ProviderRef;
  readonly freshness: FreshnessMeta;
  /** The source timestamp the AIL uses for as-of clamping (= effectiveDate). */
  readonly sourceTimestamp: string;
}

// ============================================================================
// Normalized (provider-neutral) records
// ============================================================================

export type NormalizedPosition = 'QB' | 'RB' | 'WR' | 'TE';
export type NormalizedStatus = 'active' | 'injured' | 'suspended' | 'inactive';
export type NormalizedInjuryStatus =
  | 'HEALTHY'
  | 'QUESTIONABLE'
  | 'DOUBTFUL'
  | 'OUT'
  | 'IR'
  | 'PUP'
  | 'SUSPENDED'
  | 'UNKNOWN';
export type NormalizedPractice = 'FULL' | 'LIMITED' | 'DNP' | 'UNKNOWN';

/** Provider-neutral player identity/metadata record. */
export interface PlayerRecord extends NormalizedRecordBase {
  readonly providerIds: Readonly<Record<string, string>>; // e.g. { gsis, sleeper, espn, pfr }
  readonly nameNormalized: string;
  readonly position: NormalizedPosition | null;
  readonly team: string | null; // canonical team abbrev
  readonly age: number | null;
  readonly nflSeasonsCompleted: number | null;
  readonly draftRound: number | null;
  readonly status: NormalizedStatus | null;
  readonly injuryDesignation: string | null;
}

/** One roster membership snapshot (per team, per season/week). */
export interface RosterRecord extends NormalizedRecordBase {
  readonly team: string;
  readonly season: number;
  readonly position: NormalizedPosition | null;
  readonly rosterStatus: 'ACTIVE' | 'IR' | 'PUP' | 'NFI' | 'SUSPENDED' | 'PRACTICE_SQUAD' | 'RESERVE';
}

export interface ScheduleGameRecord extends NormalizedRecordBase {
  readonly gameId: string;
  readonly season: number;
  readonly week: number;
  readonly seasonType: 'REG' | 'POST' | 'PRE';
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoff: string; // ISO
}

/** Per-game player stat line (regular season unless seasonType says otherwise). */
export interface GameStatRecord extends NormalizedRecordBase {
  readonly gameId: string;
  readonly kickoff: string;
  readonly season: number;
  readonly seasonType: 'REG' | 'POST' | 'PRE';
  readonly team: string;
  readonly passAttempts: number | null;
  readonly carries: number | null;
  readonly targets: number | null;
  readonly snaps: number | null;
  readonly teamSnaps: number | null;
  readonly qbSnapShare: number | null;
}

/** Route/participation record (paid/limited coverage; drives WR/RB proxies). */
export interface ParticipationRecord extends NormalizedRecordBase {
  readonly gameId: string;
  readonly kickoff: string;
  readonly passPlaySnaps: number | null;
  readonly teamDropbacks: number | null;
  readonly covered: boolean; // true = charted era (≤2023)
}

export interface InjuryRecord extends NormalizedRecordBase {
  readonly injuryStatus: NormalizedInjuryStatus;
  readonly practiceStatus: NormalizedPractice;
}

export interface TransactionRecord extends NormalizedRecordBase {
  readonly type: 'SIGN' | 'TRADE_IN' | 'TRADE_OUT' | 'WAIVE' | 'ACTIVATE' | 'IR' | 'BENCH' | 'SUSPEND';
  readonly team: string | null;
  readonly date: string; // ISO
}

export interface OfficialStartRecord extends NormalizedRecordBase {
  readonly gameId: string;
  readonly started: boolean;
}

export interface DepthChartRecord extends NormalizedRecordBase {
  readonly team: string;
  readonly position: NormalizedPosition;
  readonly rank: number; // 1 = starter
}

// ============================================================================
// Diagnostics & errors (never affect deterministic outputs)
// ============================================================================

export type IngestionWarningCode =
  | 'UNRESOLVED_IDENTITY'
  | 'DUPLICATE_IDENTITY'
  | 'IDENTITY_CONFLICT'
  | 'UNKNOWN_ENUM'
  | 'UNSUPPORTED_POSITION'
  | 'MISSING_TIMESTAMP'
  | 'FUTURE_RECORD_DROPPED'
  | 'STALE_RECORD'
  | 'DISCARDED_MALFORMED'
  | 'SOURCE_CONFLICT'
  | 'UNSUPPORTED_FIELD';

export interface IngestionWarning {
  readonly code: IngestionWarningCode;
  readonly provider: IngestionProvider;
  readonly detail: string;
}

export interface IngestionDiagnostics {
  readonly providersUsed: readonly IngestionProvider[];
  readonly warnings: readonly IngestionWarning[];
  readonly discardedCount: number;
}

/** All ingestion failures are typed; no provider exception escapes into the AIL. */
export class IngestionError extends Error {
  readonly code: IngestionWarningCode | 'ADAPTER_FAILURE';
  constructor(code: IngestionError['code'], message: string) {
    super(message);
    this.name = 'IngestionError';
    this.code = code;
  }
}

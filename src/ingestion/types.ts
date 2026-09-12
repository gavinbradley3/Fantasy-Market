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
  /**
   * WHICH PROVIDER SUPPLIED EACH FIELD, and when it attested it.
   *
   * After a multi-provider merge a record's fields no longer share one provider or one
   * timestamp: biography comes from the most authoritative source and time-varying facts from
   * the most recent one. A single record-level provider label is then a false claim about most
   * of the record — it reported `status=DIRECT/sleeper` for 196 players whose status had come
   * from an nflverse weekly roster row, because Sleeper had won the merge and relabelled it.
   *
   * A provider may not claim another provider's field. This map is how the canonical record
   * knows the difference. Absent on a single-provider record, where every field trivially comes
   * from that record's own provider and timestamp.
   */
  readonly fieldSources?: Readonly<Partial<Record<MergedFieldKey, FieldSource>>>;
}

/** The merged scalar fields that carry independent provenance. */
export type MergedFieldKey =
  | 'nameNormalized'
  | 'position'
  | 'age'
  | 'nflSeasonsCompleted'
  | 'draftRound'
  | 'team'
  | 'status'
  | 'injuryDesignation';

/** Who supplied one field's value, and when they attested it. */
export interface FieldSource {
  readonly provider: IngestionProvider;
  readonly sourceTimestamp: string;
}

/** One roster membership snapshot (per team, per season/week). */
/**
 * One roster membership snapshot.
 *
 * `week` is what makes this record HISTORICAL rather than a current-state snapshot: a weekly
 * roster resource states which team a player was on, and in what status, during a specific
 * week. When the provider supplies it, `sourceTimestamp` is that week's boundary, so as-of
 * clamping can answer "where was this player in February" instead of "where is he now".
 * A season-level roster resource supplies no week and is timestamped by the source's
 * effective date as before.
 */
export interface RosterRecord extends NormalizedRecordBase {
  readonly team: string;
  readonly season: number;
  /** Week within the season, when the provider publishes weekly rosters; else null. */
  readonly week: number | null;
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
  // Box-score counting columns the provider's weekly player-stats resource already
  // publishes alongside the ones above (see src/pipeline/stats/nflverse/weeklySchema.ts).
  // They are carried verbatim — no derivation happens at ingestion — so that the evidence
  // builder can aggregate real career/recent windows instead of leaving those engine
  // inputs undecided. A provider that omits a column yields null, never 0.
  readonly completions: number | null;
  readonly passingYards: number | null;
  readonly passingTds: number | null;
  readonly interceptions: number | null;
  readonly sacks: number | null;
  readonly rushingYards: number | null;
  readonly rushingTds: number | null;
  readonly receptions: number | null;
  readonly receivingYards: number | null;
  readonly receivingTds: number | null;
  /**
   * Receiving air yards for the game — the depth signal `average_depth_of_target` divides by
   * targets. Published by nflverse in the same weekly export as the columns above (100%
   * populated across the 2025 release), and carried verbatim like them.
   */
  readonly receivingAirYards: number | null;
  /**
   * The PROVIDER'S OWN weekly target share for this player, verbatim.
   *
   * Kept rather than reconstructed because it comes with the provider's real team-target
   * denominator. PlayerTicker's `buildTeamGameTotals` can only sum the players the snapshot
   * holds rows for, which is a floor — so a share derived from it is an upper bound, while
   * this one is the provider's measurement.
   */
  readonly targetShare: number | null;
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

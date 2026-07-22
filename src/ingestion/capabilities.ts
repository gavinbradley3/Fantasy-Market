// Provider adapter capability interfaces (Phase 4 §1/§2).
//
// A provider adapter NORMALIZES already-fetched raw payloads into provider-neutral
// records. It never performs inference and never reaches the AIL directly. Each
// capability is optional; a provider advertises only what it can supply. All methods
// are pure: (rawPayload, freshness) → { records, warnings }. Parsing/validation/enum
// normalization happen here; malformed rows are discarded with a warning, never thrown
// into the pipeline.

import type {
  Capability,
  DepthChartRecord,
  FreshnessMeta,
  GameStatRecord,
  IngestionProvider,
  IngestionWarning,
  InjuryRecord,
  OfficialStartRecord,
  ParticipationRecord,
  PlayerRecord,
  RosterRecord,
  ScheduleGameRecord,
  TransactionRecord,
} from './types';

/** Normalized output of a capability call: records + non-fatal warnings. */
export interface NormalizeResult<T> {
  readonly records: readonly T[];
  readonly warnings: readonly IngestionWarning[];
}

/**
 * A provider adapter. `provider` and `capabilities` are declarative; the normalize
 * methods present for the advertised capabilities turn raw payloads into normalized
 * records. Raw payloads are typed `unknown` — the adapter validates them.
 */
export interface ProviderAdapter {
  readonly provider: IngestionProvider;
  readonly capabilities: ReadonlySet<Capability>;

  normalizeIdentity?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<PlayerRecord>;
  normalizeRoster?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<RosterRecord>;
  normalizeSchedule?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<ScheduleGameRecord>;
  normalizeGames?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<GameStatRecord>;
  normalizeParticipation?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<ParticipationRecord>;
  normalizeInjuries?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<InjuryRecord>;
  normalizeTransactions?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<TransactionRecord>;
  normalizeOfficialStarts?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<OfficialStartRecord>;
  normalizeDepthCharts?(raw: unknown, freshness: FreshnessMeta): NormalizeResult<DepthChartRecord>;
}

export function hasCapability(adapter: ProviderAdapter, capability: Capability): boolean {
  return adapter.capabilities.has(capability);
}

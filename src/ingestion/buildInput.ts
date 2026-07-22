// Ingestion pipeline + NormalizedInferenceInput builder (Phase 4 §8).
//
//   Provider payloads → adapters → normalized records → snapshot (identity-linked,
//   ordered, reproducible) → evidence builder → NormalizedInferenceInput → runInference
//
// This is the ONLY place a `NormalizedInferenceInput` is assembled. The AIL entry
// point (`runInference`) is imported for the end-to-end convenience wrapper but is
// never modified.

import type { NormalizedInferenceInput } from '@/inference/production/types';
import type { SupportedPosition } from '@/inference/types';
import type { Capability, IngestionDiagnostics, IngestionProvider, IngestionWarning } from './types';
import type { ProviderAdapter } from './capabilities';
import { IdentityResolver } from './identity';
import { buildSnapshot, mergeCollections, type NormalizedCollections, type NormalizedSnapshot } from './snapshot';
import { buildEvidenceFor } from './evidence';
import { compareOrdinal } from './ordering';

/** A provider's already-fetched raw payloads, keyed by capability. */
export interface ProviderSource {
  readonly adapter: ProviderAdapter;
  readonly freshness: import('./types').FreshnessMeta;
  readonly payloads: Partial<Record<Capability, unknown>>;
}

export interface IngestOptions {
  /** Seed identity mappings (canonicalId ↔ provider ids) for deterministic resolution. */
  readonly identitySeed?: readonly { canonicalId: string; providerIds: Readonly<Record<string, string>> }[];
}

export interface IngestResult {
  readonly snapshot: NormalizedSnapshot;
  readonly diagnostics: IngestionDiagnostics;
}

const CAPABILITY_METHOD: Record<Capability, keyof ProviderAdapter> = {
  identity: 'normalizeIdentity',
  roster: 'normalizeRoster',
  team: 'normalizeRoster', // team membership derives from roster in the reference set
  schedule: 'normalizeSchedule',
  games: 'normalizeGames',
  playByPlay: 'normalizeParticipation',
  participation: 'normalizeParticipation',
  injuries: 'normalizeInjuries',
  availability: 'normalizeInjuries',
  transactions: 'normalizeTransactions',
  officialStarts: 'normalizeOfficialStarts',
  projections: 'normalizeGames', // reference adapters carry projections via game stats
  depthCharts: 'normalizeDepthCharts',
};

const CAPABILITY_TO_COLLECTION: Partial<Record<Capability, keyof NormalizedCollections>> = {
  identity: 'players',
  roster: 'rosters',
  schedule: 'schedule',
  games: 'games',
  participation: 'participation',
  injuries: 'injuries',
  transactions: 'transactions',
  officialStarts: 'officialStarts',
  depthCharts: 'depthCharts',
};

/**
 * Run every provider adapter over its raw payloads, normalize, resolve identity, and
 * build the immutable snapshot. No provider exception escapes: an adapter throw is
 * captured as an ADAPTER_FAILURE warning and that capability is skipped.
 */
export function ingest(sources: readonly ProviderSource[], options: IngestOptions = {}): IngestResult {
  const parts: Partial<NormalizedCollections>[] = [];
  const warnings: IngestionWarning[] = [];
  const providersUsed = new Set<IngestionProvider>();
  let discarded = 0;

  for (const source of sources) {
    providersUsed.add(source.adapter.provider);
    for (const cap of Object.keys(source.payloads) as Capability[]) {
      const raw = source.payloads[cap];
      if (raw === undefined) continue;
      const collectionKey = CAPABILITY_TO_COLLECTION[cap];
      const method = CAPABILITY_METHOD[cap];
      const fn = source.adapter[method] as
        | ((raw: unknown, f: typeof source.freshness) => { records: readonly unknown[]; warnings: readonly IngestionWarning[] })
        | undefined;
      if (!fn || !collectionKey || !source.adapter.capabilities.has(cap)) {
        warnings.push({ code: 'UNSUPPORTED_FIELD', provider: source.adapter.provider, detail: `capability ${cap} not supported` });
        continue;
      }
      try {
        const result = fn.call(source.adapter, raw, source.freshness);
        for (const w of result.warnings) if (w.code === 'DISCARDED_MALFORMED') discarded += 1;
        warnings.push(...result.warnings);
        parts.push({ [collectionKey]: result.records } as Partial<NormalizedCollections>);
      } catch (err) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: source.adapter.provider, detail: `adapter threw on ${cap}: ${(err as Error).message}` });
      }
    }
  }

  const merged = mergeCollections(parts);
  const resolver = new IdentityResolver(options.identitySeed ?? []);
  const { snapshot, warnings: snapWarnings } = buildSnapshot(merged, resolver);
  warnings.push(...snapWarnings);

  const diagnostics: IngestionDiagnostics = {
    providersUsed: [...providersUsed].sort(compareOrdinal),
    warnings,
    discardedCount: discarded,
  };
  return { snapshot, diagnostics };
}

export interface BuildInputOptions {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly asOf: string;
  readonly engineVersion: string;
}

/** Assemble the `NormalizedInferenceInput` for one player from a snapshot. */
export function buildNormalizedInferenceInput(
  snapshot: NormalizedSnapshot,
  options: BuildInputOptions,
): NormalizedInferenceInput | null {
  const built = buildEvidenceFor(snapshot, options.canonicalId, options.position, options.asOf);
  if (!built) return null;
  return {
    player: built.player,
    asOf: options.asOf,
    facts: built.facts,
    factTimestamps: built.factTimestamps,
    evidence: built.evidence,
    freshnessBySource: built.freshnessBySource,
    snapshotIds: [snapshot.snapshotId],
    engineVersion: options.engineVersion,
  };
}

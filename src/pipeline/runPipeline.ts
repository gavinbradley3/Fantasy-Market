// Pure orchestrator: verified snapshots + config in, canonical players +
// readiness + a structured report out. No file or network IO lives here, so the
// whole pipeline is deterministic and unit-testable in memory. The CLI (scripts/
// run-pipeline.ts) handles IO and hands verified snapshots to this function.

import { nflverseAdapter } from '@/pipeline/providers/nflverse/adapter';
import { sleeperAdapter } from '@/pipeline/providers/sleeper/adapter';
import type { AdapterResult, ProviderAdapter, ProviderRecord, RejectReason } from '@/pipeline/providers/types';
import { EMPTY_IDENTITY_MAP, resolveIdentities, type IdentityMap } from '@/pipeline/identity';
import { normalizeCluster, type MetadataConflict } from '@/pipeline/normalize';
import { isStale, type RawSnapshot } from '@/pipeline/snapshot';
import { validateCanonicalPlayers } from '@/pipeline/validation';
import {
  assessReadiness,
  type MetricsSupplements,
  type ReadinessSummary,
} from '@/pipeline/readiness/engineReadiness';
import type { PipelineReport, RejectionCount, StaleSnapshot } from '@/pipeline/report';
import {
  PROVIDER_IDS,
  SUPPORTED_POSITIONS,
  type CanonicalPlayer,
  type ProviderId,
  type SupportedPosition,
} from '@/pipeline/types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  sleeper: sleeperAdapter,
  nflverse: nflverseAdapter,
};

export interface PipelineConfig {
  readonly mode: 'fixture' | 'live' | 'validate';
  /** Deterministic generation stamp (never Date.now inside the pipeline). */
  readonly generatedAt: string;
  /** "As of" date for age derivation; defaults to generatedAt's date. */
  readonly asOf: string;
  /** A snapshot older than this (ms) against generatedAt is flagged stale. */
  readonly staleMaxAgeMs: number;
}

export interface PipelineInput {
  readonly snapshots: readonly RawSnapshot[];
  /** Integrity failures already detected while loading (checksum/metadata). */
  readonly integrityFailures?: readonly string[];
  readonly identityMap?: IdentityMap;
  readonly supplements?: MetricsSupplements;
  readonly config: PipelineConfig;
}

export interface PipelineResult {
  readonly report: PipelineReport;
  readonly canonicalPlayers: readonly CanonicalPlayer[];
  readonly readiness: readonly ReadinessSummary[];
  readonly conflicts: readonly MetadataConflict[];
}

function emptyByProvider(): Record<ProviderId, number> {
  const out = {} as Record<ProviderId, number>;
  for (const p of PROVIDER_IDS) out[p] = 0;
  return out;
}

function emptyByPosition(): Record<SupportedPosition, number> {
  const out = {} as Record<SupportedPosition, number>;
  for (const p of SUPPORTED_POSITIONS) out[p] = 0;
  return out;
}

export function runPipeline(input: PipelineInput): PipelineResult {
  const { config } = input;
  const identityMap = input.identityMap ?? EMPTY_IDENTITY_MAP;
  const supplements = input.supplements ?? {};

  // 1) Parse each snapshot through its provider adapter.
  const allRecords: ProviderRecord[] = [];
  const providerRecordsLoaded = emptyByProvider();
  const rejectionMap = new Map<string, RejectionCount>();
  const sourceTimestamps = {} as Record<ProviderId, string>;
  for (const p of PROVIDER_IDS) sourceTimestamps[p] = config.generatedAt;
  const staleSnapshots: StaleSnapshot[] = [];

  const sortedSnapshots = [...input.snapshots].sort((a, b) =>
    a.metadata.provider === b.metadata.provider
      ? a.metadata.retrievedAt.localeCompare(b.metadata.retrievedAt)
      : a.metadata.provider.localeCompare(b.metadata.provider),
  );

  for (const snap of sortedSnapshots) {
    const provider = snap.metadata.provider;
    const adapter = ADAPTERS[provider];
    const result: AdapterResult = adapter.parse(snap.payload);
    for (const r of result.records) allRecords.push(r);
    providerRecordsLoaded[provider] += result.records.length;
    sourceTimestamps[provider] = snap.metadata.retrievedAt;
    for (const rej of result.rejected) {
      const key = `${rej.provider}:${rej.reason}`;
      const existing = rejectionMap.get(key);
      if (existing) rejectionMap.set(key, { ...existing, count: existing.count + 1 });
      else rejectionMap.set(key, { provider: rej.provider, reason: rej.reason as RejectReason, count: 1 });
    }
    if (isStale(snap.metadata, config.generatedAt, config.staleMaxAgeMs)) {
      const ageHours = Math.round(
        (Date.parse(config.generatedAt) - Date.parse(snap.metadata.retrievedAt)) / 3_600_000,
      );
      staleSnapshots.push({ provider, retrievedAt: snap.metadata.retrievedAt, ageHours });
    }
  }

  // 2) Resolve identities (strong-id only) into canonical clusters.
  const resolution = resolveIdentities(allRecords, identityMap, config.generatedAt);

  // 3) Normalize each cluster into a canonical player + record conflicts.
  const normalizeCfg = {
    generatedAt: config.generatedAt,
    asOf: config.asOf,
    sourceTimestamps,
  };
  const normalized = resolution.clusters.map((c) => normalizeCluster(c, normalizeCfg));
  const conflicts = normalized.flatMap((n) => n.conflicts);

  // 4) Validate canonical records semantically.
  const validation = validateCanonicalPlayers(normalized.map((n) => n.player));
  const canonicalPlayers = [...validation.valid].sort((a, b) =>
    a.identity.canonical_id.localeCompare(b.identity.canonical_id),
  );

  // 5) Assess engine readiness per player.
  const readiness = canonicalPlayers
    .map((p) => assessReadiness(p, supplements, config.asOf))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  // 6) Assemble the report.
  const countsByPosition = emptyByPosition();
  for (const p of canonicalPlayers) countsByPosition[p.position] += 1;

  const rejectedRecords = [...rejectionMap.values()].sort((a, b) =>
    a.provider === b.provider ? a.reason.localeCompare(b.reason) : a.provider.localeCompare(b.provider),
  );
  const totalRejected = rejectedRecords.reduce((s, r) => s + r.count, 0);

  const engineReady = readiness.filter((r) => r.status === 'READY').length;
  const notReady = readiness.filter((r) => r.status === 'NOT_READY');
  const engineUnavailable = readiness.filter((r) => r.status === 'ENGINE_UNAVAILABLE').length;
  const missingRequiredFieldPlayers = notReady.filter((r) =>
    r.missing.some((m) => m.suppliedBy === 'metadata'),
  ).length;

  const notReadyReasons = notReady.map((r) => ({
    canonicalId: r.canonicalId,
    position: r.position,
    missingCount: r.missing.length,
    sample: r.missing.slice(0, 3).map((m) => m.field),
  }));

  const integrityFailures = input.integrityFailures ?? [];
  const ok =
    integrityFailures.length === 0 &&
    allRecords.length > 0 &&
    resolution.duplicateCanonicalIds.length === 0;

  const report: PipelineReport = {
    ok,
    generatedAt: config.generatedAt,
    mode: config.mode,
    providerRecordsLoaded,
    totalProviderRecords: allRecords.length,
    rejectedRecords,
    totalRejected,
    snapshotsLoaded: input.snapshots.length,
    snapshotIntegrityFailures: integrityFailures,
    staleSnapshots,
    supportedPlayersDiscovered: allRecords.length,
    canonicalPlayersGenerated: canonicalPlayers.length,
    countsByPosition,
    persistedMatches: resolution.persistedMatches,
    crossProviderMatches: resolution.crossProviderMatches,
    newIdentities: resolution.newIdentities,
    ambiguousNameCollisions: resolution.nameCollisions.length,
    duplicateCanonicalIds: resolution.duplicateCanonicalIds.length,
    metadataConflicts: conflicts.length,
    validationRejections: validation.rejected.length,
    missingRequiredFieldPlayers,
    engineReadyPlayers: engineReady,
    playersNotEngineReady: notReady.length,
    engineUnavailablePlayers: engineUnavailable,
    notReadyReasons,
  };

  return { report, canonicalPlayers, readiness, conflicts };
}

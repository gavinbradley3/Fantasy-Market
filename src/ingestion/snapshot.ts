// Immutable, reproducible normalized snapshot (Phase 4 §5/§7).
//
// A snapshot is the canonically-ordered, identity-linked collection of every
// normalized record, plus a content-derived snapshot id. Two identical provider
// payloads (same freshness) produce a BYTE-IDENTICAL snapshot and the same id.

import { digest, stableStringify } from '@/inference/util/checksum';
import { IdentityResolver } from './identity';
import { compareOrdinal, sortByKey } from './ordering';
import type {
  DepthChartRecord,
  GameStatRecord,
  IngestionProvider,
  IngestionWarning,
  InjuryRecord,
  NormalizedRecordBase,
  OfficialStartRecord,
  ParticipationRecord,
  PlayerRecord,
  RosterRecord,
  ScheduleGameRecord,
  TransactionRecord,
} from './types';

export interface NormalizedCollections {
  readonly players: readonly PlayerRecord[];
  readonly rosters: readonly RosterRecord[];
  readonly schedule: readonly ScheduleGameRecord[];
  readonly games: readonly GameStatRecord[];
  readonly participation: readonly ParticipationRecord[];
  readonly injuries: readonly InjuryRecord[];
  readonly transactions: readonly TransactionRecord[];
  readonly officialStarts: readonly OfficialStartRecord[];
  readonly depthCharts: readonly DepthChartRecord[];
}

export interface NormalizedSnapshot extends NormalizedCollections {
  readonly snapshotId: string;
  readonly providersUsed: readonly IngestionProvider[];
  readonly identityIndex: Readonly<Record<string, string>>;
}

const EMPTY: NormalizedCollections = {
  players: [], rosters: [], schedule: [], games: [], participation: [], injuries: [], transactions: [], officialStarts: [], depthCharts: [],
};

/** Merge partial collections (from multiple adapters) into one. */
export function mergeCollections(parts: readonly Partial<NormalizedCollections>[]): NormalizedCollections {
  const out: { [K in keyof NormalizedCollections]: NormalizedCollections[K][number][] } = {
    players: [], rosters: [], schedule: [], games: [], participation: [], injuries: [], transactions: [], officialStarts: [], depthCharts: [],
  };
  for (const p of parts) {
    for (const key of Object.keys(out) as (keyof NormalizedCollections)[]) {
      const arr = p[key];
      if (arr) (out[key] as unknown[]).push(...arr);
    }
  }
  return out as unknown as NormalizedCollections;
}

function withCanonical<T extends NormalizedRecordBase>(rec: T, canonicalId: string): T {
  return { ...rec, canonicalId };
}

/**
 * Resolve identity for every record and build the immutable, ordered snapshot.
 * Identity PlayerRecords are resolved first (registering all their provider-id tokens,
 * enabling cross-provider joins); every other record is linked by its `providerRef`.
 * Unresolvable records are dropped with an `UNRESOLVED_IDENTITY` warning.
 */
export function buildSnapshot(
  collections: NormalizedCollections,
  resolver: IdentityResolver = new IdentityResolver(),
): { snapshot: NormalizedSnapshot; warnings: readonly IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];

  // 1. Resolve identity records first so the index knows every provider-id token.
  const players = sortByKey(collections.players, (p) => `${p.providerRef.key}:${p.providerRef.value}`).map((p) => {
    const res = resolver.resolve({ providerIds: p.providerIds, nameNormalized: p.nameNormalized, position: p.position, provider: p.freshness.provider });
    warnings.push(...res.warnings);
    return withCanonical(p, res.canonicalId);
  });

  // 2. Link every other record by its providerRef token.
  const index = resolver.snapshotIndex();
  const link = <T extends NormalizedRecordBase>(recs: readonly T[], provider: (r: T) => IngestionProvider): T[] => {
    const linked: T[] = [];
    for (const r of recs) {
      const token = `${r.providerRef.key}:${r.providerRef.value}`;
      const canonicalId = index[token];
      if (!canonicalId) {
        warnings.push({ code: 'UNRESOLVED_IDENTITY', provider: provider(r), detail: `no canonical id for ${token}` });
        continue;
      }
      linked.push(withCanonical(r, canonicalId));
    }
    return linked;
  };

  const prov = <T extends NormalizedRecordBase>(r: T) => r.freshness.provider;
  const linked: NormalizedCollections = {
    players,
    rosters: link(collections.rosters, prov),
    // schedule is team/game-level (providerRef key = "game"); keep all, canonicalId stays null-linked via game id.
    schedule: sortByKey(collections.schedule, (s) => s.gameId).map((s) => ({ ...s, canonicalId: s.gameId })),
    games: link(collections.games, prov),
    participation: link(collections.participation, prov),
    injuries: link(collections.injuries, prov),
    transactions: link(collections.transactions, prov),
    officialStarts: link(collections.officialStarts, prov),
    depthCharts: link(collections.depthCharts, prov),
  };

  // 3. Canonical ordering of every collection (non-semantic → sorted).
  const ordered: NormalizedCollections = {
    players: sortByKey(linked.players, (p) => p.canonicalId ?? ''),
    rosters: sortByKey(linked.rosters, (r) => `${r.canonicalId}|${r.season}|${r.team}`),
    schedule: sortByKey(linked.schedule, (s) => `${s.kickoff}|${s.gameId}`),
    games: sortByKey(linked.games, (g) => `${g.canonicalId}|${g.kickoff}|${g.gameId}`),
    participation: sortByKey(linked.participation, (p) => `${p.canonicalId}|${p.kickoff}|${p.gameId}`),
    injuries: sortByKey(linked.injuries, (i) => `${i.canonicalId}|${i.sourceTimestamp}`),
    transactions: sortByKey(linked.transactions, (t) => `${t.canonicalId}|${t.date}|${t.type}`),
    officialStarts: sortByKey(linked.officialStarts, (o) => `${o.canonicalId}|${o.gameId}`),
    depthCharts: sortByKey(linked.depthCharts, (d) => `${d.canonicalId}|${d.team}|${d.position}|${d.rank}`),
  };

  const providersUsed = [...new Set(collections.players.map((p) => p.freshness.provider))].sort(compareOrdinal);
  const snapshotId = `snap-${digest(stableStringify(ordered))}`;

  return {
    snapshot: { ...ordered, snapshotId, providersUsed, identityIndex: index },
    warnings,
  };
}

export { EMPTY as EMPTY_COLLECTIONS };

// Immutable, reproducible normalized snapshot (Phase 4 §5/§7).
//
// A snapshot is the canonically-ordered, identity-linked collection of every
// normalized record, plus a content-derived snapshot id. Two identical provider
// payloads (same freshness) produce a BYTE-IDENTICAL snapshot and the same id.

import { digest, stableStringify } from '@/inference/util/checksum';
import { IdentityResolver } from './identity';
import { deduplicateCanonicalPlayers } from './identityMerge';
import { compareOrdinal, sortByKey } from './ordering';
import {
  IngestionError,
  type DepthChartRecord,
  type GameStatRecord,
  type IngestionProvider,
  type IngestionWarning,
  type InjuryRecord,
  type NormalizedRecordBase,
  type OfficialStartRecord,
  type ParticipationRecord,
  type PlayerRecord,
  type RosterRecord,
  type ScheduleGameRecord,
  type TransactionRecord,
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
/**
 * Collapse duplicate per-game stat rows for the same player and game.
 *
 * WHY THIS IS NEEDED
 * A provider export can carry the same (player, game) twice — typically one complete row and
 * one that omits an auxiliary column. Left alone, both rows survive into the snapshot, which
 * double-counts every stat that game AND makes the snapshot's bytes depend on the order the
 * rows arrived in: a stable sort keeps colliding records in input order, so re-running the
 * same ingest on a reordered export produced a different snapshot id. The duplicate was
 * previously invisible only because the two rows normalized to identical records; the moment
 * any carried column differed between them, the order-dependence became observable.
 *
 * THE RULE. Group by (canonical id, game id). Within a group, take each field's OBSERVED
 * value when exactly one row supplies it — one row omitting a column is not evidence against
 * the row that has it. When two rows disagree on a value both actually supplied, that is a
 * real contradiction in the source: the rows are ordered by their own canonical serialization
 * and the first wins, which is arbitrary but DETERMINISTIC, and a warning is raised so the
 * conflict is visible rather than absorbed.
 */
function collapseGameStats(
  games: readonly GameStatRecord[],
  warnings: IngestionWarning[],
): GameStatRecord[] {
  const groups = new Map<string, GameStatRecord[]>();
  for (const g of games) {
    const key = `${g.canonicalId ?? ''}|${g.gameId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(g);
    else groups.set(key, [g]);
  }

  const out: GameStatRecord[] = [];
  for (const [key, bucket] of groups) {
    if (bucket.length === 1) {
      out.push(bucket[0]);
      continue;
    }
    // Order-independent: the winner of a genuine conflict is decided by content, never by
    // arrival. `stableStringify` is the same canonical serialization the snapshot id uses.
    const ordered = sortByKey(bucket, (g) => stableStringify(g));
    const merged: Record<string, unknown> = { ...ordered[0] };
    for (const candidate of ordered.slice(1)) {
      for (const [field, value] of Object.entries(candidate)) {
        const current = merged[field];
        if (current === null || current === undefined) {
          merged[field] = value;
        } else if (value !== null && value !== undefined && !Object.is(current, value)) {
          warnings.push({
            code: 'DISCARDED_MALFORMED',
            provider: candidate.freshness.provider,
            detail: `conflicting duplicate game stat for ${key}: ${field} ${String(current)} vs ${String(value)} — kept ${String(current)}`,
          });
        }
      }
    }
    out.push(merged as unknown as GameStatRecord);
  }
  return out;
}

export function buildSnapshot(
  collections: NormalizedCollections,
  resolver: IdentityResolver = new IdentityResolver(),
): { snapshot: NormalizedSnapshot; warnings: readonly IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];

  // 1. Resolve identity records first so the index knows every provider-id token.
  //    Records with no stable id token or with conflicting tokens resolve to null and
  //    are excluded from canonical identity output (their diagnostics are collected).
  const resolvedPlayers: PlayerRecord[] = [];
  for (const p of sortByKey(collections.players, (p) => `${p.providerRef.key}:${p.providerRef.value}`)) {
    const res = resolver.resolve({ providerIds: p.providerIds, nameNormalized: p.nameNormalized, position: p.position, provider: p.freshness.provider });
    warnings.push(...res.warnings);
    if (res.canonicalId !== null) resolvedPlayers.push(withCanonical(p, res.canonicalId));
  }

  // 1b. Collapse to EXACTLY ONE canonical PlayerRecord per canonical id (Correction 2),
  //     with deterministic, order-independent field merge + provider-id union.
  const { players, warnings: mergeWarnings } = deduplicateCanonicalPlayers(resolvedPlayers);
  warnings.push(...mergeWarnings);

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
    // Collapsed BEFORE ordering so a duplicated row can neither double-count a game nor
    // make the snapshot's bytes depend on the order the export happened to arrive in.
    games: collapseGameStats(link(collections.games, prov), warnings),
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

  // Enforce the snapshot invariant: exactly one canonical player record per canonical id.
  const uniqueIds = new Set(ordered.players.map((p) => p.canonicalId));
  if (uniqueIds.size !== ordered.players.length) {
    throw new IngestionError('DUPLICATE_IDENTITY', `snapshot invariant violated: ${ordered.players.length} player records for ${uniqueIds.size} canonical ids`);
  }

  const providersUsed = [...new Set(collections.players.map((p) => p.freshness.provider))].sort(compareOrdinal);
  const snapshotId = `snap-${digest(stableStringify(ordered))}`;

  return {
    snapshot: { ...ordered, snapshotId, providersUsed, identityIndex: index },
    warnings,
  };
}

export { EMPTY as EMPTY_COLLECTIONS };

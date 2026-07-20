// Deterministic identity resolution. Clusters provider records into canonical
// players using STRONG IDS ONLY, in the audit's priority order (DESIGN §27):
//   1. a shared stable provider id joins records across providers;
//   2. a previously persisted canonical mapping fixes the canonical id;
//   3. otherwise a new canonical id is minted deterministically.
//
// Names are NEVER used to merge (DESIGN §27: name matching is a suggestion, not
// an auto-merge). Name collisions between separate clusters are detected and
// REPORTED as ambiguous, but the clusters stay separate. Unsafe merges are thus
// structurally impossible here — there is no code path that unions two records
// without a shared strong id.

import { digest } from '@/pipeline/hash';
import { collisionKey, normalizeName } from '@/pipeline/names';
import type { ProviderRecord } from '@/pipeline/providers/types';
import type { CanonicalIdentity, ProviderIds } from '@/pipeline/types';

// Namespaces that count as strong join keys, strongest first. GSIS is the most
// stable cross-industry key; Sleeper is the primary metadata id.
const ID_NAMESPACES = ['gsis', 'sleeper', 'espn', 'yahoo', 'sportradar'] as const;
type IdNamespace = (typeof ID_NAMESPACES)[number];

export type MatchMethod = 'PERSISTED_MAP' | 'CROSS_PROVIDER_ID' | 'NEW_SINGLE_PROVIDER';

export interface PlayerCluster {
  readonly identity: CanonicalIdentity;
  readonly records: readonly ProviderRecord[];
  readonly matchMethod: MatchMethod;
}

// A persisted identity map: strong-id key ("gsis:00-0034857") -> canonical id.
export interface IdentityMap {
  readonly version: number;
  readonly map: Readonly<Record<string, string>>;
}

export const EMPTY_IDENTITY_MAP: IdentityMap = { version: 1, map: {} };

export interface NameCollision {
  readonly nameNormalized: string;
  readonly canonicalIds: readonly string[];
}

export interface DuplicateCanonicalId {
  readonly canonicalId: string;
  readonly clusterCount: number;
}

export interface IdentityResolution {
  readonly clusters: readonly PlayerCluster[];
  readonly persistedMatches: number;
  readonly crossProviderMatches: number;
  readonly newIdentities: number;
  readonly nameCollisions: readonly NameCollision[];
  readonly duplicateCanonicalIds: readonly DuplicateCanonicalId[];
}

function strongKeys(record: ProviderRecord): string[] {
  const keys: string[] = [];
  for (const ns of ID_NAMESPACES) {
    const v = record.crossIds[ns];
    if (v) keys.push(`${ns}:${v}`);
  }
  return keys;
}

// ---- union-find over strong-id keys ----
class UnionFind {
  private parent = new Map<number, number>();
  find(x: number): number {
    let root = x;
    while (this.parent.get(root) !== undefined && this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    this.parent.set(x, root);
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  add(x: number): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
}

function mergeProviderIds(records: readonly ProviderRecord[]): ProviderIds {
  const ids: Record<IdNamespace, string | undefined> = {
    gsis: undefined,
    sleeper: undefined,
    espn: undefined,
    yahoo: undefined,
    sportradar: undefined,
  };
  // First non-empty value per namespace wins; records are pre-sorted by
  // provider id so this is deterministic. Divergent values within a namespace
  // are surfaced as metadata conflicts during normalization.
  for (const r of records) {
    for (const ns of ID_NAMESPACES) {
      if (ids[ns] === undefined && r.crossIds[ns]) ids[ns] = r.crossIds[ns];
    }
  }
  const out: ProviderIds = {};
  for (const ns of ID_NAMESPACES) {
    if (ids[ns] !== undefined) (out as Record<string, string>)[ns] = ids[ns]!;
  }
  return out;
}

/** Deterministic new canonical id, seeded from the strongest available id. */
function mintCanonicalId(ids: ProviderIds): string {
  for (const ns of ID_NAMESPACES) {
    const v = ids[ns];
    if (v) return `pt-${digest(`${ns}:${v}`)}`;
  }
  // Unreachable: every clustered record carries at least its primary id.
  return `pt-${digest('empty')}`;
}

function resolveFromMap(ids: ProviderIds, map: IdentityMap): string | null {
  const found = new Set<string>();
  for (const ns of ID_NAMESPACES) {
    const v = ids[ns];
    if (v) {
      const hit = map.map[`${ns}:${v}`];
      if (hit) found.add(hit);
    }
  }
  if (found.size === 0) return null;
  // Deterministic pick when a map is internally inconsistent (>1 canonical id
  // for one cluster): smallest id. The inconsistency shows up as a duplicate.
  return [...found].sort()[0];
}

export function resolveIdentities(
  records: readonly ProviderRecord[],
  map: IdentityMap = EMPTY_IDENTITY_MAP,
  generatedAt = '',
): IdentityResolution {
  void generatedAt; // reserved; identity is time-independent
  const uf = new UnionFind();
  const keyToIndex = new Map<string, number>();

  records.forEach((_, i) => uf.add(i));
  records.forEach((record, i) => {
    for (const key of strongKeys(record)) {
      const existing = keyToIndex.get(key);
      if (existing === undefined) keyToIndex.set(key, i);
      else uf.union(existing, i);
    }
  });

  // Gather clusters by representative root.
  const byRoot = new Map<number, number[]>();
  records.forEach((_, i) => {
    const root = uf.find(i);
    const list = byRoot.get(root);
    if (list) list.push(i);
    else byRoot.set(root, [i]);
  });

  const clusters: PlayerCluster[] = [];
  let persistedMatches = 0;
  let crossProviderMatches = 0;
  let newIdentities = 0;

  for (const indices of byRoot.values()) {
    const clusterRecords = indices
      .map((i) => records[i])
      .sort((a, b) =>
        a.provider === b.provider
          ? a.providerPlayerId.localeCompare(b.providerPlayerId)
          : a.provider.localeCompare(b.provider),
      );
    const providerIds = mergeProviderIds(clusterRecords);
    const providers = new Set(clusterRecords.map((r) => r.provider));

    const mapped = resolveFromMap(providerIds, map);
    let canonicalId: string;
    let matchMethod: MatchMethod;
    let newlyCreated: boolean;
    if (mapped) {
      canonicalId = mapped;
      matchMethod = 'PERSISTED_MAP';
      newlyCreated = false;
      persistedMatches += 1;
    } else {
      canonicalId = mintCanonicalId(providerIds);
      newlyCreated = true;
      newIdentities += 1;
      if (providers.size >= 2) {
        matchMethod = 'CROSS_PROVIDER_ID';
        crossProviderMatches += 1;
      } else {
        matchMethod = 'NEW_SINGLE_PROVIDER';
      }
    }

    // Canonical name: prefer the first record that carries a name in provider
    // order (already sorted). Never fabricated — a nameless cluster keeps ''.
    const named = clusterRecords.find((r) => r.fullName);
    const nameNormalized = named?.fullName ? normalizeName(named.fullName) : '';

    clusters.push({
      identity: {
        canonical_id: canonicalId,
        provider_ids: providerIds,
        name_normalized: nameNormalized,
        newly_created: newlyCreated,
      },
      records: clusterRecords,
      matchMethod,
    });
  }

  // Deterministic cluster order by canonical id.
  clusters.sort((a, b) => a.identity.canonical_id.localeCompare(b.identity.canonical_id));

  // Name collisions: separate clusters sharing a collision key (ambiguous, not
  // merged). Reported for the audit queue.
  const byNameKey = new Map<string, string[]>();
  for (const c of clusters) {
    if (!c.identity.name_normalized) continue;
    const key = collisionKey(c.identity.name_normalized);
    const list = byNameKey.get(key);
    if (list) list.push(c.identity.canonical_id);
    else byNameKey.set(key, [c.identity.canonical_id]);
  }
  const nameCollisions: NameCollision[] = [];
  for (const [key, canonicalIds] of byNameKey) {
    if (canonicalIds.length > 1) {
      nameCollisions.push({ nameNormalized: key, canonicalIds: [...canonicalIds].sort() });
    }
  }
  nameCollisions.sort((a, b) => a.nameNormalized.localeCompare(b.nameNormalized));

  // Duplicate canonical ids: the same id assigned to >1 cluster (a persisted-map
  // inconsistency or a hash collision). Surfaced, never silently deduped.
  const byCanonical = new Map<string, number>();
  for (const c of clusters) {
    byCanonical.set(c.identity.canonical_id, (byCanonical.get(c.identity.canonical_id) ?? 0) + 1);
  }
  const duplicateCanonicalIds: DuplicateCanonicalId[] = [];
  for (const [canonicalId, clusterCount] of byCanonical) {
    if (clusterCount > 1) duplicateCanonicalIds.push({ canonicalId, clusterCount });
  }
  duplicateCanonicalIds.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  return {
    clusters,
    persistedMatches,
    crossProviderMatches,
    newIdentities,
    nameCollisions,
    duplicateCanonicalIds,
  };
}

// Canonical player deduplication & deterministic field merge (Phase 4 §3, Correction 2).
//
// After identity resolution many source PlayerRecords can share one canonical id (each
// provider that supplies identity contributes one). This module collapses every such
// group into EXACTLY ONE canonical PlayerRecord, using an explicit, documented, and
// order-independent precedence so the merged record — and therefore all downstream
// evidence — never depends on how many providers supplied identity or in what order.

import { compareOrdinal } from './ordering';
import type { IngestionProvider, IngestionWarning, PlayerRecord } from './types';

/**
 * Provider priority used only as the THIRD precedence key (after authoritative source
 * and effective-timestamp recency). Lower index = stronger. A provider not listed here
 * ranks last, then the deterministic ordinal tie-break decides.
 */
const PROVIDER_PRIORITY: readonly IngestionProvider[] = [
  'manual',
  'nflverse',
  'sleeper',
  'espn',
  'fantasypros',
  'pfr',
  'stathead',
  'pff',
];

function providerRank(p: IngestionProvider): number {
  const i = PROVIDER_PRIORITY.indexOf(p);
  return i === -1 ? PROVIDER_PRIORITY.length : i;
}

/**
 * Deterministic precedence for the source records of ONE canonical player. Documented,
 * stable, and independent of input-array order (the providerRef token tie-break is
 * unique per source record, giving a total order). Ordering, strongest first:
 *   1. authoritative identity source (`manual`);
 *   2. latest valid effective timestamp (`sourceTimestamp` DESC);
 *   3. explicit provider priority (PROVIDER_PRIORITY);
 *   4. deterministic ordinal tie-break on the providerRef token.
 */
function comparePrecedence(a: PlayerRecord, b: PlayerRecord): number {
  const authA = a.freshness.provider === 'manual' ? 0 : 1;
  const authB = b.freshness.provider === 'manual' ? 0 : 1;
  if (authA !== authB) return authA - authB;

  // Latest effective timestamp wins (descending).
  if (a.sourceTimestamp !== b.sourceTimestamp) return a.sourceTimestamp < b.sourceTimestamp ? 1 : -1;

  const pr = providerRank(a.freshness.provider) - providerRank(b.freshness.provider);
  if (pr !== 0) return pr;

  return compareOrdinal(`${a.providerRef.key}:${a.providerRef.value}`, `${b.providerRef.key}:${b.providerRef.value}`);
}

/** First non-null value across the precedence-ordered group for a scalar field. */
function firstNonNull<T>(sorted: readonly PlayerRecord[], pick: (p: PlayerRecord) => T | null): T | null {
  for (const r of sorted) {
    const v = pick(r);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/**
 * Union of every validated provider id across the group, canonically ordered
 * (sorted keys) and conflict-aware: when two source records disagree on the value for
 * the SAME namespace, the higher-precedence value is kept and a typed diagnostic is
 * emitted — the value is never silently overwritten.
 */
function mergeProviderIds(
  sorted: readonly PlayerRecord[],
  emit: (w: IngestionWarning) => void,
): Readonly<Record<string, string>> {
  const chosen = new Map<string, string>();
  for (const r of sorted) {
    for (const [ns, id] of Object.entries(r.providerIds)) {
      if (id === undefined || id === null || id === '') continue;
      const prior = chosen.get(ns);
      if (prior === undefined) {
        chosen.set(ns, id);
      } else if (prior !== id) {
        emit({
          code: 'IDENTITY_CONFLICT',
          provider: r.freshness.provider,
          detail: `provider-id conflict for namespace "${ns}": kept "${prior}", ignored "${id}"`,
        });
      }
    }
  }
  const out: Record<string, string> = {};
  for (const ns of [...chosen.keys()].sort(compareOrdinal)) out[ns] = chosen.get(ns) as string;
  return out;
}

/** Merge one canonical-id group into a single deterministic PlayerRecord. */
function mergeGroup(canonicalId: string, group: readonly PlayerRecord[]): { record: PlayerRecord; warnings: IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];
  const emit = (w: IngestionWarning) => warnings.push(w);
  const sorted = [...group].sort(comparePrecedence);
  const primary = sorted[0];

  // Position conflict: disagreeing non-null positions are a typed conflict; the
  // highest-precedence non-null value is used deterministically.
  const positions = new Set(sorted.map((r) => r.position).filter((p): p is NonNullable<typeof p> => p !== null));
  if (positions.size > 1) {
    emit({ code: 'IDENTITY_CONFLICT', provider: primary.freshness.provider, detail: `position conflict for ${canonicalId}: [${[...positions].sort().join(',')}]` });
  }

  // Team conflict is legitimate (timing/transactions); resolved by precedence
  // (recency first). A disagreement is surfaced as a source conflict, not silently hidden.
  const teams = new Set(sorted.map((r) => r.team).filter((t): t is NonNullable<typeof t> => t !== null));
  if (teams.size > 1) {
    emit({ code: 'SOURCE_CONFLICT', provider: primary.freshness.provider, detail: `team differs across sources for ${canonicalId}: [${[...teams].sort().join(',')}] → kept ${firstNonNull(sorted, (r) => r.team)}` });
  }

  const record: PlayerRecord = {
    // Identity + provenance come from the highest-precedence source record.
    canonicalId,
    providerRef: primary.providerRef,
    freshness: primary.freshness,
    sourceTimestamp: primary.sourceTimestamp,
    // Provider-id UNION across the whole group (canonically ordered, conflict-aware).
    providerIds: mergeProviderIds(sorted, emit),
    // Scalar fields: highest-precedence non-null value.
    nameNormalized: firstNonNull(sorted, (r) => r.nameNormalized) ?? primary.nameNormalized,
    position: firstNonNull(sorted, (r) => r.position),
    team: firstNonNull(sorted, (r) => r.team),
    age: firstNonNull(sorted, (r) => r.age),
    nflSeasonsCompleted: firstNonNull(sorted, (r) => r.nflSeasonsCompleted),
    draftRound: firstNonNull(sorted, (r) => r.draftRound),
    status: firstNonNull(sorted, (r) => r.status),
    injuryDesignation: firstNonNull(sorted, (r) => r.injuryDesignation),
  };
  return { record, warnings };
}

/**
 * Collapse resolved PlayerRecords (each already carrying a non-null canonicalId) into
 * exactly one canonical PlayerRecord per canonical id. Grouping and per-group merge are
 * both order-independent, so the output is a deterministic function of the record SET.
 */
export function deduplicateCanonicalPlayers(resolved: readonly PlayerRecord[]): {
  players: PlayerRecord[];
  warnings: IngestionWarning[];
} {
  const groups = new Map<string, PlayerRecord[]>();
  for (const p of resolved) {
    const id = p.canonicalId;
    if (id === null) continue; // unresolved records never contribute a canonical player
    const g = groups.get(id);
    if (g) g.push(p);
    else groups.set(id, [p]);
  }

  const players: PlayerRecord[] = [];
  const warnings: IngestionWarning[] = [];
  for (const [canonicalId, group] of groups) {
    const { record, warnings: w } = mergeGroup(canonicalId, group);
    players.push(record);
    warnings.push(...w);
  }
  return { players, warnings };
}

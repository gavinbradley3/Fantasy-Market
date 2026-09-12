// Canonical player deduplication & deterministic field merge (Phase 4 §3, Correction 2).
//
// After identity resolution many source PlayerRecords can share one canonical id (each
// provider that supplies identity contributes one). This module collapses every such
// group into EXACTLY ONE canonical PlayerRecord, using an explicit, documented, and
// order-independent precedence so the merged record — and therefore all downstream
// evidence — never depends on how many providers supplied identity or in what order.

import { compareOrdinal } from './ordering';
import type { FieldSource, IngestionProvider, IngestionWarning, MergedFieldKey, PlayerRecord } from './types';

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
 * PRECEDENCE DEPENDS ON WHAT KIND OF FACT IS BEING MERGED.
 *
 * A single ordering cannot be right for every field, and using one caused a real defect.
 *
 *   TIME-VARYING facts — team, roster status, injury designation — change week to week, so the
 *   most RECENT attestation is the best answer. Recency leads.
 *
 *   STABLE BIOGRAPHICAL facts — age, seasons completed, draft round, position, name — do not
 *   change with the news. For these, recency is not a measure of quality at all; it only says
 *   which provider was fetched most recently. The most AUTHORITATIVE provider leads.
 *
 * WHAT WENT WRONG WITH ONE ORDERING. Sleeper's players resource is a current-state snapshot
 * carrying an HTTP `Last-Modified` of roughly now, while an nflverse release is dated when it
 * was cut. Under recency-first, Sleeper therefore won EVERY scalar field for every player it
 * matched — including age, which is the largest single dynasty weight in all three accessible
 * models (RB 0.23, TE 0.21, WR 0.16). Enabling an availability enrichment moved 105 dynasty
 * composites (RB mean |Δ| 5.31, TE 4.16, WR 2.77) through a field it was never meant to touch,
 * and the ordering of those magnitudes is exactly the ordering of the age weights.
 *
 * Sleeper also publishes age as a CURRENT-STATE INTEGER, where PlayerTicker derives age from a
 * birth date at the as-of. So the value that was winning was both less precise and, for any
 * historical as-of, answering a different question.
 *
 * Both orderings are total and independent of input-array order (the providerRef token
 * tie-break is unique per source record), so the merged record stays a deterministic function
 * of the record SET.
 */

/** Time-varying fields: recency leads. `manual` still overrides everything. */
function compareRecency(a: PlayerRecord, b: PlayerRecord): number {
  const authA = a.freshness.provider === 'manual' ? 0 : 1;
  const authB = b.freshness.provider === 'manual' ? 0 : 1;
  if (authA !== authB) return authA - authB;

  // Latest effective timestamp wins (descending).
  if (a.sourceTimestamp !== b.sourceTimestamp) return a.sourceTimestamp < b.sourceTimestamp ? 1 : -1;

  const pr = providerRank(a.freshness.provider) - providerRank(b.freshness.provider);
  if (pr !== 0) return pr;

  return compareOrdinal(`${a.providerRef.key}:${a.providerRef.value}`, `${b.providerRef.key}:${b.providerRef.value}`);
}

/**
 * Stable biographical fields: provider authority leads, recency only breaks ties within one
 * provider. A newer fetch from a less authoritative source can no longer overwrite a
 * biographical fact.
 */
function compareAuthority(a: PlayerRecord, b: PlayerRecord): number {
  const pr = providerRank(a.freshness.provider) - providerRank(b.freshness.provider);
  if (pr !== 0) return pr;

  if (a.sourceTimestamp !== b.sourceTimestamp) return a.sourceTimestamp < b.sourceTimestamp ? 1 : -1;

  return compareOrdinal(`${a.providerRef.key}:${a.providerRef.value}`, `${b.providerRef.key}:${b.providerRef.value}`);
}

/**
 * First non-null value across the precedence-ordered group, WITH the record it came from.
 *
 * Returning the source record is what makes per-field provenance possible: the merged value and
 * the claim about where it came from are produced by the same decision, so they cannot drift.
 */
function firstNonNullFrom<T>(
  sorted: readonly PlayerRecord[],
  pick: (p: PlayerRecord) => T | null,
): { value: T | null; from: PlayerRecord | null } {
  for (const r of sorted) {
    const v = pick(r);
    if (v !== null && v !== undefined) return { value: v, from: r };
  }
  return { value: null, from: null };
}

/** First non-null value only, for callers that do not need the source. */
function firstNonNull<T>(sorted: readonly PlayerRecord[], pick: (p: PlayerRecord) => T | null): T | null {
  return firstNonNullFrom(sorted, pick).value;
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
  // `recent` decides time-varying fields; `authoritative` decides biography and identity.
  const recent = [...group].sort(compareRecency);
  const authoritative = [...group].sort(compareAuthority);
  const primary = authoritative[0] as PlayerRecord;

  // Position conflict: disagreeing non-null positions are a typed conflict; the
  // highest-precedence non-null value is used deterministically.
  const positions = new Set(authoritative.map((r) => r.position).filter((p): p is NonNullable<typeof p> => p !== null));
  if (positions.size > 1) {
    emit({ code: 'IDENTITY_CONFLICT', provider: primary.freshness.provider, detail: `position conflict for ${canonicalId}: [${[...positions].sort().join(',')}]` });
  }

  // Team conflict is legitimate (timing/transactions); resolved by precedence
  // (recency first). A disagreement is surfaced as a source conflict, not silently hidden.
  const teams = new Set(recent.map((r) => r.team).filter((t): t is NonNullable<typeof t> => t !== null));
  if (teams.size > 1) {
    emit({ code: 'SOURCE_CONFLICT', provider: primary.freshness.provider, detail: `team differs across sources for ${canonicalId}: [${[...teams].sort().join(',')}] → kept ${firstNonNull(recent, (r) => r.team)}` });
  }

  // Each field is resolved from the ordering appropriate to its KIND, and each remembers the
  // record that supplied it so the canonical player can attribute it truthfully.
  const fieldSources: Partial<Record<MergedFieldKey, FieldSource>> = {};
  const resolve = <T>(
    field: MergedFieldKey,
    order: readonly PlayerRecord[],
    pick: (p: PlayerRecord) => T | null,
  ): T | null => {
    const { value, from } = firstNonNullFrom(order, pick);
    if (from !== null) {
      fieldSources[field] = { provider: from.freshness.provider, sourceTimestamp: from.sourceTimestamp };
    }
    return value;
  };

  // Stable biography: most AUTHORITATIVE non-null value. A current-state export fetched today
  // does not get to restate how old a player is.
  const nameNormalized = resolve('nameNormalized', authoritative, (r) => r.nameNormalized);
  const position = resolve('position', authoritative, (r) => r.position);
  const age = resolve('age', authoritative, (r) => r.age);
  const nflSeasonsCompleted = resolve('nflSeasonsCompleted', authoritative, (r) => r.nflSeasonsCompleted);
  const draftRound = resolve('draftRound', authoritative, (r) => r.draftRound);

  // Time-varying facts: most RECENT non-null value. These are the fields an enrichment provider
  // legitimately improves, and the only ones it can affect.
  const team = resolve('team', recent, (r) => r.team);
  const status = resolve('status', recent, (r) => r.status);
  const injuryDesignation = resolve('injuryDesignation', recent, (r) => r.injuryDesignation);

  const record: PlayerRecord = {
    // Identity + provenance come from the highest-precedence source record.
    canonicalId,
    providerRef: primary.providerRef,
    freshness: primary.freshness,
    sourceTimestamp: primary.sourceTimestamp,
    // Provider-id UNION across the whole group (canonically ordered, conflict-aware).
    providerIds: mergeProviderIds(authoritative, emit),

    nameNormalized: nameNormalized ?? primary.nameNormalized,
    position,
    age,
    nflSeasonsCompleted,
    draftRound,
    team,
    status,
    injuryDesignation,
    // Per-field attribution, which also carries each field's own attestation instant. This is
    // what keeps a post-as-of designation from being gated by the authoritative provider's
    // earlier stamp and silently admitted onto a board it postdates.
    fieldSources,
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

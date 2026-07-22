// Deterministic identity resolution (Phase 4 §3).
//
// Maps a set of provider ids (+ normalized name/position) to a single canonical
// PlayerTicker id. Deterministic and cached; conflicts produce explicit diagnostics
// and are resolved by a fixed rule (never a guess). Two runs over the same inputs
// produce identical assignments.

import { digest } from '@/inference/util/checksum';
import { compareOrdinal } from './ordering';
import type { IngestionProvider, IngestionWarning, NormalizedPosition } from './types';

/** Provider id key order used when minting a canonical id (strongest first). */
const KEY_PRIORITY = ['gsis', 'sleeper', 'pfr', 'espn', 'yahoo', 'sportradar'] as const;

export interface IdentityQuery {
  readonly providerIds: Readonly<Record<string, string>>;
  readonly nameNormalized: string;
  readonly position: NormalizedPosition | null;
  readonly provider: IngestionProvider;
}

export interface IdentityResolution {
  readonly canonicalId: string;
  readonly newlyCreated: boolean;
  readonly warnings: readonly IngestionWarning[];
}

/**
 * Deterministic, cached identity resolver. Seed it with known mappings
 * (canonicalId → provider ids); unknown players get a deterministic minted id derived
 * from their strongest stable provider key (or name+position when no id exists).
 */
export class IdentityResolver {
  /** provider-id token (`"gsis:00-00"`) → canonicalId. */
  private readonly index = new Map<string, string>();
  /** resolution cache keyed by the canonical query token. */
  private readonly cache = new Map<string, string>();

  constructor(seed: readonly { canonicalId: string; providerIds: Readonly<Record<string, string>> }[] = []) {
    for (const s of seed) {
      for (const token of tokens(s.providerIds)) this.index.set(token, s.canonicalId);
    }
  }

  resolve(query: IdentityQuery): IdentityResolution {
    const toks = tokens(query.providerIds);
    const cacheKey = toks.length > 0 ? toks.slice().sort(compareOrdinal).join('|') : `name:${query.nameNormalized}|${query.position ?? '?'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return { canonicalId: cached, newlyCreated: false, warnings: [] };

    const warnings: IngestionWarning[] = [];

    // Collect any canonical ids already known for these provider ids.
    const known = new Set<string>();
    for (const t of toks) {
      const c = this.index.get(t);
      if (c) known.add(c);
    }

    let canonicalId: string;
    let newlyCreated = false;
    if (known.size === 1) {
      canonicalId = [...known][0];
    } else if (known.size > 1) {
      // Conflict: the same player's provider ids point at different canonical ids.
      // Deterministic resolution — smallest canonical id wins; emit a diagnostic.
      canonicalId = [...known].sort(compareOrdinal)[0];
      warnings.push({
        code: 'IDENTITY_CONFLICT',
        provider: query.provider,
        detail: `conflicting canonical ids ${[...known].sort(compareOrdinal).join(',')} → chose ${canonicalId}`,
      });
    } else {
      canonicalId = mint(query);
      newlyCreated = true;
    }

    // Register (and detect a duplicate token pointing elsewhere).
    for (const t of toks) {
      const prior = this.index.get(t);
      if (prior && prior !== canonicalId) {
        warnings.push({ code: 'DUPLICATE_IDENTITY', provider: query.provider, detail: `${t} already mapped to ${prior}` });
        continue;
      }
      this.index.set(t, canonicalId);
    }
    this.cache.set(cacheKey, canonicalId);
    return { canonicalId, newlyCreated, warnings };
  }

  /** Read-only view of the current provider-id → canonical index (for diagnostics/tests). */
  snapshotIndex(): Readonly<Record<string, string>> {
    return Object.fromEntries([...this.index.entries()].sort((a, b) => compareOrdinal(a[0], b[0])));
  }
}

function tokens(providerIds: Readonly<Record<string, string>>): string[] {
  return Object.entries(providerIds)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}:${v}`);
}

/** Mint a stable canonical id from the strongest available key (deterministic). */
function mint(query: IdentityQuery): string {
  for (const key of KEY_PRIORITY) {
    const v = query.providerIds[key];
    if (v) return `pt-${digest(`${key}:${v}`)}`;
  }
  return `pt-${digest(`name:${query.nameNormalized}|pos:${query.position ?? '?'}`)}`;
}

// Deterministic identity resolution (Phase 4 §3) — SAFE MINTING.
//
// A canonical id is minted ONLY from a stable, namespaced provider identity token
// of the form `namespace:id` (e.g. `gsis:00-1`, `fantasypros:FP-111`). Names,
// positions, teams, suffixes, etc. are NEVER an independent merge key: they may inform
// diagnostics or validate an existing cross-id match, but they can never collapse two
// distinct provider identities into one canonical player. Cross-provider joins happen
// only through a SHARED stable id token. When a record's tokens point at more than one
// existing canonical id (a genuine conflict) the record is QUARANTINED with a typed
// diagnostic — never silently merged onto an arbitrary "winner". Two runs over the same
// inputs produce identical assignments.

import { digest } from '@/inference/util/checksum';
import { compareOrdinal } from './ordering';
import type { IngestionProvider, IngestionWarning, NormalizedPosition } from './types';

/**
 * Namespaces whose id tokens are PREFERRED when choosing which stable token mints the
 * canonical id. This is a preference for id *stability only*, NOT an allowlist: a token
 * whose namespace is absent here is still a fully valid stable token and still mints a
 * canonical id (ranked after the listed namespaces, then lexicographically). Removing a
 * namespace here can never cause two distinct players to merge — every namespaced token
 * remains eligible and distinct, because the token carries its namespace.
 */
const NAMESPACE_PRIORITY: readonly string[] = ['gsis', 'sleeper', 'pfr', 'espn', 'yahoo', 'sportradar'];

function namespaceRank(ns: string): number {
  const i = NAMESPACE_PRIORITY.indexOf(ns);
  return i === -1 ? NAMESPACE_PRIORITY.length : i;
}

export interface IdentityQuery {
  readonly providerIds: Readonly<Record<string, string>>;
  readonly nameNormalized: string;
  readonly position: NormalizedPosition | null;
  readonly provider: IngestionProvider;
}

export interface IdentityResolution {
  /**
   * The resolved canonical id, or `null` when the record cannot be safely resolved —
   * i.e. it carries no stable provider id token, or its tokens conflict across multiple
   * existing canonical ids. A `null` result is NEVER auto-merged with any other record.
   */
  readonly canonicalId: string | null;
  readonly newlyCreated: boolean;
  readonly warnings: readonly IngestionWarning[];
}

/**
 * Deterministic, cached identity resolver. Seed it with known mappings
 * (canonicalId → provider ids). Every unknown record with at least one stable provider
 * id token gets a deterministic minted id derived from its strongest stable token.
 * Records with NO stable token are left unresolved (never name-merged).
 */
export class IdentityResolver {
  /** provider-id token (`"gsis:00-1"`) → canonicalId. */
  private readonly index = new Map<string, string>();
  /** resolution cache keyed by the sorted token set. */
  private readonly cache = new Map<string, string>();

  constructor(seed: readonly { canonicalId: string; providerIds: Readonly<Record<string, string>> }[] = []) {
    for (const s of seed) {
      for (const token of tokens(s.providerIds)) this.index.set(token, s.canonicalId);
    }
  }

  resolve(query: IdentityQuery): IdentityResolution {
    const toks = tokens(query.providerIds);

    // No stable identity token → NEVER auto-merge on name/position. Leave unresolved.
    if (toks.length === 0) {
      return {
        canonicalId: null,
        newlyCreated: false,
        warnings: [
          {
            code: 'UNRESOLVED_IDENTITY',
            provider: query.provider,
            detail: `no stable provider id token for "${query.nameNormalized}" (${query.position ?? '?'}); not auto-merged`,
          },
        ],
      };
    }

    const cacheKey = toks.slice().sort(compareOrdinal).join('|');
    const cached = this.cache.get(cacheKey);
    if (cached) return { canonicalId: cached, newlyCreated: false, warnings: [] };

    const warnings: IngestionWarning[] = [];

    // Collect any canonical ids already known for these provider id tokens.
    const known = new Set<string>();
    for (const t of toks) {
      const c = this.index.get(t);
      if (c) known.add(c);
    }

    if (known.size > 1) {
      // CONFLICT: this record's tokens already belong to DIFFERENT canonical players.
      // Do not silently pick a winner (that would corrupt one of the two identities).
      // Quarantine the record (unresolved) with a typed diagnostic; an authoritative
      // crosswalk is required to intentionally join the two canonical players.
      return {
        canonicalId: null,
        newlyCreated: false,
        warnings: [
          {
            code: 'IDENTITY_CONFLICT',
            provider: query.provider,
            detail: `tokens [${toks.slice().sort(compareOrdinal).join(',')}] map to multiple canonical ids [${[...known].sort(compareOrdinal).join(',')}]; quarantined (no auto-merge)`,
          },
        ],
      };
    }

    const canonicalId = known.size === 1 ? [...known][0] : mint(toks);
    const newlyCreated = known.size === 0;

    // Register every token to the resolved canonical id (extends cross-id linkage for a
    // legitimate join). A token already mapped elsewhere is reported, not overwritten.
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

/**
 * Mint a stable canonical id from the strongest stable token. Selection is fully
 * deterministic: preferred namespace first (for id stability), then lexicographic.
 * Because every token is `namespace:id`, distinct namespaced ids ALWAYS mint distinct
 * canonical ids — `espn:12345` and `sleeper:12345` never collide, and
 * `fantasypros:FP-111` and `fantasypros:FP-999` never collide. The chosen form is
 * byte-identical to the prior implementation for the reference namespaces (`gsis:…`),
 * so previously-minted canonical ids are unchanged.
 */
function mint(toks: readonly string[]): string {
  const strongest = [...toks].sort((a, b) => {
    const ra = namespaceRank(namespaceOf(a));
    const rb = namespaceRank(namespaceOf(b));
    return ra !== rb ? ra - rb : compareOrdinal(a, b);
  })[0];
  return `pt-${digest(strongest)}`;
}

function namespaceOf(token: string): string {
  const i = token.indexOf(':');
  return i === -1 ? token : token.slice(0, i);
}

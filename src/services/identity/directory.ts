// Runtime read side of the identity layer: a validated, indexed, immutable
// view over one PlayerDirectorySnapshot.
//
// The browser NEVER talks to Sleeper/nflverse through this class — it reads
// the committed snapshot produced by `npm run ingest:identity` (see ingest.ts
// for the boundary rationale). Deterministic fixtures and the rest of the app
// keep working when the snapshot is empty or stale: lookups just return null
// and freshness reports say so honestly.

import { playerDirectorySnapshotSchema } from '@/services/identity/schemas';
import type {
  CanonicalPlayerIdentity,
  DirectoryReview,
  PlayerDirectorySnapshot,
  ResolutionResult,
} from '@/services/identity/types';
import type { Position } from '@/types/market';

/** Sentinel generatedAt for the committed placeholder before any real run. */
export const NEVER_GENERATED = '1970-01-01T00:00:00.000Z';

export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60_000; // Sleeper's once-per-day rule

export interface DirectoryFreshness {
  generatedAt: string;
  effectiveSeason: number | null;
  /** True when any source served cached data after a failed refresh. */
  anySourceStale: boolean;
  /** Provider error strings (empty when everything succeeded). */
  errors: string[];
  /** True until a real ingestion run has ever produced this snapshot. */
  neverIngested: boolean;
}

export class PlayerIdentityDirectory {
  private readonly byId = new Map<string, CanonicalPlayerIdentity>();
  private readonly bySleeper = new Map<string, CanonicalPlayerIdentity>();
  private readonly byGsis = new Map<string, CanonicalPlayerIdentity>();

  constructor(public readonly snapshot: PlayerDirectorySnapshot) {
    for (const p of snapshot.players) {
      this.byId.set(p.playerTickerId, p);
      if (p.sleeperId) this.bySleeper.set(p.sleeperId, p);
      if (p.gsisId) this.byGsis.set(p.gsisId, p);
    }
  }

  /** Validate an untrusted snapshot payload; throws with a readable message. */
  static fromJson(raw: unknown): PlayerIdentityDirectory {
    const parsed = playerDirectorySnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(
        `player directory snapshot is invalid: ${first?.path.join('.') ?? '?'} — ${first?.message ?? 'unknown'}`,
      );
    }
    return new PlayerIdentityDirectory(parsed.data as PlayerDirectorySnapshot);
  }

  /** An empty, never-ingested directory (safe default when no snapshot exists). */
  static empty(): PlayerIdentityDirectory {
    const noMeta = {
      url: '',
      fetchedAt: null,
      checksum: null,
      recordCount: null,
      invalidRecords: null,
      stale: false,
      error: 'no ingestion run yet',
    };
    return new PlayerIdentityDirectory({
      schemaVersion: 1,
      normalizationVersion: 1,
      generatedAt: NEVER_GENERATED,
      effectiveSeason: null,
      sources: { sleeper: { ...noMeta }, nflverseRoster: { ...noMeta }, nflversePlayers: { ...noMeta } },
      players: [],
      sourceIdMaps: [],
      review: {
        ambiguous: [],
        unmatched: [],
        reviewRequired: [],
        methodCounts: {
          EXISTING_MAPPING: 0,
          DIRECT_CROSSWALK: 0,
          GSIS_ID: 0,
          NAME_BIRTHDATE_POSITION: 0,
          NAME_TEAM_POSITION: 0,
          MANUAL: 0,
          NEW_IDENTITY: 0,
        },
      },
    });
  }

  getByPlayerTickerId(id: string): CanonicalPlayerIdentity | null {
    return this.byId.get(id) ?? null;
  }

  getBySleeperId(sleeperId: string): CanonicalPlayerIdentity | null {
    return this.bySleeper.get(sleeperId) ?? null;
  }

  getByGsisId(gsisId: string): CanonicalPlayerIdentity | null {
    return this.byGsis.get(gsisId) ?? null;
  }

  /** Lookup as an explicit resolution outcome (mapping-table only — no guessing). */
  resolveSleeperId(sleeperId: string): ResolutionResult {
    if (!sleeperId) return { status: 'INVALID', reason: 'empty Sleeper id' };
    const map = this.snapshot.sourceIdMaps.find(
      (m) => m.source === 'SLEEPER' && m.sourcePlayerId === sleeperId && m.validTo === null,
    );
    if (map) return { status: 'MATCHED', playerTickerId: map.playerTickerId, method: map.matchMethod };
    return { status: 'UNMATCHED', reason: `no current mapping for Sleeper id ${sleeperId}` };
  }

  listPlayers(position?: Position): CanonicalPlayerIdentity[] {
    const all = this.snapshot.players;
    return position ? all.filter((p) => p.position === position) : [...all];
  }

  getReview(): DirectoryReview {
    return this.snapshot.review;
  }

  getFreshness(): DirectoryFreshness {
    const metas = [
      this.snapshot.sources.sleeper,
      this.snapshot.sources.nflverseRoster,
      this.snapshot.sources.nflversePlayers,
    ];
    return {
      generatedAt: this.snapshot.generatedAt,
      effectiveSeason: this.snapshot.effectiveSeason,
      anySourceStale: metas.some((m) => m.stale),
      errors: metas.map((m) => m.error).filter((e): e is string => e !== null),
      neverIngested: this.snapshot.generatedAt === NEVER_GENERATED,
    };
  }

  /** True when the snapshot is older than maxAgeMs (or never ingested). */
  isStale(nowMs: number, maxAgeMs: number = DEFAULT_MAX_AGE_MS): boolean {
    const generated = Date.parse(this.snapshot.generatedAt);
    if (!Number.isFinite(generated)) return true;
    return nowMs - generated > maxAgeMs;
  }
}

/**
 * Load the committed snapshot (src/data/identity/player-directory.json).
 * Dynamic import keeps the directory out of the initial bundle; an invalid or
 * missing snapshot degrades to an empty directory rather than crashing.
 */
export async function loadCommittedDirectory(): Promise<PlayerIdentityDirectory> {
  try {
    const mod = await import('@/data/identity/player-directory.json');
    return PlayerIdentityDirectory.fromJson((mod as { default: unknown }).default);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[identity] committed directory unavailable:', err);
    return PlayerIdentityDirectory.empty();
  }
}

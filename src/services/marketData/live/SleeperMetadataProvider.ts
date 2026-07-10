// SleeperMetadataProvider — fetches, validates, matches, and caches LIVE
// PLAYER METADATA (identity facts only). It supplies nothing to the pricing
// engine; prices, signals, and every other market number remain the
// deterministic engine's output.
//
// FIELDS MAPPED FROM SLEEPER (per record, validated):
//   full_name → Player.displayName          team → Player.team ('FA' when null)
//   status/injury_status/active → Player.status (+ injuryDesignation, kept
//     display-side only — the ENGINE keeps its authored status so prices
//     stay deterministic)
//   years_exp === 0 → Player.isRookie       player_id → identity.sleeper_id
//   espn_id/yahoo_id/gsis_id → identity external ids
//   trending add/drop counts → PlayerRow/PlayerDetail.trending (informational)
//
// FIELDS INTENTIONALLY LEFT SIMULATED (documented decision):
//   age & position — both are ENGINE INPUTS (age curve, positional scarcity).
//   Overriding the displayed value while the engine prices the authored value
//   would make the card contradict its own market math. Position is instead
//   used as a MATCHING KEY (a Sleeper record with a different position simply
//   doesn't match and is reported), and authored age is kept for consistency.
//
// MATCHING (stable internal ids are never replaced):
//   normalized name (diacritics/suffix/punctuation-stripped) + position must
//   match; team is only a tiebreaker when two records share name+position.
//   0 candidates → unmatched (authored metadata kept, reported).
//   >1 candidates after tiebreak → AMBIGUOUS (reported, never guessed).
//   A Sleeper id can be claimed once; a second claim is reported as ambiguous.
//
// CACHING: we never persist the raw ~5MB payload — only the distilled match
// result (~20KB). Players TTL 24h (Sleeper's documented once-per-day rule),
// trending TTL 30min, stale-while-revalidate on both, in-flight dedup, and
// offline/failure falls back to any cached copy regardless of age.

import { POOL, type PlayerSeed } from '@/data/pool';
import { browserStorage, type StorageLike } from '@/services/storage/storage';
import {
  playersCacheSchema,
  sleeperPlayerSchema,
  trendingCacheSchema,
  trendingEntrySchema,
  trendingResponseSchema,
  type MatchedMeta,
  type PlayersCache,
  type SleeperPlayer,
  type TrendingCache,
} from '@/services/marketData/live/sleeperSchemas';
import { SleeperClient } from '@/services/marketData/live/sleeperClient';
import type { PlayerStatus } from '@/types/market';

export const SLEEPER_CACHE_KEYS = {
  players: 'pt.sleeper.players.v1',
  trending: 'pt.sleeper.trending.v1',
} as const;

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface SourceReport {
  health: 'ok' | 'degraded' | 'down';
  lastSuccessfulUpdate?: string;
  detail: string;
}

export interface SleeperProviderOptions {
  client?: SleeperClient;
  storage?: StorageLike;
  pool?: readonly PlayerSeed[];
  playersTtlMs?: number;
  trendingTtlMs?: number;
  /**
   * After a failed refresh, don't re-attempt the network for this long
   * (circuit-breaker): a down API must not add retry latency to every page
   * navigation, and we must not spam Sleeper while it's failing.
   */
  failureCooldownMs?: number;
  now?: () => number;
}

// ---------- name normalization ----------
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SUFFIXES.has(w));
  return words.join('');
}

function mapStatus(p: SleeperPlayer): { status: PlayerStatus; injuryDesignation?: string } {
  if (p.injury_status) return { status: 'injured', injuryDesignation: p.injury_status };
  const s = (p.status ?? '').toLowerCase();
  if (s.includes('sus')) return { status: 'suspended' };
  if (p.active === false || s.includes('inactive')) return { status: 'inactive' };
  if (s.includes('injured') || s.includes('pup')) return { status: 'injured', injuryDesignation: p.status ?? undefined };
  return { status: 'active' };
}

export interface MatchOutcome {
  matches: Record<string, MatchedMeta>;
  unmatchedIds: string[];
  ambiguousIds: string[];
  invalidRecords: number;
}

/** Pure matching over a validated candidate list — exported for tests. */
export function matchPool(pool: readonly PlayerSeed[], candidates: SleeperPlayer[]): MatchOutcome {
  const index = new Map<string, SleeperPlayer[]>();
  for (const c of candidates) {
    const display = c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (!display) continue;
    const key = nameKey(display);
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(c);
    else index.set(key, [c]);
  }

  const matches: Record<string, MatchedMeta> = {};
  const unmatchedIds: string[] = [];
  const ambiguousIds: string[] = [];
  const claimedSleeperIds = new Set<string>();

  for (const seed of pool) {
    const key = nameKey(seed.name);
    const byName = index.get(key) ?? [];
    let cands = byName.filter((c) => (c.position ?? '') === seed.pos);
    if (cands.length > 1) {
      const byTeam = cands.filter((c) => (c.team ?? '') === seed.team);
      if (byTeam.length === 1) cands = byTeam;
    }
    if (cands.length === 0) {
      unmatchedIds.push(seed.id);
      continue;
    }
    if (cands.length > 1) {
      ambiguousIds.push(seed.id); // never guess between candidates
      continue;
    }
    const c = cands[0];
    if (claimedSleeperIds.has(c.player_id)) {
      // Two internal players resolved to one Sleeper record — a data problem
      // we surface rather than silently duplicate.
      ambiguousIds.push(seed.id);
      continue;
    }
    claimedSleeperIds.add(c.player_id);
    const { status, injuryDesignation } = mapStatus(c);
    matches[seed.id] = {
      sleeperId: c.player_id,
      name: (c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(' ')) || seed.name,
      team: c.team ?? 'FA',
      status,
      ...(injuryDesignation ? { injuryDesignation } : {}),
      isRookie: c.years_exp === 0,
      ...(c.espn_id != null ? { espnId: String(c.espn_id) } : {}),
      ...(c.yahoo_id != null ? { yahooId: String(c.yahoo_id) } : {}),
      ...(c.gsis_id ? { gsisId: c.gsis_id } : {}),
    };
  }

  return { matches, unmatchedIds, ambiguousIds, invalidRecords: 0 };
}

/** Validate the raw /players/nfl map and match it against the pool. */
export function buildMatchesFromRaw(raw: unknown, pool: readonly PlayerSeed[]): MatchOutcome {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Sleeper players payload is not an object map');
  }
  const candidates: SleeperPlayer[] = [];
  let invalid = 0;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    // Cheap prefilter before zod: only fantasy positions can ever match.
    const pos = (value as { position?: unknown } | null)?.position;
    if (typeof pos !== 'string' || !FANTASY_POSITIONS.has(pos)) continue;
    const parsed = sleeperPlayerSchema.safeParse(value);
    if (!parsed.success) {
      invalid += 1;
      continue; // one malformed record never poisons the rest
    }
    candidates.push(parsed.data);
  }
  const outcome = matchPool(pool, candidates);
  return { ...outcome, invalidRecords: invalid };
}

// ---------- provider ----------
export class SleeperMetadataProvider {
  private readonly client: SleeperClient;
  private readonly storage: StorageLike;
  private readonly pool: readonly PlayerSeed[];
  private readonly playersTtlMs: number;
  private readonly trendingTtlMs: number;
  private readonly now: () => number;

  private playersMemo: PlayersCache | null = null;
  private trendingMemo: TrendingCache | null = null;
  private playersInflight: Promise<PlayersCache | null> | null = null;
  private trendingInflight: Promise<TrendingCache | null> | null = null;
  private playersHealth: 'ok' | 'degraded' | 'down' = 'down';
  private trendingHealth: 'ok' | 'degraded' | 'down' = 'down';
  private lastPlayersError = 'Not yet fetched';
  private lastTrendingError = 'Not yet fetched';
  private playersFailedAt = 0;
  private trendingFailedAt = 0;
  private readonly failureCooldownMs: number;

  constructor(opts: SleeperProviderOptions = {}) {
    this.client = opts.client ?? new SleeperClient();
    this.storage = opts.storage ?? browserStorage;
    this.pool = opts.pool ?? POOL;
    this.playersTtlMs = opts.playersTtlMs ?? 24 * 60 * 60_000; // Sleeper: 1/day
    this.trendingTtlMs = opts.trendingTtlMs ?? 30 * 60_000;
    this.failureCooldownMs = opts.failureCooldownMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  // ----- players metadata (SWR) -----
  async getPlayersMeta(): Promise<PlayersCache | null> {
    const cached = this.readPlayersCache();
    if (cached) {
      this.playersMemo = cached;
      this.playersHealth = 'ok';
      const fresh = this.now() - cached.fetchedAt < this.playersTtlMs;
      if (!fresh) void this.refreshPlayers(); // stale-while-revalidate
      return cached;
    }
    return this.refreshPlayers();
  }

  private readPlayersCache(): PlayersCache | null {
    if (this.playersMemo) return this.playersMemo;
    const raw = this.storage.get(SLEEPER_CACHE_KEYS.players);
    if (!raw) return null;
    try {
      const parsed = playersCacheSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private refreshPlayers(): Promise<PlayersCache | null> {
    if (this.playersInflight) return this.playersInflight; // dedup
    if (this.playersFailedAt && this.now() - this.playersFailedAt < this.failureCooldownMs) {
      return Promise.resolve(this.readPlayersCache()); // circuit open — no network
    }
    this.playersInflight = (async () => {
      try {
        const raw = await this.client.getAllPlayers();
        const outcome = buildMatchesFromRaw(raw, this.pool);
        const cache: PlayersCache = {
          version: 1,
          fetchedAt: this.now(),
          matches: outcome.matches,
          unmatchedIds: outcome.unmatchedIds,
          ambiguousIds: outcome.ambiguousIds,
        };
        this.playersMemo = cache;
        this.playersHealth = 'ok';
        this.playersFailedAt = 0;
        this.storage.set(SLEEPER_CACHE_KEYS.players, JSON.stringify(cache));
        if (import.meta.env.DEV && (outcome.unmatchedIds.length || outcome.ambiguousIds.length)) {
          console.warn(
            `[sleeper] unmatched internal ids: ${outcome.unmatchedIds.join(', ') || 'none'}; ` +
              `ambiguous (not guessed): ${outcome.ambiguousIds.join(', ') || 'none'}; ` +
              `invalid records skipped: ${outcome.invalidRecords}`,
          );
        }
        return cache;
      } catch (err) {
        this.lastPlayersError = err instanceof Error ? err.message : String(err);
        this.playersFailedAt = this.now();
        // Serve ANY cached copy (even stale) before giving up entirely.
        const stale = this.readPlayersCache();
        this.playersHealth = stale ? 'degraded' : 'down';
        return stale;
      } finally {
        this.playersInflight = null;
      }
    })();
    return this.playersInflight;
  }

  // ----- trending (SWR) -----
  async getTrending(): Promise<TrendingCache | null> {
    const cached = this.readTrendingCache();
    if (cached) {
      this.trendingMemo = cached;
      this.trendingHealth = 'ok';
      const fresh = this.now() - cached.fetchedAt < this.trendingTtlMs;
      if (!fresh) void this.refreshTrending();
      return cached;
    }
    return this.refreshTrending();
  }

  private readTrendingCache(): TrendingCache | null {
    if (this.trendingMemo) return this.trendingMemo;
    const raw = this.storage.get(SLEEPER_CACHE_KEYS.trending);
    if (!raw) return null;
    try {
      const parsed = trendingCacheSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private refreshTrending(): Promise<TrendingCache | null> {
    if (this.trendingInflight) return this.trendingInflight;
    if (this.trendingFailedAt && this.now() - this.trendingFailedAt < this.failureCooldownMs) {
      return Promise.resolve(this.readTrendingCache()); // circuit open
    }
    this.trendingInflight = (async () => {
      try {
        const [addsRaw, dropsRaw] = await Promise.all([
          this.client.getTrending('add'),
          this.client.getTrending('drop'),
        ]);
        const toMap = (raw: unknown): Record<string, number> => {
          const arr = trendingResponseSchema.parse(raw);
          const map: Record<string, number> = {};
          for (const entry of arr) {
            const parsed = trendingEntrySchema.safeParse(entry);
            if (parsed.success) map[parsed.data.player_id] = parsed.data.count;
          }
          return map;
        };
        const cache: TrendingCache = {
          version: 1,
          fetchedAt: this.now(),
          adds: toMap(addsRaw),
          drops: toMap(dropsRaw),
        };
        this.trendingMemo = cache;
        this.trendingHealth = 'ok';
        this.trendingFailedAt = 0;
        this.storage.set(SLEEPER_CACHE_KEYS.trending, JSON.stringify(cache));
        return cache;
      } catch (err) {
        this.lastTrendingError = err instanceof Error ? err.message : String(err);
        this.trendingFailedAt = this.now();
        const stale = this.readTrendingCache();
        this.trendingHealth = stale ? 'degraded' : 'down';
        return stale;
      } finally {
        this.trendingInflight = null;
      }
    })();
    return this.trendingInflight;
  }

  // ----- status reporting for the honesty layer -----
  getPlayersReport(): SourceReport {
    const c = this.playersMemo;
    if (!c) {
      return {
        health: this.playersHealth,
        detail: `Player metadata unavailable (${this.lastPlayersError}) — showing authored demo names/teams.`,
      };
    }
    const matched = Object.keys(c.matches).length;
    const parts = [`${matched}/${this.pool.length} players matched`];
    if (c.unmatchedIds.length) parts.push(`${c.unmatchedIds.length} unmatched (demo metadata kept)`);
    if (c.ambiguousIds.length) parts.push(`${c.ambiguousIds.length} ambiguous (reported, not guessed)`);
    return {
      health: this.playersHealth,
      lastSuccessfulUpdate: new Date(c.fetchedAt).toISOString(),
      detail: parts.join(' · '),
    };
  }

  getTrendingReport(): SourceReport {
    const c = this.trendingMemo;
    if (!c) {
      return {
        health: this.trendingHealth,
        detail: `Trending unavailable (${this.lastTrendingError}).`,
      };
    }
    return {
      health: this.trendingHealth,
      lastSuccessfulUpdate: new Date(c.fetchedAt).toISOString(),
      detail: `${Object.keys(c.adds).length} trending adds · ${Object.keys(c.drops).length} drops (24h)`,
    };
  }
}

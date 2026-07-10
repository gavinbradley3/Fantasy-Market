// P1 Wave 1 tests: Sleeper client behaviour (timeout/retry/offline), payload
// validation + matching (ambiguity is reported, never guessed), caching
// (hits, expiration, SWR, fallback-to-stale), and the LiveMarketDataService
// guarantee that DETERMINISTIC PRICES ARE BYTE-IDENTICAL with live metadata
// on, off, or failing.

import { describe, expect, it, vi } from 'vitest';
import { OfflineError, SleeperClient, SleeperHttpError } from '@/services/marketData/live/sleeperClient';
import {
  SLEEPER_CACHE_KEYS,
  SleeperMetadataProvider,
  buildMatchesFromRaw,
  matchPool,
  nameKey,
} from '@/services/marketData/live/SleeperMetadataProvider';
import { LiveMarketDataService } from '@/services/marketData/live/LiveMarketDataService';
import { MockMarketDataService } from '@/services/marketData/mock/MockMarketDataService';
import { memoryStorage } from '@/services/storage/storage';
import type { PlayerSeed } from '@/data/pool';

// ---------- helpers ----------
const jsonResponse = (data: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => data }) as unknown as Response;

const noDelay = async () => {};

function makeSeed(overrides: Partial<PlayerSeed>): PlayerSeed {
  return {
    id: 'pt_9001', ticker: 'TST', name: 'Test Player', pos: 'WR', team: 'AAA',
    age: 25, exp: 3, prod: 50, usage: 50, opp: 50, eff: 50, role: 50, off: 50,
    td: 30, inj: 20, hype: 30, games: 16, mis: 0,
    ...overrides,
  };
}

// A realistic slice of the /players/nfl map. Includes: a clean match with
// external ids, a name shared across positions (QB vs LB Josh Allen), an
// injured player, a free agent (team: null), a non-fantasy position, and a
// malformed record.
const SLEEPER_FIXTURE: Record<string, unknown> = {
  '4046': {
    player_id: '4046', full_name: "Ja'Marr Chase", position: 'WR', team: 'CIN',
    status: 'Active', active: true, years_exp: 5, espn_id: 4362628, gsis_id: '00-0036900',
  },
  '4984': {
    player_id: '4984', full_name: 'Josh Allen', position: 'QB', team: 'BUF',
    status: 'Active', active: true, years_exp: 8,
  },
  '4985': {
    player_id: '4985', full_name: 'Josh Allen', position: 'LB', team: 'JAX',
    status: 'Active', active: true, years_exp: 7,
  },
  '11631': {
    player_id: '11631', full_name: 'Malik Nabers', position: 'WR', team: 'NYG',
    status: 'Active', injury_status: 'Questionable', active: true, years_exp: 2,
  },
  '6797': {
    player_id: '6797', full_name: 'Austin Ekeler', position: 'RB', team: null,
    status: 'Active', active: true, years_exp: 8,
  },
  DET: { player_id: 'DET', position: 'DEF', team: 'DET' },
  bad: { player_id: 12345, position: 'WR' }, // malformed: player_id not string
};

const TRENDING_ADD_FIXTURE = [
  { player_id: '11631', count: 4321 },
  { player_id: '4046', count: 120 },
];
const TRENDING_DROP_FIXTURE = [{ player_id: '11631', count: 77 }];

function fixtureFetch(): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.endsWith('/players/nfl')) return jsonResponse(SLEEPER_FIXTURE);
    if (u.includes('/trending/add')) return jsonResponse(TRENDING_ADD_FIXTURE);
    if (u.includes('/trending/drop')) return jsonResponse(TRENDING_DROP_FIXTURE);
    return jsonResponse({ error: 'not found' }, 404);
  }) as unknown as typeof fetch;
}

function failingFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new TypeError('network unreachable');
  }) as unknown as typeof fetch;
}

function makeProvider(fetchFn: typeof fetch, extra: Partial<ConstructorParameters<typeof SleeperMetadataProvider>[0]> = {}) {
  return new SleeperMetadataProvider({
    client: new SleeperClient({ fetchFn, delay: noDelay, retries: 1, isOnline: () => true }),
    storage: memoryStorage(),
    ...extra,
  });
}

// ---------- client ----------
describe('SleeperClient', () => {
  it('returns parsed JSON on success', async () => {
    const client = new SleeperClient({ fetchFn: fixtureFetch(), delay: noDelay });
    const data = (await client.getAllPlayers()) as Record<string, unknown>;
    expect(data['4046']).toBeTruthy();
  });

  it('retries on 5xx and succeeds', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse({}, 503) : jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    const client = new SleeperClient({ fetchFn, delay: noDelay, retries: 2 });
    await expect(client.getJson('/x')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('does NOT retry on 4xx (a real answer, not a transient fault)', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;
    const client = new SleeperClient({ fetchFn, delay: noDelay, retries: 3 });
    await expect(client.getJson('/x')).rejects.toBeInstanceOf(SleeperHttpError);
    expect(calls).toBe(1);
  });

  it('times out hung requests via AbortController', async () => {
    const fetchFn = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    const client = new SleeperClient({ fetchFn, delay: noDelay, timeoutMs: 15, retries: 0 });
    await expect(client.getJson('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('short-circuits to OfflineError without touching the network', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const client = new SleeperClient({ fetchFn, isOnline: () => false, delay: noDelay });
    await expect(client.getJson('/x')).rejects.toBeInstanceOf(OfflineError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('exhausted retries surface the last network error', async () => {
    const client = new SleeperClient({ fetchFn: failingFetch(), delay: noDelay, retries: 2 });
    await expect(client.getJson('/x')).rejects.toBeInstanceOf(TypeError);
  });
});

// ---------- name normalization + matching ----------
describe('nameKey', () => {
  it('normalizes punctuation, suffixes, and diacritics', () => {
    expect(nameKey("Ja'Marr Chase")).toBe('jamarrchase');
    expect(nameKey('Kenneth Walker III')).toBe('kennethwalker');
    expect(nameKey('Amon-Ra St. Brown')).toBe('amonrastbrown');
    expect(nameKey('Luther Burden III')).toBe('lutherburden');
  });
});

describe('matching', () => {
  it('matches by name + position; a same-name different-position record cannot match', () => {
    const outcome = buildMatchesFromRaw(SLEEPER_FIXTURE, [
      makeSeed({ id: 'pt_0001', name: 'Josh Allen', pos: 'QB', team: 'BUF' }),
    ]);
    expect(outcome.matches['pt_0001']?.sleeperId).toBe('4984'); // the QB, not the LB
  });

  it('maps status, injury designation, team-null → FA, and external ids', () => {
    const outcome = buildMatchesFromRaw(SLEEPER_FIXTURE, [
      makeSeed({ id: 'pt_0001', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN' }),
      makeSeed({ id: 'pt_0002', name: 'Malik Nabers', pos: 'WR', team: 'NYG' }),
      makeSeed({ id: 'pt_0003', name: 'Austin Ekeler', pos: 'RB', team: 'WAS' }),
    ]);
    expect(outcome.matches['pt_0001']).toMatchObject({
      sleeperId: '4046', status: 'active', espnId: '4362628', gsisId: '00-0036900',
    });
    expect(outcome.matches['pt_0002']).toMatchObject({
      status: 'injured', injuryDesignation: 'Questionable',
    });
    expect(outcome.matches['pt_0003']).toMatchObject({ team: 'FA' });
    expect(outcome.invalidRecords).toBe(1); // the malformed record was skipped
  });

  it('reports unmatched players instead of guessing', () => {
    const outcome = buildMatchesFromRaw(SLEEPER_FIXTURE, [
      makeSeed({ id: 'pt_0042', name: 'Nonexistent Person', pos: 'WR' }),
    ]);
    expect(outcome.matches['pt_0042']).toBeUndefined();
    expect(outcome.unmatchedIds).toContain('pt_0042');
  });

  it('same-name same-position with distinct teams resolves via team tiebreak', () => {
    const twins = [
      { player_id: 't1', full_name: 'Twin Player', position: 'WR', team: 'AAA' },
      { player_id: 't2', full_name: 'Twin Player', position: 'WR', team: 'BBB' },
    ];
    const outcome = matchPool(
      [makeSeed({ id: 'pt_0001', name: 'Twin Player', pos: 'WR', team: 'AAA' })],
      twins.map((t) => ({ ...t })),
    );
    expect(outcome.matches['pt_0001']?.sleeperId).toBe('t1');
  });

  it('true ambiguity (same name, position, team) is REPORTED, never guessed', () => {
    const clones = [
      { player_id: 'c1', full_name: 'Twin Player', position: 'WR', team: 'AAA' },
      { player_id: 'c2', full_name: 'Twin Player', position: 'WR', team: 'AAA' },
    ];
    const outcome = matchPool(
      [makeSeed({ id: 'pt_0001', name: 'Twin Player', pos: 'WR', team: 'AAA' })],
      clones.map((c) => ({ ...c })),
    );
    expect(outcome.matches['pt_0001']).toBeUndefined();
    expect(outcome.ambiguousIds).toContain('pt_0001');
  });

  it('one Sleeper record can never be claimed by two internal players', () => {
    const single = [{ player_id: 's1', full_name: 'Solo Guy', position: 'WR', team: 'AAA' }];
    const outcome = matchPool(
      [
        makeSeed({ id: 'pt_0001', name: 'Solo Guy', pos: 'WR', team: 'AAA' }),
        makeSeed({ id: 'pt_0002', ticker: 'TS2', name: 'Solo Guy', pos: 'WR', team: 'AAA' }),
      ],
      single.map((s) => ({ ...s })),
    );
    expect(outcome.matches['pt_0001']?.sleeperId).toBe('s1');
    expect(outcome.matches['pt_0002']).toBeUndefined();
    expect(outcome.ambiguousIds).toContain('pt_0002');
  });

  it('rejects a payload that is not an object map', () => {
    expect(() => buildMatchesFromRaw([1, 2, 3], [])).toThrow(/not an object map/);
  });
});

// ---------- provider caching ----------
describe('SleeperMetadataProvider caching', () => {
  it('caches the match result — a second call is a cache hit (no fetch)', async () => {
    const fetchFn = fixtureFetch();
    const provider = makeProvider(fetchFn);
    await provider.getPlayersMeta();
    await provider.getPlayersMeta();
    const playerCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).endsWith('/players/nfl'),
    );
    expect(playerCalls).toHaveLength(1);
  });

  it('persists a pruned cache (never the raw payload) and reloads it', async () => {
    const storage = memoryStorage();
    const provider = makeProvider(fixtureFetch(), { storage });
    await provider.getPlayersMeta();
    const raw = storage.get(SLEEPER_CACHE_KEYS.players)!;
    expect(raw.length).toBeLessThan(50_000); // pruned, not 5MB
    expect(JSON.parse(raw).version).toBe(1);

    // A NEW provider with a failing network serves the persisted cache.
    const offlineProvider = makeProvider(failingFetch(), { storage });
    const meta = await offlineProvider.getPlayersMeta();
    expect(meta).not.toBeNull();
    expect(Object.keys(meta!.matches).length).toBeGreaterThan(0);
  });

  it('expired cache: serves stale immediately, revalidates in background (SWR)', async () => {
    const storage = memoryStorage();
    let nowValue = 1_000_000;
    const fetchFn = fixtureFetch();
    const provider = makeProvider(fetchFn, { storage, now: () => nowValue, playersTtlMs: 1000 });

    await provider.getPlayersMeta(); // primes cache at t=1,000,000
    nowValue += 10_000; // TTL (1s) exceeded

    const served = await provider.getPlayersMeta(); // stale served instantly
    expect(served).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0)); // let background refresh land
    const after = await provider.getPlayersMeta();
    expect(after!.fetchedAt).toBe(nowValue); // revalidated
  });

  it('total failure with no cache reports health down and returns null', async () => {
    const provider = makeProvider(failingFetch());
    const meta = await provider.getPlayersMeta();
    expect(meta).toBeNull();
    expect(provider.getPlayersReport().health).toBe('down');
    expect(provider.getPlayersReport().detail).toMatch(/unavailable/i);
  });

  it('malformed payload is handled as a failure, not a crash', async () => {
    const fetchFn = vi.fn(async () => jsonResponse('not-an-object')) as unknown as typeof fetch;
    const provider = makeProvider(fetchFn);
    await expect(provider.getPlayersMeta()).resolves.toBeNull();
    expect(provider.getPlayersReport().health).toBe('down');
  });

  it('failure cooldown: a down API is not re-hit on every call (circuit-breaker)', async () => {
    const fetchFn = failingFetch();
    let nowValue = 1_000_000;
    const provider = makeProvider(fetchFn, { now: () => nowValue, failureCooldownMs: 60_000 });
    await provider.getPlayersMeta(); // fails (1 attempt + 1 retry)
    const callsAfterFirst = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.length;
    await provider.getPlayersMeta(); // inside cooldown — must not touch network
    await provider.getPlayersMeta();
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);

    nowValue += 61_000; // cooldown elapsed — attempts resume
    await provider.getPlayersMeta();
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('trending fetch produces add/drop maps', async () => {
    const provider = makeProvider(fixtureFetch());
    const trending = await provider.getTrending();
    expect(trending!.adds['11631']).toBe(4321);
    expect(trending!.drops['11631']).toBe(77);
  });
});

// ---------- LiveMarketDataService ----------
describe('LiveMarketDataService', () => {
  const FORMAT = 'dyn_sf_half' as const;

  it('DETERMINISM GATE: prices/signals identical to the demo service with live metadata ON', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(fixtureFetch()) });
    const mock = new MockMarketDataService();
    const [liveBoard, mockBoard] = await Promise.all([live.getBoard(FORMAT), mock.getBoard(FORMAT)]);
    expect(liveBoard.length).toBe(mockBoard.length);
    for (let i = 0; i < mockBoard.length; i++) {
      expect(liveBoard[i].snapshot.marketPrice).toBe(mockBoard[i].snapshot.marketPrice);
      expect(liveBoard[i].snapshot.mispricing).toBe(mockBoard[i].snapshot.mispricing);
      expect(liveBoard[i].snapshot.volatility).toBe(mockBoard[i].snapshot.volatility);
      expect(liveBoard[i].signal.signal).toBe(mockBoard[i].signal.signal);
    }
  });

  it('DETERMINISM GATE: prices identical with Sleeper completely down', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(failingFetch()) });
    const mock = new MockMarketDataService();
    const [liveBoard, mockBoard] = await Promise.all([live.getBoard(FORMAT), mock.getBoard(FORMAT)]);
    for (let i = 0; i < mockBoard.length; i++) {
      expect(liveBoard[i].snapshot.marketPrice).toBe(mockBoard[i].snapshot.marketPrice);
    }
  });

  it('overlays live identity on matched players and attaches trending info', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(fixtureFetch()) });
    const nab = await live.getPlayer('NAB', FORMAT);
    expect(nab!.player.identity.sleeper_id).toBe('11631');
    expect(nab!.player.status).toBe('injured'); // display-side; engine untouched
    expect(nab!.trending).toEqual({ adds24h: 4321, drops24h: 77 });
    // Unmatched player keeps authored metadata and gets no trending.
    const bow = await live.getPlayer('BOW', FORMAT);
    expect(bow!.player.identity.sleeper_id).toBeUndefined();
    expect(bow!.trending).toBeUndefined();
  });

  it('falls back to authored demo metadata when Sleeper is down', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(failingFetch()) });
    const nab = await live.getPlayer('NAB', FORMAT);
    expect(nab!.player.displayName).toBe('Malik Nabers'); // authored
    expect(nab!.player.identity.sleeper_id).toBeUndefined();
    expect(nab!.trending).toBeUndefined();
  });

  it('honesty layer: mixed mode when metadata is live, with per-source status', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(fixtureFetch()) });
    const status = await live.getMarketStatus();
    expect(status.mode).toBe('mixed');
    expect(status.notice).toMatch(/Simulated market/i);
    const players = status.sources.find((s) => s.sourceId === 'sleeper_players')!;
    expect(players.mode).toBe('live');
    expect(players.coverage).toMatch(/\d+\/141 players matched/);
  });

  it('honesty layer: degrades to demo mode with an explanation when Sleeper is down', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(failingFetch()) });
    const status = await live.getMarketStatus();
    expect(status.mode).toBe('demo');
    expect(status.notice).toMatch(/unavailable/i);
    const players = status.sources.find((s) => s.sourceId === 'sleeper_players')!;
    expect(players.health).toBe('down');
  });

  it('a trending-only failure keeps metadata live and never throws', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/players/nfl')) return jsonResponse(SLEEPER_FIXTURE);
      return jsonResponse({}, 503);
    }) as unknown as typeof fetch;
    const live = new LiveMarketDataService({ provider: makeProvider(fetchFn) });
    const nab = await live.getPlayer('NAB', FORMAT);
    expect(nab!.player.identity.sleeper_id).toBe('11631'); // metadata live
    expect(nab!.trending).toBeUndefined(); // trending absent, no crash
    const status = await live.getMarketStatus();
    expect(status.mode).toBe('mixed');
    expect(status.sources.find((s) => s.sourceId === 'sleeper_trending')!.health).toBe('down');
  });

  it('trending never leaks into engine outputs (informational only)', async () => {
    const live = new LiveMarketDataService({ provider: makeProvider(fixtureFetch()) });
    const mock = new MockMarketDataService();
    const [a, b] = await Promise.all([live.getPlayer('NAB', FORMAT), mock.getPlayer('NAB', FORMAT)]);
    // NAB has huge trending counts in the fixture; every market number must
    // still equal the pure demo computation.
    expect(a!.snapshot).toEqual(b!.snapshot);
    expect(a!.signal).toEqual(b!.signal);
  });
});

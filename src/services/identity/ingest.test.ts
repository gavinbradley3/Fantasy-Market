// Integration tests for the ingestion orchestrator: fake fetchers + in-memory
// storage exercise the full fetch → validate → resolve → snapshot pipeline
// offline and deterministically.

import { describe, expect, it } from 'vitest';
import {
  contentChecksum,
  INGEST_CACHE_KEYS,
  parseManualMappings,
  runIngestion,
  type IngestOptions,
  type IngestSources,
} from '@/services/identity/ingest';
import { NFLVERSE_PLAYERS_URL } from '@/services/identity/nflverse';
import { FIXED_NOW, playersCsv, rawSleeper, rosterCsv } from '@/services/identity/testutil';
import type { PlayerSourceIdMap } from '@/services/identity/types';
import { memoryStorage } from '@/services/storage/storage';

const SLEEPER_PAYLOAD = {
  '100': rawSleeper('100', { full_name: 'Cross Walk', team: 'KC', gsis_id: null }),
  '200': rawSleeper('200', { full_name: 'Gsis Match', team: 'BUF', gsis_id: '00-2' }),
  '300': rawSleeper('300', { full_name: 'Sleeper Only', team: null, gsis_id: null }),
  k1: rawSleeper('k1', { position: 'K' }),
};

const ROSTER_CSV = rosterCsv([
  { gsis_id: '00-1', full_name: 'Cross Walk', team: 'KC', sleeper_id: '100' },
  { gsis_id: '00-2', full_name: 'Gsis Match', team: 'BUF' },
  { gsis_id: '00-3', full_name: 'Verse Only', team: 'CLE' },
]);

const PLAYERS_CSV = playersCsv([
  { gsis_id: '00-1', display_name: 'Cross Walk', birth_date: '1999-09-09', draft_round: '1' },
]);

function goodSources(over: Partial<IngestSources> = {}): IngestSources {
  return {
    fetchSleeperPlayers: async () => SLEEPER_PAYLOAD,
    fetchText: async (url) => (url === NFLVERSE_PLAYERS_URL ? PLAYERS_CSV : ROSTER_CSV),
    ...over,
  };
}

function opts(over: Partial<IngestOptions> = {}): IngestOptions {
  return {
    sources: goodSources(),
    store: memoryStorage(),
    priorSnapshot: null,
    season: 2025,
    now: () => FIXED_NOW,
    ...over,
  };
}

describe('runIngestion — happy path', () => {
  it('builds a full snapshot with provenance, mappings, and review', async () => {
    const result = await runIngestion(opts());
    expect(result.abortReason).toBeNull();
    const snap = result.snapshot!;

    // 3 supported Sleeper players + 1 nflverse-only = 4 identities.
    expect(snap.players).toHaveLength(4);
    expect(snap.review.methodCounts.DIRECT_CROSSWALK).toBe(1);
    expect(snap.review.methodCounts.GSIS_ID).toBe(1);
    expect(snap.review.methodCounts.NEW_IDENTITY).toBe(2);
    expect(snap.review.unmatched).toHaveLength(2);
    expect(snap.review.ambiguous).toHaveLength(0);

    // Enrichment applied through the pipeline.
    const crossWalk = snap.players.find((p) => p.sleeperId === '100')!;
    expect(crossWalk.draftRound).toBe(1);
    expect(crossWalk.birthDate).toBe('1999-09-09'); // curated nflverse date (via enrichment) wins

    // Provenance: exact URLs, fresh, checksummed, counted.
    expect(snap.sources.sleeper.url).toBe('https://api.sleeper.app/v1/players/nfl');
    expect(snap.sources.sleeper.stale).toBe(false);
    expect(snap.sources.sleeper.recordCount).toBe(3);
    expect(snap.sources.sleeper.checksum).toBe(contentChecksum(JSON.stringify(SLEEPER_PAYLOAD)));
    expect(snap.sources.nflverseRoster.url).toContain('roster_2025.csv');
    expect(snap.sources.nflverseRoster.recordCount).toBe(3);
    expect(snap.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(snap.effectiveSeason).toBe(2025);
  });

  it('is deterministic: identical inputs produce identical snapshots', async () => {
    const a = await runIngestion(opts());
    const b = await runIngestion(opts());
    expect(JSON.stringify(a.snapshot)).toBe(JSON.stringify(b.snapshot));
  });

  it('feeding the prior snapshot forward keeps every id stable', async () => {
    const first = await runIngestion(opts());
    const second = await runIngestion(opts({ priorSnapshot: first.snapshot }));
    expect(second.snapshot!.players.map((p) => p.playerTickerId)).toEqual(
      first.snapshot!.players.map((p) => p.playerTickerId),
    );
    expect(second.warnings.some((w) => w.includes('unchanged'))).toBe(true);
  });
});

describe('runIngestion — failure behaviour', () => {
  it('a failed Sleeper refresh serves the raw cache, marked stale with the error', async () => {
    const store = memoryStorage();
    await runIngestion(opts({ store })); // primes the cache
    const result = await runIngestion(
      opts({
        store,
        sources: goodSources({
          fetchSleeperPlayers: async () => {
            throw new Error('HTTP 503');
          },
        }),
      }),
    );
    const snap = result.snapshot!;
    expect(snap.players).toHaveLength(4); // last valid data still fully usable
    expect(snap.sources.sleeper.stale).toBe(true);
    expect(snap.sources.sleeper.error).toBe('HTTP 503');
    expect(snap.sources.nflverseRoster.stale).toBe(false);
  });

  it('prior mappings survive a degraded refresh — nothing is erased or re-guessed', async () => {
    const store = memoryStorage();
    const first = await runIngestion(opts({ store }));
    const second = await runIngestion(
      opts({
        store,
        priorSnapshot: first.snapshot,
        sources: goodSources({
          fetchText: async () => {
            throw new Error('release unavailable');
          },
        }),
      }),
    );
    // Identities, source ids, and creation times all survive; the method is
    // re-reported as EXISTING_MAPPING because that is how THIS run resolved it.
    const strip = (maps: PlayerSourceIdMap[]) =>
      maps.map(({ playerTickerId, source, sourcePlayerId, validFrom, validTo }) => ({
        playerTickerId,
        source,
        sourcePlayerId,
        validFrom,
        validTo,
      }));
    expect(strip(second.snapshot!.sourceIdMaps)).toEqual(strip(first.snapshot!.sourceIdMaps));
    expect(second.snapshot!.sourceIdMaps.every((m) => m.confidence === 'EXACT')).toBe(true);
  });

  it('aborts WITHOUT a snapshot when a required source has no cache (first run)', async () => {
    const result = await runIngestion(
      opts({
        sources: goodSources({
          fetchSleeperPlayers: async () => {
            throw new Error('timeout of 30000ms exceeded');
          },
        }),
      }),
    );
    expect(result.snapshot).toBeNull();
    expect(result.abortReason).toContain('Sleeper');
    expect(result.abortReason).toContain('timeout');
  });

  it('aborts on a malformed top-level Sleeper payload', async () => {
    const result = await runIngestion(
      opts({ sources: goodSources({ fetchSleeperPlayers: async () => 'not a map' }) }),
    );
    expect(result.snapshot).toBeNull();
    expect(result.abortReason).toContain('Sleeper payload unusable');
  });

  it('aborts on roster schema drift instead of writing a corrupted directory', async () => {
    const result = await runIngestion(
      opts({
        sources: goodSources({
          fetchText: async (url) =>
            url === NFLVERSE_PLAYERS_URL ? PLAYERS_CSV : 'wrong,header\n1,2\n',
        }),
      }),
    );
    expect(result.snapshot).toBeNull();
    expect(result.abortReason).toContain('missing required column');
  });

  it('a broken enrichment dataset is a warning, never fatal', async () => {
    const result = await runIngestion(
      opts({
        sources: goodSources({
          fetchText: async (url) => (url === NFLVERSE_PLAYERS_URL ? 'bad,csv\n1,2\n' : ROSTER_CSV),
        }),
      }),
    );
    expect(result.snapshot).not.toBeNull();
    expect(result.warnings.some((w) => w.includes('enrichment'))).toBe(true);
    const crossWalk = result.snapshot!.players.find((p) => p.sleeperId === '100')!;
    expect(crossWalk.draftRound).toBeNull(); // missing stays null — never 0
  });

  it('malformed individual Sleeper records are quarantined and counted', async () => {
    const result = await runIngestion(
      opts({
        sources: goodSources({
          fetchSleeperPlayers: async () => ({
            ...SLEEPER_PAYLOAD,
            broken: { position: 'WR', player_id: 7 },
          }),
        }),
      }),
    );
    expect(result.snapshot!.sources.sleeper.invalidRecords).toBe(1);
    expect(result.snapshot!.sources.sleeper.recordCount).toBe(3);
  });

  it('offline mode builds from cache (stale) and aborts cleanly without one', async () => {
    const store = memoryStorage();
    await runIngestion(opts({ store })); // prime
    const offline = await runIngestion(opts({ store, offline: true }));
    expect(offline.snapshot!.sources.sleeper.stale).toBe(true);
    expect(offline.snapshot!.players).toHaveLength(4);

    const noCache = await runIngestion(opts({ offline: true }));
    expect(noCache.snapshot).toBeNull();
    expect(noCache.abortReason).toContain('no cached copy');
  });
});

describe('cache freshness bookkeeping', () => {
  it('cache entries carry retrieval time and checksum', async () => {
    const store = memoryStorage();
    await runIngestion(opts({ store }));
    const entry = JSON.parse(store.get(INGEST_CACHE_KEYS.sleeper)!);
    expect(entry.fetchedAt).toBe(FIXED_NOW.toISOString());
    expect(entry.checksum).toBe(contentChecksum(entry.body));
  });

  it('a stale fallback reports the ORIGINAL retrieval time, not the failed one', async () => {
    const store = memoryStorage();
    await runIngestion(opts({ store }));
    const later = new Date(FIXED_NOW.getTime() + 48 * 60 * 60_000);
    const result = await runIngestion(
      opts({
        store,
        now: () => later,
        sources: goodSources({
          fetchSleeperPlayers: async () => {
            throw new Error('down');
          },
        }),
      }),
    );
    expect(result.snapshot!.sources.sleeper.fetchedAt).toBe(FIXED_NOW.toISOString());
    expect(result.snapshot!.generatedAt).toBe(later.toISOString());
  });
});

describe('parseManualMappings', () => {
  it('accepts a valid file and returns its mappings', () => {
    expect(
      parseManualMappings({
        version: 1,
        mappings: [{ playerTickerId: 'ptp_x', source: 'SLEEPER', sourcePlayerId: '1', note: 'ok' }],
      }),
    ).toHaveLength(1);
  });

  it('returns [] for null and throws on malformed files', () => {
    expect(parseManualMappings(null)).toEqual([]);
    expect(() => parseManualMappings({ version: 2, mappings: [] })).toThrow();
  });
});

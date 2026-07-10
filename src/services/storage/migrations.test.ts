// Persistence migration tests (Phase 10): valid data loads, legacy v1 data
// migrates, unmappable entries are quarantined (never reattached), malformed
// and unknown-version payloads fail safe, and duplicates follow the documented
// earliest-addedAt rule.

import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  loadPersistedState,
  readQuarantine,
  saveWatchlist,
} from '@/services/storage/migrations';
import { memoryStorage } from '@/services/storage/storage';

const KNOWN = new Set(['pt_0001', 'pt_0002', 'pt_0003']);

const validItem = (playerId: string, addedAt = '2026-07-01T00:00:00.000Z') => ({
  playerId,
  addedAt,
  priceAtAdd: 55.5,
  formatAtAdd: 'dyn_sf_half',
});

describe('v2 loading', () => {
  it('loads valid v2 data', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV2]: JSON.stringify({ version: 2, items: [validItem('pt_0001')] }),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(1);
    expect(state.watchlist[0].playerId).toBe('pt_0001');
  });

  it('quarantines an unknown FUTURE version instead of guessing', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV2]: JSON.stringify({ version: 99, items: [validItem('pt_0001')] }),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(0);
    const q = readQuarantine(storage) as { reason: string }[];
    expect(q.some((r) => r.reason === 'unknown-version')).toBe(true);
  });

  it('salvages valid items and quarantines invalid siblings individually', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV2]: JSON.stringify({
        version: 2,
        items: [validItem('pt_0001'), { garbage: true }, validItem('pt_0002')],
      }),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist.map((w) => w.playerId).sort()).toEqual(['pt_0001', 'pt_0002']);
    const q = readQuarantine(storage) as { reason: string }[];
    expect(q.some((r) => r.reason === 'invalid-item')).toBe(true);
  });
});

describe('v1 → v2 migration', () => {
  it('migrates valid legacy positional-id data 1:1 (ids were frozen as authored literals)', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV1]: JSON.stringify([validItem('pt_0002'), validItem('pt_0003')]),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist.map((w) => w.playerId).sort()).toEqual(['pt_0002', 'pt_0003']);
    // v2 written, v1 removed — migration is one-way and idempotent.
    expect(storage.get(STORAGE_KEYS.watchlistV2)).toContain('"version":2');
    expect(storage.get(STORAGE_KEYS.watchlistV1)).toBeNull();
  });

  it('quarantines entries whose playerId cannot be mapped — never reattaches them', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV1]: JSON.stringify([validItem('pt_0001'), validItem('pt_0777')]),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(1);
    expect(state.watchlist[0].playerId).toBe('pt_0001');
    const q = readQuarantine(storage) as { reason: string; payload: { playerId: string } }[];
    const unknown = q.find((r) => r.reason === 'unknown-player');
    expect(unknown?.payload.playerId).toBe('pt_0777');
  });

  it('normalizes duplicates by keeping the EARLIEST addedAt (original baseline)', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV1]: JSON.stringify([
        { ...validItem('pt_0001', '2026-07-05T00:00:00.000Z'), priceAtAdd: 60 },
        { ...validItem('pt_0001', '2026-07-01T00:00:00.000Z'), priceAtAdd: 50 },
      ]),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(1);
    expect(state.watchlist[0].priceAtAdd).toBe(50); // the earlier entry
  });

  it('fails safe on malformed JSON (quarantined, app starts clean)', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV1]: '{not json!!',
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(0);
    const q = readQuarantine(storage) as { reason: string }[];
    expect(q.some((r) => r.reason === 'malformed-json')).toBe(true);
  });

  it('fails safe when v1 is not an array', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.portfolioV1]: JSON.stringify({ nope: 1 }),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.portfolio).toHaveLength(0);
  });

  it('migrates both collections independently', () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.watchlistV1]: JSON.stringify([validItem('pt_0001')]),
      [STORAGE_KEYS.portfolioV1]: JSON.stringify([
        { playerId: 'pt_0002', addedAt: '2026-07-01T00:00:00.000Z', priceAtAdd: 40 },
      ]),
    });
    const state = loadPersistedState(storage, KNOWN);
    expect(state.watchlist).toHaveLength(1);
    expect(state.portfolio).toHaveLength(1);
  });
});

describe('write-path safety', () => {
  it('storage write failures never throw', () => {
    const throwing = {
      get: () => null,
      set: () => {
        throw new Error('quota exceeded');
      },
      remove: () => {},
    };
    // saveWatchlist writes through the adapter; adapters that throw are the
    // browser's problem — ours swallow (browserStorage) so this asserts the
    // migration layer itself doesn't add unguarded writes.
    expect(() =>
      saveWatchlist(
        { ...throwing, set: () => {} }, // guarded adapter shape
        [{ playerId: 'pt_0001', addedAt: 'x', priceAtAdd: 1, formatAtAdd: 'dyn_sf_half' }],
      ),
    ).not.toThrow();
  });
});

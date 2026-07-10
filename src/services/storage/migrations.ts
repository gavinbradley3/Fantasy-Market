// Persisted-state loading, validation, and migration.
//
// MIGRATION BEHAVIOUR (documented per Phase-7 requirements):
//
// v1 (legacy): bare arrays under `pt.watchlist.v1` / `pt.portfolio.v1`, whose
// playerIds were generated POSITIONALLY (pt_0001 = first pool entry, etc.).
// Those exact positional assignments were frozen as authored literal ids on
// each player record (src/data/pool.ts) at the moment v2 was introduced, so a
// valid v1 playerId maps 1:1 onto today's canonical ids BY CONSTRUCTION — the
// "exact historical pool order" is preserved inside the authored ids
// themselves, not reconstructed from the current array order.
//
// v2: `{ version: 2, items: [...] }` envelopes under `.v2` keys.
//
// Safety rules:
// - Every item is validated individually (Zod); one corrupt entry never
//   discards its siblings.
// - An entry whose playerId is not a CURRENT canonical id is QUARANTINED
//   (kept under pt.quarantine.v1 for inspection), never guessed onto another
//   player and never silently dropped.
// - Malformed JSON and unknown envelope versions are quarantined wholesale
//   and the app starts from an empty, valid state.
// - Duplicate playerIds keep the EARLIEST addedAt — that entry carries the
//   user's original tracking baseline (price-at-add), which is the honest one.
// - Storage writes never throw (see StorageLike adapters).

import {
  envelopeV2Schema,
  legacyArraySchema,
  portfolioHoldingSchema,
  watchlistItemSchema,
} from '@/services/storage/schemas';
import type { StorageLike } from '@/services/storage/storage';
import type { PortfolioHolding, WatchlistItem } from '@/types/market';
import type { ZodType } from 'zod';

export const STORAGE_KEYS = {
  watchlistV1: 'pt.watchlist.v1',
  watchlistV2: 'pt.watchlist.v2',
  portfolioV1: 'pt.portfolio.v1',
  portfolioV2: 'pt.portfolio.v2',
  format: 'pt.format.v1',
  quarantine: 'pt.quarantine.v1',
} as const;

const CURRENT_VERSION = 2;
const QUARANTINE_CAP = 100;

export interface QuarantineRecord {
  key: string;
  reason:
    | 'malformed-json'
    | 'not-an-envelope'
    | 'unknown-version'
    | 'invalid-item'
    | 'unknown-player';
  payload: unknown;
  at: string;
}

function quarantine(storage: StorageLike, record: Omit<QuarantineRecord, 'at'>): void {
  const raw = storage.get(STORAGE_KEYS.quarantine);
  let existing: unknown[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = []; // quarantine itself corrupt — start over
    }
  }
  existing.push({ ...record, at: new Date().toISOString() } satisfies QuarantineRecord);
  storage.set(STORAGE_KEYS.quarantine, JSON.stringify(existing.slice(-QUARANTINE_CAP)));
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

interface ItemShape {
  playerId: string;
  addedAt: string;
}

/** Per-item salvage: validate schema, then canonical-id membership. */
function salvageItems<T extends ItemShape>(
  storage: StorageLike,
  sourceKey: string,
  rawItems: unknown[],
  itemSchema: ZodType<T>,
  knownIds: ReadonlySet<string>,
): { items: T[]; dropped: number } {
  const valid: T[] = [];
  let dropped = 0;
  for (const raw of rawItems) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      quarantine(storage, { key: sourceKey, reason: 'invalid-item', payload: raw });
      dropped += 1;
      continue;
    }
    if (!knownIds.has(parsed.data.playerId)) {
      // Never attach a saved entry to a player we can't positively identify.
      quarantine(storage, { key: sourceKey, reason: 'unknown-player', payload: parsed.data });
      dropped += 1;
      continue;
    }
    valid.push(parsed.data);
  }
  // Duplicates: keep the earliest addedAt (original tracking baseline).
  const byId = new Map<string, T>();
  for (const item of valid) {
    const prev = byId.get(item.playerId);
    if (!prev || item.addedAt < prev.addedAt) byId.set(item.playerId, item);
  }
  dropped += valid.length - byId.size;
  return { items: [...byId.values()], dropped };
}

function writeEnvelope(storage: StorageLike, key: string, items: unknown[]): void {
  storage.set(key, JSON.stringify({ version: CURRENT_VERSION, items }));
}

/**
 * Load one collection: prefer v2, fall back to migrating v1, else empty.
 * Always leaves storage in a valid v2 state on return.
 */
function loadCollection<T extends ItemShape>(
  storage: StorageLike,
  v1Key: string,
  v2Key: string,
  itemSchema: ZodType<T>,
  knownIds: ReadonlySet<string>,
): T[] {
  const rawV2 = storage.get(v2Key);
  if (rawV2 !== null) {
    const parsed = parseJson(rawV2);
    if (!parsed.ok) {
      quarantine(storage, { key: v2Key, reason: 'malformed-json', payload: rawV2 });
      storage.remove(v2Key);
      return [];
    }
    const env = envelopeV2Schema.safeParse(parsed.value);
    if (!env.success) {
      quarantine(storage, { key: v2Key, reason: 'not-an-envelope', payload: parsed.value });
      storage.remove(v2Key);
      return [];
    }
    if (env.data.version !== CURRENT_VERSION) {
      // A FUTURE version we don't understand: don't guess, don't destroy.
      quarantine(storage, { key: v2Key, reason: 'unknown-version', payload: parsed.value });
      storage.remove(v2Key);
      return [];
    }
    const { items, dropped } = salvageItems(storage, v2Key, env.data.items, itemSchema, knownIds);
    if (dropped > 0) writeEnvelope(storage, v2Key, items); // persist the cleaned set
    return items;
  }

  // ---- v1 → v2 migration ----
  const rawV1 = storage.get(v1Key);
  if (rawV1 === null) return [];

  const parsed = parseJson(rawV1);
  if (!parsed.ok) {
    quarantine(storage, { key: v1Key, reason: 'malformed-json', payload: rawV1 });
    storage.remove(v1Key);
    return [];
  }
  const arr = legacyArraySchema.safeParse(parsed.value);
  if (!arr.success) {
    quarantine(storage, { key: v1Key, reason: 'not-an-envelope', payload: parsed.value });
    storage.remove(v1Key);
    return [];
  }
  const { items } = salvageItems(storage, v1Key, arr.data, itemSchema, knownIds);
  writeEnvelope(storage, v2Key, items);
  storage.remove(v1Key); // migration complete; v1 never re-read
  return items;
}

export interface PersistedState {
  watchlist: WatchlistItem[];
  portfolio: PortfolioHolding[];
}

export function loadPersistedState(
  storage: StorageLike,
  knownIds: ReadonlySet<string>,
): PersistedState {
  return {
    watchlist: loadCollection(
      storage,
      STORAGE_KEYS.watchlistV1,
      STORAGE_KEYS.watchlistV2,
      watchlistItemSchema,
      knownIds,
    ),
    portfolio: loadCollection(
      storage,
      STORAGE_KEYS.portfolioV1,
      STORAGE_KEYS.portfolioV2,
      portfolioHoldingSchema,
      knownIds,
    ),
  };
}

export function saveWatchlist(storage: StorageLike, items: WatchlistItem[]): void {
  writeEnvelope(storage, STORAGE_KEYS.watchlistV2, items);
}

export function savePortfolio(storage: StorageLike, items: PortfolioHolding[]): void {
  writeEnvelope(storage, STORAGE_KEYS.portfolioV2, items);
}

export function readQuarantine(storage: StorageLike): unknown[] {
  const raw = storage.get(STORAGE_KEYS.quarantine);
  if (!raw) return [];
  const parsed = parseJson(raw);
  return parsed.ok && Array.isArray(parsed.value) ? parsed.value : [];
}

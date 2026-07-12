// Ingestion orchestrator: fetch → validate → normalize → resolve → snapshot.
//
// NETWORK BOUNDARY (documented in docs/PLAYER_IDENTITY_PHASE1.md): PlayerTicker
// is a statically deployed browser app, so the full Sleeper player map (~5MB)
// and nflverse CSVs are NEVER downloaded by clients. This orchestrator runs in
// the explicit Node ingestion command (scripts/ingest-player-identity.mts),
// which emits the versioned snapshot the app loads as committed data.
//
// FAILURE BEHAVIOUR:
//   - provider fetch fails but a raw cache exists → build from cache, mark the
//     source STALE, expose the error;
//   - provider fetch fails with NO cache → abort without writing anything (the
//     previously committed snapshot remains the last valid state);
//   - players.csv enrichment failing is never fatal (identity still resolves);
//   - prior mappings are always fed forward, so ids never churn;
//   - nothing missing is ever replaced with zero, and no match is invented.
//
// All I/O is injected (fetchers + StorageLike) so integration tests run fully
// offline and deterministically.

import type { StorageLike } from '@/services/storage/storage';
import {
  enrichNflverseRecords,
  loadNflversePlayersEnrichment,
  loadNflverseRoster,
  NFLVERSE_PLAYERS_URL,
  NFLVERSE_ROSTER_URL,
  NflverseSchemaError,
  type NflverseExtraction,
} from '@/services/identity/nflverse';
import { NORMALIZATION_VERSION } from '@/services/identity/normalize';
import { buildDirectory } from '@/services/identity/resolver';
import { manualMappingsFileSchema, type ManualMapping } from '@/services/identity/schemas';
import { extractSleeperIdentities, type SleeperExtraction } from '@/services/identity/sleeperIdentity';
import type {
  PlayerDirectorySnapshot,
  ProviderSourceMeta,
  ResolutionResult,
} from '@/services/identity/types';

export const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

export const INGEST_CACHE_KEYS = {
  sleeper: 'identity.raw.sleeper.v1',
  roster: (season: number) => `identity.raw.nflverse.roster.${season}.v1`,
  players: 'identity.raw.nflverse.players.v1',
} as const;

/**
 * Content checksum: two independently seeded 32-bit FNV-1a passes, hex-joined.
 * A duplicate-ingestion guard, NOT cryptography — it only needs to make
 * "same bytes as last run" detectable.
 */
export function contentChecksum(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

interface RawCacheEntry {
  fetchedAt: string;
  checksum: string;
  body: string;
}

function readRawCache(store: StorageLike, key: string): RawCacheEntry | null {
  const raw = store.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RawCacheEntry>;
    if (typeof parsed.fetchedAt !== 'string' || typeof parsed.body !== 'string') return null;
    return { fetchedAt: parsed.fetchedAt, checksum: parsed.checksum ?? '', body: parsed.body };
  } catch {
    return null;
  }
}

export interface IngestSources {
  /** GET the full Sleeper players map (already-parsed JSON). */
  fetchSleeperPlayers(): Promise<unknown>;
  /** GET a text (CSV) resource by exact URL. */
  fetchText(url: string): Promise<string>;
}

export interface IngestOptions {
  sources: IngestSources;
  /** Raw-payload cache (file-backed in the CLI, in-memory in tests). */
  store: StorageLike;
  priorSnapshot: PlayerDirectorySnapshot | null;
  manualMappings?: ManualMapping[];
  /** NFL season whose roster anchors the directory. */
  season: number;
  /** Skip the network entirely and build from cache (CLI --offline). */
  offline?: boolean;
  /** Skip players.csv enrichment (draft round / birth-date backfill). */
  skipEnrichment?: boolean;
  now?: () => Date;
}

export interface IngestSourceOutcome {
  meta: ProviderSourceMeta;
  body: string | null;
}

export interface IngestResult {
  /** null when ingestion had to abort — the caller must keep the prior file. */
  snapshot: PlayerDirectorySnapshot | null;
  outcomes: Map<string, ResolutionResult> | null;
  warnings: string[];
  /** Human-readable abort reason when snapshot is null. */
  abortReason: string | null;
}

/**
 * Acquire one source: try the network (unless offline), fall back to the raw
 * cache, record freshness/staleness/error honestly.
 */
async function acquire(
  url: string,
  cacheKey: string,
  fetchBody: () => Promise<string>,
  store: StorageLike,
  offline: boolean,
  now: () => Date,
): Promise<IngestSourceOutcome> {
  const cached = readRawCache(store, cacheKey);
  if (!offline) {
    try {
      const body = await fetchBody();
      const entry: RawCacheEntry = {
        fetchedAt: now().toISOString(),
        checksum: contentChecksum(body),
        body,
      };
      store.set(cacheKey, JSON.stringify(entry));
      return {
        body,
        meta: {
          url,
          fetchedAt: entry.fetchedAt,
          checksum: entry.checksum,
          recordCount: null,
          invalidRecords: null,
          stale: false,
          error: null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cached) {
        return {
          body: cached.body,
          meta: {
            url,
            fetchedAt: cached.fetchedAt,
            checksum: cached.checksum,
            recordCount: null,
            invalidRecords: null,
            stale: true, // serving last valid copy after a failed refresh
            error: message,
          },
        };
      }
      return {
        body: null,
        meta: { url, fetchedAt: null, checksum: null, recordCount: null, invalidRecords: null, stale: false, error: message },
      };
    }
  }
  if (cached) {
    return {
      body: cached.body,
      meta: {
        url,
        fetchedAt: cached.fetchedAt,
        checksum: cached.checksum,
        recordCount: null,
        invalidRecords: null,
        stale: true, // offline builds are stale by definition
        error: null,
      },
    };
  }
  return {
    body: null,
    meta: { url, fetchedAt: null, checksum: null, recordCount: null, invalidRecords: null, stale: false, error: 'offline and no cached copy' },
  };
}

export async function runIngestion(opts: IngestOptions): Promise<IngestResult> {
  const now = opts.now ?? (() => new Date());
  const offline = opts.offline ?? false;
  const warnings: string[] = [];
  const { store, sources, season } = opts;

  // ---- acquire raw payloads (network → cache → abort) ----
  const sleeperOutcome = await acquire(
    SLEEPER_PLAYERS_URL,
    INGEST_CACHE_KEYS.sleeper,
    async () => JSON.stringify(await sources.fetchSleeperPlayers()),
    store,
    offline,
    now,
  );
  const rosterUrl = NFLVERSE_ROSTER_URL(season);
  const rosterOutcome = await acquire(
    rosterUrl,
    INGEST_CACHE_KEYS.roster(season),
    () => sources.fetchText(rosterUrl),
    store,
    offline,
    now,
  );
  const playersOutcome = opts.skipEnrichment
    ? null
    : await acquire(
        NFLVERSE_PLAYERS_URL,
        INGEST_CACHE_KEYS.players,
        () => sources.fetchText(NFLVERSE_PLAYERS_URL),
        store,
        offline,
        now,
      );

  // A REQUIRED source with neither live nor cached data → abort. Writing a
  // snapshot that silently lost a whole provider would erase valid identities;
  // the previously committed snapshot must remain the last valid state.
  const sleeperBody = sleeperOutcome.body;
  const rosterBody = rosterOutcome.body;
  const missing: string[] = [];
  if (sleeperBody === null) missing.push(`Sleeper (${sleeperOutcome.meta.error})`);
  if (rosterBody === null) missing.push(`nflverse roster ${season} (${rosterOutcome.meta.error})`);
  if (sleeperBody === null || rosterBody === null) {
    return {
      snapshot: null,
      outcomes: null,
      warnings,
      abortReason: `required source(s) unavailable with no cached copy: ${missing.join('; ')}`,
    };
  }

  // ---- validate + extract (per-record quarantine, top-level failures abort) ----
  let sleeperExtraction: SleeperExtraction;
  try {
    sleeperExtraction = extractSleeperIdentities(JSON.parse(sleeperBody));
  } catch (err) {
    return {
      snapshot: null,
      outcomes: null,
      warnings,
      abortReason: `Sleeper payload unusable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let rosterExtraction: NflverseExtraction;
  try {
    rosterExtraction = loadNflverseRoster(rosterBody, season);
  } catch (err) {
    if (!(err instanceof NflverseSchemaError)) throw err;
    return { snapshot: null, outcomes: null, warnings, abortReason: `nflverse roster unusable: ${err.message}` };
  }

  let nflverseRecords = rosterExtraction.records;
  if (playersOutcome) {
    if (playersOutcome.body !== null) {
      try {
        const enrichment = loadNflversePlayersEnrichment(playersOutcome.body);
        nflverseRecords = enrichNflverseRecords(nflverseRecords, enrichment);
        playersOutcome.meta.recordCount = enrichment.byGsisId.size;
        playersOutcome.meta.invalidRecords = enrichment.invalidRecords;
      } catch (err) {
        // Enrichment is optional — identity resolution proceeds without it.
        warnings.push(`players.csv enrichment skipped: ${err instanceof Error ? err.message : String(err)}`);
        playersOutcome.meta.error = playersOutcome.meta.error ?? String(err instanceof Error ? err.message : err);
      }
    } else {
      warnings.push(`players.csv enrichment unavailable: ${playersOutcome.meta.error}`);
    }
  }

  for (const issue of [...sleeperExtraction.issues, ...rosterExtraction.issues]) warnings.push(issue);

  sleeperOutcome.meta.recordCount = sleeperExtraction.records.length;
  sleeperOutcome.meta.invalidRecords = sleeperExtraction.invalidRecords;
  rosterOutcome.meta.recordCount = rosterExtraction.records.length;
  rosterOutcome.meta.invalidRecords = rosterExtraction.invalidRecords;

  // ---- resolve ----
  const generatedAt = now().toISOString();
  const resolved = buildDirectory({
    sleeper: sleeperExtraction.records,
    nflverse: nflverseRecords,
    priorMappings: opts.priorSnapshot?.sourceIdMaps ?? [],
    manualMappings: opts.manualMappings ?? [],
    generatedAt,
    effectiveSeason: season,
  });

  const emptyMeta = (url: string): ProviderSourceMeta => ({
    url,
    fetchedAt: null,
    checksum: null,
    recordCount: null,
    invalidRecords: null,
    stale: false,
    error: 'enrichment skipped by option',
  });

  const snapshot: PlayerDirectorySnapshot = {
    schemaVersion: 1,
    normalizationVersion: NORMALIZATION_VERSION,
    generatedAt,
    effectiveSeason: season,
    sources: {
      sleeper: sleeperOutcome.meta,
      nflverseRoster: rosterOutcome.meta,
      nflversePlayers: playersOutcome?.meta ?? emptyMeta(NFLVERSE_PLAYERS_URL),
    },
    players: resolved.players,
    sourceIdMaps: resolved.sourceIdMaps,
    review: resolved.review,
  };

  // Duplicate-ingestion note: identical source checksums to the prior snapshot
  // mean the data has not changed since the last run.
  const prior = opts.priorSnapshot;
  if (
    prior &&
    prior.sources.sleeper.checksum === snapshot.sources.sleeper.checksum &&
    prior.sources.nflverseRoster.checksum === snapshot.sources.nflverseRoster.checksum &&
    snapshot.sources.sleeper.checksum !== null
  ) {
    warnings.push('source data unchanged since previous snapshot (checksums identical)');
  }

  return { snapshot, outcomes: resolved.outcomes, warnings, abortReason: null };
}

/** Parse and validate a manual-mappings file payload (returns [] for null). */
export function parseManualMappings(raw: unknown): ManualMapping[] {
  if (raw == null) return [];
  return manualMappingsFileSchema.parse(raw).mappings;
}

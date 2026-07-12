// Player-identity ingestion command (Real-Data Integration, Phase 1).
//
//   npm run ingest:identity -- [--season 2025] [--offline] [--timeout 30000] [--no-enrichment]
//
// Fetches the Sleeper player map and the nflverse roster/players datasets,
// validates and normalizes them, resolves cross-provider identities, and
// writes the versioned snapshot the app consumes:
//
//   src/data/identity/player-directory.json   committed normalized directory
//   src/data/identity/identity-review.json    unmatched/ambiguous review report
//   .cache/identity/*                         raw provider payloads (gitignored)
//
// This command IS the network boundary: the deployed browser app never calls
// these providers. Run at most once per day (Sleeper's documented limit for
// /players/nfl). On provider failure it serves the raw cache (marked stale);
// with neither network nor cache it aborts WITHOUT touching the committed
// snapshot — the last valid state always survives.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SleeperClient } from '../src/services/marketData/live/sleeperClient';
import { PlayerIdentityDirectory } from '../src/services/identity/directory';
import { parseManualMappings, runIngestion } from '../src/services/identity/ingest';
import type { StorageLike } from '../src/services/storage/storage';
import type { PlayerDirectorySnapshot } from '../src/services/identity/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'identity');
const SNAPSHOT_PATH = join(OUT_DIR, 'player-directory.json');
const REVIEW_PATH = join(OUT_DIR, 'identity-review.json');
const MANUAL_PATH = join(OUT_DIR, 'manual-mappings.json');
const CACHE_DIR = join(ROOT, '.cache', 'identity');

// ---- args ----
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

// Default season: the roster year most likely to be published — the new
// league year's roster appears around May, so Jan–Jul defaults to last year.
const now = new Date();
const defaultSeason = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const season = Number(opt('--season') ?? defaultSeason);
if (!Number.isInteger(season) || season < 2000 || season > 2100) {
  console.error(`invalid --season: ${opt('--season')}`);
  process.exit(1);
}
const offline = flag('--offline');
const timeoutMs = Number(opt('--timeout') ?? 30_000);

// ---- file-backed raw cache (StorageLike over .cache/identity/) ----
mkdirSync(CACHE_DIR, { recursive: true });
const keyPath = (key: string) => join(CACHE_DIR, key.replace(/[^a-zA-Z0-9._-]/g, '_'));
const fileStore: StorageLike = {
  get: (key) => (existsSync(keyPath(key)) ? readFileSync(keyPath(key), 'utf8') : null),
  set: (key, value) => writeFileSync(keyPath(key), value),
  remove: (key) => {
    if (existsSync(keyPath(key))) unlinkSync(keyPath(key));
  },
};

// ---- prior snapshot + manual mappings ----
let priorSnapshot: PlayerDirectorySnapshot | null = null;
try {
  const prior = PlayerIdentityDirectory.fromJson(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')));
  if (!prior.getFreshness().neverIngested) priorSnapshot = prior.snapshot;
} catch {
  console.warn('no valid prior snapshot — starting from a clean directory');
}
const manualMappings = existsSync(MANUAL_PATH)
  ? parseManualMappings(JSON.parse(readFileSync(MANUAL_PATH, 'utf8')))
  : [];

// ---- fetchers ----
const sleeperClient = new SleeperClient({ timeoutMs });
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---- run ----
const result = await runIngestion({
  sources: { fetchSleeperPlayers: () => sleeperClient.getAllPlayers(), fetchText },
  store: fileStore,
  priorSnapshot,
  manualMappings,
  season,
  offline,
  skipEnrichment: flag('--no-enrichment'),
});

for (const w of result.warnings) console.warn(`warning: ${w}`);

if (!result.snapshot) {
  console.error(`ingestion aborted: ${result.abortReason}`);
  console.error('the previously committed snapshot was left untouched.');
  process.exit(1);
}

const snapshot = result.snapshot;
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
writeFileSync(
  REVIEW_PATH,
  JSON.stringify(
    {
      generatedAt: snapshot.generatedAt,
      effectiveSeason: snapshot.effectiveSeason,
      summary: {
        players: snapshot.players.length,
        mappings: snapshot.sourceIdMaps.length,
        methodCounts: snapshot.review.methodCounts,
        ambiguous: snapshot.review.ambiguous.length,
        unmatched: snapshot.review.unmatched.length,
        reviewRequired: snapshot.review.reviewRequired.length,
      },
      howToResolve:
        'For each entry: verify the player manually (name, birth date, team, position, candidate ids), ' +
        'then add a mapping to src/data/identity/manual-mappings.json and re-run npm run ingest:identity.',
      ambiguous: snapshot.review.ambiguous,
      reviewRequired: snapshot.review.reviewRequired,
      unmatched: snapshot.review.unmatched,
    },
    null,
    2,
  ) + '\n',
);

const f = (n: number | null) => (n === null ? '?' : String(n));
console.log(`season ${season} — directory written to ${SNAPSHOT_PATH}`);
console.log(
  `sleeper: ${f(snapshot.sources.sleeper.recordCount)} records` +
    `${snapshot.sources.sleeper.stale ? ' (STALE cache)' : ''}` +
    `${snapshot.sources.sleeper.error ? ` [error: ${snapshot.sources.sleeper.error}]` : ''}`,
);
console.log(
  `nflverse roster: ${f(snapshot.sources.nflverseRoster.recordCount)} records` +
    `${snapshot.sources.nflverseRoster.stale ? ' (STALE cache)' : ''}` +
    `${snapshot.sources.nflverseRoster.error ? ` [error: ${snapshot.sources.nflverseRoster.error}]` : ''}`,
);
console.log(`players: ${snapshot.players.length}, mappings: ${snapshot.sourceIdMaps.length}`);
console.log(`method counts: ${JSON.stringify(snapshot.review.methodCounts)}`);
console.log(
  `review: ${snapshot.review.ambiguous.length} ambiguous, ${snapshot.review.unmatched.length} unmatched, ` +
    `${snapshot.review.reviewRequired.length} need confirmation → ${REVIEW_PATH}`,
);

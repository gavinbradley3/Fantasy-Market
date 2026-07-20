/**
 * Generates committed raw-snapshot fixtures from the small raw provider payloads
 * under fixtures/pipeline/raw/. A snapshot wraps a payload with provider, schema
 * version, retrieval timestamp, season, record count, and a deterministic
 * checksum (see src/pipeline/snapshot.ts). Re-run after editing a raw payload:
 *
 *   npm run generate:pipeline-fixtures
 *
 * The retrieval timestamp is FIXED here so snapshots — and therefore the whole
 * fixture pipeline — stay byte-for-byte deterministic across machines and runs.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from '@/pipeline/snapshot';
import { buildStatsSnapshot } from '@/pipeline/stats/snapshot';
import { PIPELINE_SCHEMA_VERSION } from '@/pipeline/constants';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'fixtures', 'pipeline', 'raw');
const SNAP_DIR = join(ROOT, 'fixtures', 'pipeline', 'snapshots');
const STATS_RAW_DIR = join(ROOT, 'fixtures', 'pipeline', 'stats', 'raw');
const STATS_SNAP_DIR = join(ROOT, 'fixtures', 'pipeline', 'stats', 'snapshots');

// Fixed capture instant for reproducibility. The fixture seasons are 2024–2025.
const RETRIEVED_AT = '2026-07-01T00:00:00.000Z';
const SEASON = 2025;

function generate(provider: 'sleeper' | 'nflverse', rawFile: string): void {
  const payload: unknown = JSON.parse(readFileSync(join(RAW_DIR, rawFile), 'utf8'));
  const snapshot = buildSnapshot(payload, {
    provider,
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    retrievedAt: RETRIEVED_AT,
    season: SEASON,
  });
  mkdirSync(SNAP_DIR, { recursive: true });
  const out = join(SNAP_DIR, `${provider}.snapshot.json`);
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${provider}.snapshot.json — ${snapshot.metadata.recordCount} records, checksum ${snapshot.metadata.checksum}`,
  );
}

function generateStatsDataset(rawFile: string, dataset: string, outFile: string): void {
  const payload: unknown = JSON.parse(readFileSync(join(STATS_RAW_DIR, rawFile), 'utf8'));
  const snapshot = buildStatsSnapshot(payload, {
    dataset,
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    retrievedAt: RETRIEVED_AT,
    seasons: [2024, 2025],
    weekRange: [1, 18],
    sourceRef: `nflverse-data/${dataset} (fixture subset)`,
  });
  mkdirSync(STATS_SNAP_DIR, { recursive: true });
  const out = join(STATS_SNAP_DIR, outFile);
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${outFile} — ${snapshot.metadata.recordCount} rows, checksum ${snapshot.metadata.checksum}`);
}

generate('sleeper', 'sleeper.players.sample.json');
generate('nflverse', 'nflverse.players.sample.json');
generateStatsDataset('nflverse.player_stats.sample.json', 'player_stats_weekly', 'nflverse.player_stats.snapshot.json');
generateStatsDataset('nflverse.snap_counts.sample.json', 'snap_counts_weekly', 'nflverse.snap_counts.snapshot.json');

// Shared test helpers for the pipeline. Loads the committed raw provider
// payloads and wraps them as in-memory snapshots so tests exercise the real
// adapters and snapshot layer without depending on the generated snapshot files.
// (A separate test loads the committed snapshot files themselves.)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, type RawSnapshot } from '@/pipeline/snapshot';
import { buildStatsSnapshot, type StatsSnapshot } from '@/pipeline/stats/snapshot';
import type { PipelineConfig } from '@/pipeline/runPipeline';
import type { StatsStageOptions } from '@/pipeline/stats/runStats';
import type { IdentityMap } from '@/pipeline/identity';
import type { ProviderId } from '@/pipeline/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE_ROOT = join(ROOT, 'fixtures', 'pipeline');

export function readFixture(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, ...parts), 'utf8'));
}

export function rawPayload(provider: ProviderId): unknown {
  const file = provider === 'sleeper' ? 'sleeper.players.sample.json' : 'nflverse.players.sample.json';
  return readFixture('raw', file);
}

export function buildFixtureSnapshot(
  provider: ProviderId,
  retrievedAt = '2026-07-01T00:00:00.000Z',
): RawSnapshot {
  return buildSnapshot(rawPayload(provider), {
    provider,
    schemaVersion: 1,
    retrievedAt,
    season: 2025,
  });
}

export function bothFixtureSnapshots(retrievedAt?: string): RawSnapshot[] {
  return [buildFixtureSnapshot('sleeper', retrievedAt), buildFixtureSnapshot('nflverse', retrievedAt)];
}

export function loadIdentityMap(): IdentityMap {
  return readFixture('identity-map.json') as IdentityMap;
}

export function rawStatsPayload(): unknown {
  return readFixture('stats', 'raw', 'nflverse.player_stats.sample.json');
}

export function buildStatsFixtureSnapshot(retrievedAt = '2026-07-01T00:00:00.000Z'): StatsSnapshot {
  return buildStatsSnapshot(rawStatsPayload(), {
    dataset: 'player_stats_weekly',
    schemaVersion: 1,
    retrievedAt,
    seasons: [2024, 2025],
    weekRange: [1, 18],
    sourceRef: 'fixture',
  });
}

export const STATS_OPTIONS: StatsStageOptions = { currentSeason: 2025, includePostseason: false };

export function rawSnapPayload(): unknown {
  return readFixture('stats', 'raw', 'nflverse.snap_counts.sample.json');
}

export function buildSnapFixtureSnapshot(retrievedAt = '2026-07-01T00:00:00.000Z'): StatsSnapshot {
  return buildStatsSnapshot(rawSnapPayload(), {
    dataset: 'snap_counts_weekly',
    schemaVersion: 1,
    retrievedAt,
    seasons: [2024, 2025],
    weekRange: [1, 18],
    sourceRef: 'fixture',
  });
}

export function rawParticipationPayload(): unknown {
  return readFixture('stats', 'raw', 'nflverse.participation.sample.json');
}

export function buildParticipationFixtureSnapshot(retrievedAt = '2026-07-01T00:00:00.000Z'): StatsSnapshot {
  return buildStatsSnapshot(rawParticipationPayload(), {
    dataset: 'pbp_participation',
    schemaVersion: 1,
    retrievedAt,
    seasons: [],
    weekRange: [1, 18],
    sourceRef: 'synthetic-fixture',
  });
}

export const TEST_CONFIG: PipelineConfig = {
  mode: 'fixture',
  generatedAt: '2026-07-01T00:00:00.000Z',
  asOf: '2026-07-01',
  staleMaxAgeMs: 48 * 60 * 60 * 1000,
};

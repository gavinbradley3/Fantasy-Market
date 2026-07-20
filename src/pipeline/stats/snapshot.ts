// Raw statistical snapshots. Reuses the metadata pipeline's checksum primitives
// (checksumPayload/stableStringify) rather than inventing a competing mechanism,
// but carries stats-specific metadata: dataset name, seasons, week range, and an
// observed-column signature for drift detection.

import { z } from 'zod';
import { checksumPayload } from '@/pipeline/snapshot';
import { columnSignature } from '@/pipeline/stats/nflverse/weeklySchema';

export const statsSnapshotMetadataSchema = z.object({
  provider: z.literal('nflverse'),
  dataset: z.string().min(1), // e.g. "player_stats_weekly"
  schemaVersion: z.number().int().positive(),
  retrievedAt: z.string().min(1),
  seasons: z.array(z.number().int()),
  weekRange: z.tuple([z.number().int(), z.number().int()]).nullable(),
  recordCount: z.number().int().nonnegative(),
  columnSignature: z.string(),
  checksum: z.string().min(1),
  /** Release tag / URL where redistribution rules allow it. */
  sourceRef: z.string().nullable(),
});

export type StatsSnapshotMetadata = z.infer<typeof statsSnapshotMetadataSchema>;

export const statsSnapshotSchema = z.object({
  metadata: statsSnapshotMetadataSchema,
  payload: z.unknown(),
});

export interface StatsSnapshot {
  metadata: StatsSnapshotMetadata;
  payload: unknown;
}

export interface BuildStatsSnapshotOptions {
  dataset: string;
  schemaVersion: number;
  retrievedAt: string;
  seasons: number[];
  weekRange: [number, number] | null;
  sourceRef: string | null;
}

function rowSeasons(payload: unknown): number[] {
  if (!Array.isArray(payload)) return [];
  const set = new Set<number>();
  for (const row of payload) {
    const s = (row as { season?: unknown })?.season;
    const n = typeof s === 'number' ? s : Number(s);
    if (Number.isFinite(n)) set.add(Math.trunc(n));
  }
  return [...set].sort((a, b) => a - b);
}

export function buildStatsSnapshot(payload: unknown, opts: BuildStatsSnapshotOptions): StatsSnapshot {
  const rows = Array.isArray(payload) ? payload : [];
  return {
    metadata: {
      provider: 'nflverse',
      dataset: opts.dataset,
      schemaVersion: opts.schemaVersion,
      retrievedAt: opts.retrievedAt,
      seasons: opts.seasons.length > 0 ? [...opts.seasons].sort((a, b) => a - b) : rowSeasons(payload),
      weekRange: opts.weekRange,
      recordCount: rows.length,
      columnSignature: columnSignature(rows),
      checksum: checksumPayload(payload),
      sourceRef: opts.sourceRef,
    },
    payload,
  };
}

export type StatsSnapshotIntegrity =
  | { ok: true; snapshot: StatsSnapshot }
  | { ok: false; error: string };

export function verifyStatsSnapshot(input: unknown): StatsSnapshotIntegrity {
  const parsed = statsSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `stats snapshot metadata invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }
  const snap = parsed.data as StatsSnapshot;
  const expected = checksumPayload(snap.payload);
  if (expected !== snap.metadata.checksum) {
    return { ok: false, error: `stats checksum mismatch (expected ${expected}, stored ${snap.metadata.checksum})` };
  }
  const count = Array.isArray(snap.payload) ? snap.payload.length : 0;
  if (count !== snap.metadata.recordCount) {
    return { ok: false, error: `stats record count mismatch (payload ${count}, stored ${snap.metadata.recordCount})` };
  }
  return { ok: true, snapshot: snap };
}

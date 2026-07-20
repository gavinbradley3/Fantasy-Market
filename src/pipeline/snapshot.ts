// Raw-data snapshot layer. Before normalization, every provider payload is
// wrapped with enough metadata to reproduce and audit it: provider, schema
// version, retrieval timestamp, effective season, record count, and a
// deterministic checksum (DESIGN §14.2 provenance requirements).
//
// Snapshots are the pipeline's reproducibility contract: given the same
// snapshot bytes, the pipeline must produce identical canonical output. The
// checksum lets us detect silent drift; staleness is derived, not stored, so it
// reflects the run's configured clock rather than a baked-in guess.

import { z } from 'zod';
import { digest } from '@/pipeline/hash';
import type { ProviderId } from '@/pipeline/types';

export const snapshotMetadataSchema = z.object({
  provider: z.enum(['sleeper', 'nflverse']),
  /** Adapter/schema contract version this snapshot was captured against. */
  schemaVersion: z.number().int().positive(),
  /** ISO-8601 capture time. */
  retrievedAt: z.string().min(1),
  /** NFL season the data is effective for, when applicable. */
  season: z.number().int().nullable(),
  /** Number of top-level records in the payload. */
  recordCount: z.number().int().nonnegative(),
  /** Deterministic content checksum of the payload (see checksumPayload). */
  checksum: z.string().min(1),
});

export type SnapshotMetadata = z.infer<typeof snapshotMetadataSchema>;

export const rawSnapshotSchema = z.object({
  metadata: snapshotMetadataSchema,
  payload: z.unknown(),
});

export type RawSnapshot = {
  metadata: SnapshotMetadata;
  payload: unknown;
};

// Stable stringify: sorts object keys recursively so checksums are independent
// of key insertion order (a JSON map from one machine hashes the same on
// another). Arrays keep their order — order is meaningful there.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function checksumPayload(payload: unknown): string {
  return digest(stableStringify(payload));
}

function payloadRecordCount(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload !== null && typeof payload === 'object') {
    return Object.keys(payload as Record<string, unknown>).length;
  }
  return 0;
}

export interface BuildSnapshotOptions {
  provider: ProviderId;
  schemaVersion: number;
  retrievedAt: string;
  season: number | null;
}

/** Wrap a freshly retrieved payload as a checksummed, counted snapshot. */
export function buildSnapshot(payload: unknown, opts: BuildSnapshotOptions): RawSnapshot {
  return {
    metadata: {
      provider: opts.provider,
      schemaVersion: opts.schemaVersion,
      retrievedAt: opts.retrievedAt,
      season: opts.season,
      recordCount: payloadRecordCount(payload),
      checksum: checksumPayload(payload),
    },
    payload,
  };
}

export type SnapshotIntegrity =
  | { ok: true; snapshot: RawSnapshot }
  | { ok: false; error: string };

/**
 * Validate a parsed snapshot object: schema-check the metadata, then verify the
 * checksum and record count against the payload. A mismatch means the snapshot
 * was edited or truncated and must not be trusted.
 */
export function verifySnapshot(input: unknown): SnapshotIntegrity {
  const parsed = rawSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `snapshot metadata invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }
  const snap = parsed.data as RawSnapshot;
  const expected = checksumPayload(snap.payload);
  if (expected !== snap.metadata.checksum) {
    return {
      ok: false,
      error: `checksum mismatch for ${snap.metadata.provider} (expected ${expected}, stored ${snap.metadata.checksum})`,
    };
  }
  const count = payloadRecordCount(snap.payload);
  if (count !== snap.metadata.recordCount) {
    return {
      ok: false,
      error: `record count mismatch for ${snap.metadata.provider} (payload ${count}, stored ${snap.metadata.recordCount})`,
    };
  }
  return { ok: true, snapshot: snap };
}

/** Derive staleness against a configured clock. `maxAgeMs` from the run config. */
export function isStale(meta: SnapshotMetadata, nowIso: string, maxAgeMs: number): boolean {
  const retrieved = Date.parse(meta.retrievedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(retrieved) || Number.isNaN(now)) return true; // unparseable → treat as stale
  return now - retrieved > maxAgeMs;
}

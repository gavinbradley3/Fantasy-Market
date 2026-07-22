// Canonical (de)serialization + integrity for persisted artifacts (Phase 6).
//
// REUSES the repository's existing deterministic serializers/checksums — it never
// introduces a second canonical representation:
//   • raw envelope  → `checksumPayload` (Phase 5 transport, over exact stored bytes)
//   • snapshot id   → `snap-${digest(stableStringify(<9 ordered collections>))}` (Phase 4)
//   • normalized in → `normalizedInputDigest` = digest(stableStringify(input)) (Phase 3)
//   • output        → digest(serialized) where `serialized` is the production envelope
//
// Verification recomputes each identity from the STORED content and compares, so a
// corrupted row is rejected on read rather than returned as plausible data.

import { digest, stableStringify } from '@/inference/util/checksum';
import type { NormalizedSnapshot } from '@/ingestion';
import type { NormalizedInferenceInput } from '@/inference/production/types';
import { checksumPayload, type RawPayloadEnvelope } from '@/transport';
import { PersistenceError } from './errors';

// ---- raw payload envelope ----

export function verifyRawEnvelopeIntegrity(env: RawPayloadEnvelope, where: 'write' | 'read'): void {
  const actual = checksumPayload(env.payload);
  if (actual !== env.payloadChecksum) {
    throw new PersistenceError('CHECKSUM_MISMATCH', `raw payload checksum mismatch on ${where}`, {
      stage: where === 'read' ? 'integrity' : 'raw-envelope-write',
      detail: `expected ${env.payloadChecksum}, got ${actual}`,
    });
  }
}

// ---- canonical snapshot ----

/** The 9 canonically-ordered collections that define a snapshot's content identity. */
function snapshotOrderedCollections(s: NormalizedSnapshot) {
  return {
    players: s.players,
    rosters: s.rosters,
    schedule: s.schedule,
    games: s.games,
    participation: s.participation,
    injuries: s.injuries,
    transactions: s.transactions,
    officialStarts: s.officialStarts,
    depthCharts: s.depthCharts,
  };
}

/** Recompute the Phase 4 snapshot id from content (same formula as `buildSnapshot`). */
export function recomputeSnapshotId(s: NormalizedSnapshot): string {
  return `snap-${digest(stableStringify(snapshotOrderedCollections(s)))}`;
}

export function serializeSnapshot(s: NormalizedSnapshot): { serialized: string; checksum: string } {
  const serialized = stableStringify(s);
  return { serialized, checksum: digest(serialized) };
}

export function deserializeSnapshot(serialized: string): NormalizedSnapshot {
  return JSON.parse(serialized) as NormalizedSnapshot;
}

/** Verify a stored snapshot: bytes→checksum AND recomputed content id→snapshot id. */
export function verifySnapshotIntegrity(serialized: string, snapshotId: string, checksum: string): NormalizedSnapshot {
  if (digest(serialized) !== checksum) {
    throw new PersistenceError('CHECKSUM_MISMATCH', 'snapshot serialized bytes do not match stored checksum', { stage: 'integrity', detail: snapshotId });
  }
  const snapshot = deserializeSnapshot(serialized);
  const recomputed = recomputeSnapshotId(snapshot);
  if (recomputed !== snapshotId) {
    throw new PersistenceError('INTEGRITY_VIOLATION', 'snapshot content does not reproduce its stored snapshot id', { stage: 'integrity', detail: `stored ${snapshotId}, recomputed ${recomputed}` });
  }
  return snapshot;
}

// ---- normalized inference input ----
//
// The artifact IDENTITY is the production `normalizedInputChecksum` (a digest of the
// AIL's internal canonical projection — as-of-clamped facts + version constants — which
// is NOT reproducible from the input object alone). Byte-integrity of the stored input is
// therefore verified with a separate `serializedChecksum = digest(serialized)`. The
// end-to-end reproduction guarantee (this input → that output) is proven by the replay
// path, which re-runs the AIL and matches the output checksum.

export function serializeNormalizedInput(input: NormalizedInferenceInput): { serialized: string; serializedChecksum: string } {
  const serialized = stableStringify(input);
  return { serialized, serializedChecksum: digest(serialized) };
}

export function deserializeNormalizedInput(serialized: string): NormalizedInferenceInput {
  return JSON.parse(serialized) as NormalizedInferenceInput;
}

export function verifyNormalizedInputIntegrity(serialized: string, serializedChecksum: string): NormalizedInferenceInput {
  const recomputed = digest(serialized);
  if (recomputed !== serializedChecksum) {
    throw new PersistenceError('CHECKSUM_MISMATCH', 'normalized input bytes do not match stored checksum', { stage: 'integrity', detail: `stored ${serializedChecksum}, recomputed ${recomputed}` });
  }
  return deserializeNormalizedInput(serialized);
}

// ---- inference output ----

export function verifyOutputIntegrity(serialized: string, outputChecksum: string): void {
  const recomputed = digest(serialized);
  if (recomputed !== outputChecksum) {
    throw new PersistenceError('CHECKSUM_MISMATCH', 'inference output content does not match stored checksum', { stage: 'integrity', detail: `stored ${outputChecksum}, recomputed ${recomputed}` });
  }
}

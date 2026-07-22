// Strict retry-conflict tests (Phase 6 correction 1). A retryable event record accepts an
// IDENTICAL retry idempotently but REJECTS a conflicting one (same key, different content)
// with a typed CONFLICTING_ARTIFACT — never a silent last/first-writer-wins. Also covers the
// successful-run completeness hardening (a success run must carry ≥1 inference association).

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { stableStringify } from '@/inference/util/checksum';
import { PersistenceStore } from './store';
import { persistRefreshResult } from './persistRefreshResult';
import { PersistenceError } from './errors';
import { SCHEMA_VERSIONS, type RefreshRunRecord, type RefreshSourceOutcomeRecord, type RunInferenceRecord } from './types';
import type { Database } from './sqlite/db';
import { mockedFailedRefresh, mockedPartialRefresh, mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const paths: string[] = [];
function seedSnap(s: PersistenceStore, id: string) {
  (s as unknown as { db: Database }).db
    .prepare('INSERT OR IGNORE INTO snapshot_artifact (snapshot_id, schema_version, serialized, checksum, created_at) VALUES (?,?,?,?,?)')
    .run(id, SCHEMA_VERSIONS.snapshot, '{}', 'x', 'now');
}
function store() {
  const p = tempDbPath();
  paths.push(p);
  const s = PersistenceStore.open(p, () => '2026-01-01T00:00:00.000Z');
  // Seed the snapshot ids the synthetic run records reference (FK targets).
  seedSnap(s, 'snap-x');
  seedSnap(s, 'snap-other');
  return s;
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

function baseRun(over: Partial<RefreshRunRecord> = {}): RefreshRunRecord {
  return {
    runId: 'run-1', schemaVersion: SCHEMA_VERSIONS.refreshRun, startedAt: 'a', completedAt: 'b', mode: 'live', status: 'success',
    requiredFailure: false, sourceCount: 5, successCount: 5, failureCount: 0, codeVersion: 'v1', configFingerprint: 'cfg', snapshotId: 'snap-x', createdAt: 'b', ...over,
  };
}
function baseOutcome(over: Partial<RefreshSourceOutcomeRecord> = {}): RefreshSourceOutcomeRecord {
  return {
    runId: 'run-1', provider: 'nflverse', capability: 'identity', requestKey: 'k1', required: true, mode: 'liveFetch', status: 'success',
    payloadChecksum: null, errorCode: null, failureStage: null, retryable: null, errorMessage: null, ...over,
  };
}

describe('A. refresh-run retry conflicts', () => {
  it('identical run retry succeeds (idempotent)', () => {
    const s = store();
    s.persistRefreshRun(baseRun());
    expect(() => s.persistRefreshRun(baseRun())).not.toThrow();
    s.close();
  });
  it.each([
    ['status', { status: 'failure' as const }],
    ['counts', { sourceCount: 99, successCount: 0, failureCount: 99 }],
    ['snapshot reference', { snapshotId: 'snap-other' }],
    ['timestamps', { startedAt: 'zzz', completedAt: 'zzz' }],
    ['provenance', { codeVersion: 'v2' }],
    ['required-failure', { requiredFailure: true }],
  ])('same run id with different %s fails with CONFLICTING_ARTIFACT', (_label, over) => {
    const s = store();
    s.persistRefreshRun(baseRun());
    try {
      s.persistRefreshRun(baseRun(over));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT');
    }
    s.close();
  });
});

describe('B. source-outcome retry conflicts', () => {
  function seed(s: PersistenceStore) {
    s.persistRefreshRun(baseRun());
  }
  it('identical source outcome retry succeeds', () => {
    const s = store();
    seed(s);
    s.persistRefreshSourceOutcome(baseOutcome());
    expect(() => s.persistRefreshSourceOutcome(baseOutcome())).not.toThrow();
    s.close();
  });
  it.each([
    ['status success→failure', { status: 'failure' as const, mode: 'failed' as const, errorCode: 'X', retryable: false }],
    ['payload checksum', { payloadChecksum: 'sha-different' }],
    ['provider', { provider: 'sleeper' as const }],
    ['capability', { capability: 'roster' as const }],
  ])('same (run, request key) with different %s fails', (_label, over) => {
    const s = store();
    seed(s);
    s.persistRefreshSourceOutcome(baseOutcome());
    try {
      s.persistRefreshSourceOutcome(baseOutcome(over));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT');
    }
    s.close();
  });
  it('diagnostic differing only by object key-order is IDENTICAL (canonicalized) → idempotent', () => {
    const s = store();
    seed(s);
    const msgA = stableStringify({ stage: 'fetch', code: 'E1', retryable: true });
    const msgB = stableStringify({ retryable: true, code: 'E1', stage: 'fetch' }); // same content, keys reordered
    expect(msgA).toBe(msgB);
    s.persistRefreshSourceOutcome(baseOutcome({ status: 'failure', mode: 'failed', errorMessage: msgA }));
    expect(() => s.persistRefreshSourceOutcome(baseOutcome({ status: 'failure', mode: 'failed', errorMessage: msgB }))).not.toThrow();
    s.close();
  });
  it('a semantically different diagnostic fails', () => {
    const s = store();
    seed(s);
    s.persistRefreshSourceOutcome(baseOutcome({ status: 'failure', mode: 'failed', errorMessage: stableStringify({ code: 'E1' }) }));
    try {
      s.persistRefreshSourceOutcome(baseOutcome({ status: 'failure', mode: 'failed', errorMessage: stableStringify({ code: 'E2' }) }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT');
    }
    s.close();
  });
});

describe('C. run-inference association retry conflicts', () => {
  // Associations FK to normalized_input / output artifacts — persist a real run to seed them.
  async function seededRun(s: PersistenceStore) {
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, runId: 'run-assoc', startedAt: 'a', completedAt: 'b' });
    return outcome.inference[0];
  }
  it('identical association retry succeeds', async () => {
    const s = store();
    const ref = await seededRun(s);
    const rec: RunInferenceRecord = { runId: 'run-assoc', canonicalId: ref.canonicalId, position: ref.position, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum };
    expect(() => s.associateRunInference(rec)).not.toThrow();
    s.close();
  });
  it('different output checksum under same coordinate fails', async () => {
    const s = store();
    const ref = await seededRun(s);
    // Use the OTHER player's real output checksum (satisfies the FK) under player[0]'s coord.
    const view = s.getRefreshRun('run-assoc')!;
    const other = view.inference.find((e) => e.canonicalId !== ref.canonicalId)!;
    const rec: RunInferenceRecord = { runId: 'run-assoc', canonicalId: ref.canonicalId, position: ref.position, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: other.outputChecksum };
    try {
      s.associateRunInference(rec);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT');
    }
    s.close();
  });
  it('different normalized-input checksum under same coordinate fails', async () => {
    const s = store();
    const ref = await seededRun(s);
    const view = s.getRefreshRun('run-assoc')!;
    const other = view.inference.find((e) => e.canonicalId !== ref.canonicalId)!;
    const rec: RunInferenceRecord = { runId: 'run-assoc', canonicalId: ref.canonicalId, position: ref.position, normalizedInputChecksum: other.normalizedInputChecksum, outputChecksum: ref.outputChecksum };
    expect(() => s.associateRunInference(rec)).toThrowError(PersistenceError);
    s.close();
  });
  it('a conflicting association inside persistRefreshResult rolls back the whole run', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    // First persist a run under a fixed id.
    persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, runId: 'run-rb', startedAt: 'a', completedAt: 'b' });
    // Now re-persist the SAME run id but with a conflicting run-level field (different mode
    // is derived from sources, so instead force a conflict at the run row): different status.
    const conflicting = { ...m.result, status: 'partial' as const };
    try {
      persistRefreshResult(s, { result: conflicting, inferenceBuilds: m.builds, runId: 'run-rb', startedAt: 'a', completedAt: 'b' });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT');
    }
    // The original run is unchanged (still success with its full board).
    const view = s.getRefreshRun('run-rb')!;
    expect(view.run.status).toBe('success');
    expect(view.inference.length).toBe(m.builds.length);
    s.close();
  });
});

describe('D. successful-run completeness', () => {
  it('a success run with zero inference associations is rejected and rolled back', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    // Persist the successful result but pass NO inference builds → zero associations.
    try {
      persistRefreshResult(s, { result: m.result, runId: 'run-empty', startedAt: 'a', completedAt: 'b' });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('INVALID_ARTIFACT_SET');
    }
    // Fully rolled back — the run row does not exist.
    expect(s.getRefreshRun('run-empty')).toBeNull();
    s.close();
  });
  it('a failed run with zero associations is allowed', async () => {
    const s = store();
    const m = await mockedFailedRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, startedAt: 'a', completedAt: 'b' });
    expect(outcome.status).toBe('failure');
    expect(s.getRefreshRun(outcome.runId)!.inference.length).toBe(0);
    s.close();
  });
  it('a partial run with zero associations is allowed (not publishable)', async () => {
    const s = store();
    const m = await mockedPartialRefresh();
    // Persist the partial result WITHOUT builds → zero associations, still recorded.
    const outcome = persistRefreshResult(s, { result: m.result, startedAt: 'a', completedAt: 'b' });
    expect(outcome.status).toBe('partial');
    expect(outcome.publishable).toBe(false);
    expect(s.getRefreshRun(outcome.runId)!.inference.length).toBe(0);
    s.close();
  });
  it('a valid success run with associations persists and is publishable', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, startedAt: 'a', completedAt: 'b' });
    expect(outcome.publishable).toBe(true);
    expect(outcome.inference.length).toBe(m.builds.length);
    s.close();
  });
});

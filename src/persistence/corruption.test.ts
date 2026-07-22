// Corruption-detection tests (Phase 6): manually corrupt each stored artifact and confirm
// reads fail with typed integrity errors rather than returning plausible-but-wrong data,
// including the current-publication bundle (which must never surface a corrupt member).

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore } from './store';
import { persistRefreshResult } from './persistRefreshResult';
import { PersistenceError } from './errors';
import type { Database } from './sqlite/db';
import { mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
function store() {
  const p = tempDbPath();
  paths.push(p);
  return PersistenceStore.open(p, () => '2026-01-01T00:00:10.000Z');
}
function rawDb(s: PersistenceStore): Database {
  return (s as unknown as { db: Database }).db;
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

describe('corruption detection', () => {
  it('corrupted normalized input is rejected on read', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const checksum = outcome.inference[0].normalizedInputChecksum;
    rawDb(s).prepare('UPDATE normalized_input_artifact SET serialized = ? WHERE checksum = ?').run('{"tampered":true}', checksum);
    expect(() => s.getNormalizedInputByChecksum(checksum)).toThrowError(PersistenceError);
    s.close();
  });

  it('corrupted inference output is rejected on read', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const checksum = outcome.inference[0].outputChecksum;
    rawDb(s).prepare('UPDATE inference_output_artifact SET serialized = ? WHERE checksum = ?').run('{"tampered":true}', checksum);
    try {
      s.getInferenceOutputByChecksum(checksum);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CHECKSUM_MISMATCH');
    }
    s.close();
  });

  it('the current bundle refuses to return a corrupt member', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    s.publishBoard({ runId: outcome.runId });
    // Corrupt the published snapshot bytes.
    rawDb(s).prepare('UPDATE snapshot_artifact SET serialized = ? WHERE snapshot_id = ?').run('{"players":[]}', outcome.snapshotId!);
    expect(() => s.getCurrentPublication()).toThrowError(PersistenceError);
    s.close();
  });
});

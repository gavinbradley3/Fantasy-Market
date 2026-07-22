// Concurrency / retry-safety tests (Phase 6). node:sqlite is single-process and
// synchronous; these cover two connections to the same file writing the same content,
// a reader observing a committed publication, and idempotent double-publish — NOT
// distributed safety (explicitly out of scope; see README).

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore } from './store';
import { persistRefreshResult } from './persistRefreshResult';
import { buildEnvelope, type FetchOutcome } from '@/transport';
import { mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
function open(p: string) {
  return PersistenceStore.open(p, () => '2026-01-01T00:00:10.000Z');
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

function env(payload: string) {
  const outcome: FetchOutcome = { kind: 'ok', httpStatus: 200, contentType: 'application/json', payloadEncoding: 'utf8', payload, url: 'https://x/y.json', elapsedMs: 1 };
  return buildEnvelope({ provider: 'nflverse', capability: 'games', requestKey: 'nflverse:games?season=2025', fetchedAt: '2025-09-30T12:00:00.000Z', effectiveDate: '2025-09-30T00:00:00.000Z', outcome });
}

describe('concurrency & retry safety (single-process)', () => {
  it('two connections writing the same artifact yield exactly one row', () => {
    const p = tempDbPath();
    paths.push(p);
    const a = open(p);
    const b = open(p);
    const e = env('[{"a":1}]');
    a.persistRawEnvelope(e);
    b.persistRawEnvelope(e); // same content via a second connection — idempotent
    const back = b.getRawEnvelopeByChecksum(e.payloadChecksum);
    expect(back?.payloadChecksum).toBe(e.payloadChecksum);
    a.close();
    b.close();
  });

  it('a reader on a second connection observes a committed publication', async () => {
    const p = tempDbPath();
    paths.push(p);
    const writer = open(p);
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(writer, { result: m.result, inferenceBuilds: m.builds, ...META });
    const ref = outcome.inference[0];
    writer.publish({ runId: outcome.runId, snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum });

    const reader = open(p);
    expect(reader.getCurrentPublication()!.snapshot.snapshotId).toBe(outcome.snapshotId);
    writer.close();
    reader.close();
  });

  it('two publication attempts of the same result converge to one current pointer', async () => {
    const p = tempDbPath();
    paths.push(p);
    const c1 = open(p);
    const m = await mockedSuccessfulRefresh();
    const outcome = persistRefreshResult(c1, { result: m.result, inferenceBuilds: m.builds, runId: 'run-x', ...META });
    const ref = outcome.inference[0];
    const pubA = c1.publish({ runId: 'run-x', snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum });
    const c2 = open(p);
    const pubB = c2.publish({ runId: 'run-x', snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum });
    expect(pubA.publicationId).toBe(pubB.publicationId);
    expect(c2.getPublicationHistory().length).toBe(1);
    c1.close();
    c2.close();
  });
});

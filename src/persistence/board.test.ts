// Board-publication tests (Phase 6 correction 2): deterministic board identity, eligibility,
// atomic current-pointer advance under injected failure, complete-board retrieval, and
// idempotency/conflict of publication.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { digest } from '@/inference/util/checksum';
import { PersistenceStore } from './store';
import { persistRefreshResult } from './persistRefreshResult';
import { computeBoardIdentity, type BoardEntryInput } from './canonical';
import { PersistenceError } from './errors';
import { SCHEMA_VERSIONS, type RefreshRunRecord } from './types';
import type { Database } from './sqlite/db';
import { mockedFailedRefresh, mockedPartialRefresh, mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
function store() {
  const p = tempDbPath();
  paths.push(p);
  let t = 0;
  return PersistenceStore.open(p, () => `2026-01-01T00:00:${String(10 + t++).padStart(2, '0')}.000Z`);
}
function rawDb(s: PersistenceStore): Database {
  return (s as unknown as { db: Database }).db;
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

const E = (canonicalId: string, position: string, ni: string, out: string): BoardEntryInput => ({ canonicalId, position, normalizedInputChecksum: ni, outputChecksum: out });
const SNAP = 'snap-abc';
const V = SCHEMA_VERSIONS.publication;

describe('E. board identity', () => {
  const base = [E('p2', 'QB', 'ni2', 'o2'), E('p1', 'WR', 'ni1', 'o1'), E('p3', 'RB', 'ni3', 'o3')];
  it('same complete board → same id', () => {
    expect(computeBoardIdentity(V, SNAP, base).publicationId).toBe(computeBoardIdentity(V, SNAP, base).publicationId);
  });
  it('reversed input order → same id (order-independent over input order)', () => {
    expect(computeBoardIdentity(V, SNAP, [...base].reverse()).publicationId).toBe(computeBoardIdentity(V, SNAP, base).publicationId);
  });
  it('changed output → different id', () => {
    const changed = [E('p1', 'WR', 'ni1', 'oX'), E('p2', 'QB', 'ni2', 'o2'), E('p3', 'RB', 'ni3', 'o3')];
    expect(computeBoardIdentity(V, SNAP, changed).publicationId).not.toBe(computeBoardIdentity(V, SNAP, base).publicationId);
  });
  it('changed input → different id', () => {
    const changed = [E('p1', 'WR', 'niX', 'o1'), E('p2', 'QB', 'ni2', 'o2'), E('p3', 'RB', 'ni3', 'o3')];
    expect(computeBoardIdentity(V, SNAP, changed).publicationId).not.toBe(computeBoardIdentity(V, SNAP, base).publicationId);
  });
  it('added or removed player → different id', () => {
    const added = [...base, E('p4', 'TE', 'ni4', 'o4')];
    const removed = base.slice(1);
    const id = computeBoardIdentity(V, SNAP, base).publicationId;
    expect(computeBoardIdentity(V, SNAP, added).publicationId).not.toBe(id);
    expect(computeBoardIdentity(V, SNAP, removed).publicationId).not.toBe(id);
  });
  it('a different snapshot → different id', () => {
    expect(computeBoardIdentity(V, 'snap-other', base).publicationId).not.toBe(computeBoardIdentity(V, SNAP, base).publicationId);
  });
  it('duplicate (canonicalId, position) coordinate is rejected', () => {
    const dup = [E('p1', 'WR', 'ni1', 'o1'), E('p1', 'WR', 'niX', 'oX')];
    expect(() => computeBoardIdentity(V, SNAP, dup)).toThrowError(PersistenceError);
  });
  it('canonical ordering is stable by (canonicalId, position)', () => {
    const ordered = computeBoardIdentity(V, SNAP, base).orderedEntries.map((e) => `${e.canonicalId}:${e.position}`);
    expect(ordered).toEqual(['p1:WR', 'p2:QB', 'p3:RB']);
  });
  it('the id carries the board- prefix over the board checksum', () => {
    const id = computeBoardIdentity(V, SNAP, base);
    expect(id.publicationId).toBe(`board-${id.boardChecksum}`);
    expect(id.boardChecksum).toMatch(/^[0-9a-f]{16}$/); // two FNV-1a passes (8 hex each)
    expect(id.entryCount).toBe(base.length);
  });
});

describe('F. board publication eligibility', () => {
  it('a complete successful multi-player run publishes', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const pub = s.publishBoard({ runId: o.runId });
    expect(pub.entryCount).toBe(o.inference.length);
    s.close();
  });
  it('a failed run cannot publish', async () => {
    const s = store();
    const m = await mockedFailedRefresh();
    const o = persistRefreshResult(s, { result: m.result, ...META });
    expect(() => s.publishBoard({ runId: o.runId })).toThrowError(/not publishable/);
    s.close();
  });
  it('a partial run cannot publish', async () => {
    const s = store();
    const m = await mockedPartialRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    try {
      s.publishBoard({ runId: o.runId });
      throw new Error('expected throw');
    } catch (e) { expect((e as PersistenceError).code).toBe('PUBLICATION_NOT_ALLOWED'); }
    s.close();
  });
  it('a success run with zero entries cannot publish', () => {
    const s = store();
    // Insert a success run row directly (bypassing the completeness guard) with no associations.
    const run: RefreshRunRecord = { runId: 'run-bare', schemaVersion: SCHEMA_VERSIONS.refreshRun, startedAt: 'a', completedAt: 'b', mode: 'live', status: 'success', requiredFailure: false, sourceCount: 0, successCount: 0, failureCount: 0, codeVersion: null, configFingerprint: null, snapshotId: null, createdAt: 'b' };
    s.persistRefreshRun(run);
    try {
      s.publishBoard({ runId: 'run-bare' });
      throw new Error('expected throw');
    } catch (e) { expect((e as PersistenceError).code).toBe('PUBLICATION_NOT_ALLOWED'); }
    s.close();
  });
  it('a mismatched snapshot linkage prevents publication (INVALID_ARTIFACT_SET)', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    // Introduce a second (synthetic) snapshot and repoint one output to it.
    const serialized = '{"players":[]}';
    rawDb(s).prepare('INSERT INTO snapshot_artifact (snapshot_id, schema_version, serialized, checksum, created_at) VALUES (?,?,?,?,?)').run('snap-fake', SCHEMA_VERSIONS.snapshot, serialized, digest(serialized), 'now');
    rawDb(s).prepare('UPDATE inference_output_artifact SET snapshot_id = ? WHERE checksum = ?').run('snap-fake', o.inference[0].outputChecksum);
    try {
      s.publishBoard({ runId: o.runId });
      throw new Error('expected throw');
    } catch (e) { expect((e as PersistenceError).code).toBe('INVALID_ARTIFACT_SET'); }
    s.close();
  });
  it('a corrupted artifact prevents publication', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    rawDb(s).prepare('UPDATE inference_output_artifact SET serialized = ? WHERE checksum = ?').run('{"tampered":1}', o.inference[0].outputChecksum);
    expect(() => s.publishBoard({ runId: o.runId })).toThrowError(PersistenceError);
    s.close();
  });
});

describe('G. atomic current board under injected failure', () => {
  async function withBoardA(s: PersistenceStore) {
    const a = await mockedSuccessfulRefresh();
    persistRefreshResult(s, { result: a.result, inferenceBuilds: a.builds, runId: 'run-A', ...META });
    return s.publishBoard({ runId: 'run-A' });
  }
  async function prepareBoardB(s: PersistenceStore) {
    const b = await mockedSuccessfulRefresh();
    // WR-only board → a distinct board id from A.
    return persistRefreshResult(s, { result: b.result, inferenceBuilds: [b.builds[0]], runId: 'run-B', ...META });
  }

  it('failure BEFORE the publication insert leaves board A current', async () => {
    const s = store();
    const pubA = await withBoardA(s);
    await prepareBoardB(s);
    (s as unknown as { insertPublicationRow: () => void }).insertPublicationRow = () => { throw new Error('inject: insert'); };
    expect(() => s.publishBoard({ runId: 'run-B' })).toThrow();
    expect(s.getCurrentPublicationRecord()!.publicationId).toBe(pubA.publicationId);
    s.close();
  });

  it('failure AFTER insert but BEFORE pointer advance rolls back (A stays current, no dangling publication)', async () => {
    const s = store();
    const pubA = await withBoardA(s);
    const ob = await prepareBoardB(s);
    const boardB = computeBoardIdentity(SCHEMA_VERSIONS.publication, ob.snapshotId!, ob.inference.map((e) => ({ canonicalId: e.canonicalId, position: e.position, normalizedInputChecksum: e.normalizedInputChecksum, outputChecksum: e.outputChecksum })));
    (s as unknown as { advanceCurrentPointer: () => void }).advanceCurrentPointer = () => { throw new Error('inject: pointer'); };
    expect(() => s.publishBoard({ runId: 'run-B' })).toThrow();
    // A is still current AND the half-inserted B publication row was rolled back.
    expect(s.getCurrentPublicationRecord()!.publicationId).toBe(pubA.publicationId);
    expect(s.getPublicationRecord(boardB.publicationId)).toBeNull();
    s.close();
  });

  it('a successful B publication replaces A atomically (no A/B mixing)', async () => {
    const s = store();
    const pubA = await withBoardA(s);
    await prepareBoardB(s);
    const pubB = s.publishBoard({ runId: 'run-B' });
    expect(pubB.publicationId).not.toBe(pubA.publicationId);
    const cur = s.getCurrentPublication()!;
    expect(cur.publication.publicationId).toBe(pubB.publicationId);
    expect(cur.entries.length).toBe(1); // WR-only board B, never mixed with A's 2 entries
    s.close();
  });
});

describe('H. board retrieval', () => {
  it('current & historical publications return ALL players, ordered, with verified artifacts', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const pub = s.publishBoard({ runId: o.runId });

    for (const bundle of [s.getCurrentPublication()!, s.getPublicationBundle(pub.publicationId)!]) {
      expect(bundle.entries.length).toBe(o.inference.length);
      const coords = bundle.entries.map((e) => `${e.canonicalId}:${e.position}`);
      expect(coords).toEqual([...coords].sort());
      for (const e of bundle.entries) {
        expect(e.output.checksum).toBeTruthy();
        expect(e.normalizedInput.checksum).toBe(e.output.normalizedInputChecksum);
      }
      // Recomputed board id matches the stored publication id.
      const recomputed = computeBoardIdentity(bundle.publication.schemaVersion, bundle.publication.snapshotId, bundle.entries.map((e) => ({ canonicalId: e.canonicalId, position: e.position, normalizedInputChecksum: e.normalizedInput.checksum, outputChecksum: e.output.checksum })));
      expect(recomputed.publicationId).toBe(bundle.publication.publicationId);
    }
    s.close();
  });
  it('an entry-count mismatch is detected as a typed integrity failure', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    s.publishBoard({ runId: o.runId });
    // Remove one association after publishing → count no longer matches the board.
    rawDb(s).prepare('DELETE FROM run_inference WHERE run_id = ? AND canonical_id = ?').run(o.runId, o.inference[0].canonicalId);
    try {
      s.getCurrentPublication();
      throw new Error('expected throw');
    } catch (e) { expect((e as PersistenceError).code).toBe('INTEGRITY_VIOLATION'); }
    s.close();
  });
});

describe('I. publication idempotency and conflict', () => {
  it('publishing the same board twice yields one row and a coherent current pointer', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const a = s.publishBoard({ runId: o.runId });
    const b = s.publishBoard({ runId: o.runId });
    expect(a.publicationId).toBe(b.publicationId);
    expect(s.getPublicationHistory().length).toBe(1);
    expect(s.getCurrentPublicationRecord()!.publicationId).toBe(a.publicationId);
    s.close();
  });
  it('a stored publication whose board content conflicts with a re-publish is rejected', async () => {
    const s = store();
    const m = await mockedSuccessfulRefresh();
    const o = persistRefreshResult(s, { result: m.result, inferenceBuilds: m.builds, ...META });
    const pub = s.publishBoard({ runId: o.runId });
    // Corrupt the stored publication's board_checksum so a re-publish detects the conflict.
    rawDb(s).prepare('UPDATE publication SET board_checksum = ? WHERE publication_id = ?').run('tampered', pub.publicationId);
    try {
      s.publishBoard({ runId: o.runId });
      throw new Error('expected throw');
    } catch (e) { expect((e as PersistenceError).code).toBe('CONFLICTING_ARTIFACT'); }
    s.close();
  });
  it('two connections publishing the same board converge to one current board', async () => {
    const p = tempDbPath();
    paths.push(p);
    const c1 = PersistenceStore.open(p, () => '2026-01-01T00:00:10.000Z');
    const m = await mockedSuccessfulRefresh();
    persistRefreshResult(c1, { result: m.result, inferenceBuilds: m.builds, runId: 'run-x', ...META });
    const pubA = c1.publishBoard({ runId: 'run-x' });
    const c2 = PersistenceStore.open(p, () => '2026-01-01T00:00:11.000Z');
    const pubB = c2.publishBoard({ runId: 'run-x' });
    expect(pubA.publicationId).toBe(pubB.publicationId);
    expect(c2.getPublicationHistory().length).toBe(1);
    c1.close();
    c2.close();
  });
});

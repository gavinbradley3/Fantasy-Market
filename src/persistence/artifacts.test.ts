// Artifact persistence tests (Phase 6): raw envelopes, snapshot, normalized input, and
// output — round-trip, exact checksum preservation, idempotent duplicate writes,
// conflicting-content rejection, corruption detection, and unsupported-schema rejection.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore } from './store';
import { PersistenceError } from './errors';
import { buildEnvelope, type FetchOutcome, type RawPayloadEnvelope } from '@/transport';
import { mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const paths: string[] = [];
function store() {
  const p = tempDbPath();
  paths.push(p);
  return PersistenceStore.open(p, () => '2026-01-01T00:00:00.000Z');
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

function envelope(payload: string, encoding: 'utf8' | 'base64' = 'utf8'): RawPayloadEnvelope {
  const outcome: FetchOutcome = { kind: 'ok', httpStatus: 200, contentType: 'application/json', payloadEncoding: encoding, payload, url: 'https://x/y.json', elapsedMs: 3 };
  return buildEnvelope({ provider: 'nflverse', capability: 'games', requestKey: 'nflverse:games?season=2025', fetchedAt: '2025-09-30T12:00:00.000Z', effectiveDate: '2025-09-30T00:00:00.000Z', sourceUrl: 'https://x/y.json', outcome });
}

describe('raw envelope artifact', () => {
  it('round-trips UTF-8 bytes exactly and preserves the checksum', () => {
    const s = store();
    const env = envelope('[{"a":1,"name":"héllo — ✓"}]');
    s.persistRawEnvelope(env);
    const back = s.getRawEnvelopeByChecksum(env.payloadChecksum);
    expect(back).toEqual(env);
    s.close();
  });

  it('round-trips a base64 payload', () => {
    const s = store();
    const b64 = Buffer.from([0, 1, 2, 253, 254, 255]).toString('base64');
    const env = envelope(b64, 'base64');
    s.persistRawEnvelope(env);
    expect(s.getRawEnvelopeByChecksum(env.payloadChecksum)?.payload).toBe(b64);
    s.close();
  });

  it('duplicate insert of identical bytes is idempotent (one row)', () => {
    const s = store();
    const env = envelope('[{"a":1}]');
    s.persistRawEnvelope(env);
    s.persistRawEnvelope(env);
    expect(s.getRawEnvelopeByChecksum(env.payloadChecksum)).toEqual(env);
    s.close();
  });

  it('rejects conflicting content under the same checksum', () => {
    const s = store();
    const env = envelope('[{"a":1}]');
    s.persistRawEnvelope(env);
    const forged = { ...env, payload: '[{"a":2}]' }; // checksum no longer matches bytes
    expect(() => s.persistRawEnvelope(forged)).toThrowError(PersistenceError);
    s.close();
  });

  it('rejects a checksum/byte mismatch on write', () => {
    const s = store();
    const env = { ...envelope('[{"a":1}]'), payloadChecksum: 'sha-deadbeefdeadbeef' };
    try {
      s.persistRawEnvelope(env);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CHECKSUM_MISMATCH');
    }
    s.close();
  });

  it('detects corruption on read (typed integrity error)', () => {
    const s = store();
    const env = envelope('[{"a":1}]');
    s.persistRawEnvelope(env);
    // Corrupt the stored payload directly, bypassing the store's guards.
    (s as unknown as { db: import('./sqlite/db').Database }).db.prepare('UPDATE raw_payload_artifact SET payload = ? WHERE payload_checksum = ?').run('[{"a":999}]', env.payloadChecksum);
    try {
      s.getRawEnvelopeByChecksum(env.payloadChecksum);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('CHECKSUM_MISMATCH');
      expect((e as PersistenceError).stage).toBe('integrity');
    }
    s.close();
  });

  it('rejects an unsupported persisted schema version on read', () => {
    const s = store();
    const env = envelope('[{"a":1}]');
    s.persistRawEnvelope(env);
    (s as unknown as { db: import('./sqlite/db').Database }).db.prepare('UPDATE raw_payload_artifact SET schema_version = ? WHERE payload_checksum = ?').run('transport.envelope/999', env.payloadChecksum);
    try {
      s.getRawEnvelopeByChecksum(env.payloadChecksum);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('UNSUPPORTED_PERSISTED_SCHEMA');
    }
    s.close();
  });
});

describe('snapshot / normalized-input / output artifacts', () => {
  it('round-trips a real snapshot and rejects a corrupted one', async () => {
    const s = store();
    const { result } = await mockedSuccessfulRefresh();
    const snap = result.snapshot!;
    s.persistSnapshot(snap);
    const back = s.getSnapshotById(snap.snapshotId);
    expect(back?.snapshotId).toBe(snap.snapshotId);
    // Idempotent.
    s.persistSnapshot(snap);
    // Corrupt the serialized bytes → integrity error on read.
    (s as unknown as { db: import('./sqlite/db').Database }).db.prepare('UPDATE snapshot_artifact SET serialized = ? WHERE snapshot_id = ?').run('{"players":[]}', snap.snapshotId);
    expect(() => s.getSnapshotById(snap.snapshotId)).toThrowError(PersistenceError);
    s.close();
  });

  it('rejects conflicting snapshot bytes under the same snapshot id', async () => {
    const s = store();
    const { result } = await mockedSuccessfulRefresh();
    const snap = result.snapshot!;
    s.persistSnapshot(snap);
    const forged = { ...snap, players: [] }; // same id, different content
    try {
      s.persistSnapshot(forged);
      throw new Error('expected throw');
    } catch (e) {
      // Content no longer reproduces the id → integrity violation caught first.
      expect(e).toBeInstanceOf(PersistenceError);
    }
    s.close();
  });
});

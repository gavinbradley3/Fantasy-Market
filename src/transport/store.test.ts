// Cache/store tests (Phase 5). Write+read, latest-by-provider/capability/request-key, a
// missing entry, and a corrupt on-disk entry — for both the in-memory and filesystem
// stores. ETag/Last-Modified/304 revalidation is exercised end-to-end in refresh.test.ts.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { FilePayloadStore } from './fileStore';
import { MemoryPayloadStore } from './memoryStore';
import { buildEnvelope } from './envelope';
import type { RawPayloadStore } from './store';
import type { FetchOutcome, RawPayloadEnvelope } from './types';

function env(payload: string, fetchedAt: string, requestKey = 'nflverse:games?season=2025'): RawPayloadEnvelope {
  const outcome: FetchOutcome = { kind: 'ok', httpStatus: 200, contentType: 'application/json', payloadEncoding: 'utf8', payload, url: 'https://example.test/g.json', elapsedMs: 3 };
  return buildEnvelope({ provider: 'nflverse', capability: 'games', requestKey, fetchedAt, effectiveDate: '2025-09-30T00:00:00.000Z', outcome });
}

const tmpDirs: string[] = [];
function fileStore(): FilePayloadStore {
  const dir = mkdtempSync(join(tmpdir(), 'pt-transport-'));
  tmpDirs.push(dir);
  return new FilePayloadStore(dir);
}
afterAll(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function suite(name: string, make: () => RawPayloadStore) {
  describe(`RawPayloadStore — ${name}`, () => {
    it('writes and reads back by checksum', async () => {
      const store = make();
      const e = env('[{"a":1}]', '2025-09-30T12:00:00.000Z');
      await store.put(e);
      expect(await store.getByChecksum(e.payloadChecksum)).toEqual(e);
    });

    it('returns the LATEST capture by fetchedAt for a request coordinate', async () => {
      const store = make();
      const older = env('[{"a":1}]', '2025-09-30T10:00:00.000Z');
      const newer = env('[{"a":2}]', '2025-09-30T14:00:00.000Z');
      await store.put(older);
      await store.put(newer);
      const latest = await store.getLatest('nflverse', 'games', 'nflverse:games?season=2025');
      expect(latest?.payloadChecksum).toBe(newer.payloadChecksum);
    });

    it('returns null for a missing checksum and a missing coordinate', async () => {
      const store = make();
      expect(await store.getByChecksum('sha-deadbeef')).toBeNull();
      expect(await store.getLatest('nflverse', 'games', 'nope')).toBeNull();
    });

    it('does not mix different request coordinates', async () => {
      const store = make();
      const a = env('[{"a":1}]', '2025-09-30T12:00:00.000Z', 'nflverse:games?season=2024');
      const b = env('[{"b":2}]', '2025-09-30T12:00:00.000Z', 'nflverse:games?season=2025');
      await store.put(a);
      await store.put(b);
      expect((await store.getLatest('nflverse', 'games', 'nflverse:games?season=2024'))?.payloadChecksum).toBe(a.payloadChecksum);
      expect((await store.getLatest('nflverse', 'games', 'nflverse:games?season=2025'))?.payloadChecksum).toBe(b.payloadChecksum);
    });
  });
}

suite('memory', () => new MemoryPayloadStore());
suite('file', () => fileStore());

describe('FilePayloadStore — corrupt entry', () => {
  it('skips an unparseable file rather than throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pt-transport-'));
    tmpDirs.push(dir);
    writeFileSync(join(dir, 'nflverse__games__deadbeef__sha-corrupt.json'), '{not json', 'utf8');
    const store = new FilePayloadStore(dir);
    expect(await store.getByChecksum('sha-corrupt')).toBeNull();
    expect(await store.getLatest('nflverse', 'games', 'nflverse:games?season=2025')).toBeNull();
  });
});

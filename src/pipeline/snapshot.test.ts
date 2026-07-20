import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  checksumPayload,
  isStale,
  stableStringify,
  verifySnapshot,
} from '@/pipeline/snapshot';

describe('snapshot layer', () => {
  const payload = { b: 2, a: [1, 2, 3] };

  it('captures provider, version, timestamp, count, and checksum', () => {
    const snap = buildSnapshot(payload, {
      provider: 'sleeper',
      schemaVersion: 1,
      retrievedAt: '2026-07-01T00:00:00.000Z',
      season: 2025,
    });
    expect(snap.metadata.provider).toBe('sleeper');
    expect(snap.metadata.recordCount).toBe(2); // top-level keys
    expect(snap.metadata.checksum).toBe(checksumPayload(payload));
  });

  it('checksums independently of object key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(checksumPayload({ x: 1, y: 2 })).toBe(checksumPayload({ y: 2, x: 1 }));
  });

  it('verifies a well-formed snapshot', () => {
    const snap = buildSnapshot([{ id: 1 }], {
      provider: 'nflverse',
      schemaVersion: 1,
      retrievedAt: '2026-07-01T00:00:00.000Z',
      season: 2025,
    });
    const result = verifySnapshot(snap);
    expect(result.ok).toBe(true);
  });

  it('detects a tampered payload via checksum mismatch', () => {
    const snap = buildSnapshot({ id: 1 }, {
      provider: 'nflverse',
      schemaVersion: 1,
      retrievedAt: '2026-07-01T00:00:00.000Z',
      season: 2025,
    });
    const tampered = { ...snap, payload: { id: 2 } };
    const result = verifySnapshot(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('checksum mismatch');
  });

  it('detects a record-count mismatch', () => {
    const snap = buildSnapshot([1, 2], {
      provider: 'sleeper',
      schemaVersion: 1,
      retrievedAt: '2026-07-01T00:00:00.000Z',
      season: 2025,
    });
    const wrong = { metadata: { ...snap.metadata, recordCount: 5 }, payload: snap.payload };
    // Fix checksum so only the count is wrong.
    const result = verifySnapshot({ ...wrong, metadata: { ...wrong.metadata, checksum: checksumPayload(snap.payload) } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('record count mismatch');
  });

  it('rejects invalid metadata', () => {
    const result = verifySnapshot({ metadata: { provider: 'bogus' }, payload: {} });
    expect(result.ok).toBe(false);
  });

  it('derives staleness against the configured clock', () => {
    const meta = {
      provider: 'sleeper' as const,
      schemaVersion: 1,
      retrievedAt: '2026-07-01T00:00:00.000Z',
      season: 2025,
      recordCount: 0,
      checksum: 'x',
    };
    const oneDay = 24 * 60 * 60 * 1000;
    expect(isStale(meta, '2026-07-02T00:00:00.000Z', oneDay)).toBe(false); // exactly 24h
    expect(isStale(meta, '2026-07-03T00:00:00.000Z', oneDay)).toBe(true); // 48h > 24h
  });
});

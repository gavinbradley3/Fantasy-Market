// Envelope integrity tests (Phase 5). Exact-byte checksum, utf8 + base64 payloads,
// checksum-mismatch rejection, and the invariant that OPERATIONAL metadata never alters
// the payload checksum.

import { describe, expect, it } from 'vitest';
import { buildEnvelope, checksumPayload, decodePayloadBytes, encodePayload, verifyEnvelope } from './envelope';
import { TransportError } from './errors';
import type { FetchOutcome, RawPayloadEnvelope } from './types';

function outcome(payload: string, extra: Partial<FetchOutcome> = {}): FetchOutcome {
  return { kind: 'ok', httpStatus: 200, contentType: 'application/json', payloadEncoding: 'utf8', payload, url: 'https://example.test/x.json', elapsedMs: 5, ...extra };
}

function envelope(payload: string, extra: Partial<FetchOutcome> = {}): RawPayloadEnvelope {
  return buildEnvelope({
    provider: 'nflverse',
    capability: 'identity',
    requestKey: 'nflverse:identity',
    fetchedAt: '2025-09-30T12:00:00.000Z',
    effectiveDate: '2025-09-30T00:00:00.000Z',
    sourceUrl: 'https://example.test/x.json',
    outcome: outcome(payload, extra),
  });
}

describe('envelope checksum', () => {
  it('is derived from the exact stored bytes; identical bytes → identical checksum', () => {
    const a = envelope('[{"a":1}]');
    const b = envelope('[{"a":1}]');
    expect(a.payloadChecksum).toBe(b.payloadChecksum);
    expect(a.payloadChecksum).toBe(checksumPayload('[{"a":1}]'));
  });

  it('different formatting of equivalent JSON yields a different raw checksum (raw artifact differs)', () => {
    const compact = envelope('[{"a":1}]');
    const spaced = envelope('[{ "a": 1 }]');
    expect(compact.payloadChecksum).not.toBe(spaced.payloadChecksum);
  });

  it('operational metadata (elapsed ms / http status) does not alter the payload checksum', () => {
    const fast = envelope('[{"a":1}]', { elapsedMs: 1, httpStatus: 200 });
    const slow = envelope('[{"a":1}]', { elapsedMs: 9999, httpStatus: 200 });
    expect(fast.payloadChecksum).toBe(slow.payloadChecksum);
    // The envelope never carries elapsedMs at all.
    expect('elapsedMs' in fast).toBe(false);
  });
});

describe('payload encoding', () => {
  it('round-trips a UTF-8 payload', () => {
    const bytes = new TextEncoder().encode('héllo — utf8 ✓');
    const encoded = encodePayload(bytes, 'utf8');
    expect(new TextDecoder().decode(decodePayloadBytes(encoded, 'utf8'))).toBe('héllo — utf8 ✓');
  });

  it('round-trips binary payload as base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const encoded = encodePayload(bytes, 'base64');
    expect(Array.from(decodePayloadBytes(encoded, 'base64'))).toEqual([0, 1, 2, 253, 254, 255]);
  });
});

describe('verifyEnvelope', () => {
  it('accepts an intact envelope', () => {
    expect(() => verifyEnvelope(envelope('[{"a":1}]'))).not.toThrow();
  });

  it('rejects a corrupted payload with a typed CHECKSUM_MISMATCH', () => {
    const good = envelope('[{"a":1}]');
    const corrupt: RawPayloadEnvelope = { ...good, payload: '[{"a":2}]' };
    try {
      verifyEnvelope(corrupt);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TransportError);
      expect((err as TransportError).code).toBe('CHECKSUM_MISMATCH');
      expect((err as TransportError).retryable).toBe(false);
      expect((err as TransportError).stage).toBe('envelope');
    }
  });
});

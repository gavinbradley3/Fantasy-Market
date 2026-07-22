// Raw payload envelope construction + integrity (Phase 5). The envelope is the canonical
// record of one ingestion attempt. Its checksum is derived from the EXACT stored payload
// string and nothing else — different formatting of semantically equivalent JSON yields a
// different raw checksum because the raw artifact is genuinely different. Operational
// metadata (elapsed ms, retries) never enters the envelope or its checksum.
//
// Reuses the repository's deterministic `digest` (FNV-1a via `@/inference/util/checksum`,
// which wraps the shared `@/pipeline/hash`) — a transport-neutral hashing utility, not a
// valuation engine. No new hashing framework is introduced.

import { digest } from '@/inference/util/checksum';
import { TransportError } from './errors';
import {
  ENVELOPE_SCHEMA_VERSION,
  type FetchOutcome,
  type IngestionProvider,
  type PayloadEncoding,
  type ProviderCapability,
  type RawPayloadEnvelope,
} from './types';

/** Checksum of the exact stored payload string. Never re-serialize/parse before hashing. */
export function checksumPayload(payload: string): string {
  return `sha-${digest(payload)}`;
}

/** Decode raw bytes into the stored payload string for the chosen encoding. */
export function encodePayload(bytes: Uint8Array, encoding: PayloadEncoding): string {
  if (encoding === 'utf8') return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return base64FromBytes(bytes);
}

/** Recover the raw bytes from a stored payload string. */
export function decodePayloadBytes(payload: string, encoding: PayloadEncoding): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(payload);
  return bytesFromBase64(payload);
}

function base64FromBytes(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

function bytesFromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  // eslint-disable-next-line no-undef
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export interface BuildEnvelopeParams {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly requestKey: string;
  /** Source fetch time (ISO) — from the injected clock, never Date.now(). */
  readonly fetchedAt: string;
  readonly effectiveDate: string;
  readonly sourceUrl?: string;
  readonly outcome: FetchOutcome;
}

/**
 * Build a canonical envelope from a successful fetch outcome. The checksum is computed
 * from the stored payload string; operational fields (elapsedMs) are dropped here.
 */
export function buildEnvelope(params: BuildEnvelopeParams): RawPayloadEnvelope {
  const { outcome } = params;
  const payloadChecksum = checksumPayload(outcome.payload);
  return {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    provider: params.provider,
    capability: params.capability,
    requestKey: params.requestKey,
    fetchedAt: params.fetchedAt,
    effectiveDate: params.effectiveDate,
    ...(params.sourceUrl !== undefined ? { sourceUrl: params.sourceUrl } : {}),
    ...(outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
    ...(outcome.contentType !== undefined ? { contentType: outcome.contentType } : {}),
    ...(outcome.etag !== undefined ? { etag: outcome.etag } : {}),
    ...(outcome.lastModified !== undefined ? { lastModified: outcome.lastModified } : {}),
    payloadEncoding: outcome.payloadEncoding,
    payload: outcome.payload,
    payloadChecksum,
  };
}

/**
 * Verify an envelope's stored checksum against its stored payload. Throws a typed
 * CHECKSUM_MISMATCH error (with safe context) if the artifact has been corrupted. This
 * gate runs before any payload can reach the Phase 4 adapter boundary, on both the live
 * and replay paths.
 */
export function verifyEnvelope(envelope: RawPayloadEnvelope): void {
  const actual = checksumPayload(envelope.payload);
  if (actual !== envelope.payloadChecksum) {
    throw new TransportError('CHECKSUM_MISMATCH', 'stored payload checksum does not match payload bytes', {
      provider: envelope.provider,
      capability: envelope.capability,
      requestKey: envelope.requestKey,
      retryable: false,
      stage: 'envelope',
      detail: `expected ${envelope.payloadChecksum}, got ${actual}`,
    });
  }
}

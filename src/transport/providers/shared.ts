// Shared request/decode primitives for provider transport handlers (Phase 5).
//
// These perform STRUCTURAL decoding only — turning a provider's raw bytes into the row
// shape its Phase 4 adapter already expects (parse JSON; reshape a keyed object map into
// a deterministically-ordered array). No semantic normalization, identity resolution, or
// field mapping happens here — that is exclusively the Phase 4 adapter's job.

import { decodePayloadBytes } from '../envelope';
import { redactUrl, TransportError } from '../errors';
import type { ProviderTransportConfig } from '../registry';
import type { RawPayloadEnvelope, TransportRequest } from '../types';

/** Parse an envelope's raw payload to text (respecting its encoding). */
export function payloadText(envelope: RawPayloadEnvelope): string {
  if (envelope.payloadEncoding === 'utf8') return envelope.payload;
  return new TextDecoder('utf-8').decode(decodePayloadBytes(envelope.payload, 'base64'));
}

/** JSON.parse the raw payload, mapping a parse error to a typed DECODE_FAILURE. */
export function parseJson(envelope: RawPayloadEnvelope): unknown {
  try {
    return JSON.parse(payloadText(envelope));
  } catch (err) {
    throw new TransportError('DECODE_FAILURE', `payload is not valid JSON: ${(err as Error).message}`, {
      provider: envelope.provider,
      capability: envelope.capability,
      requestKey: envelope.requestKey,
      retryable: false,
      stage: 'decode',
    });
  }
}

/** Decode a JSON array payload; a non-array is a typed DECODE_FAILURE. */
export function decodeJsonArray(envelope: RawPayloadEnvelope): unknown[] {
  const parsed = parseJson(envelope);
  if (!Array.isArray(parsed)) {
    throw new TransportError('DECODE_FAILURE', 'expected a JSON array payload', {
      provider: envelope.provider,
      capability: envelope.capability,
      requestKey: envelope.requestKey,
      retryable: false,
      stage: 'decode',
    });
  }
  return parsed;
}

/**
 * Decode either a JSON array (returned as-is) or a keyed object map (reshaped into rows
 * with the map key injected under `idField`, ordered deterministically by key). Sleeper's
 * `/players/nfl` returns the map form; the reference fixtures may use either.
 */
export function decodeArrayOrKeyedMap(envelope: RawPayloadEnvelope, idField: string): Record<string, unknown>[] {
  const parsed = parseJson(envelope);
  if (Array.isArray(parsed)) {
    return parsed.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
  }
  if (parsed !== null && typeof parsed === 'object') {
    const map = parsed as Record<string, unknown>;
    return Object.keys(map)
      .sort() // deterministic, order-independent decode
      .filter((key) => typeof map[key] === 'object' && map[key] !== null)
      .map((key) => ({ [idField]: key, ...(map[key] as Record<string, unknown>) }));
  }
  throw new TransportError('DECODE_FAILURE', 'expected a JSON array or keyed object map', {
    provider: envelope.provider,
    capability: envelope.capability,
    requestKey: envelope.requestKey,
    retryable: false,
    stage: 'decode',
  });
}

/** Validate a configured base URL is an absolute http(s) URL (no arbitrary injection). */
export function validateBaseUrl(config: ProviderTransportConfig, provider: string): string {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new TransportError('INVALID_CONFIG', `invalid base URL for provider ${provider}`, {
      retryable: false,
      stage: 'config',
      detail: redactUrl(config.baseUrl),
    });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TransportError('INVALID_CONFIG', `unsupported URL protocol for provider ${provider}: ${url.protocol}`, {
      retryable: false,
      stage: 'config',
    });
  }
  // Normalize away a trailing slash so path joining is unambiguous.
  return config.baseUrl.replace(/\/+$/, '');
}

/** Build a GET request against a provider base with a fixed capability path. */
export function getRequest(
  base: string,
  path: string,
  config: ProviderTransportConfig,
): TransportRequest {
  return {
    method: 'GET',
    url: `${base}${path}`,
    headers: { accept: 'application/json', ...(config.headers ?? {}) },
    redactedHeaders: ['authorization', 'x-api-key', ...(config.redactedHeaders ?? [])],
    expectContentType: 'application/json',
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.maxBytes !== undefined ? { maxBytes: config.maxBytes } : {}),
  };
}

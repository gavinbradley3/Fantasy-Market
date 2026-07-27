// PlayerTicker — deterministic provider transport layer (Phase 5).
//
// This module owns the boundary between the NETWORK and the frozen Phase 4 ingestion
// boundary (`src/ingestion`). It fetches raw provider payloads, captures them in a
// canonical envelope, caches them, and replays them without network access — then
// delivers the EXACT raw payload into the Phase 4 adapter boundary. It never performs
// normalization, identity resolution, snapshot construction, evidence building, or
// inference; those remain the sole responsibility of `src/ingestion`.
//
// Nothing here knows about canonical players, identity, evidence, AIL families, or the
// valuation engines. No wall clock, no randomness, and no network is read except inside
// the explicit HTTP client, all behind injected interfaces so the layer is deterministic
// and replayable.

import type { Capability, FreshnessMeta, IngestionProvider } from '@/ingestion';

/** The provider identifier reused verbatim from the Phase 4 ingestion boundary. */
export type { IngestionProvider } from '@/ingestion';

/** A provider capability. Aliased to the Phase 4 `Capability` — never a parallel enum. */
export type ProviderCapability = Capability;

/** The current envelope schema tag; moves only on a breaking envelope-shape change. */
export const ENVELOPE_SCHEMA_VERSION = 'transport.envelope/1';

// ============================================================================
// Raw payload envelope
// ============================================================================

/** How the raw payload bytes are stored inside the envelope. */
export type PayloadEncoding = 'utf8' | 'base64';

/**
 * The canonical, self-describing record of ONE ingestion attempt. It carries enough
 * information to reproduce the adapter input deterministically. `payload` +
 * `payloadEncoding` are the raw provider bytes with NO semantic transformation; the
 * `payloadChecksum` is derived from those exact stored bytes and nothing else.
 *
 * Operational metrics (elapsed ms, retry counts) are deliberately NOT part of the
 * envelope: they must never alter payload identity or replay output.
 */
export interface RawPayloadEnvelope {
  readonly schemaVersion: string;
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  /** Deterministic logical request identity (provider + capability + params). */
  readonly requestKey: string;
  /** When the raw payload was captured (ISO). Injected via the clock, never Date.now(). */
  readonly fetchedAt: string;
  /** The date/window the payload is effective for (ISO); flows into Phase 4 freshness. */
  readonly effectiveDate: string;
  /** The provider URL the payload was fetched from (never carries secrets/query auth). */
  readonly sourceUrl?: string;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  /**
   * The provider's own version/release token for this dataset, verbatim and opaque (e.g.
   * the raw `last_updated` text from an nflverse release manifest). Recorded so a replayed
   * payload reports the SAME provider version it was captured at, with no network access.
   */
  readonly sourceVersion?: string;
  /** The provider's own last-updated instant (ISO), when it publishes one we can parse. */
  readonly sourceLastUpdated?: string;
  readonly payloadEncoding: PayloadEncoding;
  /** The raw payload: a UTF-8 string, or base64 of the raw bytes. */
  readonly payload: string;
  /** Checksum of the EXACT stored payload string (not of parsed JSON). */
  readonly payloadChecksum: string;
}

// ============================================================================
// Transport request / response (pre-envelope, HTTP-level)
// ============================================================================

/** A fully-constructed HTTP request. Built only by a registered request builder. */
export interface TransportRequest {
  readonly method: 'GET';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Header names whose values must be redacted from any diagnostic (e.g. authorization). */
  readonly redactedHeaders?: readonly string[];
  /** Expected content-type prefix (e.g. "application/json"); validated on the response. */
  readonly expectContentType?: string;
  /** Hard cap on the response body in bytes; over-limit responses are rejected. */
  readonly maxBytes?: number;
  /**
   * Declare that this resource's body is text even though its media type does not say so.
   * GitHub serves every release asset as `application/octet-stream`, including plain CSV, so
   * without this the payload would be captured as base64 — a third larger on disk, opaque to
   * anyone reading a capture, and needing a decode step before the CSV parser can see it.
   */
  readonly textPayload?: boolean;
  /** Per-request timeout override (ms); falls back to the client default. */
  readonly timeoutMs?: number;
}

/** Conditional-request validators carried over from a previously cached envelope. */
export interface ConditionalValidators {
  readonly etag?: string;
  readonly lastModified?: string;
}

/** The raw, decoded-to-text result of a successful (2xx) fetch — no normalization. */
export interface FetchOutcome {
  readonly kind: 'ok';
  readonly httpStatus: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly payloadEncoding: PayloadEncoding;
  readonly payload: string;
  readonly url: string;
  /** Operational only — elapsed wall time; never enters the envelope or checksum. */
  readonly elapsedMs: number;
}

/** A 304 Not Modified result — the caller must reuse a compatible cached envelope. */
export interface NotModifiedOutcome {
  readonly kind: 'notModified';
  readonly httpStatus: 304;
  readonly url: string;
  readonly elapsedMs: number;
}

export type TransportOutcome = FetchOutcome | NotModifiedOutcome;

// ============================================================================
// Refresh request / result
// ============================================================================

/** Live fetch over the network, or deterministic replay from the cache. */
export type RefreshMode = 'live' | 'replay';

/**
 * A single provider+capability refresh request. Parameters are provider-neutral and
 * mapped to a concrete URL/path ONLY by the registered request builder — production
 * configuration never injects an arbitrary URL.
 */
export interface RefreshRequest {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly mode: RefreshMode;
  /** The as-of/effective date the payload represents (ISO). */
  readonly effectiveDate: string;
  /** Opaque, provider-neutral request parameters (e.g. { season: "2025" }). */
  readonly params?: Readonly<Record<string, string>>;
  /** Enable HTTP conditional revalidation against the latest cached envelope. */
  readonly conditional?: boolean;
}

/** Per-source operational outcome (deterministic, canonically ordered in summaries). */
export type SourceOutcomeKind =
  | 'liveFetch'
  | 'replay'
  | 'cacheRevalidated' // 304 → reused a cached payload
  | 'failed';

export interface SourceResult {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly requestKey: string;
  readonly outcome: SourceOutcomeKind;
  readonly payloadChecksum?: string;
  readonly envelope?: RawPayloadEnvelope;
  /** The decoded, adapter-ready raw payload (structural decode only, no normalization). */
  readonly decoded?: unknown;
  readonly freshness?: FreshnessMeta;
  /** Present only on failure — a safe, redacted diagnostic. */
  readonly error?: SafeErrorInfo;
}

/** A redaction-safe projection of a transport/ingestion error for summaries. */
export interface SafeErrorInfo {
  readonly code: string;
  readonly stage: string;
  readonly retryable: boolean;
  readonly message: string;
}

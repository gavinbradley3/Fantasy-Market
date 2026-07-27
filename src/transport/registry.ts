// Authoritative provider+capability registry (Phase 5). ONE typed table maps
//
//   (provider, capability) → request builder → response decoder → Phase 4 adapter
//
// Unsupported combinations are explicit (a typed error, never a silent fallback). No
// provider is guessed from payload shape, no adapter falls back to another, and no
// provider-specific branch is scattered across the orchestrator — it all lives here.

import type { ProviderAdapter } from '@/ingestion';
import { TransportError } from './errors';
import type { IngestionProvider, ProviderCapability, RawPayloadEnvelope, TransportRequest } from './types';

/** Typed, secret-free transport configuration for one provider (base URL, headers, caps). */
export interface ProviderTransportConfig {
  /** Absolute http(s) base URL. Capability paths are appended by the request builder. */
  readonly baseUrl: string;
  /** Optional static headers (e.g. an accept override). Secret headers are redacted in logs. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Additional header names to redact from diagnostics. */
  readonly redactedHeaders?: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

/** Config for every provider the transport may talk to (all optional; unset = unusable). */
export type TransportConfig = Partial<Record<IngestionProvider, ProviderTransportConfig>>;

/**
 * Read-only provider IO a handler may use WHILE PREPARING a request.
 *
 * Some providers do not publish data at a fixed URL: the concrete location and version of
 * a dataset must be discovered first (nflverse publishes per-dataset releases with their
 * own `last_updated` stamp; a future provider may publish a version index, a dated file, or
 * a signed manifest). That discovery is still an ordinary provider fetch, so it goes
 * through the SAME `HttpClient` — the same retry policy, timeout, size cap, content-type
 * check, redaction and cancellation. There is no second network path.
 */
export interface PrepareIo {
  /** Fetch a small provider metadata resource and return its body as text. */
  fetchText(request: TransportRequest): Promise<string>;
}

/** Context handed to a request builder — provider-neutral params only. */
export interface RequestBuildContext {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly config: ProviderTransportConfig;
  readonly params: Readonly<Record<string, string>>;
  readonly effectiveDate: string;
  /** Provider IO for a discovery step. Handlers with a fixed URL simply ignore it. */
  readonly io: PrepareIo;
}

/**
 * The outcome of preparing one request: the HTTP request to execute, plus whatever the
 * provider itself said about the version of the data being fetched.
 *
 * The version fields are DESCRIPTIVE, not decisions. They are recorded verbatim on the
 * envelope so they survive into replay, and they flow into Phase 4 `FreshnessMeta` — which
 * is what the confidence model reads to judge how fresh a source is. They never change
 * which bytes are requested.
 */
export interface PreparedRequest {
  readonly request: TransportRequest;
  /** The provider's own version/release token for this dataset, verbatim and opaque. */
  readonly sourceVersion?: string;
  /** The provider's own last-updated instant (ISO), when it publishes one we can parse. */
  readonly sourceLastUpdated?: string;
}

/** A single registered (provider, capability) handler. */
export interface CapabilityHandler {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  /**
   * Resolve the concrete request from typed config + neutral params. Providers with a
   * fixed path map return immediately; providers whose data lives behind a release or
   * version index discover it here through `ctx.io`. Production configuration never
   * injects an arbitrary URL either way — the path map stays inside the handler.
   */
  prepare(ctx: RequestBuildContext): Promise<PreparedRequest>;
  /** Structurally decode the raw envelope payload into the adapter's expected rows. */
  decode(envelope: RawPayloadEnvelope): unknown;
  /**
   * Additional capabilities this ONE payload also normalizes into.
   *
   * Providers routinely ship several record types in a single file — nflverse's schedules
   * export carries both the fixture list and each game's named starting quarterbacks, and a
   * wide charting file from a future provider will carry more still. Declaring that here
   * keeps the relationship truthful and has three concrete benefits over registering a
   * second capability at the same URL: the file is fetched once, the capture is stored once
   * (two coordinates sharing identical bytes would collide in any checksum-addressed
   * store), and replay reproduces exactly one envelope instead of two indistinguishable
   * ones. Every listed capability must be advertised by `adapter.capabilities`.
   */
  readonly alsoNormalizes?: readonly ProviderCapability[];
  /** The Phase 4 provider adapter that normalizes the decoded payload. */
  readonly adapter: ProviderAdapter;
}

/** Deterministic logical-request key from provider + capability + sorted params. */
export function computeRequestKey(
  provider: IngestionProvider,
  capability: ProviderCapability,
  params: Readonly<Record<string, string>> = {},
): string {
  const paramPart = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return paramPart ? `${provider}:${capability}?${paramPart}` : `${provider}:${capability}`;
}

export class ProviderRegistry {
  private readonly handlers = new Map<string, CapabilityHandler>();
  private readonly providers = new Set<IngestionProvider>();

  private static key(provider: IngestionProvider, capability: ProviderCapability): string {
    return `${provider}:${capability}`;
  }

  register(handler: CapabilityHandler): this {
    this.handlers.set(ProviderRegistry.key(handler.provider, handler.capability), handler);
    this.providers.add(handler.provider);
    return this;
  }

  /** Look up a handler; throws a typed, explicit error for unsupported combinations. */
  lookup(provider: IngestionProvider, capability: ProviderCapability): CapabilityHandler {
    if (!this.providers.has(provider)) {
      throw new TransportError('UNSUPPORTED_PROVIDER', `provider ${provider} is not registered for transport`, {
        provider,
        capability,
        retryable: false,
        stage: 'config',
      });
    }
    const handler = this.handlers.get(ProviderRegistry.key(provider, capability));
    if (!handler) {
      throw new TransportError('UNSUPPORTED_CAPABILITY', `provider ${provider} does not support capability ${capability} over transport`, {
        provider,
        capability,
        retryable: false,
        stage: 'config',
      });
    }
    return handler;
  }

  has(provider: IngestionProvider, capability: ProviderCapability): boolean {
    return this.handlers.has(ProviderRegistry.key(provider, capability));
  }

  /** Every registered (provider, capability) pair, canonically ordered (for diagnostics). */
  list(): { provider: IngestionProvider; capability: ProviderCapability }[] {
    return [...this.handlers.values()]
      .map((h) => ({ provider: h.provider, capability: h.capability }))
      .sort((a, b) => (a.provider + a.capability < b.provider + b.capability ? -1 : 1));
  }
}

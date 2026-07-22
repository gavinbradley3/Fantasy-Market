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

/** Context handed to a request builder — provider-neutral params only. */
export interface RequestBuildContext {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly config: ProviderTransportConfig;
  readonly params: Readonly<Record<string, string>>;
  readonly effectiveDate: string;
}

/** A single registered (provider, capability) handler. */
export interface CapabilityHandler {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  /** Build the concrete HTTP request from typed config + neutral params (fixed path map). */
  buildRequest(ctx: RequestBuildContext): TransportRequest;
  /** Structurally decode the raw envelope payload into the adapter's expected rows. */
  decode(envelope: RawPayloadEnvelope): unknown;
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

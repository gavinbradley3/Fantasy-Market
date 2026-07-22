// Refresh orchestration (Phase 5). The single entry point that turns refresh requests
// into a Phase 4 snapshot (and, optionally, inference). It resolves live-fetch vs replay,
// acquires and integrity-verifies a raw payload envelope, decodes it, and DELIVERS the
// exact raw payload into the EXISTING Phase 4 ingestion entry point (`ingest`). It never
// reconstructs Phase 4's internal stages, never bypasses identity/snapshot/evidence, and
// isolates provider failures so one bad source cannot corrupt another's result.

import {
  buildNormalizedInferenceInput,
  ingest,
  type BuildInputOptions,
  type FreshnessMeta,
  type IngestionDiagnostics,
  type IngestOptions,
  type IngestionProvider,
  type NormalizedSnapshot,
  type ProviderAdapter,
  type ProviderSource,
} from '@/ingestion';
import { runInference } from '@/inference/production/runInference';
import type { ProductionResult } from '@/inference/production/types';
import type { Clock } from './clock';
import { systemClock } from './clock';
import { buildEnvelope, verifyEnvelope } from './envelope';
import { asTransportError, TransportError } from './errors';
import { loadReplayEnvelope } from './replay';
import { computeRequestKey, ProviderRegistry, type TransportConfig } from './registry';
import type { HttpClient } from './client';
import type { RawPayloadStore } from './store';
import type {
  ProviderCapability,
  RawPayloadEnvelope,
  RefreshRequest,
  SourceOutcomeKind,
  SourceResult,
} from './types';

export interface RefreshDeps {
  readonly registry: ProviderRegistry;
  readonly config: TransportConfig;
  readonly store: RawPayloadStore;
  readonly client: HttpClient;
  readonly clock?: Clock;
  readonly signal?: AbortSignal;
}

export interface RefreshPolicy {
  /** Providers whose failure means the refresh is not a complete success. */
  readonly requiredProviders?: readonly IngestionProvider[];
}

export interface RefreshInput {
  readonly sources: readonly RefreshRequest[];
  readonly policy?: RefreshPolicy;
  readonly ingestOptions?: IngestOptions;
  /** Optional inference builds; each runs the Phase 4 entry `runInference` on the snapshot. */
  readonly inference?: readonly BuildInputOptions[];
}

export type RefreshStatus = 'success' | 'partial' | 'failure';

export interface InferenceOutcome {
  readonly canonicalId: string;
  readonly position: BuildInputOptions['position'];
  readonly ok: boolean;
  readonly result?: ProductionResult;
  readonly error?: string;
}

export interface RefreshSummary {
  readonly total: number;
  readonly successes: number;
  readonly failures: number;
  readonly liveFetches: number;
  readonly replays: number;
  readonly cacheRevalidations: number;
  readonly warnings: number;
  /** Canonically-ordered checksums of every successfully acquired payload. */
  readonly payloadChecksums: readonly string[];
  readonly snapshotId: string | null;
  /** Required providers that had at least one failed source. */
  readonly requiredFailures: readonly IngestionProvider[];
}

export interface RefreshResult {
  readonly status: RefreshStatus;
  /** Per (provider, capability) result, canonically ordered — deterministic. */
  readonly sources: readonly SourceResult[];
  readonly snapshot: NormalizedSnapshot | null;
  readonly diagnostics: IngestionDiagnostics | null;
  readonly inference: readonly InferenceOutcome[];
  readonly summary: RefreshSummary;
}

/** Derive Phase 4 freshness purely from the stored envelope, so replay reproduces it. */
function freshnessFromEnvelope(envelope: RawPayloadEnvelope): FreshnessMeta {
  return {
    provider: envelope.provider,
    fetchedAt: envelope.fetchedAt,
    effectiveDate: envelope.effectiveDate,
    lastUpdated: envelope.lastModified ?? null,
    sourceVersion: envelope.etag ?? envelope.sourceVersion ?? null,
  };
}

interface AcquiredEnvelope {
  readonly envelope: RawPayloadEnvelope;
  readonly outcome: Extract<SourceOutcomeKind, 'liveFetch' | 'replay' | 'cacheRevalidated'>;
}

/** Acquire a raw payload envelope for one request (live fetch or replay), integrity-gated. */
async function acquireEnvelope(request: RefreshRequest, deps: RefreshDeps): Promise<AcquiredEnvelope> {
  const clock = deps.clock ?? systemClock;
  const params = request.params ?? {};
  const requestKey = computeRequestKey(request.provider, request.capability, params);
  const handler = deps.registry.lookup(request.provider, request.capability);

  if (request.mode === 'replay') {
    const envelope = await loadReplayEnvelope(deps.store, request.provider, request.capability, params);
    return { envelope, outcome: 'replay' };
  }

  const config = deps.config[request.provider];
  if (!config) {
    throw new TransportError('INVALID_CONFIG', `no transport config for provider ${request.provider}`, {
      provider: request.provider,
      capability: request.capability,
      requestKey,
      retryable: false,
      stage: 'config',
    });
  }

  // Conditional revalidation against the latest cached capture, when requested.
  const prior = request.conditional
    ? await deps.store.getLatest(request.provider, request.capability, requestKey)
    : null;
  const conditional = prior ? { etag: prior.etag, lastModified: prior.lastModified } : undefined;

  const httpRequest = handler.buildRequest({
    provider: request.provider,
    capability: request.capability,
    config,
    params,
    effectiveDate: request.effectiveDate,
  });

  const fetchedAt = clock.now();
  const outcome = await deps.client.execute(httpRequest, conditional, deps.signal);

  if (outcome.kind === 'notModified') {
    if (!prior) {
      // 304 with no compatible cached payload is an explicit failure, never a silent pass.
      throw new TransportError('INVALID_REVALIDATION', 'server returned 304 but no cached payload exists', {
        provider: request.provider,
        capability: request.capability,
        requestKey,
        retryable: false,
        stage: 'revalidate',
      });
    }
    verifyEnvelope(prior); // the reused payload must still be intact
    return { envelope: prior, outcome: 'cacheRevalidated' };
  }

  const envelope = buildEnvelope({
    provider: request.provider,
    capability: request.capability,
    requestKey,
    fetchedAt,
    effectiveDate: request.effectiveDate,
    sourceUrl: stripQuery(httpRequest.url),
    outcome,
  });
  verifyEnvelope(envelope); // sanity gate before persisting/using
  await deps.store.put(envelope);
  return { envelope, outcome: 'liveFetch' };
}

/** Drop any query string from a URL before it is stored as `sourceUrl` (may hold auth). */
function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

interface InternalSuccess {
  readonly result: SourceResult;
  readonly adapter: ProviderAdapter;
  readonly capability: ProviderCapability;
  readonly decoded: unknown;
  readonly freshness: FreshnessMeta;
}

/** Refresh a SINGLE provider+capability request. Never throws — failures are captured. */
export async function refreshProviderSource(request: RefreshRequest, deps: RefreshDeps): Promise<SourceResult> {
  const params = request.params ?? {};
  const requestKey = computeRequestKey(request.provider, request.capability, params);
  try {
    const handler = deps.registry.lookup(request.provider, request.capability);
    const { envelope, outcome } = await acquireEnvelope(request, deps);
    const decoded = handler.decode(envelope); // structural decode only; may throw DECODE_FAILURE
    const freshness = freshnessFromEnvelope(envelope);
    return {
      provider: request.provider,
      capability: request.capability,
      requestKey,
      outcome,
      payloadChecksum: envelope.payloadChecksum,
      envelope,
      decoded,
      freshness,
    };
  } catch (err) {
    const te = asTransportError(err, 'INGESTION_FAILURE', {
      provider: request.provider,
      capability: request.capability,
      requestKey,
    });
    return {
      provider: request.provider,
      capability: request.capability,
      requestKey,
      outcome: 'failed',
      error: te.toSafeInfo(),
    };
  }
}

/** Canonical ordering for source results — deterministic regardless of input/completion. */
function compareSources(a: SourceResult, b: SourceResult): number {
  const ka = `${a.provider}|${a.capability}|${a.requestKey}`;
  const kb = `${b.provider}|${b.capability}|${b.requestKey}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Orchestrate a complete, deterministic refresh across many provider+capability sources.
 * Each source is isolated; the snapshot is built from whatever succeeded, and the result
 * distinguishes complete success, partial success, and complete failure.
 */
export async function refreshSources(input: RefreshInput, deps: RefreshDeps): Promise<RefreshResult> {
  // Run every source in isolation. Completion order is irrelevant — results are sorted.
  const settled = await Promise.all(input.sources.map((req) => refreshProviderSource(req, deps)));

  // Re-derive the adapter/decoded/freshness for the successful sources (deterministically).
  const successes: InternalSuccess[] = [];
  for (const result of settled) {
    if (result.outcome === 'failed' || result.decoded === undefined || !result.freshness) continue;
    const handler = deps.registry.lookup(result.provider, result.capability);
    successes.push({
      result,
      adapter: handler.adapter,
      capability: result.capability,
      decoded: result.decoded,
      freshness: result.freshness,
    });
  }

  const orderedSources = [...settled].sort(compareSources);

  // One ProviderSource per successful (provider, capability), preserving per-source
  // freshness. Sorted canonically so ingestion input is order-independent.
  const providerSources: ProviderSource[] = successes
    .slice()
    .sort((a, b) => compareSources(a.result, b.result))
    .map((s) => ({
      adapter: s.adapter,
      freshness: s.freshness,
      payloads: { [s.capability]: s.decoded } as ProviderSource['payloads'],
    }));

  let snapshot: NormalizedSnapshot | null = null;
  let diagnostics: IngestionDiagnostics | null = null;
  if (providerSources.length > 0) {
    const ingested = ingest(providerSources, input.ingestOptions ?? {});
    snapshot = ingested.snapshot;
    diagnostics = ingested.diagnostics;
  }

  // Optional inference, reusing the Phase 4 entry points only.
  const inference: InferenceOutcome[] = [];
  if (snapshot && input.inference) {
    for (const build of input.inference) {
      try {
        const nii = buildNormalizedInferenceInput(snapshot, build);
        if (!nii) {
          inference.push({ canonicalId: build.canonicalId, position: build.position, ok: false, error: 'no evidence for player' });
          continue;
        }
        inference.push({ canonicalId: build.canonicalId, position: build.position, ok: true, result: runInference(nii) });
      } catch (err) {
        inference.push({ canonicalId: build.canonicalId, position: build.position, ok: false, error: (err as Error).message });
      }
    }
  }

  const summary = summarize(orderedSources, diagnostics, snapshot, input.policy);
  const status = deriveStatus(orderedSources, summary, input.policy);

  return { status, sources: orderedSources, snapshot, diagnostics, inference, summary };
}

function summarize(
  sources: readonly SourceResult[],
  diagnostics: IngestionDiagnostics | null,
  snapshot: NormalizedSnapshot | null,
  policy: RefreshPolicy | undefined,
): RefreshSummary {
  const successes = sources.filter((s) => s.outcome !== 'failed');
  const failures = sources.filter((s) => s.outcome === 'failed');
  const requiredFailures = (policy?.requiredProviders ?? []).filter((p) =>
    failures.some((f) => f.provider === p),
  );
  return {
    total: sources.length,
    successes: successes.length,
    failures: failures.length,
    liveFetches: sources.filter((s) => s.outcome === 'liveFetch').length,
    replays: sources.filter((s) => s.outcome === 'replay').length,
    cacheRevalidations: sources.filter((s) => s.outcome === 'cacheRevalidated').length,
    warnings: diagnostics?.warnings.length ?? 0,
    payloadChecksums: successes
      .map((s) => s.payloadChecksum)
      .filter((c): c is string => c !== undefined)
      .sort(),
    snapshotId: snapshot?.snapshotId ?? null,
    requiredFailures: [...requiredFailures].sort(),
  };
}

function deriveStatus(
  sources: readonly SourceResult[],
  summary: RefreshSummary,
  policy: RefreshPolicy | undefined,
): RefreshStatus {
  if (summary.total === 0) return 'failure';
  if (summary.failures === 0) return 'success';
  if (summary.successes === 0) return 'failure';
  // A required provider that produced NO usable source at all is a complete failure.
  const requiredFullyFailed = (policy?.requiredProviders ?? []).some((p) => {
    const requested = sources.filter((s) => s.provider === p);
    const succeeded = requested.filter((s) => s.outcome !== 'failed');
    return requested.length > 0 && succeeded.length === 0;
  });
  if (requiredFullyFailed) return 'failure';
  return 'partial';
}

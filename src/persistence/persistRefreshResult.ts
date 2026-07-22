// The authoritative transactional write flow (Phase 6): persist a COMPLETED Phase 5
// refresh result as durable artifacts + provenance, atomically. It adapts at the boundary
// only — it re-materializes each NormalizedInferenceInput from the (immutable) snapshot via
// the EXISTING Phase 4 builder and cross-checks its checksum against what inference used,
// so nothing is recomputed differently. Persistence is EXPLICIT: refreshSources() never
// writes to the database; a caller calls this, then (separately) publishes.
//
// FK-safe order inside one transaction: snapshot → raw envelopes → run → source outcomes →
// normalized inputs → outputs → run/inference associations. Any throw rolls the whole run
// back, so a run is never recorded as successful with a missing artifact reference.

import { randomUUID } from 'node:crypto';
import { buildNormalizedInferenceInput, type BuildInputOptions, type IngestionProvider } from '@/ingestion';
import type { RefreshResult } from '@/transport';
import { PersistenceError } from './errors';
import { PersistenceStore } from './store';
import { SCHEMA_VERSIONS, type RefreshMode, type RefreshRunStatus, type SourceOutcomeMode } from './types';

export interface PersistRefreshParams {
  readonly result: RefreshResult;
  /** The inference builds passed to refreshSources (needed to re-materialize inputs). */
  readonly inferenceBuilds?: readonly BuildInputOptions[];
  /** Providers treated as required (marks source outcomes; affects nothing else). */
  readonly requiredProviders?: readonly IngestionProvider[];
  /** Caller-supplied id makes retry idempotent; omitted → a fresh event id is generated. */
  readonly runId?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly codeVersion?: string;
  readonly configFingerprint?: string;
}

export interface PersistedInferenceRef {
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

export interface PersistRefreshOutcome {
  readonly runId: string;
  readonly status: RefreshRunStatus;
  readonly snapshotId: string | null;
  readonly publishable: boolean;
  readonly inference: readonly PersistedInferenceRef[];
}

/** Derive the run-level mode from its source outcomes. */
function deriveMode(result: RefreshResult): RefreshMode {
  const successful = result.sources.filter((s) => s.outcome !== 'failed');
  if (successful.length === 0) return 'live';
  const replays = successful.filter((s) => s.outcome === 'replay').length;
  if (replays === successful.length) return 'replay';
  if (replays === 0) return 'live';
  return 'mixed';
}

export function persistRefreshResult(store: PersistenceStore, params: PersistRefreshParams): PersistRefreshOutcome {
  const { result } = params;
  const runId = params.runId ?? `run-${randomUUID()}`;
  const requiredSet = new Set<IngestionProvider>(params.requiredProviders ?? []);
  const snapshotId = result.snapshot?.snapshotId ?? null;
  const nowMode = deriveMode(result);

  const persistedInference: PersistedInferenceRef[] = [];

  store.runInTransaction(() => {
    // 1. immutable snapshot (if inference completed).
    if (result.snapshot) store.persistSnapshot(result.snapshot);

    // 2. raw payload artifacts for every successfully-acquired source.
    for (const s of result.sources) {
      if (s.envelope) store.persistRawEnvelope(s.envelope);
    }

    // 3. the run event.
    store.persistRefreshRun({
      runId,
      schemaVersion: SCHEMA_VERSIONS.refreshRun,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      mode: nowMode,
      status: result.status,
      requiredFailure: result.summary.requiredFailures.length > 0,
      sourceCount: result.summary.total,
      successCount: result.summary.successes,
      failureCount: result.summary.failures,
      codeVersion: params.codeVersion ?? null,
      configFingerprint: params.configFingerprint ?? null,
      snapshotId,
      createdAt: params.completedAt,
    });

    // 4. every source outcome (success and failure), redacted diagnostics only.
    for (const s of result.sources) {
      store.persistRefreshSourceOutcome({
        runId,
        provider: s.provider,
        capability: s.capability,
        requestKey: s.requestKey,
        required: requiredSet.has(s.provider),
        mode: s.outcome as SourceOutcomeMode,
        status: s.outcome === 'failed' ? 'failure' : 'success',
        payloadChecksum: s.payloadChecksum ?? null,
        errorCode: s.error?.code ?? null,
        failureStage: s.error?.stage ?? null,
        retryable: s.error ? s.error.retryable : null,
        errorMessage: s.error?.message ?? null,
      });
    }

    // 5–7. per-player normalized input + output artifacts, associated with the run.
    if (result.snapshot && params.inferenceBuilds) {
      for (const build of params.inferenceBuilds) {
        const outcome = result.inference.find((o) => o.canonicalId === build.canonicalId && o.position === build.position && o.ok && o.result);
        if (!outcome || !outcome.result) continue; // no successful inference for this build

        const input = buildNormalizedInferenceInput(result.snapshot, build);
        if (!input) {
          throw new PersistenceError('INTEGRITY_VIOLATION', 'normalized input could not be re-materialized from the snapshot', { stage: 'artifact-write', detail: build.canonicalId });
        }
        // Identity is the production normalizedInputChecksum (what inference actually
        // hashed); the re-materialized input reproduces the SAME output at replay time.
        const normalizedInputChecksum = outcome.result.normalizedInputChecksum;

        store.persistNormalizedInput(input, {
          checksum: normalizedInputChecksum,
          snapshotId: result.snapshot.snapshotId,
          canonicalId: build.canonicalId,
          position: build.position,
          asOf: build.asOf,
          engineVersion: build.engineVersion,
        });
        store.persistInferenceOutput({
          outputChecksum: outcome.result.outputChecksum,
          serialized: outcome.result.serialized,
          normalizedInputChecksum,
          snapshotId: result.snapshot.snapshotId,
          registryVersion: outcome.result.registryVersion,
          inferenceLayerVersion: outcome.result.inferenceLayerVersion,
          envReferenceVersion: outcome.result.envReferenceVersion,
        });
        store.associateRunInference({
          runId,
          canonicalId: build.canonicalId,
          position: build.position,
          normalizedInputChecksum,
          outputChecksum: outcome.result.outputChecksum,
        });
        persistedInference.push({ canonicalId: build.canonicalId, position: build.position, normalizedInputChecksum, outputChecksum: outcome.result.outputChecksum });
      }
    }

    // Run-completeness hardening: a SUCCESS run must carry at least one inference
    // association (otherwise there is no board to publish). Enforced here, inside the
    // transaction, so an empty successful run is rejected AND fully rolled back. Failed and
    // partial runs may legitimately have zero associations.
    if (result.status === 'success' && persistedInference.length === 0) {
      throw new PersistenceError('INVALID_ARTIFACT_SET', 'a successful run must persist at least one inference association', { stage: 'association-write', detail: runId });
    }
  });

  return {
    runId,
    status: result.status,
    snapshotId,
    publishable: result.status === 'success' && persistedInference.length > 0,
    inference: persistedInference,
  };
}

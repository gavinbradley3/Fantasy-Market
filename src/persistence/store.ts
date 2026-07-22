// PersistenceStore (Phase 6) — the narrow, domain-expressing backend interface over the
// SQLite schema. NOT a generic save(key,value): every method encodes an invariant.
//
//   • immutable artifacts are content-addressed and idempotent (same content → one row;
//     conflicting content under the same id → explicit CONFLICTING_ARTIFACT);
//   • reads verify checksums/identity and reject unsupported persisted schema versions;
//   • all SQL is parameterized (no value is ever concatenated into a statement).
//
// Node-only. Synchronous (node:sqlite is synchronous), which keeps transactions simple.

import { digest } from '@/inference/util/checksum';
import type { NormalizedSnapshot } from '@/ingestion';
import type { NormalizedInferenceInput } from '@/inference/production/types';
import type { RawPayloadEnvelope } from '@/transport';
import {
  serializeNormalizedInput,
  serializeSnapshot,
  verifyNormalizedInputIntegrity,
  verifyOutputIntegrity,
  verifyRawEnvelopeIntegrity,
  verifySnapshotIntegrity,
} from './canonical';
import { PersistenceError } from './errors';
import { assertSupportedDatabaseVersion, migrate } from './migrations';
import { openDatabase, transaction, type Database } from './sqlite/db';
import {
  SCHEMA_VERSIONS,
  SUPPORTED_NORMALIZED_INPUT_SCHEMAS,
  SUPPORTED_OUTPUT_SCHEMAS,
  SUPPORTED_PUBLICATION_SCHEMAS,
  SUPPORTED_RAW_ENVELOPE_SCHEMAS,
  SUPPORTED_RUN_SCHEMAS,
  SUPPORTED_SNAPSHOT_SCHEMAS,
  type InferenceOutputRecord,
  type NormalizedInputRecord,
  type PublicationBundle,
  type PublicationRecord,
  type RawEnvelopeRecord,
  type RefreshRunRecord,
  type RefreshRunView,
  type RefreshSourceOutcomeRecord,
  type RunInferenceRecord,
  type SnapshotRecord,
} from './types';

export type NowFn = () => string;
const systemNow: NowFn = () => new Date().toISOString();

function bool(v: unknown): boolean {
  return v === 1 || v === true;
}
function bit(v: boolean): number {
  return v ? 1 : 0;
}
function assertSchema(supported: ReadonlySet<string>, version: string, artifact: string): void {
  if (!supported.has(version)) {
    throw new PersistenceError('UNSUPPORTED_PERSISTED_SCHEMA', `unsupported ${artifact} schema version ${version}`, { stage: 'read', detail: version });
  }
}

export interface NewNormalizedInputMeta {
  /** The production `normalizedInputChecksum` — the artifact's content identity. */
  readonly checksum: string;
  readonly snapshotId: string;
  readonly canonicalId: string;
  readonly position: string;
  readonly asOf: string;
  readonly engineVersion: string;
}

export interface NewInferenceOutput {
  readonly outputChecksum: string;
  readonly serialized: string;
  readonly normalizedInputChecksum: string;
  readonly snapshotId: string;
  readonly registryVersion?: string | null;
  readonly inferenceLayerVersion?: string | null;
  readonly envReferenceVersion?: string | null;
}

export interface PublishParams {
  readonly runId: string;
  readonly snapshotId: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

export class PersistenceStore {
  private constructor(
    private readonly db: Database,
    private readonly now: NowFn,
  ) {}

  /** Open (creating/migrating) a database at `location` (':memory:' for tests). */
  static open(location: string, now: NowFn = systemNow): PersistenceStore {
    const db = openDatabase(location);
    migrate(db, now());
    return new PersistenceStore(db, now);
  }

  close(): void {
    this.db.close();
  }

  /** Expose a transaction boundary for the orchestration write flow. */
  runInTransaction<T>(fn: () => T): T {
    return transaction(this.db, fn);
  }

  // ==========================================================================
  // Raw payload artifact
  // ==========================================================================

  persistRawEnvelope(env: RawPayloadEnvelope): void {
    verifyRawEnvelopeIntegrity(env, 'write');
    const existing = this.db.prepare('SELECT payload FROM raw_payload_artifact WHERE payload_checksum = ?').get(env.payloadChecksum) as { payload: string } | undefined;
    if (existing) {
      if (existing.payload !== env.payload) {
        throw new PersistenceError('CONFLICTING_ARTIFACT', 'different payload already stored under the same checksum', { stage: 'raw-envelope-write', detail: env.payloadChecksum });
      }
      return; // idempotent: identical bytes already persisted
    }
    this.db
      .prepare(
        `INSERT INTO raw_payload_artifact
         (payload_checksum, schema_version, provider, capability, request_key, fetched_at, effective_date,
          source_url, http_status, content_type, etag, last_modified, payload_encoding, payload, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        env.payloadChecksum,
        env.schemaVersion,
        env.provider,
        env.capability,
        env.requestKey,
        env.fetchedAt,
        env.effectiveDate,
        env.sourceUrl ?? null,
        env.httpStatus ?? null,
        env.contentType ?? null,
        env.etag ?? null,
        env.lastModified ?? null,
        env.payloadEncoding,
        env.payload,
        this.now(),
      );
  }

  getRawEnvelopeByChecksum(checksum: string): RawPayloadEnvelope | null {
    const row = this.db.prepare('SELECT * FROM raw_payload_artifact WHERE payload_checksum = ?').get(checksum) as Record<string, unknown> | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_RAW_ENVELOPE_SCHEMAS, row.schema_version as string, 'raw-envelope');
    const env: RawPayloadEnvelope = {
      schemaVersion: row.schema_version as string,
      provider: row.provider as RawPayloadEnvelope['provider'],
      capability: row.capability as RawPayloadEnvelope['capability'],
      requestKey: row.request_key as string,
      fetchedAt: row.fetched_at as string,
      effectiveDate: row.effective_date as string,
      ...(row.source_url != null ? { sourceUrl: row.source_url as string } : {}),
      ...(row.http_status != null ? { httpStatus: row.http_status as number } : {}),
      ...(row.content_type != null ? { contentType: row.content_type as string } : {}),
      ...(row.etag != null ? { etag: row.etag as string } : {}),
      ...(row.last_modified != null ? { lastModified: row.last_modified as string } : {}),
      payloadEncoding: row.payload_encoding as RawPayloadEnvelope['payloadEncoding'],
      payload: row.payload as string,
      payloadChecksum: row.payload_checksum as string,
    };
    verifyRawEnvelopeIntegrity(env, 'read'); // reject corruption on read
    return env;
  }

  // ==========================================================================
  // Snapshot artifact
  // ==========================================================================

  persistSnapshot(snapshot: NormalizedSnapshot): SnapshotRecord {
    const { serialized, checksum } = serializeSnapshot(snapshot);
    // Bind identity to content up-front (recompute the Phase 4 id from the bytes).
    verifySnapshotIntegrity(serialized, snapshot.snapshotId, checksum);
    const existing = this.db.prepare('SELECT serialized FROM snapshot_artifact WHERE snapshot_id = ?').get(snapshot.snapshotId) as { serialized: string } | undefined;
    const createdAt = this.now();
    if (existing) {
      if (existing.serialized !== serialized) {
        throw new PersistenceError('CONFLICTING_ARTIFACT', 'different snapshot bytes already stored under the same snapshot id', { stage: 'artifact-write', detail: snapshot.snapshotId });
      }
    } else {
      this.db
        .prepare('INSERT INTO snapshot_artifact (snapshot_id, schema_version, serialized, checksum, created_at) VALUES (?,?,?,?,?)')
        .run(snapshot.snapshotId, SCHEMA_VERSIONS.snapshot, serialized, checksum, createdAt);
    }
    return { snapshotId: snapshot.snapshotId, schemaVersion: SCHEMA_VERSIONS.snapshot, serialized, checksum, createdAt };
  }

  getSnapshotById(snapshotId: string): NormalizedSnapshot | null {
    const row = this.db.prepare('SELECT schema_version, serialized, checksum FROM snapshot_artifact WHERE snapshot_id = ?').get(snapshotId) as { schema_version: string; serialized: string; checksum: string } | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_SNAPSHOT_SCHEMAS, row.schema_version, 'snapshot');
    return verifySnapshotIntegrity(row.serialized, snapshotId, row.checksum);
  }

  // ==========================================================================
  // Normalized inference input artifact
  // ==========================================================================

  persistNormalizedInput(input: NormalizedInferenceInput, meta: NewNormalizedInputMeta): NormalizedInputRecord {
    const { serialized, serializedChecksum } = serializeNormalizedInput(input);
    const existing = this.db.prepare('SELECT serialized FROM normalized_input_artifact WHERE checksum = ?').get(meta.checksum) as { serialized: string } | undefined;
    const createdAt = this.now();
    if (existing) {
      if (existing.serialized !== serialized) {
        throw new PersistenceError('CONFLICTING_ARTIFACT', 'different normalized input already stored under the same checksum', { stage: 'artifact-write', detail: meta.checksum });
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO normalized_input_artifact (checksum, schema_version, serialized, serialized_checksum, snapshot_id, canonical_id, position, as_of, engine_version, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(meta.checksum, SCHEMA_VERSIONS.normalizedInput, serialized, serializedChecksum, meta.snapshotId, meta.canonicalId, meta.position, meta.asOf, meta.engineVersion, createdAt);
    }
    return { checksum: meta.checksum, schemaVersion: SCHEMA_VERSIONS.normalizedInput, serialized, snapshotId: meta.snapshotId, canonicalId: meta.canonicalId, position: meta.position, asOf: meta.asOf, engineVersion: meta.engineVersion, createdAt };
  }

  getNormalizedInputByChecksum(checksum: string): NormalizedInferenceInput | null {
    const row = this.db.prepare('SELECT schema_version, serialized, serialized_checksum FROM normalized_input_artifact WHERE checksum = ?').get(checksum) as { schema_version: string; serialized: string; serialized_checksum: string } | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_NORMALIZED_INPUT_SCHEMAS, row.schema_version, 'normalized-input');
    return verifyNormalizedInputIntegrity(row.serialized, row.serialized_checksum);
  }

  // ==========================================================================
  // Inference output artifact
  // ==========================================================================

  persistInferenceOutput(output: NewInferenceOutput): InferenceOutputRecord {
    verifyOutputIntegrity(output.serialized, output.outputChecksum);
    const existing = this.db.prepare('SELECT serialized FROM inference_output_artifact WHERE checksum = ?').get(output.outputChecksum) as { serialized: string } | undefined;
    const createdAt = this.now();
    if (existing) {
      if (existing.serialized !== output.serialized) {
        throw new PersistenceError('CONFLICTING_ARTIFACT', 'different inference output already stored under the same checksum', { stage: 'artifact-write', detail: output.outputChecksum });
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO inference_output_artifact (checksum, schema_version, serialized, normalized_input_checksum, snapshot_id, registry_version, inference_layer_version, env_reference_version, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(output.outputChecksum, SCHEMA_VERSIONS.inferenceOutput, output.serialized, output.normalizedInputChecksum, output.snapshotId, output.registryVersion ?? null, output.inferenceLayerVersion ?? null, output.envReferenceVersion ?? null, createdAt);
    }
    return { checksum: output.outputChecksum, schemaVersion: SCHEMA_VERSIONS.inferenceOutput, serialized: output.serialized, normalizedInputChecksum: output.normalizedInputChecksum, snapshotId: output.snapshotId, registryVersion: output.registryVersion ?? null, inferenceLayerVersion: output.inferenceLayerVersion ?? null, envReferenceVersion: output.envReferenceVersion ?? null, createdAt };
  }

  getInferenceOutputByChecksum(checksum: string): { record: InferenceOutputRecord; serialized: string } | null {
    const row = this.db.prepare('SELECT * FROM inference_output_artifact WHERE checksum = ?').get(checksum) as Record<string, unknown> | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_OUTPUT_SCHEMAS, row.schema_version as string, 'inference-output');
    verifyOutputIntegrity(row.serialized as string, checksum);
    return { record: this.mapOutput(row), serialized: row.serialized as string };
  }

  private mapOutput(row: Record<string, unknown>): InferenceOutputRecord {
    return {
      checksum: row.checksum as string,
      schemaVersion: row.schema_version as string,
      serialized: row.serialized as string,
      normalizedInputChecksum: row.normalized_input_checksum as string,
      snapshotId: row.snapshot_id as string,
      registryVersion: (row.registry_version as string | null) ?? null,
      inferenceLayerVersion: (row.inference_layer_version as string | null) ?? null,
      envReferenceVersion: (row.env_reference_version as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  // ==========================================================================
  // Refresh run + source outcomes + inference associations
  // ==========================================================================

  persistRefreshRun(run: RefreshRunRecord): void {
    // Idempotent by run id: a retry of the same completed run does not duplicate.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO refresh_run
         (run_id, schema_version, started_at, completed_at, mode, status, required_failure, source_count, success_count, failure_count, code_version, config_fingerprint, snapshot_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(run.runId, run.schemaVersion, run.startedAt, run.completedAt, run.mode, run.status, bit(run.requiredFailure), run.sourceCount, run.successCount, run.failureCount, run.codeVersion ?? null, run.configFingerprint ?? null, run.snapshotId ?? null, run.createdAt);
  }

  persistRefreshSourceOutcome(o: RefreshSourceOutcomeRecord): void {
    // (run_id, request_key) is the PK — the Phase 5 invariant survives in persistence:
    // one run + one request key → at most one outcome (retry is idempotent).
    this.db
      .prepare(
        `INSERT OR IGNORE INTO refresh_source_outcome
         (run_id, provider, capability, request_key, required, mode, status, payload_checksum, error_code, failure_stage, retryable, error_message)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(o.runId, o.provider, o.capability, o.requestKey, bit(o.required), o.mode, o.status, o.payloadChecksum ?? null, o.errorCode ?? null, o.failureStage ?? null, o.retryable == null ? null : bit(o.retryable), o.errorMessage ?? null);
  }

  associateRunInference(rec: RunInferenceRecord): void {
    this.db
      .prepare('INSERT OR IGNORE INTO run_inference (run_id, canonical_id, position, normalized_input_checksum, output_checksum) VALUES (?,?,?,?,?)')
      .run(rec.runId, rec.canonicalId, rec.position, rec.normalizedInputChecksum, rec.outputChecksum);
  }

  getRefreshRun(runId: string): RefreshRunView | null {
    const row = this.db.prepare('SELECT * FROM refresh_run WHERE run_id = ?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_RUN_SCHEMAS, row.schema_version as string, 'refresh-run');
    return { run: this.mapRun(row), sources: this.getSourceOutcomes(runId), inference: this.getRunInference(runId) };
  }

  private mapRun(row: Record<string, unknown>): RefreshRunRecord {
    return {
      runId: row.run_id as string,
      schemaVersion: row.schema_version as string,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string,
      mode: row.mode as RefreshRunRecord['mode'],
      status: row.status as RefreshRunRecord['status'],
      requiredFailure: bool(row.required_failure),
      sourceCount: row.source_count as number,
      successCount: row.success_count as number,
      failureCount: row.failure_count as number,
      codeVersion: (row.code_version as string | null) ?? null,
      configFingerprint: (row.config_fingerprint as string | null) ?? null,
      snapshotId: (row.snapshot_id as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  /** Source outcomes ordered canonically (deterministic history). */
  private getSourceOutcomes(runId: string): RefreshSourceOutcomeRecord[] {
    const rows = this.db.prepare('SELECT * FROM refresh_source_outcome WHERE run_id = ? ORDER BY provider, capability, request_key').all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      runId: r.run_id as string,
      provider: r.provider as RefreshSourceOutcomeRecord['provider'],
      capability: r.capability as RefreshSourceOutcomeRecord['capability'],
      requestKey: r.request_key as string,
      required: bool(r.required),
      mode: r.mode as RefreshSourceOutcomeRecord['mode'],
      status: r.status as RefreshSourceOutcomeRecord['status'],
      payloadChecksum: (r.payload_checksum as string | null) ?? null,
      errorCode: (r.error_code as string | null) ?? null,
      failureStage: (r.failure_stage as string | null) ?? null,
      retryable: r.retryable == null ? null : bool(r.retryable),
      errorMessage: (r.error_message as string | null) ?? null,
    }));
  }

  private getRunInference(runId: string): RunInferenceRecord[] {
    const rows = this.db.prepare('SELECT * FROM run_inference WHERE run_id = ? ORDER BY canonical_id, position').all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      runId: r.run_id as string,
      canonicalId: r.canonical_id as string,
      position: r.position as string,
      normalizedInputChecksum: r.normalized_input_checksum as string,
      outputChecksum: r.output_checksum as string,
    }));
  }

  // ==========================================================================
  // Publication + current pointer
  // ==========================================================================

  /** Deterministic publication id so re-publishing the same run result is idempotent. */
  static publicationId(runId: string, outputChecksum: string): string {
    return `pub-${digest(`${runId}|${outputChecksum}`)}`;
  }

  getCurrentPublicationRecord(): PublicationRecord | null {
    const cur = this.db.prepare('SELECT publication_id FROM current_publication WHERE id = 1').get() as { publication_id: string } | undefined;
    if (!cur) return null;
    return this.getPublicationRecord(cur.publication_id);
  }

  getPublicationRecord(publicationId: string): PublicationRecord | null {
    const row = this.db.prepare('SELECT * FROM publication WHERE publication_id = ?').get(publicationId) as Record<string, unknown> | undefined;
    if (!row) return null;
    assertSchema(SUPPORTED_PUBLICATION_SCHEMAS, row.schema_version as string, 'publication');
    return this.mapPublication(row);
  }

  private mapPublication(row: Record<string, unknown>): PublicationRecord {
    return {
      publicationId: row.publication_id as string,
      schemaVersion: row.schema_version as string,
      runId: row.run_id as string,
      snapshotId: row.snapshot_id as string,
      normalizedInputChecksum: row.normalized_input_checksum as string,
      outputChecksum: row.output_checksum as string,
      publishedAt: row.published_at as string,
      supersededPublicationId: (row.superseded_publication_id as string | null) ?? null,
    };
  }

  getPublicationHistory(limit = 100): PublicationRecord[] {
    const rows = this.db.prepare('SELECT * FROM publication ORDER BY published_at DESC, publication_id DESC LIMIT ?').all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapPublication(r));
  }

  /**
   * Publish a completed, complete, SUCCESSFUL run result as current — atomically. Rejects
   * non-success runs and incomplete artifact sets. Idempotent: the deterministic
   * publication id means re-publishing the same result reuses one row and one pointer.
   */
  publish(params: PublishParams): PublicationRecord {
    const view = this.getRefreshRun(params.runId);
    if (!view) throw new PersistenceError('ARTIFACT_NOT_FOUND', `run ${params.runId} not found`, { stage: 'publication' });
    if (view.run.status !== 'success') {
      throw new PersistenceError('PUBLICATION_NOT_ALLOWED', `run status ${view.run.status} is not publishable (only 'success')`, { stage: 'publication', detail: view.run.status });
    }
    this.validateArtifactSet(params);

    const publicationId = PersistenceStore.publicationId(params.runId, params.outputChecksum);
    return this.runInTransaction(() => {
      const cur = this.db.prepare('SELECT publication_id FROM current_publication WHERE id = 1').get() as { publication_id: string } | undefined;
      const existing = this.getPublicationRecord(publicationId);
      if (existing) {
        // Idempotent: ensure current points here without creating a duplicate row.
        this.db.prepare('INSERT INTO current_publication (id, publication_id, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET publication_id = excluded.publication_id, updated_at = excluded.updated_at').run(publicationId, this.now());
        return existing;
      }
      const publishedAt = this.now();
      this.db
        .prepare(
          `INSERT INTO publication (publication_id, schema_version, run_id, snapshot_id, normalized_input_checksum, output_checksum, published_at, superseded_publication_id)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(publicationId, SCHEMA_VERSIONS.publication, params.runId, params.snapshotId, params.normalizedInputChecksum, params.outputChecksum, publishedAt, cur?.publication_id ?? null);
      this.db.prepare('INSERT INTO current_publication (id, publication_id, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET publication_id = excluded.publication_id, updated_at = excluded.updated_at').run(publicationId, publishedAt);
      return this.getPublicationRecord(publicationId)!;
    });
  }

  /** Assert the (snapshot, normalized-input, output) set exists and is internally linked. */
  private validateArtifactSet(params: PublishParams): void {
    const snap = this.db.prepare('SELECT 1 FROM snapshot_artifact WHERE snapshot_id = ?').get(params.snapshotId);
    if (!snap) throw new PersistenceError('INVALID_ARTIFACT_SET', 'snapshot artifact missing', { stage: 'publication', detail: params.snapshotId });
    const input = this.db.prepare('SELECT snapshot_id FROM normalized_input_artifact WHERE checksum = ?').get(params.normalizedInputChecksum) as { snapshot_id: string } | undefined;
    if (!input) throw new PersistenceError('INVALID_ARTIFACT_SET', 'normalized input artifact missing', { stage: 'publication', detail: params.normalizedInputChecksum });
    const output = this.db.prepare('SELECT normalized_input_checksum, snapshot_id FROM inference_output_artifact WHERE checksum = ?').get(params.outputChecksum) as { normalized_input_checksum: string; snapshot_id: string } | undefined;
    if (!output) throw new PersistenceError('INVALID_ARTIFACT_SET', 'inference output artifact missing', { stage: 'publication', detail: params.outputChecksum });
    const link = this.db.prepare('SELECT 1 FROM run_inference WHERE run_id = ? AND normalized_input_checksum = ? AND output_checksum = ?').get(params.runId, params.normalizedInputChecksum, params.outputChecksum);
    if (!link) throw new PersistenceError('INVALID_ARTIFACT_SET', 'artifacts are not associated with this run', { stage: 'publication' });
    if (input.snapshot_id !== params.snapshotId || output.snapshot_id !== params.snapshotId || output.normalized_input_checksum !== params.normalizedInputChecksum) {
      throw new PersistenceError('INVALID_ARTIFACT_SET', 'artifact set is not internally consistent', { stage: 'publication' });
    }
  }

  /** The coherent, fully-verified current bundle — never a partially-missing set. */
  getCurrentPublication(): PublicationBundle | null {
    const publication = this.getCurrentPublicationRecord();
    if (!publication) return null;
    return this.assembleBundle(publication);
  }

  getPublicationBundle(publicationId: string): PublicationBundle | null {
    const publication = this.getPublicationRecord(publicationId);
    if (!publication) return null;
    return this.assembleBundle(publication);
  }

  private assembleBundle(publication: PublicationRecord): PublicationBundle {
    const view = this.getRefreshRun(publication.runId);
    if (!view) throw new PersistenceError('INTEGRITY_VIOLATION', 'publication references a missing run', { stage: 'integrity', detail: publication.runId });

    // Verify every referenced artifact exists and is intact (reads verify checksums).
    const snapshot = this.db.prepare('SELECT * FROM snapshot_artifact WHERE snapshot_id = ?').get(publication.snapshotId) as Record<string, unknown> | undefined;
    if (!snapshot) throw new PersistenceError('INTEGRITY_VIOLATION', 'publication references a missing snapshot', { stage: 'integrity', detail: publication.snapshotId });
    if (this.getSnapshotById(publication.snapshotId) === null) throw new PersistenceError('INTEGRITY_VIOLATION', 'snapshot vanished during read', { stage: 'integrity' });

    const input = this.db.prepare('SELECT * FROM normalized_input_artifact WHERE checksum = ?').get(publication.normalizedInputChecksum) as Record<string, unknown> | undefined;
    if (!input) throw new PersistenceError('INTEGRITY_VIOLATION', 'publication references a missing normalized input', { stage: 'integrity', detail: publication.normalizedInputChecksum });
    this.getNormalizedInputByChecksum(publication.normalizedInputChecksum); // integrity check

    const outputRead = this.getInferenceOutputByChecksum(publication.outputChecksum);
    if (!outputRead) throw new PersistenceError('INTEGRITY_VIOLATION', 'publication references a missing inference output', { stage: 'integrity', detail: publication.outputChecksum });

    return {
      publication,
      run: view.run,
      sources: view.sources,
      snapshot: { snapshotId: snapshot.snapshot_id as string, schemaVersion: snapshot.schema_version as string, serialized: snapshot.serialized as string, checksum: snapshot.checksum as string, createdAt: snapshot.created_at as string },
      normalizedInput: {
        checksum: input.checksum as string,
        schemaVersion: input.schema_version as string,
        serialized: input.serialized as string,
        snapshotId: input.snapshot_id as string,
        canonicalId: input.canonical_id as string,
        position: input.position as string,
        asOf: input.as_of as string,
        engineVersion: input.engine_version as string,
        createdAt: input.created_at as string,
      },
      output: outputRead.record,
    };
  }

  /** Defensive: assert the open DB is a version this build supports. */
  assertVersion(): void {
    assertSupportedDatabaseVersion(this.db);
  }

  /** Persist a raw envelope record projection (for tests/inspection). */
  rawEnvelopeRecord(env: RawPayloadEnvelope, createdAt: string): RawEnvelopeRecord {
    return { ...env, createdAt };
  }
}

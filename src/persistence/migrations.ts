// Explicit, versioned schema migrations (Phase 6). Fresh-DB creation and repeated runs are
// both safe (idempotent); the applied version is recorded in `schema_migrations`; a DB
// migrated by a NEWER build of the code (version > MIGRATION_VERSION) is rejected on open.
// Every migration runs inside a single transaction so a failure cannot falsely advance the
// recorded version.

import { PersistenceError } from './errors';
import { MIGRATION_VERSION } from './types';
import { transaction, type Database } from './sqlite/db';

interface Migration {
  readonly version: number;
  readonly up: string;
}

// Migration 1 — the complete Phase 6 schema. Immutable artifacts are content-addressed;
// a refresh run is an event; publication + a singleton current pointer gate visibility.
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE raw_payload_artifact (
        payload_checksum TEXT PRIMARY KEY,
        schema_version   TEXT NOT NULL,
        provider         TEXT NOT NULL,
        capability       TEXT NOT NULL,
        request_key      TEXT NOT NULL,
        fetched_at       TEXT NOT NULL,
        effective_date   TEXT NOT NULL,
        source_url       TEXT,
        http_status      INTEGER,
        content_type     TEXT,
        etag             TEXT,
        last_modified    TEXT,
        payload_encoding TEXT NOT NULL,
        payload          TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );

      CREATE TABLE snapshot_artifact (
        snapshot_id    TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        serialized     TEXT NOT NULL,
        checksum       TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );

      CREATE TABLE normalized_input_artifact (
        checksum            TEXT PRIMARY KEY,   -- production normalizedInputChecksum (identity)
        schema_version      TEXT NOT NULL,
        serialized          TEXT NOT NULL,
        serialized_checksum TEXT NOT NULL,      -- digest(serialized) for byte-integrity
        snapshot_id         TEXT NOT NULL REFERENCES snapshot_artifact(snapshot_id),
        canonical_id        TEXT NOT NULL,
        position            TEXT NOT NULL,
        as_of               TEXT NOT NULL,
        engine_version      TEXT NOT NULL,
        created_at          TEXT NOT NULL
      );

      CREATE TABLE inference_output_artifact (
        checksum                  TEXT PRIMARY KEY,
        schema_version            TEXT NOT NULL,
        serialized                TEXT NOT NULL,
        normalized_input_checksum TEXT NOT NULL REFERENCES normalized_input_artifact(checksum),
        snapshot_id               TEXT NOT NULL REFERENCES snapshot_artifact(snapshot_id),
        registry_version          TEXT,
        inference_layer_version   TEXT,
        env_reference_version     TEXT,
        created_at                TEXT NOT NULL
      );

      CREATE TABLE refresh_run (
        run_id             TEXT PRIMARY KEY,
        schema_version     TEXT NOT NULL,
        started_at         TEXT NOT NULL,
        completed_at       TEXT NOT NULL,
        mode               TEXT NOT NULL,
        status             TEXT NOT NULL,
        required_failure   INTEGER NOT NULL,
        source_count       INTEGER NOT NULL,
        success_count      INTEGER NOT NULL,
        failure_count      INTEGER NOT NULL,
        code_version       TEXT,
        config_fingerprint TEXT,
        snapshot_id        TEXT REFERENCES snapshot_artifact(snapshot_id),
        created_at         TEXT NOT NULL
      );

      CREATE TABLE refresh_source_outcome (
        run_id           TEXT NOT NULL REFERENCES refresh_run(run_id),
        provider         TEXT NOT NULL,
        capability       TEXT NOT NULL,
        request_key      TEXT NOT NULL,
        required         INTEGER NOT NULL,
        mode             TEXT NOT NULL,
        status           TEXT NOT NULL,
        payload_checksum TEXT REFERENCES raw_payload_artifact(payload_checksum),
        error_code       TEXT,
        failure_stage    TEXT,
        retryable        INTEGER,
        error_message    TEXT,
        PRIMARY KEY (run_id, request_key)
      );

      CREATE TABLE run_inference (
        run_id                    TEXT NOT NULL REFERENCES refresh_run(run_id),
        canonical_id              TEXT NOT NULL,
        position                  TEXT NOT NULL,
        normalized_input_checksum TEXT NOT NULL REFERENCES normalized_input_artifact(checksum),
        output_checksum           TEXT NOT NULL REFERENCES inference_output_artifact(checksum),
        PRIMARY KEY (run_id, canonical_id, position)
      );

      CREATE TABLE publication (
        publication_id            TEXT PRIMARY KEY,
        schema_version            TEXT NOT NULL,
        run_id                    TEXT NOT NULL REFERENCES refresh_run(run_id),
        snapshot_id               TEXT NOT NULL REFERENCES snapshot_artifact(snapshot_id),
        normalized_input_checksum TEXT NOT NULL REFERENCES normalized_input_artifact(checksum),
        output_checksum           TEXT NOT NULL REFERENCES inference_output_artifact(checksum),
        published_at              TEXT NOT NULL,
        superseded_publication_id TEXT REFERENCES publication(publication_id)
      );

      CREATE TABLE current_publication (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        publication_id TEXT NOT NULL REFERENCES publication(publication_id),
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX idx_source_outcome_run ON refresh_source_outcome(run_id);
      CREATE INDEX idx_run_inference_run ON run_inference(run_id);
      CREATE INDEX idx_publication_published_at ON publication(published_at);
    `,
  },
  {
    // Migration 2 — BOARD-level publication. A publication no longer names a single
    // (input, output) pair; it identifies the COMPLETE deterministic set of a successful
    // run's player inference associations (which already live, immutably, in run_inference).
    // The publication stores the board identity + entry count so retrieval can revalidate
    // the whole set. Legacy v1 single-unit publications are NOT valid boards: this migration
    // drops them and invalidates the old current pointer (documented unreleased-branch
    // policy — see README "Migration policy").
    version: 2,
    up: `
      DROP TABLE current_publication;
      DROP TABLE publication;

      CREATE TABLE publication (
        publication_id            TEXT PRIMARY KEY,   -- board-<boardChecksum>
        schema_version            TEXT NOT NULL,
        run_id                    TEXT NOT NULL REFERENCES refresh_run(run_id),
        snapshot_id               TEXT NOT NULL REFERENCES snapshot_artifact(snapshot_id),
        board_checksum            TEXT NOT NULL,       -- deterministic complete-board identity
        entry_count               INTEGER NOT NULL,    -- required board size (completeness guard)
        published_at              TEXT NOT NULL,
        superseded_publication_id TEXT REFERENCES publication(publication_id)
      );

      CREATE TABLE current_publication (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        publication_id TEXT NOT NULL REFERENCES publication(publication_id),
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX idx_publication_published_at ON publication(published_at);
    `,
  },
];

/** The highest migration version this code knows how to apply. */
export const LATEST_MIGRATION_VERSION = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0);

function currentVersion(db: Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  return row.v ?? 0;
}

/**
 * Apply pending migrations up to `target` (default: the latest this build knows). Idempotent.
 * Rejects a DB whose recorded version exceeds what this build understands (a newer code
 * version wrote it). The `target` parameter exists so tests can materialize an older schema
 * (e.g. a v1 database) to exercise the upgrade path; production always uses the default.
 */
export function migrate(db: Database, nowIso: string, target: number = LATEST_MIGRATION_VERSION): number {
  let version: number;
  try {
    version = currentVersion(db);
  } catch (err) {
    throw new PersistenceError('MIGRATION_FAILURE', `could not read schema version: ${(err as Error).message}`, { stage: 'migration' });
  }

  if (version > LATEST_MIGRATION_VERSION) {
    throw new PersistenceError('UNSUPPORTED_DATABASE_VERSION', `database schema version ${version} is newer than supported ${LATEST_MIGRATION_VERSION}`, { stage: 'migration' });
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= version || migration.version > target) continue;
    try {
      transaction(db, () => {
        db.exec(migration.up);
        db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(migration.version, nowIso);
      });
    } catch (err) {
      if (err instanceof PersistenceError && err.code === 'UNSUPPORTED_DATABASE_VERSION') throw err;
      throw new PersistenceError('MIGRATION_FAILURE', `migration ${migration.version} failed: ${(err as Error).message}`, { stage: 'migration' });
    }
  }

  return Math.min(target, LATEST_MIGRATION_VERSION);
}

/** Assert the DB is at a version this build supports (used defensively on read paths). */
export function assertSupportedDatabaseVersion(db: Database): void {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  const v = row.v ?? 0;
  if (v > MIGRATION_VERSION) {
    throw new PersistenceError('UNSUPPORTED_DATABASE_VERSION', `database schema version ${v} exceeds supported ${MIGRATION_VERSION}`, { stage: 'read' });
  }
}

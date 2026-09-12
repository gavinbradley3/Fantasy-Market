// Explicit, versioned schema migrations (Phase 6). Fresh-DB creation and repeated runs are
// both safe (idempotent); the applied version is recorded in `schema_migrations`; a DB
// migrated by a NEWER build of the code (version > LATEST_MIGRATION_VERSION) is rejected on open.
// Every migration runs inside a single transaction so a failure cannot falsely advance the
// recorded version.

import { PersistenceError } from './errors';
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
  {
    // A provider that publishes its own dataset version (nflverse stamps every release with
    // a `last_updated`) records it on the envelope. Those two columns must round-trip, because
    // Phase 4 freshness prefers them over the HTTP validators — a capture that loses them
    // replays with DIFFERENT freshness, which changes every record and therefore the snapshot
    // id. Added as nullable columns so every existing capture stays readable and valid.
    version: 3,
    up: `
      ALTER TABLE raw_payload_artifact ADD COLUMN source_version TEXT;
      ALTER TABLE raw_payload_artifact ADD COLUMN source_last_updated TEXT;
    `,
  },
  {
    // Migration 4 — EXTERNAL DYNASTY MARKET SNAPSHOTS.
    //
    // This table holds what an EXTERNAL market says a player is worth. It is deliberately
    // not part of the publication chain: a market value is not a PlayerTicker valuation, is
    // not content-addressed by us, and never participates in board identity. Keeping it in
    // its own table (rather than a column on a board entry) is what makes that distinction
    // structural rather than a naming convention.
    //
    // APPEND-ONLY BY KEY. `ingested_at` is part of the primary key, so re-running an ingest
    // writes a NEW row and yesterday's value survives. Every movement window (7d, 30d,
    // season) and every model-vs-market-over-time view is reconstructed by reading
    // successive rows, so an in-place update would silently destroy history. Writers target
    // this key with ON CONFLICT DO NOTHING: replaying the identical capture is a no-op, while
    // a genuinely malformed row still raises rather than vanishing.
    //
    // PROVENANCE IS A COLUMN, NOT A COMMENT. `source`, `source_player_id`, `source_timestamp`
    // and `source_version` travel with every row so a value can always be attributed back to
    // the party that published it. `format` is stored explicitly because a 1QB value and a
    // Superflex value are different numbers for the same player.
    version: 4,
    up: `
      CREATE TABLE market_snapshot (
        canonical_player_id   TEXT NOT NULL,
        source                TEXT NOT NULL,   -- e.g. 'dynastyprocess' (attribution, never dropped)
        format                TEXT NOT NULL,   -- 'dynasty_superflex' | 'dynasty_1qb', never inferred
        ingested_at           TEXT NOT NULL,   -- capture instant; part of the key (append-only)
        value                 REAL,            -- source's own scale; NULL means "no value", not 0
        overall_rank          INTEGER,
        position_rank         INTEGER,
        source_consensus_rank REAL,            -- often fractional (an average of ballots)
        source_player_id      TEXT,
        source_position       TEXT,
        source_team           TEXT,
        source_timestamp      TEXT NOT NULL,   -- the instant the SOURCE says its data is for
        source_version        TEXT,            -- the source's own dataset version/date, when it has one
        freshness             TEXT NOT NULL,
        provenance            TEXT NOT NULL,
        PRIMARY KEY (canonical_player_id, source, format, ingested_at)
      );

      CREATE INDEX idx_market_snapshot_player_time
        ON market_snapshot (canonical_player_id, source, format, ingested_at DESC);

      CREATE INDEX idx_market_snapshot_capture
        ON market_snapshot (source, format, ingested_at DESC);
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
  // Compared against the migration list itself, never a separately-maintained copy of the
  // number: a stale copy would reject a database this very build had just migrated.
  if (v > LATEST_MIGRATION_VERSION) {
    throw new PersistenceError('UNSUPPORTED_DATABASE_VERSION', `database schema version ${v} exceeds supported ${LATEST_MIGRATION_VERSION}`, { stage: 'read' });
  }
}

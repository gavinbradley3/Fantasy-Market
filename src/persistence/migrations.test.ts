// Migration tests (Phase 6): fresh DB, idempotency, recorded version, newer-version
// rejection, and no false version advance on a failed migration.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { LATEST_MIGRATION_VERSION, migrate } from './migrations';
import { openDatabase } from './sqlite/db';
import { PersistenceError } from './errors';
import { tempDbPath } from './__fixtures';

const paths: string[] = [];
function db() {
  const p = tempDbPath();
  paths.push(p);
  return openDatabase(p);
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

describe('migrations', () => {
  it('creates a fresh database and records the version', () => {
    const d = db();
    const v = migrate(d, '2026-01-01T00:00:00.000Z');
    expect(v).toBe(LATEST_MIGRATION_VERSION);
    const row = d.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    expect(row.v).toBe(LATEST_MIGRATION_VERSION);
    // Every table exists.
    const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['raw_payload_artifact', 'snapshot_artifact', 'normalized_input_artifact', 'inference_output_artifact', 'refresh_run', 'refresh_source_outcome', 'run_inference', 'publication', 'current_publication']) {
      expect(tables).toContain(t);
    }
    d.close();
  });

  it('is idempotent — running twice does not error or duplicate', () => {
    const d = db();
    migrate(d, '2026-01-01T00:00:00.000Z');
    migrate(d, '2026-01-02T00:00:00.000Z');
    const count = d.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number };
    expect(count.c).toBe(LATEST_MIGRATION_VERSION);
    d.close();
  });

  it('rejects a database whose recorded version is newer than this build', () => {
    const d = db();
    migrate(d, '2026-01-01T00:00:00.000Z');
    d.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(LATEST_MIGRATION_VERSION + 5, '2030-01-01T00:00:00.000Z');
    expect(() => migrate(d, '2026-01-03T00:00:00.000Z')).toThrowError(PersistenceError);
    try {
      migrate(d, '2026-01-03T00:00:00.000Z');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('UNSUPPORTED_DATABASE_VERSION');
    }
    d.close();
  });

  it('a failed migration does not falsely advance the recorded version, leaves no partial objects', () => {
    const d = db();
    // Pre-create a table migration 1 also creates → DDL collides & the migration fails.
    d.exec('CREATE TABLE raw_payload_artifact (x INTEGER);');
    expect(() => migrate(d, '2026-01-01T00:00:00.000Z')).toThrowError(PersistenceError);
    const v = d.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
    expect(v.v ?? 0).toBe(0);
    // No migration-created table (e.g. publication) leaked out of the rolled-back transaction.
    expect(d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='publication'").get()).toBeUndefined();
    d.close();
  });
});

function columns(d: import('./sqlite/db').Database, table: string): string[] {
  return (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);
}

describe('migration v2 — board publication', () => {
  it('a fresh database reaches the latest version with the board-shaped publication table', () => {
    const d = db();
    expect(migrate(d, '2026-01-01T00:00:00.000Z')).toBe(LATEST_MIGRATION_VERSION);
    const cols = columns(d, 'publication');
    expect(cols).toContain('board_checksum');
    expect(cols).toContain('entry_count');
    expect(cols).not.toContain('normalized_input_checksum'); // v1 single-unit column is gone
    d.close();
  });

  it('a v1 database upgrades to v2: legacy single-unit publication schema is replaced, current pointer invalidated', () => {
    const d = db();
    // Materialize a v1 database.
    expect(migrate(d, '2026-01-01T00:00:00.000Z', 1)).toBe(1);
    expect(columns(d, 'publication')).toContain('normalized_input_checksum');
    expect(columns(d, 'publication')).not.toContain('entry_count');

    // Upgrade.
    expect(migrate(d, '2026-01-02T00:00:00.000Z')).toBe(LATEST_MIGRATION_VERSION);
    const cols = columns(d, 'publication');
    expect(cols).toContain('entry_count');
    expect(cols).not.toContain('normalized_input_checksum');
    // The current pointer is invalidated (empty) — no legacy single-unit board survives.
    const cur = d.prepare('SELECT COUNT(*) AS c FROM current_publication').get() as { c: number };
    expect(cur.c).toBe(0);
    // Every migration version is recorded, in order.
    const versions = (d.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]).map((r) => r.version);
    expect(versions).toEqual(Array.from({ length: LATEST_MIGRATION_VERSION }, (_, i) => i + 1));
    d.close();
  });

  it('re-running migration on an up-to-date database is idempotent', () => {
    const d = db();
    migrate(d, '2026-01-01T00:00:00.000Z');
    migrate(d, '2026-01-02T00:00:00.000Z');
    const c = d.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number };
    expect(c.c).toBe(LATEST_MIGRATION_VERSION);
    d.close();
  });
});

describe('migration v3 — provider dataset version', () => {
  it('adds the provider version columns to the raw payload artifact', () => {
    const d = db();
    migrate(d, '2026-01-01T00:00:00.000Z');
    const cols = columns(d, 'raw_payload_artifact');
    expect(cols).toContain('source_version');
    expect(cols).toContain('source_last_updated');
    d.close();
  });

  it('upgrades a v2 database in place, leaving existing captures readable', () => {
    // The columns are nullable, so a capture written before the provider published a
    // version stays valid and simply reports none.
    const d = db();
    expect(migrate(d, '2026-01-01T00:00:00.000Z', 2)).toBe(2);
    expect(columns(d, 'raw_payload_artifact')).not.toContain('source_version');
    // The full upgrade lands on whatever the latest migration is — asserting a literal here
    // would make every future migration look like a regression in the v2→v3 upgrade path.
    expect(migrate(d, '2026-01-02T00:00:00.000Z')).toBe(LATEST_MIGRATION_VERSION);
    expect(columns(d, 'raw_payload_artifact')).toContain('source_version');
    d.close();
  });
});

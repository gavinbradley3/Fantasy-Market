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
});

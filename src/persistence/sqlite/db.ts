// SQLite database adapter (Phase 6) built on the Node built-in `node:sqlite`
// (`DatabaseSync`) — no native compilation, no extra dependency, deterministic and
// offline-safe. Single-process, local-first: this is a hobby-stage durable store, NOT a
// distributed system. Node-only; never imported by browser code.
//
// NOTE: `node:sqlite` is an experimental Node feature (emits an ExperimentalWarning). It
// is API-stable enough for local persistence; see README for the assumptions.

// `node:sqlite` is loaded via createRequire at runtime (not a static import) because it
// is a Node built-in newer than the bundler's builtin list; a static `import` would be
// rewritten and fail to resolve. The type-only import is erased and carries no runtime cost.
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceError } from '../errors';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type Database = DatabaseSync;

/** Open + configure a database: foreign keys ON, WAL, and a bounded busy timeout. */
export function openDatabase(location: string): Database {
  if (location !== ':memory:') {
    const dir = dirname(location);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSyncCtor(location);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (location !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/**
 * Run `fn` inside a single transaction. Commits on success; rolls back on any throw so a
 * failed write can never leave a partially-applied artifact set or advance a pointer.
 * Not reentrant — callers must not nest `transaction` calls.
 */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // A rollback failure must not mask the original error.
    }
    if (err instanceof PersistenceError) throw err;
    throw new PersistenceError('WRITE_FAILURE', `transaction rolled back: ${(err as Error).message}`, { stage: 'run-write', detail: (err as Error).message });
  }
}

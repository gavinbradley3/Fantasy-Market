// Append-only market-snapshot store.
//
// TEMPORAL BY CONSTRUCTION. Yesterday's value is never updated in place: 1d/7d/30d movement,
// historical charts and model-vs-market-over-time are all reconstructed by reading successive
// rows. The primary key therefore includes the capture instant, so re-running an ingest writes
// a NEW row rather than overwriting the previous one.
//
// PROTOTYPE ISOLATION. This deliberately opens its OWN database file and creates its own table
// idempotently, rather than joining the board's versioned migration chain in
// src/persistence/migrations.ts. That keeps the working /board schema untouched while the
// source is still being evaluated. Productionising means moving this table into that chain.

// `node:sqlite` is loaded via createRequire rather than a static import, for the same reason
// src/persistence/sqlite/db.ts does it: the bundler rewrites a static import of this built-in
// and fails to resolve it.
//
// This deliberately does NOT import @/persistence, even though that module solves the same
// problem. src/persistence is a Node-only backend module whose importers are restricted by
// src/persistence/boundary.test.ts, and every exemption there carries its own proof that the
// importer cannot reach the browser bundle. Rather than weaken that invariant for a
// prototype, market owns these few lines and stays independent.
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MarketFormat, MarketSnapshot } from './types';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

const CREATE = `
  CREATE TABLE IF NOT EXISTS market_snapshot (
    canonical_player_id   TEXT NOT NULL,
    source                TEXT NOT NULL,
    format                TEXT NOT NULL,
    ingested_at           TEXT NOT NULL,
    value                 REAL,
    overall_rank          INTEGER,
    position_rank         INTEGER,
    source_consensus_rank REAL,
    source_player_id      TEXT,
    source_position       TEXT,
    source_team           TEXT,
    source_timestamp      TEXT NOT NULL,
    freshness             TEXT NOT NULL,
    provenance            TEXT NOT NULL,
    -- The capture instant is part of the key: an ingest appends history, it does not mutate it.
    PRIMARY KEY (canonical_player_id, source, format, ingested_at)
  );

  CREATE INDEX IF NOT EXISTS market_snapshot_player_time
    ON market_snapshot (canonical_player_id, source, format, ingested_at DESC);
`;

export interface MarketSnapshotStore {
  append(snapshots: readonly MarketSnapshot[]): number;
  /** Every snapshot for one player/source/format, oldest first — the movement series. */
  history(canonicalPlayerId: string, source: string, format: MarketFormat): MarketSnapshot[];
  /** The most recent snapshot per player for one source/format. */
  latest(source: string, format: MarketFormat): MarketSnapshot[];
  distinctCaptureInstants(source: string, format: MarketFormat): string[];
  close(): void;
}

interface Row {
  canonical_player_id: string;
  source: string;
  format: string;
  ingested_at: string;
  value: number | null;
  overall_rank: number | null;
  position_rank: number | null;
  source_consensus_rank: number | null;
  source_player_id: string | null;
  source_position: string | null;
  source_team: string | null;
  source_timestamp: string;
  freshness: string;
  provenance: string;
}

function toSnapshot(r: Row): MarketSnapshot {
  return {
    canonicalPlayerId: r.canonical_player_id,
    source: r.source,
    format: r.format as MarketFormat,
    value: r.value,
    overallRank: r.overall_rank,
    positionRank: r.position_rank,
    sourceConsensusRank: r.source_consensus_rank,
    sourcePlayerId: r.source_player_id,
    sourcePosition: r.source_position,
    sourceTeam: r.source_team,
    sourceTimestamp: r.source_timestamp,
    ingestedAt: r.ingested_at,
    freshness: r.freshness as MarketSnapshot['freshness'],
    provenance: r.provenance as MarketSnapshot['provenance'],
  };
}

export function openMarketStore(dbPath: string): MarketSnapshotStore {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db: DatabaseSync = new DatabaseSyncCtor(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(CREATE);

  return {
    append(snapshots) {
      // INSERT OR IGNORE: re-appending the identical capture is a no-op, but a capture at a
      // NEW instant is always a new row. Nothing is ever overwritten.
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO market_snapshot (
          canonical_player_id, source, format, ingested_at, value, overall_rank, position_rank,
          source_consensus_rank, source_player_id, source_position, source_team,
          source_timestamp, freshness, provenance
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      // One transaction: a partially-written batch would produce a capture instant that
      // covers only some players, which movement arithmetic would read as real change.
      db.exec('BEGIN IMMEDIATE;');
      try {
        let written = 0;
        for (const s of snapshots) {
          const res = stmt.run(
            s.canonicalPlayerId, s.source, s.format, s.ingestedAt, s.value,
            s.overallRank, s.positionRank, s.sourceConsensusRank, s.sourcePlayerId,
            s.sourcePosition, s.sourceTeam, s.sourceTimestamp, s.freshness, s.provenance,
          );
          written += Number(res.changes);
        }
        db.exec('COMMIT;');
        return written;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    },

    history(canonicalPlayerId, source, format) {
      const rows = db
        .prepare(
          `SELECT * FROM market_snapshot
            WHERE canonical_player_id = ? AND source = ? AND format = ?
            ORDER BY ingested_at ASC`,
        )
        .all(canonicalPlayerId, source, format) as unknown as Row[];
      return rows.map(toSnapshot);
    },

    latest(source, format) {
      const rows = db
        .prepare(
          `SELECT s.* FROM market_snapshot s
             JOIN (
               SELECT canonical_player_id, MAX(ingested_at) AS m
                 FROM market_snapshot WHERE source = ? AND format = ?
                GROUP BY canonical_player_id
             ) t
               ON t.canonical_player_id = s.canonical_player_id AND t.m = s.ingested_at
            WHERE s.source = ? AND s.format = ?
            ORDER BY s.overall_rank IS NULL, s.overall_rank ASC`,
        )
        .all(source, format, source, format) as unknown as Row[];
      return rows.map(toSnapshot);
    },

    distinctCaptureInstants(source, format) {
      const rows = db
        .prepare(
          `SELECT DISTINCT ingested_at FROM market_snapshot
            WHERE source = ? AND format = ? ORDER BY ingested_at ASC`,
        )
        .all(source, format) as unknown as { ingested_at: string }[];
      return rows.map((r) => r.ingested_at);
    },

    close() {
      db.close();
    },
  };
}

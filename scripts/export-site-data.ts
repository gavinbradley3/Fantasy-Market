/**
 * Export the published board, the market snapshot and a freshness status document as STATIC
 * JSON, and append the market capture to an append-only history file.
 *
 *   npm run export:site-data -- [--db .local/playerticker.db] [--out data] [--now <iso>]
 *
 * WHY THIS EXISTS
 * PlayerTicker's SQLite database is a WORKING STORE, not a serving store. For one season it is
 * 184 MB — 83 MB of raw provider payloads, a 61 MB snapshot blob, plus per-player normalized
 * inputs and inference envelopes. None of that is needed to render the product. What the app
 * actually reads is the published board (about 1.4 MB, ~200 KB gzipped), the latest market
 * quotes, and "how fresh is this".
 *
 * Exporting those three lets the refresh run anywhere with network access and leave behind a
 * small, durable, reviewable result — which is what makes automation possible without
 * provisioning a database server. The database can be thrown away after every run; the export
 * is the artifact that survives.
 *
 * THE BOARD JSON IS THE SAME BYTES `GET /publication` RETURNS. It is produced by
 * `toPublicationResponse`, the identical projection the HTTP route uses, so the static surface
 * and the API surface cannot drift apart.
 *
 * APPEND-ONLY MARKET HISTORY. Each run appends one line to `market-history.jsonl` and never
 * rewrites an existing one. A capture instant already present is skipped rather than
 * duplicated, so re-running is safe and a re-publish of the same snapshot cannot inflate the
 * history.
 *
 * IT INVENTS NOTHING. If there is no published board it writes no board file and says so in the
 * status; a missing market snapshot is reported as missing, never as an empty or synthetic one.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PersistenceStore } from '@/persistence';
import { createApplicationService, DEFAULT_MARKET_FORMAT, DEFAULT_MARKET_SOURCE } from '@/application';
import { toMarketResponse, toPublicationResponse } from '@/api/dto';
import type { SchedulerPort } from '@/application';
import { STALENESS } from '@/ops/staleness';
import { buildStatus } from '@/ops/status';

interface Args {
  db: string;
  out: string;
  now: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { db: '.local/playerticker.db', out: 'data', now: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--db': args.db = next(); break;
      case '--out': args.out = next(); break;
      case '--now': args.now = new Date(next()).toISOString(); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** Deterministic, stable-key JSON so an unchanged export produces an unchanged file. */
function writeJson(path: string, value: unknown): number {
  mkdirSync(dirname(path), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, body);
  return Buffer.byteLength(body);
}

/** Capture instants already recorded, so history is appended to and never rewritten. */
function existingCaptures(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const seen = new Set<string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const row = JSON.parse(line) as { capturedAt?: unknown; source?: unknown; format?: unknown };
      if (typeof row.capturedAt === 'string') seen.add(`${String(row.source)}|${String(row.format)}|${row.capturedAt}`);
    } catch {
      // A malformed line is left exactly where it is. This file is append-only history and
      // rewriting it to "clean up" would destroy the record it exists to keep.
    }
  }
  return seen;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const store = PersistenceStore.open(args.db);
  try {
    // An INERT scheduler. This script only reads: it exports what a refresh already persisted
    // and never triggers one. Wiring a real scheduler here would give an export job the ability
    // to start an ingest, which is not its business.
    const scheduler: SchedulerPort = {
      triggerNow: () => {
        throw new Error('export-site-data never triggers a refresh');
      },
      isRunning: () => false,
      getState: () => 'disabled',
      getMetrics: () => ({ totalRuns: 0, successfulRuns: 0, failedRuns: 0, lastRunAt: null, lastDurationMs: null }),
      getActiveRunId: () => null,
      start: () => undefined,
      stop: () => undefined,
    };

    const app = createApplicationService({
      scheduler,
      publications: store,
      runs: store,
      market: store,
      transport: { requiredProviders: ['nflverse'], replayEnabled: true },
      nowIso: () => args.now,
    });

    // --- board ---
    const bundle = app.publications.currentPublication();
    const meta = app.publications.currentPublicationMetadata();
    let boardBytes = 0;
    if (bundle && meta) {
      boardBytes = writeJson(join(outDir, 'board.json'), toPublicationResponse(bundle, meta));
      console.log(`board.json          ${meta.entryCount} entries, ${(boardBytes / 1e6).toFixed(2)} MB`);
    } else {
      // No board file is written. A stale board on disk from a previous successful run is left
      // untouched, which is the last-known-good guarantee at the export layer.
      console.log('board.json          SKIPPED — nothing published in this database');
    }

    // --- market ---
    const snapshots = app.market.latest(DEFAULT_MARKET_SOURCE, DEFAULT_MARKET_FORMAT);
    const captures = app.market.captureInstants(DEFAULT_MARKET_SOURCE, DEFAULT_MARKET_FORMAT);
    let appended = false;
    if (snapshots.length > 0) {
      // `market-latest.json` is the PRESENTATION shape — the same bytes `GET /market` returns,
      // with attribution attached. It is deliberately lossy: the per-quote DTO drops the source's
      // own player id, position, team and consensus rank because the app does not render them.
      const payload = toMarketResponse(DEFAULT_MARKET_SOURCE, DEFAULT_MARKET_FORMAT, snapshots, captures);
      writeJson(join(outDir, 'market-latest.json'), payload);

      // The history line carries the RAW snapshots instead, because this file is the durable
      // record and `seed-market-history` has to reconstruct a database from it exactly. Writing
      // the DTO here would silently drop those four source fields and the seed would fail to
      // bind them — which is how a lossy display shape quietly becomes a lossy archive.
      const historyPath = join(outDir, 'market-history.jsonl');
      const seen = existingCaptures(historyPath);
      const capturedAt = payload.capturedAt ?? args.now;
      const key = `${DEFAULT_MARKET_SOURCE}|${DEFAULT_MARKET_FORMAT}|${capturedAt}`;
      if (seen.has(key)) {
        console.log(`market-history      capture ${capturedAt} already recorded — not duplicated`);
      } else {
        const record = {
          source: DEFAULT_MARKET_SOURCE,
          format: DEFAULT_MARKET_FORMAT,
          capturedAt,
          sourceTimestamp: payload.sourceTimestamp,
          attribution: payload.attribution,
          quoteCount: snapshots.length,
          quotes: snapshots,
        };
        appendFileSync(historyPath, `${JSON.stringify(record)}\n`);
        appended = true;
        console.log(`market-history      appended capture ${capturedAt} (${snapshots.length} quotes)`);
      }
      console.log(`market-latest.json  ${snapshots.length} quotes, ${captures.length} captures in db`);
    } else {
      console.log('market-latest.json  SKIPPED — no market snapshot in this database');
    }

    // --- status ---
    const status = buildStatus({
      now: args.now,
      health: app.healthReport(),
      runs: store.recentRefreshRuns(STALENESS.runHistoryLimit),
      boardEntryCount: meta?.entryCount ?? null,
      boardPublishedAt: meta?.publishedAt ?? null,
      marketQuoteCount: snapshots.length,
      marketCapturedAt: snapshots[0]?.capturedAt ?? null,
      marketSourceTimestamp: snapshots[0]?.sourceTimestamp ?? null,
      marketHistoryAppended: appended,
    });
    writeJson(join(outDir, 'status.json'), status);
    console.log('');
    console.log(`board   ${status.board.state.padEnd(8)} published ${status.board.publishedAt ?? '—'}`);
    console.log(`market  ${status.market.state.padEnd(8)} captured  ${status.market.capturedAt ?? '—'}`);
    console.log(`nflverse last success  ${status.providers.nflverse.lastSuccessAt ?? 'never'}`);
    console.log(`sleeper  attempted ${status.providers.sleeper.lastAttemptAt ?? 'never'}  succeeded ${status.providers.sleeper.lastSuccessAt ?? 'never'}`);
    return 0;
  } finally {
    store.close();
  }
}

process.exit(main());

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
import { buildStatus, type RefreshAttemptOutcome, type RefreshAttemptStatus, type StatusDocument } from '@/ops/status';
import { marketDocumentSchema } from '@/services/siteData';
import { publicationResponseSchema } from '@/services/api';

type DatasetOwner = 'all' | 'board' | 'market';

interface Args {
  db: string;
  out: string;
  now: string;
  dataset: DatasetOwner;
  attemptOutcome: RefreshAttemptOutcome | null;
  attemptAt: string;
}

function parseArgs(argv: string[]): Args {
  const now = new Date().toISOString();
  const args: Args = {
    db: '.local/playerticker.db', out: 'data', now, dataset: 'all',
    attemptOutcome: null, attemptAt: now,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--db': args.db = next(); break;
      case '--out': args.out = next(); break;
      case '--now': args.now = new Date(next()).toISOString(); break;
      case '--dataset': {
        const dataset = next();
        if (dataset !== 'all' && dataset !== 'board' && dataset !== 'market') throw new Error(`invalid dataset ${dataset}`);
        args.dataset = dataset;
        break;
      }
      case '--attempt-outcome': {
        const outcome = next();
        if (outcome !== 'success' && outcome !== 'partial' && outcome !== 'failure') throw new Error(`invalid attempt outcome ${outcome}`);
        args.attemptOutcome = outcome;
        break;
      }
      case '--attempt-at': args.attemptAt = new Date(next()).toISOString(); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function previousAttempt(value: unknown): RefreshAttemptStatus | null {
  if (!value || typeof value !== 'object') return null;
  const attemptedAt = (value as { attemptedAt?: unknown }).attemptedAt;
  const outcome = (value as { outcome?: unknown }).outcome;
  if (typeof attemptedAt !== 'string' || !Number.isFinite(Date.parse(attemptedAt))) return null;
  if (outcome !== 'success' && outcome !== 'partial' && outcome !== 'failure') return null;
  return { attemptedAt, outcome };
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
    const priorStatus = readJson(join(outDir, 'status.json')) as Partial<StatusDocument> | null;
    const priorBoardResult = publicationResponseSchema.safeParse(readJson(join(outDir, 'board.json')));
    const priorBoard = priorBoardResult.success ? priorBoardResult.data.publication : null;
    const priorMarketResult = marketDocumentSchema.safeParse(readJson(join(outDir, 'market-latest.json')));
    const priorMarket = priorMarketResult.success ? priorMarketResult.data : null;
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
    if (args.dataset !== 'market' && bundle && meta) {
      boardBytes = writeJson(join(outDir, 'board.json'), toPublicationResponse(bundle, meta));
      console.log(`board.json          ${meta.entryCount} entries, ${(boardBytes / 1e6).toFixed(2)} MB`);
    } else if (args.dataset !== 'market') {
      // No board file is written. A stale board on disk from a previous successful run is left
      // untouched, which is the last-known-good guarantee at the export layer.
      console.log('board.json          SKIPPED — nothing published in this database');
    }

    // --- market ---
    const snapshots = app.market.latest(DEFAULT_MARKET_SOURCE, DEFAULT_MARKET_FORMAT);
    const captures = app.market.captureInstants(DEFAULT_MARKET_SOURCE, DEFAULT_MARKET_FORMAT);
    let appended = false;
    if (args.dataset !== 'board' && snapshots.length > 0) {
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
    } else if (args.dataset !== 'board') {
      console.log('market-latest.json  SKIPPED — no market snapshot in this database');
    }

    // --- status ---
    const runs = args.dataset === 'market' ? [] : store.recentRefreshRuns(STALENESS.runHistoryLimit);
    const explicitAttempt = args.attemptOutcome === null ? null : {
      attemptedAt: args.attemptAt,
      outcome: args.attemptOutcome,
    } satisfies RefreshAttemptStatus;
    const priorBoardStatusMatches = priorBoard !== null
      && priorStatus?.board?.publicationId === priorBoard.publicationId
      && priorStatus.board.checksum === priorBoard.boardChecksum
      && priorStatus.board.publishedAt === priorBoard.publishedAt;
    // Never rebind attempt evidence from a mismatched status document to the durable board just
    // because a market-only export regenerates their sibling status.json.
    const oldBoardAttempt = priorBoardStatusMatches
      ? previousAttempt(priorStatus?.board?.lastAttempt)
      : null;
    const oldMarketAttempt = previousAttempt(priorStatus?.market?.lastAttempt);
    const effectiveBoard = args.dataset === 'market' ? priorBoard : meta ?? priorBoard;
    const ownedMarket = args.dataset === 'board' ? null : snapshots[0] ?? null;
    const statusMarketCapturedAt = typeof priorStatus?.market?.capturedAt === 'string'
      ? priorStatus.market.capturedAt : null;
    const statusMarketSourceTimestamp = typeof priorStatus?.market?.sourceTimestamp === 'string'
      ? priorStatus.market.sourceTimestamp : null;
    const statusMarketQuoteCount = typeof priorStatus?.market?.quoteCount === 'number'
      ? priorStatus.market.quoteCount : 0;
    const effectiveMarketCapturedAt = ownedMarket?.capturedAt ?? priorMarket?.capturedAt ?? statusMarketCapturedAt;
    const effectiveMarketSourceTimestamp = ownedMarket?.sourceTimestamp
      ?? priorMarket?.sourceTimestamp ?? statusMarketSourceTimestamp;
    const effectiveMarketQuoteCount = ownedMarket
      ? snapshots.length : priorMarket?.quoteCount ?? statusMarketQuoteCount;
    const boardAttempt = args.dataset === 'market'
      ? oldBoardAttempt
      : explicitAttempt ?? (runs.length === 0 ? oldBoardAttempt : undefined);
    const marketAttempt = args.dataset === 'board'
      ? oldMarketAttempt
      : explicitAttempt ?? (snapshots.length > 0
        ? { attemptedAt: args.attemptAt, outcome: 'success' as const }
        : oldMarketAttempt);

    let status = buildStatus({
      now: args.now,
      health: app.healthReport(),
      runs,
      boardEntryCount: effectiveBoard?.entryCount ?? null,
      boardPublishedAt: effectiveBoard?.publishedAt ?? null,
      boardPublicationId: effectiveBoard?.publicationId ?? null,
      boardChecksum: effectiveBoard?.boardChecksum ?? null,
      boardAttempt,
      marketQuoteCount: effectiveMarketQuoteCount,
      marketCapturedAt: effectiveMarketCapturedAt,
      marketSourceTimestamp: effectiveMarketSourceTimestamp,
      marketHistoryAppended: appended,
      marketAttempt,
    });
    // A temporary database for one dataset has no authority to erase the other dataset's
    // operational history. Preserve run/provider detail when this database recorded none.
    if (runs.length === 0 && priorStatus?.providers?.nflverse && priorStatus.providers.sleeper) {
      status = { ...status, providers: priorStatus.providers };
    }
    if (runs.length === 0 && args.dataset === 'board' && explicitAttempt?.outcome === 'failure') {
      status = {
        ...status,
        lastRun: {
          ...status.lastRun,
          completedAt: explicitAttempt.attemptedAt,
          status: 'failure',
          servingLastKnownGood: effectiveBoard !== null,
        },
      };
    } else if (runs.length === 0 && priorStatus?.lastRun?.runId !== undefined) {
      status = { ...status, lastRun: priorStatus.lastRun };
    }
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

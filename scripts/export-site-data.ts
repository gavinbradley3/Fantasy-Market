/**
 * Export PlayerTicker's published board and freshness status only. External-market snapshots,
 * history and comparison data are deliberately excluded from this release's serving export.
 *
 *   npm run export:site-data -- [--db .local/playerticker.db] [--out data] [--now <iso>]
 *
 * WHY THIS EXISTS
 * PlayerTicker's SQLite database is a WORKING STORE, not a serving store. For one season it is
 * 184 MB — 83 MB of raw provider payloads, a 61 MB snapshot blob, plus per-player normalized
 * inputs and inference envelopes. None of that is needed to render the product. What the app
 * actually reads is the published board and "how fresh is this".
 *
 * Exporting those two lets the refresh run anywhere with network access and leave behind a
 * small, durable, reviewable result — which is what makes automation possible without
 * provisioning a database server. The database can be thrown away after every run; the export
 * is the artifact that survives.
 *
 * THE BOARD JSON IS THE SAME BYTES `GET /publication` RETURNS. It is produced by
 * `toPublicationResponse`, the identical projection the HTTP route uses, so the static surface
 * and the API surface cannot drift apart.
 *
 * IT INVENTS NOTHING. If there is no published board it writes no board file and says so in the
 * status. Private market history already on disk is neither removed nor redistributed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PersistenceStore } from '@/persistence';
import { createApplicationService } from '@/application';
import { toPublicationResponse } from '@/api/dto';
import type { SchedulerPort } from '@/application';
import { STALENESS } from '@/ops/staleness';
import { buildStatus, type RefreshAttemptOutcome, type RefreshAttemptStatus, type StatusDocument } from '@/ops/status';
import { publicationResponseSchema } from '@/services/api';
import { MARKET_DATA_DISABLED_REASON } from '@/config/release';

type DatasetOwner = 'board';

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
    db: '.local/playerticker.db', out: 'data', now, dataset: 'board',
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
        if (dataset === 'market') throw new Error(MARKET_DATA_DISABLED_REASON);
        if (dataset !== 'all' && dataset !== 'board') throw new Error(`invalid dataset ${dataset}`);
        // Existing --dataset all invocations remain compatible, but "all public data" now
        // means the independent board and its status, never an external market export.
        args.dataset = 'board';
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

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const store = PersistenceStore.open(args.db);
  try {
    const priorStatus = readJson(join(outDir, 'status.json')) as Partial<StatusDocument> | null;
    const priorBoardResult = publicationResponseSchema.safeParse(readJson(join(outDir, 'board.json')));
    const priorBoard = priorBoardResult.success ? priorBoardResult.data.publication : null;
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

    // No market-store reads, market export, history append or old-market-data removal.
    // The deployment allowlist, separately, prevents retained private artifacts from shipping.
    console.log(`market data         EXCLUDED — ${MARKET_DATA_DISABLED_REASON}`);

    // --- status ---
    const runs = store.recentRefreshRuns(STALENESS.runHistoryLimit);
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
    const effectiveBoard = meta ?? priorBoard;
    const boardAttempt = explicitAttempt ?? (runs.length === 0 ? oldBoardAttempt : undefined);

    let status = buildStatus({
      now: args.now,
      health: app.healthReport(),
      runs,
      boardEntryCount: effectiveBoard?.entryCount ?? null,
      boardPublishedAt: effectiveBoard?.publishedAt ?? null,
      boardPublicationId: effectiveBoard?.publicationId ?? null,
      boardChecksum: effectiveBoard?.boardChecksum ?? null,
      boardAttempt,
      // Backward-compatible status shape, without reviving prior market timestamps/quotes.
      marketQuoteCount: 0,
      marketCapturedAt: null,
      marketSourceTimestamp: null,
      marketHistoryAppended: false,
      marketAttempt: null,
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
    writeJson(join(outDir, 'status.json'), {
      ...status,
      marketPolicy: { enabled: false, reason: MARKET_DATA_DISABLED_REASON },
    });
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

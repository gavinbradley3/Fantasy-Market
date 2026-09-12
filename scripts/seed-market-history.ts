/**
 * Rebuild a market database from the committed append-only history file.
 *
 *   npm run seed:market-history -- --db <path> --history data/market-history.jsonl
 *
 * WHY THIS EXISTS
 * The scheduled market refresh runs on an ephemeral runner: the SQLite database is created,
 * written and thrown away. The DURABLE record is `market-history.jsonl`, committed to the
 * `site-data` branch, one line per capture. Without seeding, every run would believe it was
 * taking the first snapshot ever, `getMarketCaptureInstants` would return a single instant, and
 * "append-only history" would be a file with one line in it that changed every week.
 *
 * This reads that history back into the database before the new capture is appended, so the
 * append-only guarantee holds across runs that share no filesystem.
 *
 * IT IS PURELY ADDITIVE. Snapshots are written through the same `appendMarketSnapshots` the
 * ingest uses, whose `ON CONFLICT ... DO NOTHING` on (player, source, format, ingested_at)
 * makes re-seeding idempotent. Nothing is deleted, nothing is rewritten, and a malformed line is
 * reported and skipped rather than silently dropped — it stays in the file, because that file is
 * the record.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PersistenceStore } from '@/persistence';
import type { MarketSnapshot } from '@/market';

interface Args {
  db: string;
  history: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { db: '.local/playerticker.db', history: 'data/market-history.jsonl' };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--db': args.db = next(); break;
      case '--history': args.history = next(); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** One exported capture, as `export-site-data` writes it. */
interface CaptureLine {
  readonly source?: unknown;
  readonly format?: unknown;
  readonly capturedAt?: unknown;
  readonly quotes?: unknown;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const historyPath = resolve(args.history);
  mkdirSync(dirname(resolve(args.db)), { recursive: true });

  if (!existsSync(historyPath)) {
    // A first run has no history, which is not an error. The database is left empty and the
    // capture that follows becomes line one.
    console.log(`no history at ${historyPath} — nothing to seed (first run)`);
    return 0;
  }

  const store = PersistenceStore.open(args.db);
  try {
    let captures = 0;
    let written = 0;
    let malformed = 0;
    for (const line of readFileSync(historyPath, 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      let row: CaptureLine;
      try {
        row = JSON.parse(line) as CaptureLine;
      } catch {
        malformed += 1;
        continue;
      }
      if (!Array.isArray(row.quotes)) {
        malformed += 1;
        continue;
      }
      // Quotes were exported from this same store, so they already carry every field
      // `appendMarketSnapshots` needs. They are replayed verbatim: no value is recomputed, no
      // rank is re-derived, no timestamp is refreshed. Re-deriving anything here would make the
      // seeded history disagree with the history that was captured.
      written += store.appendMarketSnapshots(row.quotes as readonly MarketSnapshot[]);
      captures += 1;
    }
    console.log(`seeded ${captures} capture(s), ${written} snapshot row(s) from ${historyPath}`);
    if (malformed > 0) {
      console.log(`WARNING: ${malformed} unparseable line(s) skipped and left in place`);
    }
    return 0;
  } finally {
    store.close();
  }
}

process.exit(main());

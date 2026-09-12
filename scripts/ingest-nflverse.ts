/**
 * PlayerTicker live nflverse ingestion.
 *
 *   npm run ingest -- [--seasons 2026] [--as-of <iso>] [--mode live|replay] [options]
 *
 * Runs the PRODUCTION pipeline against nflverse's current releases and persists the result:
 *
 *   release discovery → asset fetch → checksummed capture → CSV decode → Phase 4 adapters
 *   → identity → snapshot → inference → readiness → engines → persistence → publication
 *
 * There is no ingestion logic in this file. It parses arguments, builds the composition
 * root, drives `POST /refresh` through the same application service the HTTP server uses,
 * and prints what happened. Deleting it would remove a convenience, not a capability.
 *
 * Modes:
 *   live     (default) fetch the current releases over the network and capture them.
 *   replay   re-run from previously captured payloads with the network unused. Given the
 *            same captures and the same --as-of this reproduces the run exactly, which is
 *            the property the `--verify-replay` flag checks automatically.
 *
 * Options:
 *   --seasons <list>      seasons to acquire, comma separated. Defaults to the CURRENT
 *                         season, derived from the clock (see src/ingestion/season.ts) —
 *                         there is no hard-coded year. Career counting stats span exactly
 *                         the seasons used, so widening this list widens the career window.
 *   --as-of <iso>         valuation as-of instant (default: now). Pin it for reproducibility.
 *   --db <path>           SQLite database path (default .local/playerticker.db)
 *   --captures <dir>      raw payload capture directory (default .local/captures)
 *   --sleeper             also acquire Sleeper identity for a cross-provider identity join
 *   --verify-replay       after a live run, replay the captures and assert the board matches
 *   --json                print the summary as JSON
 *
 * Exit code is non-zero when the refresh does not reach a published board, or when
 * --verify-replay detects any divergence.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { composeApi } from '@/api';
import { FilePayloadStore } from '@/transport/fileStore';
import { createLivePipeline } from '@/runtime';
import type { PersistenceStore } from '@/persistence';
import type { TransportConfigDescriptor } from '@/application';
import { describeSeasonSelection, isPlausibleSeason, resolveSeasons, type SeasonSource } from '@/ingestion/season';

const DEFAULT_DB = '.local/playerticker.db';
const DEFAULT_CAPTURES = '.local/captures';

interface Args {
  /** null until resolved — an unsupplied list is derived, never a hard-coded year. */
  seasons: number[] | null;
  careerSeasons: number[] | null;
  asOf: string;
  db: string;
  captures: string;
  mode: 'live' | 'replay';
  sleeper: boolean;
  verifyReplay: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seasons: null,
    careerSeasons: null,
    asOf: new Date().toISOString(),
    db: DEFAULT_DB,
    captures: DEFAULT_CAPTURES,
    mode: 'live',
    sleeper: false,
    verifyReplay: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--season':
      case '--career-seasons': {
        const parsed = next().split(',').map((x) => Number.parseInt(x.trim(), 10));
        if (parsed.some((y) => !isPlausibleSeason(y))) throw new Error('invalid --career-seasons');
        args.careerSeasons = parsed;
        break;
      }
      case '--seasons': {
        // Accepts one year or a comma-separated list: --seasons 2023,2024,2025
        const parsed = next().split(',').map((v) => Number(v.trim()));
        if (parsed.some((v) => !Number.isInteger(v) || v < 1999 || v > 2100)) throw new Error('invalid --season');
        args.seasons = parsed;
        break;
      }
      case '--as-of': {
        const v = next();
        if (Number.isNaN(Date.parse(v))) throw new Error('invalid --as-of');
        args.asOf = new Date(v).toISOString();
        break;
      }
      case '--db': args.db = next(); break;
      case '--captures': args.captures = next(); break;
      case '--mode': {
        const m = next();
        if (m !== 'live' && m !== 'replay') throw new Error('invalid --mode');
        args.mode = m;
        break;
      }
      case '--sleeper': args.sleeper = true; break;
      case '--verify-replay': args.verifyReplay = true; break;
      case '--json': args.json = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** `Args` after the season list has been resolved — what the run actually executes on. */
interface ResolvedArgs extends Omit<Args, 'seasons'> {
  readonly seasons: number[];
  readonly seasonSource: SeasonSource;
}

interface RunSummary {
  readonly mode: 'live' | 'replay';
  readonly seasons: readonly number[];
  /** 'explicit' when an operator named the seasons, 'derived' when taken from the clock. */
  readonly seasonSource: SeasonSource;
  readonly asOf: string;
  readonly published: boolean;
  readonly publicationId: string | null;
  readonly entryCount: number;
  readonly snapshotId: string | null;
  readonly valued: number;
  readonly byPosition: Record<string, { total: number; valued: number }>;
  readonly checksums: readonly string[];
}

/** Compose the stack, run one refresh, and read the published board back out. */
async function runOnce(args: ResolvedArgs, mode: 'live' | 'replay'): Promise<RunSummary> {
  mkdirSync(dirname(resolve(args.db)), { recursive: true });
  mkdirSync(resolve(args.captures), { recursive: true });

  let store!: PersistenceStore;
  const transport: TransportConfigDescriptor = { requiredProviders: ['nflverse'], replayEnabled: true };
  const composed = composeApi({
    dbPath: resolve(args.db),
    transport,
    pipeline: createLivePipeline({
      store: () => store,
      payloadStore: new FilePayloadStore(resolve(args.captures)),
      seasons: args.seasons,
      ...(args.careerSeasons ? { careerSeasons: args.careerSeasons } : {}),
      asOf: () => args.asOf,
      includeSleeper: args.sleeper,
      replayOnly: mode === 'replay',
    }),
  });
  store = composed.store;

  try {
    const ack = await composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
    const body = ack.body as { published?: boolean; publicationId?: string | null; failure?: unknown };
    if (body.failure) console.error('[ingest] refresh failure:', JSON.stringify(body.failure));

    const res = await composed.api.handle({ method: 'GET', path: '/publication', query: {} });
    if (res.status !== 200) {
      return {
        mode, seasons: args.seasons, seasonSource: args.seasonSource, asOf: args.asOf,
        published: false, publicationId: null, entryCount: 0, snapshotId: null,
        valued: 0, byPosition: {}, checksums: [],
      };
    }
    const pub = res.body as {
      publication: { publicationId: string; snapshotId: string | null; entryCount: number };
      entries: { position: string; composites: unknown }[];
    };

    const byPosition: Record<string, { total: number; valued: number }> = {};
    let valued = 0;
    for (const e of pub.entries) {
      const cell = (byPosition[e.position] ??= { total: 0, valued: 0 });
      cell.total += 1;
      if (e.composites !== null) {
        cell.valued += 1;
        valued += 1;
      }
    }

    const record = composed.store.getCurrentPublicationRecord();
    return {
      mode,
      seasons: args.seasons,
      seasonSource: args.seasonSource,
      asOf: args.asOf,
      published: Boolean(body.published),
      publicationId: pub.publication.publicationId,
      entryCount: pub.publication.entryCount,
      snapshotId: pub.publication.snapshotId,
      valued,
      byPosition,
      checksums: record ? [String(record.publicationId)] : [],
    };
  } finally {
    composed.close();
  }
}

function render(summary: RunSummary): string {
  const lines = [
    `mode          ${summary.mode}`,
    `seasons       ${summary.seasons.join(', ')} (${summary.seasonSource})`,
    `as-of         ${summary.asOf}`,
    `published     ${summary.published}`,
    `publication   ${summary.publicationId ?? '(none)'}`,
    `snapshot      ${summary.snapshotId ?? '(none)'}`,
    `entries       ${summary.entryCount}`,
    `valued        ${summary.valued}`,
    '',
    'position   entries   valued',
  ];
  for (const pos of Object.keys(summary.byPosition).sort()) {
    const cell = summary.byPosition[pos];
    lines.push(`${pos.padEnd(9)}${String(cell.total).padStart(8)}${String(cell.valued).padStart(9)}`);
  }
  return lines.join('\n');
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));

  // Resolve the season list ONCE, here, and say out loud where it came from. An unsupplied
  // list is derived from the clock, so a checkout that sits unused cannot keep ingesting the
  // season it was written in.
  const selection = resolveSeasons(parsed.seasons, new Date(parsed.asOf));
  if (!parsed.json) {
    console.log(`[ingest] seasons: ${describeSeasonSelection(selection)}`);
  }
  const args: ResolvedArgs = { ...parsed, seasons: [...selection.seasons], seasonSource: selection.source };

  const first = await runOnce(args, args.mode);
  console.log(args.json ? JSON.stringify(first, null, 2) : render(first));

  if (args.verifyReplay) {
    // Re-run from the captures with the network unused. The board must match exactly; any
    // divergence means a run is not reproducible from what was recorded.
    const replayed = await runOnce(args, 'replay');
    const same =
      replayed.snapshotId === first.snapshotId &&
      replayed.entryCount === first.entryCount &&
      replayed.valued === first.valued;
    console.log('');
    console.log(`replay verify  snapshot ${replayed.snapshotId} entries ${replayed.entryCount} valued ${replayed.valued}`);
    console.log(`replay verify  ${same ? 'MATCH' : 'DIVERGED'}`);
    if (!same) return 1;
  }

  return first.published && first.entryCount > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });

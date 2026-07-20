/**
 * PlayerTicker real-data pipeline CLI.
 *
 *   npm run pipeline -- [--mode fixture|live|validate] [options]
 *
 * Modes:
 *   fixture   (default) load committed raw snapshots, run the full pipeline,
 *             print a report. No network, no credentials — a fresh clone can run
 *             it immediately.
 *   live      refresh Sleeper metadata over the network (reusing the app's
 *             SleeperClient), then run the pipeline. nflverse uses its committed
 *             snapshot (a live CSV pull is a future stage). Writes captured raw
 *             snapshots to --out-snapshots when provided.
 *   validate  load + verify snapshot integrity and canonical validation only;
 *             exits non-zero on any integrity or validation failure.
 *
 * Options:
 *   --out <path>            write the JSON report to a file
 *   --json                  print the report as JSON (default: text)
 *   --snapshots <dir>       snapshot directory (default fixtures/pipeline/snapshots)
 *   --identity-map <path>   persisted identity map (default fixtures/pipeline/identity-map.json)
 *   --metrics <path>        future-stage metrics supplements (default fixtures/pipeline/metrics.sample.json)
 *   --out-snapshots <dir>   (live) write captured raw snapshots here
 *   --now <iso>             override the generation timestamp (determinism/testing)
 *
 * Exit code is non-zero for a TRUE pipeline failure (bad snapshot, nothing
 * loaded, corrupted identities) — ordinary missing optional data is reported,
 * not fatal.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, verifySnapshot, type RawSnapshot } from '@/pipeline/snapshot';
import { runPipeline, type PipelineConfig } from '@/pipeline/runPipeline';
import { renderReport } from '@/pipeline/report';
import type { IdentityMap } from '@/pipeline/identity';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import { DEFAULT_STALE_MAX_AGE_MS, PIPELINE_SCHEMA_VERSION } from '@/pipeline/constants';
import { SleeperClient } from '@/services/marketData/live/sleeperClient';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS = {
  snapshots: join(ROOT, 'fixtures', 'pipeline', 'snapshots'),
  identityMap: join(ROOT, 'fixtures', 'pipeline', 'identity-map.json'),
  metrics: join(ROOT, 'fixtures', 'pipeline', 'metrics.sample.json'),
};

type Mode = 'fixture' | 'live' | 'validate';

interface Args {
  mode: Mode;
  out?: string;
  json: boolean;
  snapshots: string;
  identityMap: string;
  metrics: string;
  outSnapshots?: string;
  now?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: 'fixture',
    json: false,
    snapshots: DEFAULTS.snapshots,
    identityMap: DEFAULTS.identityMap,
    metrics: DEFAULTS.metrics,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--mode': {
        const m = next();
        if (m !== 'fixture' && m !== 'live' && m !== 'validate') {
          throw new Error(`invalid --mode ${m}`);
        }
        args.mode = m;
        break;
      }
      case '--out': args.out = next(); break;
      case '--json': args.json = true; break;
      case '--snapshots': args.snapshots = next(); break;
      case '--identity-map': args.identityMap = next(); break;
      case '--metrics': args.metrics = next(); break;
      case '--out-snapshots': args.outSnapshots = next(); break;
      case '--now': args.now = next(); break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  return args;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadIdentityMap(path: string): IdentityMap {
  if (!existsSync(path)) return { version: 1, map: {} };
  const raw = readJson(path);
  // The map is our own artifact; a light shape check is enough.
  if (raw && typeof raw === 'object' && 'map' in raw) return raw as IdentityMap;
  throw new Error(`identity map at ${path} is malformed`);
}

function loadMetrics(path: string): MetricsSupplements {
  if (!existsSync(path)) return {};
  const raw = readJson(path) as Record<string, unknown>;
  return {
    wr: (raw.wr as MetricsSupplements['wr']) ?? {},
    rb: (raw.rb as MetricsSupplements['rb']) ?? {},
    te: (raw.te as MetricsSupplements['te']) ?? {},
  };
}

// Load + verify the committed snapshots. Integrity failures are collected (not
// thrown) so the report can name them and the process can exit non-zero.
function loadSnapshots(dir: string): { snapshots: RawSnapshot[]; failures: string[] } {
  const snapshots: RawSnapshot[] = [];
  const failures: string[] = [];
  for (const provider of ['sleeper', 'nflverse'] as const) {
    const path = join(dir, `${provider}.snapshot.json`);
    if (!existsSync(path)) {
      failures.push(`missing snapshot for ${provider} at ${path}`);
      continue;
    }
    const result = verifySnapshot(readJson(path));
    if (result.ok) snapshots.push(result.snapshot);
    else failures.push(result.error);
  }
  return { snapshots, failures };
}

async function captureLiveSleeper(nowIso: string, outDir?: string): Promise<RawSnapshot> {
  const client = new SleeperClient();
  const payload = await client.getAllPlayers();
  const snapshot = buildSnapshot(payload, {
    provider: 'sleeper',
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    retrievedAt: nowIso,
    season: null,
  });
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'sleeper.snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  }
  return snapshot;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = args.now ?? new Date().toISOString();
  const asOf = generatedAt.slice(0, 10);

  let snapshots: RawSnapshot[] = [];
  const failures: string[] = [];

  if (args.mode === 'live') {
    // Refresh Sleeper over the network; keep nflverse from its committed
    // snapshot so a live run still resolves cross-provider identities.
    try {
      snapshots.push(await captureLiveSleeper(generatedAt, args.outSnapshots));
    } catch (err) {
      failures.push(`live Sleeper fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const nflPath = join(args.snapshots, 'nflverse.snapshot.json');
    if (existsSync(nflPath)) {
      const result = verifySnapshot(readJson(nflPath));
      if (result.ok) snapshots.push(result.snapshot);
      else failures.push(result.error);
    }
  } else {
    const loaded = loadSnapshots(args.snapshots);
    snapshots = loaded.snapshots;
    failures.push(...loaded.failures);
  }

  const config: PipelineConfig = {
    mode: args.mode,
    generatedAt,
    asOf,
    staleMaxAgeMs: DEFAULT_STALE_MAX_AGE_MS,
  };

  const { report } = runPipeline({
    snapshots,
    integrityFailures: failures,
    identityMap: loadIdentityMap(args.identityMap),
    supplements: loadMetrics(args.metrics),
    config,
  });

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  // eslint-disable-next-line no-console
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));

  const validateFailed = args.mode === 'validate' && report.validationRejections > 0;
  return report.ok && !validateFailed ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });

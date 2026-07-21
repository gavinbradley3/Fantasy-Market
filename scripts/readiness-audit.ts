/**
 * Readiness-frontier audit CLI. Runs the full fixture pipeline (metadata + all
 * free stages), then computes deterministic PLAYER-LEVEL counterfactuals: how
 * many players would become engine-READY if each category of missing field were
 * solved. It fabricates no values and runs no engine — it only simulates field
 * presence for the readiness completeness check.
 *
 *   npm run pipeline:readiness-audit [-- --json --out audit.json --now <iso>]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type PipelineConfig } from '@/pipeline/runPipeline';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import {
  bothFixtureSnapshots,
  buildStatsFixtureSnapshot,
  buildSnapFixtureSnapshot,
  buildParticipationFixtureSnapshot,
  loadIdentityMap,
} from '@/pipeline/test-support';
import { computeFrontier } from '@/pipeline/readiness-audit/frontier';
import { renderFrontier } from '@/pipeline/readiness-audit/render';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  json: boolean;
  out?: string;
  now: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, now: '2026-07-01T00:00:00.000Z' };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--json': args.json = true; break;
      case '--out': args.out = argv[++i]; break;
      case '--now': args.now = argv[++i]; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function authoredSupplements(): MetricsSupplements {
  const path = join(ROOT, 'fixtures', 'pipeline', 'metrics.sample.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return {
    wr: raw.wr as MetricsSupplements['wr'],
    rb: {},
    te: {},
    qb: raw.qb as MetricsSupplements['qb'],
  };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const config: PipelineConfig = {
    mode: 'fixture',
    generatedAt: args.now,
    asOf: args.now.slice(0, 10),
    staleMaxAgeMs: 48 * 60 * 60 * 1000,
  };
  const statsOptions = { currentSeason: 2025, includePostseason: false };

  const { readiness } = runPipeline({
    snapshots: bothFixtureSnapshots(),
    identityMap: loadIdentityMap(),
    supplements: authoredSupplements(),
    config,
    statsSnapshots: [buildStatsFixtureSnapshot()],
    statsOptions,
    snapSnapshots: [buildSnapFixtureSnapshot()],
    snapOptions: statsOptions,
    participationSnapshots: [buildParticipationFixtureSnapshot()],
    participationOptions: statsOptions,
  });

  const frontier = computeFrontier(readiness, args.now);

  if (args.out) writeFileSync(args.out, JSON.stringify(frontier, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(args.json ? JSON.stringify(frontier, null, 2) : renderFrontier(frontier));
  return 0;
}

process.exit(main());

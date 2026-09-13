/**
 * Explicit non-serving PlayerTicker evaluation.
 *
 * Every identity-bearing input is required on the command line. This command never opens the
 * production database, never calls persistence/publication, and refuses serving output paths.
 * Captures are ordinary raw transport envelopes; the emitted diagnostic records the exact
 * configuration, coordinates, checksums, model versions, and replay inputs that interpret them.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FilePayloadStore } from '@/transport/fileStore';
import {
  EXPERIMENTAL_IN_SEASON_CONFIGURATION,
  evaluateExperimentalInSeason,
  type ExperimentalInSeasonConfigurationId,
} from '@/runtime';

interface Args {
  configurationId: string | null;
  seasons: number[] | null;
  careerSeasons: number[];
  asOf: string | null;
  mode: 'live' | 'replay' | null;
  captures: string | null;
  outputDir: string | null;
  includeSleeper: boolean;
  codeSha: string | null;
  codeTree: string | null;
}

function list(value: string): number[] {
  const parsed = value.split(',').map((part) => Number(part.trim()));
  if (parsed.some((season) => !Number.isInteger(season))) throw new Error('season lists must contain integers');
  return parsed;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    configurationId: null,
    seasons: null,
    careerSeasons: [],
    asOf: null,
    mode: null,
    captures: null,
    outputDir: null,
    includeSleeper: true,
    codeSha: null,
    codeTree: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = (flag: string) => {
      const value = argv[++i];
      if (!value) throw new Error(`${flag} requires a value`);
      return value;
    };
    switch (argv[i]) {
      case '--config': args.configurationId = next('--config'); break;
      case '--seasons': args.seasons = list(next('--seasons')); break;
      case '--career-seasons': args.careerSeasons = list(next('--career-seasons')); break;
      case '--as-of': args.asOf = next('--as-of'); break;
      case '--mode': {
        const value = next('--mode');
        if (value !== 'live' && value !== 'replay') throw new Error('--mode must be live or replay');
        args.mode = value;
        break;
      }
      case '--captures': args.captures = next('--captures'); break;
      case '--output-dir': args.outputDir = next('--output-dir'); break;
      case '--code-sha': args.codeSha = next('--code-sha'); break;
      case '--code-tree': args.codeTree = next('--code-tree'); break;
      case '--no-sleeper': args.includeSleeper = false; break;
      case '--sleeper': args.includeSleeper = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function required(value: string | null, flag: string): string {
  if (!value) throw new Error(`${flag} is required; experimental activation is never inferred`);
  return value;
}

function isolatedOutputDirectory(value: string): string {
  const output = resolve(value);
  const forbidden = [resolve('site-data'), resolve('dist/data')];
  if (forbidden.some((dir) => output === dir || output.startsWith(`${dir}${sep}`))) {
    throw new Error('experimental output cannot target site-data or dist/data');
  }
  return output;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const configurationId = required(args.configurationId, '--config');
  if (configurationId !== EXPERIMENTAL_IN_SEASON_CONFIGURATION.id) {
    throw new Error(`--config must equal ${EXPERIMENTAL_IN_SEASON_CONFIGURATION.id}`);
  }
  if (!args.seasons) throw new Error('--seasons is required; the experiment never derives a season from the clock');
  const asOf = required(args.asOf, '--as-of');
  const mode = required(args.mode, '--mode') as 'live' | 'replay';
  const captures = resolve(required(args.captures, '--captures'));
  const outputDir = isolatedOutputDirectory(required(args.outputDir, '--output-dir'));
  const codeIdentity = { sha: required(args.codeSha, '--code-sha'), tree: required(args.codeTree, '--code-tree') };

  const result = await evaluateExperimentalInSeason(
    {
      configurationId: configurationId as ExperimentalInSeasonConfigurationId,
      valuationSeasons: args.seasons,
      careerSeasons: args.careerSeasons,
      asOf,
      mode,
      includeSleeper: args.includeSleeper,
      codeIdentity,
    },
    { payloadStore: new FilePayloadStore(captures) },
  );

  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${result.evaluationId}.json`);
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({
    evaluationId: result.evaluationId,
    outputPath,
    configurationId: result.configuration.id,
    experimentalEvaluationComplete: result.experimentalEvaluationComplete,
    productionPublicationAuthorized: result.configuration.productionPublicationAuthorized,
  }));
  return result.experimentalEvaluationComplete ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    });
}

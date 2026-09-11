/**
 * Sleeper reachability + schema verification.
 *
 *   npm run verify:sleeper -- [--json] [--timeout 20000]
 *
 * WHY THIS SCRIPT EXISTS
 * PlayerTicker's Sleeper integration cannot be exercised from inside the Claude Code sandbox:
 * that environment's organization-level egress policy refuses CONNECT to `api.sleeper.app`
 * before any request reaches Sleeper. That is a property of the sandbox, not of Sleeper and
 * not of this code — so the integration must not be judged by it, and must not be deleted
 * because of it. This script is the way to settle the question from a machine that can reach
 * the open internet.
 *
 * WHAT IT DOES
 * Requests the exact endpoints the transport layer is configured to use, reports the HTTP
 * status, validates the response against the SAME zod schema the pipeline validates with, and
 * reports row counts. It makes no code changes, writes no files, and opens no database.
 *
 * IT IS NOT A TEST, ON PURPOSE. `npm test` must stay deterministic and offline; a suite that
 * needs the internet fails for reasons that have nothing to do with the code under test. The
 * classification and schema-validation logic lives in `@/diagnostics` and IS unit-tested
 * there, without a socket; this file is only the part that cannot be.
 *
 * Exit code 0 = every check succeeded. Non-zero = something to look at, and the classification
 * says what kind of something.
 */

import { SLEEPER_DEFAULT_BASE_URL } from '@/transport';
import {
  classifyHttpFailure,
  classifySleeperFailure,
  summarizeChecks,
  validateSleeperPlayers,
  validateSleeperTrending,
  type SleeperCheck,
} from '@/diagnostics';

interface Args {
  json: boolean;
  timeoutMs: number;
  baseUrl: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, timeoutMs: 30_000, baseUrl: SLEEPER_DEFAULT_BASE_URL };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--json': args.json = true; break;
      case '--timeout': args.timeoutMs = Number.parseInt(argv[++i], 10); break;
      case '--base-url': args.baseUrl = argv[++i]; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout must be a positive integer');
  return args;
}

/** The endpoints the transport layer and the live market-data service actually call. */
interface Endpoint {
  readonly name: string;
  readonly path: string;
  readonly purpose: string;
  readonly validate: (body: unknown) => { ok: true; rows: number; detail: string } | { ok: false; detail: string };
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    name: 'players',
    path: '/players/nfl',
    purpose: 'identity + metadata (the capability registered for live transport)',
    validate: validateSleeperPlayers,
  },
  {
    name: 'trending-add',
    path: '/players/nfl/trending/add?lookback_hours=24&limit=25',
    purpose: 'market ACTIVITY signal — never a dynasty value',
    validate: validateSleeperTrending,
  },
  {
    name: 'trending-drop',
    path: '/players/nfl/trending/drop?lookback_hours=24&limit=25',
    purpose: 'market ACTIVITY signal — never a dynasty value',
    validate: validateSleeperTrending,
  },
];

async function check(endpoint: Endpoint, args: Args): Promise<SleeperCheck> {
  const url = `${args.baseUrl}${endpoint.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const elapsedMs = Date.now() - startedAt;
    if (!res.ok) {
      // The body is read before classifying: an intermediary that terminates TLS answers with
      // an ordinary HTTP response, and its identity is in the headers and the body, not in an
      // exception. Reading it is what stops Sleeper being blamed for a local policy.
      const bodyText = await res.text().catch(() => '');
      const classified = classifyHttpFailure({
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        bodyText,
      });
      return {
        name: endpoint.name, url, purpose: endpoint.purpose, elapsedMs,
        classification: classified.classification,
        httpStatus: res.status,
        rows: null,
        detail: classified.detail,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      return {
        name: endpoint.name, url, purpose: endpoint.purpose, elapsedMs,
        classification: 'SCHEMA_MISMATCH', httpStatus: res.status, rows: null,
        detail: `200 OK but the body is not JSON: ${(err as Error).message}`,
      };
    }
    const verdict = endpoint.validate(body);
    return verdict.ok
      ? {
          name: endpoint.name, url, purpose: endpoint.purpose, elapsedMs,
          classification: 'SUCCESS', httpStatus: res.status, rows: verdict.rows, detail: verdict.detail,
        }
      : {
          name: endpoint.name, url, purpose: endpoint.purpose, elapsedMs,
          classification: 'SCHEMA_MISMATCH', httpStatus: res.status, rows: null, detail: verdict.detail,
        };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const classified = classifySleeperFailure(err);
    return {
      name: endpoint.name, url, purpose: endpoint.purpose, elapsedMs,
      classification: classified.classification, httpStatus: null, rows: null, detail: classified.detail,
    };
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  // Sequential, not parallel: the players payload is ~5MB, and Sleeper's own docs ask callers
  // to fetch it sparingly. A verification script should be a polite client.
  const checks: SleeperCheck[] = [];
  for (const endpoint of ENDPOINTS) checks.push(await check(endpoint, args));

  const summary = summarizeChecks(checks, args.baseUrl);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`sleeper base url   ${summary.baseUrl}`);
    console.log(`overall            ${summary.overall}`);
    console.log('');
    for (const c of summary.checks) {
      console.log(`${c.name.padEnd(14)} ${c.classification.padEnd(22)} ${String(c.httpStatus ?? '—').padStart(4)}  ${String(c.rows ?? '—').padStart(6)} rows  ${c.elapsedMs}ms`);
      console.log(`${''.padEnd(14)} ${c.purpose}`);
      console.log(`${''.padEnd(14)} ${c.detail}`);
      console.log('');
    }
    console.log(summary.advice);
  }

  return summary.overall === 'SUCCESS' ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });

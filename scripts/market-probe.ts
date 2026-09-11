/**
 * LIVE dynasty-market probe (prototype).
 *
 *   npm run market:probe -- [--format dynasty_superflex|dynasty_1qb] [--db <path>] [--json]
 *
 * Fetches DynastyProcess's published value table and id crosswalk, adapts them through
 * src/market, resolves every row to a PlayerTicker canonical id with the pipeline's OWN
 * resolver, and appends the result to an append-only snapshot store.
 *
 * DELIBERATELY SEPARATE from `npm test`. This talks to the network, so it is a script rather
 * than a test: the deterministic suite must never depend on internet access. The offline
 * tests in src/market/*.test.ts cover the parsing, identity and storage logic.
 *
 * This is a PROTOTYPE. It writes to its own database (default .local/market.db) and is not
 * wired into any market page — /market, /watchlist, /portfolio and /player/:ticker continue
 * to render the clearly-labelled synthetic demo pool.
 *
 * Source: https://github.com/dynastyprocess/data (GPL-3.0; published "for the purpose of
 * supporting apps and developers"). Values originate from FantasyPros consensus — see the
 * report for the redistribution caveat before any public re-publication of these numbers.
 */

import { resolve } from 'node:path';
import { adaptDynastyProcess, openMarketStore } from '@/market';
import type { DynastyProcessIdRow, DynastyProcessValueRow } from '@/market';
import type { MarketFormat } from '@/market';

const VALUES_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv';
const IDS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';
const DEFAULT_DB = '.local/market.db';

/** Players printed as the end-to-end proof. */
const SAMPLE = ['Josh Allen', 'Patrick Mahomes II', 'Justin Jefferson', 'Bijan Robinson', 'Trey McBride'];

interface Args {
  format: MarketFormat;
  db: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { format: 'dynasty_superflex', db: DEFAULT_DB, json: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--format': {
        const f = next();
        if (f !== 'dynasty_superflex' && f !== 'dynasty_1qb') throw new Error('invalid --format');
        args.format = f;
        break;
      }
      case '--db': args.db = next(); break;
      case '--json': args.json = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** Minimal RFC4180-ish CSV reader: handles quoted fields and embedded commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { headers: { accept: 'text/csv' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return parseCsv(await res.text());
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const ingestedAt = new Date().toISOString();

  const [valueRows, idRows] = await Promise.all([
    fetchCsv(VALUES_URL) as Promise<DynastyProcessValueRow[]>,
    fetchCsv(IDS_URL) as Promise<DynastyProcessIdRow[]>,
  ]);

  const batch = adaptDynastyProcess(valueRows, idRows, { format: args.format, ingestedAt });

  const store = openMarketStore(resolve(args.db));
  let written = 0;
  try {
    written = store.append(batch.snapshots);

    const samples = SAMPLE.map((name) => {
      const src = valueRows.find((v) => v.player === name);
      const snap = src ? batch.snapshots.find((s) => s.sourcePlayerId === src.fp_id) : undefined;
      return {
        name,
        sourcePlayerId: snap?.sourcePlayerId ?? null,
        canonicalPlayerId: snap?.canonicalPlayerId ?? null,
        position: snap?.sourcePosition ?? null,
        team: snap?.sourceTeam ?? null,
        value: snap?.value ?? null,
        overallRank: snap?.overallRank ?? null,
        positionRank: snap?.positionRank ?? null,
        sourceConsensusRank: snap?.sourceConsensusRank ?? null,
        freshness: snap?.freshness ?? null,
        historyRows: snap
          ? store.history(snap.canonicalPlayerId, batch.source, batch.format).length
          : 0,
      };
    });

    const summary = {
      source: batch.source,
      format: batch.format,
      sourceTimestamp: batch.sourceTimestamp,
      ingestedAt,
      sourceRows: valueRows.length,
      crosswalkRows: idRows.length,
      snapshots: batch.snapshots.length,
      rejections: batch.rejections.length,
      rejectionReasons: batch.rejections.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] ?? 0) + 1;
        return acc;
      }, {}),
      appendedRows: written,
      captureInstants: store.distinctCaptureInstants(batch.source, batch.format).length,
      samples,
    };

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`source        ${summary.source} (${summary.format})`);
      console.log(`source stamp  ${summary.sourceTimestamp}`);
      console.log(`rows          ${summary.sourceRows} values, ${summary.crosswalkRows} crosswalk`);
      console.log(`resolved      ${summary.snapshots} snapshots, ${summary.rejections} rejected ${JSON.stringify(summary.rejectionReasons)}`);
      console.log(`appended      ${summary.appendedRows} new rows (${summary.captureInstants} capture instants stored)`);
      console.log('');
      console.log('name                  source_id  canonical_id            pos team  value  ovr  pos#  ecr   hist');
      for (const s of samples) {
        console.log(
          `${(s.name ?? '').padEnd(21)} ${(s.sourcePlayerId ?? '-').padEnd(10)} ${(s.canonicalPlayerId ?? 'UNRESOLVED').padEnd(23)} ` +
          `${(s.position ?? '-').padEnd(3)} ${(s.team ?? '-').padEnd(5)} ${String(s.value ?? '-').padStart(6)} ` +
          `${String(s.overallRank ?? '-').padStart(4)} ${String(s.positionRank ?? '-').padStart(5)} ` +
          `${String(s.sourceConsensusRank ?? '-').padStart(5)} ${String(s.historyRows).padStart(5)}`,
        );
      }
    }
    return batch.snapshots.length > 0 ? 0 : 1;
  } finally {
    store.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });

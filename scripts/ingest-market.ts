/**
 * EXTERNAL dynasty market ingestion.
 *
 *   npm run ingest:market -- [--format dynasty_superflex|dynasty_1qb] [--db <path>]
 *                            [--dry-run] [--json] [--samples "A,B"]
 *
 * Fetches DynastyProcess's published dynasty value table and its id crosswalk, resolves every
 * row to a PlayerTicker canonical id through the pipeline's OWN IdentityResolver, and appends
 * the result to the `market_snapshot` table in the production database.
 *
 * WHAT THIS IS NOT. It is not a valuation run and it does not touch a publication. Market
 * values live in their own table, beside the model, never inside it. `/board` compares the two
 * and shows which is which; nothing here merges them.
 *
 * APPEND-ONLY. Each run writes a new capture. Yesterday's rows are untouched, because every
 * movement window is reconstructed from successive captures — an overwrite would not lose a
 * number, it would lose the ability to say anything moved.
 *
 * NOT A TEST. This talks to the network, so it is a script: the deterministic suite must never
 * depend on internet access. The offline tests in src/market/*.test.ts and
 * src/persistence/market.test.ts cover the parsing, identity, comparison and storage logic.
 *
 * SOURCE + LICENSING. github.com/dynastyprocess/data, GPL-3.0, published "for the purpose of
 * supporting apps and developers". The values derive from FantasyPros expert consensus, whose
 * republication rights that licence does not settle — see docs/MARKET_DATA_SOURCES.md. This
 * ingests for internal model-vs-market comparison and stores only the fields it compares.
 */

import { resolve } from 'node:path';
import { PersistenceStore } from '@/persistence';
import {
  DYNASTYPROCESS_IDS_URL,
  DYNASTYPROCESS_VALUES_URL,
  adaptDynastyProcess,
  fetchCsv,
} from '@/market';
import type { DynastyProcessIdRow, DynastyProcessValueRow, MarketFormat } from '@/market';

const DEFAULT_DB = '.local/playerticker.db';

/** Players printed as the end-to-end proof, one per position. */
const DEFAULT_SAMPLES = ['Josh Allen', 'Patrick Mahomes II', 'Justin Jefferson', 'Bijan Robinson', 'Trey McBride'];

interface Args {
  format: MarketFormat;
  db: string;
  dryRun: boolean;
  json: boolean;
  samples: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: 'dynasty_superflex',
    db: process.env.PLAYERTICKER_DB || DEFAULT_DB,
    dryRun: false,
    json: false,
    samples: DEFAULT_SAMPLES,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--format': {
        const f = next();
        if (f !== 'dynasty_superflex' && f !== 'dynasty_1qb') {
          throw new Error('--format must be dynasty_superflex or dynasty_1qb');
        }
        args.format = f;
        break;
      }
      case '--db': args.db = next(); break;
      case '--dry-run': args.dryRun = true; break;
      case '--json': args.json = true; break;
      case '--samples': args.samples = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const ingestedAt = new Date().toISOString();

  const [valueRows, idRows] = await Promise.all([
    fetchCsv(DYNASTYPROCESS_VALUES_URL) as Promise<DynastyProcessValueRow[]>,
    fetchCsv(DYNASTYPROCESS_IDS_URL) as Promise<DynastyProcessIdRow[]>,
  ]);

  const batch = adaptDynastyProcess(valueRows, idRows, { format: args.format, ingestedAt });

  // Every rejection is counted and reported by reason. A run that silently dropped a third of
  // the league would otherwise look exactly like a healthy one.
  const rejectionsByReason = batch.rejections.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  const validValues = batch.snapshots.filter((s) => s.value !== null).length;

  const store = args.dryRun ? null : PersistenceStore.open(resolve(args.db));
  try {
    const stored = store ? store.appendMarketSnapshots(batch.snapshots) : 0;
    const captureInstants = store ? store.getMarketCaptureInstants(batch.source, batch.format) : [];

    const samples = args.samples.map((name) => {
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
        historyRows:
          snap && store
            ? store.getMarketSnapshotHistory(snap.canonicalPlayerId, batch.source, batch.format).length
            : 0,
      };
    });

    const summary = {
      source: batch.source,
      format: batch.format,
      sourceDate: batch.sourceVersion,
      sourceTimestamp: batch.sourceTimestamp,
      ingestedAt,
      database: args.dryRun ? null : resolve(args.db),
      sourceRows: valueRows.length,
      crosswalkRows: idRows.length,
      validValues,
      resolved: batch.snapshots.length,
      unresolved: batch.rejections.length,
      rejectionsByReason,
      snapshotsStored: stored,
      captureInstants: captureInstants.length,
      samples,
    };

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`source rows          ${summary.sourceRows} (crosswalk ${summary.crosswalkRows})`);
      console.log(`valid values         ${summary.validValues}`);
      console.log(`resolved identities  ${summary.resolved}`);
      console.log(`unresolved           ${summary.unresolved} ${JSON.stringify(summary.rejectionsByReason)}`);
      console.log(`snapshots stored     ${summary.snapshotsStored}${args.dryRun ? ' (dry run — nothing written)' : ''}`);
      console.log(`source date          ${summary.sourceDate ?? 'not published'} (${summary.sourceTimestamp})`);
      console.log(`source / format      ${summary.source} / ${summary.format}`);
      console.log(`database             ${summary.database ?? '—'} (${summary.captureInstants} capture instants held)`);
      console.log('');
      console.log('name                  source_id  canonical_id            pos team  value  ovr  pos#  ecr   hist');
      for (const s of samples) {
        console.log(
          `${s.name.padEnd(21)} ${(s.sourcePlayerId ?? '-').padEnd(10)} ${(s.canonicalPlayerId ?? 'UNRESOLVED').padEnd(23)} ` +
          `${(s.position ?? '-').padEnd(3)} ${(s.team ?? '-').padEnd(5)} ${String(s.value ?? '-').padStart(6)} ` +
          `${String(s.overallRank ?? '-').padStart(4)} ${String(s.positionRank ?? '-').padStart(5)} ` +
          `${String(s.sourceConsensusRank ?? '-').padStart(5)} ${String(s.historyRows).padStart(5)}`,
        );
      }
    }

    // A run that resolved nothing is a failure, not an empty market.
    return batch.snapshots.length > 0 ? 0 : 1;
  } finally {
    store?.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });

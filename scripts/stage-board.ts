/**
 * Stage a refreshed board for review.
 *
 *   npm run stage:board -- --candidate <dir> --reference <board.json> --out <dir> [--allow-pending-review]
 *
 * Reads a candidate export (board.json + status.json from `export:site-data`), compares it with a
 * reference board (normally the current production board), and writes to --out:
 *
 *   board.json, status.json   the candidate, unchanged
 *   staging-manifest.json     valuation checksum (content only) kept apart from publication
 *                             metadata (timestamps, run id), per-position counts, and the
 *                             ranking-change report against the reference
 *
 * A large ranking change is NEVER approved automatically. When the guard returns
 * REVIEW_REQUIRED the manifest records `reviewStatus: "PENDING_OWNER_REVIEW"` and the command
 * exits 3, unless either:
 *   --allow-pending-review     staging only: the pending board may be written to the staging
 *                              branch for inspection; it is still marked PENDING_OWNER_REVIEW.
 *   --approve <checksum>       an owner reviewed a staged board and approved THAT valuation
 *                              checksum. Accepted only if it equals this candidate's checksum, so
 *                              approval of one board can never carry over to a different one.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareRankings, type RankedEntry } from '@/ops/rankingChange';
import { valuationChecksum } from '@/ops/valuationChecksum';

interface Args {
  candidate: string;
  reference: string | null;
  out: string;
  allowPendingReview: boolean;
  approve: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { candidate: '', reference: null, out: '', allowPendingReview: false, approve: null };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--candidate': args.candidate = resolve(next()); break;
      case '--reference': args.reference = resolve(next()); break;
      case '--out': args.out = resolve(next()); break;
      case '--allow-pending-review': args.allowPendingReview = true; break;
      case '--approve': args.approve = next().trim() || null; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!args.candidate || !args.out) throw new Error('usage: --candidate <dir> --out <dir> [--reference <board.json>] [--allow-pending-review]');
  return args;
}

interface BoardDoc {
  publication: Record<string, unknown> & { publishedAt: string; entryCount: number };
  entries: (Record<string, unknown> & { canonicalId: string; position: string; name: string | null; dynastyOverallRank: number | null; outputStatus: string | null })[];
}

const ranked = (b: BoardDoc): RankedEntry[] =>
  b.entries.map((e) => ({ canonicalId: e.canonicalId, name: e.name, position: e.position, overallRank: e.dynastyOverallRank }));

export function stage(args: Args): { exitCode: number; manifest: Record<string, unknown> } {
  const boardPath = join(args.candidate, 'board.json');
  if (!existsSync(boardPath)) throw new Error(`candidate board is missing: ${boardPath}`);
  const candidate = JSON.parse(readFileSync(boardPath, 'utf8')) as BoardDoc;

  const byPosition: Record<string, { entries: number; valued: number }> = {};
  for (const e of candidate.entries) {
    const slot = (byPosition[e.position] ??= { entries: 0, valued: 0 });
    slot.entries += 1;
    if (e.dynastyOverallRank !== null) slot.valued += 1;
  }

  const reference = args.reference ? (JSON.parse(readFileSync(args.reference, 'utf8')) as BoardDoc) : null;
  const change = reference ? compareRankings(ranked(reference), ranked(candidate)) : null;
  const checksum = valuationChecksum(candidate.entries);
  const reviewStatus =
    change === null
      ? 'NO_REFERENCE'
      : change.verdict === 'PASS'
        ? 'NOT_REQUIRED'
        : args.approve !== null && args.approve === checksum
          ? 'APPROVED_BY_OWNER'
          : 'PENDING_OWNER_REVIEW';

  const manifest = {
    schema: 'playerticker.staging-manifest/v1',
    // CONTENT. Identical for two runs over the same captures at the same as-of.
    valuation: {
      checksum,
      boardChecksum: candidate.publication.boardChecksum ?? null,
      publicationId: candidate.publication.publicationId ?? null,
      snapshotId: candidate.publication.snapshotId ?? null,
      asOf: candidate.entries.find((e) => typeof e.asOf === 'string')?.asOf ?? null,
      entryCount: candidate.entries.length,
      byPosition,
    },
    // METADATA. Changes on every run, including a byte-identical replay.
    metadata: {
      publishedAt: candidate.publication.publishedAt,
      runId: candidate.publication.runId ?? null,
    },
    reference: reference
      ? {
          publicationId: reference.publication.publicationId ?? null,
          publishedAt: reference.publication.publishedAt,
          valuationChecksum: valuationChecksum(reference.entries),
        }
      : null,
    rankingChange: change,
    reviewStatus,
    approvedChecksum: args.approve,
  };

  mkdirSync(args.out, { recursive: true });
  copyFileSync(boardPath, join(args.out, 'board.json'));
  const statusPath = join(args.candidate, 'status.json');
  if (existsSync(statusPath)) copyFileSync(statusPath, join(args.out, 'status.json'));
  writeFileSync(join(args.out, 'staging-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const pending = reviewStatus === 'PENDING_OWNER_REVIEW';
  return { exitCode: pending && !args.allowPendingReview ? 3 : 0, manifest };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const { exitCode, manifest } = stage(args);
  const m = manifest as { valuation: { checksum: string; entryCount: number }; reviewStatus: string; rankingChange: { verdict: string; reasons: string[] } | null };
  console.log(`valuation checksum  ${m.valuation.checksum}`);
  console.log(`entries             ${m.valuation.entryCount}`);
  console.log(`ranking change      ${m.rankingChange?.verdict ?? 'no reference'}`);
  for (const r of m.rankingChange?.reasons ?? []) console.log(`  - ${r}`);
  console.log(`review status       ${m.reviewStatus}`);
  if (exitCode === 3) {
    console.error(
      '::error::ranking change requires owner review. Review staging-manifest.json, then re-run with ' +
        `--approve ${m.valuation.checksum} to accept exactly this board.`,
    );
  }
  return exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();

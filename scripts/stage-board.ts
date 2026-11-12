/**
 * Stage a refreshed board for review.
 *
 *   npm run stage:board -- --candidate <dir> --verification <verification.json> --run-log <log>
 *                          [--reference <board.json>] --out <dir> [--allow-pending-review | --approve <checksum>]
 *
 * Reads a candidate export (board.json + status.json from `export:site-data`), compares it with a
 * reference board (normally the current production board), and writes to --out:
 *
 *   board.json, status.json   the candidate, unchanged
 *   verification.json         the verify:staging report FOR THIS BOARD (refused if it names another)
 *   run-log.txt               the ingest output of the run that produced this board
 *   REVIEW.md                 generated from the manifest and verification, never hand-written
 *   staging-manifest.json     valuation checksum (content only) kept apart from publication
 *                             metadata (timestamps, run id), per-position counts, the
 *                             ranking-change report, and the SHA-256 of every file above
 *
 * --out is emptied first, so an earlier run's review can never sit beside a new board.
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

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  verification: string;
  runLog: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { candidate: '', reference: null, out: '', allowPendingReview: false, approve: null, verification: '', runLog: '' };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--candidate': args.candidate = resolve(next()); break;
      case '--reference': args.reference = resolve(next()); break;
      case '--out': args.out = resolve(next()); break;
      case '--allow-pending-review': args.allowPendingReview = true; break;
      case '--approve': args.approve = next().trim() || null; break;
      case '--verification': args.verification = resolve(next()); break;
      case '--run-log': args.runLog = resolve(next()); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!args.candidate || !args.out || !args.verification || !args.runLog) {
    throw new Error('usage: --candidate <dir> --verification <file> --run-log <file> --out <dir> [--reference <board.json>] [--allow-pending-review | --approve <checksum>]');
  }
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

  // The verification report must describe THIS board, and must have passed.
  const verification = JSON.parse(readFileSync(args.verification, 'utf8')) as { publicationId?: unknown; hardPass?: unknown };
  if (verification.publicationId !== candidate.publication.publicationId) {
    throw new Error(
      `verification report is for ${String(verification.publicationId)}, not this board (${String(candidate.publication.publicationId)})`,
    );
  }
  if (!existsSync(args.runLog)) throw new Error(`run log is missing: ${args.runLog}`);

  // A fresh directory every time: nothing from an earlier run can remain beside this board.
  rmSync(args.out, { recursive: true, force: true });
  mkdirSync(args.out, { recursive: true });
  copyFileSync(boardPath, join(args.out, 'board.json'));
  const statusPath = join(args.candidate, 'status.json');
  if (existsSync(statusPath)) copyFileSync(statusPath, join(args.out, 'status.json'));
  copyFileSync(args.verification, join(args.out, 'verification.json'));
  copyFileSync(args.runLog, join(args.out, 'run-log.txt'));
  writeFileSync(join(args.out, 'REVIEW.md'), renderReview(manifest, verification as Record<string, unknown>));

  const sha = (f: string) => createHash('sha256').update(readFileSync(join(args.out, f))).digest('hex');
  const artifacts = Object.fromEntries(
    ['board.json', 'status.json', 'verification.json', 'run-log.txt', 'REVIEW.md']
      .filter((f) => existsSync(join(args.out, f)))
      .map((f) => [f, sha(f)]),
  );
  writeFileSync(join(args.out, 'staging-manifest.json'), `${JSON.stringify({ ...manifest, artifacts, verificationPassed: verification.hardPass === true }, null, 2)}\n`);

  if (verification.hardPass !== true) return { exitCode: 1, manifest };
  const pending = reviewStatus === 'PENDING_OWNER_REVIEW';
  return { exitCode: pending && !args.allowPendingReview ? 3 : 0, manifest };
}

/** REVIEW.md, generated from the manifest and verification of this exact board. */
export function renderReview(manifest: Record<string, any>, verification: Record<string, any>): string {
  const v = manifest.valuation;
  const c = verification.checks ?? {};
  const rc = manifest.rankingChange;
  const lines: string[] = [];
  lines.push(`# Staging review: board as of ${v.asOf}`, '');
  lines.push(`Generated by \`stage:board\` from this directory's own files. Status: **${manifest.reviewStatus}**.`);
  lines.push('Not approved for production unless the status says APPROVED_BY_OWNER.', '');
  lines.push('## Identity', '', '| | |', '|---|---|');
  lines.push(`| Valuation checksum (content only) | \`${v.checksum}\` |`);
  lines.push(`| Board / publication id | \`${v.publicationId}\` |`);
  lines.push(`| Snapshot | \`${v.snapshotId}\` |`);
  lines.push(`| Published at (metadata) | ${manifest.metadata.publishedAt} |`);
  lines.push(`| Run id (metadata) | ${manifest.metadata.runId} |`, '');
  lines.push('## Coverage', '', '| Position | Entries | Valued |', '|---|---|---|');
  for (const [p, d] of Object.entries(v.byPosition as Record<string, { entries: number; valued: number }>).sort()) lines.push(`| ${p} | ${d.entries} | ${d.valued} |`);
  lines.push('', `## Verification (${verification.hardPass ? 'PASSED' : 'FAILED'})`, '');
  if (c.recency) lines.push(`- Recency: newest included kickoff ${c.recency.newestIncludedKickoff} (${c.recency.newestAgeDays} days before the as-of); newest game final by the as-of per the raw schedule ${c.recency.newestFinalKickoffInRawSchedule}. Kickoff sources: ${JSON.stringify(c.recency.kickoffSources)}.`);
  if (c.dates) lines.push(`- Dates (independent): ${c.dates.usableGameRecords} usable game records; ${c.dates.notInRawSchedule} not in the raw schedule, ${c.dates.notFinalByAsOf} not final by the as-of, ${c.dates.withoutFinalScore} without a final score. ${c.dates.rawWeeklyStatRowsWithNoScheduledGame} of ${c.dates.rawWeeklyStatRows} raw weekly rows had no scheduled game and were excluded.`);
  if (c.currentSeason) lines.push(`- Current season ${c.currentSeason.season}: ${c.currentSeason.gameRecords} game records, weeks ${(c.currentSeason.weeks ?? []).join(', ')}; ${c.currentSeason.boardPlayersWithCurrentSeasonGames} of ${c.currentSeason.boardEntries} board players have current-season games.`);
  if (c.teamAgreement) lines.push(`- Team vs latest weekly roster: ${c.teamAgreement.vsLatestWeeklyRoster.agree}/${c.teamAgreement.vsLatestWeeklyRoster.compared}; ${c.teamAgreement.entriesWithoutCurrentSeasonRoster} entries on no current roster. Vs latest game team: ${c.teamAgreement.vsLatestGameTeam.agree}/${c.teamAgreement.vsLatestGameTeam.compared}.`);
  if (c.experience) lines.push(`- Seasons completed: ${Object.entries(c.experience.seasonsCompleted ?? {}).map(([k, x]) => `${k} ${x}`).join(', ')}.`);
  if (c.noLeakage) lines.push(`- Leakage: ${c.noLeakage.violations.length} violations over ${c.noLeakage.factTimestampsChecked} fact stamps; ${c.noLeakage.excludedFutureFacts} excluded future facts.`);
  if (c.sources) lines.push(`- Failed sources: ${(c.sources.failed ?? []).map((s: any) => `${s.provider} ${s.capability} (${s.request_key}) required=${Boolean(s.required)} code=${s.error_code}`).join('; ') || 'none'}.`);
  lines.push('');
  if (rc) {
    lines.push('## Ranking change against the reference board', '', `Verdict **${rc.verdict}**.`);
    for (const r of rc.reasons) lines.push(`- ${r}`);
    const m = rc.metrics;
    lines.push('', `Spearman ${m.spearman === null ? 'n/a' : m.spearman.toFixed(3)} over ${m.commonRanked} players ranked on both boards; ${m.newlyRanked} newly ranked; ${m.droppedFromRanking} no longer ranked.`, '');
    lines.push('### Largest moves among the reference top 100', '', '| Reference rank | Staging rank | Pos | Player |', '|---|---|---|---|');
    for (const x of rc.largestMoves) lines.push(`| ${x.referenceRank} | ${x.candidateRank ?? 'unranked'} | ${x.position} | ${x.name} |`);
    lines.push('', '### New in the staging top 100', '', '| Staging rank | Pos | Player |', '|---|---|---|');
    for (const x of rc.newInCandidateTop) lines.push(`| ${x.candidateRank} | ${x.position} | ${x.name} |`);
    lines.push('');
  } else {
    lines.push('No reference board was supplied, so no ranking change was measured.', '');
  }
  lines.push('Causes of individual moves are not inferred here. See docs/MODEL_SANITY_INVESTIGATION.md for traced explanations.');
  return `${lines.join('\n')}\n`;
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

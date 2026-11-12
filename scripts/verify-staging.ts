/**
 * Measure a refreshed board against the Phase 1 acceptance checks, from the run's own database.
 *
 *   npm run verify:staging -- --db <run.db> --board <board.json> [--out report.json]
 *
 * Reports, and exits non-zero if any HARD check fails:
 *   1. data recency      newest regular-season game is at or before the as-of and < 8 days old
 *   2. current-season    the as-of season contributes real game observations to the board
 *   3. team agreement    published team = latest as-of-season weekly roster team (>= 99%), with a
 *                        second, independent comparison against each player's latest game team
 *   4. experience        named reference players' completed seasons (informational)
 *   5. no leakage        no game, fact or time-varying field attested after the as-of
 *   6. sources           every failed source, by name, with its required flag and error code
 *
 * Nothing here recomputes a valuation; it reads what the pipeline persisted.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nflSeasonOf } from '@/ingestion/weekTiming';

interface Args { db: string; board: string; out: string | null }

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { db: '', board: '', out: null };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--db': a.db = resolve(next()); break;
      case '--board': a.board = resolve(next()); break;
      case '--out': a.out = resolve(next()); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!a.db || !a.board) throw new Error('usage: --db <run.db> --board <board.json> [--out report.json]');
  return a;
}

type Rec = Record<string, unknown>;
const DAY = 86_400_000;
const REFERENCE_PLAYERS = ['brock purdy', 'c.j. stroud', 'patrick mahomes', 'josh allen'];

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(args.db, { readOnly: true });
  const board = JSON.parse(readFileSync(args.board, 'utf8')) as { publication: Rec; entries: Rec[] };

  const pub = db.prepare('SELECT run_id, snapshot_id FROM publication WHERE publication_id = ?').get(board.publication.publicationId as string) as { run_id: string; snapshot_id: string } | undefined;
  if (!pub) throw new Error(`publication ${String(board.publication.publicationId)} is not in ${args.db}`);
  const snapRow = db.prepare('SELECT serialized FROM snapshot_artifact WHERE snapshot_id = ?').get(pub.snapshot_id) as { serialized: string };
  const snap = JSON.parse(snapRow.serialized) as { games: Rec[]; rosters: Rec[] };

  const asOf = String(board.entries.find((e) => typeof e.asOf === 'string')?.asOf);
  const asOfMs = Date.parse(asOf);
  const season = nflSeasonOf(asOf)!;
  const onBoard = new Set(board.entries.map((e) => String(e.canonicalId)));

  // ---- 1 & 2: recency and current-season observations ------------------------------------
  const reg = snap.games.filter((g) => g.seasonType === 'REG');
  const usable = reg.filter((g) => Date.parse(String(g.kickoff)) <= asOfMs);
  const future = reg.filter((g) => Date.parse(String(g.kickoff)) > asOfMs);
  const newest = usable.reduce((m, g) => (String(g.kickoff) > m ? String(g.kickoff) : m), '');
  const newestAgeDays = (asOfMs - Date.parse(newest)) / DAY;
  const currentGames = usable.filter((g) => g.season === season);
  const weeks = [...new Set(currentGames.map((g) => String(g.gameId).slice(5, 7)))].sort();
  const boardPlayersWithCurrentGames = new Set(currentGames.map((g) => String(g.canonicalId)).filter((id) => onBoard.has(id)));
  const gamesBySeason: Record<string, number> = {};
  for (const g of usable) gamesBySeason[String(g.season)] = (gamesBySeason[String(g.season)] ?? 0) + 1;

  // ---- 3: team agreement --------------------------------------------------------------------
  const latestRoster = new Map<string, Rec>();
  for (const r of snap.rosters) {
    if (r.season !== season || Date.parse(String(r.sourceTimestamp)) > asOfMs) continue;
    const id = String(r.canonicalId);
    const cur = latestRoster.get(id);
    if (!cur || String(r.sourceTimestamp) > String(cur.sourceTimestamp)) latestRoster.set(id, r);
  }
  const latestGame = new Map<string, Rec>();
  for (const g of currentGames) {
    const id = String(g.canonicalId);
    const cur = latestGame.get(id);
    if (!cur || String(g.kickoff) > String(cur.kickoff)) latestGame.set(id, g);
  }
  let rosterCompared = 0;
  let rosterAgree = 0;
  const rosterMismatches: string[] = [];
  let gameCompared = 0;
  let gameAgree = 0;
  const gameMismatches: string[] = [];
  for (const e of board.entries) {
    const id = String(e.canonicalId);
    const r = latestRoster.get(id);
    if (r) {
      rosterCompared += 1;
      if (r.team === e.team) rosterAgree += 1;
      else rosterMismatches.push(`${String(e.name)}: board ${String(e.team)} vs roster ${String(r.team)}`);
    }
    const g = latestGame.get(id);
    if (g) {
      gameCompared += 1;
      if (g.team === e.team) gameAgree += 1;
      else gameMismatches.push(`${String(e.name)}: board ${String(e.team)} vs last ${season} game ${String(g.team)} (${String(g.gameId)})`);
    }
  }
  const rosterAgreement = rosterCompared > 0 ? rosterAgree / rosterCompared : null;
  const withoutCurrentRoster = board.entries.filter((e) => !latestRoster.has(String(e.canonicalId))).length;

  // ---- 4 & 5: experience and leakage, from every persisted normalized input -----------------
  const inputs = db
    .prepare('SELECT n.serialized FROM run_inference r JOIN normalized_input_artifact n ON n.checksum = r.normalized_input_checksum WHERE r.run_id = ?')
    .all(pub.run_id) as { serialized: string }[];
  const experience: Record<string, number | null> = {};
  const leaks: string[] = [];
  let factStamps = 0;
  for (const row of inputs) {
    const input = JSON.parse(row.serialized) as Rec;
    const player = input.player as Record<string, Rec>;
    const name = String((player.full_name as Rec)?.value ?? '');
    if (REFERENCE_PLAYERS.includes(name)) experience[name] = ((player.nfl_seasons_completed as Rec)?.value as number) ?? null;
    for (const [k, ts] of Object.entries((input.factTimestamps as Record<string, string>) ?? {})) {
      factStamps += 1;
      if (Date.parse(ts) > asOfMs) leaks.push(`${name}: fact ${k} stamped ${ts}`);
    }
    for (const field of ['team', 'status', 'injury_designation']) {
      const f = player[field];
      if (f?.present && Date.parse(String(f.sourceTimestamp)) > asOfMs) leaks.push(`${name}: ${field} attested ${String(f.sourceTimestamp)}`);
    }
    const prod = (input.evidence as Rec)?.production as Rec | undefined;
    if (prod?.newestGameKickoff && Date.parse(String(prod.newestGameKickoff)) > asOfMs) leaks.push(`${name}: production newest game ${String(prod.newestGameKickoff)}`);
  }
  const outputs = db
    .prepare('SELECT o.serialized FROM run_inference r JOIN inference_output_artifact o ON o.checksum = r.output_checksum WHERE r.run_id = ?')
    .all(pub.run_id) as { serialized: string }[];
  const excludedFutureFacts = outputs.reduce((n, o) => n + (((JSON.parse(o.serialized) as Rec).diagnostics as Rec)?.excluded_future_facts as unknown[] ?? []).length, 0);

  // ---- 6: source outcomes ---------------------------------------------------------------------
  const failed = db
    .prepare("SELECT provider, capability, request_key, required, error_code, failure_stage FROM refresh_source_outcome WHERE run_id = ? AND status = 'failure' ORDER BY provider, capability, request_key")
    .all(pub.run_id) as Rec[];
  const run = db.prepare('SELECT status, required_failure, source_count, success_count, failure_count FROM refresh_run WHERE run_id = ?').get(pub.run_id) as Rec;

  const checks = {
    recency: { pass: newest !== '' && newestAgeDays >= 0 && newestAgeDays < 8, asOf, newestGameKickoff: newest, newestAgeDays: Number(newestAgeDays.toFixed(2)), regularSeasonGamesAfterAsOfInSnapshot: future.length },
    currentSeason: { pass: currentGames.length > 0 && boardPlayersWithCurrentGames.size > 0, season, gameRecords: currentGames.length, weeks, boardPlayersWithCurrentSeasonGames: boardPlayersWithCurrentGames.size, boardEntries: board.entries.length, gameRecordsBySeason: gamesBySeason },
    teamAgreement: {
      pass: rosterAgreement !== null && rosterAgreement >= 0.99,
      vsLatestWeeklyRoster: { compared: rosterCompared, agree: rosterAgree, share: rosterAgreement, mismatches: rosterMismatches.slice(0, 25) },
      entriesWithoutCurrentSeasonRoster: withoutCurrentRoster,
      vsLatestGameTeam: { compared: gameCompared, agree: gameAgree, share: gameCompared ? gameAgree / gameCompared : null, mismatches: gameMismatches.slice(0, 25), note: 'independent dataset; a mismatch is expected for a player traded or released after his last game' },
    },
    experience: { informational: true, seasonsCompleted: experience },
    noLeakage: { pass: leaks.length === 0 && excludedFutureFacts === 0, factTimestampsChecked: factStamps, inputsChecked: inputs.length, violations: leaks.slice(0, 25), excludedFutureFacts },
    sources: { run, failed },
  };
  const hardPass = checks.recency.pass && checks.currentSeason.pass && checks.teamAgreement.pass && checks.noLeakage.pass;
  const report = { schema: 'playerticker.staging-verification/v1', publicationId: board.publication.publicationId, hardPass, checks };
  const text = JSON.stringify(report, null, 2);
  if (args.out) writeFileSync(args.out, `${text}\n`);
  console.log(text);
  return hardPass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();

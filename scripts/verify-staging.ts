/**
 * Measure a refreshed board against the Phase 1 acceptance checks, from the run's own database.
 *
 *   npm run verify:staging -- --db <run.db> --board <board.json> [--out report.json]
 *
 * Reports, and exits non-zero if any HARD check fails:
 *   1. data recency      the newest included game, re-dated from the RAW schedule capture with an
 *                        independent time-zone source, is final by the as-of, < 8 days old, and
 *                        is the newest game the raw schedule says was final by then
 *   1b. dates            every usable game is in the raw schedule, final by the as-of, and scored
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
const FINAL_AFTER_MS = 5 * 3_600_000;

/** Minimal RFC 4180 CSV reader (quoted fields, escaped quotes). Independent of the pipeline's decoder. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/**
 * Eastern wall clock -> instant, using the PLATFORM time-zone database (Intl), deliberately not
 * the pipeline's own DST rule, so the two implementations check each other.
 */
function easternInstantViaIntl(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  for (const offsetHours of [4, 5]) {
    const candidate = wall + offsetHours * 3_600_000;
    const p = Object.fromEntries(fmt.formatToParts(new Date(candidate)).map((x) => [x.type, x.value]));
    if (Number(p.year) === y && Number(p.month) === mo && Number(p.day) === d && Number(p.hour) === h && Number(p.minute) === mi) return candidate;
  }
  return null;
}

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

  // ---- 1 & 2: recency and current-season observations, checked against the RAW schedule ----
  // The pipeline's joined kickoffs are NOT trusted here: every game a board player could use is
  // re-dated from the raw schedule capture of the same run, with an independent time-zone source.
  const rawSchedule = db
    .prepare("SELECT payload FROM raw_payload_artifact WHERE provider = 'nflverse' AND capability = 'schedule' ORDER BY fetched_at DESC LIMIT 1")
    .get() as { payload: string } | undefined;
  if (!rawSchedule) throw new Error('no raw schedule capture in this database');
  const scheduleRows = parseCsv(rawSchedule.payload);
  const raw = new Map(scheduleRows.map((r) => [r.game_id, r]));
  const rawKickoff = (gameId: string): number | null => {
    const r = raw.get(gameId);
    return r ? easternInstantViaIntl(r.gameday, r.gametime) : null;
  };

  const reg = snap.games.filter((g) => g.seasonType === 'REG');
  const eligibleAt = (g: Rec) => String(g.availableAt ?? g.kickoff);
  const usable = reg.filter((g) => Date.parse(eligibleAt(g)) <= asOfMs);
  const notYet = reg.filter((g) => Date.parse(eligibleAt(g)) > asOfMs);
  const bySource: Record<string, number> = {};
  for (const g of reg) bySource[String(g.kickoffSource ?? 'UNLABELLED')] = (bySource[String(g.kickoffSource ?? 'UNLABELLED')] ?? 0) + 1;

  const dateViolations: string[] = [];
  let unscheduledUsable = 0;
  let unscoredUsable = 0;
  let pipelineDisagrees = 0;
  let newestIndependent = -Infinity;
  for (const g of usable) {
    const k = rawKickoff(String(g.gameId));
    if (k === null) { unscheduledUsable += 1; dateViolations.push(`${String(g.gameId)}: not in the raw schedule`); continue; }
    if (k + FINAL_AFTER_MS > asOfMs) dateViolations.push(`${String(g.gameId)}: raw kickoff ${new Date(k).toISOString()} is not final by the as-of`);
    if (Math.abs(k - Date.parse(String(g.kickoff))) > 0) pipelineDisagrees += 1;
    const r = raw.get(String(g.gameId))!;
    if (r.home_score === '' || r.away_score === '') unscoredUsable += 1;
    newestIndependent = Math.max(newestIndependent, k);
  }
  // The newest regular-season game that WAS final by the as-of according to the raw schedule:
  // what the board could have included at best.
  let newestPossible = -Infinity;
  for (const r of scheduleRows) {
    if (r.game_type !== 'REG') continue;
    const k = easternInstantViaIntl(r.gameday, r.gametime);
    if (k !== null && k + FINAL_AFTER_MS <= asOfMs) newestPossible = Math.max(newestPossible, k);
  }
  const newest = Number.isFinite(newestIndependent) ? new Date(newestIndependent).toISOString() : '';
  const newestAgeDays = (asOfMs - newestIndependent) / DAY;
  const currentGames = usable.filter((g) => g.season === season);
  const weeks = [...new Set(currentGames.map((g) => String(g.gameId).slice(5, 7)))].sort();
  const boardPlayersWithCurrentGames = new Set(currentGames.map((g) => String(g.canonicalId)).filter((id) => onBoard.has(id)));
  const gamesBySeason: Record<string, number> = {};
  for (const g of usable) gamesBySeason[String(g.season)] = (gamesBySeason[String(g.season)] ?? 0) + 1;

  // Raw weekly stat rows whose game the raw schedule does not know: excluded by the pipeline.
  const rawGamesPayloads = db
    .prepare("SELECT payload FROM raw_payload_artifact WHERE provider = 'nflverse' AND capability = 'games'")
    .all() as { payload: string }[];
  let rawStatRows = 0;
  let rawStatRowsUnscheduled = 0;
  for (const p of rawGamesPayloads) {
    for (const r of parseCsv(p.payload)) {
      if (r.season_type !== 'REG') continue;
      rawStatRows += 1;
      if (!raw.has(r.game_id)) rawStatRowsUnscheduled += 1;
    }
  }

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
    recency: {
      pass: newest !== '' && newestAgeDays >= 0 && newestAgeDays < 8 && newestIndependent === newestPossible,
      asOf,
      dating: 'raw schedule gameday+gametime (US Eastern) via the platform time-zone database; final = kickoff + 5h',
      newestIncludedKickoff: newest,
      newestFinalKickoffInRawSchedule: Number.isFinite(newestPossible) ? new Date(newestPossible).toISOString() : null,
      newestAgeDays: Number(newestAgeDays.toFixed(2)),
      regularSeasonGamesNotYetEligible: notYet.length,
      kickoffSources: bySource,
    },
    currentSeason: { pass: currentGames.length > 0 && boardPlayersWithCurrentGames.size > 0, season, gameRecords: currentGames.length, weeks, boardPlayersWithCurrentSeasonGames: boardPlayersWithCurrentGames.size, boardEntries: board.entries.length, gameRecordsBySeason: gamesBySeason },
    dates: {
      pass: dateViolations.length === 0 && unscoredUsable === 0,
      usableGameRecords: usable.length,
      notInRawSchedule: unscheduledUsable,
      notFinalByAsOf: dateViolations.length - unscheduledUsable,
      withoutFinalScore: unscoredUsable,
      pipelineKickoffDisagreesWithIndependentDate: pipelineDisagrees,
      rawWeeklyStatRows: rawStatRows,
      rawWeeklyStatRowsWithNoScheduledGame: rawStatRowsUnscheduled,
      violations: dateViolations.slice(0, 25),
    },
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
  const hardPass = checks.recency.pass && checks.currentSeason.pass && checks.dates.pass && checks.teamAgreement.pass && checks.noLeakage.pass;
  const report = { schema: 'playerticker.staging-verification/v1', publicationId: board.publication.publicationId, hardPass, checks };
  const text = JSON.stringify(report, null, 2);
  if (args.out) writeFileSync(args.out, `${text}\n`);
  console.log(text);
  return hardPass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();

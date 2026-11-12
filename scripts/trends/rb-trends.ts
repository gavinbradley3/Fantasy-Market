/**
 * Offline prototype: evidence-backed running-back trends with two separate ledgers.
 *
 *   npm run trends:rb -- --out experiments/trends-prototype-2026w9
 *
 * Ledger 1, observed:   what happened on the field, from nflverse files, by window.
 * Ledger 2, projection: what moved research challenger F's projection and value, split exactly
 *                       across the inputs F actually reads.
 * Every ledger-1 row is tagged MODEL INPUT (F reads it) or CONTEXT ONLY (F does not). A
 * context-only fact is never presented as a reason for a projection change.
 *
 * No market data, no buy/sell label, no production valuation. Reads only local files fetched
 * into .local/ (see the report's source table for URLs, release stamps and SHA-256).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv, num } from '@/validation/csv';
import { decisionDate, scheduleRows, type Checkpoint } from '@/validation/calendar';
import { loadDataset, type Pos } from '@/validation/data';
import { BASELINE_CONSTANTS } from '@/validation/baselines';
import { twoPartDetail, type TwoPartDetail } from '@/validation/challengers';
import { mainPositions } from '@/validation/evaluate';
import { REPLACEMENT_RANK } from '@/validation/outcomes';
import { addSplits, splitProduct, splitValue, type ProductSplit, type ValueSplit } from '@/trends/ledger';

const argv = process.argv.slice(2);
const OUT = resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'experiments/trends-prototype-2026w9');
const DATA = resolve('.local/validation-data');
const TDATA = resolve('.local/trends-data');
const SEASON = 2026;
const T0: Checkpoint = 'W5' as Checkpoint;
const T1: Checkpoint = 'W9' as Checkpoint;
const EARLY = { label: '2026 Weeks 1–5', season: 2026, from: 1, to: 5 };
const RECENT = { label: '2026 Weeks 6–9', season: 2026, from: 6, to: 9 };
const PRIOR = { label: '2025 season', season: 2025, from: 1, to: 18 };
const G = BASELINE_CONSTANTS.seasonGames;
const POS: Pos = 'RB';
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------- sources ----------
const files = {
  stats2025: join(DATA, 'stats_player_week_2025.csv'),
  stats2026: join(DATA, 'stats_player_week_2026.csv'),
  games: join(DATA, 'games.csv'),
  players: join(DATA, 'players.csv'),
  snaps2025: join(TDATA, 'snap_counts_2025.csv'),
  snaps2026: join(TDATA, 'snap_counts_2026.csv'),
  injuries2026: join(TDATA, 'injuries_2026.csv'),
  team2025: join(TDATA, 'stats_team_week_2025.csv'),
  team2026: join(TDATA, 'stats_team_week_2026.csv'),
};
const stamps = Object.fromEntries(
  readFileSync(join(TDATA, 'release-stamps.txt'), 'utf8').trim().split('\n').map((l) => {
    const [tag, ...rest] = l.split(' ');
    return [tag, JSON.parse(rest.join(' ')).last_updated as string];
  }),
);
const releaseOf: Record<keyof typeof files, string> = {
  stats2025: 'stats_player', stats2026: 'stats_player', games: 'schedules', players: 'players',
  snaps2025: 'snap_counts', snaps2026: 'snap_counts', injuries2026: 'injuries',
  team2025: 'stats_team', team2026: 'stats_team',
};

// ---------- schedule and decision instants ----------
const gamesRows = parseCsv(readFileSync(files.games, 'utf8'));
const schedule = scheduleRows(gamesRows);
const t0 = decisionDate(schedule, SEASON, T0).asOf;
const t1 = decisionDate(schedule, SEASON, T1).asOf;
const t1ms = Date.parse(t1);
/** team|season -> week -> game_id (regular season, final by t1) */
const teamWeeks = new Map<string, Map<number, string>>();
const kickoffOf = new Map<string, number>();
for (const [i, g] of schedule.entries()) {
  const row = gamesRows[i];
  if (g.gameType !== 'REG' || !g.kickoff) continue;
  kickoffOf.set(row.game_id, Date.parse(g.kickoff));
  if (Date.parse(g.kickoff) + 5 * 3_600_000 > t1ms) continue;
  for (const team of [row.home_team, row.away_team]) {
    const k = `${team}|${g.season}`;
    const m = teamWeeks.get(k) ?? new Map<number, string>();
    m.set(g.week, row.game_id);
    teamWeeks.set(k, m);
  }
}
const lastFinalKickoff = Math.max(...[...kickoffOf.values()].filter((k) => k + 5 * 3_600_000 <= t1ms));

// ---------- observed rows ----------
interface StatRow { gsis: string; name: string; team: string; season: number; week: number; gameId: string; carries: number; targets: number; rushYards: number; ppr: number }
const statRows: StatRow[] = [];
for (const f of [files.stats2025, files.stats2026]) {
  for (const r of parseCsv(readFileSync(f, 'utf8'))) {
    if (r.season_type !== 'REG') continue;
    const k = kickoffOf.get(r.game_id);
    if (k === undefined || k + 5 * 3_600_000 > t1ms) continue;
    statRows.push({ gsis: r.player_id, name: r.player_display_name, team: r.team, season: Number(r.season), week: Number(r.week), gameId: r.game_id, carries: num(r.carries) ?? 0, targets: num(r.targets) ?? 0, rushYards: num(r.rushing_yards) ?? 0, ppr: 0 });
  }
}
// Denominators: the provider's own team totals (stats_team_week). Cross-checked here against
// the sum of player rows for every team-game used; the run stops on any difference. Both were
// also checked against a direct count from play-by-play on 2026-11-12 (all 816 team-games of
// 2025 and 2026 Weeks 1-9 identical). "Carries" counts every rush attempt with a named rusher,
// quarterback scrambles and kneel-downs included.
const teamTotals = new Map<string, { carries: number; targets: number }>();
for (const f of [files.team2025, files.team2026]) {
  for (const r of parseCsv(readFileSync(f, 'utf8'))) {
    if (r.season_type === 'REG') teamTotals.set(`${r.team}|${r.game_id}`, { carries: num(r.carries) ?? 0, targets: num(r.targets) ?? 0 });
  }
}
const playerSums = new Map<string, { carries: number; targets: number }>();
for (const r of statRows) {
  const k = `${r.team}|${r.gameId}`;
  const t = playerSums.get(k) ?? { carries: 0, targets: 0 };
  t.carries += r.carries;
  t.targets += r.targets;
  playerSums.set(k, t);
}
for (const [k, t] of playerSums) {
  const team = teamTotals.get(k);
  if (!team || team.carries !== t.carries || team.targets !== t.targets) throw new Error(`team total mismatch for ${k}: team file ${JSON.stringify(team)}, player rows ${JSON.stringify(t)}`);
}
const verifiedTeamGames = playerSums.size;
const ds = loadDataset(DATA, [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
// Fantasy points with the site's scoring (the same function the harness uses).
const pointsOf = new Map(ds.games.map((g) => [`${g.gsis}|${g.gameId}`, g.points]));
for (const r of statRows) r.ppr = pointsOf.get(`${r.gsis}|${r.gameId}`) ?? 0;

const pfrOf = new Map<string, string>();
const rookieOf = new Map<string, number | null>();
for (const p of parseCsv(readFileSync(files.players, 'utf8'))) {
  if (p.pfr_id) pfrOf.set(p.gsis_id, p.pfr_id);
  rookieOf.set(p.gsis_id, num(p.rookie_season));
}
const snapPct = new Map<string, number>(); // pfr|gameId -> offense share
for (const f of [files.snaps2025, files.snaps2026]) {
  for (const r of parseCsv(readFileSync(f, 'utf8'))) if (r.game_type === 'REG') snapPct.set(`${r.pfr_player_id}|${r.game_id}`, num(r.offense_pct) ?? NaN);
}
const injuries = parseCsv(readFileSync(files.injuries2026, 'utf8')).filter((r) => r.season_type === 'REG');
const injuryWeek = Math.max(...injuries.map((r) => Number(r.week)));
const latestInjury = new Map(injuries.filter((r) => Number(r.week) === injuryWeek).map((r) => [r.gsis_id, r]));

interface Window { label: string; season: number; from: number; to: number }
function latestTeam(gsis: string, season: number): string | null {
  const rows = statRows.filter((r) => r.gsis === gsis && r.season <= season);
  return rows.length ? rows.sort((a, b) => a.season - b.season || a.week - b.week)[rows.length - 1].team : null;
}
function observe(gsis: string, w: Window) {
  const rows = statRows.filter((r) => r.gsis === gsis && r.season === w.season && r.week >= w.from && r.week <= w.to);
  const teams = [...new Set(rows.map((r) => r.team))];
  // With no game in the window, the player's latest team at the later instant stands in, so the
  // games his team played without him still count.
  const lastTeam = rows.length ? rows[rows.length - 1].team : latestTeam(gsis, w.season);
  const weeks = lastTeam ? [...(teamWeeks.get(`${lastTeam}|${w.season}`) ?? new Map()).keys()].filter((wk) => wk >= w.from && wk <= w.to).sort((a, b) => a - b) : [];
  const teamGames = weeks.length;
  const played = new Set(rows.map((r) => r.week));
  const missed = w.season === SEASON
    ? weeks.filter((wk) => !played.has(wk)).map((wk) => {
        const e = injuries.find((r) => r.gsis_id === gsis && Number(r.week) === wk);
        return { week: wk, injuryReport: e ? `${e.report_status || 'listed, no game status'}${e.report_primary_injury ? ` (${e.report_primary_injury})` : ''}` : 'no injury-report entry' };
      })
    : [];
  const sum = (f: (r: StatRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tc = sum((r) => teamTotals.get(`${r.team}|${r.gameId}`)!.carries);
  const tt = sum((r) => teamTotals.get(`${r.team}|${r.gameId}`)!.targets);
  const pfr = pfrOf.get(gsis);
  const snaps = rows.map((r) => (pfr ? snapPct.get(`${pfr}|${r.gameId}`) : undefined)).filter((x): x is number => x !== undefined && Number.isFinite(x));
  const n = rows.length;
  const per = (x: number) => (n ? x / n : null);
  return {
    window: w.label,
    gamesPlayed: n,
    teamGames,
    gamesShare: teamGames ? n / teamGames : null,
    missedGames: missed,
    teams,
    snapShare: snaps.length ? snaps.reduce((a, b) => a + b, 0) / snaps.length : null,
    snapRowsMissing: n - snaps.length,
    carriesPerGame: per(sum((r) => r.carries)),
    targetsPerGame: per(sum((r) => r.targets)),
    opportunitiesPerGame: per(sum((r) => r.carries + r.targets)),
    carryShare: tc ? sum((r) => r.carries) / tc : null,
    targetShare: tt ? sum((r) => r.targets) / tt : null,
    yardsPerCarry: sum((r) => r.carries) ? sum((r) => r.rushYards) / sum((r) => r.carries) : null,
    pprPerGamePlayed: per(sum((r) => r.ppr)),
    pprTotal: sum((r) => r.ppr),
  };
}

// ---------- challenger F at both instants ----------
const statPos = mainPositions(ds);
function population(asOfMs: number) {
  const pop = new Map<string, Pos>();
  for (const g of ds.games) if (g.availableAt <= asOfMs && g.season >= SEASON - BASELINE_CONSTANTS.historySeasons && statPos.get(g.gsis) === POS) pop.set(g.gsis, POS);
  return pop;
}
function runF(asOf: string) {
  const asOfMs = Date.parse(asOf);
  const pop = population(asOfMs);
  const detail = twoPartDetail({ ds, asOfMs, decisionSeason: SEASON, checkpoint: 'W', population: pop, positionOf: (g) => statPos.get(g) ?? null });
  const k = REPLACEMENT_RANK[POS];
  const kth = (xs: number[]) => xs.sort((a, b) => b - a)[Math.min(k, xs.length) - 1] ?? 0;
  const t1s = [...pop.keys()].map((g) => detail.get(g)?.T1 ?? 0);
  const t2s = [...pop.keys()].map((g) => (detail.get(g)?.T2 ?? 0) - (detail.get(g)?.T1 ?? 0));
  const rep: [number, number] = [kth(t1s), kth(t2s)];
  const ranked = [...pop.keys()].sort((a, b) => (detail.get(b)?.T1 ?? 0) - (detail.get(a)?.T1 ?? 0));
  return { pop, detail, rep, rankOf: new Map(ranked.map((g, i) => [g, i + 1])) };
}
const F0 = runF(t0);
const F1 = runF(t1);
const seasonsOf = (d: TwoPartDetail | undefined): [number, number] => (d ? [d.T1, d.T2 - d.T1] : [0, 0]);
const valueAt = (F: typeof F0, g: string) => {
  const s = seasonsOf(F.detail.get(g));
  return Math.max(0, s[0] - F.rep[0]) + Math.max(0, s[1] - F.rep[1]);
};

// ---------- rule-based selection ----------
const games2026 = (g: string) => statRows.filter((r) => r.gsis === g && r.season === SEASON).length;
const eligible = [...F1.pop.keys()].filter((g) => games2026(g) >= 3);
const topTier = (g: string) => (F0.rankOf.get(g) ?? 999) <= 48 || (F1.rankOf.get(g) ?? 999) <= 48;
const dT1 = (g: string) => (F1.detail.get(g)?.T1 ?? 0) - (F0.detail.get(g)?.T1 ?? 0);
const chosen: { gsis: string; rule: string }[] = [];
const take = (list: string[], n: number, rule: string) => {
  for (const g of list) {
    if (chosen.length && chosen.some((c) => c.gsis === g)) continue;
    if (chosen.filter((c) => c.rule === rule).length >= n) break;
    chosen.push({ gsis: g, rule });
  }
};
take([...eligible].sort((a, b) => valueAt(F1, b) - valueAt(F1, a)), 2, 'Highest F two-season value at the later date');
take(eligible.filter(topTier).sort((a, b) => dT1(b) - dT1(a)), 2, 'Largest rise in F next-season projection (top-48 RB at either date)');
take(eligible.filter(topTier).sort((a, b) => dT1(a) - dT1(b)), 2, 'Largest fall in F next-season projection (top-48 RB at either date)');
take(eligible.filter((g) => rookieOf.get(g) === SEASON).sort((a, b) => observe(b, { ...EARLY, to: 9 }).opportunitiesPerGame! * games2026(b) - observe(a, { ...EARLY, to: 9 }).opportunitiesPerGame! * games2026(a)), 1, 'Rookie with the most 2026 carries + targets');
take(eligible.filter((g) => latestInjury.get(g)?.report_status === 'Out').sort((a, b) => valueAt(F1, b) - valueAt(F1, a)), 1, `Highest F value among RBs listed Out on the Week ${injuryWeek} injury report`);

// ---------- per player ----------
const fit = JSON.parse(readFileSync('experiments/phase2-challenger-f/results/results.json', 'utf8')) as { calibratedMae: { pos: string; model: string; mae: number }[] };
const maeF = fit.calibratedMae.find((x) => x.pos === POS && x.model === 'F_two_part')!.mae;
const nameOf = (g: string) => statRows.filter((r) => r.gsis === g).at(-1)?.name ?? g;

const players = chosen.map(({ gsis, rule }) => {
  const obs = [observe(gsis, PRIOR), observe(gsis, EARLY), observe(gsis, RECENT)];
  const d0 = F0.detail.get(gsis);
  const d1 = F1.detail.get(gsis)!;
  const zero: TwoPartDetail = { gamesShare: 0, ptsPerGamePlayed: 0, pointsInWindow: 0, age: d1.age, share: [0, 0], rate: [0, 0], T1: 0, T2: 0 };
  const a = d0 ?? zero;
  const s1: ProductSplit = splitProduct(G, a.share[0], a.rate[0], d1.share[0], d1.rate[0]);
  const s2: ProductSplit = addSplits(s1, splitProduct(G, a.share[1], a.rate[1], d1.share[1], d1.rate[1]));
  const v: ValueSplit = splitValue(seasonsOf(d0), F0.rep, seasonsOf(d1), F1.rep);
  const newGames = statRows.filter((r) => r.gsis === gsis && r.season === SEASON && r.week >= RECENT.from && r.week <= RECENT.to);
  const inj = latestInjury.get(gsis);
  const missing: string[] = [];
  if (!pfrOf.get(gsis)) missing.push('No PFR id in players.csv, so snap share cannot be joined.');
  for (const o of obs) if (o.gamesPlayed && o.snapRowsMissing) missing.push(`${o.window}: snap share missing for ${o.snapRowsMissing} of ${o.gamesPlayed} games played.`);
  for (const o of obs) if (o.teams.length > 1) missing.push(`${o.window}: played for ${o.teams.join(' and ')}; team games counted for ${o.teams.at(-1)}, shares measured against the team of each game.`);
  if (obs[0].gamesPlayed === 0) missing.push('No 2025 NFL games: F rests on 2026 games only.');
  if (obs[2].gamesPlayed === 0) missing.push(`No games in ${RECENT.label}: no recent role or efficiency can be observed.`);
  else if (obs[2].gamesPlayed < 3) missing.push(`Only ${obs[2].gamesPlayed} ${obs[2].gamesPlayed === 1 ? 'game' : 'games'} in ${RECENT.label}: the recent window is a thin sample.`);
  const maxCarries = Math.max(0, ...statRows.filter((r) => r.gsis === gsis && r.season === SEASON && r.week >= RECENT.from && r.week <= RECENT.to).map((r) => r.carries));
  const recentCarries = (obs[2].carriesPerGame ?? 0) * obs[2].gamesPlayed;
  if (recentCarries > 0 && maxCarries / recentCarries >= 0.5 && obs[2].gamesPlayed >= 2) missing.push(`One game holds ${maxCarries} of ${Math.round(recentCarries)} recent-window carries: the carry-share change rests mostly on that game.`);
  if (!d0) missing.push(`No games available at ${t0}: F had no projection at the earlier date (treated as zero).`);
  if (d1.age === null) missing.push('No birth date: F applies no age adjustment.');
  return {
    gsis, name: nameOf(gsis), team: obs[2].teams.at(-1) ?? obs[1].teams.at(-1) ?? null, selectedBy: rule,
    injury: inj ? { week: injuryWeek, reportStatus: inj.report_status || 'listed, no game status', primaryInjury: inj.report_primary_injury || null, practiceStatus: inj.practice_status || null } : null,
    ledger1: obs,
    ledger2: {
      inputs: {
        earlier: d0 ? { gamesShare: r3(d0.gamesShare), pointsPerGamePlayed: r1(d0.ptsPerGamePlayed) } : null,
        later: { gamesShare: r3(d1.gamesShare), pointsPerGamePlayed: r1(d1.ptsPerGamePlayed) },
        newGamesInRecentWindow: newGames.length,
        newGamesPointsPerGame: newGames.length ? r1(newGames.reduce((s, r) => s + r.ppr, 0) / newGames.length) : null,
        age: d1.age === null ? null : r1(d1.age),
      },
      projection: {
        nextSeason: { earlier: r1(a.T1), later: r1(d1.T1), change: r1(s1.total), fromPointsPerGamePlayed: r1(s1.fromRate), fromGamesShare: r1(s1.fromShare) },
        twoSeason: { earlier: r1(a.T2), later: r1(d1.T2), change: r1(s2.total), fromPointsPerGamePlayed: r1(s2.fromRate), fromGamesShare: r1(s2.fromShare) },
      },
      value: { earlier: r1(valueAt(F0, gsis)), later: r1(valueAt(F1, gsis)), change: r1(v.total), fromOwnProjection: r1(v.fromOwnProjection), fromReplacementLevel: r1(v.fromReplacement) },
      rank: { earlier: F0.rankOf.get(gsis) ?? null, later: F1.rankOf.get(gsis) ?? null },
    },
    missing,
  };
});

// ---------- outputs ----------
mkdirSync(OUT, { recursive: true });
const sources = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { file: f.replace(resolve('.') + '/', ''), release: releaseOf[k as keyof typeof files], releaseLastUpdated: stamps[releaseOf[k as keyof typeof files]] ?? null, sha256: sha(f) }]));
const report = {
  generatedFrom: 'local files listed in sources; rerun reproduces this output from the same bytes',
  decisionInstants: { earlier: t0, later: t1, lastFinalKickoffUsed: new Date(lastFinalKickoff).toISOString() },
  windows: [PRIOR, EARLY, RECENT],
  model: { id: 'F_two_part', status: 'research challenger; not a published PlayerTicker valuation', fittedThrough: SEASON - 1, replacementRank: REPLACEMENT_RANK[POS], replacement: { earlier: F0.rep.map(r1), later: F1.rep.map(r1) }, validationMaeSeasonPoints: r1(maeF) },
  sources,
  players,
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1) + '\n');
writeFileSync(join(OUT, 'report.md'), render());
console.log(`wrote ${OUT}: ${players.length} players`);

function render(): string {
  const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : x.toFixed(d));
  const pct = (x: number | null) => (x === null ? 'n/a' : `${(100 * x).toFixed(0)}%`);
  const sgn = (x: number) => (x >= 0 ? `+${x.toFixed(1)}` : x.toFixed(1));
  const L: string[] = [];
  L.push('# Running-back trends: offline prototype', '');
  L.push('Generated by `npm run trends:rb`. Research output, not a published valuation. No market price is compared and no player is labelled buy-low or sell-high.', '');
  L.push('## How to read it', '');
  L.push(`- **Ledger 1, football statistics.** Observed and derived box-score and snap facts by window: ${PRIOR.label}, ${EARLY.label}, ${RECENT.label}. Each row is tagged **input** if challenger F reads it, or **context** if F does not. A context row never explains a projection change.`);
  L.push(`- **Ledger 2, projection.** Challenger F (research) evaluated at two decision instants: after ${EARLY.label.replace('2026 ', '')} (${t0}) and after ${RECENT.label.replace('2026 ', '')} (${t1}). F projects a season as 17 × expected games share × expected PPR points per game played. Both inputs are recency-weighted over 2023–2026 (each season counts half the next). Between the two instants F's fitted lines and age term do not change, so its projection moves only through those two inputs. The split below is exact: the parts add to the total.`);
  L.push(`- **Value** is two-season points above replacement (RB${REPLACEMENT_RANK[POS]}). It can also move when *other* players' projections move the replacement level: earlier ${f(F0.rep[0])} / ${f(F0.rep[1])}, later ${f(F1.rep[0])} / ${f(F1.rep[1])} points for seasons 1 / 2.`);
  L.push(`- **Kinds.** *Observed*: a value the provider publishes as-is (a count, a snap percentage, an injury-report status). *Derived*: exact arithmetic on observed values (per-game rates, shares, PPR points under the site's scoring); no estimation. *Estimated*: a model output (everything F produces).`);
  L.push(`- **Error.** In the exploratory backtest F's season-points projections for running backs missed by ${f(maeF)} PPR points on average (calibrated mean absolute error, 2022–2023 validation dates). That describes the size of a typical miss on a season total. It is not a confidence interval, and it is not a threshold for deciding whether a change in the projection matters. F has no measured error for changes between two dates within a season.`);
  L.push(`- **Data through** the game kicking off ${new Date(lastFinalKickoff).toISOString()}. The earlier instant is reconstructed from today's files, so any provider correction to Weeks 1–5 since then is already in it.`, '');
  L.push('## Selection rule', '', 'Running backs (main stats position) with 3 or more 2026 games by the later instant, taken in this order and never twice:', '');
  for (const r of [...new Set(chosen.map((c) => c.rule))]) L.push(`1. ${r}: ${chosen.filter((c) => c.rule === r).map((c) => nameOf(c.gsis)).join(', ')}`);
  L.push('');
  for (const p of players) {
    const o = p.ledger1;
    const l2 = p.ledger2;
    L.push(`## ${p.name} (${p.team ?? 'n/a'})`, '', `Selected by: ${p.selectedBy}.`, '');
    L.push('### Ledger 1: football statistics', '');
    L.push(`| Measure | Kind | ${o.map((x) => x.window).join(' | ')} | Change, recent vs early | F reads it? |`, '|---|---|---|---|---|---|---|');
    const KIND: Record<string, string> = {
      'Games played / team games': 'observed', 'Missed team games: injury report that week': 'observed',
      'PPR points per game played': 'derived', 'Offensive snap share': 'observed', 'Carries per game': 'derived',
      'Targets per game': 'derived', 'Opportunities (carries + targets) per game': 'derived', 'Team carry share': 'derived',
      'Team target share': 'derived', 'Yards per carry': 'derived',
    };
    const row = (label: string, vals: (string)[], change: string, tag: string) => L.push(`| ${label} | ${KIND[label]} | ${vals.join(' | ')} | ${change} | ${tag} |`);
    const ch = (a: number | null, b: number | null, scale = 1, unit = '') => (a === null || b === null ? 'n/a' : `${sgn((b - a) * scale)}${unit}`);
    row('Games played / team games', o.map((x) => `${x.gamesPlayed} / ${x.teamGames}`), `${ch(o[1].gamesShare, o[2].gamesShare, 100, ' pts')} of team games`, '**input** (games share)');
    row('Missed team games: injury report that week', o.map((x) => (x.missedGames.length ? x.missedGames.map((m) => `Wk ${m.week}: ${m.injuryReport}`).join('; ') : x.window.startsWith('2025') ? 'not shown' : 'none')), '', 'context');
    row('PPR points per game played', o.map((x) => f(x.pprPerGamePlayed)), ch(o[1].pprPerGamePlayed, o[2].pprPerGamePlayed), '**input** (points per game played)');
    row('Offensive snap share', o.map((x) => pct(x.snapShare)), ch(o[1].snapShare, o[2].snapShare, 100, ' pts'), 'context');
    row('Carries per game', o.map((x) => f(x.carriesPerGame)), ch(o[1].carriesPerGame, o[2].carriesPerGame), 'context');
    row('Targets per game', o.map((x) => f(x.targetsPerGame)), ch(o[1].targetsPerGame, o[2].targetsPerGame), 'context');
    row('Opportunities (carries + targets) per game', o.map((x) => f(x.opportunitiesPerGame)), ch(o[1].opportunitiesPerGame, o[2].opportunitiesPerGame), 'context');
    row('Team carry share', o.map((x) => pct(x.carryShare)), ch(o[1].carryShare, o[2].carryShare, 100, ' pts'), 'context');
    row('Team target share', o.map((x) => pct(x.targetShare)), ch(o[1].targetShare, o[2].targetShare, 100, ' pts'), 'context');
    row('Yards per carry', o.map((x) => f(x.yardsPerCarry, 2)), ch(o[1].yardsPerCarry, o[2].yardsPerCarry), 'context');
    L.push('');
    L.push('### Ledger 2: what moved F', '');
    const e = l2.inputs.earlier;
    L.push(`| | Kind | After Week 5 | After Week 9 | Change |`, '|---|---|---|---|---|');
    L.push(`| Input: games share (weighted) | derived | ${e ? f(e.gamesShare, 3) : 'none'} | ${f(l2.inputs.later.gamesShare, 3)} | ${e ? sgn((l2.inputs.later.gamesShare - e.gamesShare) * 100) + ' pts' : 'n/a'} |`);
    L.push(`| Input: PPR points per game played (weighted) | derived | ${e ? f(e.pointsPerGamePlayed) : 'none'} | ${f(l2.inputs.later.pointsPerGamePlayed)} | ${e ? sgn(l2.inputs.later.pointsPerGamePlayed - e.pointsPerGamePlayed) : 'n/a'} |`);
    L.push(`| Next-season projection (PPR points) | estimated | ${f(l2.projection.nextSeason.earlier)} | ${f(l2.projection.nextSeason.later)} | **${sgn(l2.projection.nextSeason.change)}** |`);
    L.push(`|   from points per game played | estimated | | | ${sgn(l2.projection.nextSeason.fromPointsPerGamePlayed)} |`);
    L.push(`|   from games share | estimated | | | ${sgn(l2.projection.nextSeason.fromGamesShare)} |`);
    L.push(`| Two-season value above replacement | estimated | ${f(l2.value.earlier)} | ${f(l2.value.later)} | **${sgn(l2.value.change)}** |`);
    L.push(`|   from own projection | estimated | | | ${sgn(l2.value.fromOwnProjection)} |`);
    L.push(`|   from replacement level moving | estimated | | | ${sgn(l2.value.fromReplacementLevel)} |`);
    L.push(`| F rank among RBs (next season) | estimated | ${l2.rank.earlier ?? 'n/a'} | ${l2.rank.later ?? 'n/a'} | |`, '');
    // Plain-language explanation, every number taken from the two tables above.
    const drivers = [
      { k: 'points per game played', v: l2.projection.nextSeason.fromPointsPerGamePlayed },
      { k: 'games share', v: l2.projection.nextSeason.fromGamesShare },
    ].sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
    L.push('**Explanation.**', '');
    L.push(`- F's next-season projection moved ${sgn(l2.projection.nextSeason.change)} points. ${Math.abs(drivers[0].v) < 0.05 ? 'Neither input moved it.' : `The larger part, ${sgn(drivers[0].v)}, came from ${drivers[0].k}; ${sgn(drivers[1].v)} came from ${drivers[1].k}.`}`);
    if (l2.inputs.newGamesInRecentWindow) L.push(`- The points-per-game input moved because ${p.name} played ${l2.inputs.newGamesInRecentWindow} ${l2.inputs.newGamesInRecentWindow === 1 ? 'game' : 'games'} in ${RECENT.label} at ${f(l2.inputs.newGamesPointsPerGame)} PPR points per game, against a weighted earlier input of ${e ? f(e.pointsPerGamePlayed) : 'none'}.`);
    else L.push(`- ${p.name} played no games in ${RECENT.label}; the games-share input fell as the team kept playing.`);
    L.push(`- Observed but **not** read by F: snap share ${pct(o[1].snapShare)} → ${pct(o[2].snapShare)}, carry share ${pct(o[1].carryShare)} → ${pct(o[2].carryShare)}, target share ${pct(o[1].targetShare)} → ${pct(o[2].targetShare)}. These describe the role. They did not change F's number except through the fantasy points they produced.`);
    const dCarry = o[1].carryShare !== null && o[2].carryShare !== null ? o[2].carryShare - o[1].carryShare : null;
    if (dCarry !== null && Math.abs(dCarry) >= 0.15) {
      L.push(`- **Observed role change.** Carry share moved ${sgn(dCarry * 100)} points; F's next-season projection moved ${sgn(l2.projection.nextSeason.change)}. F has no usage input, so a change in role reaches it only through the fantasy points that follow. Whether usage changes predict those points is tested separately (\`experiments/phase3-usage-signals\`).`);
    }
    if (Math.abs(l2.value.fromReplacementLevel) >= 0.05) L.push(`- ${sgn(l2.value.fromReplacementLevel)} of the value change came from other running backs' projections moving the replacement level, not from anything ${p.name} did.`);
    L.push('');
    if (p.injury) L.push(`**Injury report, Week ${p.injury.week}:** ${p.injury.reportStatus}${p.injury.primaryInjury ? ` (${p.injury.primaryInjury})` : ''}${p.injury.practiceStatus ? `; practice: ${p.injury.practiceStatus}` : ''}. Context only: F does not read injury reports. A team's designation, not a diagnosis.`, '');
    L.push('**Missing data and limits.**', '');
    for (const m of p.missing) L.push(`- ${m}`);
    L.push('- No market price: no licensed market history is available, so no buy-low or sell-high claim is made.', '');
  }
  L.push('## Sources', '', '| File | nflverse release | Release last updated | SHA-256 |', '|---|---|---|---|');
  for (const s of Object.values(sources)) L.push(`| \`${s.file.split('/').pop()}\` | \`${s.release}\` | ${s.releaseLastUpdated ?? 'n/a'} | \`${s.sha256.slice(0, 16)}…\` |`);
  L.push('', 'Downloaded from `https://github.com/nflverse/nflverse-data/releases/download/<release>/<file>` on 2026-11-12. The nflverse-data repository is licensed CC BY 4.0. Snap counts originate with Pro Football Reference via nflverse. Files are not redistributed here; their hashes identify the exact bytes used.', '');
  L.push(`Team carry and target totals come from the provider's team file (\`stats_team_week\`). This run checked them against the sum of player rows for all ${verifiedTeamGames} team-games used and found no difference; a direct count from play-by-play on 2026-11-12 also matched every 2025 and 2026 team-game. "Carries" counts every rush attempt with a named rusher, quarterback scrambles and kneel-downs included, so a back's carry share is measured against all team rushes. Fantasy points use the site's full-PPR scoring, which excludes fumbles lost, two-point conversions and return touchdowns.`, '');
  return L.join('\n');
}

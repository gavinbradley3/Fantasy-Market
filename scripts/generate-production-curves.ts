/**
 * Generate PlayerTicker's positional production reference from ingested nflverse games.
 *
 *   npm run generate:production-curves -- [--db .local/curve.db] [--min-games 6]
 *
 * WHAT THIS PRODUCES AND WHY IT IS GENERATED RATHER THAN WRITTEN
 * The shared utility layer needs to know what a position's rank is WORTH, not merely that one
 * player is ranked above another. "RB3" and "TE3" are the same rank and nothing alike in
 * fantasy points, and the gap from RB1 to RB5 is nothing like the gap from RB61 to RB65. Both
 * facts are measurable from games that have already happened, so they are measured here rather
 * than assumed.
 *
 * The output is a frozen, versioned TypeScript module carrying its own provenance: the seasons
 * it was built from, the scoring rules it was scored under, the qualification threshold, and
 * the counts behind every number. Regenerating it is a deliberate act that changes a recorded
 * version, exactly like the engines' reference distributions.
 *
 * NOTHING HERE IS FITTED TO ANY MARKET. The only inputs are box scores.
 */

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { PPR_SCORING, scoreStatLine } from '@/utility/scoring';
import { UTILITY_POSITIONS, type UtilityPosition } from '@/utility/leagueSchema';

interface Args {
  db: string;
  out: string;
  /** Restrict the curve to these seasons. Empty means every season the snapshot holds. */
  only: number[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { db: '.local/curve.db', out: 'src/utility/productionCurve.generated.ts', only: [] };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--db': args.db = next(); break;
      case '--out': args.out = next(); break;
      case '--seasons': args.only = next().split(',').map((v) => Number.parseInt(v.trim(), 10)); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** One player's one season at one position: what he produced and how old he was. */
interface PlayerSeason {
  readonly canonicalId: string;
  readonly position: UtilityPosition;
  readonly season: number;
  readonly games: number;
  /**
   * Season points divided by the season's TEAM GAMES, not by the games he played.
   *
   * This is the quantity a lineup slot actually receives, and it is why no minimum-games filter
   * is needed anywhere in this generator. Per-game-played scoring has to exclude small samples
   * or a single 40-point relief appearance becomes the best season at the position; excluding
   * them then truncates every curve at whatever the threshold was, which floors the bottom of
   * the distribution far above zero and hands career backups a share of an elite player's
   * production they never earned. Per-team-game has neither problem: missing eight games costs
   * a player half his value, exactly as it costs the roster starting him.
   */
  readonly pointsPerTeamGame: number;
  readonly ageInSeason: number | null;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? (s[h] as number) : (((s[h - 1] as number) + (s[h] as number)) / 2);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(args.db, { readOnly: true });
  const row = db.prepare('select serialized, checksum from snapshot_artifact order by rowid desc limit 1').get() as
    | { serialized: string; checksum: string }
    | undefined;
  if (!row) throw new Error(`no snapshot artifact in ${args.db} — run an ingest first`);
  const snapshot = JSON.parse(row.serialized) as {
    games: readonly Record<string, number | string | null>[];
    players: readonly { canonicalId: string; position: string | null; age: number | null }[];
  };

  const meta = new Map(snapshot.players.map((p) => [p.canonicalId, p]));
  const positions = new Set<string>(UTILITY_POSITIONS);

  // Regular season only. Postseason games are played by a biased subset of the league and
  // would inflate the top of every curve.
  const acc = new Map<string, { games: number; points: number }>();
  // Team games per season, counted from the schedule the box scores describe rather than
  // assumed: the league played 16 games a season before 2021 and 17 after, and a curve that
  // hard-coded either would misprice every season on the other side of the change.
  const gameIdsBySeason = new Map<number, Set<string>>();
  let latestSeason = 0;
  for (const g of snapshot.games) {
    if (g.seasonType !== 'REG') continue;
    if (args.only.length > 0 && !args.only.includes(g.season as number)) continue;
    const id = g.canonicalId as string | null;
    if (!id) continue;
    const p = meta.get(id);
    if (!p || !p.position || !positions.has(p.position)) continue;
    const season = g.season as number;
    if (season > latestSeason) latestSeason = season;
    const ids = gameIdsBySeason.get(season) ?? new Set<string>();
    ids.add(g.gameId as string);
    gameIdsBySeason.set(season, ids);
    const key = `${id}|${season}`;
    const cur = acc.get(key) ?? { games: 0, points: 0 };
    cur.games += 1;
    cur.points += scoreStatLine(g as never, PPR_SCORING);
    acc.set(key, cur);
  }

  const teamGamesBySeason = new Map<number, number>();
  for (const [season, ids] of gameIdsBySeason) {
    teamGamesBySeason.set(season, Math.max(1, Math.round((ids.size * 2) / 32)));
  }

  const playerSeasons: PlayerSeason[] = [];
  for (const [key, v] of acc) {
    const [id, seasonText] = key.split('|');
    const p = meta.get(id as string);
    if (!p || !p.position) continue;
    const season = Number(seasonText);
    playerSeasons.push({
      canonicalId: id as string,
      position: p.position as UtilityPosition,
      season,
      games: v.games,
      pointsPerTeamGame: v.points / (teamGamesBySeason.get(season) ?? 17),
      // Roster age is current-as-of-ingest, so a player's age in an earlier season is that
      // figure minus the seasons since. Birthday timing makes this accurate to about a year,
      // which is well inside the resolution the age survival curve is read at.
      ageInSeason: p.age === null ? null : p.age - (latestSeason - season),
    });
  }

  const seasons = [...new Set(playerSeasons.map((p) => p.season))].sort((a, b) => a - b);

  const curves: Record<string, unknown> = {};
  for (const position of UTILITY_POSITIONS) {
    const bySeason = new Map<number, number[]>();
    for (const ps of playerSeasons) {
      if (ps.position !== position) continue;
      const list = bySeason.get(ps.season) ?? [];
      list.push(ps.pointsPerTeamGame);
      bySeason.set(ps.season, list);
    }
    for (const list of bySeason.values()) list.sort((a, b) => b - a);

    // The curve runs as deep as the SHORTEST season's field, so every rank on it is a median
    // over the same set of seasons rather than over whichever seasons happened to be deep.
    // Ranks past the end are worth the curve's floor, which is now essentially zero.
    const depth = Math.min(...[...bySeason.values()].map((l) => l.length));
    const pointsPerGameByRank: number[] = [];
    for (let r = 0; r < depth; r++) {
      pointsPerGameByRank.push(round3(median([...bySeason.values()].map((l) => l[r] as number))));
    }

    // Age survival: the share of this position's total qualifying production that is produced
    // at an age GREATER than each age. It answers "how much of what this position does is still
    // ahead of someone this old", from games rather than from an assumed aging curve.
    const aged = playerSeasons.filter((p) => p.position === position && p.ageInSeason !== null);
    const totalProduction = aged.reduce((s, p) => s + p.pointsPerTeamGame, 0);
    const ageSurvival: Record<number, number> = {};
    for (let age = 20; age <= 40; age++) {
      const ahead = aged
        .filter((p) => (p.ageInSeason as number) > age)
        .reduce((s, p) => s + p.pointsPerTeamGame, 0);
      ageSurvival[age] = totalProduction > 0 ? round3(ahead / totalProduction) : 0;
    }

    curves[position] = {
      position,
      pointsPerGameByRank,
      ageSurvival,
      qualifyingPlayerSeasons: playerSeasons.filter((p) => p.position === position).length,
      fieldBySeason: Object.fromEntries([...bySeason].sort((a, b) => a[0] - b[0]).map(([s, l]) => [s, l.length])),
    };
  }

  const generated = {
    curveVersion: `production-v1-${seasons[0]}-${seasons[seasons.length - 1]}`,
    scoringId: PPR_SCORING.id,
    seasons,
    teamGamesBySeason: Object.fromEntries([...teamGamesBySeason].sort((a, b) => a[0] - b[0])),
    snapshotChecksum: row.checksum,
    positions: curves,
  };

  const body = `// GENERATED FILE — do not edit by hand.
//
// Produced by \`npm run generate:production-curves\` from ingested nflverse regular-season box
// scores. Every number below is a measurement; none is a judgement, a market quote, or a
// fitted parameter. See scripts/generate-production-curves.ts for the method and
// docs/UTILITY_LAYER.md for how the utility layer reads it.
//
// Regenerating this file changes \`curveVersion\`, which is published on every board entry, so a
// value can always be traced to the evidence that produced it.

import type { GeneratedProductionReference } from './productionCurve';

export const PRODUCTION_REFERENCE: GeneratedProductionReference = ${JSON.stringify(generated, null, 2)} as const;
`;
  writeFileSync(args.out, body);

  console.log(`curve version   ${generated.curveVersion}`);
  console.log(`seasons         ${seasons.join(', ')}`);
  console.log(`scoring         ${PPR_SCORING.id} (${PPR_SCORING.label})`);
  console.log(`team games      ${[...teamGamesBySeason].sort((a, b) => a[0] - b[0]).map(([s2, n2]) => `${s2}:${n2}`).join(' ')}`);
  console.log(`snapshot        ${row.checksum}`);
  console.log('');
  console.log('pos  depth  player-seasons  ppg@1   ppg@12  ppg@24  ppg@36  ppg@48  ppg@72  floor');
  for (const position of UTILITY_POSITIONS) {
    const c = curves[position] as { pointsPerGameByRank: number[]; qualifyingPlayerSeasons: number };
    const at = (r: number) => (c.pointsPerGameByRank[r - 1] ?? c.pointsPerGameByRank[c.pointsPerGameByRank.length - 1] ?? 0).toFixed(2);
    console.log(
      position.padEnd(4),
      String(c.pointsPerGameByRank.length).padStart(5),
      String(c.qualifyingPlayerSeasons).padStart(15),
      at(1).padStart(6), at(12).padStart(7), at(24).padStart(7), at(36).padStart(7), at(48).padStart(7), at(72).padStart(7),
      (c.pointsPerGameByRank[c.pointsPerGameByRank.length - 1] ?? 0).toFixed(2).padStart(6),
    );
  }
  console.log(`\nwrote ${args.out}`);
}

main();

// Historical inputs for the backtest, read from nflverse release files.
//
// POINT-IN-TIME CAVEATS (documented in docs/PHASE2_VALIDATION_PLAN.md):
//   - nflverse republishes each release in place; no historical snapshot of a release exists, so
//     stat corrections made after a game are present in every replay. Dates come from the
//     schedule; a game is usable only once final (kickoff + 5h).
//   - players.csv is a CURRENT-STATE export. Only time-invariant fields are read (birth date,
//     rookie season, draft round). Its position is NOT used for outcomes.
//   - draft_picks.csv also carries career-outcome columns (games, AV, Pro Bowls...). Only
//     season, round, pick, gsis_id and position are read.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { easternWallClockToIso, GAME_FINAL_AFTER_MS } from '@/ingestion/weekTiming';
import { PPR_SCORING, scoreStatLine } from '@/utility/scoring';
import { num, parseCsv } from './csv';

export type Pos = 'QB' | 'RB' | 'WR' | 'TE';
export const POSITIONS: readonly Pos[] = ['QB', 'RB', 'WR', 'TE'];

export interface PlayerGame {
  readonly gsis: string;
  readonly name: string;
  readonly position: string;
  readonly season: number;
  readonly week: number;
  readonly team: string;
  readonly gameId: string;
  /** Instant the game's final box score may be used (scheduled kickoff + 5h). */
  readonly availableAt: number;
  readonly points: number;
  readonly attempts: number;
  readonly carries: number;
  readonly targets: number;
}

export interface PlayerBio {
  readonly gsis: string;
  readonly birthDate: string | null;
  readonly rookieSeason: number | null;
}

export interface DraftPick {
  readonly season: number;
  readonly round: number;
  readonly pick: number;
  readonly gsis: string | null;
  readonly position: string;
}

export interface Dataset {
  readonly games: readonly PlayerGame[];
  readonly bios: ReadonlyMap<string, PlayerBio>;
  readonly draft: readonly DraftPick[];
  /** Regular-season games scheduled per (season, team) at or before an instant. */
  readonly teamSchedule: ReadonlyMap<string, readonly number[]>;
}

const n = (v: string | undefined) => num(v) ?? 0;

export function loadDataset(dataDir: string, seasons: readonly number[]): Dataset {
  const schedule = parseCsv(readFileSync(join(dataDir, 'games.csv'), 'utf8'));
  const kickoffById = new Map<string, number>();
  const teamSchedule = new Map<string, number[]>();
  for (const r of schedule) {
    const iso = easternWallClockToIso(r.gameday || null, r.gametime || null);
    if (!iso) continue;
    const ms = Date.parse(iso);
    kickoffById.set(r.game_id, ms);
    if (r.game_type !== 'REG') continue;
    for (const team of [r.home_team, r.away_team]) {
      const key = `${r.season}|${team}`;
      const list = teamSchedule.get(key) ?? [];
      list.push(ms + GAME_FINAL_AFTER_MS);
      teamSchedule.set(key, list);
    }
  }
  for (const list of teamSchedule.values()) list.sort((a, b) => a - b);

  const games: PlayerGame[] = [];
  for (const season of seasons) {
    for (const r of parseCsv(readFileSync(join(dataDir, `stats_player_week_${season}.csv`), 'utf8'))) {
      if (r.season_type !== 'REG') continue;
      const kickoff = kickoffById.get(r.game_id);
      if (kickoff === undefined) continue; // undated: excluded, as in production
      games.push({
        gsis: r.player_id,
        name: r.player_display_name,
        position: r.position,
        season: Number(r.season),
        week: Number(r.week),
        team: r.team,
        gameId: r.game_id,
        availableAt: kickoff + GAME_FINAL_AFTER_MS,
        points: scoreStatLine(
          {
            passingYards: num(r.passing_yards), passingTds: num(r.passing_tds), interceptions: num(r.passing_interceptions),
            rushingYards: num(r.rushing_yards), rushingTds: num(r.rushing_tds), receptions: num(r.receptions),
            receivingYards: num(r.receiving_yards), receivingTds: num(r.receiving_tds),
          },
          PPR_SCORING,
        ),
        attempts: n(r.attempts),
        carries: n(r.carries),
        targets: n(r.targets),
      });
    }
  }

  const bios = new Map<string, PlayerBio>();
  for (const r of parseCsv(readFileSync(join(dataDir, 'players.csv'), 'utf8'))) {
    if (!r.gsis_id) continue;
    bios.set(r.gsis_id, { gsis: r.gsis_id, birthDate: r.birth_date || null, rookieSeason: num(r.rookie_season) });
  }

  const draft: DraftPick[] = parseCsv(readFileSync(join(dataDir, 'draft_picks.csv'), 'utf8')).map((r) => ({
    season: Number(r.season), round: Number(r.round), pick: Number(r.pick), gsis: r.gsis_id || null, position: r.position,
  }));

  return { games, bios, draft, teamSchedule };
}

export function ageAt(birthDate: string | null, instantMs: number): number | null {
  if (!birthDate) return null;
  const b = Date.parse(birthDate);
  if (!Number.isFinite(b)) return null;
  return (instantMs - b) / (365.25 * 86_400_000);
}

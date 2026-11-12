// Decision dates for the backtest, derived from the nflverse schedule (never hand-entered).
//
//   OFFSEASON  seven days before the season's first regular-season kickoff. Week 1 rosters and
//              games are not yet observable; last season is complete.
//   WEEK n     twelve hours after the latest scheduled kickoff of regular-season week n, i.e. the
//              morning after Monday night once week n is final (kickoff + 5h) everywhere.

import { easternWallClockToIso } from '@/ingestion/weekTiming';

export type Checkpoint = 'OFFSEASON' | 'W4' | 'W8' | 'W12';

export interface DecisionDate {
  readonly id: string; // e.g. "2022-W8"
  readonly season: number; // the NFL season the date falls in
  readonly checkpoint: Checkpoint;
  readonly asOf: string; // ISO instant
}

export interface ScheduleRow {
  readonly season: number;
  readonly week: number;
  readonly gameType: string;
  readonly kickoff: string | null; // ISO
}

export function scheduleRows(rows: readonly Record<string, string>[]): ScheduleRow[] {
  return rows.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    gameType: r.game_type,
    kickoff: easternWallClockToIso(r.gameday || null, r.gametime || null),
  }));
}

const DAY = 86_400_000;

export function decisionDate(schedule: readonly ScheduleRow[], season: number, checkpoint: Checkpoint): DecisionDate {
  const reg = schedule.filter((g) => g.season === season && g.gameType === 'REG' && g.kickoff !== null);
  if (reg.length === 0) throw new Error(`no regular-season schedule for ${season}`);
  let ms: number;
  if (checkpoint === 'OFFSEASON') {
    ms = Math.min(...reg.map((g) => Date.parse(g.kickoff!))) - 7 * DAY;
  } else {
    const week = Number(checkpoint.slice(1));
    const games = reg.filter((g) => g.week === week);
    if (games.length === 0) throw new Error(`no week ${week} games in ${season}`);
    ms = Math.max(...games.map((g) => Date.parse(g.kickoff!))) + 12 * 3_600_000;
  }
  return { id: `${season}-${checkpoint}`, season, checkpoint, asOf: new Date(ms).toISOString() };
}

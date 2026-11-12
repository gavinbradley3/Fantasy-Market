// Game timing: join every game-level observation to its scheduled game.
//
// WHY. The weekly player-stats export carries season, week and game_id but no date. The adapter
// could only stamp each row with the Thursday that opens its week, so a Sunday game read as
// Thursday: freshness was understated, and a board dated Friday–Monday of an incomplete week
// could admit games that had not been played yet (docs/PHASE1_RECOVERY_AUDIT.md follow-up).
//
// THE RULE.
//   1. A row's game is found by its game_id in the nflverse schedule, or, for a row with a
//      derived id, by (season, week, team).
//   2. A joined row takes the schedule's kickoff and its provenance (SCHEDULE_TIME or
//      SCHEDULE_DATE). A row that carried its own kickoff keeps it (PROVIDER).
//   3. Every row gets `availableAt`, the earliest instant its FINAL box score may be used:
//      kickoff + 5h for a timed kickoff, the end of the Eastern day + 5h for a date only.
//      All as-of eligibility reads `availableAt`.
//   4. A row that still has only a week-boundary placeholder after the join has no
//      established date. It is EXCLUDED and reported, never dated by its week.
//
// Pure and deterministic: the same records and schedule always produce the same output.

import { DATE_ONLY_FINAL_AFTER_MS, GAME_FINAL_AFTER_MS } from './weekTiming';
import type {
  GameStatRecord,
  IngestionWarning,
  KickoffSource,
  ParticipationRecord,
  ScheduleGameRecord,
} from './types';

function availableAfter(kickoff: string, source: KickoffSource): string {
  const ms = Date.parse(kickoff) + (source === 'SCHEDULE_DATE' ? DATE_ONLY_FINAL_AFTER_MS : GAME_FINAL_AFTER_MS);
  return new Date(ms).toISOString();
}

export interface ScheduleIndex {
  readonly byId: ReadonlyMap<string, ScheduleGameRecord>;
  readonly byWeekTeam: ReadonlyMap<string, ScheduleGameRecord>;
}

export function indexSchedule(schedule: readonly ScheduleGameRecord[]): ScheduleIndex {
  const byId = new Map<string, ScheduleGameRecord>();
  const byWeekTeam = new Map<string, ScheduleGameRecord>();
  for (const g of schedule) {
    byId.set(g.gameId, g);
    byWeekTeam.set(`${g.season}|${g.week}|${g.homeTeam}`, g);
    byWeekTeam.set(`${g.season}|${g.week}|${g.awayTeam}`, g);
  }
  return { byId, byWeekTeam };
}

type Timed = { readonly gameId: string; readonly kickoff: string; readonly kickoffSource?: KickoffSource };

function resolveOne<T extends Timed>(
  rec: T,
  scheduled: ScheduleGameRecord | undefined,
): (T & { kickoffSource: KickoffSource; availableAt: string }) | null {
  // A record without a source label is a legacy/fixture record that carried its own kickoff.
  const own: KickoffSource = rec.kickoffSource ?? 'PROVIDER';
  if (own === 'PROVIDER') {
    return { ...rec, kickoffSource: 'PROVIDER', availableAt: availableAfter(rec.kickoff, 'PROVIDER') };
  }
  if (scheduled) {
    const source: KickoffSource = scheduled.kickoffSource === 'SCHEDULE_DATE' ? 'SCHEDULE_DATE' : scheduled.kickoffSource ?? 'PROVIDER';
    return { ...rec, kickoff: scheduled.kickoff, kickoffSource: source, availableAt: availableAfter(scheduled.kickoff, source) };
  }
  return null;
}

/** Parse "2025_05_..." into season and week, for the (season, week, team) fallback. */
function seasonWeekOf(gameId: string): { season: number; week: number } | null {
  const m = /^(\d{4})_(\d{2})_/.exec(gameId);
  return m ? { season: Number(m[1]), week: Number(m[2]) } : null;
}

export function resolveGameTiming(
  games: readonly GameStatRecord[],
  schedule: ScheduleIndex,
  warnings: IngestionWarning[],
): GameStatRecord[] {
  const out: GameStatRecord[] = [];
  let excluded = 0;
  for (const g of games) {
    const scheduled = schedule.byId.get(g.gameId) ?? schedule.byWeekTeam.get(`${g.season}|${seasonWeekOf(g.gameId)?.week ?? -1}|${g.team}`);
    const resolved = resolveOne(g, scheduled);
    if (resolved) out.push(resolved);
    else excluded += 1;
  }
  if (excluded > 0) {
    warnings.push({
      code: 'UNSCHEDULED_OBSERVATION',
      provider: 'nflverse',
      detail: `${excluded} game stat row(s) matched no scheduled game and were excluded: their date cannot be established`,
    });
  }
  return out;
}

export function resolveParticipationTiming(
  participation: readonly ParticipationRecord[],
  schedule: ScheduleIndex,
  warnings: IngestionWarning[],
): ParticipationRecord[] {
  const out: ParticipationRecord[] = [];
  let excluded = 0;
  for (const p of participation) {
    const resolved = resolveOne(p, schedule.byId.get(p.gameId));
    if (resolved) out.push(resolved);
    else excluded += 1;
  }
  if (excluded > 0) {
    warnings.push({
      code: 'UNSCHEDULED_OBSERVATION',
      provider: 'nflverse',
      detail: `${excluded} participation record(s) matched no scheduled game and were excluded`,
    });
  }
  return out;
}

/** The instant an observation becomes usable. Records built outside a snapshot fall back to kickoff. */
export function availableAtOf(rec: { readonly kickoff: string; readonly availableAt?: string }): string {
  return rec.availableAt ?? rec.kickoff;
}

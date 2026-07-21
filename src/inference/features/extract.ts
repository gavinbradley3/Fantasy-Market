// Deterministic feature extractors (REGISTRY §20.F11). Every extractor is pure,
// as-of-clamped (`sourceTimestamp`/`kickoff` ≤/< asOf), and follows the registry's
// source-priority, tie-break, and missing-data rules exactly. None infers absent
// source data.

import { withinAsOf } from '@/inference/util/replay';
import { EXPECTED_GAMES, FEATURE } from '@/inference/registry/family';
import { regularSeasonOnly } from './windows';
import type {
  PlayerGameUsage,
  RosterEntry,
  ScheduleGame,
  SupportedPosition,
  TransactionEvent,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The current roster snapshot for a player: the entry with the greatest
 * `sourceTimestamp ≤ asOf`; ties broken by the greatest `snapshotId`
 * (REGISTRY §20.F10). Returns null when the player has no entry on/before asOf.
 */
export function currentRosterEntry(
  entries: readonly RosterEntry[],
  canonicalId: string,
  asOf: string,
): RosterEntry | null {
  const eligible = entries.filter(
    (e) => e.canonicalId === canonicalId && withinAsOf(asOf, e.sourceTimestamp),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, e) => {
    const bt = Date.parse(best.sourceTimestamp);
    const et = Date.parse(e.sourceTimestamp);
    if (et > bt) return e;
    if (et === bt && e.snapshotId > best.snapshotId) return e;
    return best;
  });
}

/** The player's current team (REGISTRY §20.F11 team assignment), or null. */
export function currentTeam(
  entries: readonly RosterEntry[],
  canonicalId: string,
  asOf: string,
): string | null {
  const entry = currentRosterEntry(entries, canonicalId, asOf);
  return entry && entry.status !== 'FREE_AGENT' ? entry.team : null;
}

/**
 * Distinct seasons the player appears on `team` in roster history ≤ asOf
 * (REGISTRY §20.F11). The current partial season counts as 1 (included naturally).
 */
export function yearsWithTeam(
  entries: readonly RosterEntry[],
  canonicalId: string,
  team: string,
  asOf: string,
): number {
  const seasons = new Set<number>();
  for (const e of entries) {
    if (e.canonicalId === canonicalId && e.team === team && withinAsOf(asOf, e.sourceTimestamp)) {
      seasons.add(e.season);
    }
  }
  return seasons.size;
}

/**
 * Team of the player's final regular-season game in the most recent COMPLETED
 * season (season < `currentSeason`); ties broken by the greatest gameId
 * (REGISTRY §20.F11). Returns null when there is no such prior season.
 */
export function priorSeasonTeam(
  rows: readonly PlayerGameUsage[],
  canonicalId: string,
  currentSeason: number,
  asOf: string,
): string | null {
  const asOfMs = Date.parse(asOf);
  const rowsForPlayer = regularSeasonOnly(rows).filter(
    (r) => r.canonicalId === canonicalId && r.season < currentSeason && Date.parse(r.kickoff) <= asOfMs,
  );
  if (rowsForPlayer.length === 0) return null;
  const priorSeason = Math.max(...rowsForPlayer.map((r) => r.season));
  const priorRows = rowsForPlayer.filter((r) => r.season === priorSeason);
  const finalGame = priorRows.reduce((best, r) => {
    const bk = Date.parse(best.kickoff);
    const rk = Date.parse(r.kickoff);
    if (rk > bk) return r;
    if (rk === bk && r.gameId > best.gameId) return r;
    return best;
  });
  return finalGame.team;
}

/** `new_team_flag` / `team_change` = current team ≠ prior-season team (REGISTRY §6.4). */
export function teamChanged(
  entries: readonly RosterEntry[],
  usage: readonly PlayerGameUsage[],
  canonicalId: string,
  currentSeason: number,
  asOf: string,
): boolean {
  const cur = currentTeam(entries, canonicalId, asOf);
  const prior = priorSeasonTeam(usage, canonicalId, currentSeason, asOf);
  if (cur === null || prior === null) return false; // no evidence of change
  return cur !== prior;
}

/** Latest acquisition (SIGN/TRADE_IN) date ≤ asOf, or null (REGISTRY §20.F11). */
export function acquisitionDate(
  transactions: readonly TransactionEvent[],
  canonicalId: string,
  asOf: string,
): string | null {
  return latestEventDate(transactions, canonicalId, asOf, ['SIGN', 'TRADE_IN']);
}

/** True iff the player was acquired within `FEATURE.acquiredWithinDays` of asOf. */
export function acquiredWithinWindow(
  transactions: readonly TransactionEvent[],
  canonicalId: string,
  asOf: string,
): boolean {
  const date = acquisitionDate(transactions, canonicalId, asOf);
  return isWithinDays(date, asOf, FEATURE.acquiredWithinDays);
}

/** True iff the player returned from absence within the acquisition window. */
export function returnedWithinWindow(
  transactions: readonly TransactionEvent[],
  canonicalId: string,
  asOf: string,
): boolean {
  const date = latestEventDate(transactions, canonicalId, asOf, ['ACTIVATED']);
  return isWithinDays(date, asOf, FEATURE.acquiredWithinDays);
}

/**
 * Same-position teammates on the subject's current team (REGISTRY §20.F10):
 * the current roster snapshot per player, filtered to the team and position,
 * excluding the subject and any FREE_AGENT; IR/PUP/NFI/SUSPENDED/PRACTICE_SQUAD/
 * RESERVE are INCLUDED (down-weighted later by availability, not removed here).
 */
export function samePositionTeammates(
  entries: readonly RosterEntry[],
  subjectId: string,
  team: string,
  position: SupportedPosition,
  asOf: string,
): RosterEntry[] {
  const ids = new Set(entries.map((e) => e.canonicalId));
  const out: RosterEntry[] = [];
  for (const id of ids) {
    if (id === subjectId) continue;
    const entry = currentRosterEntry(entries, id, asOf);
    if (!entry) continue;
    if (entry.team === team && entry.position === position && entry.status !== 'FREE_AGENT') {
      out.push(entry);
    }
  }
  return out;
}

/**
 * games_missed_rate over the last `EXPECTED_GAMES.missedRateWindowGames` team
 * regular-season games with kickoff < asOf (REGISTRY §7.2). 0 when no history.
 */
export function gamesMissedRateLast16(
  schedule: readonly ScheduleGame[],
  usage: readonly PlayerGameUsage[],
  canonicalId: string,
  team: string,
  asOf: string,
): number {
  const asOfMs = Date.parse(asOf);
  const teamGames = schedule
    .filter((g) => g.team === team && g.seasonType === 'REG' && Date.parse(g.kickoff) < asOfMs)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    .slice(0, EXPECTED_GAMES.missedRateWindowGames);
  if (teamGames.length === 0) return 0;
  const playedGameIds = new Set(
    regularSeasonOnly(usage)
      .filter((r) => r.canonicalId === canonicalId)
      .map((r) => r.gameId),
  );
  const played = teamGames.filter((g) => playedGameIds.has(g.gameId)).length;
  const missed = teamGames.length - played;
  return missed / teamGames.length;
}

// --- internal helpers ---

function latestEventDate(
  transactions: readonly TransactionEvent[],
  canonicalId: string,
  asOf: string,
  types: readonly TransactionEvent['type'][],
): string | null {
  const eligible = transactions.filter(
    (t) =>
      t.canonicalId === canonicalId &&
      types.includes(t.type) &&
      withinAsOf(asOf, t.date),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, t) => (Date.parse(t.date) > Date.parse(best.date) ? t : best)).date;
}

function isWithinDays(date: string | null, asOf: string, days: number): boolean {
  if (date === null) return false;
  const delta = Date.parse(asOf) - Date.parse(date);
  return delta >= 0 && delta <= days * DAY_MS;
}

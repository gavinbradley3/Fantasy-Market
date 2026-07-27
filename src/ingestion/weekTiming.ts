// Season/week → game identity and timing (Phase 11 correction).
//
// WHY THIS EXISTS
// The provider publishes two different shapes for player game statistics. The schedule-
// joined shape carries `game_id` and a real `kickoff`. The weekly player-stats resource —
// the one an ordinary nflverse export gives you — identifies a game only by
// `season` + `week` + team, with no timestamp at all.
//
// The pipeline needs a game key and an instant for two purposes only: ORDERING games
// within a player's career/recent windows, and AS-OF CLAMPING. Both are week-resolution
// questions, so a week-resolution instant answers them exactly.
//
// WHAT IS AND IS NOT CLAIMED
// The instant below is a DERIVED WEEK BOUNDARY, computed from the provider's own `season`
// and `week` by a fixed calendar rule. It is not an observed kickoff and is never presented
// as one: no engine input, explanation or published field carries it. It is used only as an
// ordering/clamping key, and it is only ever produced when the provider supplied no real
// kickoff — a real one always wins.
//
// THE RULE (documented, deterministic, no lookup table)
//   Labor Day        = the first Monday in September of `season`
//   Week 1 kickoff   = Labor Day + 3 days (the Thursday that opens the NFL season)
//   Week N boundary  = Week 1 + (N − 1) × 7 days, at 00:00:00 UTC
//
// This is the real NFL scheduling convention, so a derived boundary lands in the correct
// calendar week — which is the precision the windows and the as-of clamp actually need.

const DAY_MS = 24 * 60 * 60 * 1000;

/** First Monday of September for a season year, at 00:00:00 UTC. */
function laborDay(season: number): Date {
  const d = new Date(Date.UTC(season, 8, 1)); // month 8 = September
  const dow = d.getUTCDay(); // 0 = Sunday, 1 = Monday
  const offset = dow === 1 ? 0 : (8 - dow) % 7;
  return new Date(d.getTime() + offset * DAY_MS);
}

/**
 * The derived week-boundary instant for a (season, week) pair, or null when either is
 * missing or out of range. Never guesses a season or a week.
 */
export function weekBoundaryIso(season: number | null, week: number | null): string | null {
  if (season === null || week === null) return null;
  if (!Number.isInteger(season) || !Number.isInteger(week)) return null;
  if (season < 1920 || season > 2200) return null;
  if (week < 1 || week > 30) return null;
  const opener = laborDay(season).getTime() + 3 * DAY_MS;
  return new Date(opener + (week - 1) * 7 * DAY_MS).toISOString();
}

/**
 * A deterministic game key for the weekly-stats shape: `<season>_<WW>_<TEAM>`.
 *
 * This mirrors the provider's own `game_id` convention closely enough to be stable and
 * readable, and it is unique per (season, week, team) — which is exactly the granularity
 * of a weekly player-stats row. It is only used when the provider supplied no `game_id`.
 */
export function derivedGameId(season: number | null, week: number | null, team: string): string | null {
  if (season === null || week === null || !team) return null;
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) return null;
  return `${season}_${String(week).padStart(2, '0')}_${team}`;
}

/**
 * Season and week read out of an nflverse game id (`2025_01_DAL_PHI`).
 *
 * This is PARSING the provider's own identifier, not guessing: the id's first two segments
 * are the season and the week the provider itself assigned to the game. Some resources —
 * the play-level participation export in particular — carry the game id and nothing else
 * temporal, so this is the only authoritative way to place those rows in a season.
 *
 * Returns `null` for anything that does not match the documented shape, so a changed id
 * convention surfaces as missing data rather than as a plausible wrong answer.
 */
export function parseNflverseGameId(gameId: string): { season: number; week: number } | null {
  const m = /^(\d{4})_(\d{2})_/.exec(gameId);
  if (!m) return null;
  const season = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isInteger(season) || !Number.isInteger(week)) return null;
  if (season < 1920 || season > 2200 || week < 1 || week > 30) return null;
  return { season, week };
}

/**
 * Completed years between a birth date and a reference instant.
 *
 * The provider's players export publishes `birth_date` but not `age`. Age is then a
 * DETERMINISTIC DERIVATION from an authoritative field — the ordinary calendar rule, whole
 * years only, no rounding and no estimation. An unknown or unparseable birth date yields
 * `null`: age is never guessed from experience, draft year, or anything else.
 *
 * The reference instant is the provider snapshot's effective date, so the value means
 * "age as at the data's effective date" and is stable for a given snapshot.
 */
export function ageFromBirthDate(birthDate: string | null, referenceIso: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  const ref = new Date(referenceIso);
  if (Number.isNaN(born.getTime()) || Number.isNaN(ref.getTime())) return null;

  let age = ref.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = ref.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < born.getUTCDate())) age -= 1;
  // A negative or implausible age means the inputs disagree; report nothing rather than a number.
  return age >= 0 && age <= 70 ? age : null;
}

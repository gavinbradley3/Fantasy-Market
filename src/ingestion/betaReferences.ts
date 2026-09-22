/**
 * Capture-backed facts for the private beta. This is NOT a v2 role-reference
 * bundle: weekly roster snapshots never become tenure intervals, and a final
 * marker known by capture time never becomes an invented game-ending instant.
 * Nothing in this module authorizes a value, a current-role claim or publication.
 */
import { normalizeTeam } from './ordering';

export const BETA_REFERENCE_LEDGER_VERSION = 'playerticker.controlled-beta.reference-ledger/v1' as const;

export type BetaRawRow = Readonly<Record<string, string>>;
export interface BetaReferenceSource {
  id: string;
  checksum: string;
  capturedAt: string;
  sourceUpdatedAt?: string | null;
}
export interface BetaReferenceTable {
  source: BetaReferenceSource;
  rows: readonly BetaRawRow[];
}
export interface BetaReferenceInput {
  asOf: string;
  valuationSeasons: readonly number[];
  schedule: BetaReferenceTable;
  playByPlay: BetaReferenceTable;
  roster: BetaReferenceTable;
  games?: readonly BetaReferenceTable[];
  identities?: readonly { canonicalId: string; gsisId: string }[];
}
export interface BetaReferenceIssue { code: string; sourceId: string; row: number | null }
export interface BetaRowProvenance { sourceId: string; row: number; knownAt: string }
export interface BetaGameReference {
  gameId: string;
  season: number;
  week: number;
  teams: readonly [string, string];
  canonicalTeams: readonly [string, string];
  scheduledDate: string;
  scheduledLocalTime: string | null;
  actualStartedAt: string | null;
  state: 'FINAL_KNOWN_BY' | 'POSTPONED' | 'CANCELLED' | 'COMPLETION_UNCONFIRMED';
  finalKnownBy: string | null;
  // Absence here is intentional, not a guessed kickoff+duration or retrieval time.
  completedAt: null;
  finalProof: BetaRowProvenance[];
  scheduleProvenance: BetaRowProvenance;
  officialQBStarterGsis: Readonly<Record<string, string>>;
}
export interface BetaMembershipObservation {
  gsisId: string | null;
  canonicalId: string | null;
  team: string | null;
  canonicalTeam: string | null;
  season: number;
  week: number;
  position: string | null;
  rawStatus: string | null;
  rawStatusDescription: string | null;
  statusEvidence: 'EXPLICIT_RAW_STATUS' | 'MISSING_RAW_STATUS';
  timePrecision: 'SEASON_WEEK';
  provenance: BetaRowProvenance;
}
export interface BetaHistoricalUsage {
  gsisId: string;
  canonicalId: string | null;
  gameId: string | null;
  team: string;
  canonicalTeam: string;
  season: number;
  week: number;
  timePrecision: 'SEASON_WEEK';
  scheduledDate: string | null;
  carries: number | null;
  targets: number | null;
  receptions: number | null;
  receivingYards: number | null;
  rushingYards: number | null;
  passingYards: number | null;
  provenance: BetaRowProvenance;
}
export interface BetaReferenceLedger {
  version: typeof BETA_REFERENCE_LEDGER_VERSION;
  asOf: string;
  valuationSeasons: number[];
  sources: BetaReferenceSource[];
  inputIntegrity: boolean;
  issues: BetaReferenceIssue[];
  games: BetaGameReference[];
  memberships: BetaMembershipObservation[];
  historicalUsage: BetaHistoricalUsage[];
  // These are deliberately empty, not inferred from the observations above.
  membershipIntervals: never[];
  roleAttestations: never[];
  availabilityAttestations: never[];
  capabilities: {
    finalStatusKnownBy: { confirmed: number; unconfirmedPastScheduled: number };
    continuousMembership: false;
    teamAuthoritativeRoleAttestation: false;
    validThroughAvailabilityAttestation: false;
  };
  missingCapabilities: string[];
  numericalEligibilityAuthorized: false;
  productionPublicationAuthorized: false;
}

// nflverse's literal NA token denotes an absent CSV observation, not a status/team.
const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim(); return trimmed && trimmed !== 'NA' ? trimmed : null;
};
const safeId = (value: string | undefined): string | null => {
  const v = clean(value);
  return v && /^[A-Za-z0-9_.:-]{1,160}$/.test(v) ? v : null;
};
const integer = (value: string | undefined): number | null => {
  const v = clean(value);
  return v && /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
};
const iso = (value: string): boolean => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
const dateOnly = (value: string | undefined): string | null => {
  const v = clean(value);
  return v && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))
    && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
};
const team = (value: string | undefined): string | null => {
  const v = clean(value);
  return v && /^[A-Z]{2,3}$/.test(v) ? v : null;
};
const gameId = (value: string | undefined): string | null => {
  const v = clean(value);
  return v && /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(v) ? v : null;
};

/** nflverse start_time is documented as Eastern actual kickoff, not END_GAME. */
function easternStart(value: string | null): string | null {
  const m = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),? (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = Number(m[3]) + (m[3].length === 2 ? 2000 : 0);
  const local = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${m[6]}`;
  const initial = Date.parse(`${local}Z`);
  if (!Number.isFinite(initial) || new Date(initial).toISOString().slice(0, 19) !== local) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = (time: number) => Object.fromEntries(formatter.formatToParts(time).map((p) => [p.type, p.value]));
  const localString = (p: Record<string, string>) => `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  let instant = initial;
  for (let i = 0; i < 2; i += 1) instant += initial - Date.parse(`${localString(parts(instant))}Z`);
  return localString(parts(instant)) === local ? new Date(instant).toISOString() : null;
}

/**
 * Pure deterministic transformation. Callers verify raw-byte checksums before
 * parsing; this boundary validates identities, capture times, joins and records.
 * Errors retain safe source coordinates, never raw payloads or provider URLs.
 */
export function buildBetaReferenceLedger(input: BetaReferenceInput): BetaReferenceLedger {
  if (!iso(input.asOf) || !input.valuationSeasons.length || input.valuationSeasons.some((s) => !Number.isInteger(s) || s < 2000 || s > 2100)) {
    throw new Error('BETA_REFERENCE_SCOPE_INVALID');
  }
  const asOf = Date.parse(input.asOf);
  const asOfDate = new Date(asOf).toISOString().slice(0, 10);
  const issues: BetaReferenceIssue[] = [];
  const issue = (code: string, source: BetaReferenceSource, row: number | null) => {
    issues.push({ code, sourceId: safeId(source.id) ?? 'invalid-source-id', row });
  };
  const tables = [input.schedule, input.playByPlay, input.roster, ...(input.games ?? [])];
  const seenSources = new Set<string>();
  for (const table of tables) {
    const s = table.source;
    if (!safeId(s.id) || !/^[a-f0-9]{64}$/.test(s.checksum) || !iso(s.capturedAt)
      || Date.parse(s.capturedAt) > asOf || (s.sourceUpdatedAt != null && (!iso(s.sourceUpdatedAt) || Date.parse(s.sourceUpdatedAt) > Date.parse(s.capturedAt)))
      || seenSources.has(s.id)) throw new Error('BETA_REFERENCE_SOURCE_IDENTITY_INVALID');
    seenSources.add(s.id);
  }
  const identity = new Map<string, string>();
  for (const p of input.identities ?? []) {
    if (!safeId(p.gsisId) || !safeId(p.canonicalId) || (identity.has(p.gsisId) && identity.get(p.gsisId) !== p.canonicalId)) {
      throw new Error('BETA_REFERENCE_PLAYER_IDENTITY_INVALID');
    }
    identity.set(p.gsisId, p.canonicalId);
  }
  const provenance = (source: BetaReferenceSource, row: number): BetaRowProvenance => ({ sourceId: source.id, row, knownAt: source.capturedAt });
  const schedule = new Map<string, BetaGameReference>();
  const invalidScheduleIds = new Set<string>();
  input.schedule.rows.forEach((r, i) => {
    if (r.game_type !== 'REG') return;
    const season = integer(r.season); const week = integer(r.week); const id = gameId(r.game_id);
    const away = team(r.away_team); const home = team(r.home_team); const date = dateOnly(r.gameday);
    if (!season || !week || week > 22 || !id || !away || !home || away === home || !date
      || id !== `${season}_${String(week).padStart(2, '0')}_${away}_${home}`) {
      issue('SCHEDULE_COORDINATE_INVALID', input.schedule.source, i); return;
    }
    if (schedule.has(id)) {
      invalidScheduleIds.add(id); issue('SCHEDULE_COORDINATE_CONFLICT', input.schedule.source, i); return;
    }
    const rawState = clean(r.status)?.toUpperCase();
    schedule.set(id, { gameId: id, season, week, teams: [away, home], canonicalTeams: [normalizeTeam(away)!, normalizeTeam(home)!], scheduledDate: date,
      scheduledLocalTime: clean(r.gametime), actualStartedAt: null,
      state: rawState === 'POSTPONED' ? 'POSTPONED' : rawState === 'CANCELLED' ? 'CANCELLED' : 'COMPLETION_UNCONFIRMED',
      finalKnownBy: null, completedAt: null, finalProof: [], scheduleProvenance: provenance(input.schedule.source, i),
      officialQBStarterGsis: Object.fromEntries([[away, safeId(r.away_qb_id)], [home, safeId(r.home_qb_id)]].filter((e): e is [string, string] => e[1] !== null)),
    });
  });
  for (const id of invalidScheduleIds) schedule.delete(id);

  const startTimes = new Map<string, Set<string>>();
  const invalidPbpIds = new Set<string>();
  input.playByPlay.rows.forEach((r, i) => {
    const id = gameId(r.game_id); const game = id ? schedule.get(id) : undefined;
    if (!id || !game) { issue('PBP_SCHEDULE_JOIN_UNRESOLVED', input.playByPlay.source, i); return; }
    if ((clean(r.home_team) && normalizeTeam(r.home_team) !== game.canonicalTeams[1]) || (clean(r.away_team) && normalizeTeam(r.away_team) !== game.canonicalTeams[0])) {
      invalidPbpIds.add(id); issue('PBP_TEAM_CONFLICT', input.playByPlay.source, i); return;
    }
    const rawStart = clean(r.start_time);
    if (rawStart) {
      const start = easternStart(rawStart);
      if (!start || Date.parse(start) > asOf || Date.parse(start) > Date.parse(input.playByPlay.source.capturedAt)) {
        invalidPbpIds.add(id); issue('PBP_START_TIME_INVALID_OR_FUTURE', input.playByPlay.source, i); return;
      }
      const values = startTimes.get(id) ?? new Set<string>(); values.add(start); startTimes.set(id, values);
    }
    if (r.play_type_nfl !== 'END_GAME') return;
    const capturedDate = new Date(input.playByPlay.source.capturedAt).toISOString().slice(0, 10);
    const [year, month, day] = game.scheduledDate.split('-');
    const scheduledInstant = game.scheduledLocalTime && /^\d\d:\d\d$/.test(game.scheduledLocalTime)
      ? easternStart(`${month}/${day}/${year}, ${game.scheduledLocalTime}:00`) : null;
    const hasProvenStart = (startTimes.get(id)?.size ?? 0) > 0;
    if (game.scheduledDate > asOfDate || game.scheduledDate > capturedDate
      || (!hasProvenStart && scheduledInstant && Date.parse(scheduledInstant) > Date.parse(input.playByPlay.source.capturedAt))) {
      invalidPbpIds.add(id); issue('PBP_FUTURE_FINAL_EVENT', input.playByPlay.source, i); return;
    }
    if (game.state === 'POSTPONED' || game.state === 'CANCELLED') {
      invalidPbpIds.add(id); issue('GAME_FINAL_STATUS_CONFLICT', input.playByPlay.source, i); return;
    }
    game.state = 'FINAL_KNOWN_BY';
    game.finalKnownBy = input.playByPlay.source.capturedAt;
    game.finalProof.push(provenance(input.playByPlay.source, i));
  });
  for (const [id, starts] of startTimes) {
    if (starts.size > 1) {
      invalidPbpIds.add(id); issue('PBP_START_TIME_CONFLICT', input.playByPlay.source, null);
    } else schedule.get(id)!.actualStartedAt = [...starts][0];
  }
  for (const id of invalidPbpIds) {
    const game = schedule.get(id)!;
    game.state = 'COMPLETION_UNCONFIRMED'; game.finalKnownBy = null; game.finalProof = []; game.actualStartedAt = null;
  }

  const scheduleByPeriod = new Map<string, BetaGameReference[]>();
  const scheduleByTeamPeriod = new Map<string, BetaGameReference[]>();
  for (const game of schedule.values()) {
    const period = `${game.season}/${game.week}`;
    scheduleByPeriod.set(period, [...(scheduleByPeriod.get(period) ?? []), game]);
    for (const t of game.canonicalTeams) {
      const key = `${period}/${t}`;
      scheduleByTeamPeriod.set(key, [...(scheduleByTeamPeriod.get(key) ?? []), game]);
    }
  }

  const memberships: BetaMembershipObservation[] = [];
  const membershipKeys = new Map<string, Set<string | null>>();
  input.roster.rows.forEach((r, i) => {
    if (r.game_type !== 'REG') return;
    const season = integer(r.season); const week = integer(r.week);
    if (!season || !week || week > 22) { issue('ROSTER_PERIOD_INVALID', input.roster.source, i); return; }
    const periodGames = scheduleByPeriod.get(`${season}/${week}`) ?? [];
    if (season > Number(asOfDate.slice(0, 4)) || (periodGames.length && periodGames.every((g) => g.scheduledDate > asOfDate))) {
      issue('ROSTER_PERIOD_FUTURE', input.roster.source, i); return;
    }
    const gsis = safeId(r.gsis_id); const observedTeam = team(r.team);
    if (clean(r.gsis_id) && !gsis) { issue('ROSTER_IDENTITY_INVALID', input.roster.source, i); return; }
    if (clean(r.team) && !observedTeam) { issue('ROSTER_TEAM_INVALID', input.roster.source, i); return; }
    const rawStatus = clean(r.status);
    memberships.push({ gsisId: gsis, canonicalId: gsis ? identity.get(gsis) ?? null : null, team: observedTeam,
      canonicalTeam: normalizeTeam(observedTeam), season, week,
      position: clean(r.position), rawStatus, rawStatusDescription: clean(r.status_description_abbr),
      statusEvidence: rawStatus === null ? 'MISSING_RAW_STATUS' : 'EXPLICIT_RAW_STATUS', timePrecision: 'SEASON_WEEK',
      provenance: provenance(input.roster.source, i) });
    if (gsis) {
      const key = `${gsis}/${season}/${week}`; const teams = membershipKeys.get(key) ?? new Set<string | null>();
      teams.add(normalizeTeam(observedTeam)); membershipKeys.set(key, teams);
      if (teams.size > 1) issue('ROSTER_TEAM_CONFLICT', input.roster.source, i);
    }
  });

  const historicalUsage: BetaHistoricalUsage[] = [];
  for (const table of input.games ?? []) table.rows.forEach((r, i) => {
    if (r.season_type !== 'REG' && r.game_type !== 'REG') return;
    const gsis = safeId(r.player_id); const season = integer(r.season); const week = integer(r.week); const t = team(r.team);
    // Blank team-total identifiers are not player observations.
    if (!clean(r.player_id)) return;
    if (!gsis || !season || !week || week > 22 || !t) { issue('USAGE_COORDINATE_INVALID', table.source, i); return; }
    const canonicalTeam = normalizeTeam(t)!;
    const opponent = normalizeTeam(clean(r.opponent_team));
    const candidates = (scheduleByTeamPeriod.get(`${season}/${week}/${canonicalTeam}`) ?? []).filter((g) =>
      !opponent || (opponent !== canonicalTeam && g.canonicalTeams.includes(opponent)));
    const rawId = clean(r.game_id); const game = rawId ? schedule.get(rawId) : candidates.length === 1 ? candidates[0] : undefined;
    if (!game || !candidates.includes(game)) { issue('USAGE_GAME_JOIN_UNRESOLVED', table.source, i); }
    if (game && game.scheduledDate > asOfDate) { issue('USAGE_EVENT_FUTURE', table.source, i); return; }
    const stat = (key: string): number | null => {
      const raw = clean(r[key]); if (raw === null) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || (['carries', 'targets', 'receptions'].includes(key) && (!Number.isInteger(value) || value < 0))) {
        issue('USAGE_STAT_INVALID', table.source, i); return null;
      }
      return value;
    };
    historicalUsage.push({ gsisId: gsis, canonicalId: identity.get(gsis) ?? null, gameId: game?.gameId ?? null,
      team: t, canonicalTeam, season, week, timePrecision: 'SEASON_WEEK', scheduledDate: game?.scheduledDate ?? null,
      carries: stat('carries'), targets: stat('targets'), receptions: stat('receptions'), receivingYards: stat('receiving_yards'),
      rushingYards: stat('rushing_yards'), passingYards: stat('passing_yards'), provenance: provenance(table.source, i) });
  });
  const games = [...schedule.values()].filter((g) => input.valuationSeasons.includes(g.season)).sort((a, b) => a.gameId.localeCompare(b.gameId));
  const sortRecords = <T extends { provenance: BetaRowProvenance }>(records: T[]) => records.sort((a, b) => a.provenance.sourceId.localeCompare(b.provenance.sourceId) || a.provenance.row - b.provenance.row);
  return { version: BETA_REFERENCE_LEDGER_VERSION, asOf: input.asOf,
    valuationSeasons: [...new Set(input.valuationSeasons)].sort((a, b) => a - b),
    sources: tables.map((t) => ({ ...t.source })).sort((a, b) => a.id.localeCompare(b.id)), inputIntegrity: issues.length === 0,
    issues: issues.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || (a.row ?? -1) - (b.row ?? -1) || a.code.localeCompare(b.code)),
    games, memberships: sortRecords(memberships), historicalUsage: sortRecords(historicalUsage),
    membershipIntervals: [], roleAttestations: [], availabilityAttestations: [],
    capabilities: { finalStatusKnownBy: { confirmed: games.filter((g) => g.state === 'FINAL_KNOWN_BY').length,
      unconfirmedPastScheduled: games.filter((g) => g.state === 'COMPLETION_UNCONFIRMED' && g.scheduledDate <= asOfDate).length },
      continuousMembership: false, teamAuthoritativeRoleAttestation: false, validThroughAvailabilityAttestation: false },
    missingCapabilities: ['CONTINUOUS_TEAM_MEMBERSHIP_NOT_ESTABLISHED', 'TEAM_AUTHORITATIVE_ROLE_ATTESTATION_UNAVAILABLE',
      'VALID_THROUGH_AVAILABILITY_ATTESTATION_UNAVAILABLE'], numericalEligibilityAuthorized: false, productionPublicationAuthorized: false };
}

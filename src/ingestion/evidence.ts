// Evidence builders (Phase 4 §4/§8). Turn the normalized snapshot into the AIL's
// typed `NormalizedEvidence` + observed facts + a `CanonicalPlayer`, for ONE player at
// an as-of date. NO inference happens here — only evidence CONSTRUCTION. Where a
// derived availability probability is needed the AIL's own `availabilityProbability`
// lookup is reused (never re-derived) so the number cannot diverge from the registry.

import { present, notProvided } from '@/pipeline/provenance';
import { toInjuryStatus } from '@/pipeline/readiness/engineReadiness';
import type { CanonicalPlayer, CanonicalStatus, ProviderId, SupportedPosition } from '@/pipeline/types';
import { availabilityProbability, type AvailabilityState, type InjuryStatus } from '@/inference/availability';
import type { NormalizedEvidence } from '@/inference/production/orchestrate';
import type { CompetitionPosition, CompetitionTeammate } from '@/inference/competition';
import type { RosterStatus } from '@/inference/features/types';
import { observedCountingFacts, D2_ROLE_WINDOW_GAMES, RECENT_GAME_WINDOW } from './observedFacts';
import { compareOrdinal, withinAsOf } from './ordering';
import type { NormalizedSnapshot } from './snapshot';
import type {
  GameStatRecord,
  InjuryRecord,
  IngestionProvider,
  OfficialStartRecord,
  ParticipationRecord,
  PlayerRecord,
  RosterRecord,
  TransactionRecord,
} from './types';

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Per-player lookups over one snapshot, built once and reused.
 *
 * Every collection here is scanned per player, and a live snapshot is large: ~25k identity
 * records, ~140k weekly roster rows, ~58k game rows. Resolving a player's teammates now
 * requires a point-in-time roster lookup for each same-position player, so scanning the
 * whole roster collection each time is quadratic in the roster and cubic across a board —
 * enough to turn a working run into one that never finishes.
 *
 * This is a pure derived cache: same snapshot in, same groupings out, no ordering or
 * content change. It is keyed on the snapshot object itself, so a new snapshot builds a new
 * index and a stale one can never be read.
 */
interface SnapshotIndex {
  readonly playersById: ReadonlyMap<string, PlayerRecord>;
  readonly playersByPosition: ReadonlyMap<string, readonly PlayerRecord[]>;
  readonly rostersByPlayer: ReadonlyMap<string, readonly RosterRecord[]>;
  readonly gamesByPlayer: ReadonlyMap<string, readonly GameStatRecord[]>;
  readonly participationByPlayer: ReadonlyMap<string, readonly ParticipationRecord[]>;
  readonly injuriesByPlayer: ReadonlyMap<string, readonly InjuryRecord[]>;
  readonly transactionsByPlayer: ReadonlyMap<string, readonly TransactionRecord[]>;
  readonly officialStartsByPlayer: ReadonlyMap<string, readonly OfficialStartRecord[]>;
}

const INDEX_CACHE = new WeakMap<NormalizedSnapshot, SnapshotIndex>();

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function indexOf(snapshot: NormalizedSnapshot): SnapshotIndex {
  const cached = INDEX_CACHE.get(snapshot);
  if (cached) return cached;
  const byCanonical = <T extends { canonicalId: string | null }>(items: readonly T[]) =>
    groupBy(items, (i) => i.canonicalId);
  const index: SnapshotIndex = {
    playersById: new Map(snapshot.players.filter((p) => p.canonicalId).map((p) => [p.canonicalId as string, p])),
    playersByPosition: groupBy(snapshot.players, (p) => p.position),
    rostersByPlayer: byCanonical(snapshot.rosters),
    gamesByPlayer: byCanonical(snapshot.games),
    participationByPlayer: byCanonical(snapshot.participation),
    injuriesByPlayer: byCanonical(snapshot.injuries),
    transactionsByPlayer: byCanonical(snapshot.transactions),
    officialStartsByPlayer: byCanonical(snapshot.officialStarts),
  };
  INDEX_CACHE.set(snapshot, index);
  return index;
}

const EMPTY: readonly never[] = [];

export interface BuiltEvidence {
  readonly player: CanonicalPlayer;
  readonly facts: Record<string, unknown>;
  readonly factTimestamps: Record<string, string>;
  readonly evidence: NormalizedEvidence;
  readonly freshnessBySource: Record<string, number>;
}

/** Map an ingestion provider to the canonical ProviderId space (sleeper|nflverse). */
function toProviderId(p: IngestionProvider): ProviderId {
  return p === 'sleeper' ? 'sleeper' : 'nflverse';
}

/** Latest record (by sourceTimestamp) at or before asOf. */
function latest<T extends { sourceTimestamp: string }>(recs: readonly T[], asOf: string): T | null {
  let best: T | null = null;
  for (const r of recs) {
    if (!withinAsOf(asOf, r.sourceTimestamp)) continue;
    if (best === null || r.sourceTimestamp > best.sourceTimestamp) best = r;
  }
  return best;
}

/**
 * Availability state for a player, from the injury feed when one exists and from the
 * player's own canonical status when it does not.
 *
 * THE FALLBACK IS NOT A DEFAULT. Assuming HEALTHY whenever no injury record is present is
 * only safe if an injury feed is present at all. nflverse publishes none, so that assumption
 * silently declared every released, reserve and physically-unable-to-perform player fit —
 * while the ENGINE metadata read the same player's status and reported OUT. The engine
 * cross-validates the pair (`probability_active` must be 0 when the status is OUT/IR/PUP)
 * and threw the player out for contradicting itself.
 *
 * So when there is no injury record the status the player already carries is used, through
 * the same `toInjuryStatus` mapper the readiness layer uses for the engine metadata. Both
 * sides now read one source and cannot disagree. Only a player with neither an injury record
 * nor a status falls through to UNKNOWN, which is the honest description of that case.
 */
function injuryToState(inj: InjuryRecord | null, player: PlayerRecord, pit: PointInTimeFacts): AvailabilityState {
  const pid = toProviderId(player.freshness.provider);
  const ts = player.sourceTimestamp;
  const injuryStatus: InjuryStatus =
    inj !== null
      ? (inj.injuryStatus as InjuryStatus)
      : toInjuryStatus(
          pit.status !== null
            ? { present: true, value: pit.status, provenance: 'DIRECT', provider: pid, sourceTimestamp: ts }
            : { present: false, reason: 'NOT_PROVIDED' },
          pit.injuryDesignation !== null
            ? { present: true, value: pit.injuryDesignation, provenance: 'DIRECT', provider: pid, sourceTimestamp: ts }
            : { present: false, reason: 'NOT_PROVIDED' },
        );
  const practice = inj?.practiceStatus ?? 'UNKNOWN';
  return { injuryStatus, practiceStatus: practice, recentlyActivated: false, freeAgent: false, practiceSquad: false };
}

/**
 * The time-varying facts about a player, resolved AT the as-of date.
 *
 * Team and status are not properties of a player; they are properties of a player *at a
 * date*. A current-state identity export cannot answer them for a past board — it reports
 * today. So each is taken from the newest weekly roster row at or before the as-of, and the
 * identity export is used only when the provider attests it at or before the as-of too.
 * When neither is available the field is genuinely unknown and is reported as absent rather
 * than filled in from the present.
 */
interface PointInTimeFacts {
  readonly team: string | null;
  readonly status: CanonicalStatus | null;
  readonly injuryDesignation: string | null;
  /** True when the identity export's own content is attested at or before the as-of. */
  readonly identityAttested: boolean;
}

/** Roster status → the canonical four-value status the engines' metadata uses. */
const ROSTER_TO_CANONICAL: Readonly<Record<RosterRecord['rosterStatus'], CanonicalStatus>> = {
  ACTIVE: 'active',
  IR: 'injured',
  PUP: 'injured',
  NFI: 'injured',
  SUSPENDED: 'suspended',
  PRACTICE_SQUAD: 'inactive',
  RESERVE: 'inactive',
};

function resolvePointInTime(
  rec: PlayerRecord,
  index: SnapshotIndex,
  canonicalId: string,
  asOf: string,
): PointInTimeFacts {
  const identityAttested = withinAsOf(asOf, rec.sourceTimestamp);
  const roster = latest(index.rostersByPlayer.get(canonicalId) ?? EMPTY, asOf);
  return {
    team: roster?.team ?? (identityAttested ? rec.team : null),
    status: roster ? ROSTER_TO_CANONICAL[roster.rosterStatus] : identityAttested ? (rec.status as CanonicalStatus | null) : null,
    // An injury designation has no historical source here at all, so it is only ever used
    // when the identity export itself is attested for the as-of.
    injuryDesignation: identityAttested ? rec.injuryDesignation : null,
    identityAttested,
  };
}

function buildCanonicalPlayer(
  rec: PlayerRecord,
  position: SupportedPosition,
  asOf: string,
  pit: PointInTimeFacts,
): CanonicalPlayer {
  const pid = toProviderId(rec.freshness.provider);
  const ts = rec.sourceTimestamp;
  const status = pit.status;
  return {
    identity: {
      canonical_id: rec.canonicalId ?? '',
      provider_ids: {
        sleeper: rec.providerIds.sleeper,
        gsis: rec.providerIds.gsis,
        espn: rec.providerIds.espn,
      },
      name_normalized: rec.nameNormalized,
      newly_created: false,
    },
    position,
    full_name: present(rec.nameNormalized, pid, ts),
    team: pit.team ? present(pit.team, pid, ts) : notProvided(),
    age: rec.age !== null ? present(rec.age, pid, ts) : notProvided(),
    birth_date: notProvided(),
    nfl_seasons_completed: rec.nflSeasonsCompleted !== null ? present(rec.nflSeasonsCompleted, pid, ts) : notProvided(),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: rec.draftRound !== null ? present(rec.draftRound, pid, ts) : notProvided(),
    draft_pick: notProvided(),
    height_inches: notProvided(),
    weight_pounds: notProvided(),
    jersey_number: notProvided(),
    status: status ? present(status, pid, ts) : notProvided(),
    injury_designation: pit.injuryDesignation ? present(pit.injuryDesignation, pid, ts) : notProvided(),
    headshot_url: notProvided(),
    provenance: { sources: [pid], generated_at: asOf },
  };
}

/** Build the complete evidence bundle for one player. */
export function buildEvidenceFor(
  snapshot: NormalizedSnapshot,
  canonicalId: string,
  position: SupportedPosition,
  asOf: string,
): BuiltEvidence | null {
  const index = indexOf(snapshot);
  const playerRec = index.playersById.get(canonicalId);
  if (!playerRec) return null;

  // Every time-varying fact is resolved AT the as-of before anything reads it, so no later
  // step can quietly pick up the provider's current state.
  const pit = resolvePointInTime(playerRec, index, canonicalId, asOf);
  const team = pit.team;

  const myGames = (index.gamesByPlayer.get(canonicalId) ?? EMPTY).filter((g) => g.seasonType === 'REG' && withinAsOf(asOf, g.kickoff));
  const myParticipation = (index.participationByPlayer.get(canonicalId) ?? EMPTY).filter((p) => withinAsOf(asOf, p.kickoff));
  const myInjury = latest(index.injuriesByPlayer.get(canonicalId) ?? EMPTY, asOf);
  const myTxns = (index.transactionsByPlayer.get(canonicalId) ?? EMPTY).filter((t) => withinAsOf(asOf, t.date));

  // --- expected games (schedule + availability) ---
  const gamesLeft = team
    ? snapshot.schedule.filter((s) => s.seasonType === 'REG' && (s.homeTeam === team || s.awayTeam === team) && Date.parse(s.kickoff) > Date.parse(asOf)).length
    : 0;
  const availState = injuryToState(myInjury, playerRec, pit);
  const availProb = availabilityProbability(availState);
  const suspended = availState.injuryStatus === 'SUSPENDED';

  const evidence: {
    -readonly [K in keyof NormalizedEvidence]?: NormalizedEvidence[K];
  } = {};

  evidence.expectedGames = {
    gamesLeft,
    availProb,
    missedRateLast16: 0,
    ...(suspended ? { suspension: { suspended: true } } : {}),
  };

  // --- position-specific availability ---
  if (position === 'QB') {
    evidence.qbAvailability = { injuryStatus: availState.injuryStatus };
  } else if (position === 'RB') {
    evidence.rbAvailability = availState;
  }

  // --- roster security ---
  const yearsWithTeam = team
    ? new Set(
        (index.rostersByPlayer.get(canonicalId) ?? EMPTY)
          .filter((r) => r.team === team && withinAsOf(asOf, r.sourceTimestamp))
          .map((r) => r.season),
      ).size
    : 0;
  evidence.security = {
    draftRound: playerRec.draftRound,
    age: playerRec.age ?? 26,
    yearsWithTeam,
    recentUsageShare: null,
    negativeTransaction: negativeTxn(myTxns, asOf),
  };

  // --- competition (same-position, same-team teammates) ---
  if (team && position !== 'QB') {
    // Who a player competes with is a question about the as-of date. Reading the provider's
    // CURRENT roster would field a Februrary depth chart out of a July squad, adding players
    // who had not signed yet and dropping the ones who were actually there.
    const teammates: CompetitionTeammate[] = (index.playersByPosition.get(position) ?? EMPTY)
      .filter((p) => p.canonicalId && p.canonicalId !== canonicalId)
      .filter((p) => resolvePointInTime(p, index, p.canonicalId as string, asOf).team === team)
      .map((p) => ({
        canonicalId: p.canonicalId as string,
        draftRound: p.draftRound,
        usageShare: null,
        status: rosterStatusFor(index.rostersByPlayer.get(p.canonicalId as string) ?? EMPTY, asOf) as RosterStatus,
        recentlyAcquiredOrReturned: acquiredRecently(index.transactionsByPlayer.get(p.canonicalId as string) ?? EMPTY, asOf),
      }))
      .sort((a, b) => compareOrdinal(a.canonicalId, b.canonicalId));
    if (teammates.length > 0) {
      evidence.competition = { kind: 'teammates', position: position as CompetitionPosition, teammates };
    }
  }

  // --- D1 (routes) ---
  if (position === 'WR') {
    const covered = myParticipation.filter((p) => p.covered && p.passPlaySnaps !== null).map((p) => p.passPlaySnaps as number);
    const uncovered = myParticipation.filter((p) => !p.covered && p.passPlaySnaps !== null).map((p) => p.passPlaySnaps as number);
    evidence.d1 = { position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: covered, wrUncoveredPassPlaySnaps: uncovered };
  } else if (position === 'RB') {
    const p = latestParticipation(myParticipation, asOf);
    evidence.d1 = { position: 'RB', chartedCareerRoutes: null };
    if (p) evidence.rbRouteProxy = { rbPassPlaySnaps: p.passPlaySnaps, teamDropbacks: p.teamDropbacks };
  } else if (position === 'TE') {
    evidence.d1 = { position: 'TE', chartedCareerRoutes: null };
  }

  // --- D2 (QB starts) ---
  if (position === 'QB') {
    const rows = myGames.map((g) => gameRow(g));
    // TWO windows, because they answer different questions for different consumers
    // (REGISTRY §9.2 "Window separation"):
    //
    //   engine window (8)  → `recent_games` / `recent_starts`, which the QB engine bounds
    //                        to [0,8] and cross-validates against each other.
    //   role window (17)   → `recent_start_rate` only, which is NOT an engine input; it
    //                        feeds §6.2 starter_stability inside the environment model.
    //
    // Counting both from one window would silently redefine §9.2's rate; counting the
    // engine inputs over 17 would make the engine reject them.
    const newestFirst = [...rows].sort((a, b) => (a.kickoff < b.kickoff ? 1 : -1));
    const engineWindowGameIds = newestFirst.slice(0, RECENT_GAME_WINDOW).map((r) => r.gameId);
    const roleWindowGameIds = newestFirst.slice(0, D2_ROLE_WINDOW_GAMES).map((r) => r.gameId);

    // Official starts are counted ONLY over the games this snapshot actually holds stat
    // evidence for.
    //
    // The two counters have to describe the same universe. `career_games_played` is derived
    // from the per-game stat records that were ingested, so it spans exactly the seasons the
    // refresh acquired. The starts resource is not season-scoped in the same way — the
    // provider's schedule covers every season it has ever published — so counting every
    // start record would report a career total against a single-season game total. That is
    // not merely untidy: the QB engine rejects `career_starts > career_games_played`
    // outright, so an unscoped count silently costs the player a valuation.
    //
    // Intersecting with the observed games keeps both numbers on the same window and makes
    // the relationship true by construction. It reads as "of the games we have evidence for,
    // how many did the provider name this player as the starter for" — which is exactly what
    // the surrounding recent-window arithmetic already means.
    const observedGameIds = new Set(myGames.map((g) => g.gameId));
    const officials = (index.officialStartsByPlayer.get(canonicalId) ?? EMPTY).filter((o) =>
      observedGameIds.has(o.gameId),
    );

    if (officials.length > 0) {
      const startedGameIds = new Set(officials.filter((o) => o.started).map((o) => o.gameId));
      const engineIds = new Set(engineWindowGameIds);
      const roleIds = new Set(roleWindowGameIds);
      const started = [...startedGameIds];
      evidence.d2 = {
        asOf,
        official: {
          careerStarts: startedGameIds.size,
          recentStarts: started.filter((id) => engineIds.has(id)).length,
          recentGames: engineWindowGameIds.length,
          roleWindowStarts: started.filter((id) => roleIds.has(id)).length,
          roleWindowGames: roleWindowGameIds.length,
          provenance: 'DERIVED',
        },
      };
    } else {
      evidence.d2 = {
        asOf,
        games: rows,
        last17TeamGameIds: roleWindowGameIds,
        engineWindowTeamGameIds: engineWindowGameIds,
      };
    }
  }

  // --- observed facts ---
  // Counting stats aggregated from the per-game records already in this snapshot. These are
  // DIRECT observations, so they are supplied as FACTS and win over any AIL estimate for the
  // same field. A column no game supplied is left out entirely rather than summed to zero.
  const facts: Record<string, unknown> = { ...observedCountingFacts(position, myGames) };
  const factTimestamps: Record<string, string> = {};
  const newestGame = myGames.reduce<string | undefined>(
    (m, g) => (m === undefined || g.sourceTimestamp > m ? g.sourceTimestamp : m),
    undefined,
  );
  if (newestGame !== undefined) {
    for (const key of Object.keys(facts)) factTimestamps[key] = newestGame;
  }
  // Observed practice_status enum, when an injury record is present.
  if (myInjury) {
    facts.practice_status = myInjury.practiceStatus;
    factTimestamps.practice_status = myInjury.sourceTimestamp;
  }

  // --- freshness by source ---
  const freshnessBySource = buildFreshness(snapshot, canonicalId, asOf, myGames, myParticipation, myInjury);

  return {
    player: buildCanonicalPlayer(playerRec, position, asOf, pit),
    facts,
    factTimestamps,
    evidence: evidence as NormalizedEvidence,
    freshnessBySource,
  };
}

function gameRow(g: GameStatRecord) {
  // D2 rows are regular/post season only (callers filter to REG); PRE never reaches here.
  const seasonType: 'REG' | 'POST' = g.seasonType === 'POST' ? 'POST' : 'REG';
  return { gameId: g.gameId, kickoff: g.kickoff, seasonType, season: g.season, team: g.team, qbSnapShare: g.qbSnapShare, passAttempts: g.passAttempts };
}

function latestParticipation(recs: readonly ParticipationRecord[], asOf: string): ParticipationRecord | null {
  return latest(recs.filter((p) => withinAsOf(asOf, p.kickoff)), asOf);
}

function negativeTxn(txns: readonly TransactionRecord[], asOf: string): 'BENCH_OR_TRADE_BLOCK_OR_WAIVED' | 'IR_CHURN' | 'NONE' {
  const asOfMs = Date.parse(asOf);
  for (const t of txns) {
    if (asOfMs - Date.parse(t.date) > 8 * WEEK_MS) continue;
    if (t.type === 'BENCH' || t.type === 'WAIVE' || t.type === 'TRADE_OUT' || t.type === 'SUSPEND') return 'BENCH_OR_TRADE_BLOCK_OR_WAIVED';
    if (t.type === 'IR') return 'IR_CHURN';
  }
  return 'NONE';
}

function acquiredRecently(txns: readonly TransactionRecord[], asOf: string): boolean {
  const asOfMs = Date.parse(asOf);
  return txns.some((t) => (t.type === 'SIGN' || t.type === 'TRADE_IN' || t.type === 'ACTIVATE') && withinAsOf(asOf, t.date) && asOfMs - Date.parse(t.date) <= 8 * WEEK_MS);
}

/** The player's roster status as at `asOf` — never a later week's. */
function rosterStatusFor(rosters: readonly RosterRecord[], asOf: string): RosterRecord['rosterStatus'] {
  let best: RosterRecord | null = null;
  for (const r of rosters) {
    if (!withinAsOf(asOf, r.sourceTimestamp)) continue;
    if (best === null || r.sourceTimestamp > best.sourceTimestamp) best = r;
  }
  return best?.rosterStatus ?? 'ACTIVE';
}

function buildFreshness(
  snapshot: NormalizedSnapshot,
  canonicalId: string,
  asOf: string,
  games: readonly GameStatRecord[],
  participation: readonly ParticipationRecord[],
  injury: InjuryRecord | null,
): Record<string, number> {
  const asOfMs = Date.parse(asOf);
  const factor = (ts: string | undefined): number => (ts !== undefined && asOfMs - Date.parse(ts) <= WEEK_MS ? 1.0 : 0.7);
  const newest = <T extends { sourceTimestamp: string }>(recs: readonly T[]): string | undefined =>
    recs.reduce<string | undefined>((m, r) => (m === undefined || r.sourceTimestamp > m ? r.sourceTimestamp : m), undefined);
  const out: Record<string, number> = {};
  if (games.length) { out.nflverse_weekly = factor(newest(games)); out.snaps = factor(newest(games)); }
  if (participation.length) { out.participation = factor(newest(participation)); out.pbp = factor(newest(participation)); }
  if (snapshot.schedule.length) out.schedule = factor(newest(snapshot.schedule));
  if (injury) out.injury = factor(injury.sourceTimestamp);
  const officials = snapshot.officialStarts.filter((o) => o.canonicalId === canonicalId);
  if (officials.length) out.official_starts = factor(newest(officials));
  return out;
}

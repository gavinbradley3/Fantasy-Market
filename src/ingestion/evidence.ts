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
import { observedCountingFacts, RECENT_GAME_WINDOW } from './observedFacts';
import { compareOrdinal, withinAsOf } from './ordering';
import type { NormalizedSnapshot } from './snapshot';
import type {
  GameStatRecord,
  InjuryRecord,
  IngestionProvider,
  ParticipationRecord,
  PlayerRecord,
  RosterRecord,
  TransactionRecord,
} from './types';

const WEEK_MS = 7 * 24 * 3600 * 1000;

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
function injuryToState(inj: InjuryRecord | null, player: PlayerRecord): AvailabilityState {
  const injuryStatus: InjuryStatus =
    inj !== null
      ? (inj.injuryStatus as InjuryStatus)
      : toInjuryStatus(
          player.status !== null
            ? { present: true, value: player.status, provenance: 'DIRECT', provider: toProviderId(player.freshness.provider), sourceTimestamp: player.sourceTimestamp }
            : { present: false, reason: 'NOT_PROVIDED' },
          player.injuryDesignation !== null
            ? { present: true, value: player.injuryDesignation, provenance: 'DIRECT', provider: toProviderId(player.freshness.provider), sourceTimestamp: player.sourceTimestamp }
            : { present: false, reason: 'NOT_PROVIDED' },
        );
  const practice = inj?.practiceStatus ?? 'UNKNOWN';
  return { injuryStatus, practiceStatus: practice, recentlyActivated: false, freeAgent: false, practiceSquad: false };
}

function buildCanonicalPlayer(rec: PlayerRecord, position: SupportedPosition, asOf: string): CanonicalPlayer {
  const pid = toProviderId(rec.freshness.provider);
  const ts = rec.sourceTimestamp;
  const status = rec.status as CanonicalStatus | null;
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
    team: rec.team ? present(rec.team, pid, ts) : notProvided(),
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
    injury_designation: rec.injuryDesignation ? present(rec.injuryDesignation, pid, ts) : notProvided(),
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
  const playerRec = snapshot.players.find((p) => p.canonicalId === canonicalId);
  if (!playerRec) return null;
  const team = playerRec.team;

  const myGames = snapshot.games.filter((g) => g.canonicalId === canonicalId && g.seasonType === 'REG' && withinAsOf(asOf, g.kickoff));
  const myParticipation = snapshot.participation.filter((p) => p.canonicalId === canonicalId && withinAsOf(asOf, p.kickoff));
  const myInjury = latest(snapshot.injuries.filter((i) => i.canonicalId === canonicalId), asOf);
  const myTxns = snapshot.transactions.filter((t) => t.canonicalId === canonicalId && withinAsOf(asOf, t.date));

  // --- expected games (schedule + availability) ---
  const gamesLeft = team
    ? snapshot.schedule.filter((s) => s.seasonType === 'REG' && (s.homeTeam === team || s.awayTeam === team) && Date.parse(s.kickoff) > Date.parse(asOf)).length
    : 0;
  const availState = injuryToState(myInjury, playerRec);
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
    ? new Set(snapshot.rosters.filter((r) => r.canonicalId === canonicalId && r.team === team).map((r) => r.season)).size
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
    const teammates: CompetitionTeammate[] = snapshot.players
      .filter((p) => p.canonicalId && p.canonicalId !== canonicalId && p.team === team && p.position === position)
      .map((p) => ({
        canonicalId: p.canonicalId as string,
        draftRound: p.draftRound,
        usageShare: null,
        status: rosterStatusFor(snapshot.rosters, p.canonicalId as string) as RosterStatus,
        recentlyAcquiredOrReturned: acquiredRecently(snapshot.transactions.filter((t) => t.canonicalId === p.canonicalId), asOf),
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
    // The recent window is the ENGINE's, not §9.2's 17. `recent_starts` and `recent_games`
    // are both engine inputs, the engine bounds them to [0,8] and requires starts ≤ games,
    // and they are only consistent with each other if one window produces both. See
    // RECENT_GAME_WINDOW in ./observedFacts.ts for the conflict this resolves.
    const recentGameIdList = [...rows]
      .sort((a, b) => (a.kickoff < b.kickoff ? 1 : -1))
      .slice(0, RECENT_GAME_WINDOW)
      .map((r) => r.gameId);

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
    const officials = snapshot.officialStarts.filter(
      (o) => o.canonicalId === canonicalId && observedGameIds.has(o.gameId),
    );

    if (officials.length > 0) {
      const startedGameIds = new Set(officials.filter((o) => o.started).map((o) => o.gameId));
      const recentGameIds = new Set(recentGameIdList);
      const careerStarts = startedGameIds.size;
      const recentStarts = [...startedGameIds].filter((id) => recentGameIds.has(id)).length;
      evidence.d2 = { asOf, official: { careerStarts, recentStarts, recentGames: recentGameIdList.length, provenance: 'DERIVED' } };
    } else {
      evidence.d2 = { asOf, games: rows, last17TeamGameIds: recentGameIdList };
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
    player: buildCanonicalPlayer(playerRec, position, asOf),
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

function rosterStatusFor(rosters: readonly RosterRecord[], canonicalId: string): RosterRecord['rosterStatus'] {
  let best: RosterRecord | null = null;
  for (const r of rosters) {
    if (r.canonicalId !== canonicalId) continue;
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

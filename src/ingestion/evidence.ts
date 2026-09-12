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
import type { QBDepthChartStatus } from '@/inference/roles/roles';
import { observedCountingFacts, D2_ROLE_WINDOW_GAMES, RECENT_GAME_WINDOW } from './observedFacts';
import { observedReceivingRates } from './observedReceiving';
import { observedCareerRates } from './observedCareerRates';
import { buildTeamGameTotals, observedProduction, type TeamGameTotals } from './observedProduction';
import { compareOrdinal, withinAsOf } from './ordering';
import type { NormalizedSnapshot } from './snapshot';
import type {
  GameStatRecord,
  InjuryRecord,
  IngestionProvider,
  MergedFieldKey,
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
  /**
   * Reconstructed (team, game) carry/target totals, used for the accessible tier's role
   * shares.
   *
   * Safe to cache per snapshot rather than per as-of: the lookup key names ONE game, so every
   * row summed into a total shares that game's kickoff. A total is therefore only ever read
   * for a game the caller already established is at or before the as-of, and a game after the
   * as-of contributes to no total that is ever consulted.
   */
  readonly teamGameTotals: TeamGameTotals;
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
    teamGameTotals: buildTeamGameTotals(snapshot.games),
  };
  INDEX_CACHE.set(snapshot, index);
  return index;
}

const EMPTY: readonly never[] = [];

/**
 * Start rate over the role window at or above which a quarterback is his team's STARTER.
 *
 * A majority of the team's recent games is the plainest reading of "this is the starter", and
 * it stands in for the snap-share signal the spec's depth-chart classifier wants and the free
 * weekly export does not publish.
 */
const QB_STARTER_START_RATE = 0.5;

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
  /** The provider that supplied the surviving `status` — a roster row's, or the identity export's. */
  readonly statusProvider: IngestionProvider;
  /** The provider that supplied `injuryDesignation`. */
  readonly designationProvider: IngestionProvider;
  /** The provider that supplied the surviving `team`. */
  readonly teamProvider: IngestionProvider;
  /**
   * When the source that actually supplied `team`/`status` attested them.
   *
   * This is NOT the identity record's timestamp. A value taken from a January roster row is
   * attested in January; publishing it under the identity export's July stamp would make a
   * correct historical value read as post-as-of evidence — which is precisely the confusion
   * this whole resolution exists to remove. By construction this is always at or before the
   * as-of whenever the field is present.
   */
  readonly attestedAt: string;
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
  // Gated PER FIELD, on the timestamp of the source that actually supplied that field. On a
  // merged record these differ: biography comes from the most authoritative provider and
  // team/status/designation from the most recent one, so only the supplying source's own stamp
  // can say whether a value is evidence for this as-of. Using the record's single timestamp
  // either admits post-as-of evidence onto a historical board or withholds evidence valid for
  // it, depending on which provider happened to win the merge.
  const attestedFor = (field: 'status' | 'team' | 'injuryDesignation'): boolean =>
    withinAsOf(asOf, rec.fieldSources?.[field]?.sourceTimestamp ?? rec.sourceTimestamp);
  const statusAttested = attestedFor('status');
  const teamAttested = attestedFor('team');
  const designationAttested = attestedFor('injuryDesignation');
  const roster = latest(index.rostersByPlayer.get(canonicalId) ?? EMPTY, asOf);
  return {
    team: roster?.team ?? (teamAttested ? rec.team : null),
    status: roster ? ROSTER_TO_CANONICAL[roster.rosterStatus] : statusAttested ? (rec.status as CanonicalStatus | null) : null,
    // An injury designation has no historical source here at all, so it is only ever used when
    // the source that supplied it attested it at or before the as-of. A current designation must
    // never leak backward onto a board whose as-of predates it.
    injuryDesignation: designationAttested ? rec.injuryDesignation : null,
    identityAttested: statusAttested,
    attestedAt: roster?.sourceTimestamp ?? rec.fieldSources?.status?.sourceTimestamp ?? rec.sourceTimestamp,
    // Whoever actually supplied the status that survived: an nflverse roster row when one
    // exists, otherwise the identity export's own source.
    statusProvider: roster
      ? roster.freshness.provider
      : rec.fieldSources?.status?.provider ?? rec.freshness.provider,
    designationProvider: rec.fieldSources?.injuryDesignation?.provider ?? rec.freshness.provider,
    teamProvider: roster
      ? roster.freshness.provider
      : rec.fieldSources?.team?.provider ?? rec.freshness.provider,
  };
}

function buildCanonicalPlayer(
  rec: PlayerRecord,
  position: SupportedPosition,
  asOf: string,
  pit: PointInTimeFacts,
): CanonicalPlayer {
  // PER-FIELD ATTRIBUTION. Every field is labelled with the provider that actually supplied it
  // and the instant that provider attested it. A single record-level label was a false claim
  // about most of a merged record: it reported a status as Sleeper's when the value had come
  // from an nflverse weekly roster row, because Sleeper had won the merge and relabelled it.
  //
  // `CanonicalPlayer` already carries a `FieldState` per field with its own provider,
  // provenance and timestamp — the contract was sufficient all along and only the construction
  // below was collapsing it to one provider.
  const recordPid = toProviderId(rec.freshness.provider);
  const ts = rec.sourceTimestamp;
  /** The provider and timestamp for one merged biographical field. */
  const src = (field: MergedFieldKey): { pid: ProviderId; at: string } => {
    const fs = rec.fieldSources?.[field];
    return fs ? { pid: toProviderId(fs.provider), at: fs.sourceTimestamp } : { pid: recordPid, at: ts };
  };
  const nameSrc = src('nameNormalized');
  const ageSrc = src('age');
  const seasonsSrc = src('nflSeasonsCompleted');
  const draftSrc = src('draftRound');
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
    full_name: present(rec.nameNormalized, nameSrc.pid, nameSrc.at),
    // Team, status and injury designation are attributed to whoever actually supplied the value
    // that survived point-in-time resolution — a weekly roster row when one exists, otherwise
    // the identity export's own source.
    team: pit.team ? present(pit.team, toProviderId(pit.teamProvider), pit.attestedAt) : notProvided(),
    age: rec.age !== null ? present(rec.age, ageSrc.pid, ageSrc.at) : notProvided(),
    birth_date: notProvided(),
    nfl_seasons_completed:
      rec.nflSeasonsCompleted !== null ? present(rec.nflSeasonsCompleted, seasonsSrc.pid, seasonsSrc.at) : notProvided(),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: rec.draftRound !== null ? present(rec.draftRound, draftSrc.pid, draftSrc.at) : notProvided(),
    draft_pick: notProvided(),
    height_inches: notProvided(),
    weight_pounds: notProvided(),
    jersey_number: notProvided(),
    status: status ? present(status, toProviderId(pit.statusProvider), pit.attestedAt) : notProvided(),
    injury_designation: pit.injuryDesignation
      ? present(
          pit.injuryDesignation,
          toProviderId(pit.designationProvider),
          rec.fieldSources?.injuryDesignation?.sourceTimestamp ?? ts,
        )
      : notProvided(),
    headshot_url: notProvided(),
    // Every distinct provider that contributed a field to this record, canonically ordered.
    // Listing one provider for a mixed-provider record understated the evidence behind it.
    provenance: {
      sources: [
        ...new Set<ProviderId>([
          nameSrc.pid,
          ageSrc.pid,
          seasonsSrc.pid,
          draftSrc.pid,
          toProviderId(pit.statusProvider),
          toProviderId(pit.teamProvider),
          ...(pit.injuryDesignation ? [toProviderId(pit.designationProvider)] : []),
        ]),
      ].sort(),
      generated_at: asOf,
    },
  };
}

/** Build the complete evidence bundle for one player. */
export interface EvidenceOptions {
  /**
   * The seasons a NON-QB position is valued over.
   *
   * CAREER EVIDENCE vs VALUATION WINDOW. The refresh may acquire extra seasons of game stats
   * so the QB engine's career terms describe a career rather than a three-year window (see
   * `careerSeasons` in the source plan). Those extra seasons must not silently widen what RB,
   * TE and WR are valued over — their models were validated on the declared window, and
   * changing their inputs is not the same decision as giving QB a real career.
   *
   * So: QB reads every ingested game; every other position is scoped to these seasons. Absent,
   * nothing is scoped and all positions read everything, which is the previous behaviour.
   */
  readonly valuationSeasons?: readonly number[];
}

export function buildEvidenceFor(
  snapshot: NormalizedSnapshot,
  canonicalId: string,
  position: SupportedPosition,
  asOf: string,
  options: EvidenceOptions = {},
): BuiltEvidence | null {
  const index = indexOf(snapshot);
  const playerRec = index.playersById.get(canonicalId);
  if (!playerRec) return null;

  // Every time-varying fact is resolved AT the as-of before anything reads it, so no later
  // step can quietly pick up the provider's current state.
  const pit = resolvePointInTime(playerRec, index, canonicalId, asOf);
  const team = pit.team;

  const allGames = (index.gamesByPlayer.get(canonicalId) ?? EMPTY).filter((g) => g.seasonType === 'REG' && withinAsOf(asOf, g.kickoff));
  // QB reads the full ingested history; every other position stays inside the valuation
  // window. See `EvidenceOptions.valuationSeasons`.
  const valuationSeasons = options.valuationSeasons;
  const myGames =
    position === 'QB' || !valuationSeasons || valuationSeasons.length === 0
      ? allGames
      : allGames.filter((g) => valuationSeasons.includes(g.season));
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

  // --- QB role ladder (§3.4) ---
  //
  // THE DEFECT THIS CLOSES. `classifyQBRoleStatus`, the `QBRoleSignals` contract and the
  // orchestrator that consumes them all existed; nothing ever built the evidence. So
  // `role_status` fell to its ENUM neutral — BACKUP — for every quarterback in the league,
  // which made Role Security (21% of the dynasty composite) constant at ~21 for a starter and
  // a third-stringer alike.
  //
  // Everything below comes from official start records already in the snapshot. Signals the
  // pipeline genuinely cannot observe (a benching, a temporary injury replacement, a signed
  // veteran bridge, a two-QB rotation) stay false, so only the rungs that real evidence
  // supports can fire and every other quarterback still lands on BACKUP — by evidence now,
  // not by default.
  //
  // DEPTH CHART FROM STARTS. The spec's `classifyQBDepthChartStatus` wants snap share, and the
  // weekly stats export publishes no snap columns. Starts answer the same question from the
  // same snapshot — a quarterback who starts his team's games is his team's starter — so the
  // status is derived from the start rate and labelled as such, rather than left contradicting
  // a role the start record has already established.
  if (position === 'QB') {
    const observedGameIds = new Set(myGames.map((g) => g.gameId));
    const officials = (index.officialStartsByPlayer.get(canonicalId) ?? EMPTY).filter((o) =>
      observedGameIds.has(o.gameId),
    );
    if (officials.length > 0) {
      const rows = myGames.map((g) => gameRow(g));
      const newestFirst = [...rows].sort((a, b) => (a.kickoff < b.kickoff ? 1 : -1));
      const roleWindowIds = new Set(newestFirst.slice(0, D2_ROLE_WINDOW_GAMES).map((r) => r.gameId));
      const startedIds = new Set(officials.filter((o) => o.started).map((o) => o.gameId));

      const roleWindowGames = Math.min(rows.length, D2_ROLE_WINDOW_GAMES);
      const roleWindowStarts = [...startedIds].filter((id) => roleWindowIds.has(id)).length;
      const recentStartRate = roleWindowGames > 0 ? roleWindowStarts / roleWindowGames : null;

      const rosterStatus = rosterStatusFor(index.rostersByPlayer.get(canonicalId) ?? EMPTY, asOf);
      const depthChartStatus: QBDepthChartStatus =
        team === null
          ? 'FREE_AGENT'
          : rosterStatus === 'PRACTICE_SQUAD'
            ? 'PRACTICE_SQUAD'
            : recentStartRate !== null && recentStartRate >= QB_STARTER_START_RATE
              ? 'STARTER'
              : 'BACKUP';

      evidence.qbRole = {
        // Not observable from the free stack; left false so no rung fires without evidence.
        benchedWithin4Weeks: false,
        temporaryInjuryReplacement: false,
        veteranBridgeSigned: false,
        twoQbStartSignal: false,
        recentStartRate,
        careerStarts: startedIds.size,
        // Counted from the provider's own start records, which is the provenance §9.3 requires
        // for the ESTABLISHED_STARTER rung.
        startsProvenance: 'DERIVED',
        nflSeasonsCompleted: playerRec.nflSeasonsCompleted ?? 0,
        depthChartStatus,
      };
    }
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
  // --- observed CAREER rates (QB) ---
  // The career baseline the engine's quality components had no way to see (§26.6.3-CA). Career
  // starts come from the role evidence built just above, so the rushing rate's denominator is
  // the same start count the rest of the engine uses. QB only: no other engine takes these.
  if (position === 'QB') {
    Object.assign(facts, observedCareerRates(myGames, evidence.qbRole?.careerStarts ?? null));
  }

  // --- observed receiving rates (WR) ---
  // The WR engine declares `target_share` and `average_depth_of_target`; neither was ever
  // supplied, so every receiver fell back to the same constants and two of the engine's eight
  // components were identical league-wide. Both are ratios over provider columns the snapshot
  // already holds, so they join `facts` (and therefore win over any AIL estimate) exactly as
  // the counting facts do. WR only: RB and TE are valued by the accessible tier, which reads
  // its own observed production and must not have its inputs changed here.
  if (position === 'WR') {
    Object.assign(facts, observedReceivingRates(myGames));
  }

  // Observed practice_status enum, when an injury record is present.
  if (myInjury) {
    facts.practice_status = myInjury.practiceStatus;
    factTimestamps.practice_status = myInjury.sourceTimestamp;
  }

  // --- observed production (accessible model tier) ---
  // A SECOND, separate channel from `facts`: it feeds the accessible-tier models only and is
  // never merged into a frozen engine's supplement, so every frozen input and every QB
  // checksum is unaffected. Built for the positions the accessible tier serves — RB, TE and now
  // WR; leaving it undefined for QB keeps QB normalized-input bytes identical.
  if (position === 'RB' || position === 'TE' || position === 'WR') {
    // Distinct (season, week) roster rows at or before the as-of. Every roster status counts,
    // including IR/PUP: being under contract and unable to play IS an availability failure,
    // which is exactly what durability is meant to measure.
    const rosterWeeks = new Set<string>();
    for (const r of index.rostersByPlayer.get(canonicalId) ?? EMPTY) {
      if (r.week === null) continue;
      if (!withinAsOf(asOf, r.sourceTimestamp)) continue;
      rosterWeeks.add(`${r.season}|${r.week}`);
    }
    const production = observedProduction(
      myGames,
      index.teamGameTotals,
      rosterWeeks.size > 0 ? rosterWeeks.size : null,
    );
    if (production) evidence.production = production;
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

// Deterministic cross-provider identity resolution.
//
// MATCH ORDER (binding, applied per Sleeper record against nflverse):
//   1. EXISTING_MAPPING        prior snapshot / manual mappings (ids are sticky)
//   2. DIRECT_CROSSWALK        nflverse roster's published sleeper_id column
//   3. GSIS_ID                 Sleeper's published gsis_id field
//   4. NAME_BIRTHDATE_POSITION exact name key + birth date + compatible position
//   5. NAME_TEAM_POSITION      exact name key + team + compatible position,
//                              ONLY when exactly one candidate exists
//                              (flagged REVIEW_REQUIRED, still auto-matched)
//   6. MANUAL                  reviewer-authored mappings file
//
// REFUSALS (never guessed):
//   - multiple surviving candidates at any rule level → AMBIGUOUS, no mapping;
//   - a source id already claimed by another record → AMBIGUOUS;
//   - conflicting prior PlayerTicker ids across providers → kept separate;
//   - name-only similarity NEVER creates a mapping (it only feeds review).
//
// ID STABILITY: a PlayerTicker id (`ptp_…`) is minted once, anchored to the
// strongest stable source id available at mint time (GSIS preferred, else
// Sleeper), and preserved forever after via EXISTING_MAPPING. It never encodes
// team, roster status, or season, so trades, cuts, renames, and new seasons
// cannot move it.

import { NORMALIZATION_VERSION, positionsCompatible } from '@/services/identity/normalize';
import type { ManualMapping } from '@/services/identity/schemas';
import type {
  CanonicalPlayerIdentity,
  DirectoryReview,
  DirectoryReviewEntry,
  MatchMethod,
  NflverseIdentityRecord,
  PlayerSourceIdMap,
  PlayerTickerPlayerId,
  ResolutionResult,
  SleeperIdentityRecord,
} from '@/services/identity/types';

export { NORMALIZATION_VERSION };

export interface ResolverInput {
  sleeper: SleeperIdentityRecord[];
  nflverse: NflverseIdentityRecord[];
  /** Current (validTo === null) mappings from the previous snapshot. */
  priorMappings: PlayerSourceIdMap[];
  manualMappings: ManualMapping[];
  /** ISO timestamp for this run (injected — determinism in tests). */
  generatedAt: string;
  effectiveSeason: number | null;
}

export interface ResolverOutput {
  players: CanonicalPlayerIdentity[];
  sourceIdMaps: PlayerSourceIdMap[];
  review: DirectoryReview;
  /** Per-Sleeper-record outcome, keyed by Sleeper id (for tests/reports). */
  outcomes: Map<string, ResolutionResult>;
}

const describeNflverse = (r: NflverseIdentityRecord): string =>
  `${r.gsisId} ${r.fullName} pos=${r.position} team=${r.team ?? 'FA'} born=${r.birthDate ?? '?'}`;

const reviewEntryFromSleeper = (
  r: SleeperIdentityRecord,
  reason: string,
  candidates: NflverseIdentityRecord[] = [],
): DirectoryReviewEntry => ({
  source: 'SLEEPER',
  sourcePlayerId: r.sleeperId,
  fullName: r.fullName,
  position: r.position,
  team: r.team,
  birthDate: r.birthDate,
  reason,
  candidates: candidates.map(describeNflverse),
});

const reviewEntryFromNflverse = (r: NflverseIdentityRecord, reason: string): DirectoryReviewEntry => ({
  source: 'NFLVERSE',
  sourcePlayerId: r.gsisId,
  fullName: r.fullName,
  position: r.position,
  team: r.team,
  birthDate: r.birthDate,
  reason,
  candidates: [],
});

interface PriorLookup {
  bySleeper: Map<string, { playerTickerId: string; validFrom: string; method: MatchMethod }>;
  byGsis: Map<string, { playerTickerId: string; validFrom: string; method: MatchMethod }>;
}

function buildPriorLookup(prior: PlayerSourceIdMap[], manual: ManualMapping[]): PriorLookup {
  const bySleeper = new Map<string, { playerTickerId: string; validFrom: string; method: MatchMethod }>();
  const byGsis = new Map<string, { playerTickerId: string; validFrom: string; method: MatchMethod }>();
  // Prior snapshot mappings first…
  for (const m of prior) {
    if (m.validTo !== null) continue; // closed mappings are history, not truth
    const target = m.source === 'SLEEPER' ? bySleeper : byGsis;
    if (!target.has(m.sourcePlayerId)) {
      target.set(m.sourcePlayerId, {
        playerTickerId: m.playerTickerId,
        validFrom: m.validFrom,
        method: 'EXISTING_MAPPING',
      });
    }
  }
  // …then manual mappings, which are reviewer decisions and therefore WIN.
  for (const m of manual) {
    const target = m.source === 'SLEEPER' ? bySleeper : byGsis;
    target.set(m.sourcePlayerId, {
      playerTickerId: m.playerTickerId,
      validFrom: '', // filled with generatedAt when first materialized
      method: 'MANUAL',
    });
  }
  return { bySleeper, byGsis };
}

/**
 * Resolve one Sleeper record against the nflverse indexes using the binding
 * match order. Pure; does not mutate claims. Exported for direct rule tests.
 */
export function resolveSleeperRecord(
  record: SleeperIdentityRecord,
  ctx: {
    prior: PriorLookup;
    nflverseByGsis: Map<string, NflverseIdentityRecord>;
    nflverseBySleeperId: Map<string, NflverseIdentityRecord[]>;
    nflverseByNameKey: Map<string, NflverseIdentityRecord[]>;
    claimedGsis: ReadonlySet<string>;
  },
): ResolutionResult & { partner?: NflverseIdentityRecord } {
  const { prior, nflverseByGsis, nflverseBySleeperId, nflverseByNameKey, claimedGsis } = ctx;

  // Rule 1 — existing mapping (also covers MANUAL entries folded into prior).
  const existing = prior.bySleeper.get(record.sleeperId);
  if (existing) {
    // Reconnect to the live nflverse record that shares this PlayerTicker id.
    let partner: NflverseIdentityRecord | undefined;
    for (const [gsisId, entry] of prior.byGsis) {
      if (entry.playerTickerId === existing.playerTickerId) {
        partner = nflverseByGsis.get(gsisId);
        break;
      }
    }
    // A Sleeper-embedded gsis id pointing at the same prior identity also counts.
    if (!partner && record.gsisId) {
      const viaGsis = nflverseByGsis.get(record.gsisId);
      const gsisPrior = prior.byGsis.get(record.gsisId);
      if (viaGsis && (!gsisPrior || gsisPrior.playerTickerId === existing.playerTickerId)) {
        partner = viaGsis;
      }
    }
    return {
      status: 'MATCHED',
      playerTickerId: existing.playerTickerId,
      method: existing.method,
      ...(partner ? { partner } : {}),
    };
  }

  const claimable = (c: NflverseIdentityRecord) => !claimedGsis.has(c.gsisId);

  // Rule 2 — published crosswalk: nflverse roster carries our Sleeper id.
  const crosswalk = (nflverseBySleeperId.get(record.sleeperId) ?? []).filter(claimable);
  if (crosswalk.length === 1) {
    return { status: 'MATCHED', playerTickerId: '', method: 'DIRECT_CROSSWALK', partner: crosswalk[0] };
  }
  if (crosswalk.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidates: crosswalk.map(describeNflverse),
      reason: `nflverse crosswalk lists sleeper_id ${record.sleeperId} on ${crosswalk.length} players`,
    };
  }

  // Rule 3 — Sleeper's published GSIS id.
  if (record.gsisId) {
    const viaGsis = nflverseByGsis.get(record.gsisId);
    if (viaGsis) {
      if (!claimable(viaGsis)) {
        return {
          status: 'AMBIGUOUS',
          candidates: [describeNflverse(viaGsis)],
          reason: `gsis_id ${record.gsisId} is already claimed by another Sleeper record`,
        };
      }
      return { status: 'MATCHED', playerTickerId: '', method: 'GSIS_ID', partner: viaGsis };
    }
  }

  // Name-based rules share the same candidate pool: exact normalized name key
  // + compatible position. Name similarity alone NEVER creates a mapping.
  const nameCandidates = (nflverseByNameKey.get(record.nameKey) ?? []).filter(
    (c) => positionsCompatible(record.position, c.position, record.fantasyPositions) && claimable(c),
  );

  // Rule 4 — name + birth date + position.
  if (record.birthDate !== null) {
    const byBirth = nameCandidates.filter((c) => c.birthDate === record.birthDate);
    if (byBirth.length === 1) {
      return { status: 'MATCHED', playerTickerId: '', method: 'NAME_BIRTHDATE_POSITION', partner: byBirth[0] };
    }
    if (byBirth.length > 1) {
      return {
        status: 'AMBIGUOUS',
        candidates: byBirth.map(describeNflverse),
        reason: `${byBirth.length} nflverse players share name, birth date, and position`,
      };
    }
  }

  // Rule 5 — name + team + position, only when EXACTLY ONE candidate exists.
  if (record.team !== null) {
    const byTeam = nameCandidates.filter((c) => c.team === record.team);
    if (byTeam.length === 1 && nameCandidates.length === 1) {
      return { status: 'MATCHED', playerTickerId: '', method: 'NAME_TEAM_POSITION', partner: byTeam[0] };
    }
    if (byTeam.length > 1) {
      return {
        status: 'AMBIGUOUS',
        candidates: byTeam.map(describeNflverse),
        reason: `${byTeam.length} nflverse players share name, team, and position`,
      };
    }
    if (byTeam.length === 1 && nameCandidates.length > 1) {
      return {
        status: 'AMBIGUOUS',
        candidates: nameCandidates.map(describeNflverse),
        reason: 'team narrows to one candidate but other same-name candidates exist (duplicate name — not guessed)',
      };
    }
  }

  if (nameCandidates.length > 0) {
    // Same-name candidates exist but no rule was strong enough (e.g. different
    // birth dates, missing team). Refuse; surface candidates for review.
    return {
      status: 'AMBIGUOUS',
      candidates: nameCandidates.map(describeNflverse),
      reason: 'name-only similarity is never sufficient for an automatic mapping',
    };
  }

  return { status: 'UNMATCHED', reason: 'no nflverse candidate shares a stable id or a qualifying name match' };
}

// ---------- cluster → canonical record ----------

function mintId(sleeper: SleeperIdentityRecord | null, nflverse: NflverseIdentityRecord | null): string {
  // Anchor on the strongest stable id available at mint time. NEVER the team.
  const gsis = nflverse?.gsisId ?? sleeper?.gsisId ?? null;
  if (gsis) return `ptp_gsis_${gsis}`;
  if (sleeper) return `ptp_slp_${sleeper.sleeperId}`;
  throw new Error('cannot mint a PlayerTicker id without any stable source id');
}

function buildCanonical(
  playerTickerId: PlayerTickerPlayerId,
  sleeper: SleeperIdentityRecord | null,
  nflverse: NflverseIdentityRecord | null,
  generatedAt: string,
  effectiveSeason: number | null,
  manual: boolean,
): CanonicalPlayerIdentity {
  if (!sleeper && !nflverse) throw new Error('empty identity cluster');
  const qualityFlags: string[] = [];
  if (sleeper && !nflverse) qualityFlags.push('SINGLE_SOURCE_SLEEPER');
  if (!sleeper && nflverse) qualityFlags.push('SINGLE_SOURCE_NFLVERSE');
  if (sleeper && nflverse) {
    if (sleeper.nameKey !== nflverse.nameKey) qualityFlags.push('NAME_MISMATCH');
    if (sleeper.team !== null && nflverse.team !== null && sleeper.team !== nflverse.team) {
      qualityFlags.push('TEAM_MISMATCH');
    }
    if (
      sleeper.birthDate !== null &&
      nflverse.birthDate !== null &&
      sleeper.birthDate !== nflverse.birthDate
    ) {
      qualityFlags.push('BIRTHDATE_MISMATCH');
    }
    if (sleeper.position !== nflverse.position) qualityFlags.push('POSITION_MISMATCH');
  }
  if (sleeper && sleeper.teamRaw !== null && sleeper.team === null && sleeper.teamRaw !== '') {
    // Raw team label neither canonical, alias, nor free-agent marker.
    const known = ['FA', 'FA*', 'NONE', 'NULL'].includes(sleeper.teamRaw.trim().toUpperCase());
    if (!known) qualityFlags.push('UNRECOGNIZED_TEAM_SLEEPER');
  }

  const sources: CanonicalPlayerIdentity['provenance']['sources'] = [];
  if (sleeper) sources.push('SLEEPER');
  if (nflverse) sources.push('NFLVERSE');
  if (manual) sources.push('MANUAL');

  // Field precedence (documented in docs/PLAYER_IDENTITY_PHASE1.md):
  //   Sleeper wins volatile facts (team, status, injury, practice, depth) —
  //   it refreshes daily. nflverse wins curated facts (name, birth date,
  //   draft round). Nothing missing is ever coerced to zero.
  return {
    playerTickerId,
    sleeperId: sleeper?.sleeperId ?? null,
    gsisId: nflverse?.gsisId ?? sleeper?.gsisId ?? null,
    fullName: (nflverse ?? sleeper)!.fullName,
    firstName: nflverse?.firstName ?? sleeper?.firstName ?? null,
    lastName: nflverse?.lastName ?? sleeper?.lastName ?? null,
    birthDate: nflverse?.birthDate ?? sleeper?.birthDate ?? null,
    age: sleeper?.age ?? null,
    position: (sleeper ?? nflverse)!.position,
    team: sleeper ? sleeper.team : nflverse!.team,
    yearsExperience: sleeper?.yearsExperience ?? nflverse?.yearsExperience ?? null,
    draftRound: nflverse?.draftRound ?? null,
    rosterStatus: sleeper?.status ?? nflverse?.rosterStatus ?? null,
    injuryStatus: sleeper?.injuryStatus ?? null,
    practiceStatus: sleeper?.practiceStatus ?? null,
    depthChartOrder: sleeper?.depthChartOrder ?? null,
    provenance: { sources, collectedAt: generatedAt, effectiveSeason, qualityFlags },
  };
}

// ---------- full directory build ----------

const METHODS: MatchMethod[] = [
  'EXISTING_MAPPING',
  'DIRECT_CROSSWALK',
  'GSIS_ID',
  'NAME_BIRTHDATE_POSITION',
  'NAME_TEAM_POSITION',
  'MANUAL',
  'NEW_IDENTITY',
];

const STABLE_ID_METHODS: ReadonlySet<MatchMethod> = new Set([
  'EXISTING_MAPPING',
  'MANUAL',
  'DIRECT_CROSSWALK',
  'GSIS_ID',
]);

export function buildDirectory(input: ResolverInput): ResolverOutput {
  const { generatedAt, effectiveSeason } = input;
  const prior = buildPriorLookup(input.priorMappings, input.manualMappings);

  // Deterministic processing order regardless of provider payload ordering.
  const sleeperRecords = [...input.sleeper].sort((a, b) => a.sleeperId.localeCompare(b.sleeperId));
  const nflverseRecords = [...input.nflverse].sort((a, b) => a.gsisId.localeCompare(b.gsisId));

  const nflverseByGsis = new Map<string, NflverseIdentityRecord>();
  const nflverseBySleeperId = new Map<string, NflverseIdentityRecord[]>();
  const nflverseByNameKey = new Map<string, NflverseIdentityRecord[]>();
  for (const r of nflverseRecords) {
    nflverseByGsis.set(r.gsisId, r);
    if (r.sleeperId) {
      const list = nflverseBySleeperId.get(r.sleeperId) ?? [];
      list.push(r);
      nflverseBySleeperId.set(r.sleeperId, list);
    }
    const list = nflverseByNameKey.get(r.nameKey) ?? [];
    list.push(r);
    nflverseByNameKey.set(r.nameKey, list);
  }

  const claimedGsis = new Set<string>();
  const usedIds = new Set<string>();
  const outcomes = new Map<string, ResolutionResult>();
  const clusters: Array<{
    id: string;
    sleeper: SleeperIdentityRecord | null;
    nflverse: NflverseIdentityRecord | null;
    method: MatchMethod;
    validFrom: string;
    manual: boolean;
  }> = [];
  const ambiguous: DirectoryReviewEntry[] = [];
  const unmatched: DirectoryReviewEntry[] = [];
  const reviewRequired: DirectoryReviewEntry[] = [];
  const methodCounts = Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<MatchMethod, number>;

  // Two passes so stable-id claims (crosswalk/GSIS/prior mapping) can never be
  // stolen by weaker name-based matches that happen to sort earlier. The
  // second pass is TERMINAL: every still-pending record gets a final outcome.
  const pending = new Set(sleeperRecords.map((r) => r.sleeperId));

  for (const pass of [0, 1] as const) {
    const terminal = pass === 1;
    for (const record of sleeperRecords) {
      if (!pending.has(record.sleeperId)) continue;
      const result = resolveSleeperRecord(record, {
        prior,
        nflverseByGsis,
        nflverseBySleeperId,
        nflverseByNameKey,
        claimedGsis,
      });

      if (result.status === 'MATCHED') {
        const method = result.method as MatchMethod;
        if (!terminal && !STABLE_ID_METHODS.has(method)) continue; // defer name matches
        pending.delete(record.sleeperId);
        const partner = result.partner ?? null;
        if (partner) {
          if (claimedGsis.has(partner.gsisId)) {
            // Partner already taken (e.g. two Sleeper records with prior
            // mappings to the same identity) — a data problem, never guessed.
            const entry = reviewEntryFromSleeper(
              record,
              `resolved partner ${partner.gsisId} is already claimed by another Sleeper record`,
              [partner],
            );
            ambiguous.push(entry);
            outcomes.set(record.sleeperId, {
              status: 'AMBIGUOUS',
              candidates: entry.candidates,
              reason: entry.reason,
            });
            continue;
          }
          claimedGsis.add(partner.gsisId);
        }
        const existing = prior.bySleeper.get(record.sleeperId);
        const id = existing ? existing.playerTickerId : mintId(record, partner);
        if (usedIds.has(id)) {
          const entry = reviewEntryFromSleeper(record, `minted id ${id} collides with an existing identity`);
          ambiguous.push(entry);
          outcomes.set(record.sleeperId, { status: 'AMBIGUOUS', candidates: [], reason: entry.reason });
          continue;
        }
        usedIds.add(id);
        clusters.push({
          id,
          sleeper: record,
          nflverse: partner,
          method,
          validFrom: existing?.validFrom || generatedAt,
          manual: method === 'MANUAL',
        });
        methodCounts[method] += 1;
        outcomes.set(record.sleeperId, { status: 'MATCHED', playerTickerId: id, method });
        if (method === 'NAME_TEAM_POSITION') {
          reviewRequired.push(
            reviewEntryFromSleeper(
              record,
              'auto-matched on name+team+position — confirm and promote to manual mapping',
              partner ? [partner] : [],
            ),
          );
        }
        continue;
      }

      if (!terminal) continue; // refusals are only final in the last pass

      pending.delete(record.sleeperId);
      if (result.status === 'AMBIGUOUS') {
        ambiguous.push({
          ...reviewEntryFromSleeper(record, result.reason),
          candidates: result.candidates,
        });
        outcomes.set(record.sleeperId, result);
      } else {
        // UNMATCHED: the record is preserved as a single-source identity so a
        // later run (or manual review) can attach the other provider without
        // the id ever changing. It stays listed in the review report.
        const id = mintId(record, null);
        if (usedIds.has(id)) {
          const entry = reviewEntryFromSleeper(record, `minted id ${id} collides with an existing identity`);
          ambiguous.push(entry);
          outcomes.set(record.sleeperId, { status: 'AMBIGUOUS', candidates: [], reason: entry.reason });
          continue;
        }
        usedIds.add(id);
        clusters.push({
          id,
          sleeper: record,
          nflverse: null,
          method: 'NEW_IDENTITY',
          validFrom: generatedAt,
          manual: false,
        });
        methodCounts.NEW_IDENTITY += 1;
        unmatched.push(reviewEntryFromSleeper(record, result.reason));
        outcomes.set(record.sleeperId, result);
      }
    }
  }

  // nflverse records nobody claimed become single-source identities (preserved
  // for review — a stable GSIS id must not be dropped just because Sleeper
  // does not know the player yet).
  for (const r of nflverseRecords) {
    if (claimedGsis.has(r.gsisId)) continue;
    const priorEntry = prior.byGsis.get(r.gsisId);
    const id = priorEntry ? priorEntry.playerTickerId : mintId(null, r);
    if (usedIds.has(id)) {
      ambiguous.push(reviewEntryFromNflverse(r, `minted id ${id} collides with an existing identity`));
      continue;
    }
    usedIds.add(id);
    const method: MatchMethod = priorEntry ? priorEntry.method : 'NEW_IDENTITY';
    clusters.push({
      id,
      sleeper: null,
      nflverse: r,
      method,
      validFrom: priorEntry?.validFrom || generatedAt,
      manual: priorEntry?.method === 'MANUAL',
    });
    if (method === 'NEW_IDENTITY') methodCounts.NEW_IDENTITY += 1;
    unmatched.push(reviewEntryFromNflverse(r, 'no Sleeper record resolved to this nflverse player'));
  }

  // Materialize canonical identities + mapping rows.
  const players: CanonicalPlayerIdentity[] = [];
  const sourceIdMaps: PlayerSourceIdMap[] = [];
  for (const c of clusters) {
    players.push(buildCanonical(c.id, c.sleeper, c.nflverse, generatedAt, effectiveSeason, c.manual));
    const confidence =
      c.method === 'NAME_TEAM_POSITION' ? 'REVIEW_REQUIRED' : c.method === 'NAME_BIRTHDATE_POSITION' ? 'HIGH' : 'EXACT';
    if (c.sleeper) {
      sourceIdMaps.push({
        playerTickerId: c.id,
        source: 'SLEEPER',
        sourcePlayerId: c.sleeper.sleeperId,
        matchMethod: c.method,
        confidence,
        validFrom: c.validFrom,
        validTo: null,
      });
    }
    const gsisId = c.nflverse?.gsisId ?? c.sleeper?.gsisId ?? null;
    if (gsisId) {
      sourceIdMaps.push({
        playerTickerId: c.id,
        source: 'NFLVERSE',
        sourcePlayerId: gsisId,
        matchMethod: c.method,
        confidence,
        validFrom: c.validFrom,
        validTo: null,
      });
    }
  }

  players.sort((a, b) => a.playerTickerId.localeCompare(b.playerTickerId));
  sourceIdMaps.sort(
    (a, b) => a.playerTickerId.localeCompare(b.playerTickerId) || a.source.localeCompare(b.source),
  );

  return {
    players,
    sourceIdMaps,
    review: { ambiguous, unmatched, methodCounts, reviewRequired },
    outcomes,
  };
}

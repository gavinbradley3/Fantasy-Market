// The publication adapter (Phase 10) — the ONE place the API's wire shape becomes the
// frontend's market model. No React component, hook, or page converts API fields itself.
//
// Two rules govern everything below.
//
//   1. NOTHING IS INVENTED. A field the API published as `null` stays `null`. There are no
//      `?? 0` fallbacks, no synthesized prices, no derived "estimates". The only value this
//      adapter computes is RANK, which is a pure ordering over the backend's own published
//      value — presentation, not valuation. No valuation formula exists in the frontend.
//   2. INVALID RECORDS ARE REJECTED, NOT REPAIRED. A record with no id, an unrecognized
//      position, a non-finite value, or an id already seen is dropped into `rejected` with a
//      reason. A structurally wrong RESPONSE (not a record) throws instead — that is an
//      `invalidResponse` condition, not a partially-usable board.

import type { ApiBoardEntry, ApiPublicationResponse } from '@/services/api';
import type { Position } from '@/types/market';
import type {
  PublishedComposites,
  PublishedHorizon,
  PublishedMarket,
  PublishedModelTier,
  PublishedPlayer,
  PublishedProvenance,
  RejectedRecord,
} from './types';

/** The four positions the valuation engines cover and the UI can render. */
export const SUPPORTED_POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];

const POSITION_SET = new Set<string>(SUPPORTED_POSITIONS);

export class PublicationAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationAdapterError';
  }
}

export interface AdaptPublicationOptions {
  /** Which composite horizon becomes `value`. Default `weekly`. */
  readonly horizon?: PublishedHorizon;
}

function isPosition(code: string): code is Position {
  return POSITION_SET.has(code);
}

/**
 * Model tier, copied through with an explicit unknown case. A tier this frontend does not
 * recognise — or one an older backend never published — becomes INSUFFICIENT, so an
 * unlabelled valuation is never rendered as though it were a full-model one.
 */
function adaptTier(tier: string | null | undefined): PublishedModelTier {
  return tier === 'FULL' || tier === 'ACCESSIBLE' || tier === 'INSUFFICIENT' ? tier : 'INSUFFICIENT';
}

function adaptProvenance(p: ApiBoardEntry['provenance']): PublishedProvenance | null {
  if (!p) return null;
  return {
    gamesObserved: finiteOrNull(p.gamesObserved),
    seasonsObserved: finiteOrNull(p.seasonsObserved),
    teamSharesDerived: p.teamSharesDerived === true,
    observedFields: [...(p.observedFields ?? [])],
    derivedFields: [...(p.derivedFields ?? [])],
    unavailableFields: [...(p.unavailableFields ?? [])],
  };
}

function positiveIntOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Copy composites through unchanged, dropping a set whose numbers are all absent. */
function adaptComposites(composites: ApiBoardEntry['composites']): PublishedComposites | null {
  if (!composites) return null;
  const adapted: PublishedComposites = {
    weekly: finiteOrNull(composites.weekly),
    ros: finiteOrNull(composites.ros),
    oneYear: finiteOrNull(composites.oneYear),
    threeYear: finiteOrNull(composites.threeYear),
    dynasty: finiteOrNull(composites.dynasty),
  };
  return Object.values(adapted).some((v) => v !== null) ? adapted : null;
}

type Unranked = Omit<PublishedPlayer, 'overallRank' | 'positionRank'> & {
  readonly canonicalOverallRank: number | null;
  readonly canonicalPositionRank: number | null;
};

/**
 * Rank the board.
 *
 * CANONICAL RANKS WIN. A board that publishes its own cross-position ranks
 * (`dynastyOverallRank` / `dynastyPositionRank`) is shown in exactly that order, with exactly
 * those numbers: the frontend never re-ranks a published board, because two rankings of one
 * board are a contradiction a reader cannot resolve. Players the backend did not rank sit after
 * every ranked player, unranked, in canonical-id order.
 *
 * Only a legacy board with no published ranks falls back to ordering by value here.
 */
function ranked(players: readonly Unranked[]): PublishedPlayer[] {
  const strip = (p: Unranked, overallRank: number | null, positionRank: number | null): PublishedPlayer => {
    const { canonicalOverallRank: _o, canonicalPositionRank: _p, ...rest } = p;
    return { ...rest, overallRank, positionRank };
  };

  if (players.some((p) => p.canonicalOverallRank !== null)) {
    const ordered = [...players].sort((a, b) => {
      const ar = a.canonicalOverallRank;
      const br = b.canonicalOverallRank;
      if (ar !== null && br !== null && ar !== br) return ar - br;
      if (ar !== null && br === null) return -1;
      if (ar === null && br !== null) return 1;
      return a.playerId.localeCompare(b.playerId);
    });
    return ordered.map((p) =>
      p.canonicalOverallRank === null ? strip(p, null, null) : strip(p, p.canonicalOverallRank, p.canonicalPositionRank),
    );
  }

  const anyShared = players.some((p) => p.dynastyValue !== null);
  const rankOn = (p: Unranked) => (anyShared ? p.dynastyValue : p.value);
  const ordered = [...players].sort((a, b) => {
    const av = rankOn(a);
    const bv = rankOn(b);
    if (av !== null && bv !== null && av !== bv) return bv - av;
    if (av !== null && bv === null) return -1;
    if (av === null && bv !== null) return 1;
    return a.playerId.localeCompare(b.playerId);
  });
  let overall = 0;
  const positionCounters = new Map<Position, number>();
  return ordered.map((p) => {
    if (rankOn(p) === null) return strip(p, null, null);
    overall += 1;
    const positionRank = (positionCounters.get(p.position) ?? 0) + 1;
    positionCounters.set(p.position, positionRank);
    return strip(p, overall, positionRank);
  });
}

/**
 * Convert one `GET /publication` response into the frontend market model.
 *
 * Throws `PublicationAdapterError` only for a structurally unusable RESPONSE. Individual bad
 * records are reported through `market.rejected`.
 */
export function adaptPublication(
  response: ApiPublicationResponse,
  options: AdaptPublicationOptions = {},
): PublishedMarket {
  const horizon = options.horizon ?? 'weekly';
  const meta = response.publication;
  if (!meta || typeof meta.publicationId !== 'string' || meta.publicationId === '') {
    throw new PublicationAdapterError('publication response carries no publication id');
  }
  if (!Array.isArray(response.entries)) {
    throw new PublicationAdapterError('publication response carries no entries array');
  }

  const rejected: RejectedRecord[] = [];
  const seen = new Set<string>();
  const admitted: Unranked[] = [];

  for (const entry of response.entries) {
    const canonicalId = typeof entry.canonicalId === 'string' ? entry.canonicalId.trim() : '';
    if (canonicalId === '') {
      rejected.push({ canonicalId: null, reason: 'missingId', detail: 'entry has no canonicalId' });
      continue;
    }
    if (!isPosition(entry.position)) {
      // An unsupported position (a kicker, a new code) is not renderable by this UI and is not
      // guessed into one of the four — it is dropped and counted.
      rejected.push({
        canonicalId,
        reason: 'unknownPosition',
        detail: `position "${entry.position}" is not one of ${SUPPORTED_POSITIONS.join(', ')}`,
      });
      continue;
    }
    if (seen.has(canonicalId)) {
      // A publication is a deterministic board keyed by canonical id; a repeat is a defect,
      // and admitting it would double-count the player in every ranking and filter.
      rejected.push({ canonicalId, reason: 'duplicateId', detail: 'canonicalId already present on this board' });
      continue;
    }

    const composites = adaptComposites(entry.composites);
    const rawValue = entry.composites ? entry.composites[horizon] : null;
    if (rawValue !== null && rawValue !== undefined && !Number.isFinite(rawValue)) {
      rejected.push({ canonicalId, reason: 'invalidValue', detail: `${horizon} composite is not a finite number` });
      continue;
    }

    seen.add(canonicalId);
    admitted.push({
      playerId: canonicalId,
      position: entry.position,
      name: entry.name,
      team: entry.team,
      age: finiteOrNull(entry.age),
      value: composites ? composites[horizon] : null,
      composites,
      // The board's cross-position value, carried through verbatim.
      dynastyValue: finiteOrNull(entry.dynastyValue),
      dynastySurplus: finiteOrNull(entry.dynastySurplus),
      dynastyDepth: finiteOrNull(entry.dynastyDepth),
      dynastyValueSource: entry.dynastyValueSource ?? null,
      leagueSchemaId: entry.leagueSchemaId ?? null,
      productionCurveVersion: entry.productionCurveVersion ?? null,
      confidenceScore: finiteOrNull(entry.confidenceScore),
      confidenceLabel: entry.confidenceLabel,
      publicConfidenceLabel: entry.publicConfidenceLabel,
      volatilityScore: finiteOrNull(entry.volatilityScore),
      volatilityLabel: entry.volatilityLabel,
      honestyState: entry.honestyState,
      readiness: entry.readiness,
      outputStatus: entry.outputStatus,
      readinessMissingCount: finiteOrNull(entry.readinessMissingCount),
      limitations: [...(entry.limitations ?? [])],
      asOf: entry.asOf,
      outputChecksum: entry.outputChecksum,
      // Copied through, never inferred. An older backend that publishes no tier is treated as
      // INSUFFICIENT rather than silently assumed to be a full valuation — the safe direction.
      modelTier: adaptTier(entry.modelTier),
      modelVersion: entry.modelVersion ?? null,
      positionValue: finiteOrNull(entry.positionValue),
      publishedPositionalRank: finiteOrNull(entry.positionalRank),
      role: entry.role ?? null,
      explanation: entry.explanation ?? null,
      positiveFactors: [...(entry.positiveFactors ?? [])],
      negativeFactors: [...(entry.negativeFactors ?? [])],
      materialMissingInputs: [...(entry.materialMissingInputs ?? [])],
      insufficientReason: entry.insufficientReason ?? null,
      provenance: adaptProvenance(entry.provenance),
      canonicalOverallRank: positiveIntOrNull(entry.dynastyOverallRank),
      canonicalPositionRank: positiveIntOrNull(entry.dynastyPositionRank),
    });
  }

  const players = ranked(admitted);
  return {
    publicationId: meta.publicationId,
    runId: meta.runId,
    publishedAt: meta.publishedAt,
    boardChecksum: meta.boardChecksum,
    entryCount: meta.entryCount,
    horizon,
    players,
    // A player is valued when the board ranked him; a legacy board without ranks falls back to
    // whether any composite was published.
    valuedCount: players.filter((p) => p.overallRank !== null).length,
    rejected,
  };
}

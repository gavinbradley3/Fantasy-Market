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
  PublishedPlayer,
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

/**
 * Rank the board. Valued players are ordered by descending value; ties and unvalued players
 * fall back to ascending canonical id, so the order is total and stable across renders.
 * Unvalued players are ranked `null` — they sit at the end of the list without a number.
 */
function ranked(players: readonly Omit<PublishedPlayer, 'overallRank' | 'positionRank'>[]): PublishedPlayer[] {
  const ordered = [...players].sort((a, b) => {
    const av = a.value;
    const bv = b.value;
    if (av !== null && bv !== null && av !== bv) return bv - av;
    if (av !== null && bv === null) return -1;
    if (av === null && bv !== null) return 1;
    return a.playerId.localeCompare(b.playerId);
  });

  let overall = 0;
  const positionCounters = new Map<Position, number>();
  return ordered.map((p) => {
    if (p.value === null) return { ...p, overallRank: null, positionRank: null };
    overall += 1;
    const positionRank = (positionCounters.get(p.position) ?? 0) + 1;
    positionCounters.set(p.position, positionRank);
    return { ...p, overallRank: overall, positionRank };
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
  const admitted: Omit<PublishedPlayer, 'overallRank' | 'positionRank'>[] = [];

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
    valuedCount: players.filter((p) => p.value !== null).length,
    rejected,
  };
}

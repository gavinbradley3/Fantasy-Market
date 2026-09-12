// API wire shape → the frontend's external-market model.
//
// The adapter's whole job is to keep two things true on the way in: absence stays absent, and
// attribution stays attached. It computes no values, fills no gaps, and never converts between
// the market's scale and the model's.

import type { ApiMarketResponse } from '@/services/api';
import type { MarketSnapshot } from '@/market/types';
import type { ExternalMarket } from './types';

/**
 * A quoted format the UI can name, for a lens the reader has to be told about: a Superflex
 * value and a 1QB value are different numbers for the same quarterback.
 */
export function formatLabel(format: ExternalMarket['format']): string {
  return format === 'dynasty_superflex' ? 'Superflex' : '1QB';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Market updated Sep 11" — restrained wording, chosen because the source refreshes WEEKLY.
 *
 * There is no "live", no "now", and no clock: this is a weekly file, and dressing it as a
 * ticking price would be a lie the data cannot support. Returns null when the market carries
 * no stamp at all, so the caller says nothing rather than guessing at a date.
 */
export function marketUpdatedLabel(sourceTimestamp: string | null): string | null {
  if (!sourceTimestamp) return null;
  const ms = Date.parse(sourceTimestamp);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Project the API response.
 *
 * A quote with no `overallRank` is kept rather than dropped: the source covers that player and
 * published no value, which is a different — and more informative — statement than the source
 * never having heard of them.
 */
export function adaptMarket(response: ApiMarketResponse): ExternalMarket {
  const quotesByPlayerId = new Map<string, MarketSnapshot>();
  for (const q of response.quotes) {
    quotesByPlayerId.set(q.canonicalPlayerId, {
      canonicalPlayerId: q.canonicalPlayerId,
      source: q.source,
      format: q.format,
      value: q.value,
      overallRank: q.overallRank,
      positionRank: q.positionRank,
      // The API deliberately does not re-serve the upstream id space or its consensus ranks,
      // so these are absent here rather than invented to fill the shape.
      sourceConsensusRank: null,
      sourcePlayerId: null,
      sourcePosition: null,
      sourceTeam: null,
      sourceTimestamp: q.sourceTimestamp,
      sourceVersion: response.sourceVersion,
      ingestedAt: q.ingestedAt,
      freshness: q.freshness === 'fresh' || q.freshness === 'stale' ? q.freshness : 'unknown',
      provenance: q.provenance === 'external' || q.provenance === 'derived' || q.provenance === 'manual'
        ? q.provenance
        : 'external',
    });
  }

  return {
    source: response.source,
    format: response.format,
    attribution: response.attribution,
    quotesByPlayerId,
    sourceTimestamp: response.sourceTimestamp,
    sourceVersion: response.sourceVersion,
    captureCount: response.captureCount,
    quoteCount: response.quoteCount,
    // Two captures is the minimum from which any change can be MEASURED rather than asserted.
    movementAvailable: response.captureCount >= 2,
  };
}

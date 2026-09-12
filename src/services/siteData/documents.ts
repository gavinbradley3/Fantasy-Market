// Validated readers for the two documents the scheduled refresh publishes alongside the board.
//
// Every field is checked before use. A malformed document is an ERROR, never a silently-empty
// success: "the refresh published nonsense" and "the refresh published nothing" call for
// different words on screen, and collapsing them would let a broken export read as an empty
// market.
//
// NOTHING HERE INVENTS A VALUE. Absent numbers stay absent, `unknown` freshness stays unknown,
// and no default is substituted for a missing timestamp.

import { z } from 'zod';
import { ApiClient, ApiError, type RequestOptions } from '@/services/api';
import type { SiteDataSource } from './source';

/** Freshness states the refresh emits. Mirrors `src/ops/staleness.ts`. */
export const freshnessStates = ['current', 'stale', 'expired', 'unknown'] as const;
export type FreshnessState = (typeof freshnessStates)[number];

const freshnessSchema = z.enum(freshnessStates);

const datasetFreshnessSchema = z.object({
  state: freshnessSchema,
  ageHours: z.number().nullable().default(null),
  currentWithinHours: z.number().nullable().default(null),
});

/**
 * The subset of `status.json` the UI needs, permissively parsed.
 *
 * `passthrough` is deliberate: the refresh may add operational fields, and a new field must not
 * break the deployed app. What IS checked is everything read below.
 */
export const statusDocumentSchema = z
  .object({
    generatedAt: z.string(),
    board: datasetFreshnessSchema.extend({
      publishedAt: z.string().nullable().default(null),
      entryCount: z.number().nullable().default(null),
    }),
    market: datasetFreshnessSchema.extend({
      capturedAt: z.string().nullable().default(null),
      sourceTimestamp: z.string().nullable().default(null),
      quoteCount: z.number().nullable().default(null),
    }),
    overall: z.enum(['ok', 'degraded']).default('degraded'),
  })
  .passthrough();

export type StatusDocument = z.infer<typeof statusDocumentSchema>;

/** One market quote, as `market-latest.json` publishes it. */
export const marketQuoteSchema = z.object({
  canonicalPlayerId: z.string(),
  value: z.number().nullable().default(null),
  overallRank: z.number().nullable().default(null),
  positionRank: z.number().nullable().default(null),
  sourceTimestamp: z.string().nullable().default(null),
  freshness: z.string().nullable().default(null),
});

export const marketDocumentSchema = z
  .object({
    source: z.string(),
    format: z.string(),
    // Attribution travels with the data and is rendered, not stripped. The licensing position
    // is unchanged by deployment: see docs/MARKET_DATA_SOURCES.md.
    attribution: z.record(z.unknown()).nullable().default(null),
    sourceTimestamp: z.string().nullable().default(null),
    capturedAt: z.string().nullable().default(null),
    quoteCount: z.number().default(0),
    quotes: z.array(marketQuoteSchema).default([]),
  })
  .passthrough();

export type MarketDocument = z.infer<typeof marketDocumentSchema>;
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

/**
 * Fetch and validate the freshness document.
 *
 * Returns `null` when the source publishes none — the development API has no scheduled refresh
 * to describe, and that is an absence rather than a failure.
 */
export async function fetchStatusDocument(
  client: ApiClient,
  source: SiteDataSource,
  options: RequestOptions = {},
): Promise<StatusDocument | null> {
  if (source.statusPath === null) return null;
  const body = await client.getJson<unknown>(source.statusPath, options);
  const parsed = statusDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'the freshness document does not match its contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Fetch and validate the latest market snapshot, or `null` when the source publishes none. */
export async function fetchMarketDocument(
  client: ApiClient,
  source: SiteDataSource,
  options: RequestOptions = {},
): Promise<MarketDocument | null> {
  if (source.marketPath === null) return null;
  const body = await client.getJson<unknown>(source.marketPath, options);
  const parsed = marketDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'the market document does not match its contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

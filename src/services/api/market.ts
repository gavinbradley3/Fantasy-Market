// `GET /market` — external dynasty market quotes.
//
// A structural gate, exactly like `publication.ts`: it answers "is this a market response at
// all?", not "is every quote sensible". Optional fields are `nullable`, never defaulted —
// `null` means the source published nothing, and that null has to survive to the UI so the UI
// can render an em-dash instead of a zero.
//
// `attribution` is REQUIRED here on purpose. A market response without it is not a thinner
// response, it is somebody else's data with the label removed, and the client refuses it.

import { z } from 'zod';
import { ApiError } from './errors';
import type { ApiClient, RequestOptions } from './client';
import type { ApiMarketResponse } from './types';

const attributionSchema = z.object({
  publisher: z.string(),
  url: z.string(),
  licence: z.string(),
  derivedFrom: z.string().nullable(),
  refreshCadence: z.string(),
  usage: z.string(),
});

const quoteSchema = z.object({
  canonicalPlayerId: z.string(),
  source: z.string(),
  format: z.enum(['dynasty_superflex', 'dynasty_1qb']),
  value: z.number().nullable(),
  overallRank: z.number().nullable(),
  positionRank: z.number().nullable(),
  sourceTimestamp: z.string(),
  ingestedAt: z.string(),
  freshness: z.string(),
  provenance: z.string(),
});

export const marketResponseSchema = z.object({
  source: z.string(),
  format: z.enum(['dynasty_superflex', 'dynasty_1qb']),
  attribution: attributionSchema,
  sourceTimestamp: z.string().nullable(),
  sourceVersion: z.string().nullable(),
  capturedAt: z.string().nullable(),
  captureCount: z.number(),
  quoteCount: z.number(),
  quotes: z.array(quoteSchema),
});

export interface FetchMarketOptions extends RequestOptions {
  /** Defaults to the backend's primary lens (Superflex). Never inferred client-side. */
  readonly format?: 'dynasty_superflex' | 'dynasty_1qb';
  readonly source?: string;
}

/**
 * Fetch the latest external market quotes, from `path` — the dev API's `/market` route, or the
 * static `market-latest.json` the scheduled refresh publishes.
 *
 * THE PATH IS A PARAMETER FOR THE SAME REASON `fetchCurrentPublication`'s is. The deployed app
 * reads static JSON; only `resolveSiteDataSource` knows that, and it says so in
 * `source.marketPath`. This function hard-coded `/market`, so the deployed site requested
 * `<base>/data/market` — a URL the export does not produce — and every production page read the
 * market as unavailable. The board still rendered (the market is supplementary by design, which
 * is exactly why the fault was quiet), but the market columns showed an em-dash for all 616
 * players and the Edge column never appeared at all.
 *
 * The response contract is identical either way: `market-latest.json` is written by
 * `toMarketResponse`, the same projection the HTTP route returns, so one schema validates both.
 *
 * An EMPTY market is a 200 with zero quotes, not a 404 — so unlike `/publication` there is no
 * "nothing yet" error kind to handle. A caller distinguishes "no market data" from "market
 * unreachable" by reading `quoteCount`, which is the honest distinction.
 */
export async function fetchMarket(
  client: ApiClient,
  options: FetchMarketOptions = {},
  path = '/market',
): Promise<ApiMarketResponse> {
  const { format, source, ...request } = options;
  const params = new URLSearchParams();
  if (format) params.set('format', format);
  if (source) params.set('source', source);
  // A STATIC document has no query string to select a lens with — it is one published file,
  // whose `format` field says which lens it already is. Appending `?format=` to it would ask a
  // CDN for a URL that does not exist. The dev API takes the parameters; the export does not.
  const query = path.endsWith('.json') ? '' : params.toString();

  const body = await client.getJson<unknown>(`${path}${query ? `?${query}` : ''}`, request);
  const parsed = marketResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'GET /market returned a body that does not match the market contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

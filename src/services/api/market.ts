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
 * Fetch the latest external market quotes.
 *
 * An EMPTY market is a 200 with zero quotes, not a 404 — so unlike `/publication` there is no
 * "nothing yet" error kind to handle. A caller distinguishes "no market data" from "market
 * unreachable" by reading `quoteCount`, which is the honest distinction.
 */
export async function fetchMarket(
  client: ApiClient,
  options: FetchMarketOptions = {},
): Promise<ApiMarketResponse> {
  const { format, source, ...request } = options;
  const params = new URLSearchParams();
  if (format) params.set('format', format);
  if (source) params.set('source', source);
  const query = params.toString();

  const body = await client.getJson<unknown>(`/market${query ? `?${query}` : ''}`, request);
  const parsed = marketResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'GET /market returned a body that does not match the market contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

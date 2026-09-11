// EXTERNAL dynasty market route.
//
//   GET /market?source=&format=   → the latest quote per player from one external source
//
// READ-ONLY BY CONSTRUCTION. There is no POST here and no write path behind the port:
// ingesting market data is a deliberate, logged batch job (`npm run ingest:market`), not
// something an HTTP caller can set off.
//
// THIS IS NOT A PLAYERTICKER BOARD. Every number returned was published by somebody else. The
// response carries the attribution needed to say so — on the envelope AND on each record, so
// a record quoted in isolation still names where it came from. `GET /publication` remains the
// endpoint for PlayerTicker's own valuations; the two are never merged server-side.

import { DEFAULT_MARKET_FORMAT, DEFAULT_MARKET_SOURCE, isMarketFormat } from '@/application';
import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';
import { toMarketResponse } from '../dto';
import { BadRequestError } from '../middleware/errors';

const SOURCE_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** GET /market — latest external market quotes. An empty market is 200 + zero players. */
export function currentMarket({ app, req }: RouteContext): ApiResponse {
  const source = req.query.source?.trim() || DEFAULT_MARKET_SOURCE;
  if (!SOURCE_PATTERN.test(source)) {
    throw new BadRequestError('invalid query parameter: source', [
      'source must be a short lowercase key, e.g. "dynastyprocess"',
    ]);
  }

  const rawFormat = req.query.format?.trim() || DEFAULT_MARKET_FORMAT;
  // Rejected rather than defaulted: silently answering a 1QB request with Superflex numbers
  // would misprice every quarterback in the response.
  if (!isMarketFormat(rawFormat)) {
    throw new BadRequestError('invalid query parameter: format', [
      'format must be "dynasty_superflex" or "dynasty_1qb"',
    ]);
  }

  const snapshots = app.market.latest(source, rawFormat);
  const captures = app.market.captureInstants(source, rawFormat);
  return { status: 200, body: toMarketResponse(source, rawFormat, snapshots, captures) };
}

// The league format a published board was valued for, in words.
//
// Read from the board's own `leagueSchemaId`, never asserted by the page: a value means nothing
// without its format, and a header that names a different format from the one the values were
// computed for is a false statement about every number on the board.

import type { PublishedMarket } from './types';

/** Known schemas. Mirrors src/utility/leagueSchema.ts; an unknown id is shown verbatim. */
const KNOWN_FORMATS: Readonly<Record<string, string>> = {
  'dynasty-superflex-12': '12-team Superflex dynasty · full PPR',
  'dynasty-1qb-12': '12-team 1QB dynasty · full PPR',
};

export interface PublishedFormat {
  /** Human label, or null when the board names no format. */
  readonly label: string | null;
  /** Every distinct schema id on the board; more than one is itself worth reporting. */
  readonly schemaIds: readonly string[];
}

export function publishedFormat(market: Pick<PublishedMarket, 'players'>): PublishedFormat {
  const ids = [...new Set(market.players.map((p) => p.leagueSchemaId).filter((v): v is string => v !== null))].sort();
  if (ids.length === 0) return { label: null, schemaIds: [] };
  if (ids.length > 1) return { label: `Mixed formats (${ids.join(', ')})`, schemaIds: ids };
  return { label: KNOWN_FORMATS[ids[0]] ?? ids[0], schemaIds: ids };
}

// PlayerTicker dynasty MARKET layer.
//
// Market values are external opinions about what a player is worth. They are stored and
// surfaced SEPARATELY from PlayerTicker's own model output so the two can be compared without
// ever being blended — see `ModelMarketComparison` and `compareModelToMarket`.
//
// Storage lives in `@/persistence` (the `market_snapshot` table, migration 4), not here: this
// module holds the domain types, the pure source adapters, the comparison, and the one file
// that fetches. Nothing in it opens a database.

export * from './types';
export * from './dynastyProcess';
export * from './comparison';
export {
  DYNASTYPROCESS_IDS_URL,
  DYNASTYPROCESS_VALUES_URL,
  fetchCsv,
  parseCsv,
  type FetchOptions,
} from './fetch';

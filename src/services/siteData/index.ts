// PlayerTicker's production data access layer.
//
// The deployed app reads static JSON published by the scheduled refresh. This module owns the
// source decision, the validation and the user-facing wording; pages consume hooks and never
// fetch for themselves.

export { resolveSiteDataSource, type SiteDataEnv, type SiteDataKind, type SiteDataSource } from './source';
export {
  fetchMarketDocument,
  fetchStatusDocument,
  freshnessStates,
  marketDocumentSchema,
  statusDocumentSchema,
  type FreshnessState,
  type MarketDocument,
  type MarketQuote,
  type StatusDocument,
} from './documents';
export { describeFreshness, describeAge, type FreshnessCopy } from './freshness';
export { useSiteStatus, type UseSiteStatusResult } from './useSiteStatus';

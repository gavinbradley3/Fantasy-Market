// The published-market boundary (Phase 10) — API wire shape in, frontend market model out.

export {
  adaptPublication,
  PublicationAdapterError,
  SUPPORTED_POSITIONS,
  type AdaptPublicationOptions,
} from './adapter';
export {
  createDefaultApiClient,
  PublicationProvider,
  usePublicationApiClient,
  usePublicationContext,
  usePublishedMarket,
  type PublicationResult,
  type PublishedMarketStatus,
  type UsePublishedMarketOptions,
  type UsePublishedMarketResult,
} from './PublicationProvider';
export type {
  PublishedComposites,
  PublishedHorizon,
  PublishedMarket,
  PublishedPlayer,
  RejectedRecord,
} from './types';
export { publishedFormat, type PublishedFormat } from './format';
export {
  boardFreshness,
  BOARD_CURRENT_WITHIN_HOURS,
  BOARD_STALE_AFTER_HOURS,
  type BoardFreshness,
  type BoardFreshnessState,
} from './freshness';

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
export { RECOGNIZED_PUBLICATION_FORMATS, resolvePublicationFormat } from './format';
export type { PublicationFormatResolution } from './format';
export type {
  PublishedComposites,
  PublishedDynastyContract,
  PublishedHorizon,
  PublishedMarket,
  PublishedPlayer,
  RejectedRecord,
} from './types';

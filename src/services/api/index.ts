// The PlayerTicker frontend API client — public surface (Phase 10).
//
// Browser-safe by construction: no React, no Node built-ins, and no import of `@/api`,
// `@/application`, `@/scheduler` or `@/persistence` anywhere beneath this barrel
// (enforced by `src/services/api/boundary.test.ts`).

export { ApiClient, DEFAULT_TIMEOUT_MS, joinUrl, normalizeBaseUrl, resolveApiBaseUrl } from './client';
export type { ApiClientConfig, RequestOptions } from './client';
export { ApiError, isAbortError, isApiError, kindForStatus } from './errors';
export type { ApiErrorKind, ApiErrorOptions } from './errors';
export { analyzePublicationContract, fetchCurrentPublication, publicationResponseSchema } from './publication';
export type { PublicationDynastyContract } from './publication';
export { fetchHealth, healthResponseSchema } from './health';
export { fetchMarket, marketResponseSchema, type FetchMarketOptions } from './market';
export type {
  ApiBoardEntry,
  ApiComposites,
  ApiErrorEnvelope,
  ApiHealthResponse,
  ApiPositionCode,
  ApiPublicationMetadata,
  ApiPublicationResponse,
  ApiMarketAttribution,
  ApiMarketQuote,
  ApiMarketResponse,
} from './types';

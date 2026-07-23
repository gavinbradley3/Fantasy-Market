// PlayerTicker internal HTTP API (Phase 9) — public surface.
//
// A lightweight, framework-free HTTP layer whose sole responsibility is exposing the audited
// application service layer: routing, validation, HTTP↔DTO translation, error mapping, and
// dependency composition. It implements no business logic and duplicates no scheduler,
// persistence, or publication rules. This module is Node-only and must never be imported by
// browser/app code (enforced by boundary.test.ts).

export { ApiApp, createApiApp, type RouteContext } from './app';
export { createHttpServer, toApiRequest } from './server';
export { composeApi, type ApiCompositionConfig, type ComposedApi } from './composition';
export { toErrorResponse, NotFoundError, BadRequestError } from './middleware/errors';
export type {
  ApiRequest,
  ApiResponse,
  ApiErrorBody,
  RefreshAckResponse,
  PublicationResponse,
  BoardEntryResponse,
  RunResponse,
  RunSourceResponse,
} from './dto';

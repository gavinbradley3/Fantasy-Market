# PlayerTicker Internal HTTP API (Phase 9)

A lightweight, **framework-free** internal HTTP layer whose only job is to expose the audited
Phase 8 application service layer. It performs **routing, request validation, HTTP↔DTO
translation, error mapping, and dependency composition** — and nothing else. It implements no
business logic and duplicates no scheduler, persistence, or publication rules.

## Why no framework

The application layer is the API's **only** dependency (a Phase 9 constraint). Rather than pull
in Hono/Fastify, the router is a ~60-line matcher and the transport is Node's built-in
`node:http`. The core handler is **framework-agnostic and socket-free**:

```
ApiApp.handle(ApiRequest) → ApiResponse     // pure; unit-tested without opening a port
createHttpServer(ApiApp)  → node:http.Server // the only transport-coupled file
```

## Architecture

```
node:http (server.ts)                     ← parses request / serializes response only
        │  ApiRequest
        ▼
   ApiApp (app.ts)                         ← routing; depends ONLY on @/application
        │  RouteContext { app, req, params }
        ▼
   routes/*  ── delegate ──▶ ApplicationService (health / scheduler / refresh / publications / history)
        │
   middleware/validation.ts (zod)          ← 400 on malformed HTTP input
   middleware/errors.ts                    ← application/persistence code → HTTP status
   dto.ts                                  ← stable response projections (no raw persistence records)

Composition root (composition.ts):
   PersistenceStore + Scheduler + ApplicationService + ApiApp  ← the ONE place concretes are built
```

## Endpoints

| Method & path | Delegates to | Notes |
|---|---|---|
| `GET /health` | `HealthService.report()` | 200 ok / 503 degraded |
| `GET /scheduler` | `SchedulerService.status()` | read-only |
| `POST /refresh` | `RefreshService.triggerRefresh()` | ack: accepted/skipped + reason + runId |
| `GET /refresh/current` | `RefreshService.currentExecution()` | |
| `GET /refresh/history?limit=` | `RefreshService.executionHistory()` | default 25, max 500 |
| `GET /publication` | `PublicationService.currentPublication()` | projected board + per-player display fields; 404 if none |
| `GET /publication/history?limit=` | `PublicationService.publicationHistory()` | |
| `GET /publication/:id` | `PublicationService.publicationMetadata()` | 404 if unknown |
| `GET /history/:runId` | `HistoryService.byRunId()` | projected run; 404 if unknown |

Static routes are registered before parameterized siblings, so `/publication/history` is never
captured by `/publication/:id`. A path segment whose percent-encoding cannot be decoded (e.g.
`/publication/%zz`) is a **malformed request**: it is translated to the existing `400` response
before matching, never allowed to fall through to the catch-all `500`.

### `GET /publication` display projection

Each board entry carries its identity and content checksums **plus** the display fields its own
published artifacts already contain (`publicationProjection.ts`): name/team/age/status from the
persisted normalized inference input, and composites/confidence/volatility/honesty from the
persisted production envelope. This is a projection, not a computation — a field an artifact
does not carry is `null`, never a placeholder — and it reads both artifacts structurally, so
the API still imports no valuation or inference code. Serialized payloads, schema versions and
artifact integrity digests are still never leaked.

## Lifecycle and resource ownership

```
composed = composeApi({...})          // owns: Scheduler + PersistenceStore
server   = createHttpServer(api, {})  // owned by the CALLER — not by composed
```

* `ComposedApi.close()` stops the scheduler and closes the persistence store. It is
  **idempotent**: a second call is a no-op and never throws, so an explicit shutdown may race a
  SIGINT/SIGTERM handler safely. `composed.closed` reports whether it has run.
* `ComposedApi` never holds a server reference and therefore cannot close one. The caller that
  called `createHttpServer` owns the socket and must `server.close()` it — server first, then
  `composed.close()`. `scripts/serve-api.ts` is the reference implementation.

## Development CORS

`createHttpServer(api, { allowedOrigins })` is an opt-in, deliberately minimal development
seam for running the frontend and the API on different ports. It echoes only a **configured**
origin (never `*`), sends `Vary: Origin`, never enables credentials, answers preflight from an
allowed origin with `204`, and sends no CORS headers at all when `allowedOrigins` is empty —
the correct configuration when the API is reverse-proxied behind the app's own origin.

## Error mapping

Centralized in `middleware/errors.ts`; underlying application/persistence **codes are preserved**
(never rewritten) and only mapped to a status. Stack traces and provider payloads are never
exposed.

| Source | HTTP |
|---|---|
| malformed request (validation) | 400 |
| `INVALID_ARGUMENT` / `INVALID_CONFIG` | 400 |
| not found (null result) / `NOT_FOUND` / `ARTIFACT_NOT_FOUND` | 404 |
| unknown method on a known path | 405 |
| `CONFLICTING_ARTIFACT` / `DUPLICATE_REFRESH_REQUEST` / publication conflicts | 409 |
| `PERSISTENCE_UNAVAILABLE` | 503 |
| integrity/checksum/migration / anything else | 500 (`INTERNAL`, message redacted) |

## Composition

```ts
import { composeApi, createHttpServer } from '@/api';

const composed = composeApi({
  dbPath: '/var/lib/playerticker.db',
  pipeline: createRefreshPipeline(/* transport+persistence wiring — deployment-specific */),
  transport: { requiredProviders: ['nflverse'], replayEnabled: true },
  scheduler: { intervalMs: 15 * 60_000 },
  autoStart: true,
});
createHttpServer(composed.api).listen(8080);
```

The `RefreshPipeline` (transport wiring) is **injected**, keeping this layer free of
transport/ingestion coupling.

## Boundaries

`boundary.test.ts` enforces that the API imports no valuation/transport/ingestion/inference
code, that only `composition.ts` touches scheduler/persistence runtime, and that **no
browser/app file imports `@/api`** — so the Node-only API never reaches the browser bundle
(also verified by the production-bundle check). The mirror-image check on the browser side
lives in `src/services/api/boundary.test.ts`.

`frontendIntegration.test.ts` lives in this directory for exactly that reason: it drives the
browser's own API client against the real composed stack over a real socket, and a test file
outside `src/api` could not import `@/api` without weakening the rule above.

## Deferred (out of scope)

Authentication, authorization, rate limiting, caching, WebSockets, GraphQL, background workers,
production monitoring, and deployment/Docker.

## Frontend integration

See [`docs/FRONTEND_API_CONTRACT.md`](../../docs/FRONTEND_API_CONTRACT.md) for the contract the
browser app depends on, and `scripts/serve-api.ts` for the local development server.

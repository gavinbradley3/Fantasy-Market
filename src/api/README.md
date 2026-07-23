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
| `GET /publication` | `PublicationService.currentPublication()` | projected board; 404 if none |
| `GET /publication/history?limit=` | `PublicationService.publicationHistory()` | |
| `GET /publication/:id` | `PublicationService.publicationMetadata()` | 404 if unknown |
| `GET /history/:runId` | `HistoryService.byRunId()` | projected run; 404 if unknown |

Static routes are registered before parameterized siblings, so `/publication/history` is never
captured by `/publication/:id`.

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
(also verified by the production-bundle check).

## Deferred (out of scope for Phase 9)

Authentication, authorization, rate limiting, caching, WebSockets, GraphQL, background workers,
production monitoring, deployment/Docker, and frontend integration.

# PlayerTicker Application Service Layer (Phase 8)

A thin **internal application service layer** that becomes the single entry point for future
HTTP APIs, CLI commands, workers, and admin tools. It **coordinates** the already-audited
Phase 6/7 systems (persistence, publication, replay, scheduler) **without changing their
behavior** and contains **no business logic** of its own.

## Design: ports, not implementations

The services depend only on narrow **port interfaces** (`types.ts`), never on concrete
persistence, transport, or valuation classes. Every foreign type is imported with
`import type`, so this layer pulls in **no `node:sqlite` runtime** and no valuation/transport
code (enforced by `boundary.test.ts`). The authoritative `Scheduler` and `PersistenceStore`
**structurally satisfy** the ports, so the composition root wires them in with **zero
adapters**.

```
Future HTTP API / CLI / worker / admin tool
        │  depends only on
        ▼
   ApplicationService  (façade)
        │
        ├── RefreshService      → SchedulerPort            (delegates; no lock/timer/retry here)
        ├── SchedulerService    → SchedulerPort            (read-only status; enabled = state≠disabled)
        ├── PublicationService  → PublicationReadPort      (delegates to persistence; recomputes nothing)
        ├── HistoryService      → RunHistoryPort + recorder(durable by-id + observed recent)
        └── HealthService       → SchedulerPort + PublicationReadPort + transport descriptor
```

## Services

| Service | Responsibility |
|---|---|
| `RefreshService` | `triggerRefresh()` (await outcome), `triggerRefreshNow()` (non-blocking ack), `currentExecution()`, `executionHistory()` — all via the scheduler |
| `SchedulerService` | Read-only `status()`: running, enabled, state, metrics, last execution, next-run estimate |
| `PublicationService` | Current publication + bundle, metadata by id, history, latest board checksum |
| `HistoryService` | `latest()` / `recent(n)` (observed) + `byRunId()` (durable persistence record) |
| `HealthService` | Deterministic internal health: scheduler, persistence, publication, replay, transport |
| `ApplicationService` | Façade aggregating the five, plus convenience passthroughs |

## Dependency rules (enforced)

- **May** depend on: the scheduler, persistence **interfaces/types**, injected repositories.
- **Must not** depend on: valuation engines, transport implementations, database internals,
  Node built-ins.
- Business logic stays **below** this layer. `boundary.test.ts` fails the build if any of
  these rules is violated, or if any browser/app file imports `@/application`.

## Wiring (composition root — Node-only, out of scope for Phase 8)

```ts
import { createApplicationService } from '@/application';
import { Scheduler } from '@/scheduler';
import { PersistenceStore } from '@/persistence';

const store = PersistenceStore.open(dbPath);
const scheduler = new Scheduler({ pipeline /* createRefreshPipeline(...) */ });

// Both structurally satisfy the ports — no adapters.
const app = createApplicationService({
  scheduler,
  publications: store,
  runs: store,
  transport: { requiredProviders: ['nflverse'], replayEnabled: true },
});
```

## Error handling

Failures are normalized to `ApplicationError` with a small stable code set
(`INVALID_ARGUMENT`, `NOT_FOUND`, `PERSISTENCE_UNAVAILABLE`, `REFRESH_DISPATCH_FAILED`). The
**original** low-level code (e.g. a `PersistenceError` code) is **never rewritten** — it is
preserved on `cause`/`detail` for diagnostics. Existing persistence error codes are untouched.

## Deferred (out of scope for Phase 8)

HTTP/REST/GraphQL endpoints, authentication, authorization, background workers, monitoring
integrations, external metrics, and deployment. This layer is the seam those will build on.

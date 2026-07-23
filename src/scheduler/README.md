# PlayerTicker Scheduler (Phase 7)

Deterministic scheduled orchestration of the already-audited refresh → persist → publish
pipeline. The scheduler is a **thin operational layer**: it decides *when* refreshes run,
guarantees *one at a time*, owns *run ids*, applies a *retry policy*, and records
*operational outcomes*. It contains **no** transport, ingestion, inference, valuation,
persistence, or publication logic — those are consumed through an injected `RefreshPipeline`.

## Design: pure & portable

`src/scheduler/` imports **no** `@/persistence`, `@/transport`, `@/ingestion`,
`@/inference`, or Node built-ins (enforced by `boundary.test.ts`). It drives the pipeline
through an injected interface, so it is trivially testable and can never drag Node-only
persistence code into the browser bundle. The **composition root** (a future service/API
entry, out of scope for Phase 7) wires the real APIs.

## Flow

```
Timer / triggerNow()
        │  acquire process-local lock (skip if already running)
        ▼
generate run id  (scheduler-owned, reused across retries)
        ▼
pipeline.refresh(ctx)          ← refreshSources(...)
        ▼
pipeline.persist(ctx, result)  ← persistRefreshResult(store, { runId, ... })
        ▼
pipeline.publish(ctx)          ← store.publishBoard({ runId })   (only if publishable)
        ▼
release lock, record metrics + operational result
```

## Single-run guarantee

A process-local flag (the lock) admits **0 or 1** active execution. Any trigger — interval
or manual — that fires while an execution is active is **skipped and recorded**, never
queued. Single-process assumption only; no distributed/DB/Redis lock is implemented.

## Run ids

The scheduler generates one id per execution *before work begins*
(`<prefix>-<trigger>-<iso>-<seq>`) and **reuses it across retries** of that execution. It
never mints a new id after partial progress — so a retry re-persists idempotently under the
same id (and a genuinely changed board surfaces as a non-retryable `CONFLICTING_ARTIFACT`,
never masked).

## Retry policy

Retries apply **only** to thrown, explicitly-retryable operational failures
(`error.retryable === true`). The following are **never** retried (terminal):
`CONFLICTING_ARTIFACT`, `INVALID_ARTIFACT_SET`, `PUBLICATION_NOT_ALLOWED`,
`INTEGRITY_VIOLATION`, `CHECKSUM_MISMATCH`, `UNSUPPORTED_PERSISTED_SCHEMA`,
`UNSUPPORTED_DATABASE_VERSION`, `MIGRATION_FAILURE`, `ARTIFACT_NOT_FOUND`,
`DUPLICATE_REFRESH_REQUEST`, `INVALID_CONFIG`. A completed-but-non-success refresh
(partial/failure) is **not** retried by the scheduler — transport already retried its own
sources internally; the run is persisted for provenance and simply not published.
Backoff is exponential with **deterministic** jitter derived from the run id (no RNG).

## Triggers

- **Manual** — `triggerNow()` runs one execution now.
- **Interval** — `start()` arms a periodic timer (`intervalMs`). No cron parsing.

## Lifecycle

`start()`, `stop()`, `isRunning()`, `triggerNow()`. `stop()` cancels the interval timer and
prevents future interval runs; an in-flight execution is allowed to finish (state ends
`stopped`). States: `idle`, `running`, `backingOff`, `stopped`, `disabled`.

## Metrics

`getMetrics()` → `{ executions, successes, failures, retries, skipped, publications }`.

## Files

| File | Purpose |
|---|---|
| `types.ts` | Public types + the `RefreshPipeline` interface |
| `config.ts` | Typed config, defaults, `resolveConfig`, default timer |
| `errors.ts` | `SchedulerError` |
| `retry.ts` | Retry classification + deterministic backoff |
| `state.ts` | Deterministic state machine |
| `metrics.ts` | Runtime counters |
| `runner.ts` | One execution: refresh → persist → publish with retry |
| `scheduler.ts` | Lifecycle, lock, interval timer, run-id ownership |
| `index.ts` | Public surface |

## Wiring the real pipeline (composition root — Node-only, lives outside `src/scheduler/`)

```ts
import { Scheduler, type RefreshPipeline } from '@/scheduler';
import { refreshSources, type RefreshDeps, type RefreshRequest, type RefreshResult } from '@/transport';
import { PersistenceStore, persistRefreshResult } from '@/persistence';
import type { BuildInputOptions } from '@/ingestion';

export function createRefreshPipeline(
  store: PersistenceStore,
  deps: RefreshDeps,
  sources: readonly RefreshRequest[],
  builds: readonly BuildInputOptions[],
  requiredProviders: readonly ('nflverse' | 'sleeper')[],
): RefreshPipeline<RefreshResult> {
  // Thread the refresh result from refresh → persist via a per-run cache keyed by runId.
  const pending = new Map<string, RefreshResult>();
  return {
    async refresh(ctx) {
      const result = await refreshSources({ sources, inference: builds, policy: { requiredProviders } }, deps);
      pending.set(ctx.runId, result);
      return result;
    },
    async persist(ctx, result) {
      const outcome = persistRefreshResult(store, {
        result, inferenceBuilds: builds, requiredProviders,
        runId: ctx.runId, startedAt: ctx.startedAt, completedAt: new Date().toISOString(),
      });
      return { status: outcome.status, publishable: outcome.publishable, snapshotId: outcome.snapshotId };
    },
    async publish(ctx) {
      const pub = store.publishBoard({ runId: ctx.runId });
      return { publicationId: pub.publicationId, entryCount: pub.entryCount };
    },
  };
}

const scheduler = new Scheduler({ pipeline: createRefreshPipeline(store, deps, sources, builds, ['nflverse']), intervalMs: 15 * 60_000 });
scheduler.start();
```

## Deferred (out of scope for Phase 7)

HTTP API, multi-process/background workers, distributed locking, deployment, monitoring
integrations, external metrics, and additional providers.

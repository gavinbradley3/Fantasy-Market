// Composition root (Phase 9). The ONE place that constructs concrete implementations and wires
// them together: PersistenceStore + Scheduler + ApplicationService + ApiApp. It contains no
// business logic — only construction and dependency injection. A future deployment entry point
// should build nothing but this root.
//
// The `RefreshPipeline` (transport → persistence → publish wiring) is deployment/config-
// specific (source lists, providers, inference builds), so it is INJECTED rather than
// hard-wired here — keeping this root free of transport/ingestion coupling.

import { createApplicationService, type ApplicationService, type TransportConfigDescriptor } from '@/application';
import { Scheduler, type RefreshPipeline, type SchedulerConfig } from '@/scheduler';
import { PersistenceStore } from '@/persistence';
import { ApiApp, createApiApp } from './app';

export interface ApiCompositionConfig {
  /** SQLite database path for the authoritative PersistenceStore. */
  readonly dbPath: string;
  /** The injected refresh pipeline (refresh → persist → publish). Deployment-specific. */
  readonly pipeline: RefreshPipeline;
  /** Deterministic transport descriptor surfaced by /health (no @/transport coupling here). */
  readonly transport: TransportConfigDescriptor;
  /** Optional scheduler tuning (interval, retry, enabled, ...); pipeline is supplied separately. */
  readonly scheduler?: Omit<SchedulerConfig, 'pipeline'>;
  /** Optional ISO clock for application timestamps. */
  readonly nowIso?: () => string;
  /** Optional ISO clock for persistence timestamps. */
  readonly dbNow?: () => string;
  /** Start the scheduler's interval timer immediately. Default false (caller controls lifecycle). */
  readonly autoStart?: boolean;
}

/** The fully-wired API plus handles for lifecycle management and tests. */
export interface ComposedApi {
  readonly api: ApiApp;
  readonly application: ApplicationService;
  readonly scheduler: Scheduler;
  readonly store: PersistenceStore;
  /** Stop the scheduler and close the store. Idempotent-safe for shutdown. */
  close(): void;
}

export function composeApi(config: ApiCompositionConfig): ComposedApi {
  const store = PersistenceStore.open(config.dbPath, config.dbNow);
  const scheduler = new Scheduler({ ...(config.scheduler ?? {}), pipeline: config.pipeline });

  const application = createApplicationService({
    scheduler,
    publications: store,
    runs: store,
    transport: config.transport,
    nowIso: config.nowIso,
  });

  if (config.autoStart) scheduler.start();

  const api = createApiApp(application);
  return {
    api,
    application,
    scheduler,
    store,
    close() {
      scheduler.stop();
      store.close();
    },
  };
}

// ApplicationService (Phase 8) — the single façade future HTTP APIs, CLIs, and workers depend
// on. It aggregates the five focused services and wires them from injected ports only. It adds
// no behavior of its own beyond composition and a few convenience passthroughs; all real work
// lives in the authoritative systems behind the ports.

import { HealthService } from './HealthService';
import { HistoryService } from './HistoryService';
import { PublicationService } from './PublicationService';
import { RefreshService } from './RefreshService';
import { SchedulerService, type NextRunEstimator } from './SchedulerService';
import { InMemoryExecutionRecorder } from './recorder';
import type {
  ApplicationDependencies,
  ExecutionRecorderPort,
  HealthReport,
  NowIso,
  RefreshAcknowledgement,
  RefreshExecutionResult,
  SchedulerStatus,
} from './types';

const defaultNowIso: NowIso = () => new Date().toISOString();

export class ApplicationService {
  readonly refresh: RefreshService;
  readonly scheduler: SchedulerService;
  readonly publications: PublicationService;
  readonly history: HistoryService;
  readonly health: HealthService;

  constructor(deps: ApplicationDependencies, nextRunEstimator?: NextRunEstimator) {
    const nowIso = deps.nowIso ?? defaultNowIso;
    const recorder: ExecutionRecorderPort = deps.recorder ?? new InMemoryExecutionRecorder(deps.historyLimit ?? 100);

    this.refresh = new RefreshService(deps.scheduler, recorder, nowIso);
    this.scheduler = new SchedulerService(deps.scheduler, recorder, nowIso, nextRunEstimator);
    this.publications = new PublicationService(deps.publications);
    this.history = new HistoryService(deps.runs, recorder);
    this.health = new HealthService(deps.scheduler, deps.publications, deps.transport, nowIso);
  }

  // ---- convenience passthroughs (stable top-level API surface) ----

  triggerRefresh(): Promise<RefreshExecutionResult> {
    return this.refresh.triggerRefresh();
  }

  triggerRefreshNow(): RefreshAcknowledgement {
    return this.refresh.triggerRefreshNow();
  }

  schedulerStatus(): SchedulerStatus {
    return this.scheduler.status();
  }

  healthReport(): HealthReport {
    return this.health.report();
  }
}

/**
 * Composition helper. The real composition root wires the concrete `Scheduler` and
 * `PersistenceStore` (both of which structurally satisfy the ports) plus a transport
 * descriptor into this factory — no adapters required. Kept port-only so this module pulls in
 * no Node-only persistence runtime.
 */
export function createApplicationService(
  deps: ApplicationDependencies,
  nextRunEstimator?: NextRunEstimator,
): ApplicationService {
  return new ApplicationService(deps, nextRunEstimator);
}

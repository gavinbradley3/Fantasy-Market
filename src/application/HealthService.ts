// HealthService (Phase 8). Returns a deterministic, self-contained health report for internal
// use (liveness/readiness for a future API). It performs NO networking and makes no external
// calls: scheduler health is read from the scheduler port; persistence health is a guarded
// local read of the current publication; replay availability is derived (you can only replay
// what has been published); transport is reported from the injected descriptor. Any read that
// throws degrades the report rather than propagating.

import type {
  HealthReport,
  NowIso,
  PublicationReadPort,
  SchedulerPort,
  TransportConfigDescriptor,
} from './types';

export class HealthService {
  constructor(
    private readonly scheduler: SchedulerPort,
    private readonly store: PublicationReadPort,
    private readonly transport: TransportConfigDescriptor,
    private readonly nowIso: NowIso,
  ) {}

  report(): HealthReport {
    const state = this.scheduler.getState();
    const scheduler = { enabled: state !== 'disabled', running: this.scheduler.isRunning(), state };

    let persistenceAvailable = true;
    let hasCurrent = false;
    let currentPublicationId: string | null = null;
    let boardChecksum: string | null = null;
    try {
      const rec = this.store.getCurrentPublicationRecord();
      if (rec) {
        hasCurrent = true;
        currentPublicationId = rec.publicationId;
        boardChecksum = rec.boardChecksum;
      }
    } catch {
      persistenceAvailable = false;
    }

    // Replay is a persistence capability that only makes sense once a board is published.
    const replayAvailable = persistenceAvailable && hasCurrent && this.transport.replayEnabled;
    const status: HealthReport['status'] = persistenceAvailable ? 'ok' : 'degraded';

    return {
      status,
      scheduler,
      persistence: { available: persistenceAvailable },
      publication: { hasCurrent, currentPublicationId, boardChecksum },
      replay: { available: replayAvailable },
      transport: this.transport,
      checkedAt: this.nowIso(),
    };
  }
}

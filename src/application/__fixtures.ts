// Application-layer test fixtures (Phase 8). Fake ports only — no real persistence/transport,
// no scheduler class. These let the service tests assert pure coordination behavior and prove
// the services hold no business logic of their own.

import type { PublicationBundle, PublicationRecord, RefreshRunView } from '@/persistence';
import type { SchedulerExecutionResult, SchedulerMetricsSnapshot, SchedulerState } from '@/scheduler';
import type { PublicationReadPort, RunHistoryPort, SchedulerPort, TransportConfigDescriptor } from './types';

export function execResult(over: Partial<SchedulerExecutionResult> = {}): SchedulerExecutionResult {
  return {
    runId: 'run-manual-T-1',
    trigger: 'manual',
    attempts: 1,
    retries: 0,
    durationMs: 5,
    success: true,
    skipped: false,
    published: true,
    publicationId: 'pub-1',
    status: 'success',
    ...over,
  };
}

/** A controllable scheduler double honoring the synchronous lock-acquire ordering. */
export class FakeScheduler implements SchedulerPort {
  state: SchedulerState = 'idle';
  activeRunId: string | null = null;
  running = false;
  startCalls = 0;
  stopCalls = 0;
  triggerCalls = 0;
  metrics: SchedulerMetricsSnapshot = { executions: 0, successes: 0, failures: 0, retries: 0, skipped: 0, publications: 0 };

  private nextResult: SchedulerExecutionResult = execResult();
  private pending: { resolve: (r: SchedulerExecutionResult) => void } | null = null;
  private throwOnTrigger = false;

  setNextResult(r: SchedulerExecutionResult): void {
    this.nextResult = r;
  }
  failNextTrigger(): void {
    this.throwOnTrigger = true;
  }

  triggerNow(): Promise<SchedulerExecutionResult> {
    this.triggerCalls++;
    if (this.throwOnTrigger) {
      this.throwOnTrigger = false;
      return Promise.reject(new Error('boom'));
    }
    // Synchronous lock-acquire ordering, matching the real scheduler.
    this.running = true;
    this.activeRunId = this.nextResult.runId;
    this.state = 'running';
    return new Promise<SchedulerExecutionResult>((resolve) => {
      const settle = () => {
        this.running = false;
        this.activeRunId = null;
        this.state = 'idle';
        resolve(this.nextResult);
      };
      this.pending = { resolve: () => settle() };
    });
  }
  /** Resolve the in-flight triggerNow() (for controlling async ordering in tests). */
  settle(): void {
    this.pending?.resolve(this.nextResult);
    this.pending = null;
  }

  isRunning(): boolean {
    return this.running;
  }
  getState(): SchedulerState {
    return this.state;
  }
  getMetrics(): SchedulerMetricsSnapshot {
    return this.metrics;
  }
  getActiveRunId(): string | null {
    return this.activeRunId;
  }
  start(): void {
    this.startCalls++;
  }
  stop(): void {
    this.stopCalls++;
  }
}

/** A simple auto-resolving scheduler double for blocking-path tests. */
export class InstantScheduler extends FakeScheduler {
  override triggerNow(): Promise<SchedulerExecutionResult> {
    const p = super.triggerNow();
    this.settle();
    return p;
  }
}

export function pubRecord(over: Partial<PublicationRecord> = {}): PublicationRecord {
  return {
    publicationId: 'pub-1',
    schemaVersion: 'publication@1',
    runId: 'run-manual-T-1',
    snapshotId: 'snap-1',
    boardChecksum: 'checksum-abc',
    entryCount: 3,
    publishedAt: '2026-01-01T00:00:00.000Z',
    supersededPublicationId: null,
    ...over,
  };
}

export class FakeStore implements PublicationReadPort, RunHistoryPort {
  current: PublicationRecord | null = pubRecord();
  currentBundle: PublicationBundle | null = null;
  byId = new Map<string, PublicationRecord>([['pub-1', pubRecord()]]);
  historyList: PublicationRecord[] = [pubRecord()];
  runs = new Map<string, RefreshRunView>();
  throwOn: Set<string> = new Set();

  private guard(op: string): void {
    if (this.throwOn.has(op)) throw Object.assign(new Error('db closed'), { code: 'READ_FAILURE' });
  }

  getCurrentPublicationRecord(): PublicationRecord | null {
    this.guard('getCurrentPublicationRecord');
    return this.current;
  }
  getPublicationRecord(id: string): PublicationRecord | null {
    this.guard('getPublicationRecord');
    return this.byId.get(id) ?? null;
  }
  getPublicationHistory(limit = 100): PublicationRecord[] {
    this.guard('getPublicationHistory');
    return this.historyList.slice(0, limit);
  }
  getCurrentPublication(): PublicationBundle | null {
    this.guard('getCurrentPublication');
    return this.currentBundle;
  }
  getRefreshRun(runId: string): RefreshRunView | null {
    this.guard('getRefreshRun');
    return this.runs.get(runId) ?? null;
  }
}

export const transportDescriptor: TransportConfigDescriptor = {
  requiredProviders: ['nflverse'],
  replayEnabled: true,
};

export const fixedNow = () => '2026-07-23T00:00:00.000Z';

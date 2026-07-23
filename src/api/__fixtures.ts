// API test fixtures (Phase 9). A structural fake of ApplicationService exposing only the
// service methods the routes touch, with controllable returns + call recording. Lets the route
// tests assert pure HTTP behavior (routing, validation, translation, error mapping) without the
// real backend. Integration tests use the real ApplicationService via composeApi instead.

import type { ApplicationService, RefreshExecutionResult } from '@/application';
import type { PublicationBundle, PublicationRecord, RefreshRunView } from '@/persistence';

type Any = Record<string, unknown>;

export function healthReport(over: Any = {}) {
  return {
    status: 'ok',
    scheduler: { enabled: true, running: false, state: 'idle' },
    persistence: { available: true },
    publication: { hasCurrent: true, currentPublicationId: 'pub-1', boardChecksum: 'chk' },
    replay: { available: true },
    transport: { requiredProviders: ['nflverse'], replayEnabled: true },
    checkedAt: 'T',
    ...over,
  };
}

export function schedulerStatus(over: Any = {}) {
  return {
    running: false,
    enabled: true,
    state: 'idle',
    activeRunId: null,
    metrics: { executions: 1, successes: 1, failures: 0, retries: 0, skipped: 0, publications: 1 },
    lastExecution: null,
    nextScheduledExecutionAt: null,
    ...over,
  };
}

export function execResult(over: Any = {}): RefreshExecutionResult {
  return {
    runId: 'run-1',
    trigger: 'manual',
    status: 'success',
    success: true,
    skipped: false,
    published: true,
    publicationId: 'pub-1',
    attempts: 1,
    retries: 0,
    durationMs: 3,
    skipReason: null,
    failure: null,
    ...over,
  } as RefreshExecutionResult;
}

export function pubMetadata(over: Any = {}): PublicationRecord {
  return {
    publicationId: 'pub-1',
    schemaVersion: 'publication@1',
    runId: 'run-1',
    snapshotId: 'snap-1',
    boardChecksum: 'chk',
    entryCount: 2,
    publishedAt: '2026-01-01T00:00:00.000Z',
    supersededPublicationId: null,
    ...over,
  } as PublicationRecord;
}

export function pubBundle(): PublicationBundle {
  return {
    publication: pubMetadata(),
    run: {} as never,
    sources: [],
    snapshot: {} as never,
    entries: [
      { canonicalId: 'p:aaa', position: 'QB', normalizedInput: { checksum: 'ni-1' }, output: { checksum: 'out-1' } },
      { canonicalId: 'p:bbb', position: 'WR', normalizedInput: { checksum: 'ni-2' }, output: { checksum: 'out-2' } },
    ],
  } as unknown as PublicationBundle;
}

export function runView(over: Any = {}): RefreshRunView {
  return {
    run: {
      runId: 'run-1', schemaVersion: 'run@1', startedAt: 'A', completedAt: 'B', mode: 'live',
      status: 'success', requiredFailure: false, sourceCount: 2, successCount: 2, failureCount: 0,
      codeVersion: null, configFingerprint: null, snapshotId: 'snap-1', createdAt: 'C',
    },
    sources: [
      { runId: 'run-1', provider: 'nflverse', capability: 'stats', requestKey: 'k', required: true, mode: 'live', status: 'success', payloadChecksum: 'pc', errorCode: null, failureStage: null, retryable: null, errorMessage: null },
    ],
    inference: [],
    ...over,
  } as unknown as RefreshRunView;
}

export interface FakeApp {
  application: ApplicationService;
  calls: string[];
  refreshResult: ReturnType<typeof execResult>;
  currentPublicationBundle: PublicationBundle | null;
  currentPublicationMeta: PublicationRecord | null;
  byId: Map<string, PublicationRecord>;
  runs: Map<string, RefreshRunView>;
  history: ReturnType<typeof execResult>[];
  publicationHistoryList: PublicationRecord[];
  throwOnPublications?: unknown;
  throwOnRefresh?: unknown;
}

/** Build a structural ApplicationService fake; override behavior via the returned handle. */
export function fakeApplication(): FakeApp {
  const handle: FakeApp = {
    calls: [],
    refreshResult: execResult(),
    currentPublicationBundle: pubBundle(),
    currentPublicationMeta: pubMetadata(),
    byId: new Map([['pub-1', pubMetadata()]]),
    runs: new Map([['run-1', runView()]]),
    history: [execResult({ runId: 'run-2' }), execResult({ runId: 'run-1' })],
    publicationHistoryList: [pubMetadata({ publicationId: 'pub-2' }), pubMetadata()],
    application: undefined as unknown as ApplicationService,
  };

  const rec = (name: string) => handle.calls.push(name);
  const app = {
    health: { report: () => (rec('health.report'), healthReport()) },
    scheduler: { status: () => (rec('scheduler.status'), schedulerStatus()) },
    refresh: {
      triggerRefresh: async () => {
        rec('refresh.triggerRefresh');
        if (handle.throwOnRefresh) throw handle.throwOnRefresh;
        return handle.refreshResult;
      },
      currentExecution: () => (rec('refresh.currentExecution'), { running: false, activeRunId: null, state: 'idle' }),
      executionHistory: (limit: number) => (rec(`refresh.executionHistory:${limit}`), handle.history.slice(0, limit)),
    },
    publications: {
      currentPublication: () => {
        rec('publications.currentPublication');
        if (handle.throwOnPublications) throw handle.throwOnPublications;
        return handle.currentPublicationBundle;
      },
      currentPublicationMetadata: () => {
        rec('publications.currentPublicationMetadata');
        if (handle.throwOnPublications) throw handle.throwOnPublications;
        return handle.currentPublicationMeta;
      },
      publicationMetadata: (id: string) => (rec(`publications.publicationMetadata:${id}`), handle.byId.get(id) ?? null),
      publicationHistory: (limit: number) => (rec(`publications.publicationHistory:${limit}`), handle.publicationHistoryList.slice(0, limit)),
    },
    history: {
      byRunId: (runId: string) => (rec(`history.byRunId:${runId}`), handle.runs.get(runId) ?? null),
    },
  };
  handle.application = app as unknown as ApplicationService;
  return handle;
}

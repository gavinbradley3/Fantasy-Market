// Scheduler test fixtures (Phase 7): a controllable fake timer, a mock RefreshPipeline that
// records orchestration order, and helpers. Pure — no @/persistence or @/transport imports.

import { vi } from 'vitest';
import type { PersistStepResult, PublishStepResult, RefreshPipeline, SchedulerTimer, TimerHandle } from './types';

/** A timer whose scheduled callbacks fire only when the test says so. */
export class FakeTimer implements SchedulerTimer {
  private seq = 0;
  jobs: { id: number; delayMs: number; fn: () => void }[] = [];

  schedule(delayMs: number, fn: () => void): TimerHandle {
    const id = ++this.seq;
    this.jobs.push({ id, delayMs, fn });
    return { id } as unknown as TimerHandle;
  }
  cancel(handle: TimerHandle): void {
    const id = (handle as { id: number }).id;
    this.jobs = this.jobs.filter((j) => j.id !== id);
  }
  /** Fire the earliest-scheduled pending job (the armed interval). */
  fireNext(): void {
    const job = this.jobs.shift();
    job?.fn();
  }
  pending(): number {
    return this.jobs.length;
  }
}

export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const silentLogger = { info() {}, warn() {}, error() {} };

export interface MockPipelineOptions {
  refresh?: (attempt: number, runId: string) => unknown | Promise<unknown>;
  persist?: (runId: string) => PersistStepResult | Promise<PersistStepResult>;
  publish?: (runId: string) => PublishStepResult | Promise<PublishStepResult>;
}

export interface MockPipeline extends RefreshPipeline<unknown> {
  calls: Array<{ step: 'refresh' | 'persist' | 'publish'; runId: string; attempt: number }>;
  refresh: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

/** A mock pipeline recording call order + run ids; success/publishable by default. */
export function makePipeline(opts: MockPipelineOptions = {}): MockPipeline {
  const calls: MockPipeline['calls'] = [];
  const refresh = vi.fn(async (ctx: { runId: string; attempt: number }) => {
    calls.push({ step: 'refresh', runId: ctx.runId, attempt: ctx.attempt });
    return opts.refresh ? await opts.refresh(ctx.attempt, ctx.runId) : { ok: true };
  });
  const persist = vi.fn(async (ctx: { runId: string; attempt: number }) => {
    calls.push({ step: 'persist', runId: ctx.runId, attempt: ctx.attempt });
    return opts.persist ? await opts.persist(ctx.runId) : ({ status: 'success', publishable: true, snapshotId: 'snap-1' } as PersistStepResult);
  });
  const publish = vi.fn(async (ctx: { runId: string; attempt: number }) => {
    calls.push({ step: 'publish', runId: ctx.runId, attempt: ctx.attempt });
    return opts.publish ? await opts.publish(ctx.runId) : ({ publicationId: 'board-abc', entryCount: 3 } as PublishStepResult);
  });
  return { calls, refresh, persist, publish } as unknown as MockPipeline;
}

/** A retryable error shaped like a transient TransportError. */
export function retryableError(message = 'transient'): Error {
  return Object.assign(new Error(message), { retryable: true, code: 'FETCH_FAILED' });
}
/** A terminal error shaped like a deterministic PersistenceError. */
export function terminalError(code = 'CONFLICTING_ARTIFACT'): Error {
  return Object.assign(new Error(code), { retryable: false, code });
}

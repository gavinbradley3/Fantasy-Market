// Runner tests (Phase 7): orchestration order, publication gating, retry (reuse run id,
// non-retryable, max attempts, backoff callbacks), and failure isolation.

import { describe, expect, it, vi } from 'vitest';
import { resolveConfig } from './config';
import { SchedulerMetrics } from './metrics';
import { executeRun, type RunnerCallbacks } from './runner';
import { makePipeline, retryableError, silentLogger, terminalError, type MockPipeline } from './__fixtures';
import type { PersistStepResult } from './types';

function run(pipeline: MockPipeline, over: Record<string, unknown> = {}, cb?: RunnerCallbacks) {
  const cfg = resolveConfig({ pipeline, logger: silentLogger, sleep: () => Promise.resolve(), monotonicNow: () => 0, nowIso: () => '2026-01-01T00:00:00.000Z', ...over });
  const metrics = new SchedulerMetrics();
  const callbacks: RunnerCallbacks = cb ?? { onBackoff() {}, onActive() {} };
  return { cfg, metrics, exec: () => executeRun(cfg, metrics, 'run-fixed-1', 'manual', callbacks) };
}

describe('orchestration order + publication gating', () => {
  it('runs refresh → persist → publish and reports success', async () => {
    const p = makePipeline();
    const { exec, metrics } = run(p);
    const r = await exec();
    expect(p.calls.map((c) => c.step)).toEqual(['refresh', 'persist', 'publish']);
    expect(r.success).toBe(true);
    expect(r.published).toBe(true);
    expect(r.publicationId).toBe('board-abc');
    expect(r.status).toBe('success');
    expect(r.attempts).toBe(1);
    expect(metrics.snapshot().publications).toBe(1);
  });

  it('does not publish when publishOnSuccess is false', async () => {
    const p = makePipeline();
    const { exec } = run(p, { publishOnSuccess: false });
    const r = await exec();
    expect(p.publish).not.toHaveBeenCalled();
    expect(r.published).toBe(false);
    expect(r.success).toBe(true);
  });

  it('does not publish a non-publishable (partial) run', async () => {
    const p = makePipeline({ persist: () => ({ status: 'partial', publishable: false, snapshotId: 'snap' }) as PersistStepResult });
    const { exec } = run(p);
    const r = await exec();
    expect(p.publish).not.toHaveBeenCalled();
    expect(r.success).toBe(false);
    expect(r.status).toBe('partial');
  });

  it('persistence failure prevents publication', async () => {
    const p = makePipeline({ persist: () => { throw terminalError('WRITE-ish'); } });
    const { exec } = run(p);
    const r = await exec();
    expect(p.publish).not.toHaveBeenCalled();
    expect(r.status).toBe('errored');
    expect(r.failure?.stage).toBe('persist');
  });

  it('publication failure is surfaced (previous board untouched by the scheduler)', async () => {
    const p = makePipeline({ publish: () => { throw terminalError('INTEGRITY_VIOLATION'); } });
    const { exec } = run(p);
    const r = await exec();
    expect(r.published).toBe(false);
    expect(r.status).toBe('errored');
    expect(r.failure?.stage).toBe('publish');
  });
});

describe('retry behavior', () => {
  it('retries a retryable error and reuses the SAME run id, then succeeds', async () => {
    let n = 0;
    const p = makePipeline({ refresh: (attempt) => { n++; if (attempt < 3) throw retryableError(); return { ok: true }; } });
    const onBackoff = vi.fn();
    const onActive = vi.fn();
    const { exec } = run(p, { maxAttempts: 3 }, { onBackoff, onActive });
    const r = await exec();
    expect(r.success).toBe(true);
    expect(r.attempts).toBe(3);
    expect(r.retries).toBe(2);
    expect(n).toBe(3);
    // Every attempt used the identical run id.
    const runIds = new Set(p.calls.filter((c) => c.step === 'refresh').map((c) => c.runId));
    expect([...runIds]).toEqual(['run-fixed-1']);
    expect(onBackoff).toHaveBeenCalledTimes(2);
    expect(onActive).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const p = makePipeline({ refresh: () => { throw terminalError('CONFLICTING_ARTIFACT'); } });
    const { exec } = run(p, { maxAttempts: 5 });
    const r = await exec();
    expect(r.attempts).toBe(1);
    expect(r.retries).toBe(0);
    expect(r.status).toBe('errored');
    expect(r.failure?.code).toBe('CONFLICTING_ARTIFACT');
  });

  it('respects maxAttempts for an always-retryable error', async () => {
    const p = makePipeline({ refresh: () => { throw retryableError(); } });
    const { exec, metrics } = run(p, { maxAttempts: 3 });
    const r = await exec();
    expect(r.attempts).toBe(3);
    expect(r.retries).toBe(2);
    expect(r.status).toBe('errored');
    expect(metrics.snapshot().retries).toBe(2);
    expect(metrics.snapshot().failures).toBe(1);
  });

  it('uses deterministic backoff delays (sleep called with computed ms)', async () => {
    const sleeps: number[] = [];
    const p = makePipeline({ refresh: (attempt) => { if (attempt < 3) throw retryableError(); return {}; } });
    const { exec } = run(p, { maxAttempts: 3, backoffBaseMs: 100, backoffMaxMs: 10_000, backoffJitterRatio: 0.25, sleep: (ms: number) => { sleeps.push(ms); return Promise.resolve(); } });
    await exec();
    expect(sleeps.length).toBe(2);
    // Deterministic: re-running yields identical delays.
    const first = [...sleeps];
    sleeps.length = 0;
    const p2 = makePipeline({ refresh: (attempt) => { if (attempt < 3) throw retryableError(); return {}; } });
    const cfg2 = resolveConfig({ pipeline: p2, logger: silentLogger, maxAttempts: 3, backoffBaseMs: 100, backoffMaxMs: 10_000, backoffJitterRatio: 0.25, sleep: (ms: number) => { sleeps.push(ms); return Promise.resolve(); }, nowIso: () => 't' });
    await executeRun(cfg2, new SchedulerMetrics(), 'run-fixed-1', 'manual', { onBackoff() {}, onActive() {} });
    expect(sleeps).toEqual(first);
  });
});

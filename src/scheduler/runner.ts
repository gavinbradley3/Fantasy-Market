// The execution engine (Phase 7). Runs ONE scheduler execution: refresh → persist →
// (conditionally) publish, with bounded retry of retryable failures under a SINGLE, stable
// run id. It owns no lock or timer — the Scheduler guarantees at most one runner is active.
//
// Orchestration order is fixed and observable: refresh, then persist, then publish. Publish
// happens only after a successful, publishable persist. A non-success run (partial/failure)
// is recorded and never published; it is NOT retried here (transport already retried its own
// sources internally — the scheduler retries only THROWN, retryable operational failures).

import type { ResolvedSchedulerConfig } from './config';
import { SchedulerMetrics } from './metrics';
import { computeBackoffMs, errorCode, errorMessage, isRetryableError } from './retry';
import type { ExecutionFailure, SchedulerExecutionResult, TriggerType } from './types';

export interface RunnerCallbacks {
  /** Entering a backoff wait before a retry. */
  onBackoff(): void;
  /** Resuming active execution after a backoff wait. */
  onActive(): void;
}

export async function executeRun<TRefresh>(
  cfg: ResolvedSchedulerConfig<TRefresh>,
  metrics: SchedulerMetrics,
  runId: string,
  trigger: TriggerType,
  callbacks: RunnerCallbacks,
  signal?: AbortSignal,
): Promise<SchedulerExecutionResult> {
  const start = cfg.monotonicNow();
  const startedAt = cfg.nowIso();
  metrics.recordExecution();
  cfg.logger.info('scheduler.execution.started', { runId, trigger, startedAt });

  let retries = 0;
  let attempt = 0;

  while (attempt < cfg.maxAttempts) {
    attempt++;
    const ctx = { runId, trigger, attempt, startedAt, signal };
    let stage: ExecutionFailure['stage'] = 'refresh';
    try {
      stage = 'refresh';
      const refreshResult = await cfg.pipeline.refresh(ctx);

      stage = 'persist';
      const persisted = await cfg.pipeline.persist(ctx, refreshResult);

      let published = false;
      let publicationId: string | null = null;
      if (persisted.publishable && cfg.publishOnSuccess) {
        stage = 'publish';
        const pub = await cfg.pipeline.publish(ctx);
        published = true;
        publicationId = pub.publicationId;
        metrics.recordPublication();
      }

      const success = persisted.status === 'success';
      if (success) metrics.recordSuccess();
      else metrics.recordFailure();
      metrics.recordRetries(retries);

      const durationMs = cfg.monotonicNow() - start;
      cfg.logger.info('scheduler.execution.finished', { runId, trigger, attempts: attempt, retries, status: persisted.status, published, publicationId, durationMs });
      return {
        runId,
        trigger,
        attempts: attempt,
        retries,
        durationMs,
        success,
        skipped: false,
        published,
        publicationId,
        status: success ? 'success' : persisted.status,
      };
    } catch (err) {
      const failure: ExecutionFailure = {
        code: errorCode(err) ?? 'PIPELINE_FAILED',
        message: errorMessage(err),
        retryable: isRetryableError(err),
        stage,
      };
      const canRetry = failure.retryable && attempt < cfg.maxAttempts;
      if (canRetry) {
        retries++;
        const delayMs = computeBackoffMs(runId, attempt, { baseMs: cfg.backoffBaseMs, maxMs: cfg.backoffMaxMs, jitterRatio: cfg.backoffJitterRatio });
        cfg.logger.warn('scheduler.execution.retry', { runId, trigger, attempt, nextAttempt: attempt + 1, delayMs, code: failure.code, stage });
        callbacks.onBackoff();
        await cfg.sleep(delayMs);
        callbacks.onActive();
        continue;
      }
      metrics.recordFailure();
      metrics.recordRetries(retries);
      const durationMs = cfg.monotonicNow() - start;
      cfg.logger.error('scheduler.execution.failed', { runId, trigger, attempts: attempt, retries, code: failure.code, stage, retryable: failure.retryable, durationMs });
      return { runId, trigger, attempts: attempt, retries, durationMs, success: false, skipped: false, published: false, publicationId: null, status: 'errored', failure };
    }
  }

  // Unreachable in practice (the loop returns on success or terminal failure); a safety net.
  const durationMs = cfg.monotonicNow() - start;
  metrics.recordFailure();
  return { runId, trigger, attempts: attempt, retries, durationMs, success: false, skipped: false, published: false, publicationId: null, status: 'errored', failure: { code: 'PIPELINE_FAILED', message: 'retries exhausted', retryable: false, stage: 'refresh' } };
}

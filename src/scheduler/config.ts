// Strongly-typed scheduler configuration (Phase 7). Every timing and behavior is
// configurable — nothing operational is hardcoded in the scheduler logic. Sensible defaults
// are provided so a caller can start with only a `RefreshPipeline`.

import type { RefreshPipeline, SchedulerLogger, SchedulerTimer, TimerHandle } from './types';

export interface SchedulerConfig<TRefresh = unknown> {
  /** The injected pipeline (refresh → persist → publish). Required. */
  readonly pipeline: RefreshPipeline<TRefresh>;

  /** Master switch. A disabled scheduler never runs (manual or interval). Default true. */
  readonly enabled?: boolean;
  /** Interval between automatic executions, in ms. Default 300_000 (5 min). */
  readonly intervalMs?: number;
  /** Run once immediately when started, before the first interval delay. Default false. */
  readonly runOnStart?: boolean;

  /** Max attempts per execution (1 = no retries). Default 3. */
  readonly maxAttempts?: number;
  /** Base backoff delay in ms (doubles per attempt). Default 1000. */
  readonly backoffBaseMs?: number;
  /** Backoff cap in ms. Default 30_000. */
  readonly backoffMaxMs?: number;
  /** Deterministic jitter as a fraction of the delay. Default 0.25. */
  readonly backoffJitterRatio?: number;

  /** Publish the board after a successful, publishable persist. Default true. */
  readonly publishOnSuccess?: boolean;
  /** Allow triggerNow(). Default true. */
  readonly allowManualTrigger?: boolean;
  /** Skip (do not queue) a trigger that fires while an execution is active. Default true. */
  readonly skipIfRunning?: boolean;

  readonly logger?: SchedulerLogger;
  readonly timer?: SchedulerTimer;
  /** Awaitable delay used for retry backoff (injected so tests don't wait). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Monotonic-ish millisecond clock for durations. Default Date.now. */
  readonly monotonicNow?: () => number;
  /** ISO timestamp source for run metadata. Default new Date().toISOString(). */
  readonly nowIso?: () => string;
  /** Run-id prefix. Default 'run'. */
  readonly runIdPrefix?: string;
}

export interface ResolvedSchedulerConfig<TRefresh = unknown> {
  readonly pipeline: RefreshPipeline<TRefresh>;
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly runOnStart: boolean;
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly backoffJitterRatio: number;
  readonly publishOnSuccess: boolean;
  readonly allowManualTrigger: boolean;
  readonly skipIfRunning: boolean;
  readonly logger: SchedulerLogger;
  readonly timer: SchedulerTimer;
  readonly sleep: (ms: number) => Promise<void>;
  readonly monotonicNow: () => number;
  readonly nowIso: () => string;
  readonly runIdPrefix: string;
}

const NOOP_LOGGER: SchedulerLogger = { info() {}, warn() {}, error() {} };

/** A real timer backed by the ambient `setTimeout` (unref'd so it never blocks exit). */
export const defaultTimer: SchedulerTimer = {
  schedule(delayMs, fn) {
    const handle = setTimeout(fn, delayMs) as unknown as { unref?: () => void };
    handle.unref?.();
    return handle as TimerHandle;
  },
  cancel(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const h = setTimeout(resolve, ms) as unknown as { unref?: () => void };
    h.unref?.();
  });

function positiveInt(v: number | undefined, fallback: number, min = 0): number {
  if (v == null || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.floor(v));
}

export function resolveConfig<TRefresh>(config: SchedulerConfig<TRefresh>): ResolvedSchedulerConfig<TRefresh> {
  if (!config.pipeline) throw new Error('SchedulerConfig.pipeline is required');
  return {
    pipeline: config.pipeline,
    enabled: config.enabled ?? true,
    intervalMs: positiveInt(config.intervalMs, 300_000, 1),
    runOnStart: config.runOnStart ?? false,
    maxAttempts: positiveInt(config.maxAttempts, 3, 1),
    backoffBaseMs: positiveInt(config.backoffBaseMs, 1000, 0),
    backoffMaxMs: positiveInt(config.backoffMaxMs, 30_000, 0),
    backoffJitterRatio: config.backoffJitterRatio == null || !Number.isFinite(config.backoffJitterRatio) ? 0.25 : Math.max(0, config.backoffJitterRatio),
    publishOnSuccess: config.publishOnSuccess ?? true,
    allowManualTrigger: config.allowManualTrigger ?? true,
    skipIfRunning: config.skipIfRunning ?? true,
    logger: config.logger ?? NOOP_LOGGER,
    timer: config.timer ?? defaultTimer,
    sleep: config.sleep ?? defaultSleep,
    monotonicNow: config.monotonicNow ?? (() => Date.now()),
    nowIso: config.nowIso ?? (() => new Date().toISOString()),
    runIdPrefix: config.runIdPrefix ?? 'run',
  };
}

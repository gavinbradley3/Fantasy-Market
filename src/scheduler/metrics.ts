// Lightweight in-process runtime counters (Phase 7). No external metrics system; just a
// snapshot the host can scrape or log. All counters are monotonic for the scheduler's life.

import type { SchedulerMetricsSnapshot } from './types';

export class SchedulerMetrics {
  private executions = 0;
  private successes = 0;
  private failures = 0;
  private retries = 0;
  private skipped = 0;
  private publications = 0;

  recordExecution(): void {
    this.executions++;
  }
  recordSuccess(): void {
    this.successes++;
  }
  recordFailure(): void {
    this.failures++;
  }
  recordRetries(n: number): void {
    if (n > 0) this.retries += n;
  }
  recordSkipped(): void {
    this.skipped++;
  }
  recordPublication(): void {
    this.publications++;
  }

  snapshot(): SchedulerMetricsSnapshot {
    return {
      executions: this.executions,
      successes: this.successes,
      failures: this.failures,
      retries: this.retries,
      skipped: this.skipped,
      publications: this.publications,
    };
  }
}

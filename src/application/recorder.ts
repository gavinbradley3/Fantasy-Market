// In-memory operational execution recorder (Phase 8). Captures the outcomes of executions
// the application layer observes so `executionHistory()` / `history.recent()` can report them
// without a new persistence query. This is operational metadata (which runs the service saw),
// NOT durable business data — the authoritative per-run record still lives in persistence and
// is read by run id via the RunHistoryPort. Bounded to `limit` most-recent entries.

import type { ExecutionRecorderPort, RefreshExecutionResult } from './types';

export class InMemoryExecutionRecorder implements ExecutionRecorderPort {
  private readonly limit: number;
  private readonly buffer: RefreshExecutionResult[] = []; // newest last

  constructor(limit = 100) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  record(result: RefreshExecutionResult): void {
    this.buffer.push(result);
    if (this.buffer.length > this.limit) this.buffer.shift();
  }

  latest(): RefreshExecutionResult | null {
    return this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
  }

  /** The `limit` most-recent executions, newest first. */
  recent(limit: number): RefreshExecutionResult[] {
    if (limit <= 0) return [];
    return this.buffer.slice(-limit).reverse();
  }

  all(): readonly RefreshExecutionResult[] {
    return [...this.buffer].reverse(); // newest first
  }
}

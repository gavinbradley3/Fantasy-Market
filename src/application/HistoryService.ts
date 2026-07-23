// HistoryService (Phase 8). Read-only refresh history. Two sources, cleanly separated:
//   - durable, authoritative per-run records → the persistence RunHistoryPort (by run id);
//   - operational execution outcomes the service observed → the in-memory recorder
//     (latest / recent N).
// It duplicates no persistence query: `byRunId` is a straight delegation, and latest/recent
// read the app-owned recorder rather than re-scanning the database.

import { ApplicationError, underlyingCode } from './errors';
import type {
  ExecutionRecorderPort,
  RefreshExecutionResult,
  RunHistoryPort,
} from './types';
import type { RefreshRunView } from '@/persistence';

export class HistoryService {
  constructor(
    private readonly runs: RunHistoryPort,
    private readonly recorder: ExecutionRecorderPort,
  ) {}

  /** The most-recent execution the service observed, or null. */
  latest(): RefreshExecutionResult | null {
    return this.recorder.latest();
  }

  /** The `limit` most-recent observed executions, newest first. */
  recent(limit = 20): RefreshExecutionResult[] {
    return this.recorder.recent(limit);
  }

  /** The authoritative durable record for a run id (persistence), or null if unknown. */
  byRunId(runId: string): RefreshRunView | null {
    if (!runId) throw new ApplicationError('INVALID_ARGUMENT', 'runId is required');
    try {
      return this.runs.getRefreshRun(runId);
    } catch (err) {
      throw new ApplicationError('PERSISTENCE_UNAVAILABLE', 'refresh-run read failed', {
        cause: err,
        detail: underlyingCode(err),
      });
    }
  }
}

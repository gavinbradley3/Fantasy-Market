// Refresh routes (Phase 9). All delegate to RefreshService — no scheduler logic here.
//   POST /refresh          → trigger and acknowledge (accepted/skipped + reason + run id)
//   GET  /refresh/current  → the in-flight execution, if any
//   GET  /refresh/history  → recent observed executions (?limit=)

import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';
import { toRefreshAck } from '../dto';
import { assertNoBodyOrEmptyObject, parseLimit } from '../middleware/validation';

/** POST /refresh — trigger an immediate refresh; 200 whether it ran or was skipped. */
export async function triggerRefresh({ app, req }: RouteContext): Promise<ApiResponse> {
  assertNoBodyOrEmptyObject(req.body);
  const result = await app.refresh.triggerRefresh();
  return { status: 200, body: toRefreshAck(result) };
}

/** GET /refresh/current — read-only in-flight execution view. */
export function currentExecution({ app }: RouteContext): ApiResponse {
  return { status: 200, body: app.refresh.currentExecution() };
}

/** GET /refresh/history?limit=25 — recent observed executions, newest first. */
export function refreshHistory({ app, req }: RouteContext): ApiResponse {
  const limit = parseLimit(req.query, 25);
  return { status: 200, body: { executions: app.refresh.executionHistory(limit) } };
}

// History route (Phase 9). Delegates to HistoryService.byRunId (durable persistence record).
//   GET /history/:runId → the projected run, or 404 when unknown.

import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';
import { toRunResponse } from '../dto';
import { NotFoundError } from '../middleware/errors';
import { requirePathParam } from '../middleware/validation';

export function runByRunId({ app, params }: RouteContext): ApiResponse {
  const runId = requirePathParam(params.runId, 'runId');
  const view = app.history.byRunId(runId);
  if (!view) throw new NotFoundError(`run ${runId} not found`);
  return { status: 200, body: toRunResponse(view) };
}

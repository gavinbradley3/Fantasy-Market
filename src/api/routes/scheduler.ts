// GET /scheduler (Phase 9). Read-only. Delegates to SchedulerService.status(): state, enabled,
// running, metrics, last execution, next scheduled execution (if surfaced). No mutation.

import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';

export function schedulerStatus({ app }: RouteContext): ApiResponse {
  return { status: 200, body: app.scheduler.status() };
}

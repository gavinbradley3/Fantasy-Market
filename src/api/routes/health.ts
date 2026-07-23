// GET /health (Phase 9). Delegates entirely to HealthService. Reports 200 when the health
// object is 'ok', 503 when 'degraded' (persistence unreachable), so a load balancer/readiness
// probe can act on it. No logic beyond that status derivation.

import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';

export function health({ app }: RouteContext): ApiResponse {
  const report = app.health.report();
  return { status: report.status === 'ok' ? 200 : 503, body: report };
}

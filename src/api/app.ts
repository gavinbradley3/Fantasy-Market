// The API application (Phase 9) — a tiny, framework-free router over the audited application
// layer. Its ONLY dependency is `ApplicationService`; it performs routing, delegates to routes,
// and funnels every failure through the centralized error mapper. It is framework-agnostic:
// `handle(ApiRequest) → ApiResponse` is pure and socket-free, so it is fully testable without
// opening a port (the node:http adapter lives in server.ts).

import type { ApplicationService } from '@/application';
import type { ApiRequest, ApiResponse } from './dto';
import { toErrorResponse } from './middleware/errors';
import { health } from './routes/health';
import { schedulerStatus } from './routes/scheduler';
import { currentExecution, refreshHistory, triggerRefresh } from './routes/refresh';
import { currentPublication, publicationById, publicationHistory } from './routes/publications';
import { runByRunId } from './routes/history';

export interface RouteContext {
  readonly app: ApplicationService;
  readonly req: ApiRequest;
  readonly params: Readonly<Record<string, string>>;
}

type Handler = (ctx: RouteContext) => ApiResponse | Promise<ApiResponse>;

interface Route {
  readonly method: string;
  readonly segments: readonly string[]; // ':name' marks a path parameter
  readonly handler: Handler;
}

function seg(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

// Registration order matters: static routes precede parameterized siblings so that, e.g.,
// "/publication/history" is never captured by "/publication/:id".
const ROUTES: readonly Route[] = [
  { method: 'GET', segments: seg('/health'), handler: health },
  { method: 'GET', segments: seg('/scheduler'), handler: schedulerStatus },
  { method: 'POST', segments: seg('/refresh'), handler: triggerRefresh },
  { method: 'GET', segments: seg('/refresh/current'), handler: currentExecution },
  { method: 'GET', segments: seg('/refresh/history'), handler: refreshHistory },
  { method: 'GET', segments: seg('/publication/history'), handler: publicationHistory },
  { method: 'GET', segments: seg('/publication'), handler: currentPublication },
  { method: 'GET', segments: seg('/publication/:id'), handler: publicationById },
  { method: 'GET', segments: seg('/history/:runId'), handler: runByRunId },
];

function match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = seg(path);
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const s = route.segments[i];
      if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(parts[i]);
      else if (s !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export class ApiApp {
  constructor(private readonly application: ApplicationService) {}

  /** Whether a method+path is a known route (used to distinguish 404 path vs 405 method). */
  private pathExists(path: string): boolean {
    const parts = seg(path);
    return ROUTES.some(
      (r) => r.segments.length === parts.length && r.segments.every((s, i) => s.startsWith(':') || s === parts[i]),
    );
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      const matched = match(req.method.toUpperCase(), req.path);
      if (!matched) {
        const status = this.pathExists(req.path) ? 405 : 404;
        const code = status === 405 ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND';
        return { status, body: { error: { code, message: `${req.method} ${req.path} is not routable` } } };
      }
      return await matched.route.handler({ app: this.application, req, params: matched.params });
    } catch (err) {
      return toErrorResponse(err);
    }
  }
}

export function createApiApp(application: ApplicationService): ApiApp {
  return new ApiApp(application);
}

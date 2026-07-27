// `GET /health` — the backend's deterministic self-report (Phase 10).
//
// Used to describe the data source honestly (is a publication present at all? is the scheduler
// enabled?), never to decide whether to show fabricated data. A failing health check degrades
// the provenance surfaces; it does not substitute a demo market.

import { z } from 'zod';
import { ApiError } from './errors';
import type { ApiClient, RequestOptions } from './client';
import type { ApiHealthResponse } from './types';

export const healthResponseSchema = z.object({
  status: z.union([z.literal('ok'), z.literal('degraded')]),
  scheduler: z.object({ enabled: z.boolean(), running: z.boolean(), state: z.string() }),
  persistence: z.object({ available: z.boolean() }),
  publication: z.object({
    hasCurrent: z.boolean(),
    currentPublicationId: z.string().nullable(),
    boardChecksum: z.string().nullable(),
  }),
  replay: z.object({ available: z.boolean() }),
  transport: z.object({ requiredProviders: z.array(z.string()), replayEnabled: z.boolean() }),
  checkedAt: z.string(),
});

/**
 * Fetch the backend health report.
 *
 * `GET /health` answers 503 when the backend considers itself degraded, and the API client
 * turns that into `ApiError { kind: 'unavailable' }`. The body of a 503 health response is not
 * parsed — a degraded backend is reported as degraded, not partially believed.
 */
export async function fetchHealth(client: ApiClient, options: RequestOptions = {}): Promise<ApiHealthResponse> {
  const body = await client.getJson<unknown>('/health', options);
  const parsed = healthResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'GET /health returned a body that does not match the health contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

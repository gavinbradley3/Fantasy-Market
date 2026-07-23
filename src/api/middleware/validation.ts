// Request validation (Phase 9). Validates HTTP-shaped inputs (path params, query params) and
// rejects malformed requests with a 400 (via BadRequestError). It does NOT duplicate
// application-layer validation — the application still guards its own arguments; this only
// ensures well-formed HTTP input reaches it.

import { z } from 'zod';
import { BadRequestError } from './errors';

/** `?limit=` — a positive integer, capped to keep responses bounded. Default applied by caller. */
const limitSchema = z
  .string()
  .regex(/^\d+$/, 'limit must be a positive integer')
  .transform((s) => Number.parseInt(s, 10))
  .pipe(z.number().int().min(1).max(500));

/** Parse an optional `limit` query param; returns `fallback` when absent. */
export function parseLimit(query: Record<string, string>, fallback: number): number {
  const raw = query.limit;
  if (raw == null || raw === '') return fallback;
  const parsed = limitSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('invalid query parameter: limit', flatten(parsed.error));
  }
  return parsed.data;
}

const idSchema = z.string().trim().min(1).max(512);

/** Require a non-empty path parameter (id / runId). */
export function requirePathParam(value: string | undefined, name: string): string {
  const parsed = idSchema.safeParse(value ?? '');
  if (!parsed.success) {
    throw new BadRequestError(`invalid path parameter: ${name}`, [`${name} must be a non-empty string`]);
  }
  return parsed.data;
}

/** POST /refresh accepts no body; reject a non-empty, non-object body defensively. */
export function assertNoBodyOrEmptyObject(body: unknown): void {
  if (body == null) return;
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0) return;
  throw new BadRequestError('POST /refresh does not accept a request body', ['body must be empty']);
}

function flatten(err: z.ZodError): string[] {
  return err.issues.map((i) => i.message);
}

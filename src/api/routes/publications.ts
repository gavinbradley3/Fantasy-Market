// Publication routes (Phase 9). All delegate to PublicationService (persistence-backed).
//   GET /publication          → current published board (projected; 404 if none)
//   GET /publication/history   → publication history metadata (?limit=)
//   GET /publication/:id       → metadata for a specific publication (404 if unknown)
// The full board is projected to a stable DTO — raw persistence records are never leaked.

import type { RouteContext } from '../app';
import type { ApiResponse } from '../dto';
import { toPublicationResponse } from '../dto';
import { NotFoundError } from '../middleware/errors';
import { parseLimit, requirePathParam } from '../middleware/validation';

/** GET /publication — the current published board, or 404 when nothing is published. */
export function currentPublication({ app }: RouteContext): ApiResponse {
  const bundle = app.publications.currentPublication();
  const metadata = app.publications.currentPublicationMetadata();
  if (!bundle || !metadata) throw new NotFoundError('no current publication');
  return { status: 200, body: toPublicationResponse(bundle, metadata) };
}

/** GET /publication/history?limit=25 — publication metadata, newest first. */
export function publicationHistory({ app, req }: RouteContext): ApiResponse {
  const limit = parseLimit(req.query, 25);
  return { status: 200, body: { publications: app.publications.publicationHistory(limit) } };
}

/** GET /publication/:id — metadata for a specific publication, or 404. */
export function publicationById({ app, params }: RouteContext): ApiResponse {
  const id = requirePathParam(params.id, 'id');
  const meta = app.publications.publicationMetadata(id);
  if (!meta) throw new NotFoundError(`publication ${id} not found`);
  return { status: 200, body: meta };
}

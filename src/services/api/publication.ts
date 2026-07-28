// `GET /publication` — the current published board (Phase 10).
//
// The schema below is a STRUCTURAL gate, matching how the repository already validates every
// other external payload (zod, as in `live/sleeperSchemas.ts`). It answers one question: "is
// this a publication response at all?" A body that fails it is an `invalidResponse`, not a
// board with holes in it. Per-player validity — is this record usable, is that id a duplicate
// — belongs to the publication adapter, one layer up.
//
// Optional display fields are `nullable`, never defaulted: the API sends `null` for a field it
// has not published, and that null must survive all the way to the UI so the UI can say so.

import { z } from 'zod';
import { ApiError } from './errors';
import type { ApiClient, RequestOptions } from './client';
import type { ApiPublicationResponse } from './types';

const compositesSchema = z.object({
  weekly: z.number().nullable(),
  ros: z.number().nullable(),
  oneYear: z.number().nullable(),
  threeYear: z.number().nullable(),
  dynasty: z.number().nullable(),
});

const provenanceSchema = z.object({
  gamesObserved: z.number().nullable(),
  seasonsObserved: z.number().nullable(),
  teamSharesDerived: z.boolean(),
  observedFields: z.array(z.string()),
  derivedFields: z.array(z.string()),
  unavailableFields: z.array(z.string()),
});

const boardEntrySchema = z.object({
  canonicalId: z.string(),
  position: z.string(),
  normalizedInputChecksum: z.string(),
  outputChecksum: z.string(),
  name: z.string().nullable(),
  team: z.string().nullable(),
  age: z.number().nullable(),
  playerStatus: z.string().nullable(),
  asOf: z.string().nullable(),
  outputStatus: z.string().nullable(),
  readiness: z.string().nullable(),
  readinessMissingCount: z.number().nullable(),
  honestyState: z.string().nullable(),
  engineInvoked: z.boolean(),
  publicConfidenceLabel: z.string().nullable(),
  confidenceScore: z.number().nullable(),
  confidenceLabel: z.string().nullable(),
  volatilityScore: z.number().nullable(),
  volatilityLabel: z.string().nullable(),
  composites: compositesSchema.nullable(),
  limitations: z.array(z.string()),
  // Model-tier block. Defaulted rather than required so a board published by an older
  // backend still decodes; the default is the CONSERVATIVE one (no tier claimed → treated as
  // insufficient by the adapter), never an implied full valuation.
  modelTier: z.enum(['FULL', 'ACCESSIBLE', 'INSUFFICIENT']).default('INSUFFICIENT'),
  modelVersion: z.string().nullable().default(null),
  positionValue: z.number().nullable().default(null),
  positionalRank: z.number().nullable().default(null),
  role: z.string().nullable().default(null),
  explanation: z.string().nullable().default(null),
  positiveFactors: z.array(z.string()).default([]),
  negativeFactors: z.array(z.string()).default([]),
  materialMissingInputs: z.array(z.string()).default([]),
  insufficientReason: z.string().nullable().default(null),
  provenance: provenanceSchema.nullable().default(null),
});

const publicationMetadataSchema = z.object({
  publicationId: z.string(),
  runId: z.string(),
  snapshotId: z.string(),
  boardChecksum: z.string(),
  entryCount: z.number(),
  publishedAt: z.string(),
  supersededPublicationId: z.string().nullable(),
});

export const publicationResponseSchema = z.object({
  publication: publicationMetadataSchema,
  entries: z.array(boardEntrySchema),
});

/**
 * Fetch the current published board.
 *
 * A 404 is a legitimate, expected outcome — "nothing has been published yet" — and reaches the
 * caller as `ApiError` with `kind: 'notFound'` so the UI can render an empty state that is
 * clearly distinct from an outage.
 */
export async function fetchCurrentPublication(
  client: ApiClient,
  options: RequestOptions = {},
): Promise<ApiPublicationResponse> {
  const body = await client.getJson<unknown>('/publication', options);
  const parsed = publicationResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', 'GET /publication returned a body that does not match the publication contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

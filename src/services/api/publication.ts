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
  inputsSubstituted: z.number().nullable().default(null),
  insufficientReason: z.string().nullable().default(null),
  provenance: provenanceSchema.nullable().default(null),
  // These three fields define the current canonical shared-utility contract. They are optional
  // only so a genuinely older payload in which all three are absent can still be identified.
  // Do not default them: field absence and an explicit null have different meanings.
  dynastyValue: z.number().nullable().optional(),
  dynastySurplus: z.number().nullable().default(null),
  dynastyDepth: z.number().nullable().default(null),
  dynastyValueSource: z.string().nullable().default(null),
  dynastyPositionRank: z.number().int().positive().nullable().optional(),
  dynastyOverallRank: z.number().int().positive().nullable().optional(),
  leagueSchemaId: z.string().nullable().default(null),
  productionCurveVersion: z.string().nullable().default(null),
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

const canonicalFields = ['dynastyValue', 'dynastyPositionRank', 'dynastyOverallRank'] as const;

export type PublicationDynastyContract = 'canonical' | 'legacy';

export interface PublicationContractAnalysis {
  readonly contract: PublicationDynastyContract | 'ambiguous';
  readonly issues: readonly string[];
}

/** Inspect field presence before compatibility defaults can erase legacy-vs-null semantics. */
export function analyzePublicationContract(
  entries: readonly Pick<ApiPublicationResponse['entries'][number], (typeof canonicalFields)[number] | 'canonicalId' | 'position'>[],
): PublicationContractAnalysis {
  const presence = entries.map((entry) =>
    canonicalFields.map((field) => Object.prototype.hasOwnProperty.call(entry, field)),
  );
  const allAbsent = presence.every((fields) => fields.every((present) => !present));
  if (allAbsent) return { contract: 'legacy', issues: [] };

  const allPresent = presence.every((fields) => fields.every(Boolean));
  if (!allPresent) {
    return {
      contract: 'ambiguous',
      issues: ['canonical dynasty fields must be present on every entry or absent from every entry'],
    };
  }

  const issues: string[] = [];
  const overallRanks = new Map<number, string>();
  const positionRanks = new Map<string, string>();
  for (const entry of entries) {
    const value = entry.dynastyValue;
    const overallRank = entry.dynastyOverallRank;
    const positionRank = entry.dynastyPositionRank;
    const validValue = value === null || (typeof value === 'number' && Number.isFinite(value));
    const validOverall = overallRank === null || (Number.isInteger(overallRank) && (overallRank as number) > 0);
    const validPosition = positionRank === null || (Number.isInteger(positionRank) && (positionRank as number) > 0);
    if (!validValue) issues.push(`${entry.canonicalId}: canonical dynasty value must be finite or null`);
    if (!validOverall) issues.push(`${entry.canonicalId}: canonical overall rank must be a positive integer or null`);
    if (!validPosition) issues.push(`${entry.canonicalId}: canonical position rank must be a positive integer or null`);
    if (!validValue || !validOverall || !validPosition) continue;
    const checkedOverall = overallRank as number | null;
    const checkedPosition = positionRank as number | null;
    const hasAllRanks = overallRank !== null && positionRank !== null;
    const hasAnyRank = overallRank !== null || positionRank !== null;
    if (value === null && hasAnyRank) {
      issues.push(`${entry.canonicalId}: an unvalued entry cannot carry canonical ranks`);
    } else if (value !== null && !hasAllRanks) {
      issues.push(`${entry.canonicalId}: a valued entry must carry both canonical ranks`);
    }
    if (checkedOverall !== null) {
      const prior = overallRanks.get(checkedOverall);
      if (prior) issues.push(`duplicate canonical overall rank ${checkedOverall}: ${prior}, ${entry.canonicalId}`);
      else overallRanks.set(checkedOverall, entry.canonicalId);
    }
    if (checkedPosition !== null) {
      const key = `${entry.position}:${checkedPosition}`;
      const prior = positionRanks.get(key);
      if (prior) issues.push(`duplicate canonical ${entry.position} rank ${checkedPosition}: ${prior}, ${entry.canonicalId}`);
      else positionRanks.set(key, entry.canonicalId);
    }
  }
  return { contract: issues.length ? 'ambiguous' : 'canonical', issues };
}

export const publicationResponseSchema = z.object({
  publication: publicationMetadataSchema,
  entries: z.array(boardEntrySchema),
}).superRefine((response, context) => {
  const analysis = analyzePublicationContract(response.entries);
  for (const message of analysis.issues) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message });
  }
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
  /**
   * Where the board lives, relative to the client's base URL.
   *
   * Defaults to the API route so every existing caller is unchanged. The deployed app passes
   * `/board.json`, which is the SAME document — the static export is produced by
   * `toPublicationResponse`, the identical projection this route uses — so it flows through the
   * same schema and the same adapter rather than a parallel path that could validate
   * differently.
   */
  path = '/publication',
): Promise<ApiPublicationResponse> {
  const body = await client.getJson<unknown>(path, options);
  const parsed = publicationResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalidResponse', `${path} returned a body that does not match the publication contract`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

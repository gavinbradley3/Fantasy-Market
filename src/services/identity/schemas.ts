// Zod schemas for the identity layer's external boundaries.
//
// Provider schemas are DELIBERATELY LENIENT per record (validate only fields
// we consume, passthrough the rest) so one malformed entry or a new provider
// field never poisons a whole payload — the same stance as
// services/marketData/live/sleeperSchemas.ts. The snapshot schema, by
// contrast, is OUR OWN format and is validated strictly on load.

import { z } from 'zod';

// ---------- Sleeper /players/nfl (identity fields only) ----------

export const sleeperIdentityRawSchema = z
  .object({
    player_id: z.string().min(1),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    birth_date: z.string().nullish(),
    age: z.number().nullish(),
    position: z.string().nullish(),
    fantasy_positions: z.array(z.string()).nullish(),
    team: z.string().nullish(),
    status: z.string().nullish(),
    injury_status: z.string().nullish(),
    practice_participation: z.string().nullish(),
    depth_chart_order: z.number().nullish(),
    years_exp: z.number().nullish(),
    active: z.boolean().nullish(),
    gsis_id: z.string().nullish(),
    espn_id: z.union([z.string(), z.number()]).nullish(),
    yahoo_id: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();

export type SleeperIdentityRaw = z.infer<typeof sleeperIdentityRawSchema>;

// ---------- directory snapshot (our own committed format, strict) ----------

const identitySourceSchema = z.enum(['SLEEPER', 'NFLVERSE']);
const provenanceSourceSchema = z.enum(['SLEEPER', 'NFLVERSE', 'MANUAL']);
const matchMethodSchema = z.enum([
  'EXISTING_MAPPING',
  'DIRECT_CROSSWALK',
  'GSIS_ID',
  'NAME_BIRTHDATE_POSITION',
  'NAME_TEAM_POSITION',
  'MANUAL',
  'NEW_IDENTITY',
]);
const confidenceSchema = z.enum(['EXACT', 'HIGH', 'REVIEW_REQUIRED']);
const positionSchema = z.enum(['QB', 'RB', 'WR', 'TE']);

export const sourceIdMapSchema = z.object({
  playerTickerId: z.string().min(1),
  source: identitySourceSchema,
  sourcePlayerId: z.string().min(1),
  matchMethod: matchMethodSchema,
  confidence: confidenceSchema,
  validFrom: z.string(),
  validTo: z.string().nullable(),
});

export const canonicalPlayerIdentitySchema = z.object({
  playerTickerId: z.string().min(1),
  sleeperId: z.string().nullable(),
  gsisId: z.string().nullable(),
  fullName: z.string().min(1),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthDate: z.string().nullable(),
  age: z.number().nullable(),
  position: positionSchema,
  team: z.string().nullable(),
  yearsExperience: z.number().nullable(),
  draftRound: z.number().nullable(),
  rosterStatus: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  practiceStatus: z.string().nullable(),
  depthChartOrder: z.number().nullable(),
  provenance: z.object({
    sources: z.array(provenanceSourceSchema),
    collectedAt: z.string(),
    effectiveSeason: z.number().nullable(),
    qualityFlags: z.array(z.string()),
  }),
});

const providerSourceMetaSchema = z.object({
  url: z.string(),
  fetchedAt: z.string().nullable(),
  checksum: z.string().nullable(),
  recordCount: z.number().nullable(),
  invalidRecords: z.number().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
});

const reviewEntrySchema = z.object({
  source: identitySourceSchema,
  sourcePlayerId: z.string(),
  fullName: z.string(),
  position: z.string(),
  team: z.string().nullable(),
  birthDate: z.string().nullable(),
  reason: z.string(),
  candidates: z.array(z.string()),
});

export const directoryReviewSchema = z.object({
  ambiguous: z.array(reviewEntrySchema),
  unmatched: z.array(reviewEntrySchema),
  methodCounts: z.record(matchMethodSchema, z.number()),
  reviewRequired: z.array(reviewEntrySchema),
});

export const playerDirectorySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  normalizationVersion: z.number(),
  generatedAt: z.string(),
  effectiveSeason: z.number().nullable(),
  sources: z.object({
    sleeper: providerSourceMetaSchema,
    nflverseRoster: providerSourceMetaSchema,
    nflversePlayers: providerSourceMetaSchema,
  }),
  players: z.array(canonicalPlayerIdentitySchema),
  sourceIdMaps: z.array(sourceIdMapSchema),
  review: directoryReviewSchema,
});

// ---------- manual mapping overrides (hand-maintained review resolutions) ----------

export const manualMappingSchema = z.object({
  playerTickerId: z.string().min(1),
  source: identitySourceSchema,
  sourcePlayerId: z.string().min(1),
  /** Reviewer note explaining the manual resolution. */
  note: z.string(),
});

export const manualMappingsFileSchema = z.object({
  version: z.literal(1),
  mappings: z.array(manualMappingSchema),
});

export type ManualMapping = z.infer<typeof manualMappingSchema>;

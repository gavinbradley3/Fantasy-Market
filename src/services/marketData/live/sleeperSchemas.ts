// Zod schemas for Sleeper responses. DELIBERATELY LENIENT: we validate only
// the fields we consume, per record, so one weird entry (or a new field
// Sleeper adds tomorrow) never poisons the whole payload. External APIs are
// never assumed stable.

import { z } from 'zod';

// One entry in the /players/nfl map. Almost everything is optional/nullable in
// the real payload (team-defense records have no full_name, free agents have
// team: null, etc.).
export const sleeperPlayerSchema = z
  .object({
    player_id: z.string().min(1),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    search_full_name: z.string().nullish(),
    position: z.string().nullish(),
    team: z.string().nullish(),
    status: z.string().nullish(), // "Active", "Inactive", "Injured Reserve", ...
    injury_status: z.string().nullish(), // "Questionable", "Out", "IR", ...
    active: z.boolean().nullish(),
    years_exp: z.number().nullish(),
    espn_id: z.union([z.string(), z.number()]).nullish(),
    yahoo_id: z.union([z.string(), z.number()]).nullish(),
    gsis_id: z.string().nullish(),
  })
  .passthrough();

export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;

export const trendingEntrySchema = z
  .object({
    player_id: z.string().min(1),
    count: z.number(),
  })
  .passthrough();

export const trendingResponseSchema = z.array(z.unknown());

// The pruned, matched metadata we actually persist per internal player.
// (We never cache the raw ~5MB payload — only this distilled result.)
export const matchedMetaSchema = z.object({
  sleeperId: z.string(),
  name: z.string(),
  team: z.string(),
  status: z.enum(['active', 'injured', 'suspended', 'inactive']),
  injuryDesignation: z.string().optional(),
  isRookie: z.boolean(),
  espnId: z.string().optional(),
  yahooId: z.string().optional(),
  gsisId: z.string().optional(),
});

export type MatchedMeta = z.infer<typeof matchedMetaSchema>;

export const playersCacheSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.number(),
  /** internal player id → matched Sleeper metadata */
  matches: z.record(matchedMetaSchema),
  unmatchedIds: z.array(z.string()),
  ambiguousIds: z.array(z.string()),
});

export type PlayersCache = z.infer<typeof playersCacheSchema>;

export const trendingCacheSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.number(),
  /** sleeper player id → counts */
  adds: z.record(z.number()),
  drops: z.record(z.number()),
});

export type TrendingCache = z.infer<typeof trendingCacheSchema>;

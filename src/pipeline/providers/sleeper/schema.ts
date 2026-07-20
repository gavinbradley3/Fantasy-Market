// Zod schema for the Sleeper /players/nfl payload, scoped to the metadata
// fields this pipeline consumes. DELIBERATELY LENIENT (.passthrough, almost
// everything nullish): the real payload has ~11k entries of wildly varying
// shape (team defenses have no name, free agents have team: null). One weird
// entry must never poison the payload, so per-record validation is the unit of
// failure — mirrors the existing live provider's philosophy.

import { z } from 'zod';

export const sleeperPlayerSchema = z
  .object({
    player_id: z.string().min(1),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    team: z.string().nullish(),
    status: z.string().nullish(),
    injury_status: z.string().nullish(),
    active: z.boolean().nullish(),
    years_exp: z.number().nullish(),
    age: z.number().nullish(),
    birth_date: z.string().nullish(),
    height: z.union([z.string(), z.number()]).nullish(), // inches, often a string
    weight: z.union([z.string(), z.number()]).nullish(),
    number: z.number().nullish(), // jersey
    // Cross-provider ids Sleeper carries — the raw material for identity joins.
    espn_id: z.union([z.string(), z.number()]).nullish(),
    yahoo_id: z.union([z.string(), z.number()]).nullish(),
    gsis_id: z.string().nullish(),
    sportradar_id: z.string().nullish(),
  })
  .passthrough();

export type SleeperPlayerRaw = z.infer<typeof sleeperPlayerSchema>;

// The /players/nfl response is an object map keyed by player id.
export const sleeperPayloadSchema = z.record(z.unknown());

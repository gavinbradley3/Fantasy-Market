// Zod schema for the nflverse players dataset (an approved open-data subset,
// DESIGN §14.3). The raw snapshot is a JSON array of player rows. nflverse is
// the audited source for DRAFT CAPITAL and the GSIS join key; it also carries
// cross-provider ids used for identity resolution.
//
// Lenient per-row: nflverse columns drift between releases, so we validate only
// the columns we read and let unknown columns pass through.

import { z } from 'zod';

const numeric = z.union([z.string(), z.number()]).nullish();

export const nflversePlayerSchema = z
  .object({
    gsis_id: z.string().nullish(),
    sleeper_id: z.union([z.string(), z.number()]).nullish(),
    espn_id: z.union([z.string(), z.number()]).nullish(),
    yahoo_id: z.union([z.string(), z.number()]).nullish(),
    sportradar_id: z.string().nullish(),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    team: z.string().nullish(),
    latest_team: z.string().nullish(),
    birth_date: z.string().nullish(),
    height: numeric,
    weight: numeric,
    jersey_number: numeric,
    years_exp: numeric,
    rookie_year: numeric,
    entry_year: numeric,
    draft_year: numeric,
    draft_round: numeric,
    draft_number: numeric, // overall pick
    status: z.string().nullish(),
  })
  .passthrough();

export type NflversePlayerRaw = z.infer<typeof nflversePlayerSchema>;

export const nflversePayloadSchema = z.array(z.unknown());

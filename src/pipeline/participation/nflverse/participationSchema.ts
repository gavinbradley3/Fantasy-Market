// Zod schema for nflverse pbp-participation rows (the NGS-sourced 2016–2023
// feed). Lenient per row; season-to-season drift tolerated. `offense_players` is
// a semicolon-delimited GSIS list in the real feed.

import { z } from 'zod';

const flag = z.union([z.number(), z.string(), z.boolean()]).nullish();

export const participationPlaySchema = z
  .object({
    game_id: z.union([z.string(), z.number()]),
    nflverse_game_id: z.union([z.string(), z.number()]).nullish(),
    play_id: z.union([z.string(), z.number()]),
    season: z.union([z.number(), z.string()]),
    week: z.union([z.number(), z.string()]),
    season_type: z.string().nullish(),
    posteam: z.string().nullish(),
    possession_team: z.string().nullish(),
    play_type: z.string().nullish(),
    // Qualification flags (nflverse pbp).
    pass: flag,
    rush: flag,
    sack: flag,
    qb_scramble: flag,
    qb_kneel: flag,
    qb_spike: flag,
    two_point_attempt: flag,
    penalty: flag,
    // Offensive personnel — GSIS ids, ";"-joined; and the reported count.
    offense_players: z.string().nullish(),
    n_offense: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

export type ParticipationPlayRaw = z.infer<typeof participationPlaySchema>;

export const participationPayloadSchema = z.array(z.unknown());

export function participationColumnSignature(rows: readonly unknown[]): string {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as Record<string, unknown>)) keys.add(k);
    }
  }
  return [...keys].sort().join(',');
}

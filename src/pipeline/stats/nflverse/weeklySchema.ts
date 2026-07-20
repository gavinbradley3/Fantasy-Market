// Zod schema for the nflverse weekly player-stats dataset (the free, GSIS-keyed
// offense weekly feed — `nflreadr::load_player_stats`). Scoped to the columns
// this stage consumes and DELIBERATELY LENIENT: nflverse renames/adds columns
// between releases, so we validate per row and read only what we need, letting
// unknown columns pass. One malformed row never poisons the dataset.

import { z } from 'zod';

// nflverse numeric columns arrive as numbers, numeric strings, or "NA"/"" for
// missing. Accept all three at the boundary; the adapter decides 0-vs-null.
const nflNumber = z.union([z.number(), z.string()]).nullish();

export const nflverseWeeklySchema = z
  .object({
    player_id: z.string().min(1), // GSIS id
    player_name: z.string().nullish(),
    player_display_name: z.string().nullish(),
    position: z.string().nullish(),
    position_group: z.string().nullish(),
    recent_team: z.string().nullish(),
    team: z.string().nullish(),
    season: z.union([z.number(), z.string()]),
    week: z.union([z.number(), z.string()]),
    season_type: z.string().nullish(),

    completions: nflNumber,
    attempts: nflNumber,
    passing_yards: nflNumber,
    passing_tds: nflNumber,
    interceptions: nflNumber,
    sacks: nflNumber,
    sack_yards: nflNumber,

    carries: nflNumber,
    rushing_yards: nflNumber,
    rushing_tds: nflNumber,

    receptions: nflNumber,
    targets: nflNumber,
    receiving_yards: nflNumber,
    receiving_tds: nflNumber,
    receiving_air_yards: nflNumber,
    receiving_yards_after_catch: nflNumber,
    target_share: nflNumber,
  })
  .passthrough();

export type NflverseWeeklyRaw = z.infer<typeof nflverseWeeklySchema>;

// The dataset arrives as an array of row objects.
export const nflverseWeeklyPayloadSchema = z.array(z.unknown());

// Column signature: sorted union of observed top-level keys, used as a cheap
// schema-drift indicator recorded on the snapshot.
export function columnSignature(rows: readonly unknown[]): string {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as Record<string, unknown>)) keys.add(k);
    }
  }
  return [...keys].sort().join(',');
}

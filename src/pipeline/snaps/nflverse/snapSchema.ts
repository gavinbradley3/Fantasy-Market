// Zod schema for the nflverse snap-count dataset (`nflreadr::load_snap_counts`),
// scoped to the offensive-participation columns this stage consumes. Lenient per
// row: nflverse renames/adds columns between releases.
//
// NOTE ON KEYS: the raw PFR feed is keyed by `pfr_player_id`. Upstream this is
// crosswalked to GSIS (via nflverse player-id tables); the fixture therefore
// carries `gsis_id` directly so the pipeline can join on the strong key. A live
// implementation performs that crosswalk before snapshotting (see docs).

import { z } from 'zod';

const nflNumber = z.union([z.number(), z.string()]).nullish();

export const nflverseSnapSchema = z
  .object({
    gsis_id: z.string().min(1),
    player_name: z.string().nullish(),
    player: z.string().nullish(),
    position: z.string().nullish(),
    team: z.string().nullish(),
    season: z.union([z.number(), z.string()]),
    week: z.union([z.number(), z.string()]),
    game_type: z.string().nullish(),
    season_type: z.string().nullish(),
    offense_snaps: nflNumber,
    offense_pct: nflNumber, // 0–1 or 0–100 depending on release; normalized in adapter
  })
  .passthrough();

export type NflverseSnapRaw = z.infer<typeof nflverseSnapSchema>;

export const nflverseSnapPayloadSchema = z.array(z.unknown());

export function snapColumnSignature(rows: readonly unknown[]): string {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as Record<string, unknown>)) keys.add(k);
    }
  }
  return [...keys].sort().join(',');
}

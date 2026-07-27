// nflverse release discovery + asset resolution (pure).
//
// nflverse-data does not publish a dataset at one fixed, versioned URL. It publishes each
// dataset as a RELEASE, and each release carries a `timestamp.json` recording when that
// dataset was last rebuilt:
//
//   <base>/<tag>/timestamp.json   →  {"last_updated":"2026-07-27 07:17:28 EDT"}
//   <base>/<tag>/<asset>          →  the data file itself
//
// So "fetch the current nflverse data" is two steps: discover the release's version, then
// fetch that release's asset. This module owns the mapping and the stamp parsing; it
// performs no IO, so both are directly testable without a network.
//
// The tags and asset names below are the ones nflverse publishes TODAY. They are declared
// once, in one table, so a rename is a single edit in a typed map rather than a string
// scattered through the orchestrator.

import type { Capability } from '@/ingestion';

/** How one capability's data is published: a release tag plus the asset name inside it. */
export interface ReleaseAsset {
  /** The release tag (`stats_player`, `players`, …). */
  readonly tag: string;
  /** The asset file name; receives the season for season-scoped datasets. */
  readonly asset: (season: string) => string;
  /** True when the dataset is published per-season and therefore needs a `season` param. */
  readonly seasonScoped: boolean;
}

/**
 * The capabilities nflverse actually publishes, and where.
 *
 * Deliberately NOT exhaustive over `Capability`. nflverse publishes nothing for team,
 * play-by-play aggregates, injuries, availability, transactions, projections or depth
 * charts, so those capabilities are absent here and the registry answers a request for one
 * with an explicit `UNSUPPORTED_CAPABILITY` error. Declaring a path that 404s would turn
 * "this provider does not have that data" into a network failure, which reads like an
 * outage rather than the truth. `officialStarts` is absent for a different reason — it
 * arrives with the schedules payload (see `NFLVERSE_ALSO_NORMALIZES`).
 *
 * `games` resolves to the weekly player-stats export. Note the tag is `stats_player`, not
 * the legacy `player_stats` release — the latter stopped being rebuilt after the 2024
 * season and carries no file for later seasons.
 */
export const NFLVERSE_RELEASES: Partial<Record<Capability, ReleaseAsset>> = {
  identity: { tag: 'players', asset: () => 'players.csv', seasonScoped: false },
  schedule: { tag: 'schedules', asset: () => 'games.csv', seasonScoped: false },
  roster: { tag: 'weekly_rosters', asset: (s) => `roster_weekly_${s}.csv`, seasonScoped: true },
  games: { tag: 'stats_player', asset: (s) => `stats_player_week_${s}.csv`, seasonScoped: true },
  // Published play by play; the adapter folds it to per player per game. This is the only
  // route-exposure evidence nflverse offers, and it is what the WR route proxy consumes.
  participation: { tag: 'pbp_participation', asset: (s) => `pbp_participation_${s}.csv`, seasonScoped: true },
};

/**
 * Capabilities a release's payload ALSO normalizes into, beyond the one it is fetched for.
 *
 * The schedules export names each game's starting quarterbacks (`home_qb_id`/`away_qb_id`),
 * which is the only official start information nflverse publishes — there is no separate
 * starts resource. So `officialStarts` rides along with `schedule` from the same bytes,
 * fetched once and captured once, rather than being registered as a second coordinate
 * pointing at the identical file.
 */
export const NFLVERSE_ALSO_NORMALIZES: Partial<Record<Capability, readonly Capability[]>> = {
  schedule: ['officialStarts'],
};

/** The release-manifest path for a tag. */
export function manifestPath(tag: string): string {
  return `/${tag}/timestamp.json`;
}

/** The asset path for a resolved release. */
export function assetPath(release: ReleaseAsset, season: string): string {
  return `/${release.tag}/${release.asset(season)}`;
}

/**
 * Fixed UTC offsets for the zone abbreviations nflverse stamps its manifests with.
 *
 * The provider writes a local wall-clock time plus a US-Eastern abbreviation. Only these
 * two are recognised, on purpose: guessing at an unrecognised abbreviation would invent an
 * instant that the provider never stated. An unknown zone yields `null`, and the caller
 * keeps the provider's raw text as the opaque version token instead.
 */
const ZONE_OFFSET_MINUTES: Readonly<Record<string, number>> = {
  EST: -5 * 60,
  EDT: -4 * 60,
  UTC: 0,
  GMT: 0,
};

const STAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s+([A-Z]{3}))?$/;

/**
 * Parse an nflverse `last_updated` stamp into an ISO instant, or `null` when it is not a
 * shape we can read exactly. Never falls back to `Date.parse`, whose handling of a bare
 * zone abbreviation is implementation-defined — a value that differs by host would break
 * determinism.
 */
export function parseReleaseStamp(raw: string): string | null {
  const m = STAMP.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, zone] = m;
  const offset = zone === undefined ? 0 : ZONE_OFFSET_MINUTES[zone];
  if (offset === undefined) return null;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offset * 60_000;
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  // Reject a stamp whose fields did not survive the round trip (e.g. month 13, day 32).
  const round = new Date(ms + offset * 60_000);
  if (round.getUTCMonth() + 1 !== Number(mo) || round.getUTCDate() !== Number(d)) return null;
  return iso;
}

export interface DiscoveredRelease {
  /** The provider's version token, verbatim (the raw `last_updated` text). */
  readonly sourceVersion: string;
  /** The same instant in ISO, when the stamp was parseable. */
  readonly sourceLastUpdated: string | null;
}

/**
 * Read a release manifest body. A manifest that parses but carries no usable stamp is not
 * an error — the release exists and its asset is still fetchable — so the caller proceeds
 * with whatever version information the provider did give.
 */
export function readReleaseManifest(body: string): DiscoveredRelease | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const raw = (parsed as Record<string, unknown>).last_updated;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return { sourceVersion: raw.trim(), sourceLastUpdated: parseReleaseStamp(raw) };
}

// The source plan for a refresh: which provider capabilities a run acquires, and how.
//
// One place decides what a production refresh fetches, so the answer to "where did this
// board's data come from" is a list you can read rather than a trail through the
// orchestrator. The plan is data, not control flow — the same list is used to fetch live
// and to replay, with only the `mode` differing, which is what makes a replay provably the
// same run rather than a similar one.

import type { IngestionProvider, RefreshRequest, RefreshMode } from '@/transport';

export interface SourcePlanOptions {
  /**
   * The seasons whose per-season datasets are acquired.
   *
   * Career counting stats span exactly the seasons acquired here and nothing more, so this
   * is the honest place to widen the window: a one-season plan yields a one-season "career",
   * which is a true statement about the evidence rather than a hidden shortfall. Each season
   * is a distinct logical request, so seasons are captured and replayed independently.
   */
  readonly seasons: readonly number[];
  /** The as-of/effective date the payloads represent (ISO). */
  readonly effectiveDate: string;
  /** Live fetch or deterministic replay from the capture store. */
  readonly mode: RefreshMode;
  /**
   * Additional seasons acquired for GAME STATS ONLY, to give career fields a real career.
   *
   * WHY THIS IS SEPARATE FROM `seasons`. A quarterback's career counting fields mean what the
   * spec says only if "career" spans a career. Ingested over three seasons, a decade-long
   * starter shows barely 46 career starts, which silently fails the spec's 48-start
   * ESTABLISHED_STARTER threshold and leaves every career-sample term in the engine describing
   * a three-year window rather than a career.
   *
   * Only the `games` capability is acquired for these seasons — no roster, no participation.
   * Participation is the largest asset by an order of magnitude (~49 MB a season against ~8
   * MB for weekly stats), and nothing that consumes it reaches back beyond the valuation
   * window, so acquiring it here would be paying a very large cost for data no consumer reads.
   */
  readonly careerSeasons?: readonly number[];
  /** Include Sleeper's identity resource for a cross-provider identity join. Default false. */
  readonly includeSleeper?: boolean;
  /** Revalidate against the latest capture with conditional requests. Default true for live. */
  readonly conditional?: boolean;
}

/**
 * The nflverse capabilities a production refresh acquires.
 *
 * `officialStarts` is deliberately absent: nflverse ships it inside the schedules payload,
 * so the registry's `alsoNormalizes` declaration delivers it from those same bytes. Listing
 * it here would fetch the identical file twice and store two captures that differ in no
 * respect except their coordinate.
 */
const NFLVERSE_SEASONLESS = ['identity', 'schedule'] as const;
const NFLVERSE_SEASONAL = ['roster', 'games', 'participation'] as const;

/** Build the deterministic, canonically-ordered source list for one refresh. */
export function buildSourcePlan(options: SourcePlanOptions): RefreshRequest[] {
  const conditional = options.conditional ?? options.mode === 'live';
  const base = { mode: options.mode, effectiveDate: options.effectiveDate, conditional } as const;

  // De-duplicated so a repeated season cannot produce two requests on one coordinate, which
  // the orchestrator rejects outright (and which would double-count every record).
  const seasons = [...new Set(options.seasons)].sort((a, b) => a - b);
  if (seasons.length === 0) throw new Error('a source plan needs at least one season');

  // Career-only seasons are de-duplicated against the valuation seasons, so naming a season
  // in both lists cannot produce two requests on one coordinate.
  const careerOnly = [...new Set(options.careerSeasons ?? [])]
    .filter((y) => !seasons.includes(y))
    .sort((a, b) => a - b);

  const sources: RefreshRequest[] = [
    ...NFLVERSE_SEASONLESS.map((capability) => ({ provider: 'nflverse' as const, capability, ...base })),
    ...seasons.flatMap((year) =>
      NFLVERSE_SEASONAL.map((capability) => ({
        provider: 'nflverse' as const,
        capability,
        ...base,
        params: { season: String(year) },
      })),
    ),
    // Game stats only — see `careerSeasons`.
    ...careerOnly.map((year) => ({
      provider: 'nflverse' as const,
      capability: 'games' as const,
      ...base,
      params: { season: String(year) },
    })),
  ];

  if (options.includeSleeper) {
    sources.push({ provider: 'sleeper', capability: 'identity', ...base });
  }

  // Canonical order, so the plan — and every summary derived from it — is stable.
  return sources.sort((a, b) => {
    const ka = `${a.provider}|${a.capability}|${a.params?.season ?? ''}`;
    const kb = `${b.provider}|${b.capability}|${b.params?.season ?? ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Providers whose failure makes a refresh incomplete rather than merely degraded. */
export const REQUIRED_PROVIDERS: readonly IngestionProvider[] = ['nflverse'];

// nflverse transport handlers (Phase 5). nflverse is published as versioned data files;
// each capability maps to a fixed, JSON-array resource path parameterized by season. The
// path map lives HERE (not in orchestration), so a new capability requires an explicit
// registration, never a scattered conditional. Decoding is a plain JSON-array parse — the
// Phase 4 `nflverseAdapter` performs all normalization.

import { nflverseAdapter } from '@/ingestion';
import type { CapabilityHandler, RequestBuildContext } from '../registry';
import type { ProviderCapability } from '../types';
import { decodeJsonArray, getRequest, validateBaseUrl } from './shared';

/** Default nflverse base — a neutral placeholder; override via typed config for a mirror. */
export const NFLVERSE_DEFAULT_BASE_URL = 'https://raw.githubusercontent.com/nflverse/nflverse-data';

/** Fixed capability → resource-path map. `{season}` is filled from neutral params. */
const PATHS: Partial<Record<ProviderCapability, (season: string) => string>> = {
  identity: () => `/players/players.json`,
  roster: (season) => `/rosters/roster_${season}.json`,
  schedule: (season) => `/schedules/schedule_${season}.json`,
  games: (season) => `/stats/player_stats_${season}.json`,
  participation: (season) => `/participation/participation_${season}.json`,
  officialStarts: (season) => `/starts/starts_${season}.json`,
};

function buildPath(capability: ProviderCapability, params: Readonly<Record<string, string>>): string {
  const make = PATHS[capability];
  if (!make) throw new Error(`nflverse: no path for capability ${capability}`);
  const season = params.season ?? 'latest';
  return make(season);
}

function handler(capability: ProviderCapability): CapabilityHandler {
  return {
    provider: 'nflverse',
    capability,
    buildRequest(ctx: RequestBuildContext) {
      const base = validateBaseUrl(ctx.config, 'nflverse');
      return getRequest(base, buildPath(capability, ctx.params), ctx.config);
    },
    decode: (envelope) => decodeJsonArray(envelope),
    adapter: nflverseAdapter,
  };
}

/** Every nflverse (provider, capability) handler the transport supports. */
export const nflverseHandlers: readonly CapabilityHandler[] = [
  'identity',
  'roster',
  'schedule',
  'games',
  'participation',
  'officialStarts',
].map((c) => handler(c as ProviderCapability));

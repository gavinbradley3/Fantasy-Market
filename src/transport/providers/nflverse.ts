// nflverse transport handlers.
//
// nflverse publishes its datasets as RELEASES rather than at fixed versioned URLs, so a
// request is prepared in two steps (see ./nflverseReleases.ts for the tables):
//
//   1. DISCOVERY  — GET <base>/<tag>/timestamp.json, which reports when the provider last
//                   rebuilt that dataset. The stamp is recorded on the envelope, so the
//                   captured payload carries the provider's own version and a replay
//                   reports that same version with no network access.
//   2. ASSET      — GET <base>/<tag>/<asset>, the CSV export itself.
//
// Both go through the injected `HttpClient`, so retries, timeouts, size caps, redaction
// and cancellation apply identically to discovery and to the asset fetch. There is no
// second network path and no live-only branch anywhere downstream: the bytes land in the
// same envelope, are checksummed the same way, and reach the same Phase 4 adapter.
//
// The releases are CSV. Decoding is a structural CSV parse (../csv.ts); the Phase 4
// `nflverseAdapter` performs all normalization, exactly as it does for a JSON payload.

import { nflverseAdapter } from '@/ingestion';
import { TransportError } from '../errors';
import type { CapabilityHandler, PreparedRequest, RequestBuildContext } from '../registry';
import type { ProviderCapability, RawPayloadEnvelope } from '../types';
import { decodeCsvRows } from '../csv';
import { getRequest, payloadText, validateBaseUrl } from './shared';
import {
  assetPath,
  manifestPath,
  NFLVERSE_ALSO_NORMALIZES,
  NFLVERSE_RELEASES,
  readReleaseManifest,
  type ReleaseAsset,
} from './nflverseReleases';

/**
 * The nflverse release-download base. Release assets are served from github.com and
 * redirect to a signed asset host; the client follows that redirect.
 */
export const NFLVERSE_DEFAULT_BASE_URL = 'https://github.com/nflverse/nflverse-data/releases/download';

/**
 * nflverse writes `NA` for a missing cell in some exports and an empty cell in others.
 * Both mean "the provider recorded no value" and both decode to `null` — never to `0`.
 */
const NFLVERSE_NULL_TOKENS = ['NA', 'NULL'] as const;

/**
 * Release assets are full-season exports (several MiB) served as `application/octet-stream`,
 * so the media-type check is skipped and the strict CSV decoder is the structural gate
 * instead: a truncated or non-CSV body fails to parse rather than being half-accepted.
 */
const ASSET_TIMEOUT_MS = 120_000;
const MANIFEST_TIMEOUT_MS = 30_000;

function releaseFor(capability: ProviderCapability): ReleaseAsset {
  const release = NFLVERSE_RELEASES[capability];
  if (!release) {
    // Reached only if a handler is registered for a capability with no release entry.
    throw new TransportError('UNSUPPORTED_CAPABILITY', `nflverse publishes no release for capability ${capability}`, {
      provider: 'nflverse',
      capability,
      retryable: false,
      stage: 'config',
    });
  }
  return release;
}

function seasonFor(capability: ProviderCapability, release: ReleaseAsset, params: Readonly<Record<string, string>>): string {
  if (!release.seasonScoped) return '';
  const season = params.season;
  // A season-scoped dataset has no meaningful default: silently picking one would fetch a
  // different year's data than the caller asked for.
  if (!season || !/^\d{4}$/.test(season)) {
    throw new TransportError('INVALID_CONFIG', `nflverse capability ${capability} requires a 4-digit season param`, {
      provider: 'nflverse',
      capability,
      retryable: false,
      stage: 'config',
    });
  }
  return season;
}

function handler(capability: ProviderCapability): CapabilityHandler {
  return {
    provider: 'nflverse',
    capability,

    async prepare(ctx: RequestBuildContext): Promise<PreparedRequest> {
      const base = validateBaseUrl(ctx.config, 'nflverse');
      const release = releaseFor(capability);
      const season = seasonFor(capability, release, ctx.params);

      // 1. Discovery — ask the provider which version of this dataset it is serving.
      const manifestRequest = getRequest(base, manifestPath(release.tag), ctx.config, {
        accept: 'application/json',
        expectContentType: null,
        textPayload: true,
        timeoutMs: MANIFEST_TIMEOUT_MS,
      });
      const discovered = readReleaseManifest(await ctx.io.fetchText(manifestRequest));

      // 2. The asset itself.
      const request = getRequest(base, assetPath(release, season), ctx.config, {
        accept: 'text/csv',
        expectContentType: null,
        textPayload: true,
        timeoutMs: ASSET_TIMEOUT_MS,
      });

      return {
        request,
        // A release with no readable stamp still yields data; it simply carries no provider
        // version, and the freshness model falls back to the HTTP validators.
        ...(discovered ? { sourceVersion: discovered.sourceVersion } : {}),
        ...(discovered?.sourceLastUpdated ? { sourceLastUpdated: discovered.sourceLastUpdated } : {}),
      };
    },

    decode: (envelope: RawPayloadEnvelope) =>
      decodeCsvRows(envelope, payloadText(envelope), { nullTokens: NFLVERSE_NULL_TOKENS }),

    ...(NFLVERSE_ALSO_NORMALIZES[capability] ? { alsoNormalizes: NFLVERSE_ALSO_NORMALIZES[capability] } : {}),

    adapter: nflverseAdapter,
  };
}

/**
 * Every nflverse (provider, capability) handler the transport supports — exactly the
 * capabilities nflverse actually publishes. Requesting any other capability from nflverse
 * is an explicit `UNSUPPORTED_CAPABILITY` error from the registry, not a 404.
 */
export const nflverseHandlers: readonly CapabilityHandler[] = (
  Object.keys(NFLVERSE_RELEASES) as ProviderCapability[]
)
  .slice()
  .sort()
  .map((c) => handler(c));

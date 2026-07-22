// Sleeper transport handlers (Phase 5). Sleeper's public, read-only players endpoint
// (`GET /v1/players/nfl`) returns a large object map keyed by Sleeper player id. Only the
// real, documented endpoint is registered — no endpoint is invented. `identity` is the
// live-fetchable capability; the reference `sleeperAdapter` additionally normalizes
// injuries/depth-charts/transactions from supplied payloads, but Sleeper exposes no single
// public resource for those, so they are intentionally NOT registered for live transport
// (an explicit UNSUPPORTED_CAPABILITY rather than a fabricated URL).
//
// Decoding reshapes the keyed map into rows (map key → `sleeper_id`) with deterministic
// ordering. All normalization remains the Phase 4 `sleeperAdapter`'s responsibility.

import { sleeperAdapter } from '@/ingestion';
import type { CapabilityHandler, RequestBuildContext } from '../registry';
import type { ProviderCapability } from '../types';
import { decodeArrayOrKeyedMap, getRequest, validateBaseUrl } from './shared';

/** Sleeper public API base (documented, read-only, no auth). */
export const SLEEPER_DEFAULT_BASE_URL = 'https://api.sleeper.app/v1';

const PATHS: Partial<Record<ProviderCapability, string>> = {
  identity: '/players/nfl',
};

function handler(capability: ProviderCapability): CapabilityHandler {
  const path = PATHS[capability];
  if (!path) throw new Error(`sleeper: no path for capability ${capability}`);
  return {
    provider: 'sleeper',
    capability,
    buildRequest(ctx: RequestBuildContext) {
      const base = validateBaseUrl(ctx.config, 'sleeper');
      return getRequest(base, path, ctx.config);
    },
    // Sleeper's players resource is a keyed map; the key is the sleeper id.
    decode: (envelope) => decodeArrayOrKeyedMap(envelope, 'sleeper_id'),
    adapter: sleeperAdapter,
  };
}

/** Every Sleeper (provider, capability) handler the transport supports live. */
export const sleeperHandlers: readonly CapabilityHandler[] = [handler('identity')];

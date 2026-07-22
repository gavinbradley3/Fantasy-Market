// The authoritative default transport registry (Phase 5). Assembles the nflverse and
// Sleeper handlers into ONE registry. This is the only place providers are wired for
// transport — adding a provider means registering it here, never branching in the
// orchestrator. FantasyPros/PFF/Stathead/ESPN/Yahoo/Sportradar and paid providers are
// intentionally NOT onboarded in this phase.

import { nflverseHandlers, NFLVERSE_DEFAULT_BASE_URL } from './providers/nflverse';
import { sleeperHandlers, SLEEPER_DEFAULT_BASE_URL } from './providers/sleeper';
import { ProviderRegistry, type TransportConfig } from './registry';

/** Build the default registry with the reference-adapter providers registered. */
export function buildDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const h of nflverseHandlers) registry.register(h);
  for (const h of sleeperHandlers) registry.register(h);
  return registry;
}

/** Default, secret-free transport config pointing at each provider's public base URL. */
export function defaultTransportConfig(): TransportConfig {
  return {
    nflverse: { baseUrl: NFLVERSE_DEFAULT_BASE_URL },
    sleeper: { baseUrl: SLEEPER_DEFAULT_BASE_URL },
  };
}

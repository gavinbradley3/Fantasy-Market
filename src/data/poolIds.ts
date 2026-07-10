// The set of canonical player ids currently in the pool. Used by the storage
// migration layer to decide whether a persisted playerId can be safely mapped
// to a real player (unknown ids are quarantined, never guessed). This is static
// reference data — importing it into persistence code does not violate the
// "UI reads only through MarketDataService" rule, which governs market VALUES,
// not the identity registry.

import { POOL } from '@/data/pool';

export const POOL_PLAYER_IDS: ReadonlySet<string> = new Set(POOL.map((p) => p.id));

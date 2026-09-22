/** Controlled-beta release policy. Deliberately not configurable through environment variables. */
export const MARKET_DATA_DISABLED = true;
export const MARKET_DATA_DISABLED_REASON =
  'External market data and Market Edge are disabled while public usage rights remain unresolved.';

/** The entire public data surface; private market history must never be copied into it. */
export const PUBLIC_DATA_FILES = ['board.json', 'status.json'] as const;

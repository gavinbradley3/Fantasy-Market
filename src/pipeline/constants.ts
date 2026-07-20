// Pipeline-wide constants. The schema version stamps snapshots and moves only
// when a provider adapter's consumed shape changes in a breaking way.
export const PIPELINE_SCHEMA_VERSION = 1;

// Default staleness threshold: Sleeper documents a once-per-day refresh, so a
// snapshot older than 48h is flagged stale (reported, not fatal).
export const DEFAULT_STALE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

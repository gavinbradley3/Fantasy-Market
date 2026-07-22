// PlayerTicker deterministic transport layer (Phase 5) — public surface.
//
//   network / cache  →  raw payload envelope  →  [decode]  →  Phase 4 `ingest()`  →
//   snapshot → NormalizedInferenceInput → runInference()
//
// This layer fetches raw provider payloads, captures them in a canonical envelope,
// caches and replays them deterministically, and delivers the EXACT raw payload into the
// verified Phase 4 ingestion boundary (`src/ingestion`). It performs no normalization,
// identity resolution, snapshot construction, or inference of its own, and never imports
// a valuation engine. Every timestamp/randomness source is injected.
//
// NOTE: the filesystem store (`@/transport/fileStore`) depends on `node:fs` and is
// intentionally NOT re-exported here, keeping this barrel browser-safe.

export * from './types';
export * from './errors';
export * from './clock';
export * from './retry';
export * from './envelope';
export * from './store';
export { MemoryPayloadStore } from './memoryStore';
export * from './client';
export * from './replay';
export * from './registry';
export * from './refresh';
export { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
export { nflverseHandlers, NFLVERSE_DEFAULT_BASE_URL } from './providers/nflverse';
export { sleeperHandlers, SLEEPER_DEFAULT_BASE_URL } from './providers/sleeper';

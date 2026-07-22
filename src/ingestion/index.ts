// PlayerTicker live-data ingestion & normalization layer (Phase 4) — public surface.
//
// Provider payloads → adapters → normalized records → identity resolution → snapshot →
// evidence → NormalizedInferenceInput → runInference(). No provider-specific data
// crosses this boundary; the frozen AIL and engines are never modified.

export * from './types';
export * from './capabilities';
export * from './ordering';
export * from './identity';
export * from './snapshot';
export * from './evidence';
export * from './buildInput';
export { nflverseAdapter } from './adapters/nflverse';
export { sleeperAdapter } from './adapters/sleeper';

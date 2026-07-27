// PlayerTicker production refresh runtime.
//
// Node-only. This module wires the real transport → ingestion → inference → persistence →
// publication pipeline that the scheduler and `POST /refresh` drive. It is the injected
// implementation the Phase 9 composition root deliberately does not hard-wire.

export { createLivePipeline, type LivePipelineConfig, type LiveRefreshOutput } from './livePipeline';
export { buildSourcePlan, REQUIRED_PROVIDERS, type SourcePlanOptions } from './sources';
export {
  selectInferenceBuilds,
  DEFAULT_ENGINE_VERSIONS,
  type EngineVersions,
  type SelectionOptions,
} from './selection';

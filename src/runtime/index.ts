// PlayerTicker production refresh runtime.
//
// Node-only. This module wires the real transport → ingestion → inference → persistence →
// publication pipeline that the scheduler and `POST /refresh` drive. It is the injected
// implementation the Phase 9 composition root deliberately does not hard-wire.

export { createLivePipeline, type LivePipelineConfig, type LiveRefreshOutput } from './livePipeline';
export { buildSourcePlan, REQUIRED_PROVIDERS, type SourcePlanOptions } from './sources';
export {
  EXPERIMENTAL_IN_SEASON_CONFIGURATION,
  EXPERIMENTAL_ROLE_GATED_CONFIGURATION,
  buildExperimentalInSeasonSourcePlan,
  classifyExperimentalPlayers,
  evaluateExperimentalInSeason,
  experimentalPathRequiredCapabilities,
  type ExperimentalInSeasonConfigurationId,
  type ExperimentalInSeasonDeps,
  type ExperimentalInSeasonOptions,
  type ExperimentalInSeasonResult,
  type ExperimentalInferenceStatus,
  type ExperimentalPlayerDiagnostic,
  type ExperimentalSourceDiagnostic,
  type ExperimentalSourceState,
} from './experimentalInSeason';
export {
  selectInferenceBuilds,
  DEFAULT_ENGINE_VERSIONS,
  type EngineVersions,
  type SelectionOptions,
} from './selection';

// Public surface of the WR MVP model. One entry point (§11): evaluateWideReceiver.
export { evaluateWideReceiver } from '@/wr-model/engine';
export { WRValidationError } from '@/wr-model/validation';
export { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/wr-model/referenceDistributions';
export { DEFAULT_MODEL_VERSION, SCHEMA_VERSION } from '@/wr-model/constants';
export type {
  WRMVPInput,
  WRMVPOutput,
  WRReferenceDistributions,
  EvaluateOptions,
  Horizon,
  ScoringVector,
  ComponentScores,
  HorizonComposites,
  ConfidenceLabel,
  VolatilityLabel,
  FallbackLogEntry,
} from '@/wr-model/types';

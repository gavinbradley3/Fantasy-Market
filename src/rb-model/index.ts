// Public surface of the RB MVP model. One entry point (§26.1): evaluateRunningBack.
export { evaluateRunningBack } from '@/rb-model/engine';
export { RBValidationError } from '@/rb-model/validation';
export { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/rb-model/referenceDistributions';
export { DEFAULT_MODEL_VERSION, SCHEMA_VERSION } from '@/rb-model/constants';
export type {
  RBMVPInput,
  RBMVPOutput,
  RBReferenceDistributions,
  EvaluateOptions,
  Horizon,
  ScoringVector,
  ComponentScores,
  HorizonComposites,
  ConfidenceLabel,
  VolatilityLabel,
  FallbackLogEntry,
} from '@/rb-model/types';

/**
 * Public QB MVP engine surface. `evaluateQuarterback` is the single public entry point
 * (Section 26.1); internal formula modules are not exported as alternative APIs.
 */

export { evaluateQuarterback } from "./engine.js";
export { canonicalSerializeQBOutput } from "./serialization.js";
export { QB_MVP_V1_REFERENCE_DISTRIBUTIONS } from "./references.js";
export { QB_DEFAULT_SCORING } from "./scoring.js";
export { QBValidationError } from "./errors.js";
export {
  DEFAULT_MODEL_VERSION,
  SCHEMA_VERSION,
  INPUT_SCHEMA_VERSION,
  REFERENCE_VERSION,
} from "./constants.js";
export type {
  QBEvaluatorOptions,
  QBHorizon,
  QBMVPInput,
  QBMVPOutput,
  QBReferenceDistributions,
  QBScoring,
  QBDepthChartStatus,
  QBRoleStatus,
  QBInjuryStatus,
} from "./types.js";

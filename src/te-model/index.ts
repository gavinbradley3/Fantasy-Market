/**
 * Public TE MVP engine surface. `evaluateTightEnd` is the single public entry point
 * (Section 26.1); internal formula modules are not exported as alternative APIs.
 */

export { evaluateTightEnd } from "./engine.js";
export { TE_MVP_V1_REFERENCE_DISTRIBUTIONS } from "./references.js";
export { TEConfigurationError, TEValidationError } from "./errors.js";
export type {
  TEEvaluateOptions,
  TEFallbackLogEntry,
  TEHorizon,
  TEMVPInput,
  TEMVPOutput,
  TEReferenceDistributions,
  TEScoring,
} from "./types.js";

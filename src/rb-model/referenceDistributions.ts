// The bundled Version-1 reference table (§26.4). Single source of truth: the JSON
// config file, imported and frozen. `evaluateRunningBack` uses this by default;
// callers may inject their own table via options.
import referenceJson from '@/rb-model/config/rb-reference-distributions.json';
import type { RBReferenceDistributions } from '@/rb-model/types';

export const DEFAULT_REFERENCE_DISTRIBUTIONS: RBReferenceDistributions = Object.freeze(
  referenceJson as RBReferenceDistributions,
);

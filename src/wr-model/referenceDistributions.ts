// The bundled Version-1 reference table (§26.4). Single source of truth: the
// JSON config file, imported and frozen. `evaluateWideReceiver` uses this by
// default; callers may inject their own table via options.
import referenceJson from '@/wr-model/config/wr-reference-distributions.json';
import type { WRReferenceDistributions } from '@/wr-model/types';

export const DEFAULT_REFERENCE_DISTRIBUTIONS: WRReferenceDistributions = Object.freeze(
  referenceJson as WRReferenceDistributions,
);

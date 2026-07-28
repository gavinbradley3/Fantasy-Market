// Accessible-data model tier — public entry point.
//
// One function per position, plus a dispatcher. Pure, deterministic, no clock, no network,
// no randomness, no locale-dependent formatting.

export type {
  AccessibleAvailability,
  AccessibleComposites,
  AccessibleConfidence,
  AccessibleInput,
  AccessibleInsufficient,
  AccessibleOutput,
  AccessiblePosition,
  AccessibleProvenance,
  AccessibleResult,
  ConfidenceLabel,
  ModelTier,
} from './types';

export { evaluateAccessibleRB, RB_ACCESSIBLE_VERSION, RB_MIN_CAREER_GAMES, classifyRole } from './rb';
export { evaluateAccessibleTE, TE_ACCESSIBLE_VERSION, TE_MIN_CAREER_GAMES, classifyTERole } from './te';
export {
  ACCESSIBLE_CONFIDENCE_CEILING,
  CONFIDENCE_PENALTY,
  RB_AGE_ANCHORS,
  TE_AGE_ANCHORS,
  TIER_WIDE_MISSING_INPUTS,
  TIER_WIDE_PENALTIES,
  ageScore,
  availabilityScore,
  buildConfidence,
  confidenceLabel,
  durabilityScore,
  trajectoryScore,
} from './common';
export { scaleFrom, score100, shrink, rate, weightedMean, type Anchor } from './scale';

import { evaluateAccessibleRB } from './rb';
import { evaluateAccessibleTE } from './te';
import type { AccessibleInput, AccessibleResult } from './types';

/** Evaluate the accessible-data model for a supported position. */
export function evaluateAccessible(input: AccessibleInput): AccessibleResult {
  return input.position === 'RB' ? evaluateAccessibleRB(input) : evaluateAccessibleTE(input);
}

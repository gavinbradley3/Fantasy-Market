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
  evaluateAccessibleWR,
  WR_ACCESSIBLE_VERSION,
  WR_MIN_CAREER_GAMES,
  classifyWRRole,
  draftCapitalScore,
} from './wr';
export {
  sampleEvidenceScore,
  CONFIDENCE_PENALTY,
  RB_AGE_ANCHORS,
  TE_AGE_ANCHORS,
  WR_AGE_ANCHORS,
  TIER_WIDE_MISSING_INPUTS,
  TIER_WIDE_COVERAGE_GAPS,
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
import { evaluateAccessibleWR } from './wr';
import type { AccessibleInput, AccessibleResult } from './types';

/** Evaluate the accessible-data model for a supported position. */
export function evaluateAccessible(input: AccessibleInput): AccessibleResult {
  switch (input.position) {
    case 'RB':
      return evaluateAccessibleRB(input);
    case 'TE':
      return evaluateAccessibleTE(input);
    case 'WR':
      return evaluateAccessibleWR(input);
  }
}

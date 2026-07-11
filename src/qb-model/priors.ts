/**
 * QB prior family (Section 26.6.2) and the metric priors derived from prior strength.
 * These adjust rookie/low-sample priors only; they are never a direct performance score.
 */

import { QB_PRIOR_STRENGTH_BY_ROUND, QB_PRIOR_STRENGTH_UNDRAFTED } from "./constants.js";
import type { QBMVPInput, QBPriors } from "./types.js";

export function qbPriorStrength(draftRound: QBMVPInput["draft_round"]): number {
  if (draftRound === null) return QB_PRIOR_STRENGTH_UNDRAFTED;
  return QB_PRIOR_STRENGTH_BY_ROUND[draftRound] ?? QB_PRIOR_STRENGTH_UNDRAFTED;
}

export function computePriors(input: QBMVPInput): QBPriors {
  const qps = qbPriorStrength(input.draft_round);
  return {
    qb_prior_strength: qps,
    aypa_prior: 6.2 + 1.2 * qps,
    passing_ypa_prior: 6.5 + 0.8 * qps,
    cpoe_prior: -0.01 + 0.02 * qps,
    completion_rate_prior: 0.6 + 0.07 * qps,
    explosive_prior: 0.085 + 0.03 * qps,
    interception_prior: 0.03 - 0.01 * qps,
    passing_td_prior: 0.04 + 0.015 * qps,
  };
}

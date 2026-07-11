/**
 * Draft-round / prospect-type priors (Sections 26.5.6 and 26.5.7).
 */

import {
  CONTRACT_SECURITY_BY_ROUND,
  CONTRACT_SECURITY_UNDRAFTED,
  TPRR_PRIOR_BY_ROUND,
  TPRR_PRIOR_MAX,
  TPRR_PRIOR_MIN,
  TPRR_PRIOR_PROSPECT_ADJUSTMENT,
  TPRR_PRIOR_UNDRAFTED,
} from "./constants.js";
import { clamp } from "./percentiles.js";
import type { TEMVPInput, TEProspectType } from "./types.js";

export interface TEPriors {
  draft_prospect_tprr_prior: number;
  contract_security_mapping: number;
}

export function draftProspectTprrPrior(
  draftRound: TEMVPInput["draft_round"],
  prospectType: TEProspectType
): number {
  const base =
    draftRound === null
      ? TPRR_PRIOR_UNDRAFTED
      : (TPRR_PRIOR_BY_ROUND[draftRound] ?? TPRR_PRIOR_UNDRAFTED);
  const adjusted = base + TPRR_PRIOR_PROSPECT_ADJUSTMENT[prospectType];
  return clamp(adjusted, TPRR_PRIOR_MIN, TPRR_PRIOR_MAX);
}

export function contractSecurityMapping(draftRound: TEMVPInput["draft_round"]): number {
  if (draftRound === null) return CONTRACT_SECURITY_UNDRAFTED;
  return CONTRACT_SECURITY_BY_ROUND[draftRound] ?? CONTRACT_SECURITY_UNDRAFTED;
}

export function computePriors(input: TEMVPInput): TEPriors {
  return {
    draft_prospect_tprr_prior: draftProspectTprrPrior(input.draft_round, input.prospect_type),
    contract_security_mapping: contractSecurityMapping(input.draft_round),
  };
}

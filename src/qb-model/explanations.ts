/**
 * Deterministic explanation generation and merge order (Section 26.13). The selected
 * horizon controls component-driver weighting only. All comparisons use unrounded values
 * (Section 26.2.2).
 */

import {
  COMPONENT_EXPLANATIONS,
  COMPONENT_ORDER,
  DIRECT_EXPLANATIONS,
  EXPLANATION_PRIORITY,
  HORIZON_WEIGHTS,
} from "./constants.js";
import type { QBComponentName } from "./constants.js";
import type { QBComponentScores, QBHorizon, QBMVPInput } from "./types.js";

const PRIORITY_INDEX: Readonly<Record<QBComponentName, number>> = Object.freeze(
  Object.fromEntries(EXPLANATION_PRIORITY.map((name, i) => [name, i])) as Record<
    QBComponentName,
    number
  >
);

interface ComponentCandidate {
  component: QBComponentName;
  contribution: number;
  text: string;
}

export interface QBExplanations {
  positive: string[];
  negative: string[];
}

export function generateExplanations(
  input: QBMVPInput,
  components: QBComponentScores,
  selectedHorizon: QBHorizon,
  resolvedProbabilityActive: number,
  rushingDependence: number,
  fallbackCount: number
): QBExplanations {
  const weights = HORIZON_WEIGHTS[selectedHorizon];

  // 26.13.1 Component contribution candidates (unrounded scores).
  const positiveComponents: ComponentCandidate[] = [];
  const negativeComponents: ComponentCandidate[] = [];
  for (const component of COMPONENT_ORDER) {
    const score = components[component];
    const contribution = weights[component] * (score - 50);
    if (score >= 65) {
      positiveComponents.push({
        component,
        contribution,
        text: COMPONENT_EXPLANATIONS[component].positive,
      });
    } else if (score <= 35) {
      negativeComponents.push({
        component,
        contribution,
        text: COMPONENT_EXPLANATIONS[component].negative,
      });
    }
  }

  positiveComponents.sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    return PRIORITY_INDEX[a.component] - PRIORITY_INDEX[b.component];
  });
  negativeComponents.sort((a, b) => {
    if (a.contribution !== b.contribution) return a.contribution - b.contribution;
    return PRIORITY_INDEX[a.component] - PRIORITY_INDEX[b.component];
  });

  // 26.13.3 Direct EFO explanations.
  const availabilityDirect = resolvedProbabilityActive < 0.75;
  const temporaryStarterDirect =
    input.role_status === "TEMPORARY_INJURY_REPLACEMENT" && selectedHorizon !== "WEEKLY";
  const recentlyBenchedDirect = input.role_status === "RECENTLY_BENCHED";
  const rushingDependenceDirect = rushingDependence >= 45 && components.RV >= 65;
  const fallbackHeavyDirect = fallbackCount >= 5;

  // 26.13.4 Positive merge order.
  const positive: string[] = [];
  if (rushingDependenceDirect) positive.push(DIRECT_EXPLANATIONS.RUSHING_DEPENDENCE);
  for (const candidate of positiveComponents) {
    if (positive.length >= 3) break;
    positive.push(candidate.text);
  }

  // 26.13.4 Negative merge order (then de-duplicate exact text, cap at 3).
  const negativeOrdered: string[] = [];
  if (availabilityDirect) negativeOrdered.push(DIRECT_EXPLANATIONS.AVAILABILITY);
  if (temporaryStarterDirect) negativeOrdered.push(DIRECT_EXPLANATIONS.TEMPORARY_STARTER);
  if (recentlyBenchedDirect) negativeOrdered.push(DIRECT_EXPLANATIONS.RECENTLY_BENCHED);
  if (fallbackHeavyDirect) negativeOrdered.push(DIRECT_EXPLANATIONS.FALLBACK_HEAVY);
  for (const candidate of negativeComponents) {
    negativeOrdered.push(candidate.text);
  }
  const negative: string[] = [];
  const seen = new Set<string>();
  for (const text of negativeOrdered) {
    if (negative.length >= 3) break;
    if (seen.has(text)) continue;
    seen.add(text);
    negative.push(text);
  }

  return {
    positive: positive.slice(0, 3),
    negative,
  };
}

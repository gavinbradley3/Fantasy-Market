/**
 * Deterministic explanation generation and merge order (Section 26.13).
 * The selected horizon affects component-driver weighting (ordering/selection) only.
 */

import { COMPONENT_ORDER, HORIZON_WEIGHTS } from "./constants.js";
import type {
  TEComponentScores,
  TEDerivedValues,
  TEHorizon,
  TEMVPInput,
  TEShrunkValues,
} from "./types.js";
import type { TECanonicalValues } from "./types.js";

interface ExplanationCandidate {
  text: string;
  topic: string;
  positive: boolean;
  /** Direct rules carry their 26.13.1 rule number; component candidates carry null. */
  directRule: number | null;
  /** |weighted_driver| for component candidates; 0 for direct candidates. */
  weight: number;
}

const COMPONENT_TEMPLATES: Readonly<
  Record<string, { positive: string; negative: string; topic: string }>
> = Object.freeze({
  RR: {
    positive: "Current route usage supports the outlook.",
    negative: "Limited route usage constrains the outlook.",
    topic: "route_role",
  },
  TE: {
    positive: "Target-earning ability strengthens the profile.",
    negative: "Target earning is below the TE reference group.",
    topic: "target_earning",
  },
  TQ: {
    positive: "Target quality supports efficient fantasy opportunity.",
    negative: "Target quality limits the value of expected volume.",
    topic: "target_quality",
  },
  RE: {
    positive: "Receiving efficiency is above the TE reference group.",
    negative: "Receiving efficiency is below the TE reference group.",
    topic: "receiving_efficiency",
  },
  TC: {
    positive: "The team passing environment supports opportunity.",
    negative: "The team environment limits receiving opportunity.",
    topic: "team_context",
  },
  RD: {
    positive: "The receiving role has strong durability support.",
    negative: "Role durability is a material concern.",
    topic: "role_durability",
  },
  AD: {
    positive: "Age and development support the long-term profile.",
    negative: "Age reduces the long-term profile.",
    topic: "age",
  },
  AV: {
    positive: "Current availability supports the weekly outlook.",
    negative: "Current availability lowers the weekly outlook.",
    topic: "availability",
  },
});

export interface TEExplanations {
  positive_drivers: string[];
  negative_drivers: string[];
}

export function generateExplanations(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunk: TEShrunkValues,
  derived: TEDerivedValues,
  components: TEComponentScores,
  tdDependence: number,
  selectedHorizon: TEHorizon
): TEExplanations {
  // Direct EFO explanations, evaluated in the exact 26.13.1 order.
  const direct: ExplanationCandidate[] = [];
  const addDirect = (rule: number, positive: boolean, text: string, topic: string): void => {
    direct.push({ text, topic, positive, directRule: rule, weight: 0 });
  };

  if (canonical.rp4 >= 0.75) {
    addDirect(1, true, "Runs routes on most team dropbacks.", "route_role");
  }
  if (shrunk.shrunk_tprr >= 0.22) {
    addDirect(2, true, "Earns targets at a strong rate when in a route.", "target_earning");
  }
  if (shrunk.shrunk_red_zone_target_rate >= 0.24 || shrunk.shrunk_end_zone_target_rate >= 0.12) {
    addDirect(3, true, "Red-zone usage supports touchdown opportunity.", "touchdown_opportunity");
  }
  if (derived.blocking_heavy_role) {
    addDirect(4, false, "A blocking-heavy role limits receiving volume.", "route_role");
  }
  if (canonical.competition_pressure >= 0.65 || input.another_receiving_te_flag) {
    addDirect(
      5,
      false,
      "Another receiving option creates meaningful route and target competition.",
      "competition"
    );
  }
  if (input.temporary_opportunity_flag) {
    addDirect(
      6,
      false,
      "Recent receiving usage may be temporary while a teammate is unavailable.",
      "role_durability"
    );
  }
  if (tdDependence >= 0.35) {
    addDirect(7, false, "The projection depends heavily on touchdowns.", "touchdown_dependence");
  }
  if (components.AV < 60) {
    addDirect(8, false, "Current availability materially lowers the weekly outlook.", "availability");
  }
  if (
    components.AD < 35 &&
    (selectedHorizon === "THREE_YEAR" || selectedHorizon === "DYNASTY")
  ) {
    addDirect(
      9,
      false,
      "The current role is productive, but long-term age risk is increasing.",
      "age"
    );
  }
  if (input.new_team_flag) {
    addDirect(10, false, "A new-team role adds uncertainty to the projection.", "role_durability");
  }

  // Component drivers for the selected horizon (26.13.2).
  const weights = HORIZON_WEIGHTS[selectedHorizon];
  const componentCandidates: ExplanationCandidate[] = [];
  for (const name of COMPONENT_ORDER) {
    const deviation = components[name] - 50;
    const weightedDriver = deviation * weights[name];
    const template = COMPONENT_TEMPLATES[name];
    if (template === undefined) continue;
    if (weightedDriver >= 1.0) {
      componentCandidates.push({
        text: template.positive,
        topic: template.topic,
        positive: true,
        directRule: null,
        weight: weightedDriver,
      });
    } else if (weightedDriver <= -1.0) {
      componentCandidates.push({
        text: template.negative,
        topic: template.topic,
        positive: false,
        directRule: null,
        weight: Math.abs(weightedDriver),
      });
    }
  }

  // Merge (26.13.3): direct before component; topics claimed by direct candidates in
  // rule order first, then by component candidates in descending |weighted_driver|
  // (exact tie prefers the negative candidate). One topic never appears in both arrays.
  const claimedTopics = new Set<string>();
  const positives: string[] = [];
  const negatives: string[] = [];

  for (const candidate of direct) {
    if (claimedTopics.has(candidate.topic)) continue;
    claimedTopics.add(candidate.topic);
    (candidate.positive ? positives : negatives).push(candidate.text);
  }

  const orderedComponentCandidates = [...componentCandidates].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.positive !== b.positive) return a.positive ? 1 : -1;
    return 0;
  });
  for (const candidate of orderedComponentCandidates) {
    if (claimedTopics.has(candidate.topic)) continue;
    claimedTopics.add(candidate.topic);
    (candidate.positive ? positives : negatives).push(candidate.text);
  }

  return {
    positive_drivers: positives.slice(0, 3),
    negative_drivers: negatives.slice(0, 3),
  };
}

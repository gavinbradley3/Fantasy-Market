// §26.13 explanation generation. Deterministic merge of direct EFO explanations
// (§26.13.1, fixed order) and component drivers (§26.13.2, weighted deviation for
// the selected horizon). Direct explanations precede component explanations; no
// topic may appear in both arrays; ≤3 each. Fixed templates — never generated
// prose, never a claim of certainty, proof, or causation (§26.13.3).

import { DIRECT, EXPLANATION_MAX_DRIVERS, EXPLANATION_MIN_ABS, HORIZON_WEIGHTS } from '@/rb-model/constants';
import type { ComponentScores, Horizon } from '@/rb-model/types';
import type { ResolvedInputs } from '@/rb-model/fallbacks';

type ComponentKey = keyof ComponentScores;

const COMPONENT_KEYS: ComponentKey[] = ['WRK', 'OQ', 'RE', 'RU', 'TC', 'RD', 'AD', 'AV'];

// §26.13.2 — component templates and topics.
const TEMPLATES: Record<ComponentKey, { positive: string; negative: string; topic: string }> = {
  WRK: {
    positive: 'Current workload supports the outlook.',
    negative: 'Limited workload lowers the outlook.',
    topic: 'workload',
  },
  OQ: {
    positive: 'High-value opportunities strengthen the projection.',
    negative: 'Limited high-value opportunities constrain the projection.',
    topic: 'opportunity_quality',
  },
  RE: {
    positive: 'Rushing efficiency is above the RB reference group.',
    negative: 'Rushing efficiency is below the RB reference group.',
    topic: 'rushing_efficiency',
  },
  RU: {
    positive: 'Receiving utility strengthens the profile.',
    negative: 'Limited receiving utility reduces weekly stability.',
    topic: 'receiving',
  },
  TC: {
    positive: 'The team environment supports RB opportunity.',
    negative: 'The team environment limits RB opportunity.',
    topic: 'team_context',
  },
  RD: {
    positive: 'The current role has strong durability support.',
    negative: 'Role durability is a material concern.',
    topic: 'workload_durability',
  },
  AD: {
    positive: 'Age and development support the long-term profile.',
    negative: 'Age and workload reduce the long-term profile.',
    topic: 'age',
  },
  AV: {
    positive: 'Current availability supports the weekly outlook.',
    negative: 'Current availability lowers the weekly outlook.',
    topic: 'availability',
  },
};

interface Candidate {
  topic: string;
  text: string;
  isDirect: boolean;
  order: number; // direct evaluation order (§26.13.1); components sort after
  absWeight: number; // |weighted contribution| for component-vs-component ties
}

export interface ExplanationInputs {
  components: ComponentScores;
  resolved: ResolvedInputs;
  currentExpectedTargets: number;
  tdDependence: number;
  teammateReturnFlag: boolean;
  horizon: Horizon;
}

export function computeExplanations(inp: ExplanationInputs): {
  positive_drivers: string[];
  negative_drivers: string[];
} {
  const { components: c, resolved: r, horizon } = inp;

  // 1) Direct explanations, in exact §26.13.1 order.
  const directPos: Candidate[] = [];
  const directNeg: Candidate[] = [];
  const D = (
    list: Candidate[],
    cond: boolean,
    topic: string,
    text: string,
    order: number,
  ) => {
    if (cond) list.push({ topic, text, isDirect: true, order, absWeight: Infinity });
  };

  D(directPos, r.carryShare >= DIRECT.carryShareDominant, 'workload', 'Projected to control most backfield carries.', 1);
  D(directPos, r.goalLineShare >= DIRECT.goalLineDominant, 'goal_line', 'Projected to dominate goal-line work.', 2);
  D(directPos, inp.currentExpectedTargets >= DIRECT.receivingTargets, 'receiving', 'Receiving usage provides weekly stability.', 3);

  D(directNeg, r.competitionPressure >= DIRECT.committeePressure, 'workload', 'Committee usage limits expected workload.', 4);
  D(directNeg, inp.tdDependence >= DIRECT.tdDependence, 'touchdown_dependence', 'The projection depends heavily on touchdown opportunities.', 5);
  D(directNeg, inp.teammateReturnFlag, 'workload_durability', 'Current workload may shrink when a teammate returns.', 6);
  D(directNeg, c.AV < DIRECT.lowAvailability, 'availability', 'Current availability materially lowers the weekly outlook.', 7);
  D(
    directNeg,
    c.AD < DIRECT.lowAgeDevelopment && (horizon === 'THREE_YEAR' || horizon === 'DYNASTY'),
    'age',
    'Age and workload reduce the long-term outlook.',
    8,
  );

  // 2–3) Component drivers from weighted deviations for the selected horizon.
  const weights = HORIZON_WEIGHTS[horizon];
  const compPos: Candidate[] = [];
  const compNeg: Candidate[] = [];
  for (const key of COMPONENT_KEYS) {
    const weighted = (c[key] - 50) * weights[key];
    const t = TEMPLATES[key];
    if (weighted >= EXPLANATION_MIN_ABS) {
      compPos.push({ topic: t.topic, text: t.positive, isDirect: false, order: 100, absWeight: Math.abs(weighted) });
    } else if (weighted <= -EXPLANATION_MIN_ABS) {
      compNeg.push({ topic: t.topic, text: t.negative, isDirect: false, order: 100, absWeight: Math.abs(weighted) });
    }
  }
  // 4/5) Sort component drivers by magnitude (largest contribution first).
  compPos.sort((a, b) => b.absWeight - a.absWeight);
  compNeg.sort((a, b) => b.absWeight - a.absWeight);

  // 6) Directs before components.
  let positives = [...directPos, ...compPos];
  let negatives = [...directNeg, ...compNeg];

  // 7) Remove within-array duplicate topics, keeping the first occurrence.
  positives = dedupeByTopic(positives);
  negatives = dedupeByTopic(negatives);

  // 9) A topic cannot appear in both arrays — resolve conflicts.
  const removed = resolveCrossArrayConflicts(positives, negatives);
  const posFinal = positives.filter((c2) => !removed.has(c2));
  const negFinal = negatives.filter((c2) => !removed.has(c2));

  // 8) At most three per side.
  return {
    positive_drivers: posFinal.slice(0, EXPLANATION_MAX_DRIVERS).map((x) => x.text),
    negative_drivers: negFinal.slice(0, EXPLANATION_MAX_DRIVERS).map((x) => x.text),
  };
}

function dedupeByTopic(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    if (seen.has(c.topic)) continue;
    seen.add(c.topic);
    out.push(c);
  }
  return out;
}

// Returns the set of candidates to drop so no topic appears on both sides.
function resolveCrossArrayConflicts(
  positives: Candidate[],
  negatives: Candidate[],
): Set<Candidate> {
  const removed = new Set<Candidate>();
  const negByTopic = new Map(negatives.map((c) => [c.topic, c] as const));
  for (const p of positives) {
    const n = negByTopic.get(p.topic);
    if (!n) continue;
    let keepPositive: boolean;
    if (p.isDirect && n.isDirect) {
      keepPositive = p.order < n.order; // earlier direct wins (§26.13.1 order)
    } else if (p.isDirect !== n.isDirect) {
      keepPositive = p.isDirect; // the direct one wins
    } else {
      // neither direct: larger absolute contribution; exact tie prefers negative
      keepPositive = p.absWeight > n.absWeight;
    }
    removed.add(keepPositive ? n : p);
  }
  return removed;
}

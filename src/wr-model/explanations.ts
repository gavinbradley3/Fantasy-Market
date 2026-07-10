// §26.13 explanation logic. For the selected horizon: weighted_driver =
// (component − 50) × horizon_weight. Positive drivers ranked by largest
// positive weighted; negatives by most negative; ≤3 each; omit |weighted|<1.0.
// Plain-language templates; never claims proof of future performance.

import { EXPLANATION_MAX_DRIVERS, EXPLANATION_MIN_ABS, HORIZON_WEIGHTS } from '@/wr-model/constants';
import type { ComponentScores, Horizon } from '@/wr-model/types';

type ComponentKey = keyof ComponentScores;

const COMPONENT_KEYS: ComponentKey[] = ['RR', 'TE', 'TQ', 'EF', 'TC', 'RD', 'AD', 'AV'];

// Plain-language templates per component (positive / negative). No causal or
// certainty language.
const TEMPLATES: Record<ComponentKey, { positive: string; negative: string }> = {
  RR: {
    positive: 'Strong route participation supports the projection.',
    negative: 'Limited route participation caps the opportunity.',
  },
  TE: {
    positive: 'Target earning is strong relative to the WR reference group.',
    negative: 'Target earning is below the WR reference group.',
  },
  TQ: {
    positive: 'A high-value target profile lifts the outlook.',
    negative: 'A low-value target profile weighs on the outlook.',
  },
  EF: {
    positive: 'Efficient conversion adds to the projection.',
    negative: 'Below-average conversion efficiency weighs on the projection.',
  },
  TC: {
    positive: 'A strong team and quarterback environment helps the projection.',
    negative: 'A weak team and quarterback environment limits the projection.',
  },
  RD: {
    positive: 'Role durability supports the longer-term outlook.',
    negative: 'Role durability concerns reduce the longer-term outlook.',
  },
  AD: {
    positive: 'Age and development profile support the long-term outlook.',
    negative: 'Age and role durability reduce the long-term outlook.',
  },
  AV: {
    positive: 'Current availability supports the weekly outlook.',
    negative: 'Current availability materially lowers the weekly outlook.',
  },
};

interface Driver {
  key: ComponentKey;
  weighted: number;
}

export function computeExplanations(
  components: ComponentScores,
  horizon: Horizon,
): { positive_drivers: string[]; negative_drivers: string[] } {
  const weights = HORIZON_WEIGHTS[horizon];
  const drivers: Driver[] = COMPONENT_KEYS.map((key) => ({
    key,
    weighted: (components[key] - 50) * weights[key],
  }));

  const positive = drivers
    .filter((d) => d.weighted >= EXPLANATION_MIN_ABS)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, EXPLANATION_MAX_DRIVERS)
    .map((d) => TEMPLATES[d.key].positive);

  const negative = drivers
    .filter((d) => d.weighted <= -EXPLANATION_MIN_ABS)
    .sort((a, b) => a.weighted - b.weighted)
    .slice(0, EXPLANATION_MAX_DRIVERS)
    .map((d) => TEMPLATES[d.key].negative);

  return { positive_drivers: positive, negative_drivers: negative };
}

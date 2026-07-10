// §26.9 horizon composites. composite[h] = Σ component × horizon_weight, using
// full-precision component values. Internal diagnostic only (§7.1 Track B).

import { HORIZON_WEIGHTS } from '@/wr-model/constants';
import type { ComponentScores, Horizon, HorizonComposites } from '@/wr-model/types';

const COMPONENT_KEYS: (keyof ComponentScores)[] = ['RR', 'TE', 'TQ', 'EF', 'TC', 'RD', 'AD', 'AV'];

export function composite(components: ComponentScores, horizon: Horizon): number {
  const w = HORIZON_WEIGHTS[horizon];
  let sum = 0;
  for (const key of COMPONENT_KEYS) sum += components[key] * w[key];
  return sum;
}

export function computeComposites(components: ComponentScores): HorizonComposites {
  return {
    WEEKLY: composite(components, 'WEEKLY'),
    ROS: composite(components, 'ROS'),
    ONE_YEAR: composite(components, 'ONE_YEAR'),
    THREE_YEAR: composite(components, 'THREE_YEAR'),
    DYNASTY: composite(components, 'DYNASTY'),
  };
}

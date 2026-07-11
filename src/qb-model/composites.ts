/**
 * Five horizon composites (Section 26.9). No additional multiplier is applied after the
 * weighted sum. Composites never feed EFO.
 */

import { COMPONENT_ORDER, HORIZON_WEIGHTS, HORIZONS } from "./constants.js";
import type { QBComponentScores, QBHorizon } from "./types.js";

export function computeComposites(
  components: QBComponentScores
): Record<QBHorizon, number> {
  const composites = {} as Record<QBHorizon, number>;
  for (const horizon of HORIZONS) {
    const weights = HORIZON_WEIGHTS[horizon];
    let total = 0;
    for (const component of COMPONENT_ORDER) {
      total += components[component] * weights[component];
    }
    composites[horizon] = total;
  }
  return composites;
}

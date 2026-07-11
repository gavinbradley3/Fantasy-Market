/**
 * Five horizon composites (Section 26.9). Composites are internal summaries; they never
 * feed EFO and contain no scarcity.
 */

import { COMPONENT_ORDER, HORIZON_WEIGHTS, HORIZONS } from "./constants.js";
import type { TEComponentScores, TEHorizon } from "./types.js";

export function computeComposites(
  components: TEComponentScores
): Record<TEHorizon, number> {
  const composites = {} as Record<TEHorizon, number>;
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

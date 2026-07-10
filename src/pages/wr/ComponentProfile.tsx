import {
  COMPONENT_META,
  COMPONENT_ORDER,
  componentWeight,
  emphasizedComponents,
} from '@/pages/wr/adapter';
import { ScoreBar } from '@/pages/wr/ui';
import type { ComponentScores, Horizon } from '@/wr-model/types';

// Eight component score bars. The selected horizon emphasizes its
// highest-weighted components without hiding the others; a neutral 50 marker
// anchors every bar. Never color-only (score + glyph + label accompany color).
export function ComponentProfile({
  components,
  horizon,
}: {
  components: ComponentScores;
  horizon: Horizon;
}) {
  const emphasized = emphasizedComponents(horizon);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {COMPONENT_ORDER.map((key) => {
        const meta = COMPONENT_META[key];
        return (
          <ScoreBar
            key={key}
            code={meta.code}
            name={meta.name}
            score={components[key]}
            description={meta.description}
            weightPct={componentWeight(horizon, key)}
            emphasized={emphasized.has(key)}
          />
        );
      })}
    </div>
  );
}

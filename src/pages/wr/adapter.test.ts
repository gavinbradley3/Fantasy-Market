import { describe, expect, it } from 'vitest';
import { evaluateWideReceiver } from '@/wr-model/engine';
import { WR_FIXTURES } from '@/pages/wr/registry';
import { HORIZONS, driverComponent, COMPONENT_META, COMPONENT_ORDER } from '@/pages/wr/adapter';
import type { Horizon } from '@/wr-model/types';

const ALL_HORIZONS: Horizon[] = HORIZONS.map((h) => h.key);

describe('adapter driver→component mapping stays in sync with the engine templates', () => {
  it('every driver produced by every fixture × horizon maps to a known component', () => {
    for (const f of WR_FIXTURES) {
      for (const h of ALL_HORIZONS) {
        const out = evaluateWideReceiver(f.input, { selected_horizon: h });
        for (const d of [...out.explanations.positive_drivers, ...out.explanations.negative_drivers]) {
          const key = driverComponent(d);
          expect(key, `unmapped driver: "${d}"`).toBeDefined();
          expect(COMPONENT_ORDER).toContain(key!);
        }
      }
    }
  });
});

describe('component metadata', () => {
  it('covers all eight components in canonical order', () => {
    expect(COMPONENT_ORDER).toEqual(['RR', 'TE', 'TQ', 'EF', 'TC', 'RD', 'AD', 'AV']);
    for (const k of COMPONENT_ORDER) {
      expect(COMPONENT_META[k].name.length).toBeGreaterThan(0);
      expect(COMPONENT_META[k].description.length).toBeGreaterThan(0);
    }
  });
});

describe('horizon metadata', () => {
  it('marks only Weekly and ROS as having fantasy-point projections', () => {
    const withProj = HORIZONS.filter((h) => h.hasProjection).map((h) => h.key);
    expect(withProj).toEqual(['WEEKLY', 'ROS']);
  });
});

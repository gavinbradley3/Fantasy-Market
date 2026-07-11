import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { RB_FIXTURES } from '@/pages/rb/registry';
import { HORIZONS, driverComponent, COMPONENT_META, COMPONENT_ORDER } from '@/pages/rb/adapter';
import type { Horizon } from '@/rb-model/types';

const ALL_HORIZONS: Horizon[] = HORIZONS.map((h) => h.key);

describe('RB adapter driver→component mapping stays in sync with the engine templates', () => {
  it('every driver produced by every fixture × horizon maps to a known component', () => {
    for (const f of RB_FIXTURES) {
      for (const h of ALL_HORIZONS) {
        const out = evaluateRunningBack(f.input, { selected_horizon: h });
        for (const d of [...out.explanations.positive_drivers, ...out.explanations.negative_drivers]) {
          const key = driverComponent(d);
          expect(key, `unmapped driver: "${d}"`).toBeDefined();
          expect(COMPONENT_ORDER).toContain(key!);
        }
      }
    }
  });
});

describe('RB component metadata', () => {
  it('covers all eight components in canonical order', () => {
    expect(COMPONENT_ORDER).toEqual(['WRK', 'OQ', 'RE', 'RU', 'TC', 'RD', 'AD', 'AV']);
    for (const k of COMPONENT_ORDER) {
      expect(COMPONENT_META[k].name.length).toBeGreaterThan(0);
      expect(COMPONENT_META[k].description.length).toBeGreaterThan(0);
    }
  });
});

describe('RB horizon metadata', () => {
  it('marks only Weekly and ROS as having fantasy-point projections', () => {
    const withProj = HORIZONS.filter((h) => h.hasProjection).map((h) => h.key);
    expect(withProj).toEqual(['WEEKLY', 'ROS']);
  });
});

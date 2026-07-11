import { describe, expect, it } from 'vitest';
import { evaluateTightEnd } from '@/te-model';
import type { TEHorizon } from '@/te-model';
import { TE_FIXTURES } from '@/pages/te/registry';
import {
  COMPONENT_META,
  COMPONENT_ORDER,
  HORIZONS,
  UNCODED_DRIVERS,
  driverComponent,
} from '@/pages/te/adapter';

const ALL_HORIZONS: TEHorizon[] = HORIZONS.map((h) => h.key);

describe('TE adapter driver→component mapping stays in sync with the engine templates', () => {
  it('every driver produced by every fixture × horizon maps to a known component or is intentionally uncoded', () => {
    for (const f of TE_FIXTURES) {
      for (const h of ALL_HORIZONS) {
        const out = evaluateTightEnd(f.input, { selected_horizon: h });
        for (const d of [...out.explanations.positive_drivers, ...out.explanations.negative_drivers]) {
          const key = driverComponent(d);
          if (key === undefined) {
            expect(UNCODED_DRIVERS.has(d), `unmapped driver: "${d}"`).toBe(true);
          } else {
            expect(COMPONENT_ORDER).toContain(key);
          }
        }
      }
    }
  });
});

describe('TE component metadata', () => {
  it('covers all eight components in canonical order (RR, TE, TQ, RE, TC, RD, AD, AV)', () => {
    expect(COMPONENT_ORDER).toEqual(['RR', 'TE', 'TQ', 'RE', 'TC', 'RD', 'AD', 'AV']);
    for (const k of COMPONENT_ORDER) {
      expect(COMPONENT_META[k].name.length).toBeGreaterThan(0);
      expect(COMPONENT_META[k].description.length).toBeGreaterThan(0);
    }
  });

  it('uses TE-specific receiving-efficiency terminology, not WR/RB terminology', () => {
    expect(COMPONENT_META.RE.name).toBe('Receiving Efficiency');
    expect(COMPONENT_META.RR.description).toMatch(/route/i);
  });
});

describe('TE horizon metadata', () => {
  it('marks only Weekly and ROS as having fantasy-point projections', () => {
    const withProj = HORIZONS.filter((h) => h.hasProjection).map((h) => h.key);
    expect(withProj).toEqual(['WEEKLY', 'ROS']);
  });
});

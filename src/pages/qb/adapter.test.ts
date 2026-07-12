import { describe, expect, it } from 'vitest';
import { evaluateQuarterback } from '@/qb-model';
import type { QBHorizon } from '@/qb-model';
import { QB_FIXTURES } from '@/pages/qb/registry';
import {
  COMPONENT_META,
  COMPONENT_ORDER,
  HORIZONS,
  UNCODED_DRIVERS,
  driverComponent,
} from '@/pages/qb/adapter';

const ALL_HORIZONS: QBHorizon[] = HORIZONS.map((h) => h.key);

describe('QB adapter driver→component mapping stays in sync with the engine templates', () => {
  it('every driver produced by every fixture × horizon maps to a known component or is intentionally uncoded', () => {
    for (const f of QB_FIXTURES) {
      for (const h of ALL_HORIZONS) {
        const out = evaluateQuarterback(f.input, { selected_horizon: h });
        for (const d of [...out.explanations.positive, ...out.explanations.negative]) {
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

describe('QB component metadata', () => {
  it('covers all eight components in canonical order (PO, PQ, RV, SE, RS, AV, AD, SU)', () => {
    expect(COMPONENT_ORDER).toEqual(['PO', 'PQ', 'RV', 'SE', 'RS', 'AV', 'AD', 'SU']);
    for (const k of COMPONENT_ORDER) {
      expect(COMPONENT_META[k].name.length).toBeGreaterThan(0);
      expect(COMPONENT_META[k].description.length).toBeGreaterThan(0);
    }
  });

  it('maps each component code to its QBMVPOutput.components key', () => {
    const out = evaluateQuarterback(QB_FIXTURES[0].input, { selected_horizon: 'WEEKLY' });
    for (const k of COMPONENT_ORDER) {
      expect(out.components).toHaveProperty(COMPONENT_META[k].outputKey);
    }
  });

  it('uses QB-specific terminology, not WR/RB/TE terminology', () => {
    expect(COMPONENT_META.PO.name).toBe('Passing Opportunity');
    expect(COMPONENT_META.PQ.name).toBe('Passing Quality');
    expect(COMPONENT_META.RV.name).toBe('Rushing Value');
    expect(COMPONENT_META.RS.name).toBe('Role Security');
    expect(COMPONENT_META.PQ.description).toMatch(/adjusted yards per attempt/i);
  });
});

describe('QB horizon metadata', () => {
  it('marks only Weekly and ROS as having fantasy-point projections', () => {
    const withProj = HORIZONS.filter((h) => h.hasProjection).map((h) => h.key);
    expect(withProj).toEqual(['WEEKLY', 'ROS']);
  });
});

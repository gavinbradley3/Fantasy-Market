import { describe, expect, it } from 'vitest';
import { aggregatePlayerConfidence, confidenceBand } from '@/inference/confidence/aggregate';
import { weightedGeometricMean } from '@/inference/confidence/weightedGeometricMean';
import type { ConfidenceEntry } from '@/inference/confidence/types';

describe('weightedGeometricMean (REGISTRY §11.1)', () => {
  it('equals the plain geometric mean at equal weights', () => {
    const wgm = weightedGeometricMean([
      { value: 100, weight: 1 },
      { value: 900, weight: 1 },
    ]);
    expect(wgm).toBeCloseTo(300, 6); // sqrt(100*900)
  });

  it('floors inputs to avoid ln(0)', () => {
    const wgm = weightedGeometricMean([{ value: 0, weight: 1 }], 1);
    expect(wgm).toBeCloseTo(1, 9);
  });

  it('throws on empty input or non-positive total weight', () => {
    expect(() => weightedGeometricMean([])).toThrow();
    expect(() => weightedGeometricMean([{ value: 500, weight: 0 }])).toThrow();
  });
});

describe('aggregatePlayerConfidence (REGISTRY §11.1–§11.4)', () => {
  it('lets one low CRITICAL field cap the player score below the WGM', () => {
    const entries: ConfidenceEntry[] = [
      { field: 'a', confidence: 900, weight: 1, critical: false },
      { field: 'b', confidence: 900, weight: 1, critical: false },
      { field: 'crit', confidence: 200, weight: 3, critical: true },
    ];
    const r = aggregatePlayerConfidence(entries);
    expect(r.weakestCritical).toBe(200);
    expect(r.score).toBe(200); // min(WGM, 200) = 200
    expect(r.band).toBe('LOW');
  });

  it('uses the WGM when it is below the weakest critical', () => {
    const entries: ConfidenceEntry[] = [
      { field: 'a', confidence: 500, weight: 1, critical: true },
      { field: 'b', confidence: 500, weight: 1, critical: false },
    ];
    const r = aggregatePlayerConfidence(entries);
    expect(r.score).toBe(500);
    expect(r.band).toBe('LOW');
  });

  it('applies the player floor of 50', () => {
    const r = aggregatePlayerConfidence([{ field: 'x', confidence: 0, weight: 1, critical: false }]);
    expect(r.score).toBe(50);
  });

  it('bands map at 600 / 800', () => {
    expect(confidenceBand(799)).toBe('MEDIUM');
    expect(confidenceBand(800)).toBe('HIGH');
    expect(confidenceBand(599)).toBe('LOW');
    expect(confidenceBand(600)).toBe('MEDIUM');
  });
});

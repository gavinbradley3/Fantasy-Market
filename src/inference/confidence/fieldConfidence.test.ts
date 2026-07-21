import { describe, expect, it } from 'vitest';
import { computeFieldConfidence } from '@/inference/confidence/fieldConfidence';
import { LIMITATION_CODES } from '@/inference/types';

describe('field confidence (REGISTRY §10)', () => {
  it('unvalidated Phase-2A models cap at 700 and carry UNVALIDATED_MODEL', () => {
    const r = computeFieldConfidence({ provenance: 'MODEL_ESTIMATE', freshness: 'FRESH' });
    expect(r.score).toBe(700); // 1000 - 80 = 920, capped to 700
    expect(r.limitations).toContain(LIMITATION_CODES.UNVALIDATED_MODEL);
  });

  it('validated path applies exact provenance penalty', () => {
    expect(computeFieldConfidence({ provenance: 'MODEL_ESTIMATE', freshness: 'FRESH', validated: true }).score).toBe(920);
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', validated: true }).score).toBe(1000);
    expect(computeFieldConfidence({ provenance: 'PROXY', freshness: 'FRESH', validated: true }).score).toBe(880);
    expect(computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness: 'FRESH', validated: true }).score).toBe(940);
    expect(computeFieldConfidence({ provenance: 'FALLBACK', freshness: 'FRESH', validated: true }).score).toBe(900);
  });

  it('recency penalties follow the 3-state lifecycle (0/60/150), never 2×TTL', () => {
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', validated: true }).score).toBe(1000);
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'STALE_USABLE', validated: true }).score).toBe(940);
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'UNUSABLE', validated: true }).score).toBe(850);
  });

  it('stale freshness attaches STALE limitation', () => {
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'STALE_USABLE', validated: true }).limitations).toContain(
      LIMITATION_CODES.STALE,
    );
  });

  it('sample penalty step (full/below-min/below-half)', () => {
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', coverageRatio: 1, validated: true }).score).toBe(1000);
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', coverageRatio: 0.6, validated: true }).score).toBe(920);
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', coverageRatio: 0.3, validated: true }).score).toBe(850);
  });

  it('catch-all and reduced-signal role penalties', () => {
    expect(computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness: 'FRESH', catchall: true, validated: true }).score).toBe(820);
    expect(computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness: 'FRESH', reducedSignal: true, validated: true }).score).toBe(860);
  });

  it('completeness penalty caps at 200', () => {
    expect(computeFieldConfidence({ provenance: 'DERIVED', freshness: 'FRESH', missingRequiredFeatures: 10, validated: true }).score).toBe(800);
  });
});

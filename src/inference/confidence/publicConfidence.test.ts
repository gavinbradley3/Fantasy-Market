import { describe, expect, it } from 'vitest';
import { computeSourceQuality } from '@/inference/confidence/sourceQuality';
import { computePublicConfidence, honestyState } from '@/inference/confidence/publicConfidence';

describe('critical source quality (REGISTRY §20.F9)', () => {
  it('all fresh → factor 1.0', () => {
    const r = computeSourceQuality('WR', { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1 });
    expect(r.minSourceFreshness).toBe(1);
    expect(r.sourceQualityFactor).toBe(1); // clamp(0.6+0.4*1) = 1.0
  });
  it('one stale critical source drops min freshness to 0.7 → factor 0.88', () => {
    const r = computeSourceQuality('WR', { nflverse_weekly: 1, snaps: 0.7, participation: 1, pbp: 1, schedule: 1, injury: 1 });
    expect(r.minSourceFreshness).toBe(0.7);
    expect(r.sourceQualityFactor).toBeCloseTo(0.88, 10);
  });
  it('absent critical source contributes 0.7 (never 0)', () => {
    const r = computeSourceQuality('WR', { nflverse_weekly: 1 });
    expect(r.minSourceFreshness).toBe(0.7);
  });
});

describe('public confidence factors (REGISTRY §11.3)', () => {
  it('coverage/quality factors follow the registered maps', () => {
    const r = computePublicConfidence({ playerConfidence: 700, verifiedShare: 0.5, sourceQualityFactor: 1.0 });
    expect(r.coverageFactor).toBe(0.75); // 0.5 + 0.5*0.5
    expect(r.qualityFactor).toBeCloseTo(0.79, 10); // 0.3 + 0.7*0.7
    expect(r.publicConfidence).toBeNull(); // engine confidence deferred
  });
  it('with engine confidence → 0..100 public confidence', () => {
    const r = computePublicConfidence({ playerConfidence: 1000, verifiedShare: 1, sourceQualityFactor: 1, engineConfidence01: 1 });
    expect(r.publicConfidence).toBe(100); // 1 * 1 * 1 * 1 * 100
  });
});

describe('honesty state (REGISTRY §11.4)', () => {
  const base = { anyCriticalOmitted: false, allCriticalOfficial: false, anyCriticalFallback: false };
  it('UNAVAILABLE when a critical field is omitted', () => {
    expect(honestyState({ ...base, playerConfidence: 900, anyCriticalOmitted: true })).toBe('UNAVAILABLE');
  });
  it('LIMITED below LOW_BAND or on a critical fallback', () => {
    expect(honestyState({ ...base, playerConfidence: 500 })).toBe('LIMITED');
    expect(honestyState({ ...base, playerConfidence: 900, anyCriticalFallback: true })).toBe('LIMITED');
  });
  it('VERIFIED vs ESTIMATED_HIGH at/above HIGH_BAND', () => {
    expect(honestyState({ ...base, playerConfidence: 850, allCriticalOfficial: true })).toBe('VERIFIED');
    expect(honestyState({ ...base, playerConfidence: 850, allCriticalOfficial: false })).toBe('ESTIMATED_HIGH_CONFIDENCE');
  });
  it('ESTIMATED in the middle band', () => {
    expect(honestyState({ ...base, playerConfidence: 700 })).toBe('ESTIMATED');
  });
});

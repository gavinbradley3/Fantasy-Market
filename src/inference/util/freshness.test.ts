import { describe, expect, it } from 'vitest';
import {
  ageMs,
  classifyFreshness,
  classifyFreshnessFromTimestamps,
  RECENCY_PENALTY,
} from '@/inference/util/freshness';

describe('freshness lifecycle (REGISTRY §20.F5)', () => {
  it('reproduces REGISTRY §22 Fx5 injury boundaries (TTL 7d, hard bound 10d)', () => {
    const asOf = '2025-10-11T00:00:00.000Z';
    const at = (daysAgo: number) =>
      new Date(Date.parse(asOf) - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshnessFromTimestamps(asOf, at(7), 7, 10)).toBe('FRESH');
    expect(classifyFreshnessFromTimestamps(asOf, at(10), 7, 10)).toBe('STALE_USABLE');
    expect(classifyFreshnessFromTimestamps(asOf, at(11), 7, 10)).toBe('UNUSABLE');
  });

  it('boundaries are upper-closed', () => {
    expect(classifyFreshness(7, 7, 10)).toBe('FRESH');
    expect(classifyFreshness(10, 7, 10)).toBe('STALE_USABLE');
    expect(classifyFreshness(10.0001, 7, 10)).toBe('UNUSABLE');
  });

  it('maps recency penalties 0 / 60 / 150', () => {
    expect(RECENCY_PENALTY.FRESH).toBe(0);
    expect(RECENCY_PENALTY.STALE_USABLE).toBe(60);
    expect(RECENCY_PENALTY.UNUSABLE).toBe(150);
  });

  it('ageMs throws on unparseable timestamps', () => {
    expect(() => ageMs('not-a-date', '2025-01-01T00:00:00Z')).toThrow();
  });
});

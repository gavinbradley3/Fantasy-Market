import { describe, expect, it } from 'vitest';
import { classifySnapshot, perSeasonValues, PROSPECTIVE_WINDOW_HOURS } from './archive';
import type { Pos } from './data';

const H = 3_600_000;
const asOf = Date.UTC(2026, 10, 3, 13, 15);
const nextSeason = Date.UTC(2027, 8, 9);

describe('snapshot classification', () => {
  it('is prospective inside the window and before any outcome game', () => {
    expect(classifySnapshot(asOf, asOf + 2 * H, nextSeason).classification).toBe('PROSPECTIVE');
    expect(classifySnapshot(asOf, asOf + PROSPECTIVE_WINDOW_HOURS * H, nextSeason).classification).toBe('PROSPECTIVE');
  });
  it('is a historical reconstruction once the window has passed', () => {
    const c = classifySnapshot(asOf, asOf + 9 * 24 * H, nextSeason);
    expect(c.classification).toBe('HISTORICAL_RECONSTRUCTION');
    expect(c.hoursAfterDecision).toBe(216);
  });
  it('is a historical reconstruction once an outcome game has kicked off, whatever the gap', () => {
    expect(classifySnapshot(asOf, asOf + H, asOf + H).classification).toBe('HISTORICAL_RECONSTRUCTION');
  });
  it('refuses a capture before the decision instant', () => {
    expect(() => classifySnapshot(asOf, asOf - 1, nextSeason)).toThrow();
  });
  it('the November 12 recordings of 2026 Week 4 and Week 8 are reconstructions', () => {
    const recorded = Date.parse('2026-11-12T19:56:00Z');
    expect(classifySnapshot(Date.parse('2026-10-06T12:15:00Z'), recorded, Infinity).classification).toBe('HISTORICAL_RECONSTRUCTION');
    expect(classifySnapshot(Date.parse('2026-11-03T13:15:00Z'), recorded, Infinity).classification).toBe('HISTORICAL_RECONSTRUCTION');
  });
});

describe('per-season value', () => {
  it('values each season against that season\'s replacement and floors at zero', () => {
    // 15 tight ends; replacement rank 14.
    const pop = new Map<string, Pos>(Array.from({ length: 15 }, (_, i) => [`t${i}`, 'TE' as Pos]));
    const T1 = new Map([...pop.keys()].map((g, i) => [g, 200 - 10 * i]));
    const T2 = new Map([...pop.keys()].map((g, i) => [g, 200 - 10 * i + (100 - 5 * i)]));
    const v = perSeasonValues(pop, T1, T2);
    // 14th best: T1 = 70, second season = 35.
    expect(v.get('t0')).toBe(200 - 70 + (100 - 35));
    expect(v.get('t13')).toBe(0);
    expect(v.get('t14')).toBe(0);
  });
});

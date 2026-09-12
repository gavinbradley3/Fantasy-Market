import { describe, expect, it } from 'vitest';
import {
  currentIngestSeason,
  describeSeasonSelection,
  isPlausibleSeason,
  resolveSeasons,
  week1Kickoff,
} from './season';
import { nflSeasonOf } from './weekTiming';

const at = (iso: string) => new Date(iso);

describe('week1Kickoff', () => {
  it('is the Thursday after Labor Day', () => {
    // Labor Day 2026 = Mon 2026-09-07 → Week 1 opens Thu 2026-09-10.
    expect(week1Kickoff(2026).toISOString()).toBe('2026-09-10T00:00:00.000Z');
    // Labor Day 2025 = Mon 2025-09-01 → Thu 2025-09-04.
    expect(week1Kickoff(2025).toISOString()).toBe('2025-09-04T00:00:00.000Z');
    // Labor Day 2027 = Mon 2027-09-06 → Thu 2027-09-09.
    expect(week1Kickoff(2027).toISOString()).toBe('2027-09-09T00:00:00.000Z');
  });
});

describe('currentIngestSeason', () => {
  it.each([
    // [instant, expected season, why]
    ['2026-09-11T00:00:00.000Z', 2026, 'week 1 underway'],
    ['2026-09-10T00:00:00.000Z', 2026, 'exactly at week 1 kickoff'],
    ['2026-09-09T23:59:59.000Z', 2025, 'one second before kickoff is still last season'],
    ['2026-08-20T00:00:00.000Z', 2025, 'preseason — no 2026 regular-season rows yet'],
    ['2026-03-01T00:00:00.000Z', 2025, 'offseason — most recently completed season'],
    ['2026-01-15T00:00:00.000Z', 2025, 'january belongs to the prior season year'],
    ['2027-01-15T00:00:00.000Z', 2026, 'playoffs of the 2026 season'],
    ['2026-12-25T00:00:00.000Z', 2026, 'late in the 2026 season'],
  ])('%s → %i (%s)', (iso, expected) => {
    expect(currentIngestSeason(at(iso))).toBe(expected);
  });

  it('never returns a season that has not kicked off', () => {
    // Walk the whole of 2026 a day at a time; the answer may never exceed the season
    // whose week 1 has actually passed.
    for (let d = new Date('2026-01-01T00:00:00.000Z'); d.getUTCFullYear() === 2026; d = new Date(d.getTime() + 86_400_000)) {
      const season = currentIngestSeason(d);
      expect(d.getTime()).toBeGreaterThanOrEqual(week1Kickoff(season).getTime());
    }
  });

  it('differs from nflSeasonOf during the offseason — the two answer different questions', () => {
    const march2026 = '2026-03-01T00:00:00.000Z';
    // "which season does this date belong to" — 2026.
    expect(nflSeasonOf(march2026)).toBe(2026);
    // "which season has data to ingest" — 2025, because 2026 has not kicked off.
    expect(currentIngestSeason(at(march2026))).toBe(2025);
  });
});

describe('resolveSeasons', () => {
  it('derives the current season when nothing is supplied', () => {
    const sel = resolveSeasons(null, at('2026-09-11T18:00:00.000Z'));
    expect(sel.seasons).toEqual([2026]);
    expect(sel.source).toBe('derived');
    expect(sel.note).toContain('Week 1');
  });

  it('treats an empty list as "not supplied" rather than "ingest nothing"', () => {
    expect(resolveSeasons([], at('2026-09-11T18:00:00.000Z')).seasons).toEqual([2026]);
  });

  it('passes an explicit list through unchanged, in order', () => {
    const sel = resolveSeasons([2024, 2025, 2026], at('2026-09-11T18:00:00.000Z'));
    expect(sel.seasons).toEqual([2024, 2025, 2026]);
    expect(sel.source).toBe('explicit');
  });

  it('preserves multi-season ingestion', () => {
    expect(resolveSeasons([2023, 2024], at('2026-09-11T18:00:00.000Z')).seasons).toHaveLength(2);
  });

  it('rejects an implausible season rather than silently substituting one', () => {
    expect(() => resolveSeasons([1998], at('2026-09-11T18:00:00.000Z'))).toThrow(/invalid season/);
    expect(() => resolveSeasons([20255], at('2026-09-11T18:00:00.000Z'))).toThrow(/invalid season/);
  });

  it('never silently falls back to a hard-coded past season', () => {
    // The regression this guards: a literal default (2025) that ages out silently.
    // Whatever "now" is, a derived selection must equal the rule's answer for that instant.
    for (const iso of ['2027-10-01T00:00:00.000Z', '2030-09-20T00:00:00.000Z']) {
      const sel = resolveSeasons(null, at(iso));
      expect(sel.seasons).toEqual([currentIngestSeason(at(iso))]);
      expect(sel.seasons[0]).toBeGreaterThan(2025);
    }
  });

  it('describes the selection for logging', () => {
    const line = describeSeasonSelection(resolveSeasons([2026], at('2026-09-11T18:00:00.000Z')));
    expect(line).toContain('2026');
    expect(line).toContain('explicit');
  });
});

describe('isPlausibleSeason', () => {
  it.each([
    [2026, true],
    [1999, true],
    [1998, false],
    [2101, false],
    [2026.5, false],
    [Number.NaN, false],
  ])('%s → %s', (value, expected) => {
    expect(isPlausibleSeason(value)).toBe(expected);
  });
});

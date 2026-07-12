import { describe, expect, it } from 'vitest';
import {
  CANONICAL_TEAMS,
  nameKey,
  normalizeBirthDate,
  normalizePosition,
  normalizeTeam,
  positionsCompatible,
} from '@/services/identity/normalize';

describe('normalizeTeam', () => {
  it('accepts canonical abbreviations unchanged', () => {
    expect(normalizeTeam('DET')).toEqual({ team: 'DET', recognized: true });
    expect(normalizeTeam('kc')).toEqual({ team: 'KC', recognized: true });
  });

  it('maps provider aliases to canonical abbreviations', () => {
    expect(normalizeTeam('JAC').team).toBe('JAX');
    expect(normalizeTeam('WSH').team).toBe('WAS');
    expect(normalizeTeam('LA').team).toBe('LAR');
    expect(normalizeTeam('SD').team).toBe('LAC');
    expect(normalizeTeam('OAK').team).toBe('LV');
    expect(normalizeTeam('GNB').team).toBe('GB');
    expect(normalizeTeam('STL').team).toBe('LAR');
  });

  it('treats null and free-agent markers as no-team (recognized)', () => {
    expect(normalizeTeam(null)).toEqual({ team: null, recognized: true });
    expect(normalizeTeam(undefined)).toEqual({ team: null, recognized: true });
    expect(normalizeTeam('')).toEqual({ team: null, recognized: true });
    expect(normalizeTeam('FA')).toEqual({ team: null, recognized: true });
  });

  it('never guesses a franchise for an unknown label', () => {
    expect(normalizeTeam('XYZ')).toEqual({ team: null, recognized: false });
  });

  it('canonical set contains exactly the 32 franchises', () => {
    expect(CANONICAL_TEAMS.size).toBe(32);
  });
});

describe('normalizePosition', () => {
  it('accepts the four supported positions (case-insensitive)', () => {
    expect(normalizePosition('WR')).toBe('WR');
    expect(normalizePosition('rb')).toBe('RB');
    expect(normalizePosition(' TE ')).toBe('TE');
    expect(normalizePosition('QB')).toBe('QB');
  });

  it('rejects unsupported positions — including FB, which is NOT an RB', () => {
    for (const p of ['K', 'DEF', 'FB', 'OL', 'LB', 'CB', '', null, undefined]) {
      expect(normalizePosition(p)).toBeNull();
    }
  });
});

describe('positionsCompatible', () => {
  it('equal positions are compatible; different ones are not by default', () => {
    expect(positionsCompatible('WR', 'WR')).toBe(true);
    expect(positionsCompatible('WR', 'QB')).toBe(false);
  });

  it('a fantasy-positions list can reconcile a primary-position disagreement', () => {
    expect(positionsCompatible('WR', 'TE', ['WR', 'TE'])).toBe(true);
    expect(positionsCompatible('WR', 'QB', ['WR', 'TE'])).toBe(false);
  });
});

describe('nameKey', () => {
  it('strips apostrophes, periods, and case', () => {
    expect(nameKey("Ja'Marr Chase")).toBe('jamarrchase');
    expect(nameKey('T.J. Hockenson')).toBe('tjhockenson');
  });

  it('drops generational suffixes', () => {
    expect(nameKey('Odell Beckham Jr.')).toBe('odellbeckham');
    expect(nameKey('Marvin Harrison Sr')).toBe('marvinharrison');
    expect(nameKey('Robert Griffin III')).toBe('robertgriffin');
    expect(nameKey('Dorial Green-Beckham IV')).toBe('dorialgreenbeckham');
  });

  it('joins hyphenated names', () => {
    expect(nameKey('Amon-Ra St. Brown')).toBe('amonrastbrown');
    expect(nameKey('JuJu Smith-Schuster')).toBe('jujusmithschuster');
  });

  it('strips accents and other Unicode diacritics', () => {
    expect(nameKey('Édouard Julien')).toBe('edouardjulien');
    expect(nameKey('Kenneth Gainwell')).toBe(nameKey('Kenneth Gaïnwell'));
  });

  it('identical keys from provider spelling differences', () => {
    expect(nameKey('DJ Moore')).toBe(nameKey('D.J. Moore'));
  });
});

describe('normalizeBirthDate', () => {
  it('accepts ISO dates and zero-pads', () => {
    expect(normalizeBirthDate('2000-03-01')).toBe('2000-03-01');
    expect(normalizeBirthDate('2000-3-1')).toBe('2000-03-01');
  });

  it('accepts US-style M/D/YYYY', () => {
    expect(normalizeBirthDate('3/1/2000')).toBe('2000-03-01');
  });

  it('returns null for missing values', () => {
    expect(normalizeBirthDate(null)).toBeNull();
    expect(normalizeBirthDate(undefined)).toBeNull();
    expect(normalizeBirthDate('')).toBeNull();
  });

  it('rejects malformed and impossible dates instead of passing them through', () => {
    expect(normalizeBirthDate('not-a-date')).toBeNull();
    expect(normalizeBirthDate('2000-02-31')).toBeNull(); // no rollover
    expect(normalizeBirthDate('1200-01-01')).toBeNull(); // implausible year
  });
});

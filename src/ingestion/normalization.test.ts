import { describe, expect, it } from 'vitest';
import {
  compareOrdinal,
  normalizeInjuryStatus,
  normalizePosition,
  normalizePractice,
  normalizeStatus,
  normalizeTeam,
  normalizeTimestamp,
  sortByKey,
  withinAsOf,
} from './ordering';
import { nflverseAdapter } from './adapters/nflverse';
import { sleeperAdapter } from './adapters/sleeper';
import { freshness } from './__fixtures';

describe('normalization primitives', () => {
  it('positions: four supported + family folding; unsupported → null', () => {
    expect(normalizePosition('wr')).toBe('WR');
    expect(normalizePosition('HB')).toBe('RB');
    expect(normalizePosition('K')).toBeNull();
    expect(normalizePosition(null)).toBeNull();
  });

  it('teams: uppercased + relocation aliases folded', () => {
    expect(normalizeTeam('oak')).toBe('LV');
    expect(normalizeTeam('SD')).toBe('LAC');
    expect(normalizeTeam('cin')).toBe('CIN');
  });

  it('status + injury + practice enums normalize; unknown injury flagged', () => {
    expect(normalizeStatus('ACT')).toBe('active');
    expect(normalizeStatus('bogus')).toBeNull();
    expect(normalizeInjuryStatus('Q')).toEqual({ value: 'QUESTIONABLE', known: true });
    expect(normalizeInjuryStatus('weird')).toEqual({ value: 'UNKNOWN', known: false });
    expect(normalizeInjuryStatus(null)).toEqual({ value: 'HEALTHY', known: true });
    expect(normalizePractice('LP')).toBe('LIMITED');
  });

  it('timestamps normalize to UTC ISO; malformed throws', () => {
    expect(normalizeTimestamp('2025-09-30')).toBe('2025-09-30T00:00:00.000Z');
    expect(() => normalizeTimestamp('not-a-date')).toThrow();
  });

  it('as-of is inclusive; canonical ordering is ordinal', () => {
    expect(withinAsOf('2025-10-01T00:00:00.000Z', '2025-10-01T00:00:00.000Z')).toBe(true);
    expect(withinAsOf('2025-10-01T00:00:00.000Z', '2025-10-02T00:00:00.000Z')).toBe(false);
    expect(sortByKey([{ k: 'b' }, { k: 'a' }], (x) => x.k).map((x) => x.k)).toEqual(['a', 'b']);
    expect(compareOrdinal('a', 'b')).toBe(-1);
  });
});

describe('adapter normalization + malformed handling', () => {
  it('nflverse discards malformed identity rows and flags unsupported positions', () => {
    const r = nflverseAdapter.normalizeIdentity!(
      [{ gsis_id: '00-A', player_name: 'A', position: 'WR' }, { player_name: 'no id' }, { gsis_id: '00-B', player_name: 'B', position: 'K' }],
      freshness('nflverse'),
    );
    expect(r.records.map((x) => x.providerIds.gsis)).toEqual(['00-A', '00-B']);
    expect(r.warnings.some((w) => w.code === 'DISCARDED_MALFORMED')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'UNSUPPORTED_POSITION')).toBe(true);
  });

  it('sleeper injuries flag unknown enum but keep the record as UNKNOWN', () => {
    const r = sleeperAdapter.normalizeInjuries!([{ sleeper_id: 'S1', injury_status: 'weird' }], freshness('sleeper'));
    expect(r.records[0].injuryStatus).toBe('UNKNOWN');
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_ENUM')).toBe(true);
  });

  it('a non-array raw payload yields zero records (no throw)', () => {
    expect(nflverseAdapter.normalizeGames!(null, freshness('nflverse')).records).toEqual([]);
    expect(nflverseAdapter.normalizeGames!({ not: 'array' }, freshness('nflverse')).records).toEqual([]);
  });
});

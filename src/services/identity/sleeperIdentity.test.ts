import { describe, expect, it } from 'vitest';
import {
  extractSleeperIdentities,
  SleeperPayloadError,
} from '@/services/identity/sleeperIdentity';
import { rawSleeper } from '@/services/identity/testutil';

describe('extractSleeperIdentities', () => {
  it('extracts and normalizes valid records', () => {
    const out = extractSleeperIdentities({
      '100': rawSleeper('100', { full_name: "Ja'Marr Chase", team: 'CIN', gsis_id: ' 00-0036900' }),
    });
    expect(out.records).toHaveLength(1);
    const r = out.records[0];
    expect(r.sleeperId).toBe('100');
    expect(r.team).toBe('CIN');
    expect(r.nameKey).toBe('jamarrchase');
    expect(r.gsisId).toBe('00-0036900'); // Sleeper's stray whitespace trimmed
    expect(r.birthDate).toBe('2000-01-15');
    expect(r.espnId).toBe('12345'); // numeric ids stringified
  });

  it('rejects a payload whose top level is not an object map', () => {
    expect(() => extractSleeperIdentities(null)).toThrow(SleeperPayloadError);
    expect(() => extractSleeperIdentities([rawSleeper('1')])).toThrow(SleeperPayloadError);
    expect(() => extractSleeperIdentities('nope')).toThrow(SleeperPayloadError);
  });

  it('quarantines malformed individual records without poisoning the rest', () => {
    const out = extractSleeperIdentities({
      good: rawSleeper('1'),
      bad: { position: 'WR', player_id: 42 }, // player_id must be a string
      alsoBad: { position: 'RB' }, // no player_id at all (missing source id)
    });
    expect(out.records).toHaveLength(1);
    expect(out.invalidRecords).toBe(2);
    expect(out.issues.length).toBeGreaterThan(0);
  });

  it('excludes unsupported positions (kept only in the raw cache upstream)', () => {
    const out = extractSleeperIdentities({
      wr: rawSleeper('1', { position: 'WR' }),
      k: rawSleeper('2', { position: 'K' }),
      def: { player_id: 'DET', position: 'DEF', full_name: null },
      fb: rawSleeper('3', { position: 'FB' }),
    });
    expect(out.records.map((r) => r.sleeperId)).toEqual(['1']);
    expect(out.unsupportedPosition).toBe(3);
    expect(out.invalidRecords).toBe(0);
  });

  it('tolerates missing optional fields — null means missing, never zero', () => {
    const out = extractSleeperIdentities({
      '1': {
        player_id: '1',
        position: 'TE',
        first_name: 'Solo',
        last_name: 'Name',
      },
    });
    const r = out.records[0];
    expect(r.fullName).toBe('Solo Name'); // assembled from first/last
    expect(r.age).toBeNull();
    expect(r.birthDate).toBeNull();
    expect(r.yearsExperience).toBeNull();
    expect(r.depthChartOrder).toBeNull();
    expect(r.team).toBeNull(); // free agent, not ''
  });

  it('years_exp 0 is preserved as 0 (rookie), not nulled', () => {
    const out = extractSleeperIdentities({ '1': rawSleeper('1', { years_exp: 0 }) });
    expect(out.records[0].yearsExperience).toBe(0);
  });

  it('ignores unknown provider fields instead of breaking ingestion', () => {
    const out = extractSleeperIdentities({
      '1': rawSleeper('1', { brand_new_field: { nested: true }, hashtag: '#x' }),
    });
    expect(out.records).toHaveLength(1);
    expect(out.invalidRecords).toBe(0);
  });

  it('rejects records with no usable name', () => {
    const out = extractSleeperIdentities({
      '1': { player_id: '1', position: 'QB', full_name: '  ' },
    });
    expect(out.records).toHaveLength(0);
    expect(out.invalidRecords).toBe(1);
  });

  it('invalid ages and depth-chart values become null, not garbage', () => {
    const out = extractSleeperIdentities({
      '1': rawSleeper('1', { age: -3, depth_chart_order: 0, birth_date: '13/45/1999' }),
    });
    const r = out.records[0];
    expect(r.age).toBeNull();
    expect(r.depthChartOrder).toBeNull();
    expect(r.birthDate).toBeNull();
  });
});

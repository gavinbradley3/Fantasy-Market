import { describe, expect, it } from 'vitest';
import { parseSnaps } from '@/pipeline/snaps/nflverse/snapAdapter';
import { rawSnapPayload } from '@/pipeline/test-support';

describe('nflverse snap adapter', () => {
  it('parses valid rows and reports rejects without throwing', () => {
    const r = parseSnaps(rawSnapPayload(), { seasons: [2023, 2024, 2025] });
    expect(r.records.length).toBeGreaterThan(0);
    const reasons = r.rejected.map((x) => x.reason);
    expect(reasons).toContain('DUPLICATE_ROW'); // Bijan 2025 wk1 conflicting dup
    expect(reasons).toContain('MISSING_GSIS'); // "No Identifier"
    expect(r.unsupportedPositionRows).toBeGreaterThanOrEqual(1); // kicker
  });

  it('normalizes offense_pct from 0–100 to 0–1', () => {
    const r = parseSnaps(
      [{ gsis_id: '00-1', position: 'WR', team: 'X', season: 2025, week: 1, offense_snaps: 40, offense_pct: 60 }],
      {},
    );
    expect(r.records[0].offensePct).toBeCloseTo(0.6, 10);
  });

  it('treats missing offense_pct as null, never 0', () => {
    const r = parseSnaps([{ gsis_id: '00-1', position: 'RB', season: 2025, week: 1, offense_snaps: 10 }], {});
    expect(r.records[0].offensePct).toBeNull();
    expect(r.records[0].offenseSnaps).toBe(10);
  });

  it('filters postseason by default; rejects unsupported seasons when a filter is set', () => {
    const reg = parseSnaps(rawSnapPayload(), { seasons: [2024, 2025] });
    expect(reg.records.every((x) => x.seasonType === 'REG')).toBe(true);
    expect(reg.rejected.some((x) => x.reason === 'UNSUPPORTED_SEASON')).toBe(true); // 2023 row
  });

  it('handles empty and non-array payloads', () => {
    expect(parseSnaps([], {}).records).toHaveLength(0);
    const bad = parseSnaps({ nope: true }, {});
    expect(bad.rejected[0].reason).toBe('MALFORMED');
  });

  it('is order-independent (shuffled rows → identical records)', () => {
    const raw = rawSnapPayload() as unknown[];
    const a = parseSnaps(raw, { seasons: [2023, 2024, 2025] });
    const b = parseSnaps([...raw].reverse(), { seasons: [2023, 2024, 2025] });
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
  });
});

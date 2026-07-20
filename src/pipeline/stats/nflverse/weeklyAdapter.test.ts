import { describe, expect, it } from 'vitest';
import { parseWeekly } from '@/pipeline/stats/nflverse/weeklyAdapter';
import { readFixture } from '@/pipeline/test-support';

function rawStats(): unknown {
  return readFixture('stats', 'raw', 'nflverse.player_stats.sample.json');
}

describe('nflverse weekly adapter', () => {
  it('parses valid rows and reports rejects without throwing', () => {
    const r = parseWeekly(rawStats(), { seasons: [2024, 2025] });
    expect(r.records.length).toBeGreaterThan(0);
    const reasons = r.rejected.map((x) => x.reason);
    expect(reasons).toContain('DUPLICATE_ROW');
    expect(reasons).toContain('MALFORMED'); // missing player_id and NA week
    expect(r.unsupportedPositionRows).toBeGreaterThanOrEqual(1); // the kicker
  });

  it('filters postseason by default and includes it when asked', () => {
    const reg = parseWeekly(rawStats(), { seasons: [2024, 2025] });
    const post = parseWeekly(rawStats(), { seasons: [2024, 2025], includePostseason: true });
    expect(post.records.length).toBe(reg.records.length + 1); // one POST row
    expect(reg.records.every((x) => x.seasonType === 'REG')).toBe(true);
  });

  it('rejects rows outside the configured seasons', () => {
    const r = parseWeekly(rawStats(), { seasons: [2025] });
    expect(r.rejected.some((x) => x.reason === 'UNSUPPORTED_SEASON')).toBe(true);
    expect(r.records.every((x) => x.season === 2025)).toBe(true);
  });

  it('treats absent counting stats as 0 and absent auxiliaries as null', () => {
    const r = parseWeekly(
      [{ player_id: '00-1', position: 'WR', season: 2025, week: 1, targets: 3 }],
      {},
    );
    const rec = r.records[0];
    expect(rec.receptions).toBe(0); // absent counting → 0
    expect(rec.targetShare).toBeNull(); // absent auxiliary → null, never 0
    expect(rec.receivingAirYards).toBeNull();
  });

  it('handles empty datasets and non-array payloads', () => {
    expect(parseWeekly([], {}).records).toHaveLength(0);
    const bad = parseWeekly({ not: 'array' }, {});
    expect(bad.records).toHaveLength(0);
    expect(bad.rejected[0].reason).toBe('MALFORMED');
  });

  it('is order-independent (shuffled rows → identical records)', () => {
    const raw = rawStats() as unknown[];
    const shuffled = [...raw].reverse();
    const a = parseWeekly(raw, { seasons: [2024, 2025] });
    const b = parseWeekly(shuffled, { seasons: [2024, 2025] });
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
  });
});

import { describe, expect, it } from 'vitest';
import { boardFreshness, BOARD_CURRENT_WITHIN_HOURS, BOARD_STALE_AFTER_HOURS } from './freshness';

const PUBLISHED = '2026-09-12T21:05:41.650Z';
const at = (hours: number) => Date.parse(PUBLISHED) + hours * 3_600_000;

describe('boardFreshness', () => {
  it('is current inside the current window, with no warning', () => {
    const f = boardFreshness(PUBLISHED, at(5));
    expect(f.state).toBe('current');
    expect(f.warning).toBeNull();
    expect(f.label).toBe('Published Sep 12, 2026 · 5h ago');
  });

  it('is aging just past the current window', () => {
    expect(boardFreshness(PUBLISHED, at(BOARD_CURRENT_WITHIN_HOURS + 1)).state).toBe('aging');
  });

  it('is stale past the stale threshold and says not to treat it as current', () => {
    const f = boardFreshness(PUBLISHED, at(BOARD_STALE_AFTER_HOURS + 1));
    expect(f.state).toBe('stale');
    expect(f.warning).toMatch(/Do not treat it as a current valuation/);
  });

  it('reports the real age of the September production board in November', () => {
    const f = boardFreshness(PUBLISHED, Date.parse('2026-11-12T12:00:00.000Z'));
    expect(f.state).toBe('stale');
    expect(f.label).toBe('Published Sep 12, 2026 · 60 days ago');
  });

  it('is unknown, never current, without a readable publish time', () => {
    expect(boardFreshness(null, at(1)).state).toBe('unknown');
    expect(boardFreshness('not a date', at(1)).state).toBe('unknown');
  });

  it('never reports a negative age for a clock behind the publish time', () => {
    const f = boardFreshness(PUBLISHED, at(-3));
    expect(f.ageHours).toBe(0);
    expect(f.state).toBe('current');
  });
});

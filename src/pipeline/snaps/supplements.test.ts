import { describe, expect, it } from 'vitest';
import { aggregateSnapWindows } from '@/pipeline/snaps/aggregate';
import { buildSnapSupplement } from '@/pipeline/snaps/supplements';
import type { PlayerSnapAggregate, SnapRecord } from '@/pipeline/snaps/types';
import type { SupportedPosition } from '@/pipeline/types';

function rec(season: number, week: number, snaps: number, pct: number | null): SnapRecord {
  return { gsis: 'g', position: 'RB', season, week, seasonType: 'REG', offenseSnaps: snaps, offensePct: pct };
}

function agg(position: SupportedPosition, rows: SnapRecord[]): PlayerSnapAggregate {
  return { canonicalId: 'pt_x', position, gsis: 'g', windows: aggregateSnapWindows(rows, { currentSeason: 2025 }) };
}

describe('buildSnapSupplement', () => {
  it('RB: supplies snap share (DIRECT) for last4/last8/previous; carry share stays unavailable', () => {
    const built = buildSnapSupplement(
      agg('RB', [rec(2024, 16, 40, 0.5), rec(2025, 1, 50, 0.5), rec(2025, 2, 60, 0.6)]),
    );
    expect(typeof built.supplement.snap_share_last4).toBe('number');
    expect(typeof built.supplement.snap_share_last8).toBe('number');
    expect(typeof built.supplement.previous_snap_share).toBe('number');
    expect(built.directSupplied).toBe(3);
    // carry share is NOT a snap metric (denominator = team non-QB rush attempts).
    const carry = built.fields.find((f) => f.field === 'carry_share_last4');
    expect(carry?.availability).toBe('UNAVAILABLE');
    expect(carry?.reason).toContain('team non-QB rush attempts');
  });

  it('TE: supplies snap_share_last4 (DIRECT) and leaves routes to the engine proxy', () => {
    const built = buildSnapSupplement(agg('TE', [rec(2025, 1, 40, 0.6), rec(2025, 3, 44, 0.66)]));
    expect(typeof built.supplement.snap_share_last4).toBe('number');
    const rp = built.fields.find((f) => f.field === 'route_participation_last4');
    expect(rp?.provenance).toBe('ENGINE_OWNED_PROXY');
    // The pipeline does NOT put a route value in the supplement (engine owns it).
    expect('route_participation_last4' in built.supplement).toBe(false);
  });

  it('WR: reports career_routes UNAVAILABLE because the pass-snap proxy input is missing', () => {
    const built = buildSnapSupplement(agg('WR', [rec(2025, 1, 60, 0.95)]));
    const cr = built.fields.find((f) => f.field === 'career_routes');
    expect(cr?.availability).toBe('UNAVAILABLE');
    expect(cr?.reason).toContain('pass snaps');
    // WR has no snap-share engine field; nothing is placed in the supplement.
    expect(Object.keys(built.supplement)).toHaveLength(0);
  });

  it('QB: snaps do NOT become starts', () => {
    const built = buildSnapSupplement(agg('QB', [rec(2025, 1, 68, 1.0)]));
    const cs = built.fields.find((f) => f.field === 'career_starts');
    expect(cs?.availability).toBe('UNAVAILABLE');
    expect('career_starts' in built.supplement).toBe(false);
  });

  it('never emits NaN/Infinity', () => {
    const built = buildSnapSupplement(agg('RB', [rec(2025, 1, 0, 0)]));
    for (const v of Object.values(built.supplement)) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});

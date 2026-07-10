// §10.5 component tests + §26.16.1 component-level invariants.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { ageDevelopment, availability } from '@/rb-model/components';
import { loadFixture } from '@/rb-model/testutil';
import type { ComponentScores, RBMVPInput } from '@/rb-model/types';

const base = (): RBMVPInput => loadFixture('elite-bell-cow');
const comps = (i: RBMVPInput): ComponentScores => evaluateRunningBack(i).components;

describe('§10.5 components', () => {
  it('all eight components remain within [0,100] across every fixture', () => {
    for (const name of [
      'elite-bell-cow',
      'goal-line-specialist',
      'receiving-specialist',
      'committee-back',
      'explosive-rookie',
      'aging-veteran',
      'injury-return',
      'out-player',
      'missing-data',
      'mobile-qb-low-pressure',
    ]) {
      const c = comps(loadFixture(name));
      for (const k of Object.keys(c) as (keyof ComponentScores)[]) {
        expect(c[k]).toBeGreaterThanOrEqual(0);
        expect(c[k]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('WRK rises with workload (higher snap/carry/route shares)', () => {
    const lo = base();
    lo.snap_share_last4 = 0.4;
    lo.carry_share_last4 = 0.3;
    lo.route_participation_last4 = 0.3;
    const hi = base();
    hi.snap_share_last4 = 0.9;
    hi.carry_share_last4 = 0.78;
    hi.route_participation_last4 = 0.68;
    expect(comps(hi).WRK).toBeGreaterThan(comps(lo).WRK);
  });

  it('§26.16.1.6 OQ low-touch cap triggers below six base projected touches', () => {
    const capped = base();
    capped.carry_share_last4 = 0.05;
    capped.route_participation_last4 = 0.05;
    capped.goal_line_carry_share = 1.0;
    capped.red_zone_carry_share = 0.8;
    capped.projected_team_non_qb_rush_attempts = 18;
    capped.projected_team_dropbacks = 27;
    capped.targets_per_route_run = 0.08;
    capped.team_points_per_drive = 2.9;
    // base touches ≈ 18×0.05 + tiny targets < 6 → cap at 70
    expect(comps(capped).OQ).toBe(70);

    // Raise carry share so base touches ≥ 6 → uncapped, strictly above 70.
    const uncapped = { ...capped, carry_share_last4: 0.5 };
    expect(comps(uncapped).OQ).toBeGreaterThan(70);
  });

  it('§26.8.1 OQ uses pre-ramp, pre-QB-adjustment role touches (ramp/pressure do not move OQ)', () => {
    const a = base();
    const b = base();
    b.qb_rush_pressure = 0.7;
    b.workload_ramp_factor = 0.5;
    expect(comps(b).OQ).toBe(comps(a).OQ);
  });

  it('§26.16.1.? RE cannot be dominated by one explosive result (explosive band clamp)', () => {
    // A back with a monster explosive rate but average YPC/success stays banded
    // within ±8 of its non-explosive score.
    const i = base();
    i.explosive_run_rate = 0.2; // top of the reference
    i.yards_per_carry = 4.2;
    i.rushing_success_rate = 0.42;
    i.career_carries = 400; // full sample, no small-sample clamp
    const re = comps(i).RE;
    // Non-explosive baseline RE_base is mid-pack; the explosive term can add at
    // most +8 over RE_base+7.5 window, so RE stays well below an "elite" 90+.
    expect(re).toBeLessThan(70);
  });

  it('RU rises with routes and targets', () => {
    const lo = base();
    lo.route_participation_last4 = 0.2;
    lo.targets_per_route_run = 0.1;
    lo.target_share = 0.05;
    const hi = base();
    hi.route_participation_last4 = 0.68;
    hi.targets_per_route_run = 0.28;
    hi.target_share = 0.2;
    expect(comps(hi).RU).toBeGreaterThan(comps(lo).RU);
  });

  it('TC falls with QB rush pressure', () => {
    const lo = base();
    lo.qb_rush_pressure = 0.1;
    const hi = base();
    hi.qb_rush_pressure = 0.7;
    expect(comps(hi).TC).toBeLessThan(comps(lo).TC);
  });

  it('RD falls with competition, teammate return, and incoming competition', () => {
    const baseline = comps(base()).RD;

    const comp = base();
    comp.competition_pressure = 0.9;
    expect(comps(comp).RD).toBeLessThan(baseline);

    const mate = base();
    mate.teammate_return_flag = true;
    expect(comps(mate).RD).toBeLessThan(baseline);

    const incoming = base();
    incoming.incoming_competition_flag = true;
    expect(comps(incoming).RD).toBeLessThan(baseline);
  });

  it('§26.16.1 AD falls sharply at older RB ages', () => {
    expect(ageDevelopment(24, 3, false)).toBeGreaterThan(ageDevelopment(27, 6, false));
    expect(ageDevelopment(27, 6, false)).toBeGreaterThan(ageDevelopment(30, 9, false));
    // 30+ base is 14
    expect(ageDevelopment(31, 9, false)).toBe(14);
  });

  it('AV follows the exact §26.8.9 injury/practice rules', () => {
    expect(availability('HEALTHY', 'FULL')).toBe(98);
    expect(availability('QUESTIONABLE', 'FULL')).toBe(85);
    expect(availability('QUESTIONABLE', 'LIMITED')).toBe(68);
    expect(availability('QUESTIONABLE', 'DNP')).toBe(42);
    expect(availability('QUESTIONABLE', 'UNKNOWN')).toBe(42);
    expect(availability('DOUBTFUL', 'FULL')).toBe(12);
    expect(availability('OUT', 'DNP')).toBe(0);
    expect(availability('IR', 'DNP')).toBe(0);
    expect(availability('PUP', 'DNP')).toBe(0);
    expect(availability('SUSPENDED', 'DNP')).toBe(0);
    expect(availability('UNKNOWN', 'UNKNOWN')).toBe(72);
  });
});

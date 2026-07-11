// §26.16.8 + §10.10 explanation tests.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { loadFixture } from '@/rb-model/testutil';
import type { Horizon, RBMVPInput } from '@/rb-model/types';

const CARRY_CONTROL = 'Projected to control most backfield carries.';
const GOAL_LINE = 'Projected to dominate goal-line work.';
const RECEIVING_STABILITY = 'Receiving usage provides weekly stability.';
const COMMITTEE = 'Committee usage limits expected workload.';
const TD_DEP = 'The projection depends heavily on touchdown opportunities.';
const AGE_LONG_TERM = 'Age and workload reduce the long-term outlook.';

// Text → topic (direct + component templates) for disjointness checks.
const TOPIC_OF: Record<string, string> = {
  [CARRY_CONTROL]: 'workload',
  [GOAL_LINE]: 'goal_line',
  [RECEIVING_STABILITY]: 'receiving',
  [COMMITTEE]: 'workload',
  [TD_DEP]: 'touchdown_dependence',
  'Current workload may shrink when a teammate returns.': 'workload_durability',
  'Current availability materially lowers the weekly outlook.': 'availability',
  [AGE_LONG_TERM]: 'age',
  'Current workload supports the outlook.': 'workload',
  'Limited workload lowers the outlook.': 'workload',
  'High-value opportunities strengthen the projection.': 'opportunity_quality',
  'Limited high-value opportunities constrain the projection.': 'opportunity_quality',
  'Rushing efficiency is above the RB reference group.': 'rushing_efficiency',
  'Rushing efficiency is below the RB reference group.': 'rushing_efficiency',
  'Receiving utility strengthens the profile.': 'receiving',
  'Limited receiving utility reduces weekly stability.': 'receiving',
  'The team environment supports RB opportunity.': 'team_context',
  'The team environment limits RB opportunity.': 'team_context',
  'The current role has strong durability support.': 'workload_durability',
  'Role durability is a material concern.': 'workload_durability',
  'Age and development support the long-term profile.': 'age',
  'Age and workload reduce the long-term profile.': 'age',
  'Current availability supports the weekly outlook.': 'availability',
  'Current availability lowers the weekly outlook.': 'availability',
};

const BANNED = /\b(will|guarantee|guaranteed|proven|proof|certain|certainly|because|causes|caused)\b/i;
const ALL_FIXTURES = [
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
];
const HORIZONS: Horizon[] = ['WEEKLY', 'ROS', 'ONE_YEAR', 'THREE_YEAR', 'DYNASTY'];

describe('§26.16.8 explanations', () => {
  it('2/3. positive and negative arrays never exceed three, across all fixtures × horizons', () => {
    for (const name of ALL_FIXTURES) {
      for (const h of HORIZONS) {
        const e = evaluateRunningBack(loadFixture(name), { selected_horizon: h }).explanations;
        expect(e.positive_drivers.length).toBeLessThanOrEqual(3);
        expect(e.negative_drivers.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('4/8. duplicate topics are removed and no topic appears on both sides', () => {
    for (const name of ALL_FIXTURES) {
      for (const h of HORIZONS) {
        const e = evaluateRunningBack(loadFixture(name), { selected_horizon: h }).explanations;
        const posTopics = e.positive_drivers.map((t) => TOPIC_OF[t]);
        const negTopics = e.negative_drivers.map((t) => TOPIC_OF[t]);
        expect(new Set(posTopics).size).toBe(posTopics.length);
        expect(new Set(negTopics).size).toBe(negTopics.length);
        for (const t of posTopics) expect(negTopics).not.toContain(t);
      }
    }
  });

  it('1. direct explanations precede component explanations', () => {
    // Elite fires all three positive directs (carry control, goal-line, receiving).
    const e = evaluateRunningBack(loadFixture('elite-bell-cow')).explanations;
    expect(e.positive_drivers.slice(0, 3)).toEqual([CARRY_CONTROL, GOAL_LINE, RECEIVING_STABILITY]);
  });

  it('5/6. carry-control and goal-line explanations are positive (elite)', () => {
    const e = evaluateRunningBack(loadFixture('elite-bell-cow')).explanations;
    expect(e.positive_drivers).toContain(CARRY_CONTROL);
    expect(e.positive_drivers).toContain(GOAL_LINE);
  });

  it('7. receiving-stability explanation is positive (receiving specialist)', () => {
    const e = evaluateRunningBack(loadFixture('receiving-specialist')).explanations;
    expect(e.positive_drivers).toContain(RECEIVING_STABILITY);
  });

  it('8-committee. committee explanation is negative (committee back)', () => {
    const e = evaluateRunningBack(loadFixture('committee-back')).explanations;
    expect(e.negative_drivers).toContain(COMMITTEE);
    expect(e.positive_drivers).not.toContain(COMMITTEE);
  });

  it('9-td. TD-dependence explanation is negative (goal-line specialist)', () => {
    const e = evaluateRunningBack(loadFixture('goal-line-specialist')).explanations;
    expect(e.negative_drivers).toContain(TD_DEP);
  });

  it('7-longterm. long-term age direct explanation appears only for THREE_YEAR or DYNASTY', () => {
    const vet = (h: Horizon) => evaluateRunningBack(loadFixture('aging-veteran'), { selected_horizon: h }).explanations.negative_drivers;
    expect(vet('WEEKLY')).not.toContain(AGE_LONG_TERM);
    expect(vet('ROS')).not.toContain(AGE_LONG_TERM);
    expect(vet('THREE_YEAR')).toContain(AGE_LONG_TERM);
    expect(vet('DYNASTY')).toContain(AGE_LONG_TERM);
  });

  it('9. no explanation claims certainty, proof, or causation', () => {
    for (const name of ALL_FIXTURES) {
      for (const h of HORIZONS) {
        const e = evaluateRunningBack(loadFixture(name), { selected_horizon: h }).explanations;
        for (const t of [...e.positive_drivers, ...e.negative_drivers]) {
          expect(t).not.toMatch(BANNED);
          // every emitted text is a known template (no generated prose)
          expect(TOPIC_OF[t]).toBeDefined();
        }
      }
    }
  });

  it('§26.13.1 rule 6: teammate-return flag emits the negative workload-durability explanation', () => {
    const i = loadFixture('elite-bell-cow');
    i.teammate_return_flag = true;
    const e = evaluateRunningBack(i).explanations;
    expect(e.negative_drivers).toContain('Current workload may shrink when a teammate returns.');
    // The direct explanation owns the workload_durability topic, so the RD
    // component driver may not also appear on the positive side (§26.13.3.9).
    expect(e.positive_drivers).not.toContain('The current role has strong durability support.');
  });

  it('10. changing selected horizon can change ordering but not calculations or composites', () => {
    const i: RBMVPInput = loadFixture('aging-veteran');
    const weekly = evaluateRunningBack(i, { selected_horizon: 'WEEKLY' });
    const dynasty = evaluateRunningBack(i, { selected_horizon: 'DYNASTY' });
    expect(dynasty.components).toEqual(weekly.components);
    expect(dynasty.composites).toEqual(weekly.composites);
    expect(dynasty.weekly).toEqual(weekly.weekly);
    // drivers differ between the two horizons
    expect(dynasty.explanations).not.toEqual(weekly.explanations);
  });
});

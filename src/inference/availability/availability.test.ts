import { describe, expect, it } from 'vitest';
import {
  availabilityProbability,
  probabilityActive,
  rosterStatusAvailProb,
  workloadRampFactor,
  type AvailabilityState,
} from '@/inference/availability/availability';

function state(p: Partial<AvailabilityState> = {}): AvailabilityState {
  return {
    injuryStatus: 'HEALTHY',
    practiceStatus: 'UNKNOWN',
    recentlyActivated: false,
    freeAgent: false,
    practiceSquad: false,
    ...p,
  };
}

describe('availability probability — Table A (REGISTRY §7.1)', () => {
  it('healthy and injury states', () => {
    expect(availabilityProbability(state({ injuryStatus: 'HEALTHY' }))).toBe(0.97);
    expect(availabilityProbability(state({ injuryStatus: 'QUESTIONABLE', practiceStatus: 'LIMITED' }))).toBe(0.65);
    expect(availabilityProbability(state({ injuryStatus: 'DOUBTFUL' }))).toBe(0.2);
    expect(availabilityProbability(state({ injuryStatus: 'OUT' }))).toBe(0.3);
    expect(availabilityProbability(state({ injuryStatus: 'IR' }))).toBe(0.05);
    expect(availabilityProbability(state({ injuryStatus: 'SUSPENDED' }))).toBe(0.0);
  });

  it('practice status only modifies QUESTIONABLE', () => {
    expect(availabilityProbability(state({ injuryStatus: 'QUESTIONABLE', practiceStatus: 'FULL' }))).toBe(0.85);
    expect(availabilityProbability(state({ injuryStatus: 'QUESTIONABLE', practiceStatus: 'DNP' }))).toBe(0.45);
  });

  it('free agent / practice squad / recently activated', () => {
    expect(availabilityProbability(state({ freeAgent: true }))).toBe(0.1);
    expect(availabilityProbability(state({ practiceSquad: true }))).toBe(0.15);
    expect(availabilityProbability(state({ recentlyActivated: true }))).toBe(0.85);
  });
});

describe('probability_active (QB, §7.3) and workload ramp (RB, §7.4)', () => {
  it('probability_active by injury', () => {
    expect(probabilityActive('HEALTHY')).toBe(0.99);
    expect(probabilityActive('DOUBTFUL')).toBe(0.2);
    expect(probabilityActive('OUT')).toBe(0.0);
  });
  it('workload ramp factor', () => {
    expect(workloadRampFactor(state({ injuryStatus: 'HEALTHY' }))).toBe(1.0);
    expect(workloadRampFactor(state({ injuryStatus: 'QUESTIONABLE', practiceStatus: 'FULL' }))).toBe(0.9);
    expect(workloadRampFactor(state({ injuryStatus: 'OUT' }))).toBe(0.0);
    expect(workloadRampFactor(state({ injuryStatus: 'UNKNOWN' }))).toBe(0.8);
  });
  it('teammate roster-status availability (§4.2 health)', () => {
    expect(rosterStatusAvailProb('ACTIVE')).toBe(0.97);
    expect(rosterStatusAvailProb('IR')).toBe(0.05);
    expect(rosterStatusAvailProb('PRACTICE_SQUAD')).toBe(0.15);
    expect(rosterStatusAvailProb('SUSPENDED')).toBe(0.0);
  });
});

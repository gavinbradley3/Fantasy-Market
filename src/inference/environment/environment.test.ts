import { describe, expect, it } from 'vitest';
import {
  componentPercentile,
  offensiveEnvironmentScore,
  protectionContextScore,
  qbEnvironmentScore,
} from '@/inference/environment/environment';
import { verifyEnvReferenceChecksum } from '@/inference/registry/envReference';

describe('offensive / QB environment (REGISTRY §6.2, §20.F1)', () => {
  it('uses only the checksum-verified canonical reference', () => {
    expect(verifyEnvReferenceChecksum()).toBe(true);
  });

  it('every canonical component percentile (mid-rank)', () => {
    expect(componentPercentile('team_points_per_drive', 2.05)).toBeCloseTo(53.125, 10); // Fx1
    expect(componentPercentile('projected_team_dropbacks', 34)).toBeCloseTo(46.875, 10);
    expect(componentPercentile('team_red_zone_trips_per_game', 3.4)).toBeCloseTo(54.166667, 5);
    expect(componentPercentile('adjusted_yards_per_attempt', 7.0)).toBeCloseTo(47.222222, 5);
    expect(componentPercentile('sack_rate', 0.06)).toBeCloseTo(30.555556, 5);
    expect(componentPercentile('projected_team_non_qb_rush_attempts', 24)).toBeCloseTo(50, 10);
  });

  it('cross-position equality: same input → same component percentile regardless of caller', () => {
    // offensive (WR/RB/TE consumer) and qb env both percentile dropbacks against the SAME array.
    const off = offensiveEnvironmentScore({ teamPointsPerDrive: null, projectedTeamDropbacks: 34, teamRedZoneTripsPerGame: null });
    const qb = qbEnvironmentScore({ adjustedYardsPerAttempt: null, projectedTeamDropbacks: 34, sackRate: null, recentStartRate: null });
    // both reduce to the single dropbacks component percentile (46.875 → 47)
    expect(off).toBe(47);
    expect(qb).toBe(47);
    expect(off).toBe(qb);
  });

  it('registered weighted offensive result', () => {
    // 0.5*53.125 + 0.25*46.875 + 0.25*54.16667 = 51.8229 → 52
    expect(
      offensiveEnvironmentScore({ teamPointsPerDrive: 2.05, projectedTeamDropbacks: 34, teamRedZoneTripsPerGame: 3.4 }),
    ).toBe(52);
  });

  it('registered weighted QB result', () => {
    // 0.4*47.2222 + 0.2*46.875 + 0.2*(100-30.5556) + 0.2*90 = 60.15 → 60
    expect(
      qbEnvironmentScore({ adjustedYardsPerAttempt: 7.0, projectedTeamDropbacks: 34, sackRate: 0.06, recentStartRate: 0.9 }),
    ).toBe(60);
  });

  it('drops missing components and renormalizes; all missing → null', () => {
    expect(offensiveEnvironmentScore({ teamPointsPerDrive: null, projectedTeamDropbacks: null, teamRedZoneTripsPerGame: null })).toBeNull();
  });

  it('protection_context_score = 100 − pct(sack_rate); null when absent', () => {
    expect(protectionContextScore(0.06)).toBe(69); // 100 - 30.5556 → 69
    expect(protectionContextScore(null)).toBeNull();
  });

  it('percentile boundaries clamp to [0,100]', () => {
    expect(componentPercentile('team_points_per_drive', 0)).toBe(0);
    expect(componentPercentile('team_points_per_drive', 99)).toBe(100);
  });
});

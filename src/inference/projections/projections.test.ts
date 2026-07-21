import { describe, expect, it } from 'vitest';
import {
  expectedActiveGamePassAttempts,
  projectRate,
  projectRookieShare,
  projectShare,
  projectTeamVolume,
} from '@/inference/projections/projections';
import { shrink } from '@/inference/projections/shrink';

const shareBounds = { lo: 0, hi: 0.45, dp: 4 };

describe('share projection (REGISTRY §2.1)', () => {
  it('full-data blend at partial recent coverage', () => {
    // w_recent = 2/4 = 0.5 → 0.5*0.30 + 0.5*0.20 = 0.25
    expect(projectShare({ recent: 0.3, career: 0.2, gamesObservedL4: 2, ...shareBounds }).value).toBe(0.25);
  });
  it('full recent coverage → recent dominates', () => {
    expect(projectShare({ recent: 0.3, career: 0.2, gamesObservedL4: 4, ...shareBounds }).value).toBe(0.3);
  });
  it('recent-only and career-only use full weight', () => {
    expect(projectShare({ recent: 0.3, career: null, gamesObservedL4: 4, ...shareBounds }).value).toBe(0.3);
    const careerOnly = projectShare({ recent: null, career: 0.2, gamesObservedL4: 0, ...shareBounds });
    expect(careerOnly.value).toBe(0.2);
    expect(careerOnly.usedFallback).toBe(true);
  });
  it('both missing → null (INSUFFICIENT_DATA)', () => {
    expect(projectShare({ recent: null, career: null, gamesObservedL4: 0, ...shareBounds }).value).toBeNull();
  });
  it('clamp to hi and 4dp rounding', () => {
    expect(projectShare({ recent: 0.9, career: 0.9, gamesObservedL4: 4, ...shareBounds }).value).toBe(0.45);
    expect(projectShare({ recent: 0.123456, career: null, gamesObservedL4: 4, ...shareBounds }).value).toBe(0.1235);
  });
});

describe('rookie share + team volume (REGISTRY §2.1/§2.3)', () => {
  it('rookie share blends archetype and league median at 0.5', () => {
    expect(projectRookieShare(0.18, 0.1, shareBounds)).toBe(0.14);
  });
  it('team volume in-season blend', () => {
    // w_team = 3/6 = 0.5 → 0.5*35 + 0.5*34 = 34.5
    expect(
      projectTeamVolume({ std: 35, teamGamesPlayedThisSeason: 3, leagueMedian: 34, priorSeasonPerGame: null, priorSeasonGames: 0, lo: 20, hi: 48, dp: 2 }),
    ).toBe(34.5);
  });
  it('team volume preseason shrinks prior toward league (k=8, n=17)', () => {
    // shrink(36,34,8,17) = (17*36 + 8*34)/25 = 35.36
    expect(
      projectTeamVolume({ std: null, teamGamesPlayedThisSeason: 0, leagueMedian: 34, priorSeasonPerGame: 36, priorSeasonGames: 17, lo: 20, hi: 48, dp: 2 }),
    ).toBe(35.36);
  });
  it('team volume with no prior falls to league median', () => {
    expect(
      projectTeamVolume({ std: null, teamGamesPlayedThisSeason: 0, leagueMedian: 34, priorSeasonPerGame: null, priorSeasonGames: 0, lo: 20, hi: 48, dp: 2 }),
    ).toBe(34);
  });
});

describe('rate + QB volume (REGISTRY §2.3/§2.7)', () => {
  it('efficiency rate shrinks observed toward prior', () => {
    // shrink(0.25, 0.18, 150, 100) = (25 + 27)/250 = 0.208
    expect(projectRate({ observed: 0.25, careerOrPrior: null, neutralPrior: 0.18, k: 150, sampleN: 100, lo: 0, hi: 1, dp: 4 }).value).toBe(0.208);
  });
  it('QB expected pass attempts (§2.7)', () => {
    // shrink(30, 34, 180, 300) = 31.5; shareAdj = 0.96/0.96 = 1.0 → 31.5
    expect(
      expectedActiveGamePassAttempts({ roleStatus: 'ESTABLISHED_STARTER', recentPassAttempts: 300, recentStartsEst: 10, teamDropbackShare: 0.96 }),
    ).toBe(31.5);
  });
  it('shrink boundary: zero sample returns the prior', () => {
    expect(shrink(0.9, 0.2, 150, 0)).toBe(0.2);
  });
});

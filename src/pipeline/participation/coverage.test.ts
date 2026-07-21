import { describe, expect, it } from 'vitest';
import { computeCoverage } from '@/pipeline/participation/coverage';

const COVERED = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

describe('computeCoverage (partial cannot masquerade as full career)', () => {
  it('COMPLETE when the entire career falls inside coverage and as-of ≤ coverage', () => {
    const c = computeCoverage({ careerStartSeason: 2021, asOfSeason: 2023, coveredSeasons: COVERED, coveredGames: 30, playerSeasons: [2021, 2022, 2023] });
    expect(c.state).toBe('COMPLETE');
  });

  it('PARTIAL when as-of is beyond coverage (active-2025 player)', () => {
    const c = computeCoverage({ careerStartSeason: 2021, asOfSeason: 2025, coveredSeasons: COVERED, coveredGames: 30, playerSeasons: [2021, 2022, 2023] });
    expect(c.state).toBe('PARTIAL');
    expect(c.reason).toContain('beyond coverage');
  });

  it('PARTIAL when the career began before coverage (veteran)', () => {
    const c = computeCoverage({ careerStartSeason: 2012, asOfSeason: 2023, coveredSeasons: COVERED, coveredGames: 40, playerSeasons: [2016, 2017, 2018] });
    expect(c.state).toBe('PARTIAL');
    expect(c.reason).toContain('before coverage');
  });

  it('UNAVAILABLE when the player has no covered games', () => {
    const c = computeCoverage({ careerStartSeason: 2021, asOfSeason: 2023, coveredSeasons: COVERED, coveredGames: 0, playerSeasons: [] });
    expect(c.state).toBe('UNAVAILABLE');
  });

  it('PARTIAL (not COMPLETE) when career start is unknown', () => {
    const c = computeCoverage({ careerStartSeason: null, asOfSeason: 2023, coveredSeasons: COVERED, coveredGames: 10, playerSeasons: [2023] });
    expect(c.state).toBe('PARTIAL');
  });
});

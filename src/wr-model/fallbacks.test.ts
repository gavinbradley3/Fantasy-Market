import { describe, expect, it } from 'vitest';
import { resolveFallbacks } from '@/wr-model/fallbacks';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/wr-model/referenceDistributions';
import { referenceMedian } from '@/wr-model/percentiles';
import { loadFixture } from '@/wr-model/testutil';
import type { WRMVPInput } from '@/wr-model/types';

// A fully-present base input so we can null exactly one field per test.
function base(): WRMVPInput {
  return loadFixture('elite-full-time');
}

function findLog(field: string, r: ReturnType<typeof resolveFallbacks>) {
  return r.log.find((l) => l.field === field);
}

describe('fallbacks — no fallback when the primary value exists', () => {
  it('a fully-present input logs nothing and adds no penalty', () => {
    const r = resolveFallbacks(base(), REF);
    expect(r.log).toHaveLength(0);
    expect(r.penalty).toBe(0);
  });
});

describe('fallbacks — every §26.5 row', () => {
  it('RP4 → RP8 with penalty 8', () => {
    const r = resolveFallbacks({ ...base(), route_participation_last4: null }, REF);
    expect(r.resolved.rp4).toBe(0.92); // RP8
    expect(findLog('RP4', r)).toMatchObject({ confidence_penalty: 8 });
  });

  it('both RP null → final 0.50 for each, penalties applied once each (Decision 4)', () => {
    const r = resolveFallbacks(
      { ...base(), route_participation_last4: null, route_participation_last8: null },
      REF,
    );
    expect(r.resolved.rp4).toBe(0.5);
    expect(r.resolved.rp8).toBe(0.5);
    expect(r.log.filter((l) => l.field === 'RP4')).toHaveLength(1);
    expect(r.log.filter((l) => l.field === 'RP8')).toHaveLength(1);
  });

  it('TPRR → career TPRR → 0.18', () => {
    const viaCareer = resolveFallbacks({ ...base(), targets_per_route_run: null }, REF);
    expect(viaCareer.resolved.tprr).toBe(0.27); // career value
    expect(findLog('TPRR', viaCareer)).toMatchObject({ confidence_penalty: 10 });

    const viaFinal = resolveFallbacks(
      { ...base(), targets_per_route_run: null, career_targets_per_route_run: null },
      REF,
    );
    expect(viaFinal.resolved.tprr).toBe(0.18);
  });

  it('target share → RP4×TPRR capped 0.35 → 0.12', () => {
    const derived = resolveFallbacks({ ...base(), target_share: null }, REF);
    expect(derived.resolved.targetShare).toBeCloseTo(0.94 * 0.29, 9);
    expect(findLog('Target share', derived)).toMatchObject({ confidence_penalty: 6 });
  });

  it('xFP/target → career → reference median', () => {
    const viaCareer = resolveFallbacks({ ...base(), expected_fantasy_points_per_target: null }, REF);
    expect(viaCareer.resolved.xfpPerTarget).toBe(2.05);
    const viaMedian = resolveFallbacks(
      { ...base(), expected_fantasy_points_per_target: null, career_expected_fantasy_points_per_target: null },
      REF,
    );
    expect(viaMedian.resolved.xfpPerTarget).toBeCloseTo(
      referenceMedian('expected_fantasy_points_per_target', REF),
      9,
    );
  });

  it('CROE → 0.00, aDOT → 10.0, xTD → 0.05, QB env → 50', () => {
    const r = resolveFallbacks(
      {
        ...base(),
        catch_rate_over_expected: null,
        average_depth_of_target: null,
        expected_td_rate_per_target: null,
        qb_environment_score: null,
      },
      REF,
    );
    expect(r.resolved.croe).toBe(0);
    expect(r.resolved.adot).toBe(10);
    expect(r.resolved.xtdPerTarget).toBe(0.05);
    expect(r.resolved.qbEnvironment).toBe(50);
  });

  it('team dropbacks & points/drive → reference median', () => {
    const r = resolveFallbacks(
      { ...base(), projected_team_dropbacks: null, team_points_per_drive: null },
      REF,
    );
    expect(r.resolved.teamDropbacks).toBeCloseTo(referenceMedian('projected_team_dropbacks', REF), 9);
    expect(r.resolved.pointsPerDrive).toBeCloseTo(referenceMedian('team_points_per_drive', REF), 9);
  });

  it('contract security → draft-round mapping (R1 = 1.00); competition pressure → 0.50', () => {
    const r = resolveFallbacks(
      { ...base(), contract_security: null, competition_pressure: null, draft_round: 1 },
      REF,
    );
    expect(r.resolved.contractSecurity).toBe(1.0);
    expect(r.resolved.competitionPressure).toBe(0.5);
    expect(findLog('Contract security', r)).toMatchObject({ confidence_penalty: 4 });
  });

  it('penalties are applied exactly once each and summed', () => {
    const r = resolveFallbacks({ ...base(), catch_rate_over_expected: null }, REF);
    expect(r.log).toHaveLength(1);
    expect(r.penalty).toBe(5);
  });
});

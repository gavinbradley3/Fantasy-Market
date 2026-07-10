// §26.16.4 penalty tests + §10.3 fallback tests.
import { describe, expect, it } from 'vitest';
import { resolveFallbacks } from '@/rb-model/fallbacks';
import { evaluateRunningBack } from '@/rb-model/engine';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/rb-model/referenceDistributions';
import { loadFixture } from '@/rb-model/testutil';
import type { RBMVPInput } from '@/rb-model/types';

function base(): RBMVPInput {
  return loadFixture('elite-bell-cow');
}
function fieldEntry(input: RBMVPInput, field: string) {
  const { log } = resolveFallbacks(input, REF);
  return log.filter((e) => e.field === field);
}

describe('§26.16.4 penalty tests', () => {
  it('1. route-participation fallback produces exactly one 15-point penalty', () => {
    const input = base();
    input.route_participation_last4 = null;
    const entries = fieldEntry(input, 'Route participation');
    expect(entries).toHaveLength(1);
    expect(entries[0].confidence_penalty).toBe(15);
  });

  it('2. a fallback reused in multiple components is penalized once', () => {
    // Carry share is missing → derived from canonical Snap4 and reused by WRK,
    // OQ (via base carries), TC, projections. It must appear once in the log.
    const input = base();
    input.carry_share_last4 = null;
    const { log } = resolveFallbacks(input, REF);
    expect(log.filter((e) => e.field === 'Carry share')).toHaveLength(1);
  });

  it('3. mutual Snap4/Snap8 fallbacks resolve against ORIGINAL values', () => {
    // Snap4 missing → original Snap8; Snap8 present → unchanged.
    const a = base();
    a.snap_share_last4 = null;
    a.snap_share_last8 = 0.6;
    expect(resolveFallbacks(a, REF).resolved.snap4).toBe(0.6);

    // Both missing → each independently takes the 0.45 final (no circular reuse
    // of a just-filled sibling).
    const b = base();
    b.snap_share_last4 = null;
    b.snap_share_last8 = null;
    const r = resolveFallbacks(b, REF).resolved;
    expect(r.snap4).toBe(0.45);
    expect(r.snap8).toBe(0.45);
  });

  it('4. no canonical fallback field is logged twice', () => {
    const { log } = resolveFallbacks(loadFixture('missing-data'), REF);
    const fields = log.map((e) => e.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('5. Snap4 and carry share both missing → each logged once', () => {
    const input = base();
    input.snap_share_last4 = null;
    input.snap_share_last8 = null;
    input.carry_share_last4 = null;
    const { log } = resolveFallbacks(input, REF);
    expect(log.filter((e) => e.field === 'Snap4')).toHaveLength(1);
    expect(log.filter((e) => e.field === 'Carry share')).toHaveLength(1);
    // Carry share derived from canonical Snap4 (0.45 × 0.90 = 0.405).
    expect(resolveFallbacks(input, REF).resolved.carryShare).toBeCloseTo(0.405, 6);
  });
});

describe('§10.3 fallback behavior', () => {
  it('exact fallback value + penalty are selected (contract security → draft mapping)', () => {
    const input = base();
    input.contract_security = null; // draft_round 1 → 1.00, penalty 4
    const { resolved, log } = resolveFallbacks(input, REF);
    expect(resolved.contractSecurity).toBe(1.0);
    const e = log.find((x) => x.field === 'Contract security')!;
    expect(e.confidence_penalty).toBe(4);
  });

  it('TPRR: current → career → draft-round prior', () => {
    const input = base();
    input.targets_per_route_run = null; // has career_targets_per_route_run 0.19
    expect(resolveFallbacks(input, REF).resolved.tprr).toBe(0.19);
    input.career_targets_per_route_run = null; // → draft prior (round 1 = 0.19)
    expect(resolveFallbacks(input, REF).resolved.tprr).toBe(0.19);
  });

  it('every reference-median row resolves at the median tier with the bundled table', () => {
    const input = base();
    input.projected_team_non_qb_rush_attempts = null;
    const e = fieldEntry(input, 'Team non-QB rushes');
    expect(e).toHaveLength(1);
    expect(e[0].fallback_used).toBe('reference median');
  });

  it('workload ramp: provided value is clamped and NOT logged', () => {
    const input = base();
    input.workload_ramp_factor = 1.5;
    const { resolved, log } = resolveFallbacks(input, REF);
    expect(resolved.workloadRamp).toBe(1);
    expect(log.some((e) => e.field === 'Workload ramp')).toBe(false);
  });

  it('workload ramp: missing → status/practice lookup, logged once with penalty 4', () => {
    const input = base();
    input.workload_ramp_factor = null;
    input.injury_status = 'DOUBTFUL';
    const { resolved, log } = resolveFallbacks(input, REF);
    expect(resolved.workloadRamp).toBe(0.6);
    const e = log.filter((x) => x.field === 'Workload ramp');
    expect(e).toHaveLength(1);
    expect(e[0].confidence_penalty).toBe(4);
  });

  it('9. status is OK with no fallback, PARTIAL with any', () => {
    expect(evaluateRunningBack(base()).status).toBe('OK');
    const input = base();
    input.contract_security = null;
    expect(evaluateRunningBack(input).status).toBe('PARTIAL');
  });

  it('downstream reuse does not re-penalize (total penalty == sum of unique field penalties)', () => {
    const { log, penalty } = resolveFallbacks(loadFixture('missing-data'), REF);
    const sum = log.reduce((s, e) => s + e.confidence_penalty, 0);
    expect(penalty).toBe(sum);
  });
});

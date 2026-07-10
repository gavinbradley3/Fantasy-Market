import { describe, expect, it } from 'vitest';
import {
  ageDevelopment,
  availability,
  efficiency,
  roleDurability,
  targetQuality,
} from '@/wr-model/components';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/wr-model/referenceDistributions';
import type { PercentileContext } from '@/wr-model/percentiles';

const ctx: PercentileContext = { reference: REF, onMissingReference: () => {} };

describe('Availability (§26.8 AV)', () => {
  it('maps every status/practice combination', () => {
    expect(availability('HEALTHY', 'FULL')).toBe(98);
    expect(availability('HEALTHY', 'DNP')).toBe(98); // injury is primary
    expect(availability('QUESTIONABLE', 'FULL')).toBe(85);
    expect(availability('QUESTIONABLE', 'LIMITED')).toBe(70);
    expect(availability('QUESTIONABLE', 'DNP')).toBe(45);
    expect(availability('QUESTIONABLE', 'UNKNOWN')).toBe(45);
    expect(availability('DOUBTFUL', 'DNP')).toBe(15);
    expect(availability('OUT', 'DNP')).toBe(0);
    expect(availability('IR', 'DNP')).toBe(0);
    expect(availability('PUP', 'DNP')).toBe(0);
    expect(availability('SUSPENDED', 'DNP')).toBe(0);
    expect(availability('UNKNOWN', 'UNKNOWN')).toBe(75);
  });
});

describe('Age & Development (§26.8 AD)', () => {
  it('uses the age band base and the year-2/3 bonus', () => {
    expect(ageDevelopment(22, 0)).toBe(78);
    expect(ageDevelopment(24, 3)).toBe(68);
    expect(ageDevelopment(24, 2)).toBe(73); // +5 year-2/3
    expect(ageDevelopment(31, 9)).toBe(30);
    expect(ageDevelopment(40, 15)).toBe(18);
  });

  it('older age lowers AD after the prime bands', () => {
    expect(ageDevelopment(31, 5)).toBeLessThan(ageDevelopment(26, 5));
    expect(ageDevelopment(33, 5)).toBeLessThan(ageDevelopment(31, 5));
  });
});

describe('Role Durability (§26.8 RD)', () => {
  const rd = () => roleDurability(0.5, 0.5, 'STABLE', 27);

  it('higher competition pressure lowers RD; stronger contract raises it', () => {
    expect(roleDurability(0.9, 0.5, 'STABLE', 27)).toBeGreaterThan(roleDurability(0.3, 0.5, 'STABLE', 27));
    expect(roleDurability(0.5, 0.9, 'STABLE', 27)).toBeLessThan(roleDurability(0.5, 0.2, 'STABLE', 27));
  });

  it('PROMOTED > STABLE > DEMOTED, all else equal', () => {
    const promoted = roleDurability(0.5, 0.5, 'PROMOTED', 27);
    const stable = roleDurability(0.5, 0.5, 'STABLE', 27);
    const demoted = roleDurability(0.5, 0.5, 'DEMOTED', 27);
    expect(promoted).toBeGreaterThan(stable);
    expect(stable).toBeGreaterThan(demoted);
    expect(promoted - stable).toBeCloseTo(12, 6);
    expect(stable - demoted).toBeCloseTo(12, 6);
  });

  it('age security deductions apply by band', () => {
    expect(roleDurability(0.5, 0.5, 'STABLE', 24)).toBeGreaterThan(rd()); // +5 young
    expect(roleDurability(0.5, 0.5, 'STABLE', 30)).toBeLessThan(rd()); // −5
    expect(roleDurability(0.5, 0.5, 'STABLE', 31)).toBeLessThan(roleDurability(0.5, 0.5, 'STABLE', 30));
  });
});

describe('Target Quality deep-target gate (§26.8 / §9.5)', () => {
  // Gate triggers only when ALL THREE hold: aDOT≥15 ∧ shrunkTPRR<0.18 ∧ CROE<0.
  const rawInputs = { xfp: 2.4, adot: 16, tprr: 0.15, croe: -0.05 };

  it('triggers and caps TQ to 65 when all three conditions hold', () => {
    const tq = targetQuality(rawInputs.xfp, rawInputs.adot, rawInputs.tprr, rawInputs.croe, ctx);
    expect(tq).toBe(65);
  });

  it('does not trigger when aDOT < 15 (only condition changed)', () => {
    const tq = targetQuality(rawInputs.xfp, 14.9, rawInputs.tprr, rawInputs.croe, ctx);
    expect(tq).toBeGreaterThan(65);
  });

  it('does not trigger when shrunk TPRR ≥ 0.18 (only condition changed)', () => {
    const tq = targetQuality(rawInputs.xfp, rawInputs.adot, 0.18, rawInputs.croe, ctx);
    expect(tq).toBeGreaterThan(65);
  });

  it('does not trigger when CROE ≥ 0 (only condition changed)', () => {
    const tq = targetQuality(rawInputs.xfp, rawInputs.adot, rawInputs.tprr, 0.0, ctx);
    expect(tq).toBeGreaterThan(65);
  });
});

describe('Efficiency low-sample clamp (§26.8 EF)', () => {
  it('clamps to [20,80] below 200 career routes, [0,100] otherwise', () => {
    // Very high on both metrics → raw ~100. Under 200 routes → clamped to 80.
    expect(efficiency(0.12, 4.0, 150, ctx)).toBeLessThanOrEqual(80);
    // Same inputs with a large sample may exceed 80.
    expect(efficiency(0.12, 4.0, 400, ctx)).toBeGreaterThan(80);
    // Very low on both → raw ~0. Under 200 routes → floored to 20.
    expect(efficiency(-0.12, -3.0, 150, ctx)).toBeGreaterThanOrEqual(20);
    expect(efficiency(-0.12, -3.0, 400, ctx)).toBeLessThan(20);
  });
});

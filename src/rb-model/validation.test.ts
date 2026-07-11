// §26.16.10 / §10.2 input-definition & validation tests.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import {
  RBValidationError,
  validateInput,
  validateOutput,
  validateReferenceDistributions,
} from '@/rb-model/validation';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/rb-model/referenceDistributions';
import { loadFixture } from '@/rb-model/testutil';
import type { RBMVPInput } from '@/rb-model/types';

function base(): RBMVPInput {
  return loadFixture('elite-bell-cow');
}

function expectReject(mutate: (i: RBMVPInput) => void, hint?: RegExp) {
  const input = base();
  mutate(input);
  let err: unknown;
  try {
    validateInput(input);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(RBValidationError);
  if (hint) expect((err as RBValidationError).message).toMatch(hint);
}

describe('§26.16.10 / §10.2 validation rejects', () => {
  it('empty player identity', () => {
    expectReject((i) => (i.player_id = ''), /player_id/);
    expectReject((i) => (i.player_name = ''), /player_name/);
  });

  it('age below 18', () => expectReject((i) => (i.age = 17), /age/));

  it('negative career touches / carries / routes', () => {
    expectReject((i) => (i.career_touches = -1), /career_touches/);
    expectReject((i) => (i.career_carries = -1), /career_carries/);
    expectReject((i) => (i.career_routes = -1), /career_routes/);
  });

  it('negative expected games remaining', () =>
    expectReject((i) => (i.expected_games_remaining = -1), /expected_games_remaining/));

  it('rate outside [0,1]', () => {
    expectReject((i) => (i.carry_share_last4 = 1.4), /carry_share_last4/);
    expectReject((i) => (i.qb_rush_pressure = -0.2), /qb_rush_pressure/);
  });

  it('null required boolean', () =>
    // @ts-expect-error deliberately violating the type to test the runtime guard
    expectReject((i) => (i.teammate_return_flag = null), /teammate_return_flag/));

  it('invalid enum', () => {
    // @ts-expect-error invalid enum literal
    expectReject((i) => (i.injury_status = 'SICK'), /injury_status/);
    // @ts-expect-error invalid enum literal
    expectReject((i) => (i.coaching_continuity = 'MAYBE'), /coaching_continuity/);
  });

  it('invalid timestamp', () => expectReject((i) => (i.as_of_timestamp = 'yesterday'), /timestamp/));

  it('non-finite number', () => {
    expectReject((i) => (i.age = Number.NaN), /age/);
    expectReject((i) => (i.projected_team_dropbacks = Number.POSITIVE_INFINITY), /projected_team_dropbacks/);
  });

  it('negative scoring value', () =>
    expectReject((i) => {
      i.scoring = {
        points_per_reception: -1,
        points_per_rushing_yard: 0.1,
        points_per_receiving_yard: 0.1,
        points_per_rushing_td: 6,
        points_per_receiving_td: 6,
      };
    }, /scoring/));

  it('invalid selected horizon (via engine options)', () => {
    // @ts-expect-error invalid horizon literal
    expect(() => evaluateRunningBack(base(), { selected_horizon: 'NEXT_DECADE' })).toThrow(RBValidationError);
  });

  it('does NOT reject documented nullable fallback fields', () => {
    const input = base();
    input.snap_share_last8 = null;
    input.contract_security = null;
    input.yards_per_carry = null;
    expect(() => validateInput(input)).not.toThrow();
  });

  it('§26.16.10.6 career_touches is carries + receptions (not carries + targets)', () => {
    // Documentation invariant: the field is accepted as-is; the engine never
    // recomputes it from targets. A record where touches < carries+targets but
    // equals carries+receptions is valid.
    const input = base();
    input.career_touches = input.career_carries; // pure runner, zero receptions
    expect(() => validateInput(input)).not.toThrow();
  });

  it('Decision 8: non-integer age is rejected (age tables are integer-keyed)', () => {
    expectReject((i) => (i.age = 24.5), /age/);
    expectReject((i) => (i.age = 21.5), /age/);
  });

  it('Decision 8: non-integer career counts are rejected', () => {
    expectReject((i) => (i.career_touches = 49.5), /career_touches/);
    expectReject((i) => (i.career_carries = 100.25), /career_carries/);
    expectReject((i) => (i.career_routes = 10.1), /career_routes/);
  });
});

describe('§26.4 reference-configuration validation', () => {
  it('rejects a non-empty reference array containing a non-finite member (no silent filtering)', () => {
    const reference = {
      ...DEFAULT_REFERENCE_DISTRIBUTIONS,
      carry_share: [NaN, ...DEFAULT_REFERENCE_DISTRIBUTIONS.carry_share],
    };
    expect(() => evaluateRunningBack(base(), { reference_distributions: reference })).toThrow(
      RBValidationError,
    );
    expect(() => validateReferenceDistributions(reference)).toThrow(/carry_share/);
  });

  it('accepts an absent/empty distribution (handled by the §26.4 neutral fallback path)', () => {
    const reference = { ...DEFAULT_REFERENCE_DISTRIBUTIONS, snap_share: [] };
    expect(() => validateReferenceDistributions(reference)).not.toThrow();
  });

  it('the bundled default reference table validates cleanly', () => {
    expect(() => validateReferenceDistributions(DEFAULT_REFERENCE_DISTRIBUTIONS)).not.toThrow();
  });
});

describe('§26.14 step 19 output validation', () => {
  it('every fixture output passes the declared-range validation the engine runs before returning', () => {
    // validateOutput throws on any out-of-range value; evaluateRunningBack calls
    // it internally, so a clean return already proves conformance. Re-run it on
    // the returned record to pin the invariant explicitly.
    const o = evaluateRunningBack(base());
    expect(() => validateOutput(o)).not.toThrow();
  });

  it('rejects a record with an out-of-range component', () => {
    const o = evaluateRunningBack(base());
    const broken = { ...o, components: { ...o.components, WRK: 140 } };
    expect(() => validateOutput(broken)).toThrow(RBValidationError);
  });

  it('rejects a record with a non-finite projection', () => {
    const o = evaluateRunningBack(base());
    const broken = { ...o, weekly: { ...o.weekly, expected_fantasy_points: Number.NaN } };
    expect(() => validateOutput(broken)).toThrow(RBValidationError);
  });
});

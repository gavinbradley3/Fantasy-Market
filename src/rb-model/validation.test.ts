// §26.16.10 / §10.2 input-definition & validation tests.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { RBValidationError, validateInput } from '@/rb-model/validation';
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
});

import { describe, expect, it } from 'vitest';
import { validateInput, WRValidationError } from '@/wr-model/validation';
import { evaluateWideReceiver } from '@/wr-model/engine';
import { loadFixture } from '@/wr-model/testutil';
import type { WRMVPInput } from '@/wr-model/types';

const base = (): WRMVPInput => loadFixture('elite-full-time');

describe('validation (§5)', () => {
  it('accepts a valid input', () => {
    expect(() => validateInput(base())).not.toThrow();
  });

  it('rejects missing player_id / player_name / age / expected_games_remaining / timestamp', () => {
    expect(() => validateInput({ ...base(), player_id: '' })).toThrow(WRValidationError);
    expect(() => validateInput({ ...base(), player_name: '' })).toThrow(WRValidationError);
    expect(() => validateInput({ ...base(), age: NaN })).toThrow(WRValidationError);
    expect(() => validateInput({ ...base(), expected_games_remaining: NaN })).toThrow(WRValidationError);
    expect(() => validateInput({ ...base(), as_of_timestamp: 'not-a-timestamp' })).toThrow(WRValidationError);
  });

  it('rejects negative career routes and negative expected games remaining', () => {
    expect(() => validateInput({ ...base(), career_routes: -1 })).toThrow(/career_routes/);
    expect(() => validateInput({ ...base(), expected_games_remaining: -3 })).toThrow(/expected_games_remaining/);
  });

  it('rejects rates outside 0–1 (CROE is exempt)', () => {
    expect(() => validateInput({ ...base(), target_share: 1.4 })).toThrow(/target_share/);
    expect(() => validateInput({ ...base(), route_participation_last4: -0.1 })).toThrow();
    // CROE may be negative.
    expect(() => validateInput({ ...base(), catch_rate_over_expected: -0.12 })).not.toThrow();
  });

  it('rejects non-finite numbers, invalid enums, and negative scoring', () => {
    expect(() => validateInput({ ...base(), projected_team_dropbacks: Infinity })).toThrow();
    expect(() => validateInput({ ...base(), injury_status: 'BROKEN' as never })).toThrow(/injury_status/);
    expect(() => validateInput({ ...base(), draft_round: 9 as never })).toThrow(/draft_round/);
    expect(() =>
      validateInput({ ...base(), scoring: { points_per_reception: -1, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } }),
    ).toThrow(/scoring/);
  });

  it('the engine throws (never fabricates output) on invalid input', () => {
    expect(() => evaluateWideReceiver({ ...base(), age: NaN })).toThrow(WRValidationError);
  });

  it('does not reject nullable model fields that have documented fallbacks', () => {
    expect(() =>
      validateInput({ ...base(), qb_environment_score: null, contract_security: null, target_share: null }),
    ).not.toThrow();
  });
});

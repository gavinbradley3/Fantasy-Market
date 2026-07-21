import { describe, expect, it } from 'vitest';
import {
  ENV_REFERENCE_CHECKSUM,
  ENV_REFERENCE_VERSION,
  loadEnvReference,
  verifyEnvReferenceChecksum,
} from '@/inference/registry/envReference';
import { pct, roundHalfAwayFromZero } from '@/inference/util/numeric';

describe('canonical AIL environment reference (REGISTRY §21)', () => {
  it('verifies the fixed checksum a1b95e93d706e130', () => {
    expect(ENV_REFERENCE_CHECKSUM).toBe('a1b95e93d706e130');
    expect(verifyEnvReferenceChecksum()).toBe(true);
  });

  it('loads all six components with the expected version', () => {
    const ref = loadEnvReference();
    expect(ref.reference_version).toBe(ENV_REFERENCE_VERSION);
    expect(ref.components.team_points_per_drive).toHaveLength(16);
    expect(ref.components.projected_team_dropbacks).toHaveLength(16);
    expect(ref.components.projected_team_non_qb_rush_attempts).toHaveLength(13);
    expect(ref.components.team_red_zone_trips_per_game).toHaveLength(12);
    expect(ref.components.adjusted_yards_per_attempt).toHaveLength(18);
    expect(ref.components.sack_rate).toHaveLength(18);
  });

  it('is position-independent: same array yields the Fx1 percentile', () => {
    const ref = loadEnvReference();
    const p = pct(2.05, ref.components.team_points_per_drive);
    expect(roundHalfAwayFromZero(p, 0)).toBe(53); // REGISTRY §22 Fx1
  });
});

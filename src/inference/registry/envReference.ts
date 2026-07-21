// Canonical AIL environment reference artifact `air-env-ref-1.0.0`
// (REGISTRY §21, F1 artifact).
//
// The artifact's canonical form is the exact JSON STRING below (the string printed
// in REGISTRY §22 Fx1). Its checksum was fixed against that literal string, in which
// floats render with a trailing ".0" (e.g. "4.0"). We therefore treat the string as
// the source of truth: the checksum is verified over the literal string, and the
// usable numeric arrays are obtained by parsing it. This avoids any dependence on
// host float-formatting (JSON.stringify would render 4.0 as "4").
//
// The arrays are position-INDEPENDENT: every position that percentiles a given
// component uses the same array (REGISTRY §20.F1).

import { digest } from '@/inference/util/checksum';

export const ENV_REFERENCE_VERSION = 'air-env-ref-1.0.0';
export const ENV_REFERENCE_CHECKSUM = 'a1b95e93d706e130';

/** The exact canonical serialization (REGISTRY §21 / §22 Fx1). Do not reformat. */
export const CANONICAL_ENV_REFERENCE_JSON =
  '{"adjusted_yards_per_attempt":[4.0,4.7,5.2,5.6,5.9,6.2,6.5,6.8,7.0,7.2,7.4,7.7,8.0,8.3,8.7,9.2,9.8,10.6],"projected_team_dropbacks":[27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42],"projected_team_non_qb_rush_attempts":[18,19,20,21,22,23,24,25,26,27,28,29,30],"reference_version":"air-env-ref-1.0.0","sack_rate":[0.025,0.035,0.042,0.048,0.054,0.06,0.066,0.072,0.078,0.084,0.091,0.099,0.108,0.118,0.13,0.145,0.165,0.2],"team_points_per_drive":[1.2,1.35,1.45,1.55,1.65,1.75,1.85,1.95,2.05,2.15,2.25,2.35,2.5,2.65,2.8,3.0],"team_red_zone_trips_per_game":[1.8,2.1,2.4,2.7,3.0,3.2,3.4,3.6,3.9,4.2,4.5,4.8]}';

/** The percentile components the AIL environment models reference (REGISTRY §21). */
export type EnvReferenceComponent =
  | 'adjusted_yards_per_attempt'
  | 'projected_team_dropbacks'
  | 'projected_team_non_qb_rush_attempts'
  | 'sack_rate'
  | 'team_points_per_drive'
  | 'team_red_zone_trips_per_game';

export interface EnvReference {
  readonly reference_version: string;
  readonly components: Readonly<Record<EnvReferenceComponent, readonly number[]>>;
}

interface RawEnvReference {
  readonly reference_version: string;
  readonly adjusted_yards_per_attempt: number[];
  readonly projected_team_dropbacks: number[];
  readonly projected_team_non_qb_rush_attempts: number[];
  readonly sack_rate: number[];
  readonly team_points_per_drive: number[];
  readonly team_red_zone_trips_per_game: number[];
}

/**
 * Parse and checksum-verify the canonical artifact. Throws if the embedded string
 * does not hash to the fixed checksum (tamper/typo guard) or if the version is
 * wrong. Returns the frozen, position-independent reference.
 */
export function loadEnvReference(): EnvReference {
  const actualChecksum = digest(CANONICAL_ENV_REFERENCE_JSON);
  if (actualChecksum !== ENV_REFERENCE_CHECKSUM) {
    throw new Error(
      `env reference checksum mismatch: expected ${ENV_REFERENCE_CHECKSUM}, got ${actualChecksum}`,
    );
  }
  const raw = JSON.parse(CANONICAL_ENV_REFERENCE_JSON) as RawEnvReference;
  if (raw.reference_version !== ENV_REFERENCE_VERSION) {
    throw new Error(
      `env reference version mismatch: expected ${ENV_REFERENCE_VERSION}, got ${raw.reference_version}`,
    );
  }
  return {
    reference_version: raw.reference_version,
    components: Object.freeze({
      adjusted_yards_per_attempt: Object.freeze(raw.adjusted_yards_per_attempt),
      projected_team_dropbacks: Object.freeze(raw.projected_team_dropbacks),
      projected_team_non_qb_rush_attempts: Object.freeze(raw.projected_team_non_qb_rush_attempts),
      sack_rate: Object.freeze(raw.sack_rate),
      team_points_per_drive: Object.freeze(raw.team_points_per_drive),
      team_red_zone_trips_per_game: Object.freeze(raw.team_red_zone_trips_per_game),
    }),
  };
}

/** Verify the artifact's integrity without materializing the parsed arrays. */
export function verifyEnvReferenceChecksum(): boolean {
  return digest(CANONICAL_ENV_REFERENCE_JSON) === ENV_REFERENCE_CHECKSUM;
}

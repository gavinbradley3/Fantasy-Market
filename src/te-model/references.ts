/**
 * Bundled Version 1 TE reference distributions and reference resolution
 * (Section 26.4 / 26.4.1).
 *
 * The arrays below are copied literally from the frozen specification. They are
 * provisional implementation constants for the deterministic hobby MVP — they are not
 * claimed to be fully calibrated empirical NFL distributions. They must remain unchanged
 * for reference_version "TE_REFERENCE_V1"; any replacement requires a new
 * reference_version, regenerated golden outputs, and documented release notes.
 */

import { REFERENCE_DISTRIBUTION_NAMES } from "./constants.js";
import { TEConfigurationError } from "./errors.js";
import type { TEReferenceDistributionName, TEReferenceDistributions } from "./types.js";

export const TE_MVP_V1_REFERENCE_DISTRIBUTIONS: Readonly<TEReferenceDistributions> =
  Object.freeze({
    reference_version: "TE_REFERENCE_V1",
    route_participation: Object.freeze([
      0.18, 0.24, 0.30, 0.36, 0.41, 0.46, 0.50, 0.54, 0.58,
      0.62, 0.66, 0.70, 0.73, 0.76, 0.79, 0.82, 0.85, 0.88
    ]),
    snap_share: Object.freeze([
      0.28, 0.36, 0.43, 0.50, 0.56, 0.61, 0.66, 0.70, 0.74,
      0.78, 0.81, 0.84, 0.87, 0.89, 0.91, 0.93, 0.95, 0.97
    ]),
    targets_per_route_run: Object.freeze([
      0.07, 0.09, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17,
      0.18, 0.19, 0.20, 0.21, 0.22, 0.24, 0.26, 0.28, 0.31
    ]),
    target_share: Object.freeze([
      0.025, 0.040, 0.055, 0.070, 0.082, 0.094, 0.105, 0.116, 0.127,
      0.138, 0.149, 0.160, 0.172, 0.185, 0.200, 0.218, 0.240, 0.270
    ]),
    average_depth_of_target: Object.freeze([
      2.5, 3.4, 4.2, 4.9, 5.5, 6.0, 6.5, 7.0, 7.4,
      7.8, 8.2, 8.7, 9.2, 9.8, 10.5, 11.3, 12.2, 13.5
    ]),
    red_zone_target_rate: Object.freeze([
      0.000, 0.020, 0.040, 0.060, 0.080, 0.100, 0.120, 0.140, 0.160,
      0.180, 0.200, 0.225, 0.250, 0.280, 0.315, 0.355, 0.400, 0.460
    ]),
    end_zone_target_rate: Object.freeze([
      0.000, 0.000, 0.010, 0.020, 0.030, 0.040, 0.050, 0.060, 0.070,
      0.080, 0.095, 0.110, 0.130, 0.150, 0.175, 0.205, 0.240, 0.290
    ]),
    catchable_target_rate: Object.freeze([
      0.58, 0.62, 0.65, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78,
      0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92, 0.94, 0.96
    ]),
    catch_rate: Object.freeze([
      0.48, 0.52, 0.55, 0.58, 0.60, 0.62, 0.64, 0.66, 0.68,
      0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.82, 0.85, 0.88
    ]),
    yards_per_target: Object.freeze([
      4.2, 4.8, 5.3, 5.8, 6.2, 6.6, 6.9, 7.2, 7.5,
      7.8, 8.1, 8.4, 8.8, 9.2, 9.7, 10.3, 11.0, 12.0
    ]),
    yards_per_reception: Object.freeze([
      7.2, 7.9, 8.5, 9.0, 9.4, 9.8, 10.1, 10.4, 10.7,
      11.0, 11.3, 11.7, 12.1, 12.6, 13.2, 13.9, 14.7, 15.8
    ]),
    yac_per_reception: Object.freeze([
      2.2, 2.6, 3.0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8,
      5.1, 5.4, 5.8, 6.2, 6.7, 7.2, 7.8, 8.5, 9.4
    ]),
    projected_team_dropbacks: Object.freeze([
      27.0, 28.5, 29.5, 30.5, 31.5, 32.5, 33.0, 33.5, 34.0,
      34.5, 35.0, 35.5, 36.0, 37.0, 38.0, 39.0, 40.5, 42.0
    ]),
    team_points_per_drive: Object.freeze([
      1.25, 1.40, 1.52, 1.62, 1.72, 1.80, 1.88, 1.96, 2.04,
      2.12, 2.20, 2.28, 2.38, 2.48, 2.60, 2.75, 2.92, 3.12
    ]),
    team_red_zone_trips_per_game: Object.freeze([
      2.0, 2.2, 2.4, 2.6, 2.8, 2.9, 3.0, 3.1, 3.2,
      3.3, 3.4, 3.5, 3.6, 3.8, 4.0, 4.2, 4.5, 4.8
    ]),
    expected_targets_per_game: Object.freeze([
      0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0,
      4.4, 4.8, 5.2, 5.7, 6.2, 6.8, 7.5, 8.3, 9.2
    ])
  });

/** Declared value domains used only to validate the bundled object (Section 26.4.1). */
const BUNDLED_DOMAINS: Readonly<
  Record<TEReferenceDistributionName, { min: number; max: number }>
> = Object.freeze({
  route_participation: { min: 0, max: 1 },
  snap_share: { min: 0, max: 1 },
  targets_per_route_run: { min: 0, max: 1 },
  target_share: { min: 0, max: 1 },
  average_depth_of_target: { min: -10, max: 30 },
  red_zone_target_rate: { min: 0, max: 1 },
  end_zone_target_rate: { min: 0, max: 1 },
  catchable_target_rate: { min: 0, max: 1 },
  catch_rate: { min: 0, max: 1 },
  yards_per_target: { min: 0, max: 30 },
  yards_per_reception: { min: 0, max: 40 },
  yac_per_reception: { min: 0, max: 20 },
  projected_team_dropbacks: { min: 0, max: 80 },
  team_points_per_drive: { min: 0, max: 7 },
  team_red_zone_trips_per_game: { min: 0, max: 10 },
  expected_targets_per_game: { min: 0, max: 20 },
});

/**
 * Validate the bundled reference object. Failure is a fatal engine-configuration error
 * (Section 26.4.1) and must never silently degrade to percentile 50.
 */
export function validateBundledReference(
  bundle: Readonly<TEReferenceDistributions>
): void {
  if (typeof bundle !== "object" || bundle === null) {
    throw new TEConfigurationError("bundled reference object is missing");
  }
  if (
    typeof bundle.reference_version !== "string" ||
    bundle.reference_version.trim().length === 0
  ) {
    throw new TEConfigurationError("bundled reference_version is empty");
  }
  for (const name of REFERENCE_DISTRIBUTION_NAMES) {
    const values = bundle[name];
    if (!Array.isArray(values)) {
      throw new TEConfigurationError(`bundled reference distribution ${name} is not an array`);
    }
    if (values.length === 0) {
      throw new TEConfigurationError(`bundled reference distribution ${name} is empty`);
    }
    const domain = BUNDLED_DOMAINS[name];
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new TEConfigurationError(
          `bundled reference distribution ${name}[${i}] is not finite`
        );
      }
      if (v < domain.min || v > domain.max) {
        throw new TEConfigurationError(
          `bundled reference distribution ${name}[${i}] is outside its declared domain`
        );
      }
      const prev = values[i - 1];
      if (i > 0 && typeof prev === "number" && v < prev) {
        throw new TEConfigurationError(
          `bundled reference distribution ${name} is not sorted ascending at index ${i}`
        );
      }
    }
  }
}

/**
 * Resolved per-evaluation reference: for each named distribution, the finite values to
 * use, or null when a caller-supplied runtime distribution is missing/invalid/empty
 * (Section 26.4 Runtime Reference-Object Validation).
 */
export interface ResolvedReference {
  reference_version: string;
  distributions: Readonly<Record<TEReferenceDistributionName, readonly number[] | null>>;
  missing: readonly TEReferenceDistributionName[];
}

export function resolveReference(
  custom: TEReferenceDistributions | undefined
): ResolvedReference {
  if (custom === undefined) {
    validateBundledReference(TE_MVP_V1_REFERENCE_DISTRIBUTIONS);
    const distributions = {} as Record<TEReferenceDistributionName, readonly number[] | null>;
    for (const name of REFERENCE_DISTRIBUTION_NAMES) {
      distributions[name] = TE_MVP_V1_REFERENCE_DISTRIBUTIONS[name];
    }
    return {
      reference_version: TE_MVP_V1_REFERENCE_DISTRIBUTIONS.reference_version.trim(),
      distributions,
      missing: [],
    };
  }

  const distributions = {} as Record<TEReferenceDistributionName, readonly number[] | null>;
  const missing: TEReferenceDistributionName[] = [];
  for (const name of REFERENCE_DISTRIBUTION_NAMES) {
    const raw: unknown = (custom as unknown as Record<string, unknown>)[name];
    if (Array.isArray(raw)) {
      const finite = raw.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v)
      );
      if (finite.length > 0) {
        distributions[name] = finite;
        continue;
      }
    }
    distributions[name] = null;
    missing.push(name);
  }
  return {
    reference_version: String(custom.reference_version).trim(),
    distributions,
    missing,
  };
}

/**
 * Exact reference median (Section 26.4 Reference Median). Does not mutate the input.
 * Returns null when the distribution has no finite values (caller then applies the fixed
 * secondary fallback for that canonical field).
 */
export function referenceMedian(values: readonly number[] | null): number | null {
  if (values === null) return null;
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) {
    return sorted[(n - 1) / 2] as number;
  }
  return ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
}

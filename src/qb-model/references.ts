/**
 * Binding Version 1 QB reference distributions and reference resolution
 * (Sections 26.4.2 / 26.4.3).
 *
 * The arrays below are copied literally from the frozen specification. They are
 * provisional fixture-grade Version 1 constants and are not claimed to be scientifically
 * calibrated. They must remain unchanged for reference_version "QB_REFERENCE_V1"; any
 * replacement requires a new reference_version and regenerated golden outputs.
 */

import {
  CUSTOM_REFERENCE_VERSION,
  REFERENCE_DISTRIBUTION_NAMES,
  REFERENCE_VERSION,
} from "./constants.js";
import { QBValidationError } from "./errors.js";
import type { QBReferenceDistributionName, QBReferenceDistributions } from "./types.js";

export const QB_MVP_V1_REFERENCE_DISTRIBUTIONS: Readonly<QBReferenceDistributions> =
  Object.freeze({
    active_game_pass_attempts: Object.freeze([
      20, 23, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 42, 45,
    ]),
    team_dropback_share: Object.freeze([
      0.45, 0.55, 0.64, 0.72, 0.78, 0.83, 0.87, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98,
      0.985, 0.99, 0.995, 1.0,
    ]),
    adjusted_yards_per_attempt: Object.freeze([
      4.0, 4.7, 5.2, 5.6, 5.9, 6.2, 6.5, 6.8, 7.0, 7.2, 7.4, 7.7, 8.0, 8.3, 8.7, 9.2, 9.8,
      10.6,
    ]),
    cpoe: Object.freeze([
      -0.1, -0.075, -0.055, -0.04, -0.03, -0.02, -0.01, -0.005, 0.0, 0.005, 0.01, 0.018,
      0.025, 0.033, 0.042, 0.055, 0.07, 0.095,
    ]),
    completion_rate: Object.freeze([
      0.5, 0.535, 0.56, 0.58, 0.595, 0.61, 0.62, 0.63, 0.64, 0.65, 0.66, 0.67, 0.68, 0.69,
      0.705, 0.72, 0.74, 0.77,
    ]),
    explosive_pass_rate: Object.freeze([
      0.045, 0.055, 0.065, 0.073, 0.08, 0.087, 0.094, 0.1, 0.106, 0.112, 0.118, 0.125,
      0.132, 0.14, 0.15, 0.162, 0.178, 0.2,
    ]),
    designed_rush_attempts_per_start: Object.freeze([
      0.0, 0.2, 0.4, 0.7, 1.0, 1.3, 1.7, 2.1, 2.5, 3.0, 3.5, 4.1, 4.8, 5.6, 6.5, 7.5, 8.8,
      10.5,
    ]),
    scrambles_per_start: Object.freeze([
      0.0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.4, 3.8, 4.3, 4.9, 5.6, 6.5,
      7.8,
    ]),
    rushing_yards_per_start: Object.freeze([
      0, 3, 6, 9, 12, 15, 18, 22, 26, 30, 35, 40, 46, 53, 61, 70, 82, 98,
    ]),
    goal_line_rush_attempts_per_start: Object.freeze([
      0.0, 0.03, 0.06, 0.1, 0.14, 0.18, 0.22, 0.27, 0.32, 0.38, 0.45, 0.53, 0.62, 0.73,
      0.86, 1.02, 1.22, 1.5,
    ]),
    offensive_environment_score: Object.freeze([
      20, 28, 34, 39, 43, 47, 50, 53, 56, 59, 62, 66, 70, 74, 79, 84, 90, 96,
    ]),
    protection_context_score: Object.freeze([
      20, 28, 34, 39, 43, 47, 50, 53, 56, 59, 62, 66, 70, 74, 79, 84, 90, 96,
    ]),
    interception_rate: Object.freeze([
      0.005, 0.008, 0.011, 0.014, 0.017, 0.019, 0.021, 0.023, 0.025, 0.027, 0.029, 0.032,
      0.035, 0.038, 0.042, 0.047, 0.055, 0.07,
    ]),
    sack_rate: Object.freeze([
      0.025, 0.035, 0.042, 0.048, 0.054, 0.06, 0.066, 0.072, 0.078, 0.084, 0.091, 0.099,
      0.108, 0.118, 0.13, 0.145, 0.165, 0.2,
    ]),
    passing_td_rate: Object.freeze([
      0.015, 0.022, 0.028, 0.033, 0.037, 0.041, 0.045, 0.049, 0.053, 0.057, 0.061, 0.066,
      0.071, 0.077, 0.084, 0.092, 0.103, 0.12,
    ]),
    recent_start_rate: Object.freeze([
      0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.84, 0.89, 0.93, 0.96, 0.98, 0.99, 1.0,
      1.0, 1.0,
    ]),
  });

export interface ResolvedReference {
  reference_version: "QB_REFERENCE_V1" | "CUSTOM";
  distributions: Readonly<QBReferenceDistributions>;
}

/**
 * Validate a caller-supplied custom reference object (Section 26.4.3). Invalid custom
 * references throw; they never fall back silently.
 */
export function validateCustomReference(custom: unknown): asserts custom is QBReferenceDistributions {
  if (typeof custom !== "object" || custom === null || Array.isArray(custom)) {
    throw new QBValidationError("reference_distributions must be a non-null object");
  }
  const record = custom as Record<string, unknown>;
  const allowed = new Set<string>(REFERENCE_DISTRIBUTION_NAMES as readonly string[]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new QBValidationError(`reference_distributions has unknown key: ${key}`);
    }
  }
  for (const name of REFERENCE_DISTRIBUTION_NAMES) {
    const raw = record[name];
    if (!Array.isArray(raw)) {
      throw new QBValidationError(`reference_distributions.${name} must be an array`);
    }
    if (raw.length < 2) {
      throw new QBValidationError(
        `reference_distributions.${name} must contain at least 2 numbers`
      );
    }
    for (let i = 0; i < raw.length; i += 1) {
      const v = raw[i];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new QBValidationError(`reference_distributions.${name}[${i}] is not finite`);
      }
      if (i > 0) {
        const prev = raw[i - 1] as number;
        if (!(prev < v)) {
          throw new QBValidationError(
            `reference_distributions.${name} must be strictly increasing at index ${i}`
          );
        }
      }
    }
  }
}

/**
 * Validate the bundled default distributions (Section 26.4.3 note). Bundled arrays may
 * contain repeated terminal values; they are only required to be sorted ascending.
 */
export function validateBundledReference(bundle: Readonly<QBReferenceDistributions>): void {
  for (const name of REFERENCE_DISTRIBUTION_NAMES) {
    const values = bundle[name];
    if (!Array.isArray(values) || values.length < 2) {
      throw new QBValidationError(`bundled reference ${name} is missing or too short`);
    }
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] as number;
      if (!Number.isFinite(v)) {
        throw new QBValidationError(`bundled reference ${name}[${i}] is not finite`);
      }
      if (i > 0 && (values[i - 1] as number) > v) {
        throw new QBValidationError(`bundled reference ${name} is not sorted ascending`);
      }
    }
  }
}

export function resolveReference(
  custom: QBReferenceDistributions | undefined
): ResolvedReference {
  if (custom === undefined) {
    return {
      reference_version: REFERENCE_VERSION,
      distributions: QB_MVP_V1_REFERENCE_DISTRIBUTIONS,
    };
  }
  validateCustomReference(custom);
  const distributions = {} as Record<QBReferenceDistributionName, readonly number[]>;
  for (const name of REFERENCE_DISTRIBUTION_NAMES) {
    distributions[name] = custom[name];
  }
  return {
    reference_version: CUSTOM_REFERENCE_VERSION,
    distributions: distributions as QBReferenceDistributions,
  };
}

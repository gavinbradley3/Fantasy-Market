// Infrastructure-level registry constants (REGISTRY §1, §11, §16, §20.F2).
//
// PHASE 1 SCOPE: only the cross-cutting constants consumed by the Phase-1
// frameworks (confidence scale/bands, aggregation weights, null-field confidence,
// precision policy, TTLs, versions). The FAMILY-specific constants — projection
// shrinkage Ks, role-ladder thresholds, competition/roster-security/environment
// coefficients, route/start guardrail values, per-field confidence penalties — are
// consumed only by later phases and are intentionally NOT declared here. They will
// be added alongside the phase that implements the corresponding model.

export const REGISTRY_VERSION = 'air-1.1.0';
export const INFERENCE_LAYER_VERSION = 'air-1.1.0';
export const AIL_SCHEMA_VERSION = 'air-report-1.0';

export const SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type RegistrySupportedPosition = (typeof SUPPORTED_POSITIONS)[number];

// --- Confidence scale & bands (REGISTRY §1, §11.4) ---
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 1000;
export const LOW_BAND = 600;
export const HIGH_BAND = 800;

// --- Player-confidence aggregation (REGISTRY §11.1, §17.1) ---
export const PLAYER_CONFIDENCE_FLOOR = 50;
export const PLAYER_CONFIDENCE_CAP = 1000;
/** ln-floor so a zero field confidence never produces ln(0) (REGISTRY §11.1). */
export const WGM_FLOOR_IN = 1;

/** Importance-weight tiers (REGISTRY §11.2). */
export const IMPORTANCE_WEIGHT = {
  critical: 3.0,
  standard: 1.0,
  minor: 0.5,
} as const;
export type ImportanceTier = keyof typeof IMPORTANCE_WEIGHT;

// --- Null / non-evaluable field confidence (REGISTRY §20.F2) ---
export const NULL_FIELD_CONFIDENCE = {
  INSUFFICIENT_DATA: 200,
  UNAVAILABLE: 100,
  NEUTRAL_DEFAULT: 400,
} as const;

// --- Public-confidence factor bounds (REGISTRY §11.3 / SPEC §16.2) ---
export const PUBLIC_FACTOR_BOUNDS = {
  coverage: { min: 0.5, max: 1.0 },
  quality: { min: 0.3, max: 1.0 },
  source: { min: 0.6, max: 1.0 },
} as const;
export const STALE_SOURCE_FRESHNESS = 0.7;

// --- Precision policy (REGISTRY §1.1) ---
export const PRECISION = {
  shareOrRate: 4,
  perGame: 2,
  score0to100: 0,
  expectedGames: 1,
  count: 0,
} as const;
export type PrecisionFamily = keyof typeof PRECISION;

// --- TTL & freshness registry (REGISTRY §16), in days ---
export interface TtlEntry {
  readonly ttlDays: number;
  readonly hardBoundDays: number;
}
export const TTL_REGISTRY = {
  // sources
  injuryPractice: { ttlDays: 7, hardBoundDays: 10 },
  weeklyStats: { ttlDays: 7, hardBoundDays: 14 },
  snaps: { ttlDays: 7, hardBoundDays: 14 },
  participation: { ttlDays: 7, hardBoundDays: 14 },
  schedule: { ttlDays: 45, hardBoundDays: 90 },
  rosters: { ttlDays: 10, hardBoundDays: 21 },
  transactions: { ttlDays: 10, hardBoundDays: 21 },
  contracts: { ttlDays: 180, hardBoundDays: 365 },
  // inference families
  availability: { ttlDays: 7, hardBoundDays: 10 },
  projections: { ttlDays: 7, hardBoundDays: 14 },
  roleCompetition: { ttlDays: 14, hardBoundDays: 28 },
  rosterSecurity: { ttlDays: 180, hardBoundDays: 365 },
  environment: { ttlDays: 14, hardBoundDays: 28 },
  routesStarts: { ttlDays: 30, hardBoundDays: 60 },
} as const satisfies Record<string, TtlEntry>;
export type TtlKey = keyof typeof TTL_REGISTRY;

// --- Explanation limits (REGISTRY §14) ---
export const EXPLANATION_POSITIVE_COUNT = 3;
export const EXPLANATION_NEGATIVE_COUNT = 3;
export const EXPLANATION_MIN_CONTRIB = 0.01;

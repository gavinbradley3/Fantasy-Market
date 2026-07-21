// Family-level numeric registry (REGISTRY §3–§10) — the single source of every
// Phase-2A coefficient, threshold, prior, band, clamp, penalty, and mapping.
// Implementation and test files import from here; they never embed the numbers.
//
// Values are transcribed verbatim from AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.md.
// Source tags (ENGINE_PRECEDENT / REPOSITORY_CONVENTION / FOOTBALL_RATIONALE /
// MVP_HEURISTIC) are noted per group in the registry document.

import type { InferenceProvenance } from '@/inference/types';

// ============================================================================
// §10 — field-confidence penalties (0..1000)
// ============================================================================

/** §10 p_provenance by AIL provenance. */
export const P_PROVENANCE: Readonly<Record<InferenceProvenance, number>> = {
  DERIVED: 0,
  PROXY: 120,
  MODEL_ESTIMATE: 80,
  MODEL_CLASSIFICATION: 60,
  FALLBACK: 100,
};

/** §10 p_recency by freshness state (3-state lifecycle, REGISTRY §20.F5). */
export const P_RECENCY = { FRESH: 0, STALE_USABLE: 60, UNUSABLE: 150 } as const;

/** §10 p_sample step: full 0; below-min 80; below-half-min 150. */
export const P_SAMPLE = { full: 0, belowMin: 80, belowHalfMin: 150 } as const;

/** §10 p_completeness: per missing required feature, capped. */
export const P_COMPLETENESS_PER = 40;
export const P_COMPLETENESS_CAP = 200;

/** §10 p_conflict / p_cross_season. */
export const P_CONFLICT = 80;
export const P_CONFLICT_SHARE_DELTA = 0.2;
export const P_CROSS_SEASON = 60;

/** §3 class penalties. */
export const P_CLASS_CATCHALL = 120;
/** §20.F4 reduced-signal role ladder penalty. */
export const P_CLASS_REDUCED = 80;

/** §10 p_model_error: unvalidated models are capped at this confidence. */
export const UNVALIDATED_CONF_CAP = 700;

/** §10 per-field minimum sample (coverage denominator), in games. */
export const MIN_SAMPLE_SHARES_GAMES = 4;
export const MIN_SAMPLE_TEAM_VOLUME_GAMES = 3;
export const MIN_SAMPLE_QB_ATTEMPTS_GAMES = 6;

// ============================================================================
// §3 — role classification thresholds
// ============================================================================

/** §3 global minimum-evidence gate. */
export const ROLE_MIN_GAMES_OBSERVED_L4 = 2;

/** §3.1 WR full-signal ladder. */
export const WR_ROLE = {
  alphaRoute: 0.85,
  alphaTargetShare: 0.24,
  highVolTargetShare: 0.2,
  highVolRoute: 0.75,
  slotRoute: 0.65,
  slotAdotMax: 8.0,
  stretchRoute: 0.55,
  stretchAdotMin: 13.0,
  secondaryRoute: 0.55,
  rotationalRoute: 0.3,
} as const;

/** §20.F4 WR reduced ladder (route_part null → target_share only). */
export const WR_ROLE_REDUCED = {
  highVolTargetShare: 0.24,
  secondaryTargetShare: 0.18,
  rotationalTargetShare: 0.1,
} as const;

/** §3.2 RB ladder. */
export const RB_ROLE = {
  leadSnap: 0.65,
  leadCarry: 0.6,
  committeeLeaderCarry: 0.55,
  receivingRoute: 0.5,
  receivingCarryMax: 0.4,
  goalLineShare: 0.5,
  goalLineSnapMax: 0.45,
  earlyDownCarry: 0.35,
  earlyDownSnapMax: 0.55,
  committeeSnap: 0.2,
  committeeCarry: 0.15,
} as const;

/** §3.3 TE ladder + prospect_type. */
export const TE_ROLE = {
  primaryRoute: 0.8,
  primaryTargetShare: 0.18,
  everyDownRoute: 0.75,
  everyDownSnap: 0.75,
  routeFirstRoute: 0.65,
  routeFirstBlockingGapMax: 0.05,
  blockingHeavySnap: 0.65,
  blockingHeavyRouteMax: 0.55,
  committeeSnap: 0.3,
} as const;

/** §20.F4 TE reduced ladder (route_part null). */
export const TE_ROLE_REDUCED = {
  everyDownSnap: 0.75,
  everyDownTargetShare: 0.16,
  primaryTargetShare: 0.14,
  blockingHeavySnap: 0.65,
  committeeSnap: 0.3,
} as const;

/** §3.3 prospect_type thresholds. */
export const TE_PROSPECT = {
  veteranMinCareerRoutes: 100,
  receivingBlockingGapMax: 0.1,
  receivingTprrMin: 0.18,
  blockingFirstBlockingGapMin: 0.25,
  blockingFirstRouteMax: 0.5,
} as const;

/** §3.4 QB role_status thresholds. */
export const QB_ROLE = {
  benchedWithinWeeks: 4,
  establishedStartRate: 0.9,
  establishedCareerStarts: 48,
  youngStartRate: 0.8,
  youngMaxSeasons: 4,
  coStarterSnapShare: 0.35,
  bridgeMinSeasons: 5,
} as const;

// ============================================================================
// §4 — competition pressure
// ============================================================================

/** §4.2 / §5.1 draft-tier weight (also DRAFT_TIER_SECURITY backbone differs, below). */
export const DRAFT_TIER_WEIGHT: Readonly<Record<string, number>> = {
  '1': 1.0,
  '2': 0.8,
  '3': 0.65,
  '4': 0.45,
  '5': 0.45,
  '6': 0.25,
  '7': 0.25,
  UDFA: 0.2,
};

export const COMPETITION = {
  kSquash: 3.0,
  posNorm: { WR: 0.9, RB: 0.7, TE: 0.55 } as Readonly<Record<'WR' | 'RB' | 'TE', number>>,
  recencyWindowWeeks: 8,
  recencyMultiplier: 1.25,
  useEffFloorFactor: 0.15,
  clampMin: 0.02,
  clampMax: 0.98,
} as const;

/** §4.4 public categories (lower-inclusive; boundary → higher). */
export const COMPETITION_CATEGORY_CUTS = { moderate: 0.25, elevated: 0.5, high: 0.75 } as const;

/** §4.3 flag thresholds. */
export const COMPETITION_FLAGS = {
  returnPriorUsage: 0.4,
  incomingWdc: 0.65,
  incomingPriorUsage: 0.4,
  anotherReceivingTeRoute: 0.5,
} as const;

/** §4.1 QB competition_pressure by role_status (ENGINE_PRECEDENT). */
export const COMPETITION_PRESSURE_BY_QB_ROLE: Readonly<Record<string, number>> = {
  ESTABLISHED_STARTER: 0.05,
  YOUNG_COMMITTED_STARTER: 0.1,
  ROOKIE_EXPECTED_STARTER: 0.15,
  BRIDGE_STARTER: 0.45,
  TEMPORARY_INJURY_REPLACEMENT: 0.7,
  COMPETITION: 0.75,
  RECENTLY_BENCHED: 0.9,
  BACKUP: 0.85,
};

// ============================================================================
// §5 — roster security
// ============================================================================

/** §5.1 DRAFT_TIER_SECURITY (ENGINE_PRECEDENT — TE CONTRACT_SECURITY_BY_ROUND). */
export const DRAFT_TIER_SECURITY: Readonly<Record<string, number>> = {
  '1': 1.0,
  '2': 0.82,
  '3': 0.65,
  '4': 0.45,
  '5': 0.45,
  '6': 0.26,
  '7': 0.26,
  UDFA: 0.2,
};

export const ROSTER_SECURITY = {
  yearsWithTeamCoef: 0.03,
  yearsWithTeamCap: 0.15,
  usageCoef: 0.15,
  negativeTxnBench: 0.25,
  negativeTxnIrChurn: 0.1,
  clampMin: 0.05,
  clampMax: 0.95,
} as const;

/** §5.1 EXPERIENCE_ADJ additive by age band (ENGINE_PRECEDENT — WR RD_AGE_SECURITY). */
export function experienceAdj(age: number): number {
  if (age <= 25) return 0.0;
  if (age <= 28) return 0.0;
  if (age <= 30) return -0.05;
  return -0.1;
}

/** §5.3 categories (lower-inclusive; boundary → higher). */
export const ROSTER_SECURITY_CATEGORY_CUTS = { medium: 0.4, high: 0.7 } as const;

/** §5.2 QB organizational_commitment maps (ENGINE_PRECEDENT). */
export const DRAFT_COMMITMENT_BY_ROUND: Readonly<Record<string, number>> = {
  '1': 0.9,
  '2': 0.72,
  '3': 0.58,
  '4': 0.45,
  '5': 0.35,
  '6': 0.28,
  '7': 0.22,
  UDFA: 0.18,
};
export const ROLE_COMMITMENT_BY_QB_ROLE: Readonly<Record<string, number>> = {
  ESTABLISHED_STARTER: 0.92,
  YOUNG_COMMITTED_STARTER: 0.95,
  ROOKIE_EXPECTED_STARTER: 0.88,
  BRIDGE_STARTER: 0.45,
  TEMPORARY_INJURY_REPLACEMENT: 0.25,
  COMPETITION: 0.48,
  RECENTLY_BENCHED: 0.25,
  BACKUP: 0.2,
};
export const ORG_COMMITMENT_BLEND = { draft: 0.5, role: 0.5 } as const;

// ============================================================================
// §6 — offensive / QB environment
// ============================================================================

export const ENV_WEIGHTS = {
  offensive: {
    team_points_per_drive: 0.5,
    projected_team_dropbacks: 0.25,
    team_red_zone_trips_per_game: 0.25,
  },
  qb: {
    adjusted_yards_per_attempt: 0.4,
    projected_team_dropbacks: 0.2,
    sack_rate_inverse: 0.2,
    starter_stability: 0.2,
  },
} as const;

export const ENV_ROOKIE_STARTER_STABILITY_PRIOR = 60;

// ============================================================================
// §7 — availability & expected games
// ============================================================================

/** §7.1 Table A — per-remaining-game availability probability. */
export const AVAIL_PROB = {
  HEALTHY: 0.97,
  QUESTIONABLE_FULL: 0.85,
  QUESTIONABLE_LIMITED: 0.65,
  QUESTIONABLE_DNP_UNKNOWN: 0.45,
  DOUBTFUL: 0.2,
  OUT: 0.3,
  IR: 0.05,
  PUP: 0.05,
  SUSPENDED_KNOWN_REINSTATED: 0.97,
  SUSPENDED_UNKNOWN: 0.0,
  FREE_AGENT: 0.1,
  PRACTICE_SQUAD: 0.15,
  RECENTLY_ACTIVATED: 0.85,
} as const;

/** §7.2 expected games. */
export const EXPECTED_GAMES = {
  durabilityCoef: 0.5,
  durabilityMin: 0.85,
  durabilityMax: 1.0,
  missedRateWindowGames: 16,
} as const;

/** §7.3 probability_active (QB) by injury status (ENGINE_PRECEDENT). */
export const ACTIVE_PROBABILITY_BY_INJURY: Readonly<Record<string, number>> = {
  HEALTHY: 0.99,
  QUESTIONABLE: 0.75,
  DOUBTFUL: 0.2,
  OUT: 0.0,
  IR: 0.0,
  PUP: 0.0,
};

/** §7.4 RB workload_ramp_factor from the TE ramp table (ENGINE_PRECEDENT). */
export const WORKLOAD_RAMP = {
  HEALTHY: 1.0,
  QUESTIONABLE_FULL: 0.9,
  QUESTIONABLE_LIMITED: 0.8,
  QUESTIONABLE_DNP_UNKNOWN: 0.7,
  DOUBTFUL: 0.6,
  INACTIVE_LIST: 0.0,
  UNKNOWN_STATUS: 0.8,
} as const;

/** §7.5 RB high_recent_workload_flag threshold (touches/game over l4). */
export const HIGH_RECENT_WORKLOAD_TOUCHES = 22;

// ============================================================================
// §20.F11 — feature-extraction constants
// ============================================================================

export const FEATURE = {
  acquiredWithinDays: 56, // "≤ 8 weeks"
} as const;

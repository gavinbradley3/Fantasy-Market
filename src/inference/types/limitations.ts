// Automated Inference Layer — stable limitation/assumption codes.
//
// These are the fixed string codes SPEC/REGISTRY attach to inferred fields. Phase 1
// only declares the vocabulary; the logic that ATTACHES a code lives in later
// phases. Codes are drawn verbatim from the specification and numeric registry so
// two implementations emit identical strings.

export const LIMITATION_CODES = {
  // REGISTRY §20.F3 — enum/bool emitted as its authorized neutral member.
  NEUTRAL_DEFAULT: 'NEUTRAL_DEFAULT',
  // REGISTRY §20.F5 — value kept past its TTL (stale but usable).
  STALE: 'STALE',
  // REGISTRY §20.F4 — role assigned from a reduced (null-primary-signal) ladder.
  REDUCED_SIGNAL_ROLE: 'REDUCED_SIGNAL_ROLE',
  // REGISTRY §9 / §20 — QB starts inferred, not official.
  INFERRED_START_NOT_OFFICIAL: 'INFERRED_START_NOT_OFFICIAL',
  // REGISTRY §8 — route exposure produced via a proxy/model estimate.
  ROUTE_PROXY: 'ROUTE_PROXY',
  // REGISTRY §20.F6 — suspension handling.
  SUSPENSION: 'SUSPENSION',
  SUSPENSION_LENGTH_UNKNOWN: 'SUSPENSION_LENGTH_UNKNOWN',
  // REGISTRY §9 — reduced roster-security model, not true contract data.
  NOT_TRUE_CONTRACT_DATA: 'NOT_TRUE_CONTRACT_DATA',
  TRUE_CONTRACT_DATA: 'TRUE_CONTRACT_DATA',
  // REGISTRY §20.F11 — prior-season team could not be determined.
  PRIOR_TEAM_UNKNOWN: 'PRIOR_TEAM_UNKNOWN',
  // REGISTRY §20.F11 — postseason games excluded from windows/career (V1).
  POSTSEASON_EXCLUDED: 'POSTSEASON_EXCLUDED',
  // REGISTRY §10 — model has no completed validation; confidence capped.
  UNVALIDATED_MODEL: 'UNVALIDATED_MODEL',
  // SPEC §10.2 — QB environment computed under starter uncertainty.
  QB_UNCERTAIN: 'QB_UNCERTAIN',
  // SPEC §11.4 — no reliable return date; bounded availability prior used.
  RETURN_TIMELINE_UNKNOWN: 'RETURN_TIMELINE_UNKNOWN',
  // REGISTRY §28.4 — exceptional incident override applied.
  INCIDENT_OVERRIDE: 'INCIDENT_OVERRIDE',
  // SPEC §25.1 step 2 — a fact dated after `asOf` was excluded before inference.
  FUTURE_FACT_EXCLUDED: 'FUTURE_FACT_EXCLUDED',
} as const;

export type LimitationCode = (typeof LIMITATION_CODES)[keyof typeof LIMITATION_CODES];

export const LIMITATION_CODE_VALUES: readonly LimitationCode[] = Object.values(LIMITATION_CODES);

export function isLimitationCode(value: string): value is LimitationCode {
  return (LIMITATION_CODE_VALUES as readonly string[]).includes(value);
}

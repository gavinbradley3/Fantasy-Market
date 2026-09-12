// PlayerTicker's shared cross-position dynasty utility layer.
//
// It sits ABOVE the four position engines and imports none of them. Engines produce
// within-position standing; this layer converts standing into marginal utility above the
// replacement player the league format implies, which is the only thing comparable across
// positions. The raw composites stay internal, exactly as every position spec requires.

export {
  DYNASTY_1QB_12,
  DYNASTY_SUPERFLEX_12,
  UTILITY_POSITIONS,
  validateSchema,
  type LeagueSchema,
  type LineupSlot,
  type SlotAllocation,
  type UtilityPosition,
} from './leagueSchema';
export { derivedSupply, replacementTable, type PositionDemand } from './replacement';
export {
  ageRunway,
  curveDepth,
  effectiveSupply,
  productionAtRank,
  validateProductionReference,
  PRODUCTION_CURVE,
  ProductionCurveError,
  type GeneratedProductionReference,
  type GeneratedPositionCurve,
} from './productionCurve';
export { PPR_SCORING, SCORING_RULES, scoreStatLine, type ScoringRules } from './scoring';
export {
  computeUtilityBoard,
  rankUtilityBoard,
  DEPTH,
  type UtilityBoard,
  type UtilityInput,
  type UtilityResult,
  type ValueSource,
} from './dynastyValue';

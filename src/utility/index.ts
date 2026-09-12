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
export { replacementTable, standing, type PositionDemand } from './replacement';
export {
  computeUtilityBoard,
  rankUtilityBoard,
  type UtilityBoard,
  type UtilityInput,
  type UtilityResult,
} from './dynastyValue';

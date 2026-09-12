// Fantasy scoring, as versioned data.
//
// The production curve this layer values players against is a curve of FANTASY POINTS, so the
// scoring rules are part of the valuation's definition rather than an implementation detail. A
// league that awards half a point per reception has a different receiver curve, a different
// replacement level and therefore different values; burying the rules in the generator would
// hide that.
//
// A generated curve records the id of the rules it was built under, and the utility layer
// refuses to value a schema against a curve built under different rules (see
// `assertScoringMatches`). That check is the reason these ids exist.

/** The stat line one player produced in one game — the input to a scoring rule set. */
export interface ScoringStatLine {
  readonly passingYards: number | null;
  readonly passingTds: number | null;
  readonly interceptions: number | null;
  readonly rushingYards: number | null;
  readonly rushingTds: number | null;
  readonly receptions: number | null;
  readonly receivingYards: number | null;
  readonly receivingTds: number | null;
}

export interface ScoringRules {
  readonly id: string;
  readonly label: string;
  readonly perPassingYard: number;
  readonly perPassingTd: number;
  readonly perInterception: number;
  readonly perRushingYard: number;
  readonly perRushingTd: number;
  readonly perReception: number;
  readonly perReceivingYard: number;
  readonly perReceivingTd: number;
}

/**
 * Full-PPR, the dynasty default.
 *
 * FUMBLES ARE ABSENT, not zeroed by choice: the provider's weekly player-stats resource that
 * PlayerTicker ingests carries no fumble column, so there is nothing to score. The omission is
 * worth roughly −0.2 points per game for a high-volume back and is the same for every player
 * at a position, so it shifts a position's curve fractionally and its RANKING not at all.
 */
export const PPR_SCORING: ScoringRules = Object.freeze({
  id: 'ppr-1.0',
  label: 'Full PPR',
  perPassingYard: 0.04,
  perPassingTd: 4,
  perInterception: -2,
  perRushingYard: 0.1,
  perRushingTd: 6,
  perReception: 1,
  perReceivingYard: 0.1,
  perReceivingTd: 6,
});

export const SCORING_RULES: Readonly<Record<string, ScoringRules>> = Object.freeze({
  [PPR_SCORING.id]: PPR_SCORING,
});

/** A missing stat contributes nothing. It is never read as a zero the provider asserted. */
function n(v: number | null): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function scoreStatLine(line: ScoringStatLine, rules: ScoringRules = PPR_SCORING): number {
  return (
    n(line.passingYards) * rules.perPassingYard +
    n(line.passingTds) * rules.perPassingTd +
    n(line.interceptions) * rules.perInterception +
    n(line.rushingYards) * rules.perRushingYard +
    n(line.rushingTds) * rules.perRushingTd +
    n(line.receptions) * rules.perReception +
    n(line.receivingYards) * rules.perReceivingYard +
    n(line.receivingTds) * rules.perReceivingTd
  );
}

// The market engine — pure functions, config-driven (§12, §40.1/§40.2).
// The SAME functions run at three call sites with zero drift (§29.3):
//   1. building the mock history,
//   2. the runtime demo tick,
//   3. (future) scheduled live recalculation.
// Nothing here reads component state, the DOM, or the clock — everything is a
// function of its inputs and the config file.

import {
  AGE_CURVE_INFLECTION,
  CONFIDENCE,
  FUNDAMENTAL_WEIGHTS,
  INJURY_MULTIPLIER,
  MARKET_VALUE,
  MISPRICING_K,
  RISK_WEIGHTS,
  SF_QB_PREMIUM,
  SIGNAL_HYSTERESIS,
  SIGNAL_RULES,
  VOLATILITY,
  ageCurveMultiplier,
} from '@/config/market';
import type {
  AssetClass,
  Confidence,
  FormatParts,
  MarketTagId,
  Position,
  RiskKey,
  SignalId,
} from '@/types/market';

// ---------- Engine inputs ----------
// The normalized sub-scores authored per player (§12.1), each 0–100. In the MVP
// these come from the mock pool; in a future live build they arrive from the
// ingestion pipeline through the same shape.
export interface SubScores {
  production: number;
  usage: number;
  opportunity: number;
  efficiency: number;
  roleSecurity: number;
  offense: number;
  sentiment: number;
}

export interface EngineInputs extends SubScores {
  position: Position;
  age: number;
  status: string; // active | questionable | ir_short | ir_long | suspended
  isRookie: boolean;
  positionalRank: number; // pre-computed rank within position (for scarcity)
  // Structural volatility prior inputs (0–100).
  tdDependence: number;
  injuryHistory: number;
  hype: number; // hype level for meme/hype tags and risk
  gamesPlayed: number;
}

// ---------- 12.2 Fundamental value ----------

export function fundamentalRaw(s: SubScores, isDynasty: boolean): number {
  const w = FUNDAMENTAL_WEIGHTS[isDynasty ? 'dynasty' : 'redraft'];
  return (
    w.production * s.production +
    w.usage * s.usage +
    w.opportunity * s.opportunity +
    w.efficiency * s.efficiency +
    w.roleSecurity * s.roleSecurity +
    w.offense * s.offense
  );
}

export function injuryMultiplier(status: string): number {
  return INJURY_MULTIPLIER[status] ?? 1.0;
}

// Superflex startable-QB scarcity premium (§12.7). Applied before percentile
// ranking so elite QBs rise to the top of the pool in SF.
export function scarcityMultiplier(position: Position, parts: FormatParts): number {
  if (position === 'QB' && parts.qb === 'sf') return SF_QB_PREMIUM;
  return 1.0;
}

// The raw adjusted fundamental, pre-percentile. The percentile step happens
// across the whole pool in the dataset builder.
export function fundamentalAdjusted(inp: EngineInputs, parts: FormatParts): number {
  const isDynasty = parts.league === 'dynasty';
  const raw = fundamentalRaw(inp, isDynasty);
  return (
    raw *
    ageCurveMultiplier(inp.position, inp.age, isDynasty) *
    injuryMultiplier(inp.status) *
    scarcityMultiplier(inp.position, parts)
  );
}

// percentileRank(value, pool) × 100 — converts arbitrary raw units into the
// stable, self-calibrating 0–100 index (§12.2).
export function percentileRank(value: number, sortedAscending: number[]): number {
  const n = sortedAscending.length;
  if (n === 0) return 50;
  let below = 0;
  for (const v of sortedAscending) {
    if (v < value) below++;
    else break;
  }
  // Midpoint convention keeps identical values from hitting exactly 0 or 100.
  return Math.max(0, Math.min(100, (below / n) * 100));
}

// ---------- 12.3 Market value recurrence ----------
// Sticky and sentiment-contaminated by design — drifts toward fundamentals but
// overshoots on hype, which is what makes mispricing a real quantity.
export function marketStep(
  prevMarketValue: number,
  fundamentalValue: number,
  sentiment: number,
  catalystImpulse: number,
  noise: number,
): number {
  const next =
    MARKET_VALUE.stickiness * prevMarketValue +
    MARKET_VALUE.fundamentalPull * fundamentalValue +
    MARKET_VALUE.sentimentPull * sentiment +
    catalystImpulse +
    noise;
  return clamp(next, 0, 100);
}

// ---------- 12.6 Mispricing ----------
export function mispricing(fundamentalValue: number, marketValue: number): number {
  return clamp(MISPRICING_K * (fundamentalValue - marketValue), -100, 100);
}

// ---------- 11.6 Volatility ----------
// Normalized std dev of daily price changes over the window, blended 70/30 with
// a structural prior so thin samples aren't shown as falsely calm.
export function structuralVolatilityPrior(inp: EngineInputs): number {
  const roleInstability = 100 - inp.roleSecurity;
  const prior =
    0.45 * inp.tdDependence + 0.3 * roleInstability + 0.25 * inp.injuryHistory;
  return clamp(prior, 0, 100);
}

export function volatilityFromSeries(dailyChanges: number[], inp: EngineInputs): number {
  let realized = 0;
  if (dailyChanges.length > 1) {
    const mean = dailyChanges.reduce((a, b) => a + b, 0) / dailyChanges.length;
    const variance =
      dailyChanges.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyChanges.length;
    const std = Math.sqrt(variance);
    // A daily std dev of ~2.5 price points maps to the top of the scale.
    realized = clamp((std / 2.5) * 100, 0, 100);
  }
  const prior = structuralVolatilityPrior(inp);
  let vol = VOLATILITY.historyBlend * realized + VOLATILITY.priorBlend * prior;
  if (inp.isRookie) vol = Math.max(vol, VOLATILITY.rookieFloor);
  return Math.round(clamp(vol, 0, 100));
}

// ---------- 11.7 Risk ----------
export function ageRisk(position: Position, age: number): number {
  const inflection = AGE_CURVE_INFLECTION[position];
  if (age >= inflection + 1) return clamp(60 + (age - inflection) * 8, 0, 100);
  if (age >= inflection - 1) return 55;
  if (age <= 22) return 20;
  return clamp(30 + (age - 22) * 4, 0, 100);
}

export function riskBreakdown(inp: EngineInputs): Record<RiskKey, number> {
  const injury = clamp(0.6 * inp.injuryHistory + (inp.status !== 'active' ? 40 : 0), 0, 100);
  const role = clamp(100 - inp.roleSecurity, 0, 100);
  const age = ageRisk(inp.position, inp.age);
  const offense = clamp(100 - inp.offense, 0, 100);
  const efficiency = clamp(0.5 * inp.tdDependence + 0.5 * (100 - inp.efficiency), 0, 100);
  const hype = clamp(inp.hype, 0, 100);
  return {
    injury: Math.round(injury),
    role: Math.round(role),
    age: Math.round(age),
    offense: Math.round(offense),
    efficiency: Math.round(efficiency),
    hype: Math.round(hype),
  };
}

export function riskComposite(breakdown: Record<RiskKey, number>): number {
  const composite =
    RISK_WEIGHTS.injury * breakdown.injury +
    RISK_WEIGHTS.role * breakdown.role +
    RISK_WEIGHTS.age * breakdown.age +
    RISK_WEIGHTS.offense * breakdown.offense +
    RISK_WEIGHTS.efficiency * breakdown.efficiency +
    RISK_WEIGHTS.hype * breakdown.hype;
  return Math.round(clamp(composite, 0, 100));
}

// ---------- 12.9 Confidence ----------
export function confidenceScore(
  inp: EngineInputs,
  volatility: number,
  ageDays: number,
): number {
  const sampleTerm = inp.isRookie ? 20 : clamp(inp.gamesPlayed * 6, 0, 60);
  const stabilityTerm = clamp(60 - volatility * 0.4, 0, 60);
  let score = clamp(sampleTerm + stabilityTerm, 0, 100);
  // Freshness caps (§12.9).
  if (ageDays > CONFIDENCE.staleLowDays) score = Math.min(score, CONFIDENCE.lowMax - 1);
  else if (ageDays > CONFIDENCE.staleMediumDays) score = Math.min(score, CONFIDENCE.highMin);
  // Rookies hard-capped at Low; demo data never claims High.
  if (inp.isRookie) score = Math.min(score, CONFIDENCE.rookieCap - 1);
  score = Math.min(score, CONFIDENCE.demoGlobalCap);
  return Math.round(score);
}

export function confidenceBandFromScore(score: number): Confidence {
  if (score < CONFIDENCE.lowMax) return 'low';
  if (score > CONFIDENCE.highMin) return 'high';
  return 'medium';
}

// ---------- 11.4 Asset class ----------
export function assignAssetClass(args: {
  price: number;
  volatility: number;
  roleSecurity: number;
  age: number;
  production: number;
  momentum30: number;
  opportunityRising: boolean;
  isRookie: boolean;
}): AssetClass {
  if (args.isRookie) return 'rookie_ipo';
  if (args.price >= 85 && args.volatility <= 40 && args.roleSecurity >= 80) return 'blue_chip';
  if (args.price < 20) return 'penny_stock';
  if (args.volatility >= 70) return 'volatile_asset';
  if (args.age >= 29 && args.production >= 70 && args.volatility <= 45) return 'dividend_veteran';
  if (args.age <= 25 && args.momentum30 > 0 && args.opportunityRising) return 'growth_stock';
  return 'standard_asset';
}

// ---------- 11.4 Market tags ----------
export function assignTags(args: {
  mispricing: number;
  momentum30: number;
  momentum30Pct: number;
  accelerating: boolean;
  opportunity: number;
  tdDependence: number;
  hype: number;
  sentiment: number;
  production: number;
  position: Position;
  qbFormatSf: boolean;
  status: string;
  offense: number;
  age: number;
  ageInflection: number;
}): MarketTagId[] {
  const tags: MarketTagId[] = [];
  if (args.mispricing >= 20 && args.momentum30 < 0) tags.push('buy_low_window');
  if (args.status !== 'active' && args.mispricing > 0) tags.push('injury_discount');
  if (args.mispricing <= -25) tags.push('overheated');
  if (args.momentum30Pct <= -15 && args.accelerating) tags.push('falling_knife');
  if (args.tdDependence >= 70) tags.push('touchdown_bubble');
  if (args.opportunity >= 90) tags.push('volume_king');
  if (args.age >= args.ageInflection - 1) tags.push('age_cliff');
  if (args.sentiment - args.production >= 22) tags.push('meme_stock');
  if (args.hype >= 70 && args.mispricing < 0) tags.push('hype_stock');
  if (args.momentum30 > 4 && args.opportunity >= 70) tags.push('breakout_watch');
  if (args.position !== 'QB' && args.offense <= 40) tags.push('qb_downgrade');
  // Cap at three most salient (§11.4). Ordering above prioritizes actionable tags.
  return tags.slice(0, 3);
}

// ---------- 12.10 Signal assignment ----------
export function assignSignal(args: {
  mispricing: number;
  risk: number;
  volatility: number;
  confidence: Confidence;
  previousSignalMispricing?: number;
}): { signal: SignalId; ruleFired: string } {
  // Hysteresis: if a prior mispricing exists and the change is within the band,
  // evaluate against the damped value to prevent daily flip-flopping (§12.10).
  let effective = args.mispricing;
  if (
    args.previousSignalMispricing !== undefined &&
    Math.abs(args.mispricing - args.previousSignalMispricing) <= SIGNAL_HYSTERESIS
  ) {
    effective = args.previousSignalMispricing;
  }
  const ctx = {
    mispricing: effective,
    risk: args.risk,
    volatility: args.volatility,
    confidenceLow: args.confidence === 'low',
  };
  const rule = SIGNAL_RULES.find((r) => r.test(ctx))!;
  return { signal: rule.signal, ruleFired: rule.id };
}

// ---------- utils ----------
export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// config/market.ts — the single source of truth for the market engine (§40.2).
// Every weight, threshold, curve, and rule from DESIGN.md §12 lives here. The
// Methodology page imports and renders this same object, so the documentation
// on the site cannot drift from the behavior of the engine.

import type { FormatKey, FormatParts, Position, SignalId } from '@/types/market';

export const TEMPLATE_VERSION = 'thesis-tpl-v1';
export const FORMULA_VERSION = 'market-v1.0';

// The demo tick's canonical "market open". DESIGN.md §39.5 recommends UTC 06:00.
export const TICK_HOUR_UTC = 6;

// ---------- Formats (§12.7, §13) ----------
export const FORMATS: Record<FormatKey, { label: string; short: string; parts: FormatParts }> = {
  dyn_sf_half: {
    label: 'Dynasty · Superflex · Half-PPR',
    short: 'DYN · SF · 0.5',
    parts: { league: 'dynasty', qb: 'sf', scoring: 'half' },
  },
  dyn_sf_ppr: {
    label: 'Dynasty · Superflex · PPR',
    short: 'DYN · SF · PPR',
    parts: { league: 'dynasty', qb: 'sf', scoring: 'ppr' },
  },
  dyn_1qb_half: {
    label: 'Dynasty · 1QB · Half-PPR',
    short: 'DYN · 1QB · 0.5',
    parts: { league: 'dynasty', qb: '1qb', scoring: 'half' },
  },
  rd_sf_half: {
    label: 'Redraft · Superflex · Half-PPR',
    short: 'RD · SF · 0.5',
    parts: { league: 'redraft', qb: 'sf', scoring: 'half' },
  },
  rd_1qb_half: {
    label: 'Redraft · 1QB · Half-PPR',
    short: 'RD · 1QB · 0.5',
    parts: { league: 'redraft', qb: '1qb', scoring: 'half' },
  },
  rd_1qb_ppr: {
    label: 'Redraft · 1QB · PPR',
    short: 'RD · 1QB · PPR',
    parts: { league: 'redraft', qb: '1qb', scoring: 'ppr' },
  },
};

export const DEFAULT_FORMAT: FormatKey = 'dyn_sf_half';
export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

// ---------- Fundamental value weights (§12.2) ----------
// w1 Production · w2 Usage · w3 Opportunity · w4 Efficiency · w5 RoleSecurity
// · w6 OffensiveEnvironment. Weights sum to 1.0 within each league type.
export const FUNDAMENTAL_WEIGHTS: Record<'dynasty' | 'redraft', {
  production: number;
  usage: number;
  opportunity: number;
  efficiency: number;
  roleSecurity: number;
  offense: number;
}> = {
  dynasty: {
    production: 0.25,
    usage: 0.15,
    opportunity: 0.2,
    efficiency: 0.1,
    roleSecurity: 0.2,
    offense: 0.1,
  },
  redraft: {
    production: 0.35,
    usage: 0.15,
    opportunity: 0.2,
    efficiency: 0.1,
    roleSecurity: 0.15,
    offense: 0.05,
  },
};

// ---------- Market value recurrence (§12.3) ----------
export const MARKET_VALUE = {
  stickiness: 0.8, // weight on yesterday's market value
  fundamentalPull: 0.15, // drift toward fundamentals
  sentimentPull: 0.05, // hype contamination
};

// ---------- Mispricing (§12.6) ----------
export const MISPRICING_K = 2.5;

// ---------- Signal hysteresis (§12.10) ----------
export const SIGNAL_HYSTERESIS = 3;

// ---------- Age curves (§12.8) ----------
// Position-specific value multiplier by age. Applied to fundamentals in dynasty
// only (1.0 in redraft). Inflection points: RB ~27, WR ~30, TE ~31, QB ~36.
export const AGE_CURVE_INFLECTION: Record<Position, number> = {
  RB: 27,
  WR: 30,
  TE: 31,
  QB: 36,
};

export function ageCurveMultiplier(position: Position, age: number, isDynasty: boolean): number {
  if (!isDynasty) return 1.0; // age irrelevant to now-value
  const inflection = AGE_CURVE_INFLECTION[position];
  if (age <= inflection - 3) return 1.0 + Math.min(0.08, (inflection - 3 - age) * 0.02);
  if (age <= inflection) return 1.0;
  // Decline past the cliff, a touch steeper for RBs. Floors keep proven vets as
  // real (discounted) assets rather than crushing them to near-zero.
  const perYear = position === 'RB' ? 0.07 : position === 'TE' ? 0.055 : 0.05;
  const floor = position === 'RB' ? 0.5 : 0.55;
  return Math.max(floor, 1.0 - (age - inflection) * perYear);
}

// ---------- Injury multipliers (§12.2) ----------
export const INJURY_MULTIPLIER: Record<string, number> = {
  active: 1.0,
  questionable: 0.85,
  ir_short: 0.6,
  ir_long: 0.35,
  suspended: 0.7,
};

// ---------- Scarcity: Superflex QB premium (§12.7) ----------
// In Superflex, startable QBs get a scarcity boost so elite QBs become top-5
// overall assets, matching real market behavior.
// Superflex startable-QB premium. Applied to QB fundamentals before percentile
// ranking so elite QBs become top-of-board assets in SF — but tuned so premier
// WRs/RBs still sit alongside them rather than being swept out of the top tier.
export const SF_QB_PREMIUM = 1.14;

// ---------- Volatility (§11.6) ----------
export const VOLATILITY = {
  historyBlend: 0.7, // weight on realized daily-change std dev
  priorBlend: 0.3, // structural prior (TD dependence, role, injury history)
  rookieFloor: 60, // §12.8 rookies floored at 60
  bands: [
    { max: 29, label: 'Low' },
    { max: 54, label: 'Medium' },
    { max: 74, label: 'High' },
    { max: 100, label: 'Extreme' },
  ],
};

// ---------- Risk composite weights (§11.7) ----------
export const RISK_WEIGHTS: Record<'injury' | 'role' | 'age' | 'offense' | 'efficiency' | 'hype', number> = {
  injury: 0.25,
  role: 0.25,
  age: 0.15,
  offense: 0.15,
  efficiency: 0.1,
  hype: 0.1,
};

// ---------- Confidence (§12.9) ----------
export const CONFIDENCE = {
  lowMax: 40, // < 40 => Low
  highMin: 70, // > 70 => High
  demoGlobalCap: 70, // Demo Market never claims High (§12.9)
  rookieCap: 40, // rookies hard-capped at Low until 4 NFL games (§12.8)
  staleMediumDays: 7, // > 7d capped Medium
  staleLowDays: 21, // > 21d capped Low + warning
};

// ---------- Market price interpretive bands (§11.2) ----------
export const PRICE_BANDS = [
  { min: 90, label: 'Elite fantasy asset (top ~5 overall)' },
  { min: 80, label: 'Premium asset (clear top-15 value)' },
  { min: 65, label: 'Strong starter-level asset' },
  { min: 45, label: 'Solid contributor / flex asset' },
  { min: 25, label: 'Speculative / bench asset' },
  { min: 0, label: 'Deep stash / minimal market value' },
];

// ---------- Mispricing bands (§11.8) ----------
export const MISPRICING_BANDS = [
  { min: 30, label: 'Significantly undervalued' },
  { min: 15, label: 'Undervalued' },
  { min: 6, label: 'Slightly undervalued' },
  { min: -5, label: 'Fairly priced' },
  { min: -14, label: 'Slightly overheated' },
  { min: -29, label: 'Overheated' },
  { min: -100, label: 'Overpriced / value trap' },
];

// ---------- Data freshness (§14.2) ----------
export const FRESHNESS = {
  freshHours: 24,
  recentDays: 7,
  staleDays: 21,
};

// ---------- Signal rule table (§12.10) ----------
// Evaluated in order; first match wins. `id` is stored as ruleFired for
// auditability. Kept declarative so the Methodology page can render it verbatim.
export interface SignalRule {
  id: string;
  signal: SignalId;
  description: string;
  test: (m: { mispricing: number; risk: number; volatility: number; confidenceLow: boolean }) => boolean;
}

// NOTE ON RULE ORDER (deliberate reconciliation of a DESIGN.md conflict):
// The §12.10 table lists Buy before Speculative Buy, but the §11.5 prose defines
// Speculative Buy as the honest label for positive-mispricing lottery tickets
// ("high volatility OR low confidence"). Under the literal table order, a
// low-confidence buy with low risk always resolves to plain "Buy", making
// Speculative Buy nearly unreachable and violating §5's "no fake certainty"
// principle. We therefore evaluate Speculative Buy immediately before Buy so a
// Low-confidence positive-mispricing call is honestly labeled speculative. All
// thresholds are unchanged from §12.10.
export const SIGNAL_RULES: SignalRule[] = [
  {
    id: 'S1',
    signal: 'strong_buy',
    description: 'Mispricing ≥ +25 AND risk ≤ 60',
    test: (m) => m.mispricing >= 25 && m.risk <= 60,
  },
  {
    id: 'B2',
    signal: 'speculative_buy',
    description: 'Mispricing ≥ +12 AND (risk > 70 OR confidence Low)',
    test: (m) => m.mispricing >= 12 && (m.risk > 70 || m.confidenceLow),
  },
  {
    id: 'B1',
    signal: 'buy',
    description: 'Mispricing ≥ +12 AND risk ≤ 70',
    test: (m) => m.mispricing >= 12 && m.risk <= 70,
  },
  {
    id: 'A1',
    signal: 'avoid',
    description: 'Mispricing ≤ −25 AND risk ≥ 65',
    test: (m) => m.mispricing <= -25 && m.risk >= 65,
  },
  {
    id: 'SS1',
    signal: 'strong_sell',
    description: 'Mispricing ≤ −25',
    test: (m) => m.mispricing <= -25,
  },
  {
    id: 'SL1',
    signal: 'sell',
    description: 'Mispricing ≤ −12',
    test: (m) => m.mispricing <= -12,
  },
  {
    id: 'M1',
    signal: 'monitor',
    description: '|Mispricing| < 12 AND volatility ≥ 70',
    test: (m) => Math.abs(m.mispricing) < 12 && m.volatility >= 70,
  },
  {
    id: 'H1',
    signal: 'hold',
    description: 'Otherwise',
    test: () => true,
  },
];

export const SIGNAL_META: Record<SignalId, { label: string; tone: 'up' | 'down' | 'neutral' }> = {
  strong_buy: { label: 'Strong Buy', tone: 'up' },
  buy: { label: 'Buy', tone: 'up' },
  speculative_buy: { label: 'Speculative Buy', tone: 'up' },
  hold: { label: 'Hold', tone: 'neutral' },
  monitor: { label: 'Monitor', tone: 'neutral' },
  sell: { label: 'Sell', tone: 'down' },
  strong_sell: { label: 'Strong Sell', tone: 'down' },
  avoid: { label: 'Avoid', tone: 'down' },
};

// Data models — the contracts the mock service and any future live service both
// implement (DESIGN.md §27). These are load-bearing: the UI reads only these
// shapes, never the mock internals.

export type Position = 'QB' | 'RB' | 'WR' | 'TE';

export type PlayerStatus = 'active' | 'injured' | 'suspended' | 'inactive';

// ---------- Identity ----------
export interface PlayerIdentity {
  internal_id: string; // "pt_0042" — system of record, never changes
  sleeper_id?: string;
  gsis_id?: string;
  espn_id?: string;
  name_normalized: string; // lowercase, diacritics stripped, suffixes removed
  aliases: string[];
}

export interface Player {
  identity: PlayerIdentity;
  displayName: string;
  ticker: string; // unique, 3 chars
  position: Position;
  team: string; // "DET" — plain text abbreviation, no marks
  age: number;
  yearsExperience: number;
  status: PlayerStatus;
  isRookie: boolean;
  avatarSeed: string;
}

// ---------- Formats ----------
// Ship six combos; default dyn_sf_half (§12.7, §13).
export type FormatKey =
  | 'dyn_sf_half'
  | 'dyn_sf_ppr'
  | 'dyn_1qb_half'
  | 'rd_sf_half'
  | 'rd_1qb_half'
  | 'rd_1qb_ppr';

export type Dynasty = 'dynasty' | 'redraft';
export type QbFormat = 'sf' | '1qb';
export type Scoring = 'half' | 'ppr';

export interface FormatParts {
  league: Dynasty;
  qb: QbFormat;
  scoring: Scoring;
}

// ---------- Market ----------
export type AssetClass =
  | 'blue_chip'
  | 'growth_stock'
  | 'rookie_ipo'
  | 'dividend_veteran'
  | 'volatile_asset'
  | 'penny_stock'
  | 'standard_asset';

export type MarketTagId =
  | 'meme_stock'
  | 'falling_knife'
  | 'overheated'
  | 'buy_low_window'
  | 'injury_discount'
  | 'age_cliff'
  | 'breakout_watch'
  | 'volume_king'
  | 'touchdown_bubble'
  | 'role_spike'
  | 'hype_stock'
  | 'contract_fog'
  | 'qb_downgrade';

export type SignalId =
  | 'strong_buy'
  | 'buy'
  | 'speculative_buy'
  | 'hold'
  | 'monitor'
  | 'sell'
  | 'strong_sell'
  | 'avoid';

export type Confidence = 'low' | 'medium' | 'high';

export type DataMode = 'demo' | 'live' | 'mixed';

export type RiskKey = 'injury' | 'age' | 'role' | 'offense' | 'efficiency' | 'hype';

export interface Movement {
  d1: number;
  d7: number;
  d30: number;
  season: number;
  allTime: number;
}

export interface PlayerMarketSnapshot {
  playerId: string;
  format: FormatKey;
  date: string; // daily close, ISO date
  marketPrice: number; // 0–100, 1 decimal
  fundamentalValue: number; // "Model Value"
  mispricing: number; // −100..+100
  overallRank: number;
  positionRank: number;
  movement: Movement;
  volatility: number; // 0–100
  riskScore: number; // composite 0–100
  riskBreakdown: Record<RiskKey, number>;
  assetClass: AssetClass;
  tags: MarketTagId[];
  confidence: number; // 0–100 internal; banded in UI
  lastUpdated: string; // ISO timestamp
  dataMode: DataMode;
  snapshotHash: string;
}

export interface PlayerMarketHistoryPoint {
  date: string;
  marketPrice: number;
  fundamentalValue: number;
}

export interface MarketSignal {
  playerId: string;
  format: FormatKey;
  signal: SignalId;
  confidence: Confidence;
  explanation: string;
  supportingFactors: string[];
  riskFactors: string[];
  ruleFired: string; // which §12.10 rule — auditability
  lastUpdated: string;
}

export type CatalystDirection = 'bullish' | 'bearish';
export type CatalystMagnitude = 'minor' | 'moderate' | 'major';

export interface MarketCatalyst {
  id: string;
  playerId: string;
  type: string; // controlled vocabulary, §11.9
  direction: CatalystDirection;
  magnitude: CatalystMagnitude;
  date: string;
  headline: string; // ≤ 12 words
  detail: string;
  affectedScores: string[];
  sourceNote: 'authored_demo' | 'ingested' | 'admin';
}

export interface RiskFactor {
  playerId: string;
  type: RiskKey;
  score: number;
  headline: string;
  detail: string;
}

// ---------- Stats ----------
export interface PlayerStatsSeason {
  playerId: string;
  season: number;
  games: number;
  ppg: Record<'ppr' | 'half', number>;
  snapPct?: number;
  targetShare?: number;
  carryShare?: number;
  redZoneShare?: number;
  totalTds?: number;
  isMock: boolean;
}

export interface PlayerStatsGameLog {
  playerId: string;
  season: number;
  week: number;
  opponent: string;
  fantasyPoints: Record<'ppr' | 'half', number>;
  keyLine: string;
  isMock: boolean;
}

// ---------- Thesis ----------
export interface MarketThesis {
  playerId: string;
  format: FormatKey;
  generator: 'template' | 'ai';
  templateVersion: string;
  valueSummary: string;
  whyMoving: string;
  bullCase: string;
  bearCase: string;
  verdict: string;
  confidence: Confidence;
  insufficientData: boolean;
}

// ---------- User-side (local storage in MVP) ----------
export interface WatchlistItem {
  playerId: string;
  addedAt: string;
  priceAtAdd: number;
  formatAtAdd: FormatKey;
}

export interface PortfolioHolding {
  playerId: string;
  addedAt: string;
  priceAtAdd: number;
}

// ---------- System ----------
export interface DataSourceStatus {
  sourceId: string;
  label: string;
  mode: 'mock' | 'live' | 'disabled';
  lastSuccessfulUpdate?: string;
  coverage: string;
  health: 'ok' | 'degraded' | 'down';
}

// ---------- Composite view models the UI consumes ----------

// Everything the Stock Card needs, assembled by the data service.
export interface PlayerDetail {
  player: Player;
  snapshot: PlayerMarketSnapshot;
  signal: MarketSignal;
  catalysts: MarketCatalyst[];
  riskFactors: RiskFactor[];
  thesis: MarketThesis;
  seasonStats: PlayerStatsSeason;
  gameLog: PlayerStatsGameLog[];
  formatNotes: string[];
}

// Board / mover row.
export interface PlayerRow {
  player: Player;
  snapshot: PlayerMarketSnapshot;
  signal: MarketSignal;
  topCatalyst?: MarketCatalyst;
  spark: number[]; // 30-day market price series for sparkline
}

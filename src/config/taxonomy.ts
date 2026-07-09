// Asset-class and market-tag definitions (§11.4). Each carries the plain-language
// definition and the rule that triggers it, so tooltips and the Methodology page
// render from one source.

import type { AssetClass, MarketTagId } from '@/types/market';

export interface ClassDef {
  id: AssetClass;
  label: string;
  definition: string;
}

// Order matters: classes are mutually exclusive and assigned first-match in
// engine.assignAssetClass.
export const ASSET_CLASSES: ClassDef[] = [
  {
    id: 'rookie_ipo',
    label: 'Rookie IPO',
    definition: 'Rookie season, no NFL sample yet. Priced on draft capital and landing spot; confidence capped Low.',
  },
  {
    id: 'blue_chip',
    label: 'Blue Chip',
    definition: 'Price ≥ 85, volatility ≤ 40, role security ≥ 80. The stability shelf.',
  },
  {
    id: 'penny_stock',
    label: 'Penny Stock',
    definition: 'Market price below 20. Deep stash with minimal current market value.',
  },
  {
    id: 'volatile_asset',
    label: 'Volatile Asset',
    definition: 'Volatility ≥ 70. Value swings week to week; a start/sit trust question.',
  },
  {
    id: 'dividend_veteran',
    label: 'Dividend Veteran',
    definition: 'Age ≥ 29 with production ≥ 70 and volatility ≤ 45. Reliable output, limited upside.',
  },
  {
    id: 'growth_stock',
    label: 'Growth Stock',
    definition: 'Age ≤ 25 with positive 30-day momentum and rising opportunity. Value compounding.',
  },
  {
    id: 'standard_asset',
    label: 'Standard Asset',
    definition: 'Does not currently fit another class. A solid, unremarkable market profile.',
  },
];

export const CLASS_BY_ID: Record<AssetClass, ClassDef> = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c.id, c]),
) as Record<AssetClass, ClassDef>;

export interface TagDef {
  id: MarketTagId;
  label: string;
  definition: string;
  tone: 'up' | 'down' | 'neutral';
}

export const MARKET_TAGS: TagDef[] = [
  {
    id: 'buy_low_window',
    label: 'Buy-Low Window',
    definition: 'Positive mispricing (≥ +20) after negative 30-day movement — the market may be overcorrecting.',
    tone: 'up',
  },
  {
    id: 'breakout_watch',
    label: 'Breakout Watch',
    definition: 'Rising opportunity and momentum suggest a role or production leap may be underway.',
    tone: 'up',
  },
  {
    id: 'volume_king',
    label: 'Volume King',
    definition: 'Opportunity score ≥ 90 — elite target or carry share regardless of efficiency.',
    tone: 'up',
  },
  {
    id: 'role_spike',
    label: 'Role Spike',
    definition: 'A recent catalyst sharply increased snap share or usage.',
    tone: 'up',
  },
  {
    id: 'injury_discount',
    label: 'Injury Discount',
    definition: 'An injury has pushed market price below model value — a potential buy-the-dip case.',
    tone: 'up',
  },
  {
    id: 'overheated',
    label: 'Overheated',
    definition: 'Mispricing ≤ −25 — the market price runs well ahead of the underlying profile.',
    tone: 'down',
  },
  {
    id: 'falling_knife',
    label: 'Falling Knife',
    definition: '30-day movement ≤ −15% and accelerating. Decline may not be finished.',
    tone: 'down',
  },
  {
    id: 'touchdown_bubble',
    label: 'Touchdown Bubble',
    definition: 'Touchdown rate far above expected — production likely to regress.',
    tone: 'down',
  },
  {
    id: 'age_cliff',
    label: 'Age Cliff',
    definition: 'Within a year of the position-specific age inflection where value tends to fall.',
    tone: 'down',
  },
  {
    id: 'qb_downgrade',
    label: 'QB Downgrade',
    definition: 'A weaker quarterback environment caps this pass-catcher’s ceiling.',
    tone: 'down',
  },
  {
    id: 'meme_stock',
    label: 'Meme Stock',
    definition: 'Sentiment far exceeds production — price driven by hype more than usage.',
    tone: 'neutral',
  },
  {
    id: 'hype_stock',
    label: 'Hype Stock',
    definition: 'A recent hype surge is lifting the market price ahead of the fundamentals.',
    tone: 'neutral',
  },
  {
    id: 'contract_fog',
    label: 'Contract Fog',
    definition: 'Contract or role uncertainty clouds the medium-term outlook.',
    tone: 'neutral',
  },
];

export const TAG_BY_ID: Record<MarketTagId, TagDef> = Object.fromEntries(
  MARKET_TAGS.map((t) => [t.id, t]),
) as Record<MarketTagId, TagDef>;

// Position glyph metadata (§21.4).
export const POSITION_META: Record<string, { label: string; className: string }> = {
  QB: { label: 'QB', className: 'text-pos-qb border-pos-qb/50 bg-pos-qb/10' },
  RB: { label: 'RB', className: 'text-pos-rb border-pos-rb/50 bg-pos-rb/10' },
  WR: { label: 'WR', className: 'text-pos-wr border-pos-wr/50 bg-pos-wr/10' },
  TE: { label: 'TE', className: 'text-pos-te border-pos-te/50 bg-pos-te/10' },
};

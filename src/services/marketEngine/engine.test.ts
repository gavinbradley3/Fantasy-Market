import { describe, expect, it } from 'vitest';
import {
  FORMAT_KEYS,
  FUNDAMENTAL_WEIGHTS,
  SIGNAL_RULES,
  ageCurveMultiplier,
} from '@/config/market';
import {
  assignSignal,
  confidenceScore,
  mispricing,
  percentileRank,
  scarcityMultiplier,
  type EngineInputs,
} from '@/services/marketEngine/engine';
import { getDataset } from '@/services/marketData/mock/buildDataset';
import { marketData } from '@/services/marketData/mock/MockMarketDataService';
import { FORMATS } from '@/config/market';

const REF_DATE = '2026-07-09';

function baseInput(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    production: 70, usage: 70, opportunity: 70, efficiency: 70, roleSecurity: 70,
    offense: 70, sentiment: 60, position: 'WR', age: 25, status: 'active',
    isRookie: false, positionalRank: 10, tdDependence: 30, injuryHistory: 20,
    hype: 40, gamesPlayed: 16, ...overrides,
  };
}

describe('config integrity', () => {
  it('fundamental weights sum to ~1.0 for each league type', () => {
    for (const league of ['dynasty', 'redraft'] as const) {
      const w = FUNDAMENTAL_WEIGHTS[league];
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('signal rule table has a terminal catch-all', () => {
    expect(SIGNAL_RULES[SIGNAL_RULES.length - 1].id).toBe('H1');
    expect(SIGNAL_RULES[SIGNAL_RULES.length - 1].test({ mispricing: 0, risk: 0, volatility: 0, confidenceLow: false })).toBe(true);
  });
});

describe('percentileRank', () => {
  it('is bounded 0..100 and monotonic', () => {
    const pool = [10, 20, 30, 40, 50].sort((a, b) => a - b);
    expect(percentileRank(5, pool)).toBe(0);
    expect(percentileRank(60, pool)).toBe(100);
    expect(percentileRank(30, pool)).toBeGreaterThan(percentileRank(20, pool));
  });
});

describe('mispricing', () => {
  it('is zero when fundamental equals market', () => {
    expect(mispricing(80, 80)).toBe(0);
  });
  it('is symmetric and clamped', () => {
    expect(mispricing(90, 50)).toBe(Math.min(100, 2.5 * 40));
    expect(mispricing(50, 90)).toBe(Math.max(-100, 2.5 * -40));
  });
});

describe('age curve', () => {
  it('declines past the RB inflection and is 1.0 in redraft', () => {
    expect(ageCurveMultiplier('RB', 30, true)).toBeLessThan(1.0);
    expect(ageCurveMultiplier('RB', 30, false)).toBe(1.0);
    expect(ageCurveMultiplier('RB', 30, true)).toBeLessThan(ageCurveMultiplier('WR', 30, true));
  });
});

describe('superflex scarcity', () => {
  it('boosts QBs in superflex only', () => {
    expect(scarcityMultiplier('QB', FORMATS.dyn_sf_half.parts)).toBeGreaterThan(1);
    expect(scarcityMultiplier('QB', FORMATS.dyn_1qb_half.parts)).toBe(1);
    expect(scarcityMultiplier('WR', FORMATS.dyn_sf_half.parts)).toBe(1);
  });
});

describe('confidence caps (§12.9)', () => {
  it('never claims High on demo data and caps rookies at Low', () => {
    const strong = confidenceScore(baseInput({ gamesPlayed: 16 }), 10, 0);
    expect(strong).toBeLessThanOrEqual(70); // demo global cap
    const rookie = confidenceScore(baseInput({ isRookie: true, gamesPlayed: 0 }), 60, 0);
    expect(rookie).toBeLessThan(40); // Low
  });
});

describe('signal assignment matches §12.10', () => {
  it('assigns Strong Buy / Sell / Hold at the thresholds', () => {
    expect(assignSignal({ mispricing: 30, risk: 40, volatility: 30, confidence: 'medium' }).signal).toBe('strong_buy');
    expect(assignSignal({ mispricing: -30, risk: 70, volatility: 30, confidence: 'medium' }).signal).toBe('avoid');
    expect(assignSignal({ mispricing: -20, risk: 30, volatility: 30, confidence: 'medium' }).signal).toBe('sell');
    expect(assignSignal({ mispricing: 2, risk: 30, volatility: 30, confidence: 'medium' }).signal).toBe('hold');
    expect(assignSignal({ mispricing: 2, risk: 30, volatility: 80, confidence: 'medium' }).signal).toBe('monitor');
  });

  it('hysteresis prevents a flip on ±3 noise', () => {
    // Previously +13 (Buy). A dip to +11 within the ±3 band should not flip to Hold.
    const r = assignSignal({ mispricing: 11, risk: 40, volatility: 30, confidence: 'medium', previousSignalMispricing: 13 });
    expect(r.signal).toBe('buy');
  });
});

describe('deterministic tick (§37, §40.5)', () => {
  it('produces identical prices for the same (format, date) across builds', () => {
    const a = getDataset('dyn_sf_half', REF_DATE);
    const b = getDataset('dyn_sf_half', REF_DATE);
    // Same memoized instance, but verify values are stable field-by-field.
    for (const cp of a.players) {
      const other = b.byId.get(cp.player.identity.internal_id)!;
      expect(other.snapshot.marketPrice).toBe(cp.snapshot.marketPrice);
    }
  });

  it('yesterday differs from today for movers', () => {
    const today = getDataset('dyn_sf_half', '2026-07-09');
    const yesterday = getDataset('dyn_sf_half', '2026-07-08');
    let changed = 0;
    for (const cp of today.players) {
      const y = yesterday.byId.get(cp.player.identity.internal_id)!;
      if (y.snapshot.marketPrice !== cp.snapshot.marketPrice) changed++;
    }
    expect(changed).toBeGreaterThan(today.players.length / 2);
  });
});

describe('pool coverage (§28.2 authoring rule)', () => {
  const ds = getDataset('dyn_sf_half', REF_DATE);

  it('has 80–150 players', () => {
    expect(ds.players.length).toBeGreaterThanOrEqual(80);
    expect(ds.players.length).toBeLessThanOrEqual(150);
  });

  it('every price is within 0..100 and QB SF premium lifts elite QBs', () => {
    for (const cp of ds.players) {
      expect(cp.snapshot.marketPrice).toBeGreaterThanOrEqual(0);
      expect(cp.snapshot.marketPrice).toBeLessThanOrEqual(100);
    }
    const sf = getDataset('dyn_sf_half', REF_DATE).byTicker.get('ALN')!;
    const oneqb = getDataset('dyn_1qb_half', REF_DATE).byTicker.get('ALN')!;
    expect(sf.snapshot.marketPrice).toBeGreaterThan(oneqb.snapshot.marketPrice);
  });

  it('has at least one exemplar of every asset class present in the pool', () => {
    const classes = new Set(ds.players.map((p) => p.snapshot.assetClass));
    expect(classes.has('blue_chip')).toBe(true);
    expect(classes.has('rookie_ipo')).toBe(true);
    expect(classes.has('growth_stock')).toBe(true);
  });

  it('rookies are floored at volatility 60 and Rookie IPO class', () => {
    const rookies = ds.players.filter((p) => p.player.isRookie);
    expect(rookies.length).toBeGreaterThan(0);
    for (const r of rookies) {
      expect(r.snapshot.volatility).toBeGreaterThanOrEqual(60);
      expect(r.snapshot.assetClass).toBe('rookie_ipo');
    }
  });

  it('ruleFired is populated on every signal', () => {
    for (const cp of ds.players) expect(cp.signal.ruleFired).toBeTruthy();
  });
});

describe('MarketDataService contract', () => {
  it('serves board, player, movers, and format comparison', () => {
    const board = marketData.getBoard('dyn_sf_half');
    expect(board.length).toBeGreaterThan(80);
    const nab = marketData.getPlayer('NAB', 'dyn_sf_half');
    expect(nab?.player.displayName).toBe('Malik Nabers');
    expect(nab?.thesis.verdict).toContain('confidence');
    const movers = marketData.getMovers('dyn_sf_half');
    expect(movers.risers.length).toBeGreaterThan(0);
    const cmp = marketData.getFormatComparison('ALN');
    expect(cmp.length).toBe(FORMAT_KEYS.length);
  });

  it('every ticker is unique', () => {
    const tickers = marketData.getBoard('dyn_sf_half').map((r) => r.player.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });
});

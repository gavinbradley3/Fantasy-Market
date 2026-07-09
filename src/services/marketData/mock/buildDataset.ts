// The dataset builder — runs the pure market engine over the authored pool and
// event calendar to produce the full Demo Market for a given (format, date).
//
// Determinism (§11.11, §40.5): every value is a function of (playerId seed, date)
// and the config — no server, no clock reads beyond the `today` argument. Two
// machines computing the same (format, date) get byte-identical prices. Results
// are memoized per (format, date).
//
// This is the SINGLE place the engine and the mock inputs meet. Components never
// import from here — they go through MarketDataService (§29.3, §40.3).

import { DEFAULT_FORMAT, FORMATS, FORMULA_VERSION, AGE_CURVE_INFLECTION } from '@/config/market';
import { POOL, type PlayerSeed, type SeedCatalyst } from '@/data/pool';
import { gaussian, hashString, seededRandom } from '@/lib/prng';
import { isoDate } from '@/lib/format';
import {
  assignAssetClass,
  assignSignal,
  assignTags,
  clamp,
  confidenceBandFromScore,
  confidenceScore,
  fundamentalAdjusted,
  marketStep,
  mispricing as calcMispricing,
  percentileRank,
  riskBreakdown,
  riskComposite,
  structuralVolatilityPrior,
  volatilityFromSeries,
  type EngineInputs,
} from '@/services/marketEngine/engine';
import type {
  FormatKey,
  MarketCatalyst,
  MarketSignal,
  Player,
  PlayerMarketHistoryPoint,
  PlayerMarketSnapshot,
  RiskFactor,
  RiskKey,
  SignalId,
} from '@/types/market';
import { SIGNAL_META } from '@/config/market';

const HISTORY_DAYS = 150; // walk length; guarantees ≥120 days of chart history
// Persistent sentiment shift a catalyst imprints, by magnitude (§12.3 sentiment term).
const CATALYST_SENTIMENT: Record<string, number> = { minor: 3, moderate: 6, major: 10 };
const NOISE_SCALE = 0.035; // daily noise as a fraction of structural volatility

export interface ComputedPlayer {
  player: Player;
  input: EngineInputs;
  fundamentalValue: number;
  history: PlayerMarketHistoryPoint[];
  snapshot: PlayerMarketSnapshot;
  signal: MarketSignal;
  catalysts: MarketCatalyst[];
  riskFactors: RiskFactor[];
  seed: PlayerSeed;
}

export interface Dataset {
  format: FormatKey;
  date: string;
  players: ComputedPlayer[];
  byTicker: Map<string, ComputedPlayer>;
  byId: Map<string, ComputedPlayer>;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function seedToPlayer(seed: PlayerSeed, index: number): Player {
  const id = `pt_${String(index + 1).padStart(4, '0')}`;
  return {
    identity: {
      internal_id: id,
      name_normalized: normalizeName(seed.name),
      aliases: [],
    },
    displayName: seed.name,
    ticker: seed.ticker,
    position: seed.pos,
    team: seed.team,
    age: seed.age,
    yearsExperience: seed.exp,
    status: seed.status && seed.status !== 'active' ? 'injured' : 'active',
    isRookie: !!seed.rookie,
    avatarSeed: seed.ticker,
  };
}

function seedToInput(seed: PlayerSeed): EngineInputs {
  return {
    production: seed.prod,
    usage: seed.usage,
    opportunity: seed.opp,
    efficiency: seed.eff,
    roleSecurity: seed.role,
    offense: seed.off,
    sentiment: 0, // derived per-format below
    position: seed.pos,
    age: seed.age,
    status: seed.status ?? 'active',
    isRookie: !!seed.rookie,
    positionalRank: 0,
    tdDependence: seed.td,
    injuryHistory: seed.inj,
    hype: seed.hype,
    gamesPlayed: seed.games,
  };
}

// Sentiment at a given day = today's baseline minus the persistent effect of any
// catalyst dated AFTER that day. Walking forward, each catalyst nudges sentiment
// toward the baseline, producing a realistic repricing arc that TODAY resolves
// exactly to the authored target mispricing.
function sentimentAt(dayOffset: number, baselineSentiment: number, cats: SeedCatalyst[]): number {
  let s = baselineSentiment;
  for (const c of cats) {
    // c.daysAgo is the offset from today (0 = today). dayOffset is negative-going
    // into the past. A catalyst is "after" day t if -c.daysAgo > dayOffset.
    if (-c.daysAgo > dayOffset) {
      s -= (c.dir === 'bullish' ? 1 : -1) * CATALYST_SENTIMENT[c.mag];
    }
  }
  return clamp(s, 0, 100);
}

const SIGNAL_EXPLANATIONS: Record<SignalId, string> = {
  strong_buy: 'The market appears to be significantly underpricing this asset relative to its underlying profile.',
  buy: 'The market price is lagging the underlying profile — a value gap worth acting on.',
  speculative_buy: 'A positive value gap, but elevated risk or a thin sample keeps this a lottery-ticket bet.',
  hold: 'Market price and model value are broadly in line; no clear edge either way right now.',
  monitor: 'Fairly priced but volatile — watch for a catalyst before acting.',
  sell: 'The market price runs ahead of the underlying profile; consider selling into the strength.',
  strong_sell: 'The market price is well ahead of the fundamentals — a meaningful overvaluation.',
  avoid: 'Overvalued and high-risk with deteriorating signals; steer clear.',
};

const RISK_HEADLINES: Record<RiskKey, string> = {
  injury: 'Injury / durability risk',
  age: 'Age-curve risk',
  role: 'Role security risk',
  offense: 'Offensive environment risk',
  efficiency: 'Efficiency-regression risk',
  hype: 'Hype / sentiment risk',
};

function riskDetail(key: RiskKey, seed: PlayerSeed): string {
  switch (key) {
    case 'injury':
      return seed.status && seed.status !== 'active'
        ? 'Currently carrying an injury designation that clouds availability.'
        : 'Durability history introduces week-to-week availability risk.';
    case 'age':
      return `At ${seed.age}, the position-specific age curve begins to weigh on long-term value.`;
    case 'role':
      return 'Snap share and touch security are not fully locked in.';
    case 'offense':
      return 'The surrounding offense (QB, line, pace) caps the weekly ceiling.';
    case 'efficiency':
      return 'Current scoring leans on efficiency that may regress toward the mean.';
    case 'hype':
      return 'Sentiment is running ahead of production; price could cool.';
  }
}

function buildForFormat(format: FormatKey, todayIso: string): Dataset {
  const parts = FORMATS[format].parts;
  const today = new Date(todayIso + 'T00:00:00Z');

  const players = POOL.map(seedToPlayer);
  const inputs = POOL.map(seedToInput);

  // 1) Fundamental (adjusted, pre-percentile) for every player, then percentile
  //    rank across the pool → the stable 0–100 index (§12.2).
  const adj = inputs.map((inp) => fundamentalAdjusted(inp, parts));
  const sortedAdj = [...adj].sort((a, b) => a - b);
  // Map the raw percentile (0..100) into ~1..99.5 so the pool's floor and ceiling
  // never display as an ambiguous 0.0 (reads as missing) or a maxed 100.0.
  const fundamentals = adj.map((v) => Math.round((1 + 0.985 * percentileRank(v, sortedAdj)) * 10) / 10);

  const computed: ComputedPlayer[] = POOL.map((seed, i) => {
    const player = players[i];
    const input = inputs[i];
    const fv = fundamentals[i];

    // 2) Baseline sentiment derived to hit the authored target mispricing today.
    //    target_mis = 0.625 · (FV − sentiment)  ⇒  sentiment = FV − 1.6·target_mis
    const baselineSentiment = clamp(fv - 1.6 * seed.mis, 0, 100);
    input.sentiment = baselineSentiment;

    const cats = seed.cats ?? [];
    const prior = structuralVolatilityPrior(input);

    // 3) Walk the market value across the history window (§12.3). Each day's
    //    noise is seeded by its ABSOLUTE date, so the tick genuinely advances
    //    day to day (today ≠ yesterday) while staying reproducible for any
    //    given (playerId, format, date) on any machine (§11.11, §40.5).
    const history: PlayerMarketHistoryPoint[] = [];
    let mv = fv; // start fairly priced; sentiment arc pulls it to the target
    for (let d = -HISTORY_DAYS; d <= 0; d++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + d);
      const dateIso = isoDate(date);
      const s = sentimentAt(d, baselineSentiment, cats);
      const dayRng = seededRandom(player.identity.internal_id, format, dateIso);
      const noise = gaussian(dayRng) * prior * NOISE_SCALE;
      mv = marketStep(mv, fv, s, 0, noise);
      history.push({
        date: dateIso,
        marketPrice: Math.round(mv * 10) / 10,
        fundamentalValue: fv,
      });
    }

    const series = history.map((h) => h.marketPrice);
    const last = series.length - 1;
    const price = series[last];
    const priceAt = (daysBack: number) => series[Math.max(0, last - daysBack)];

    const d1 = round1(price - priceAt(1));
    const d7 = round1(price - priceAt(7));
    const d30 = round1(price - priceAt(30));
    const season = round1(price - priceAt(120));
    const allTime = round1(price - series[0]);
    const d30Pct = priceAt(30) ? round1((d30 / priceAt(30)) * 100) : 0;

    // 4) Volatility from realized daily changes blended with structural prior.
    const dailyChanges: number[] = [];
    for (let k = Math.max(1, last - 29); k <= last; k++) dailyChanges.push(series[k] - series[k - 1]);
    const volatility = volatilityFromSeries(dailyChanges, input);

    // 5) Risk breakdown + composite.
    const breakdown = riskBreakdown(input);
    const risk = riskComposite(breakdown);

    // 6) Mispricing, confidence, class, tags, signal.
    const misp = round1(calcMispricing(fv, price));
    const conf = confidenceScore(input, volatility, /* ageDays */ 0);
    const confBand = confidenceBandFromScore(conf);

    const assetClass = assignAssetClass({
      price,
      volatility,
      roleSecurity: input.roleSecurity,
      age: input.age,
      production: input.production,
      momentum30: d30,
      opportunityRising: cats.some((c) => c.dir === 'bullish' && c.affects.includes('opportunity')),
      isRookie: input.isRookie,
    });

    const accelerating = d7 < 0 && d30 < 0 && Math.abs(d7) > Math.abs(d30) / 4;
    const tags = assignTags({
      mispricing: misp,
      momentum30: d30,
      momentum30Pct: d30Pct,
      accelerating,
      opportunity: input.opportunity,
      tdDependence: input.tdDependence,
      hype: input.hype,
      sentiment: baselineSentiment,
      production: input.production,
      position: input.position,
      qbFormatSf: parts.qb === 'sf',
      status: input.status,
      offense: input.offense,
      age: input.age,
      ageInflection: AGE_CURVE_INFLECTION[input.position],
    });

    const { signal, ruleFired } = assignSignal({
      mispricing: misp,
      risk,
      volatility,
      confidence: confBand,
    });

    const lastUpdated = new Date(todayIso + 'T06:00:00Z').toISOString();

    const snapshot: PlayerMarketSnapshot = {
      playerId: player.identity.internal_id,
      format,
      date: todayIso,
      marketPrice: price,
      fundamentalValue: fv,
      mispricing: misp,
      overallRank: 0, // filled after all prices known
      positionRank: 0,
      movement: { d1, d7, d30, season, allTime },
      volatility,
      riskScore: risk,
      riskBreakdown: breakdown,
      assetClass,
      tags,
      confidence: conf,
      lastUpdated,
      dataMode: 'demo',
      snapshotHash: `${format}:${player.identity.internal_id}:${todayIso}`,
    };

    // Signal object with explanation + factors (§11.5).
    const supporting = buildSupportingFactors({ misp, fv, price, breakdown, input, d30 });
    const topRisks = (Object.entries(breakdown) as [RiskKey, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const signalObj: MarketSignal = {
      playerId: player.identity.internal_id,
      format,
      signal,
      confidence: confBand,
      explanation: SIGNAL_EXPLANATIONS[signal],
      supportingFactors: supporting,
      riskFactors: topRisks.slice(0, 2).map(([k, v]) => `${RISK_HEADLINES[k]} (${v})`),
      ruleFired,
      lastUpdated,
    };

    const catalysts: MarketCatalyst[] = cats.map((c, ci) => {
      const dt = new Date(today);
      dt.setUTCDate(dt.getUTCDate() - c.daysAgo);
      return {
        id: `${player.identity.internal_id}_c${ci}`,
        playerId: player.identity.internal_id,
        type: c.type,
        direction: c.dir,
        magnitude: c.mag,
        date: isoDate(dt),
        headline: c.headline,
        detail: c.detail,
        affectedScores: c.affects,
        sourceNote: 'authored_demo',
      };
    });

    const riskFactors: RiskFactor[] = topRisks.slice(0, 2).map(([k, v]) => ({
      playerId: player.identity.internal_id,
      type: k,
      score: v,
      headline: RISK_HEADLINES[k],
      detail: riskDetail(k, seed),
    }));

    return { player, input, fundamentalValue: fv, history, snapshot, signal: signalObj, catalysts, riskFactors, seed };
  });

  // 7) Ranks from market price within the active format (§24).
  const byPrice = [...computed].sort((a, b) => b.snapshot.marketPrice - a.snapshot.marketPrice);
  const posCounters: Record<string, number> = {};
  byPrice.forEach((cp, idx) => {
    cp.snapshot.overallRank = idx + 1;
    posCounters[cp.player.position] = (posCounters[cp.player.position] ?? 0) + 1;
    cp.snapshot.positionRank = posCounters[cp.player.position];
  });

  const byTicker = new Map(computed.map((c) => [c.player.ticker, c]));
  const byId = new Map(computed.map((c) => [c.player.identity.internal_id, c]));
  return { format, date: todayIso, players: computed, byTicker, byId };
}

function buildSupportingFactors(args: {
  misp: number;
  fv: number;
  price: number;
  breakdown: Record<RiskKey, number>;
  input: EngineInputs;
  d30: number;
}): string[] {
  const f: string[] = [];
  const gap = round1(args.fv - args.price);
  if (Math.abs(gap) >= 1)
    f.push(`Model value ${args.fv.toFixed(1)} vs market ${args.price.toFixed(1)} (gap ${gap > 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)}).`);
  if (args.input.opportunity >= 82) f.push(`Elite opportunity share (${args.input.opportunity}).`);
  if (args.input.roleSecurity >= 82) f.push(`Secure role (${args.input.roleSecurity}).`);
  if (args.d30 <= -3) f.push(`Down ${Math.abs(args.d30).toFixed(1)} over 30 days — a potential entry point.`);
  if (args.d30 >= 3) f.push(`Up ${args.d30.toFixed(1)} over 30 days on improving usage.`);
  if (args.input.efficiency >= 85) f.push(`Strong efficiency profile (${args.input.efficiency}).`);
  return f.slice(0, 4).length >= 2 ? f.slice(0, 4) : [...f, 'Profile broadly in line with market price.'].slice(0, 4);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- Memoized public builder ----------
const cache = new Map<string, Dataset>();

export function getDataset(format: FormatKey = DEFAULT_FORMAT, todayIso?: string): Dataset {
  const date = todayIso ?? isoDate(new Date());
  const key = `${format}:${date}`;
  let ds = cache.get(key);
  if (!ds) {
    ds = buildForFormat(format, date);
    cache.set(key, ds);
  }
  return ds;
}

export { FORMULA_VERSION, HISTORY_DAYS, hashString, SIGNAL_META };

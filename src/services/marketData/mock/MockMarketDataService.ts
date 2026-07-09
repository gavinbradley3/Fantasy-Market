// MockMarketDataService — the MVP implementation of the single data door. It
// assembles view models from the deterministic dataset builder. A future
// LiveMarketDataService implements the same interface and the UI never changes.

import { FORMAT_KEYS, FORMATS } from '@/config/market';
import { getDataset, type ComputedPlayer } from '@/services/marketData/mock/buildDataset';
import { formatNotes, gameLog, seasonStats } from '@/services/marketData/mock/stats';
import { templateGenerator } from '@/services/thesis/templateGenerator';
import type {
  FormatPrice,
  HistoryRange,
  MarketDataService,
  MoverGroups,
  SearchResult,
} from '@/services/marketData/types';
import type {
  DataSourceStatus,
  FormatKey,
  MarketCatalyst,
  PlayerDetail,
  PlayerMarketHistoryPoint,
  PlayerRow,
} from '@/types/market';

const SPARK_DAYS = 30;

function sparkFor(cp: ComputedPlayer): number[] {
  return cp.history.slice(-SPARK_DAYS).map((h) => h.marketPrice);
}

function topCatalyst(cats: MarketCatalyst[]): MarketCatalyst | undefined {
  if (cats.length === 0) return undefined;
  const rank = { major: 3, moderate: 2, minor: 1 } as const;
  return [...cats].sort(
    (a, b) => rank[b.magnitude] - rank[a.magnitude] || b.date.localeCompare(a.date),
  )[0];
}

function toRow(cp: ComputedPlayer): PlayerRow {
  return {
    player: cp.player,
    snapshot: cp.snapshot,
    signal: cp.signal,
    topCatalyst: topCatalyst(cp.catalysts),
    spark: sparkFor(cp),
  };
}

export class MockMarketDataService implements MarketDataService {
  getMarketDate(): string {
    return getDataset().date;
  }

  getBoard(format: FormatKey): PlayerRow[] {
    return getDataset(format).players.map(toRow);
  }

  getPlayer(ticker: string, format: FormatKey): PlayerDetail | undefined {
    const cp = getDataset(format).byTicker.get(ticker.toUpperCase());
    if (!cp) return undefined;
    return {
      player: cp.player,
      snapshot: cp.snapshot,
      signal: cp.signal,
      catalysts: [...cp.catalysts].sort((a, b) => b.date.localeCompare(a.date)),
      riskFactors: cp.riskFactors,
      thesis: templateGenerator.generate(cp),
      seasonStats: seasonStats(cp),
      gameLog: gameLog(cp),
      formatNotes: formatNotes(cp),
    };
  }

  getMovers(format: FormatKey): MoverGroups {
    const rows = getDataset(format).players.map(toRow);
    const by = (sel: (r: PlayerRow) => number, desc = true) =>
      [...rows].sort((a, b) => (desc ? sel(b) - sel(a) : sel(a) - sel(b)));

    const risers = by((r) => r.snapshot.movement.d1).slice(0, 5);
    const fallers = by((r) => r.snapshot.movement.d1, false).slice(0, 5);

    const buyLow = by((r) => r.snapshot.mispricing)
      .filter((r) => r.snapshot.mispricing > 0 && r.snapshot.movement.d30 < 0)
      .slice(0, 5);
    const sellHigh = by((r) => r.snapshot.mispricing, false)
      .filter((r) => r.snapshot.mispricing < 0 && r.snapshot.movement.d30 > 0)
      .slice(0, 5);
    const overheated = by((r) => r.snapshot.mispricing, false)
      .filter((r) => r.snapshot.mispricing <= -25)
      .slice(0, 5);

    const blueChips = rows
      .filter((r) => r.snapshot.assetClass === 'blue_chip')
      .sort((a, b) => b.snapshot.marketPrice - a.snapshot.marketPrice)
      .slice(0, 5);
    const rookieIpos = rows
      .filter((r) => r.snapshot.assetClass === 'rookie_ipo')
      .sort((a, b) => b.snapshot.movement.d7 - a.snapshot.movement.d7)
      .slice(0, 5);

    const mostVolatile = by((r) => r.snapshot.volatility).slice(0, 5);
    const mostStable = by((r) => r.snapshot.volatility, false).slice(0, 5);

    return { risers, fallers, buyLow, sellHigh, overheated, blueChips, rookieIpos, mostVolatile, mostStable };
  }

  getHistory(ticker: string, format: FormatKey, range: HistoryRange): PlayerMarketHistoryPoint[] {
    const cp = getDataset(format).byTicker.get(ticker.toUpperCase());
    if (!cp) return [];
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === 'season' ? 120 : cp.history.length;
    return cp.history.slice(-days);
  }

  getFormatComparison(ticker: string): FormatPrice[] {
    return FORMAT_KEYS.map((f) => {
      const cp = getDataset(f).byTicker.get(ticker.toUpperCase());
      return {
        format: f,
        label: FORMATS[f].label,
        marketPrice: cp?.snapshot.marketPrice ?? 0,
        fundamentalValue: cp?.snapshot.fundamentalValue ?? 0,
        mispricing: cp?.snapshot.mispricing ?? 0,
      };
    });
  }

  getRowsByIds(ids: string[], format: FormatKey): PlayerRow[] {
    const ds = getDataset(format);
    return ids.map((id) => ds.byId.get(id)).filter((cp): cp is ComputedPlayer => !!cp).map(toRow);
  }

  getPriceById(id: string, format: FormatKey): number | undefined {
    return getDataset(format).byId.get(id)?.snapshot.marketPrice;
  }

  search(query: string, limit = 8): SearchResult[] {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const ds = getDataset();
    const scored: { r: SearchResult; score: number }[] = [];
    for (const cp of ds.players) {
      const name = cp.player.displayName.toLowerCase();
      const ticker = cp.player.ticker.toLowerCase();
      let score = -1;
      if (ticker === q) score = 100;
      else if (ticker.startsWith(q)) score = 90;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (cp.player.identity.name_normalized.includes(q)) score = 50;
      if (score > 0)
        scored.push({
          r: {
            ticker: cp.player.ticker,
            name: cp.player.displayName,
            position: cp.player.position,
            team: cp.player.team,
          },
          score,
        });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.r);
  }

  getSourceStatus(): DataSourceStatus[] {
    const date = getDataset().date;
    const updated = new Date(date + 'T06:00:00Z').toISOString();
    return [
      {
        sourceId: 'internal_engine',
        label: 'Internal market engine',
        mode: 'live',
        lastSuccessfulUpdate: updated,
        coverage: `${getDataset().players.length} players · values, signals, tags`,
        health: 'ok',
      },
      {
        sourceId: 'mock_inputs',
        label: 'Demo inputs (authored sub-scores + event calendar)',
        mode: 'mock',
        lastSuccessfulUpdate: updated,
        coverage: 'All players · simulated stats and catalysts',
        health: 'ok',
      },
      {
        sourceId: 'sleeper',
        label: 'Sleeper API (metadata + trending)',
        mode: 'disabled',
        coverage: 'Not connected — planned first live integration (P1)',
        health: 'ok',
      },
      {
        sourceId: 'nflverse',
        label: 'nflverse-style open stats',
        mode: 'disabled',
        coverage: 'Not connected — powers real production/usage (P1)',
        health: 'ok',
      },
    ];
  }
}

export const marketData: MarketDataService = new MockMarketDataService();

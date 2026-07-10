// LiveMarketDataService — P1 Wave 1: live PLAYER METADATA from Sleeper,
// deterministic SIMULATED MARKET from the existing engine.
//
// Composition, not replacement: every market number (price, movement,
// volatility, mispricing, signals, confidence, catalysts, thesis, classes,
// risk, history) is produced by the same deterministic core the demo service
// uses — this class only OVERLAYS identity facts (name, team, status, rookie
// flag, external ids) and attaches informational trending counts. If Sleeper
// is unreachable, every method still answers from the deterministic core with
// authored metadata, and getMarketStatus reports exactly what is missing.
// Nothing in this file can change a price.

import { MockMarketDataService } from '@/services/marketData/mock/MockMarketDataService';
import {
  SleeperMetadataProvider,
} from '@/services/marketData/live/SleeperMetadataProvider';
import type { MatchedMeta, PlayersCache, TrendingCache } from '@/services/marketData/live/sleeperSchemas';
import type {
  FormatPrice,
  HistoryRange,
  MarketDataService,
  MarketStatus,
  MoverGroups,
  SearchResult,
} from '@/services/marketData/types';
import type {
  DataSourceStatus,
  FormatKey,
  Player,
  PlayerDetail,
  PlayerMarketHistoryPoint,
  PlayerRow,
  TrendingInfo,
} from '@/types/market';

function overlayPlayer(player: Player, meta: MatchedMeta | undefined): Player {
  if (!meta) return player;
  return {
    ...player,
    displayName: meta.name,
    team: meta.team,
    status: meta.status,
    isRookie: meta.isRookie,
    identity: {
      ...player.identity,
      sleeper_id: meta.sleeperId,
      espn_id: meta.espnId ?? player.identity.espn_id,
      gsis_id: meta.gsisId ?? player.identity.gsis_id,
    },
  };
}

function trendingFor(meta: MatchedMeta | undefined, trending: TrendingCache | null): TrendingInfo | undefined {
  if (!meta || !trending) return undefined;
  const adds = trending.adds[meta.sleeperId];
  const drops = trending.drops[meta.sleeperId];
  if (adds === undefined && drops === undefined) return undefined;
  return {
    ...(adds !== undefined ? { adds24h: adds } : {}),
    ...(drops !== undefined ? { drops24h: drops } : {}),
  };
}

export interface LiveMarketDataServiceOptions {
  provider?: SleeperMetadataProvider;
  core?: MockMarketDataService;
}

export class LiveMarketDataService implements MarketDataService {
  private readonly core: MockMarketDataService;
  private readonly provider: SleeperMetadataProvider;

  constructor(opts: LiveMarketDataServiceOptions = {}) {
    this.core = opts.core ?? new MockMarketDataService();
    this.provider = opts.provider ?? new SleeperMetadataProvider();
    // Warm the metadata caches at construction so the first board render
    // usually finds them ready. Failures are absorbed; they only affect
    // source status. (void: fire-and-forget by design.)
    void this.provider.getPlayersMeta().catch(() => null);
    void this.provider.getTrending().catch(() => null);
  }

  /** Both caches, never throwing — overlay is always best-effort. */
  private async metadata(): Promise<{ players: PlayersCache | null; trending: TrendingCache | null }> {
    const [players, trending] = await Promise.all([
      this.provider.getPlayersMeta().catch(() => null),
      this.provider.getTrending().catch(() => null),
    ]);
    return { players, trending };
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const base = await this.core.getMarketStatus();
    const { players } = await this.metadata();
    const playersReport = this.provider.getPlayersReport();
    const trendingReport = this.provider.getTrendingReport();
    const live = players !== null && Object.keys(players.matches).length > 0;

    const sources: DataSourceStatus[] = [
      // The deterministic engine + authored market inputs, from the core.
      ...base.sources.filter((s) => s.sourceId === 'internal_engine' || s.sourceId === 'mock_inputs'),
      {
        sourceId: 'sleeper_players',
        label: 'Sleeper API — player metadata (names, teams, status)',
        mode: live ? 'live' : 'disabled',
        lastSuccessfulUpdate: playersReport.lastSuccessfulUpdate,
        coverage: playersReport.detail,
        health: playersReport.health,
      },
      {
        sourceId: 'sleeper_trending',
        label: 'Sleeper API — trending adds/drops (informational only)',
        mode: trendingReport.lastSuccessfulUpdate ? 'live' : 'disabled',
        lastSuccessfulUpdate: trendingReport.lastSuccessfulUpdate,
        coverage: trendingReport.detail,
        health: trendingReport.health,
      },
    ];

    return {
      ...base,
      mode: live ? 'mixed' : 'demo',
      notice: live
        ? 'Live player data · Simulated market — names, teams, and status come from Sleeper; every price, signal, and score is simulated by our demo engine.'
        : 'Demo Market — simulated player values. Live Sleeper player data is currently unavailable; showing authored demo player info.',
      sources,
    };
  }

  async getBoard(format: FormatKey): Promise<PlayerRow[]> {
    const [rows, { players, trending }] = await Promise.all([
      this.core.getBoard(format),
      this.metadata(),
    ]);
    if (!players) return rows;
    return rows.map((row) => {
      const meta = players.matches[row.player.identity.internal_id];
      const t = trendingFor(meta, trending);
      return { ...row, player: overlayPlayer(row.player, meta), ...(t ? { trending: t } : {}) };
    });
  }

  async getPlayer(ticker: string, format: FormatKey): Promise<PlayerDetail | undefined> {
    const [detail, { players, trending }] = await Promise.all([
      this.core.getPlayer(ticker, format),
      this.metadata(),
    ]);
    if (!detail || !players) return detail;
    const meta = players.matches[detail.player.identity.internal_id];
    const t = trendingFor(meta, trending);
    return { ...detail, player: overlayPlayer(detail.player, meta), ...(t ? { trending: t } : {}) };
  }

  async getMovers(format: FormatKey): Promise<MoverGroups> {
    const [movers, { players, trending }] = await Promise.all([
      this.core.getMovers(format),
      this.metadata(),
    ]);
    if (!players) return movers;
    const overlayRows = (rows: PlayerRow[]): PlayerRow[] =>
      rows.map((row) => {
        const meta = players.matches[row.player.identity.internal_id];
        const t = trendingFor(meta, trending);
        return { ...row, player: overlayPlayer(row.player, meta), ...(t ? { trending: t } : {}) };
      });
    return {
      risers: overlayRows(movers.risers),
      fallers: overlayRows(movers.fallers),
      buyLow: overlayRows(movers.buyLow),
      sellHigh: overlayRows(movers.sellHigh),
      overheated: overlayRows(movers.overheated),
      blueChips: overlayRows(movers.blueChips),
      rookieIpos: overlayRows(movers.rookieIpos),
      mostVolatile: overlayRows(movers.mostVolatile),
      mostStable: overlayRows(movers.mostStable),
    };
  }

  // History and format comparison are pure market data — deterministic core,
  // no metadata involved.
  getHistory(ticker: string, format: FormatKey, range: HistoryRange): Promise<PlayerMarketHistoryPoint[]> {
    return this.core.getHistory(ticker, format, range);
  }

  getFormatComparison(ticker: string): Promise<FormatPrice[]> {
    return this.core.getFormatComparison(ticker);
  }

  async getRowsByIds(ids: string[], format: FormatKey): Promise<PlayerRow[]> {
    const [rows, { players, trending }] = await Promise.all([
      this.core.getRowsByIds(ids, format),
      this.metadata(),
    ]);
    if (!players) return rows;
    return rows.map((row) => {
      const meta = players.matches[row.player.identity.internal_id];
      const t = trendingFor(meta, trending);
      return { ...row, player: overlayPlayer(row.player, meta), ...(t ? { trending: t } : {}) };
    });
  }

  getPriceById(id: string, format: FormatKey): Promise<number | undefined> {
    return this.core.getPriceById(id, format); // prices are engine-only, always
  }

  async search(query: string, limit = 8): Promise<SearchResult[]> {
    // Search runs over the deterministic core (tickers + authored names),
    // then displays live names for matched players so results match the UI.
    const [results, { players }] = await Promise.all([
      this.core.search(query, limit),
      this.metadata(),
    ]);
    if (!players) return results;
    const board = await this.core.getBoard('dyn_sf_half' as FormatKey);
    const idByTicker = new Map(board.map((r) => [r.player.ticker, r.player.identity.internal_id]));
    return results.map((r) => {
      const id = idByTicker.get(r.ticker);
      const meta = id ? players.matches[id] : undefined;
      return meta ? { ...r, name: meta.name, team: meta.team } : r;
    });
  }
}

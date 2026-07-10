import { Suspense, lazy, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFormatComparison, usePlayer, usePlayerHistory } from '@/hooks/useMarketData';
import { useAppStore } from '@/store/useAppStore';
import { FORMATS, SIGNAL_META } from '@/config/market';
import {
  AssetClassTag,
  MarketPriceBadge,
  MarketTag,
  MispricingMeter,
  MovementBadge,
  PlayerAvatar,
  PositionGlyph,
  RiskBreakdown,
  SignalBadge,
  TickerChip,
  VolatilityMeter,
} from '@/components/market/primitives';
import {
  BullBearCard,
  CatalystList,
  GameLogTable,
  MarketThesisCard,
  RiskFactorList,
  SoonButton,
  StatsSnapshot,
} from '@/components/market/stockcard';
import { WatchlistButton } from '@/components/market/WatchlistButton';
import { ConfidencePill, DataFreshnessBadge, ValueDisclaimer } from '@/components/chrome/Honesty';
import { ErrorState, LoadingSkeleton } from '@/components/states';
import { Footer } from '@/components/chrome/Footer';
import { fmtSigned } from '@/lib/format';
import { cn } from '@/lib/ui';
import type { HistoryRange } from '@/services/marketData/types';

const PriceChart = lazy(() =>
  import('@/components/market/PriceChart').then((m) => ({ default: m.PriceChart })),
);

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'season', label: 'Season' },
  { key: 'all', label: 'All' },
];

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function PlayerPage() {
  const { ticker = '' } = useParams();
  const format = useAppStore((s) => s.format);
  const scoring = FORMATS[format].parts.scoring;

  const [range, setRange] = useState<HistoryRange>('30d');

  const detailQ = usePlayer(ticker, format);
  const detail = detailQ.data;
  // The watch marker keys off the id the detail query already resolved — no
  // second fetch just to translate ticker → id.
  const watched = useAppStore((s) =>
    detail
      ? s.watchlist.find((w) => w.playerId === detail.player.identity.internal_id)
      : undefined,
  );
  const historyQ = usePlayerHistory(detail ? ticker : undefined, format, range);
  const comparisonQ = useFormatComparison(detail ? ticker : undefined);

  if (detailQ.status === 'loading') {
    return (
      <div className="space-y-4" aria-label="Loading player">
        <LoadingSkeleton className="h-8 w-full" />
        <LoadingSkeleton className="h-40 w-full" />
        <LoadingSkeleton className="h-64 w-full" />
        <LoadingSkeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detailQ.status === 'error') {
    return (
      <ErrorState
        message={`This player's stock card couldn't load.`}
        onRetry={detailQ.refetch}
      />
    );
  }

  if (!detail) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg text-text-primary">No player found for “{ticker}”.</p>
        <Link to="/board" className="mt-3 inline-block text-secondary hover:underline">
          ← Back to the Board
        </Link>
      </div>
    );
  }

  const { player, snapshot: s, signal, catalysts, riskFactors, thesis, seasonStats, gameLog, formatNotes } = detail;
  const history = historyQ.data ?? [];
  const comparison = comparisonQ.data ?? [];
  const addedMarker = watched
    ? { date: watched.addedAt.slice(0, 10), price: watched.priceAtAdd }
    : undefined;

  return (
    <div className="space-y-4">
      {/* Demo badge banner atop the card (§34) */}
      <p className="rounded-control border border-warning/25 bg-warning/5 px-3 py-1.5 text-center text-xs text-warning">
        Demo Market — simulated data for product preview. Not current player information.
      </p>

      {/* 1. Identity header + 2. price block */}
      <div className="rounded-card border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar seed={player.avatarSeed} name={player.displayName} size={56} />
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
                {player.displayName}
                <TickerChip ticker={player.ticker} />
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                <PositionGlyph position={player.position} />
                <span>{player.team} · Age {player.age}</span>
                <AssetClassTag id={s.assetClass} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WatchlistButton playerId={player.identity.internal_id} ticker={player.ticker} />
            <SoonButton label="Compare" />
            <SoonButton label="Share card" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-border-subtle pt-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <MarketPriceBadge price={s.marketPrice} size="xl" />
              <MovementBadge value={s.movement.d1} window="24H" showWindow />
            </div>
            <div className="flex items-center gap-2">
              <DataFreshnessBadge lastUpdated={s.lastUpdated} />
              <span className="text-[11px] text-text-muted">{FORMATS[format].label}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Metric label="Model Value" value={s.fundamentalValue.toFixed(1)} />
            <Metric label="Overall Rank" value={`#${s.overallRank}`} />
            <Metric label="Pos Rank" value={`${player.position}${s.positionRank}`} />
            <Metric label="30D" value={fmtSigned(s.movement.d30)} tone={s.movement.d30 >= 0 ? 'up' : 'down'} />
          </dl>
        </div>
      </div>

      {/* 3. Price chart */}
      <Section
        title="Price History"
        aside={
          <div className="flex gap-1" role="tablist" aria-label="Chart range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded px-2 py-1 text-xs transition',
                  range === r.key ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        {historyQ.status === 'error' ? (
          <ErrorState message="Price history couldn't load." onRetry={historyQ.refetch} />
        ) : history.length === 0 ? (
          <LoadingSkeleton className="h-64 w-full" />
        ) : (
          <Suspense fallback={<LoadingSkeleton className="h-64 w-full" />}>
            <PriceChart history={history} catalysts={catalysts} addedMarker={addedMarker} />
          </Suspense>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-up" /> Market price</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-secondary" /> Model value</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-up" /> Catalyst</span>
          {addedMarker && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-warning" /> Added to watchlist</span>}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4. Signal */}
        <Section
          title="Market Signal"
          aside={<ConfidencePill confidence={signal.confidence} />}
        >
          <div className="mb-2 flex items-center gap-2">
            <SignalBadge signal={signal.signal} explanation={signal.explanation} />
            <span className="text-xs text-text-muted">Rule {signal.ruleFired}</span>
          </div>
          <p className="mb-3 text-sm text-text-secondary">{signal.explanation}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Supporting factors</h4>
              <ul className="space-y-1 text-xs text-text-secondary">
                {signal.supportingFactors.map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-up">+</span>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Risk factors</h4>
              <ul className="space-y-1 text-xs text-text-secondary">
                {signal.riskFactors.map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-down">–</span>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* 5. Meters */}
        <Section title="Value, Volatility & Risk">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-text-secondary">Mispricing</span>
              <MispricingMeter value={s.mispricing} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-text-secondary">Volatility</span>
              <VolatilityMeter value={s.volatility} />
            </div>
            <div className="border-t border-border-subtle pt-3">
              <RiskBreakdown composite={s.riskScore} breakdown={s.riskBreakdown} />
            </div>
          </div>
        </Section>
      </div>

      {/* 6. Tags */}
      {s.tags.length > 0 && (
        <Section title="Market Tags">
          <div className="flex flex-wrap gap-2">
            {s.tags.map((t) => (
              <MarketTag key={t} id={t} />
            ))}
          </div>
        </Section>
      )}

      {/* 7. Catalysts */}
      <Section title="Catalysts — why value moved">
        <CatalystList catalysts={catalysts} />
      </Section>

      {/* 8. Bull / Bear */}
      <BullBearCard bull={thesis.bullCase} bear={thesis.bearCase} />

      {/* 9. Thesis */}
      <MarketThesisCard thesis={thesis} />

      {/* Risk factors detail */}
      <Section title="Risk Factors">
        <RiskFactorList factors={riskFactors} />
      </Section>

      {/* 10. Stats */}
      <Section title="Stats Snapshot">
        <StatsSnapshot stats={seasonStats} scoring={scoring} />
        <div className="mt-3">
          <GameLogTable log={gameLog} scoring={scoring} />
        </div>
      </Section>

      {/* 11. Format notes + comparison */}
      <Section title="Format Notes">
        <ul className="mb-3 space-y-1 text-sm text-text-secondary">
          {formatNotes.map((n, i) => (
            <li key={i} className="flex gap-2"><span className="text-secondary">·</span>{n}</li>
          ))}
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Format</th>
                <th className="py-1 pr-2 text-right font-medium">Price</th>
                <th className="py-1 pr-2 text-right font-medium">Model</th>
                <th className="py-1 text-right font-medium">Mispricing</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c) => (
                <tr key={c.format} className={cn('border-t border-border-subtle/60', c.format === format && 'bg-elevated/40')}>
                  <td className="py-1 pr-2 text-text-secondary">{FORMATS[c.format].label}</td>
                  <td className="py-1 pr-2 text-right font-mono tabnum text-text-primary">{c.marketPrice.toFixed(1)}</td>
                  <td className="py-1 pr-2 text-right font-mono tabnum text-text-secondary">{c.fundamentalValue.toFixed(1)}</td>
                  <td className="py-1 text-right font-mono tabnum text-text-secondary">{fmtSigned(c.mispricing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="rounded-card border border-border-subtle bg-surface p-4">
        {detail.trending && (detail.trending.adds24h ?? detail.trending.drops24h) !== undefined && (
          <p className="mb-2 text-[11px] text-text-secondary">
            Sleeper trending (24h):
            {detail.trending.adds24h !== undefined && (
              <span className="ml-1 font-mono tabnum text-up">+{detail.trending.adds24h.toLocaleString()} adds</span>
            )}
            {detail.trending.drops24h !== undefined && (
              <span className="ml-1 font-mono tabnum text-down">−{detail.trending.drops24h.toLocaleString()} drops</span>
            )}
            <span className="ml-1 text-text-muted">— informational only; never affects prices or signals.</span>
          </p>
        )}
        <ValueDisclaimer />
        <p className="mt-2 text-[11px] text-text-muted">
          Signal: {SIGNAL_META[signal.signal].label} — rule {signal.ruleFired}.{' '}
          <Link to="/methodology" className="text-secondary hover:underline">How is this computed?</Link>
        </p>
      </div>

      <Footer />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={cn('font-mono text-base font-semibold tabnum', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary')}>
        {value}
      </dd>
    </div>
  );
}

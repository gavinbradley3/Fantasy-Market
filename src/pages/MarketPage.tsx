import { Link } from 'react-router-dom';
import { useBoard, useMarketStatus, useMovers } from '@/hooks/useMarketData';
import { useAppStore } from '@/store/useAppStore';
import { FORMATS } from '@/config/market';
import { fmtDate } from '@/lib/format';
import { Tape } from '@/components/market/Tape';
import { MarketMoversPanel } from '@/components/market/rows';
import { FormatRibbon } from '@/components/chrome/FormatRibbon';
import { DataFreshnessBadge, ConfidencePill } from '@/components/chrome/Honesty';
import { ErrorState, LoadingSkeleton } from '@/components/states';
import { Footer } from '@/components/chrome/Footer';
import { PageHeader } from '@/components/chrome/PageHeader';
import { WatchlistStrip } from '@/components/market/WatchlistStrip';

/** Group label that separates the three tiers of the dashboard. */
function MoversGroup({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="eyebrow">{label}</h2>
      <span className="h-px flex-1 bg-border-default" aria-hidden />
    </div>
  );
}

export default function MarketPage() {
  const format = useAppStore((s) => s.format);
  const { data: status } = useMarketStatus();
  const board = useBoard(format);
  const movers = useMovers(format);

  return (
    <div className="space-y-6">
      {/* Market header — the "market open" ritual (§18.2) */}
      {/* A steady dot, not a pulsing one: the market ticks once a day, so an
          animation implying live movement would be making a claim the data can't back. */}
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-positive" aria-hidden />
            Market Update
          </span>
        }
        subtitle={
          <>
            {status?.marketDate ? `${fmtDate(status.marketDate)} · close 06:00 UTC · ` : ''}
            {FORMATS[format].label}
          </>
        }
        actions={
          <>
            <ConfidencePill confidence="medium" />
            {status?.lastUpdated && <DataFreshnessBadge lastUpdated={status.lastUpdated} />}
            <FormatRibbon compact />
          </>
        }
        className="mb-0"
      />

      {board.status === 'success' && board.data && <Tape rows={board.data} />}
      {board.status === 'loading' && <LoadingSkeleton className="h-12 w-full" />}

      <WatchlistStrip />

      {/* Movers grid — explicit loading / error / success lifecycle */}
      {movers.status === 'loading' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading movers">
          {Array.from({ length: 6 }, (_, i) => (
            <LoadingSkeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      )}
      {movers.status === 'error' && (
        <ErrorState
          message="Today's market movers couldn't load."
          onRetry={movers.refetch}
        />
      )}
      {/* Three tiers rather than one flat grid of nine: the day's movement answers
          "what happened", the value panels answer "what should I do about it", and
          market structure is reference material. A uniform grid gave all three the
          same weight and left the page with no entry point.

          "View all" leads to The Board, which shows the PUBLISHED market. The demo
          engine's own concepts (mispricing, asset class, tags) have no published
          counterpart, so these links carry only filters the published board supports. */}
      {movers.status === 'success' && movers.data && (
        <div className="space-y-8">
          <section>
            <MoversGroup label="Today's movement" />
            <div className="grid gap-4 md:grid-cols-2">
              <MarketMoversPanel title="Biggest Risers" subtitle="Top 24-hour gains" rows={movers.data.risers} metric="d1" viewAllHref="/board?sort=value" />
              <MarketMoversPanel title="Biggest Fallers" subtitle="Top 24-hour drops" rows={movers.data.fallers} metric="d1" viewAllHref="/board?sort=value" />
            </div>
          </section>

          <section>
            <MoversGroup label="Value gaps" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MarketMoversPanel title="Buy-Low Windows" subtitle="Undervalued after a 30-day dip" rows={movers.data.buyLow} metric="d30" viewAllHref="/board" emptyNote="No buy-low windows in this format today." />
              <MarketMoversPanel title="Sell-High Warnings" subtitle="Overvalued after a 30-day run" rows={movers.data.sellHigh} metric="d30" viewAllHref="/board" emptyNote="No sell-high warnings today." />
              <MarketMoversPanel title="Overheated Assets" subtitle="Mispricing −25 or worse" rows={movers.data.overheated} metric="d30" viewAllHref="/board" emptyNote="Nothing deeply overheated today." />
            </div>
          </section>

          <section>
            <MoversGroup label="Market structure" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MarketMoversPanel title="Blue Chips" subtitle="The stability shelf" rows={movers.data.blueChips} metric="d7" viewAllHref="/board?sort=value" />
              <MarketMoversPanel title="Rookie IPOs" subtitle="First-year market debuts" rows={movers.data.rookieIpos} metric="d7" viewAllHref="/board" />
              <MarketMoversPanel title="Most Volatile" subtitle="Highest week-to-week swing" rows={movers.data.mostVolatile} metric="d7" viewAllHref="/board?sort=volatility" />
              <MarketMoversPanel title="Most Stable" subtitle="Lowest volatility" rows={movers.data.mostStable} metric="d7" viewAllHref="/board?sort=volatility" />
            </div>
          </section>
        </div>
      )}

      <div className="space-y-1.5 border-t border-border-default pt-5 text-sm text-text-muted">
        <p>
          Every value on this page is generated by our market engine from simulated inputs.{' '}
          <Link to="/methodology" className="font-medium text-text-secondary underline-offset-4 transition-colors duration-standard hover:text-brand-blue hover:underline">
            See exactly how prices are computed
          </Link>
        </p>
        <p>
          For the real published market,{' '}
          <Link to="/board" className="font-medium text-text-secondary underline-offset-4 transition-colors duration-standard hover:text-brand-blue hover:underline">
            open The Board
          </Link>
        </p>
      </div>

      <Footer />
    </div>
  );
}

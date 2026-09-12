import { Link } from 'react-router-dom';
import { useBoard, useMovers } from '@/hooks/useMarketData';
import { useAppStore } from '@/store/useAppStore';
import { ErrorState, LoadingSkeleton } from '@/components/states';
import { Tape } from '@/components/market/Tape';
import { MoverRow } from '@/components/market/rows';
import {
  AssetClassTag,
  MarketPriceBadge,
  MarketTag,
  MispricingMeter,
  MovementBadge,
  PlayerAvatar,
  SignalBadge,
  Sparkline,
  TickerChip,
} from '@/components/market/primitives';
import { Footer } from '@/components/chrome/Footer';
import { ButtonLink } from '@/components/ui/Button';

const CATEGORIES: { label: string; href: string }[] = [
  { label: 'Buy-Low Windows', href: '/board?tag=buy_low_window&sort=mis' },
  { label: 'Overheated', href: '/board?tag=overheated&sort=misAsc' },
  { label: 'Rookie IPOs', href: '/board?class=rookie_ipo&sort=d7' },
  { label: 'Blue Chips', href: '/board?class=blue_chip&sort=price' },
  { label: 'Most Volatile', href: '/board?sort=vol' },
];

export default function LandingPage() {
  const format = useAppStore((s) => s.format);
  const boardQ = useBoard(format);
  const moversQ = useMovers(format);
  const board = boardQ.data ?? [];
  const movers = moversQ.data;

  // Featured card rotates daily with the tick: pick the top buy-low, else top riser.
  const featured = movers ? (movers.buyLow[0] ?? movers.risers[0] ?? board[0]) : undefined;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="pt-6">
        <div className="mb-4">
          {boardQ.status === 'loading' && <LoadingSkeleton className="h-12 w-full" />}
          {board.length > 0 && <Tape rows={board} />}
        </div>
        {/* Grid items default to min-width:auto, so a long player name inside the
            movers panel could set a min-content floor wider than a phone screen and
            push the whole page sideways. min-w-0 lets them shrink. */}
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            {/* "Track it." takes the brand blue from the wordmark, not the market's
                green: green means a value went up, and a headline is not a value. */}
            <h1 className="text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-text-primary sm:text-[52px]">
              Fantasy football has a market. <span className="text-brand-blue">Track it.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              Player values move every week. Spot risers, fallers, buy-low windows, and market
              overreactions before your league catches up.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <ButtonLink to="/market" variant="primary" size="lg">
                View the Market
              </ButtonLink>
              <ButtonLink to="/watchlist" variant="secondary" size="lg">
                Track My Players
              </ButtonLink>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.href}
                  to={c.href}
                  className="rounded-pill border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-standard hover:border-border-strong hover:text-text-primary"
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Movers preview — loading / error / success lifecycle */}
          <div className="min-w-0 rounded-card border border-border-default bg-surface p-4">
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <span className="text-sm font-semibold text-text-primary">Today's movers</span>
              <span className="text-[11px] text-text-muted">Demo Market preview</span>
            </div>
            {moversQ.status === 'loading' && <LoadingSkeleton className="h-44 w-full" />}
            {moversQ.status === 'error' && (
              <ErrorState message="Today's movers couldn't load." onRetry={moversQ.refetch} />
            )}
            {/* One column, not two: side by side inside the hero panel there was not
                enough width left for a player's name, and a truncated name defeats
                the point of leading with player identity. */}
            {movers && (
              <div className="mt-3 space-y-4">
                <div>
                  <p className="eyebrow px-2 text-positive">Risers</p>
                  <div className="mt-1 divide-y divide-border-default">
                    {movers.risers.slice(0, 3).map((r) => (
                      <MoverRow key={r.player.identity.internal_id} row={r} metric="d1" />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow px-2 text-negative">Fallers</p>
                  <div className="mt-1 divide-y divide-border-default">
                    {movers.fallers.slice(0, 3).map((r) => (
                      <MoverRow key={r.player.identity.internal_id} row={r} metric="d1" />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Three claims, not three cards. Boxing each one would have added borders
          without adding grouping — they are already parallel and already separate. */}
      <section className="grid gap-x-10 gap-y-7 border-t border-border-default pt-7 sm:grid-cols-3">
        {[
          { h: 'Movement, not rankings', b: 'The trend line is the primary object. Rank is one column, not the product.' },
          { h: 'Mispricing, not consensus', b: 'We separate market price from model value and surface the gap — the edge.' },
          { h: 'Every number explained', b: 'Price, signal, mispricing, and risk are each one tap from their reasoning.' },
        ].map((c) => (
          <div key={c.h}>
            <h3 className="mb-1.5 text-[15px] font-semibold text-text-primary">{c.h}</h3>
            <p className="text-sm leading-relaxed text-text-muted">{c.b}</p>
          </div>
        ))}
      </section>

      {/* Featured stock card — the product advertising itself */}
      {featured && (
        <section>
          <h2 className="eyebrow mb-3">A live demo stock card</h2>
          <Link
            to={`/player/${featured.player.ticker}`}
            className="block rounded-card border border-border-default bg-surface p-5 transition-colors duration-standard hover:border-border-strong"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <PlayerAvatar seed={featured.player.avatarSeed} name={featured.player.displayName} size={52} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-text-primary">{featured.player.displayName}</span>
                    <TickerChip ticker={featured.player.ticker} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                    <span>{featured.player.position} · {featured.player.team} · Age {featured.player.age}</span>
                    <AssetClassTag id={featured.snapshot.assetClass} />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <MarketPriceBadge price={featured.snapshot.marketPrice} size="lg" />
                  <MovementBadge value={featured.snapshot.movement.d1} window="24H" showWindow />
                </div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <SignalBadge signal={featured.signal.signal} explanation={featured.signal.explanation} />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border-default pt-4">
              <Sparkline data={featured.spark} width={160} height={36} ariaLabel="trend" />
              <MispricingMeter value={featured.snapshot.mispricing} />
              <div className="flex flex-wrap gap-1">
                {featured.snapshot.tags.map((t) => <MarketTag key={t} id={t} />)}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Teasers */}
      <section className="grid gap-x-10 gap-y-7 border-t border-border-default pt-7 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[15px] font-semibold text-text-primary">Track any player</h3>
          <p className="mb-3 text-sm leading-relaxed text-text-muted">
            See value change since the day you started watching. Your watchlist updates with every
            daily tick.
          </p>
          <Link
            to="/watchlist"
            className="text-sm font-medium text-text-secondary underline-offset-4 transition-colors duration-standard hover:text-brand-blue hover:underline"
          >
            Start a watchlist
          </Link>
        </div>
        <div>
          <h3 className="mb-1.5 text-[15px] font-semibold text-text-primary">No black box</h3>
          <p className="mb-3 text-sm leading-relaxed text-text-muted">
            See exactly how prices are computed — the inputs, the weights, and the rules behind
            every signal. Right now the market runs in labeled demo mode.
          </p>
          <Link
            to="/methodology"
            className="text-sm font-medium text-text-secondary underline-offset-4 transition-colors duration-standard hover:text-brand-blue hover:underline"
          >
            Read the methodology
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

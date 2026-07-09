import { Link } from 'react-router-dom';
import {
  AssetClassTag,
  MarketTag,
  MispricingMeter,
  MovementBadge,
  PlayerAvatar,
  PositionGlyph,
  SignalBadge,
  Sparkline,
  TickerChip,
  VolatilityMeter,
} from '@/components/market/primitives';
import { WatchlistButton } from '@/components/market/WatchlistButton';
import { fmtPrice } from '@/lib/format';
import { cn } from '@/lib/ui';
import type { PlayerRow } from '@/types/market';

// Desktop table row (§18.3). The whole row deep-links to the stock card.
export function PlayerMarketRow({ row }: { row: PlayerRow }) {
  const { player, snapshot: s, signal } = row;
  return (
    <tr className="group border-b border-border-subtle transition hover:bg-elevated/50">
      <td className="py-2.5 pl-3">
        <Link to={`/player/${player.ticker}`} className="flex items-center gap-2.5">
          <span className="w-6 text-right font-mono text-xs tabnum text-text-muted">{s.overallRank}</span>
          <PlayerAvatar seed={player.avatarSeed} name={player.displayName} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text-primary">{player.displayName}</span>
            <span className="flex items-center gap-1.5">
              <TickerChip ticker={player.ticker} />
              <span className="text-[11px] text-text-muted">{player.team}</span>
            </span>
          </span>
        </Link>
      </td>
      <td className="px-2"><PositionGlyph position={player.position} /></td>
      <td className="px-2 text-center font-mono text-xs tabnum text-text-secondary">{player.age}</td>
      <td className="px-2 text-right font-mono text-sm font-semibold tabnum text-text-primary">{fmtPrice(s.marketPrice)}</td>
      <td className="px-2 text-right"><MovementBadge value={s.movement.d1} /></td>
      <td className="px-2 text-right"><MovementBadge value={s.movement.d7} /></td>
      <td className="px-2 text-right"><MovementBadge value={s.movement.d30} /></td>
      <td className="px-2"><Sparkline data={row.spark} ariaLabel={`30-day trend for ${player.ticker}`} /></td>
      <td className="px-2"><SignalBadge signal={signal.signal} explanation={signal.explanation} confidenceLow={signal.confidence === 'low'} /></td>
      <td className="px-2"><MispricingMeter value={s.mispricing} size="sm" /></td>
      <td className="px-2"><VolatilityMeter value={s.volatility} showLabel={false} /></td>
      <td className="px-2"><AssetClassTag id={s.assetClass} /></td>
      <td className="px-2 pr-3 text-right">
        <WatchlistButton playerId={player.identity.internal_id} ticker={player.ticker} size="sm" />
      </td>
    </tr>
  );
}

// Mobile board card (§18.3).
export function PlayerMarketCard({ row }: { row: PlayerRow }) {
  const { player, snapshot: s, signal } = row;
  return (
    <Link
      to={`/player/${player.ticker}`}
      className="block rounded-card border border-border-subtle bg-surface p-3 transition hover:border-secondary/40"
    >
      <div className="flex items-center gap-3">
        <span className="w-5 text-center font-mono text-[11px] tabnum text-text-muted">{s.overallRank}</span>
        <PlayerAvatar seed={player.avatarSeed} name={player.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-text-primary">{player.displayName}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <TickerChip ticker={player.ticker} />
            <PositionGlyph position={player.position} />
            <span className="text-[11px] text-text-muted">{player.team} · {player.age}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold tabnum text-text-primary">{fmtPrice(s.marketPrice)}</div>
          <MovementBadge value={s.movement.d7} window="7D" showWindow />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Sparkline data={row.spark} width={110} height={26} ariaLabel={`30-day trend for ${player.ticker}`} />
        <SignalBadge signal={signal.signal} explanation={signal.explanation} confidenceLow={signal.confidence === 'low'} />
        <MispricingMeter value={s.mispricing} size="sm" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <AssetClassTag id={s.assetClass} />
        {s.tags.map((t) => (
          <MarketTag key={t} id={t} />
        ))}
      </div>
    </Link>
  );
}

// Dashboard mover row (§20). Avatar, Δ, sparkline, catalyst headline.
export function MoverRow({ row, metric = 'd1' }: { row: PlayerRow; metric?: 'd1' | 'd7' | 'd30' }) {
  const { player, snapshot: s } = row;
  return (
    <Link
      to={`/player/${player.ticker}`}
      className="flex items-center gap-3 rounded-control px-2 py-2 transition hover:bg-elevated/60"
    >
      <PlayerAvatar seed={player.avatarSeed} name={player.displayName} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-primary">{player.displayName}</span>
          <TickerChip ticker={player.ticker} />
        </div>
        {row.topCatalyst ? (
          <span className="line-clamp-1 text-[11px] text-text-muted">{row.topCatalyst.headline}</span>
        ) : (
          <span className="text-[11px] text-text-muted">{player.position} · {player.team}</span>
        )}
      </div>
      <Sparkline data={row.spark} width={64} height={22} ariaLabel={`trend ${player.ticker}`} />
      <div className="w-20 text-right">
        <div className="font-mono text-sm font-semibold tabnum text-text-primary">{fmtPrice(s.marketPrice)}</div>
        <MovementBadge value={s.movement[metric]} />
      </div>
    </Link>
  );
}

// Titled mover panel + rows + "view all" filter link (§20).
export function MarketMoversPanel({
  title,
  subtitle,
  rows,
  metric = 'd1',
  viewAllHref,
  emptyNote,
  accent = 'neutral',
}: {
  title: string;
  subtitle?: string;
  rows: PlayerRow[];
  metric?: 'd1' | 'd7' | 'd30';
  viewAllHref?: string;
  emptyNote?: string;
  accent?: 'up' | 'down' | 'neutral';
}) {
  const dot = accent === 'up' ? 'text-up' : accent === 'down' ? 'text-down' : 'text-secondary';
  return (
    <section className="flex flex-col rounded-card border border-border-subtle bg-surface p-3">
      <div className="mb-1 flex items-start justify-between gap-2 px-1">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <span className={cn('text-[10px]', dot)} aria-hidden>●</span>
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link to={viewAllHref} className="shrink-0 text-[11px] text-secondary hover:underline">
            View all →
          </Link>
        )}
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-border-subtle/50">
          {rows.map((r) => (
            <MoverRow key={r.player.identity.internal_id} row={r} metric={metric} />
          ))}
        </div>
      ) : (
        <p className="px-2 py-6 text-center text-xs text-text-muted">{emptyNote ?? 'Nothing here right now.'}</p>
      )}
    </section>
  );
}

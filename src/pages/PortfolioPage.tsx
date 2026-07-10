import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useRowsByIds } from '@/hooks/useMarketData';
import { FORMATS } from '@/config/market';
import { volatilityBand } from '@/lib/format';
import {
  MovementBadge,
  PlayerAvatar,
  PositionGlyph,
  TickerChip,
} from '@/components/market/primitives';
import { SoonButton } from '@/components/market/stockcard';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/states';
import { Footer } from '@/components/chrome/Footer';
import { cn } from '@/lib/ui';
import type { Position } from '@/types/market';

const POS_COLOR: Record<Position, string> = {
  QB: 'bg-pos-qb',
  RB: 'bg-pos-rb',
  WR: 'bg-pos-wr',
  TE: 'bg-pos-te',
};

export default function PortfolioPage() {
  const { portfolio, format, removeHolding } = useAppStore();
  const rowsQ = useRowsByIds(portfolio.map((h) => h.playerId), format);
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);

  const totalValue = rows.reduce((a, r) => a + r.snapshot.marketPrice, 0);
  const byPos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.player.position] = (m[r.player.position] ?? 0) + r.snapshot.marketPrice;
    return m;
  }, [rows]);
  const byTeam = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.player.team] = (m[r.player.team] ?? 0) + 1;
    return m;
  }, [rows]);
  const riskDist = useMemo(() => {
    const m = { Low: 0, Medium: 0, High: 0, Extreme: 0 } as Record<string, number>;
    for (const r of rows) m[volatilityBand(r.snapshot.volatility)]++;
    return m;
  }, [rows]);

  const concentration = Object.entries(byTeam).filter(([, n]) => n > 3);
  const topHoldings = [...rows].sort((a, b) => b.snapshot.marketPrice - a.snapshot.marketPrice).slice(0, 5);
  const riskiest = [...rows].sort((a, b) => b.snapshot.riskScore - a.snapshot.riskScore).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
            Portfolio
            <span className="rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] text-warning">
              beta · manual
            </span>
          </h1>
          <p className="text-sm text-text-secondary">
            Your roster as a portfolio of assets · {FORMATS[format].label}
          </p>
        </div>
        <SoonButton label="Import from Sleeper" />
      </div>

      {portfolio.length === 0 ? (
        <EmptyState
          title="Build your portfolio"
          body="Add the players you roster to see your team as a portfolio — total value, position allocation, team exposure, and risk mix. League import (Sleeper) arrives in P1."
          ctaLabel="Find players on the Board →"
          ctaTo="/board"
        />
      ) : rowsQ.status === 'loading' ? (
        <div className="grid gap-3" aria-label="Loading portfolio">
          <LoadingSkeleton className="h-24 w-full" />
          <LoadingSkeleton className="h-40 w-full" />
        </div>
      ) : rowsQ.status === 'error' ? (
        <ErrorState message="Your portfolio couldn't load current prices." onRetry={rowsQ.refetch} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total value" value={totalValue.toFixed(1)} sub={`${rows.length} holdings`} />
            <StatCard label="Positions" value={`${Object.keys(byPos).length}`} sub={Object.keys(byPos).join(' · ')} />
            <StatCard label="Teams" value={`${Object.keys(byTeam).length}`} sub={concentration.length ? `${concentration.length} concentrated` : 'well diversified'} />
            <StatCard label="Avg risk" value={`${Math.round(rows.reduce((a, r) => a + r.snapshot.riskScore, 0) / rows.length)}`} sub="0–100 composite" />
          </div>

          {/* Allocation bar */}
          <div className="rounded-card border border-border-subtle bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Allocation by position</h3>
            <div className="flex h-4 overflow-hidden rounded-full bg-border-subtle" role="img" aria-label="Position allocation">
              {(Object.entries(byPos) as [Position, number][]).map(([p, v]) => (
                <div key={p} className={cn(POS_COLOR[p])} style={{ width: `${(v / totalValue) * 100}%` }} title={`${p}: ${v.toFixed(1)}`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-text-secondary">
              {(Object.entries(byPos) as [Position, number][]).map(([p, v]) => (
                <span key={p} className="flex items-center gap-1.5">
                  <span className={cn('inline-block h-2 w-2 rounded-full', POS_COLOR[p])} />
                  {p} {((v / totalValue) * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-card border border-border-subtle bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Risk distribution</h3>
              <div className="space-y-1.5">
                {Object.entries(riskDist).map(([band, n]) => (
                  <div key={band} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-text-secondary">{band}</span>
                    <span className="h-2 flex-1 rounded-full bg-border-subtle">
                      <span className="block h-full rounded-full bg-secondary" style={{ width: `${(n / rows.length) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right font-mono text-xs tabnum text-text-secondary">{n}</span>
                  </div>
                ))}
              </div>
              {concentration.length > 0 && (
                <p className="mt-3 text-[11px] text-warning">
                  Concentration note: {concentration.map(([t, n]) => `${n} ${t}`).join(', ')} — more than 3 from one team.
                </p>
              )}
            </div>

            <div className="rounded-card border border-border-subtle bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Riskiest holdings</h3>
              <div className="space-y-1">
                {riskiest.map((r) => (
                  <Link key={r.player.identity.internal_id} to={`/player/${r.player.ticker}`} className="flex items-center justify-between rounded-control px-2 py-1.5 hover:bg-elevated/60">
                    <span className="flex items-center gap-2 text-sm text-text-primary"><TickerChip ticker={r.player.ticker} />{r.player.displayName}</span>
                    <span className="font-mono text-xs tabnum text-warning">risk {r.snapshot.riskScore}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Holdings list */}
          <div className="rounded-card border border-border-subtle bg-surface p-2">
            <h3 className="px-2 py-1 text-sm font-semibold text-text-primary">Holdings</h3>
            <div className="divide-y divide-border-subtle/60">
              {topHoldings.concat(rows.filter((r) => !topHoldings.includes(r))).map((r) => (
                <div key={r.player.identity.internal_id} className="flex items-center gap-3 px-2 py-2">
                  <Link to={`/player/${r.player.ticker}`} className="flex flex-1 items-center gap-3">
                    <PlayerAvatar seed={r.player.avatarSeed} name={r.player.displayName} size={34} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-text-primary">{r.player.displayName}</span>
                        <PositionGlyph position={r.player.position} />
                      </span>
                      <span className="text-[11px] text-text-muted">{r.player.team}</span>
                    </span>
                  </Link>
                  <span className="font-mono text-sm tabnum text-text-primary">{r.snapshot.marketPrice.toFixed(1)}</span>
                  <MovementBadge value={r.snapshot.movement.d7} />
                  <button onClick={() => removeHolding(r.player.identity.internal_id)} className="text-text-muted hover:text-down" aria-label={`Remove ${r.player.ticker}`}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-text-muted">
            Portfolio mirrors your roster; it is not a trading game. No simulated buying or selling,
            no balances. Stored locally in your browser.
          </p>
        </>
      )}

      <Footer />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-3">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="font-mono text-2xl font-semibold tabnum text-text-primary">{value}</div>
      <div className="text-[11px] text-text-secondary">{sub}</div>
    </div>
  );
}

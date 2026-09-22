import { useEffect, useState, type ReactNode } from 'react';
import { Link, matchPath, NavLink, useLocation } from 'react-router-dom';
import { FormatRibbon } from '@/components/chrome/FormatRibbon';
import { SearchOverlay } from '@/components/chrome/SearchOverlay';
import { DataModeBanner } from '@/components/chrome/Honesty';
import { Logo } from '@/components/chrome/Logo';
import { ActivityIcon, PieIcon, RowsIcon, SearchIcon, StarIcon } from '@/components/ui/icons';
import { useMarketStatus } from '@/hooks/useMarketData';
import { cn } from '@/lib/ui';
import { resolvePublicationFormat, usePublishedMarket } from '@/services/publication';

const NAV = [
  { to: '/market', label: 'Market' },
  { to: '/board', label: 'Board' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/player-model', label: 'Player Model' },
  { to: '/methodology', label: 'Methodology' },
];

const MOBILE_NAV = [
  { to: '/market', label: 'Market', Icon: ActivityIcon },
  { to: '/board', label: 'Board', Icon: RowsIcon },
  { to: '__search', label: 'Search', Icon: SearchIcon },
  { to: '/watchlist', label: 'Watch', Icon: StarIcon },
  { to: '/portfolio', label: 'Portfolio', Icon: PieIcon },
] as const;

/** The board's noninteractive format evidence, sourced only from its loaded publication. */
function PublishedBoardFormat() {
  const publication = usePublishedMarket();
  const format = resolvePublicationFormat(publication.market);
  const fullLabel = publication.market
    ? format.label
    : publication.status === 'loading'
      ? 'Loading published format…'
      : 'Published format unavailable';
  const compactLabel = format.kind === 'recognized' ? format.compactLabel : fullLabel;

  return (
    <div
      aria-label="Published board format"
      title={fullLabel}
      className="max-w-[146px] truncate rounded-control border border-border-default bg-surface px-2.5 py-1.5 text-[13px] text-text-secondary sm:max-w-none"
    >
      <span className="hidden lg:inline">{fullLabel}</span>
      <span className="lg:hidden">{compactLabel}</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  // Use the router's matching semantics so route variants such as `/board/` cannot restore
  // demo-only chrome over a published board.
  const isPublishedBoard = matchPath({ path: '/board', end: true }, pathname) !== null;
  // Honesty layer: banner mode comes from the active service, not a prop.
  const { data: marketStatus } = useMarketStatus();

  // `/` opens search on desktop (§17, §22).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen">
      {/* The demo banner describes the DEMO MARKET surfaces, whose prices and signals are
          simulated. It must not appear over The Board, which renders the published valuation —
          real model output over real nflverse data. Showing it there would tell a reader the
          one genuinely live surface is simulated, which is the same kind of mislabel as the
          reverse and just as misleading. The Board states its own provenance through its
          freshness note and its per-player tier and confidence. */}
      {!isPublishedBoard && <DataModeBanner status={marketStatus} />}

      {/* Desktop / top nav */}
      <header className="sticky top-0 z-30 border-b border-border-default bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-app items-center gap-3 px-3 sm:gap-5 sm:px-5 md:px-8">
          <Link
            to="/"
            className="shrink-0 py-3.5 transition-opacity duration-standard hover:opacity-80"
            aria-label="PlayerTicker home"
          >
            <Logo size={26} />
          </Link>
          {/* Nav can shrink and scroll internally so the header never forces
              horizontal page overflow at tight widths (e.g. 768–1023px). */}
          <nav
            className="no-scrollbar hidden min-w-0 flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto md:flex"
            aria-label="Primary"
          >
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex shrink-0 items-center px-3 text-[13px] font-medium transition-colors duration-standard',
                    'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-standard',
                    isActive
                      ? 'text-text-primary after:bg-brand-blue'
                      : 'text-text-muted after:bg-transparent hover:text-text-secondary',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded-control border border-border-default bg-surface px-2.5 py-1.5 text-[13px] text-text-muted transition-colors duration-standard hover:border-border-strong hover:text-text-secondary min-[375px]:flex"
              aria-label="Search players"
            >
              <SearchIcon size={15} />
              <span className="hidden sm:inline">Search</span>
              <kbd className="ml-1 hidden rounded border border-border-default bg-canvas px-1.5 py-0.5 font-ui text-[10px] text-text-faint sm:inline">
                /
              </kbd>
            </button>
            {isPublishedBoard ? <PublishedBoardFormat /> : <FormatRibbon compact />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-app px-5 pb-28 pt-6 md:px-8 md:pb-16">{children}</main>

      {/* Mobile bottom nav (§17, §21.7) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-canvas/95 pb-safe backdrop-blur-md md:hidden"
        aria-label="Primary mobile"
      >
        <div className="mx-auto flex max-w-app items-stretch justify-around">
          {MOBILE_NAV.map((n) => {
            const isSearch = n.to === '__search';
            const active = !isSearch && pathname === n.to;
            const cls = cn(
              // 44px+ touch target.
              'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors duration-standard',
              active ? 'text-text-primary' : 'text-text-muted',
            );
            const glyph = <n.Icon size={19} className={active ? 'text-brand-blue' : undefined} />;
            return isSearch ? (
              <button key={n.to} onClick={() => setSearchOpen(true)} className={cls}>
                {glyph}
                {n.label}
              </button>
            ) : (
              <NavLink key={n.to} to={n.to} className={cls}>
                {glyph}
                {n.label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

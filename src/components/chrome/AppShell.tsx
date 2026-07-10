import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FormatRibbon } from '@/components/chrome/FormatRibbon';
import { SearchOverlay } from '@/components/chrome/SearchOverlay';
import { DataModeBanner } from '@/components/chrome/Honesty';
import { useMarketStatus } from '@/hooks/useMarketData';
import { cn } from '@/lib/ui';

const NAV = [
  { to: '/market', label: 'Market' },
  { to: '/board', label: 'Board' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/methodology', label: 'Methodology' },
];

const MOBILE_NAV = [
  { to: '/market', label: 'Market', icon: '▤' },
  { to: '/board', label: 'Board', icon: '☷' },
  { to: '__search', label: 'Search', icon: '⌕' },
  { to: '/watchlist', label: 'Watch', icon: '★' },
  { to: '/portfolio', label: 'Portfolio', icon: '◕' },
];

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="text-up" aria-hidden>
        {/* simple tick glyph, no NFL marks */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
          <path d="M4 21 L11 14 L16 18 L27 7" stroke="#2DD4A7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="27" cy="7" r="2.6" fill="#2DD4A7" />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-text-primary">
        Player<span className="text-up">Ticker</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
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
      <DataModeBanner status={marketStatus} />

      {/* Desktop / top nav */}
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-app items-center gap-4 px-4 py-3">
          <Wordmark />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-control px-3 py-1.5 text-sm transition',
                    isActive ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-full border border-border-subtle bg-elevated px-3 py-1.5 text-sm text-text-muted transition hover:text-text-secondary"
              aria-label="Search players"
            >
              <span aria-hidden>⌕</span>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded bg-base px-1.5 text-[10px] text-text-muted sm:inline">/</kbd>
            </button>
            <FormatRibbon compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-app px-4 pb-28 pt-5 md:pb-12">{children}</main>

      {/* Mobile bottom nav (§17, §21.7) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-base/95 pb-safe backdrop-blur md:hidden"
        aria-label="Primary mobile"
      >
        <div className="mx-auto flex max-w-app items-stretch justify-around">
          {MOBILE_NAV.map((n) => {
            const isSearch = n.to === '__search';
            const active = !isSearch && pathname === n.to;
            const cls = cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition',
              active ? 'text-up' : 'text-text-secondary',
            );
            return isSearch ? (
              <button key={n.to} onClick={() => setSearchOpen(true)} className={cls}>
                <span aria-hidden className="text-lg leading-none">
                  {n.icon}
                </span>
                {n.label}
              </button>
            ) : (
              <NavLink key={n.to} to={n.to} className={cls}>
                <span aria-hidden className="text-lg leading-none">
                  {n.icon}
                </span>
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

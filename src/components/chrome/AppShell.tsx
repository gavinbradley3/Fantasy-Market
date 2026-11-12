import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '@/components/chrome/Logo';
import { BookIcon, RowsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/ui';

// Only surfaces backed by published data, plus the pages that explain them. The Demo Market
// routes (Market, Watchlist, Portfolio, Player Model) are retired from the public site; see
// RETIRED_DEMO_ROUTES in src/app/App.tsx.
const NAV = [
  { to: '/board', label: 'Board' },
  { to: '/methodology', label: 'Methodology' },
];

const MOBILE_NAV = [
  { to: '/board', label: 'Board', Icon: RowsIcon },
  { to: '/methodology', label: 'Methodology', Icon: BookIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen">
      {/* Desktop / top nav */}
      <header className="sticky top-0 z-30 border-b border-border-default bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-app items-center gap-5 px-5 md:px-8">
          <Link
            to="/board"
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
            const active = pathname === n.to;
            const cls = cn(
              // 44px+ touch target.
              'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors duration-standard',
              active ? 'text-text-primary' : 'text-text-muted',
            );
            const glyph = <n.Icon size={19} className={active ? 'text-brand-blue' : undefined} />;
            return (
              <NavLink key={n.to} to={n.to} className={cls}>
                {glyph}
                {n.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

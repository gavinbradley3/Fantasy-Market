import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketSearch } from '@/hooks/useMarketData';
import { PositionGlyph, TickerChip } from '@/components/market/primitives';
import { cn } from '@/lib/ui';

const DEBOUNCE_MS = 120;

// Global player search overlay (§17). Name or ticker, opens with `/` on
// desktop, Escape closes, arrow-key navigation. Queries flow through the
// injected service via useMarketSearch; the query layer's stale-response
// protection guarantees fast typing never renders results for an old input.
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const { status, data } = useMarketSearch(debouncedQ, 8);
  const results = data ?? [];

  useEffect(() => {
    if (open) {
      setQ('');
      setDebouncedQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setActive(0), [debouncedQ]);

  if (!open) return null;

  const go = (ticker: string) => {
    onClose();
    navigate(`/player/${ticker}`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-canvas/80 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Search players"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-card border border-border-default bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === 'Enter' && results[active]) go(results[active].ticker);
          }}
          placeholder="Search players by name or ticker…"
          className="w-full bg-transparent px-4 py-3.5 text-[15px] text-text-primary outline-none placeholder:text-text-faint"
        />
        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto border-t border-border-default">
            {results.map((r, i) => (
              <li key={r.ticker}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.ticker)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-standard',
                    i === active ? 'bg-elevated' : 'hover:bg-elevated',
                  )}
                >
                  <PositionGlyph position={r.position} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{r.name}</span>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-text-muted">{r.team}</span>
                  <TickerChip ticker={r.ticker} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {debouncedQ.trim() && status === 'error' && (
          <p className="border-t border-border-default px-4 py-6 text-center text-sm text-negative">
            Search is unavailable right now — try again.
          </p>
        )}
        {debouncedQ.trim() && status === 'success' && results.length === 0 && (
          <p className="border-t border-border-default px-4 py-6 text-center text-sm text-text-muted">
            No players match “{debouncedQ}”.
          </p>
        )}
      </div>
    </div>
  );
}

import { PlayerAvatar } from '@/components/market/primitives';
import { cn } from '@/lib/ui';
import type { FixtureSummary, SelectorDatum } from '@/pages/player-model/types';

function fmt1(n: number): string {
  return n.toFixed(1);
}

// Horizontally-scrollable card selector (keyboard: roving arrow keys + Enter).
// Each card shows name, archetype, age, team, the MODEL Weekly EFO, a confidence
// label, and an optional compact status marker. Rendered as a `tablist` so the
// selected profile is announced; primary and secondary (edge-case) groups are
// separate tablists so the main selector stays uncluttered.
export function PlayerSelector({
  label,
  fixtures,
  data,
  selectedId,
  onSelect,
}: {
  label: string;
  fixtures: FixtureSummary[];
  data: Record<string, SelectorDatum>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next =
        e.key === 'ArrowRight'
          ? (index + 1) % fixtures.length
          : (index - 1 + fixtures.length) % fixtures.length;
      onSelect(fixtures[next].id);
      document.getElementById(`pm-tab-${fixtures[next].id}`)?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {fixtures.map((f, i) => {
        const selected = f.id === selectedId;
        const d = data[f.id];
        return (
          <button
            key={f.id}
            id={`pm-tab-${f.id}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onSelect(f.id)}
            className={cn(
              'flex w-56 shrink-0 items-center gap-3 rounded-card border p-3 text-left transition',
              selected
                ? 'border-secondary/60 bg-elevated'
                : 'border-border-subtle bg-surface hover:border-secondary/30',
            )}
          >
            <PlayerAvatar seed={f.id} name={f.playerName} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">{f.playerName}</div>
              <div className="truncate text-[11px] text-text-secondary">{f.archetype}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="truncate">{f.team ?? 'Team unavailable'} · Age {f.age}</span>
                {d?.confidenceLabel && (
                  <span className="shrink-0 rounded bg-elevated px-1 text-[9px] font-medium uppercase text-text-secondary">
                    {d.confidenceLabel}
                  </span>
                )}
                {d?.statusMarker && (
                  <span className="shrink-0 rounded bg-warning/10 px-1 text-[9px] font-medium uppercase text-warning">
                    {d.statusMarker}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-base font-semibold tabnum text-text-primary">
                {d ? fmt1(d.weeklyEfo) : '—'}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-text-muted">Wk pts</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

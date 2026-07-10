import { PlayerAvatar } from '@/components/market/primitives';
import { cn } from '@/lib/ui';
import { fmt1 } from '@/pages/wr/adapter';
import type { WRFixtureEntry } from '@/pages/wr/registry';

// Horizontally-scrollable card selector (keyboard: roving arrow keys + Enter).
// Each card shows name, archetype, age, team, and the MODEL Weekly EFO.
export function PlayerSelector({
  fixtures,
  weeklyEfoById,
  selectedId,
  onSelect,
}: {
  fixtures: WRFixtureEntry[];
  weeklyEfoById: Record<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (index + 1) % fixtures.length : (index - 1 + fixtures.length) % fixtures.length;
      onSelect(fixtures[next].id);
      // Move focus to the newly selected tab.
      const el = document.getElementById(`wr-tab-${fixtures[next].id}`);
      el?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Select a WR profile"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {fixtures.map((f, i) => {
        const selected = f.id === selectedId;
        const efo = weeklyEfoById[f.id];
        return (
          <button
            key={f.id}
            id={`wr-tab-${f.id}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onSelect(f.id)}
            className={cn(
              'flex w-52 shrink-0 items-center gap-3 rounded-card border p-3 text-left transition',
              selected
                ? 'border-secondary/60 bg-elevated'
                : 'border-border-subtle bg-surface hover:border-secondary/30',
            )}
          >
            <PlayerAvatar seed={f.id} name={f.input.player_name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">{f.input.player_name}</div>
              <div className="truncate text-[11px] text-text-secondary">{f.archetype}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                {f.input.team ?? 'Team unavailable'} · Age {f.input.age}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-base font-semibold tabnum text-text-primary">
                {efo !== undefined ? fmt1(efo) : '—'}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-text-muted">Wk pts</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

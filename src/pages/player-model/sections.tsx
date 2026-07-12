import type { ReactNode } from 'react';
import { PlayerAvatar } from '@/components/market/primitives';
import { cn } from '@/lib/ui';
import { Badge, ScoreBar, SectionCard } from '@/pages/player-model/ui';
import type { SharedPlayerModelView } from '@/pages/player-model/types';
import type { Horizon } from '@/rb-model/types';

// The five horizons are identical for both positions (labels + which ones carry
// fantasy-point projections). Only the deferral copy differs, and that comes from
// the per-position view (`deferredNotice`).
export const SHARED_HORIZONS: { key: Horizon; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'ROS', label: 'Rest of Season' },
  { key: 'ONE_YEAR', label: 'One Year' },
  { key: 'THREE_YEAR', label: 'Three Years' },
  { key: 'DYNASTY', label: 'Dynasty' },
];

function fmt1(n: number): string {
  return n.toFixed(1);
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

// ---------- Demo disclosure (§10) ----------
export function DemoDisclosure() {
  return (
    <div className="rounded-card border border-secondary/25 bg-secondary/5 px-4 py-2.5 text-sm">
      <span className="font-semibold text-text-primary">Player Model Demo. </span>
      <span className="text-text-secondary">
        This experience uses fictional WR, RB, TE, and QB profiles with deterministic position-specific
        models. It does not show real-player data, trade values, or market prices.
      </span>
    </div>
  );
}

// ---------- Player summary header ----------
export function PlayerSummaryHeader({ view }: { view: SharedPlayerModelView }) {
  return (
    <SectionCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar seed={view.seedId} name={view.playerName} size={56} />
          <div>
            <h1 className="text-xl font-bold text-text-primary">{view.playerName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <span>{view.team ?? 'Team unavailable'}</span>
              <span aria-hidden>·</span>
              <span>Age {view.age}</span>
              <span aria-hidden>·</span>
              <span>{view.seasonsCompleted === 0 ? 'Rookie' : `${view.seasonsCompleted}-yr exp`}</span>
              <span aria-hidden>·</span>
              <span>{view.draftRound ? `Round ${view.draftRound}` : 'Undrafted'}</span>
            </div>
            <div className="mt-1.5 text-xs text-secondary">{view.archetype}</div>
            {view.headerChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {view.headerChips.map((c, i) => (
                  <Badge key={i} tone={c.tone} label={c.label} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Badge
              tone={view.confidence.tone}
              title="Confidence"
              label={view.confidence.label}
              tip={view.confidence.definition}
            />
            <Badge
              tone={view.volatility.tone}
              title="Volatility"
              label={view.volatility.label}
              tip={view.volatility.definition}
            />
          </div>
          <div className="text-right text-[11px] text-text-muted">
            <div>Model {view.meta.modelVersion}</div>
            <div>Reference {view.meta.referenceVersion}</div>
            <div>Output {view.meta.status}</div>
            <div>As of {fmtTimestamp(view.meta.asOfTimestamp)}</div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------- Horizon selector ----------
export function HorizonSelector({
  selected,
  onSelect,
}: {
  selected: Horizon;
  onSelect: (h: Horizon) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next =
        e.key === 'ArrowRight'
          ? (index + 1) % SHARED_HORIZONS.length
          : (index - 1 + SHARED_HORIZONS.length) % SHARED_HORIZONS.length;
      onSelect(SHARED_HORIZONS[next].key);
      document.getElementById(`pm-horizon-${SHARED_HORIZONS[next].key}`)?.focus();
    }
  };
  return (
    <div role="tablist" aria-label="Select a horizon" className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
      {SHARED_HORIZONS.map((h, i) => {
        const isSel = h.key === selected;
        return (
          <button
            key={h.key}
            id={`pm-horizon-${h.key}`}
            role="tab"
            aria-selected={isSel}
            tabIndex={isSel ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onSelect(h.key)}
            className={cn(
              'min-h-[40px] shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition',
              isSel
                ? 'border-secondary/60 bg-secondary/15 text-text-primary'
                : 'border-border-subtle text-text-secondary hover:text-text-primary',
            )}
          >
            {h.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Horizon context (deferral notice + internal composite diagnostic) ----------
export function HorizonContext({ view }: { view: SharedPlayerModelView }) {
  return (
    <SectionCard title="Horizon context">
      <p className="text-sm text-text-secondary">{view.horizonBlurb}</p>
      {!view.hasProjection && (
        <p className="mt-2 rounded-control border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
          {view.deferredNotice}
        </p>
      )}
      <p className="mt-3 text-[11px] text-text-muted">
        Horizon composite (internal diagnostic):{' '}
        <span className="font-mono tabnum text-text-secondary">{fmt1(view.compositeValue)}</span>. This
        is a component-profile summary, not a price, value, rating, or trade value.
      </p>
    </SectionCard>
  );
}

// ---------- Component profile ----------
export function ComponentProfile({ view }: { view: SharedPlayerModelView }) {
  return (
    <SectionCard title="Component profile">
      <div className="grid gap-2 sm:grid-cols-2">
        {view.components.map((c) => (
          <ScoreBar
            key={c.code}
            code={c.code}
            name={c.name}
            score={c.score}
            description={c.description}
            weightPct={c.weightPct}
            emphasized={c.emphasized}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{view.componentFootnote}</p>
    </SectionCard>
  );
}

// ---------- Explanation drivers ----------
function DriverRow({ text, code }: { text: string; code?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text-secondary">
      {code && (
        <span className="mt-0.5 shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary">
          {code}
        </span>
      )}
      <span>{text}</span>
    </li>
  );
}

export function DriverSections({ view }: { view: SharedPlayerModelView }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard title="Supporting factors">
        {view.positiveDrivers.length > 0 ? (
          <ul className="space-y-2">
            {view.positiveDrivers.map((d, i) => (
              <DriverRow key={i} text={d.text} code={d.code} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No material positive driver at this horizon.</p>
        )}
      </SectionCard>
      <SectionCard title="Limiting factors">
        {view.negativeDrivers.length > 0 ? (
          <ul className="space-y-2">
            {view.negativeDrivers.map((d, i) => (
              <DriverRow key={i} text={d.text} code={d.code} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No material negative driver at this horizon.</p>
        )}
      </SectionCard>
    </div>
  );
}

// ---------- Confidence & volatility (always two separate cards) ----------
export function ConfidenceVolatilityPanel({ view }: { view: SharedPlayerModelView }) {
  const c = view.confidence;
  const v = view.volatility;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard title="Confidence" aside={<Badge tone={c.tone} label={`${fmt1(c.score)} · ${c.label}`} />}>
        <p className="text-xs text-text-secondary">{c.definition}</p>
        {c.penalties.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-text-muted">
            {c.penalties.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden className="text-text-muted">–</span>
                {p}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Volatility" aside={<Badge tone={v.tone} label={`${fmt1(v.score)} · ${v.label}`} />}>
        <p className="text-xs text-text-secondary">{v.definition}</p>
        {v.details.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {v.details.map((d, i) => (
              <div key={i} className="rounded-control border border-border-subtle bg-base px-2.5 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-text-muted">{d.label}</dt>
                <dd className="font-mono text-sm tabnum text-text-primary">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </SectionCard>
    </div>
  );
}

// ---------- Fallback warnings ----------
export function FallbackPanel({ view }: { view: SharedPlayerModelView }) {
  const log = view.fallbacks;
  if (log.length === 0) {
    return (
      <SectionCard title="Data completeness">
        <p className="text-sm text-text-secondary">No fallback data was required for this profile.</p>
      </SectionCard>
    );
  }
  // Long fallback lists (e.g. the missing-data fixture) scroll inside the card so
  // they never overwhelm the page.
  const scrollable = log.length > 6;
  return (
    <SectionCard
      title="Fallback warnings"
      aside={
        <span className="rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] text-warning">
          {log.length} field{log.length > 1 ? 's' : ''} substituted
        </span>
      }
    >
      <ul className={cn('space-y-2', scrollable && 'max-h-80 overflow-y-auto pr-1')}>
        {log.map((f, i) => (
          <li key={i} className="rounded-control border border-warning/20 bg-warning/5 px-3 py-2">
            <p className="text-sm text-text-secondary">{f.sentence}</p>
            {f.penalty !== undefined && (
              <p className="mt-0.5 text-[11px] text-text-muted">Confidence penalty: {f.penalty}</p>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------- Model transparency footer ----------
export function ModelTransparencyFooter({
  view,
  children,
}: {
  view: SharedPlayerModelView;
  children?: ReactNode;
}) {
  return (
    <footer className="rounded-card border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-text-muted">
        <span>schema {view.meta.schemaVersion}</span>
        <span>model {view.meta.modelVersion}</span>
        <span>reference {view.meta.referenceVersion}</span>
        <span>as of {fmtTimestamp(view.meta.asOfTimestamp)}</span>
        <span>position {view.position}</span>
      </div>
      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-text-secondary">
        {view.transparencyBody}
      </p>
      <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-text-muted">
        WR, RB, TE, and QB use different formulas and position-specific reference distributions. Their
        component scores should not be compared directly.
      </p>
      {children}
    </footer>
  );
}

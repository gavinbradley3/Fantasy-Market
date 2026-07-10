import { Link } from 'react-router-dom';
import { PlayerAvatar } from '@/components/market/primitives';
import { cn } from '@/lib/ui';
import { SectionCard, StatCell, WrBadge } from '@/pages/wr/ui';
import {
  CONFIDENCE_DEFINITION,
  CONFIDENCE_TONE,
  COMPONENT_META,
  DEFERRED_HORIZON_NOTICE,
  HORIZONS,
  VOLATILITY_DEFINITION,
  VOLATILITY_TONE,
  driverComponent,
  fallbackSentence,
  fmt1,
  fmtPct0,
  fmtTimestamp,
} from '@/pages/wr/adapter';
import type { HorizonMeta } from '@/pages/wr/adapter';
import type { WRFixtureEntry } from '@/pages/wr/registry';
import type { Horizon, WRMVPOutput } from '@/wr-model/types';

// ---------- 7.1 Demo disclosure ----------
export function DemoDisclosure() {
  return (
    <div className="rounded-card border border-secondary/25 bg-secondary/5 px-4 py-2.5 text-sm">
      <span className="font-semibold text-text-primary">WR Model Demo. </span>
      <span className="text-text-secondary">
        This page uses fictional player profiles and the deterministic WR MVP engine. It does not show
        market prices or real-player data.
      </span>
    </div>
  );
}

// ---------- 7.3 Player summary header ----------
export function PlayerSummaryHeader({
  fixture,
  output,
}: {
  fixture: WRFixtureEntry;
  output: WRMVPOutput;
}) {
  const p = fixture.input;
  return (
    <SectionCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar seed={fixture.id} name={p.player_name} size={56} />
          <div>
            <h1 className="text-xl font-bold text-text-primary">{p.player_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <span>{p.team ?? 'Team unavailable'}</span>
              <span aria-hidden>·</span>
              <span>Age {p.age}</span>
              <span aria-hidden>·</span>
              <span>{p.nfl_seasons_completed === 0 ? 'Rookie' : `${p.nfl_seasons_completed}-yr exp`}</span>
              <span aria-hidden>·</span>
              <span>{p.draft_round ? `Round ${p.draft_round}` : 'Undrafted'}</span>
            </div>
            <div className="mt-1.5 text-xs text-secondary">{fixture.archetype}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <WrBadge
              tone={CONFIDENCE_TONE[output.confidence.label]}
              title="Confidence"
              label={output.confidence.label}
              tip={CONFIDENCE_DEFINITION}
            />
            <WrBadge
              tone={VOLATILITY_TONE[output.volatility.label]}
              title="Volatility"
              label={output.volatility.label}
              tip={VOLATILITY_DEFINITION}
            />
          </div>
          <div className="text-right text-[11px] text-text-muted">
            <div>Model {output.model_version}</div>
            <div>As of {fmtTimestamp(output.as_of_timestamp)}</div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------- 7.4 Projection cards ----------
export function ProjectionCards({ output }: { output: WRMVPOutput }) {
  const w = output.weekly;
  const r = output.ros;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard title="Weekly projection">
        <div className="mb-3">
          <StatCell label="Expected fantasy points" value={fmt1(w.expected_fantasy_points)} emphasis />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCell label="Routes" value={fmt1(w.expected_routes)} />
          <StatCell label="Targets" value={fmt1(w.expected_targets)} />
          <StatCell label="Receptions" value={fmt1(w.expected_receptions)} />
          <StatCell label="Rec. yards" value={fmt1(w.expected_receiving_yards)} />
          <StatCell label="Rec. TDs" value={fmt1(w.expected_receiving_touchdowns)} />
          <StatCell label="Prob. active" value={fmtPct0(w.probability_active)} />
        </div>
      </SectionCard>

      <SectionCard title="Rest-of-season projection">
        <div className="mb-3">
          <StatCell label="Expected fantasy points" value={fmt1(r.expected_fantasy_points)} emphasis />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCell label="Expected active games" value={fmt1(r.expected_active_games)} />
          <StatCell label="Prob. active / game" value={fmtPct0(w.probability_active)} />
        </div>
        <p className="mt-3 text-[11px] text-text-muted">
          Expected values, not guarantees. No confidence intervals are implied.
        </p>
      </SectionCard>
    </div>
  );
}

// ---------- 7.5 Horizon selector ----------
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
      const next = e.key === 'ArrowRight' ? (index + 1) % HORIZONS.length : (index - 1 + HORIZONS.length) % HORIZONS.length;
      onSelect(HORIZONS[next].key);
      document.getElementById(`wr-horizon-${HORIZONS[next].key}`)?.focus();
    }
  };
  return (
    <div role="tablist" aria-label="Select a horizon" className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
      {HORIZONS.map((h, i) => {
        const isSel = h.key === selected;
        return (
          <button
            key={h.key}
            id={`wr-horizon-${h.key}`}
            role="tab"
            aria-selected={isSel}
            tabIndex={isSel ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onSelect(h.key)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition',
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

// ---------- Horizon context (composite as internal diagnostic + deferral notice) ----------
export function HorizonContext({
  horizonMeta,
  compositeValue,
}: {
  horizonMeta: HorizonMeta;
  compositeValue: number;
}) {
  return (
    <SectionCard title={`${horizonMeta.label} profile`}>
      <p className="text-sm text-text-secondary">{horizonMeta.blurb}</p>
      {!horizonMeta.hasProjection && (
        <p className="mt-2 rounded-control border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
          {DEFERRED_HORIZON_NOTICE}
        </p>
      )}
      <p className="mt-3 text-[11px] text-text-muted">
        Horizon composite (internal diagnostic): <span className="font-mono tabnum text-text-secondary">{fmt1(compositeValue)}</span>
        . This is a component-profile summary, not a price, value, rating, or trade value.
      </p>
    </SectionCard>
  );
}

// ---------- 7.7 Explanation drivers ----------
function DriverRow({ sentence }: { sentence: string }) {
  const key = driverComponent(sentence);
  return (
    <li className="flex items-start gap-2 text-sm text-text-secondary">
      {key && (
        <span className="mt-0.5 shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary">
          {COMPONENT_META[key].code}
        </span>
      )}
      <span>{sentence}</span>
    </li>
  );
}

export function DriverSections({ output }: { output: WRMVPOutput }) {
  const { positive_drivers, negative_drivers } = output.explanations;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard title="Supporting factors">
        {positive_drivers.length > 0 ? (
          <ul className="space-y-2">
            {positive_drivers.map((d, i) => (
              <DriverRow key={i} sentence={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No material positive driver at this horizon.</p>
        )}
      </SectionCard>
      <SectionCard title="Limiting factors">
        {negative_drivers.length > 0 ? (
          <ul className="space-y-2">
            {negative_drivers.map((d, i) => (
              <DriverRow key={i} sentence={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No material negative driver at this horizon.</p>
        )}
      </SectionCard>
    </div>
  );
}

// ---------- 7.8 Confidence & volatility ----------
export function ConfidenceVolatilityPanel({ output }: { output: WRMVPOutput }) {
  const c = output.confidence;
  const v = output.volatility;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard
        title="Confidence"
        aside={<WrBadge tone={CONFIDENCE_TONE[c.label]} label={`${fmt1(c.score)} · ${c.label}`} />}
      >
        <p className="text-xs text-text-secondary">{CONFIDENCE_DEFINITION}</p>
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

      <SectionCard
        title="Volatility"
        aside={<WrBadge tone={VOLATILITY_TONE[v.label]} label={`${fmt1(v.score)} · ${v.label}`} />}
      >
        <p className="text-xs text-text-secondary">{VOLATILITY_DEFINITION}</p>
      </SectionCard>
    </div>
  );
}

// ---------- 7.9 Fallback warnings ----------
export function FallbackPanel({ output }: { output: WRMVPOutput }) {
  const log = output.fallback_log;
  if (log.length === 0) {
    return (
      <SectionCard title="Data completeness">
        <p className="text-sm text-text-secondary">No fallback data was required for this profile.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Fallback warnings"
      aside={
        <span className="rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] text-warning">
          {log.length} field{log.length > 1 ? 's' : ''} substituted
        </span>
      }
    >
      <ul className="space-y-2">
        {log.map((f, i) => (
          <li key={i} className="rounded-control border border-warning/20 bg-warning/5 px-3 py-2">
            <p className="text-sm text-text-secondary">{fallbackSentence(f.field, f.fallback_used)}</p>
            <p className="mt-0.5 text-[11px] text-text-muted">Confidence penalty: {f.confidence_penalty}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------- 7.10 Model transparency footer ----------
export function ModelTransparencyFooter({
  output,
  referenceVersion,
}: {
  output: WRMVPOutput;
  referenceVersion: string;
}) {
  return (
    <footer className="rounded-card border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-text-muted">
        <span>schema {output.schema_version}</span>
        <span>model {output.model_version}</span>
        <span>reference {referenceVersion}</span>
        <span>as of {fmtTimestamp(output.as_of_timestamp)}</span>
      </div>
      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-text-secondary">
        This WR MVP uses deterministic formulas and fictional fixture data. Weekly and ROS outputs are
        expected values, not guarantees. Market price, trade value, and long-term fantasy-point
        distributions are outside the current model.{' '}
        <Link to="/methodology" className="text-secondary hover:underline">
          Methodology
        </Link>
        .
      </p>
    </footer>
  );
}

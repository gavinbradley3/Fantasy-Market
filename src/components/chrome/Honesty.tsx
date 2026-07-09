import { Link } from 'react-router-dom';
import { FRESHNESS_LABEL, confidenceLabel, freshnessOf, type Freshness } from '@/lib/format';
import { cn } from '@/lib/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Confidence, DataMode } from '@/types/market';

// The honesty layer is structural, wired to data fields — flipping dataMode
// reflows every badge automatically (§40.6). Never hardcoded copy.

export function DataModeBanner({ mode = 'demo' as DataMode }: { mode?: DataMode }) {
  if (mode === 'live') return null;
  const text =
    mode === 'mixed'
      ? 'Mixed Market — some values are live, some simulated. See methodology for per-source status.'
      : 'Demo Market — simulated player values for product preview. Not current player information.';
  return (
    <div className="border-b border-warning/25 bg-warning/10">
      <div className="mx-auto flex max-w-app items-center justify-center gap-2 px-4 py-1.5 text-center text-xs text-warning">
        <span aria-hidden>●</span>
        <span className="font-medium">{text}</span>
        <Link to="/methodology" className="underline underline-offset-2 hover:text-text-primary">
          How this works →
        </Link>
      </div>
    </div>
  );
}

const FRESH_STYLE: Record<Freshness, string> = {
  fresh: 'text-up border-up/30 bg-up/5',
  recent: 'text-secondary border-secondary/30 bg-secondary/5',
  stale: 'text-warning border-warning/30 bg-warning/5',
  outdated: 'text-down border-down/30 bg-down/5',
};

export function DataFreshnessBadge({
  lastUpdated,
  showMode = true,
}: {
  lastUpdated: string;
  showMode?: boolean;
}) {
  const f = freshnessOf(lastUpdated);
  const when = new Date(lastUpdated).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
  return (
    <Tooltip label={`Last market close: ${when}. Freshness: ${FRESHNESS_LABEL[f]}.`}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
          FRESH_STYLE[f],
        )}
      >
        {FRESHNESS_LABEL[f]}
        {showMode && <span className="text-text-muted">· Demo</span>}
      </span>
    </Tooltip>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  low: 'text-warning border-warning/30',
  medium: 'text-secondary border-secondary/30',
  high: 'text-up border-up/30',
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <Tooltip label="Confidence reflects sample size, data freshness and input variance. Demo data is capped at Medium — it never claims High confidence.">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
          CONF_STYLE[confidence],
        )}
      >
        <span aria-hidden className="text-current">
          ◗
        </span>
        {confidenceLabel(confidence)} confidence
      </span>
    </Tooltip>
  );
}

// The persistent fictional-value + not-advice micro-disclaimer (§15.5–15.6).
export function ValueDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] leading-relaxed text-text-muted', className)}>
      Market prices are fictional fantasy value indexes — not real money, securities, or tradable
      instruments. PlayerTicker provides fantasy sports entertainment information only. It is not
      financial advice, investment advice, gambling, or betting.
    </p>
  );
}

import { Link } from 'react-router-dom';
import { FRESHNESS_LABEL, confidenceLabel, freshnessOf, type Freshness } from '@/lib/format';
import { cn } from '@/lib/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import type { MarketStatus } from '@/services/marketData/types';
import type { Confidence } from '@/types/market';

// The honesty layer is structural — the banner renders from the ACTIVE
// service's self-reported MarketStatus (§40.6), never from a hardcoded prop.
// A live service reporting mode 'live' retires the banner automatically;
// 'mixed' and 'unavailable' render their own notices.

export function DataModeBanner({ status }: { status: MarketStatus | undefined }) {
  if (!status || status.mode === 'live') return null;
  const unavailable = status.mode === 'unavailable';
  return (
    <div
      // A standing condition, not an alarm: one status dot carries the colour and
      // the text stays readable, so a banner that is always on screen in demo mode
      // never competes with the market data underneath it.
      className="border-b border-border-default bg-surface-subtle"
    >
      <div className="mx-auto flex max-w-app flex-wrap items-center justify-center gap-x-2 gap-y-1 px-5 py-2 text-center text-xs md:px-8">
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            unavailable ? 'bg-negative' : 'bg-warning',
          )}
        />
        <span className="font-medium text-text-secondary">{status.notice}</span>
        <Link
          to="/methodology"
          className="font-medium text-text-muted underline-offset-4 transition-colors duration-standard hover:text-brand-blue hover:underline"
        >
          How this works
        </Link>
      </div>
    </div>
  );
}

const FRESH_STYLE: Record<Freshness, string> = {
  fresh: 'text-positive border-positive/30 bg-positive/10',
  recent: 'text-brand-blue border-brand-blue/30 bg-brand-blue/10',
  stale: 'text-warning border-warning/30 bg-warning/10',
  outdated: 'text-negative border-negative/30 bg-negative/10',
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
          'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium',
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
  medium: 'text-brand-blue border-brand-blue/30',
  high: 'text-positive border-positive/30',
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <Tooltip label="Confidence reflects sample size, data freshness and input variance. Demo data is capped at Medium — it never claims High confidence.">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-[11px] font-medium',
          CONF_STYLE[confidence],
        )}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
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

import { Link } from 'react-router-dom';
import { cn } from '@/lib/ui';

// Teaching empty state (§20, §33): names the action and offers a one-tap example.
export function EmptyState({
  title,
  body,
  ctaLabel,
  ctaTo,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border-subtle bg-surface px-6 py-12 text-center">
      <div className="mb-3 text-3xl" aria-hidden>
        📈
      </div>
      <h3 className="mb-2 text-lg text-text-primary">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-text-secondary">{body}</p>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="rounded-control bg-up px-4 py-2 text-sm font-semibold text-base transition hover:brightness-110"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

// Per-shape loading skeleton (§20).
export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-card bg-elevated/60', className)} aria-hidden />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-down/40 bg-down/5 px-4 py-6 text-center text-sm text-text-secondary"
    >
      <p className="mb-3 text-text-primary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-control border border-border-subtle px-3 py-1.5 text-text-primary transition hover:bg-elevated"
        >
          Retry
        </button>
      )}
    </div>
  );
}
